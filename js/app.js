// Entry point. Loads one car's JSON, builds the control bar and the five chart sections,
// and re-renders everything on any state change. All arithmetic lives in the modules;
// this file only moves state around.

import { REV_FLOOR, SET_COLOURS, SET_COLOURS_DARK, SURFACES, finalDriveCombos }
  from './gearing.js';
import { floorBounds, parseFloor, parseHash, stepFloor, toHash } from './state.js';
import { settingsText } from './settingsText.js';
import { PROMO, dataLine } from './footer.js';
import { currentTheme, onThemeChange } from './theme.js';
import { track } from './tracking.js';
import * as powerTorque from './charts/powerTorque.js';
import * as finalDrive from './charts/finalDrive.js';
import * as ladder from './charts/ladder.js';
import * as shiftPoints from './charts/shiftPoints.js';
import * as speedRevs from './charts/speedRevs.js';

const root = document.getElementById('app');
const slug = root.dataset.car;

// `car` and `state` are only ever assigned together, from parseHash, which always hands
// back a valid final-drive index. belowGearbox throws on a car that needs a combo and has
// none, so there is never a moment where one is set and the other is stale.
let car = null;
let state = null;
let index = {};
let controls = null;
const hover = { power: null, ladder: null, shift: null, revs: null };
// each chart's render() hands back the pixel-to-value mappings its hover needs.
// They are kept here rather than on the modules: an ES module namespace object is
// frozen, so assigning a field to an imported `* as` binding throws.
const maps = {};

const SECTIONS = [
  { id: 'power', title: 'Power and torque',
    cap: 'Engine output against revs. Hover for the values and how far off peak they are.' },
  { id: 'fd', title: 'Final drive', cap: '' },
  { id: 'ladder', title: 'Where each gear tops out',
    cap: 'One lane per gear set, all of them at once. Click a lane name to select that gear set.' },
  { id: 'shift', title: 'Shift points', cap: shiftPoints.shiftCaption(REV_FLOOR) },
  { id: 'revs', title: 'Speed against revs', cap: 'Pick the gear sets to draw.' },
];

const K_MIN = 0.8;
const K_MAX = 1.1;

// Everything else in the charts is a CSS variable and repaints itself on a theme change.
// The gear-set colours are an indexed list, so they are picked here and redrawn.
const setColours = () => (currentTheme() === 'dark' ? SET_COLOURS_DARK : SET_COLOURS);
const colourFor = i => { const c = setColours(); return c[i % c.length]; };

const h = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') node.className = attrs[k];
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k]);
    else node.setAttribute(k, attrs[k]);
  }
  for (const kid of kids) {
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
};

const svgOf = id => document.getElementById('svg-' + id);

function subtitle() {
  const counts = car.gear_sets.map(s => s.gears.length);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const n = car.gear_sets.length;
  return h('p', { class: 'sub' },
    h('span', {}, lo === hi ? String(lo) : `${lo}–${hi}`), ' speed · ',
    h('span', {}, String(n)), n === 1 ? ' gear set · ' : ' gear sets · ',
    'rev limit ', h('span', {}, String(car.engine.redline)), ' rpm');
}

/** Only true where the data says so: the two tarmac tyres have the same free radius. */
function tarmacNote() {
  const dry = car.tyres.Tarmac_Dry;
  const wet = car.tyres.Tarmac_Wet;
  const same = dry && wet && dry.free_radius === wet.free_radius;
  return h('p', { class: 'barnote' },
    same ? 'Dry and wet tarmac tyres have the same radius on this car. Same speeds.' : '');
}

function buildShell() {
  root.querySelector('.loading')?.remove();

  const floor = buildFloorControl();
  const surfaces = SURFACES.filter(s => s.key in car.tyres);
  const combos = car.final_drive ? finalDriveCombos(car.final_drive) : [];

  const surfaceSel = h('select', { onchange: e => {
    state.surface = e.target.value;
    track('surface-' + state.surface);
    commit();
  } }, ...surfaces.map(s => h('option', { value: s.key }, s.label)));

  const fdSel = h('select', { onchange: e => {
    state.fd = Number(e.target.value);
    track('change-final-drive');
    commit();
  } }, ...combos.map((c, i) => h('option', { value: String(i) }, finalDrive.comboLabel(c))));

  const setSel = h('select', { onchange: e => {
    state.set = Number(e.target.value);
    track('pick-gearset');
    commit();
  } }, ...car.gear_sets.map((s, i) =>
    h('option', { value: String(i) }, `${s.label}  (${s.gears.length}-speed)`)));

  const copyButton = (label, event, content) => {
    const button = h('button', { class: 'copy', type: 'button', onclick: async () => {
      track(event);
      try {
        await navigator.clipboard.writeText(content());
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = label; }, 1500);
      } catch {
        // no clipboard access (insecure context, denied permission): the URL bar has the
        // link, and the bar and charts show the settings
      }
    } }, label);
    return button;
  };
  const copies = h('div', { class: 'copies' },
    copyButton('Copy link', 'copy-link', () => location.href),
    copyButton('Copy settings', 'copy-settings', () => settingsText(car, state)));

  const bar = h('div', { class: 'bar' },
    h('div', { class: 'ctl' }, h('label', {}, 'Surface'), surfaceSel));
  if (combos.length) {
    bar.appendChild(h('div', { class: 'ctl' }, h('label', {}, 'Final drive'), fdSel));
  }
  bar.appendChild(h('div', { class: 'ctl' }, h('label', {}, 'Gear set'), setSel));
  bar.appendChild(copies);

  root.appendChild(subtitle());
  root.appendChild(bar);
  root.appendChild(tarmacNote());

  for (const s of SECTIONS) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'svg-' + s.id;
    const panel = h('div', { class: s.id === 'revs' ? 'panel row' : 'panel' });
    panel.appendChild(svg);
    if (s.id === 'revs') panel.appendChild(buildSetList());
    if (s.id === 'shift') panel.appendChild(floor.box);
    root.appendChild(h('section', { id: 'sec-' + s.id },
      h('h2', {}, s.title), h('p', { class: 'cap' }, s.cap), panel));
  }
  const { foot, factor } = buildFooter();
  root.appendChild(foot);

  wireHover('power', (map, p) => map.xToRpm(p.x));
  wireHover('ladder', (map, p) => ({ lane: map.yToLane(p.y), speed: map.xToSpeed(p.x) }));
  wireHover('shift', (map, p) => ({ gear: map.yToGear(p.y), speed: map.xToSpeed(p.x) }));
  wireHover('revs', (map, p) => map.atPoint(p.x, p.y));

  return { surfaceSel, fdSel, setSel, factor, floor };
}

/** Shift points' rev floor: [−] [typed rpm] [+], over the top right of the chart. */
function buildFloorControl() {
  const set = v => {
    if (v !== state.floor) {
      state.floor = v;
      track('edit-rev-floor');
      commit();
    }
    input.value = String(state.floor);
  };
  const typed = () => {
    const v = parseFloor(input.value, car);
    if (v === null) input.value = String(state.floor);
    else set(v);
  };
  const input = h('input', { id: 'rev-floor', class: 'floorin', type: 'text',
    inputmode: 'numeric', autocomplete: 'off', value: String(state.floor),
    onchange: typed,
    onkeydown: e => { if (e.key === 'Enter') typed(); } });
  const step = (direction, name, glyph) => h('button', {
    class: 'floorstep', type: 'button', 'aria-label': name,
    onclick: () => set(stepFloor(state.floor, direction, car)),
  }, glyph);
  const minus = step(-1, 'Lower rev floor by 100 rpm', '−');
  const plus = step(1, 'Raise rev floor by 100 rpm', '+');
  const box = h('div', { class: 'floorbox' },
    h('label', { for: 'rev-floor' }, 'Rev floor'), minus, input, plus,
    h('span', { class: 'unit' }, 'rpm'));
  return { box, input, minus, plus };
}

/**
 * Where the Shift points readout has to stop, in viewBox units: just left of the rev floor
 * control when that sits over the chart. On a narrow screen it sits above the chart instead.
 */
function shiftReadoutEdge() {
  const full = 1096;
  const box = controls?.floor.box;
  const svg = svgOf('shift');
  if (!box) return full;
  const b = box.getBoundingClientRect();
  const s = svg.getBoundingClientRect();
  if (!s.width || b.bottom <= s.top || b.top >= s.bottom) return full;
  const vb = svg.viewBox.baseVal;
  return Math.min(full, (b.left - s.left) / s.width * (vb.width || s.width) - 8);
}

function buildSetList() {
  const list = h('div', { class: 'setlist' }, h('h4', {}, 'Gear sets'));
  car.gear_sets.forEach((s, i) => {
    list.appendChild(h('div', {
      class: 'opt',
      'data-set': String(i),
      onclick: () => {
        const on = state.draw.includes(i);
        if (on && state.draw.length === 1) return;   // never leave the chart empty
        state.draw = on ? state.draw.filter(x => x !== i)
                        : [...state.draw, i].sort((a, b) => a - b);
        track('toggle-drawn-set');
        commit();
      },
    }, h('i'), s.label.replace('Gear set', 'Set'), h('small', {}, ` ${s.gears.length}sp`)));
  });
  return list;
}

function buildFooter() {
  const factor = h('input', { type: 'number', step: '0.0001', min: String(K_MIN),
    max: String(K_MAX), value: String(state.k),
    onchange: e => {
      const v = Number.parseFloat(e.target.value);
      if (Number.isFinite(v) && v >= K_MIN && v <= K_MAX) {
        state.k = v;
        track('edit-factor');
        commit();
      } else {
        e.target.value = String(state.k);
      }
    } });
  const ul = h('ul');
  for (const line of ['Speeds are gearing alone. No drag, no slip.',
                      'Compound does not change gearing. Compounds share a carcass.']) {
    ul.appendChild(h('li', {}, line));
  }
  const foot = h('div', { class: 'foot' },
    h('div', {},
      h('h3', {}, 'Rolling radius factor'),
      h('div', { class: 'kbox' }, factor,
        h('a', { href: '#', onclick: e => {
          e.preventDefault();
          state.k = car.defaults.loaded_radius_factor;
          commit();
        } }, 'reset')),
      h('p', { class: 'fnote' },
        'A loaded tyre rolls on a smaller radius than the stored one. This factor was '
        + 'fitted against measured in-game top speeds for the Stratos across 15 gears, '
        + 'and is applied to every car and surface. Edit it and every chart redraws.')),
    h('div', {},
      h('h3', {}, 'Known limits'),
      h('div', { class: 'limits' }, ul)),
    h('div', {},
      h('h3', {}, 'Data'),
      h('p', { class: 'limits' }, dataLine(index))),
    h('p', { class: 'promo' }, PROMO.before,
      h('a', { href: PROMO.href, onclick: () => track('click-setup-engineer') }, PROMO.link),
      PROMO.after));
  return { foot, factor };
}

/**
 * Turn a pointer position into whatever this chart's render() takes as `hover`.
 * The SVGs scale, so client pixels have to go back through the viewBox first.
 */
function wireHover(id, toHover) {
  const svg = svgOf(id);
  svg.addEventListener('pointermove', e => {
    const map = maps[id];
    // Redrawing replaces every node, so a redraw between pointerdown and pointerup would
    // swap the lane name out from under a click and the click would never fire. Mouse
    // only: a touch or pen in contact always reports a button, and would never hover.
    if (!map || (e.pointerType === 'mouse' && e.buttons)) return;
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const p = {
      x: (e.clientX - box.left) / box.width * (vb.width || box.width),
      y: (e.clientY - box.top) / box.height * (vb.height || box.height),
    };
    hover[id] = toHover(map, p);
    if (id === 'shift') track('shift-helper');
    RENDER[id]();
  });
  svg.addEventListener('pointerleave', () => { hover[id] = null; RENDER[id](); });
}

function renderFinalDrive() {
  const svg = svgOf('fd');
  const section = document.getElementById('sec-fd');
  section.querySelector('.notadjustable')?.remove();
  if (car.final_drive) {
    svg.style.display = '';
    section.querySelector('.cap').textContent =
      'Every selectable combination. 100% is the shortest. Speed is top gear of '
      + `${car.gear_sets[state.set].label.toLowerCase()} at the rev limit. `
      + 'Click a row to use that final drive.';
    finalDrive.render(svg, car, state, i => {
      state.fd = i;
      track('change-final-drive');
      commit();
    });
  } else {
    section.querySelector('.cap').textContent = '';
    svg.replaceChildren();
    svg.style.display = 'none';
    section.querySelector('.panel').appendChild(
      h('p', { class: 'notadjustable' }, 'The final drive is not adjustable on this car.'));
  }
}

// One entry per chart, so a hover redraws only the chart under the pointer.
const RENDER = {
  power: () => { maps.power = powerTorque.render(svgOf('power'), car, hover.power); },
  fd: renderFinalDrive,
  ladder: () => {
    maps.ladder = ladder.render(svgOf('ladder'), car, state,
      i => { state.set = i; track('pick-gearset'); commit(); }, hover.ladder);
  },
  shift: () => {
    maps.shift = shiftPoints.render(svgOf('shift'), car, state, hover.shift, shiftReadoutEdge());
  },
  revs: () => {
    maps.revs = speedRevs.render(svgOf('revs'), car, state, hover.revs, setColours());
  },
};

function draw() {
  for (const id in RENDER) RENDER[id]();
}

/** A hover belongs to the chart it was taken on; a new gear set can make it meaningless. */
function clearHover() {
  for (const id in hover) hover[id] = null;
}

function commit() {
  clearHover();
  history.replaceState(null, '', toHash(state, car));
  syncControls();
  draw();
}

function syncControls() {
  controls.surfaceSel.value = state.surface;
  if (controls.fdSel.options.length) controls.fdSel.value = String(state.fd);
  controls.setSel.value = String(state.set);
  controls.factor.value = String(state.k);
  const { min, max } = floorBounds(car);
  controls.floor.input.value = String(state.floor);
  controls.floor.minus.disabled = state.floor <= min;
  controls.floor.plus.disabled = state.floor >= max;
  document.querySelector('#sec-shift .cap').textContent = shiftPoints.shiftCaption(state.floor);
  document.querySelectorAll('.setlist .opt').forEach(node => {
    const i = Number(node.dataset.set);
    const on = state.draw.includes(i);
    node.classList.toggle('on', on);
    const box = node.querySelector('i');
    box.style.background = on ? colourFor(i) : 'var(--field)';
    box.style.borderColor = on ? colourFor(i) : 'var(--line)';
  });
}

async function main() {
  try {
    [car, index] = await Promise.all([
      fetch(`../data/${slug}.json`).then(r => r.json()),
      // only the footer's data line comes from here, so a missing index must not sink the page
      fetch('../data/index.json').then(r => r.json()).catch(() => ({})),
    ]);
  } catch (err) {
    const loading = root.querySelector('.loading');
    if (loading) loading.textContent = 'Could not load the data for this car.';
    throw err;
  }
  state = parseHash(location.hash, car);
  controls = buildShell();
  track('car-' + slug);
  commit();
  onThemeChange(() => {
    syncControls();
    RENDER.revs();
  });
  window.addEventListener('hashchange', () => {
    state = parseHash(location.hash, car);
    clearHover();
    syncControls();
    draw();
  });
}

main();
