// Entry point. Loads one car's JSON, builds the control bar and the five chart sections,
// and re-renders everything on any state change. All arithmetic lives in the modules;
// this file only moves state around.

import { REV_FLOOR, SET_COLOURS, SET_COLOURS_DARK, SURFACES, finalDriveCombos }
  from './gearing.js';
import { ceilBounds, floorBounds, floorFocusAfterStep, parseCeil, parseFloor, parseHash,
  stepCeil, stepFloor, toHash } from './state.js';
import { settingsText } from './settingsText.js';
import { barSummaryParts, setLabel } from './barSummary.js';
import { ISSUES, PROMO, dataLine } from './footer.js';
import { currentTheme, onThemeChange } from './theme.js';
import { track } from './tracking.js';
import { coarseClick, leaveRedraws, movesHover } from './hover.js';
import * as powerTorque from './charts/powerTorque.js';
import * as finalDrive from './charts/finalDrive.js';
import * as ladder from './charts/ladder.js';
import * as shiftPoints from './charts/shiftPoints.js';
import * as speedRevs from './charts/speedRevs.js';

const root = document.getElementById('app');
const slug = root.dataset.car;
// The site root, from where this module sits (js/), so data resolves the same however deep
// the page that loads it is (<slug>/gears/ today).
const SITE = new URL('../', import.meta.url);

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

  const revs = buildRevControls();
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
  } }, ...car.gear_sets.map((s, i) => h('option', { value: String(i) }, setLabel(s))));

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

  // On a wide screen the head is hidden and the controls box lays out as if it were not
  // there (display: contents), so the bar is the row of controls it always was. On a narrow
  // one the bar collapses to the head: a summary line and a button that opens the controls.
  const ctls = h('div', { class: 'barctls', id: 'bar-controls' },
    h('div', { class: 'ctl' }, h('label', {}, 'Surface'), surfaceSel));
  if (combos.length) {
    ctls.appendChild(h('div', { class: 'ctl' }, h('label', {}, 'Final drive'), fdSel));
  }
  ctls.appendChild(h('div', { class: 'ctl' }, h('label', {}, 'Gear set'), setSel));
  ctls.appendChild(copies);

  const summary = h('p', { class: 'barsum' });
  const toggle = h('button', { class: 'bartoggle', type: 'button',
    'aria-controls': 'bar-controls', 'aria-expanded': 'false', 'aria-label': 'Show controls',
    onclick: () => {
      const open = bar.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
    } }, chevron());
  const bar = h('div', { class: 'bar' }, h('div', { class: 'barhead' }, summary, toggle), ctls);

  root.appendChild(subtitle());
  root.appendChild(bar);
  root.appendChild(tarmacNote());

  for (const s of SECTIONS) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'svg-' + s.id;
    const panel = h('div', { class: s.id === 'revs' ? 'panel row' : 'panel' });
    panel.appendChild(svg);
    if (s.id === 'revs') panel.appendChild(buildSetList());
    if (s.id === 'shift') panel.appendChild(revs.box);
    root.appendChild(h('section', { id: 'sec-' + s.id },
      h('h2', {}, s.title), h('p', { class: 'cap' }, s.cap), panel));
  }
  const { foot, factor } = buildFooter();
  root.appendChild(foot);

  wireHover('power', (map, p) => map.xToRpm(p.x));
  wireHover('ladder', (map, p) => ({ lane: map.yToLane(p.y), speed: map.xToSpeed(p.x) }));
  wireHover('shift', (map, p) => ({ gear: map.yToGear(p.y), speed: map.xToSpeed(p.x) }));
  wireHover('revs', (map, p) => map.atPoint(p.x, p.y));
  wireLanePick();

  return { surfaceSel, fdSel, setSel, factor, revs, summary };
}

/** The bar toggle's glyph: a chevron in the button's text colour, turned over when open. */
function chevron() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ class: 'icon', viewBox: '0 0 12 12', width: '12',
    height: '12', 'aria-hidden': 'true', focusable: 'false', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round',
    'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M2.5 4.5 6 8l3.5-3.5');
  svg.appendChild(path);
  return svg;
}

/**
 * Surface · final drive · gear set. One unbreakable span per part, each but the last ending
 * in its separator, so a line that does not fit wraps between parts and never mid-label.
 */
function syncSummary() {
  const parts = barSummaryParts(car, state);
  controls.summary.replaceChildren(...parts.map((part, i) =>
    h('span', { class: 'part ' + part.key }, part.text,
      ...(i < parts.length - 1 ? [h('span', { class: 'sep', 'aria-hidden': 'true' }, '·')] : []))));
}

/**
 * Shift points' rev floor and ceiling, side by side over the top right of the chart. Each
 * is [−] [typed rpm] [+]; each one's bounds depend on the other's value.
 */
function buildRevControls() {
  const floor = buildRpmControl({
    id: 'rev-floor', label: 'Rev floor', noun: 'rev floor', event: 'edit-rev-floor',
    get: () => state.floor, put: v => { state.floor = v; },
    parse: raw => parseFloor(raw, car, state.ceil),
    step: d => stepFloor(state.floor, d, car, state.ceil),
  });
  const ceil = buildRpmControl({
    id: 'rev-ceiling', label: 'Rev ceiling', noun: 'rev ceiling', event: 'edit-rev-ceiling',
    get: () => state.ceil, put: v => { state.ceil = v; },
    parse: raw => parseCeil(raw, car, state.floor),
    step: d => stepCeil(state.ceil, d, car, state.floor),
  });
  const box = h('div', { class: 'revboxes' }, floor.box, ceil.box);
  return { box, floor, ceil };
}

function buildRpmControl({ id, label, noun, event, get, put, parse, step }) {
  const set = v => {
    if (v !== get()) {
      put(v);
      track(event);
      commit();
    }
    input.value = String(get());
  };
  const typed = () => {
    const v = parse(input.value);
    if (v === null) input.value = String(get());
    else set(v);
  };
  const input = h('input', { id, class: 'floorin', type: 'text',
    inputmode: 'numeric', autocomplete: 'off', value: String(get()),
    onchange: typed,
    onkeydown: e => { if (e.key === 'Enter') typed(); } });
  const button = (direction, name, glyph) => h('button', {
    class: 'floorstep', type: 'button', 'aria-label': name,
    onclick: e => {
      set(step(direction));
      // a click from Enter/Space has detail 0; a mouse click or tap counts its clicks
      floorFocusAfterStep(e.currentTarget, { minus, plus, input }, e.detail === 0)?.focus();
    },
  }, glyph);
  const minus = button(-1, `Lower ${noun} by 100 rpm`, '−');
  const plus = button(1, `Raise ${noun} by 100 rpm`, '+');
  const box = h('div', { class: 'floorbox' },
    h('label', { for: id }, label), minus, input, plus,
    h('span', { class: 'unit' }, 'rpm'));
  return { box, input, minus, plus };
}

/**
 * Where the Shift points readout has to stop, in viewBox units: just left of the rev
 * floor and ceiling controls when they sit over the chart. On a narrow screen they sit
 * above the chart instead.
 */
function shiftReadoutEdge() {
  const full = 1096;
  const box = controls?.revs.box;
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
      PROMO.after, ISSUES.before,
      h('a', { href: ISSUES.href, onclick: () => track('click-issues') }, ISSUES.link)));
  return { foot, factor };
}

/**
 * Turn a pointer position into whatever this chart's render() takes as `hover`.
 * The SVGs scale, so client pixels have to go back through the viewBox first.
 */
function toViewBox(svg, e) {
  const box = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return {
    x: (e.clientX - box.left) / box.width * (vb.width || box.width),
    y: (e.clientY - box.top) / box.height * (vb.height || box.height),
  };
}

function wireHover(id, toHover) {
  const svg = svgOf(id);
  svg.addEventListener('pointermove', e => {
    const map = maps[id];
    // Redrawing replaces every node, so a redraw between pointerdown and click swaps the
    // lane name out from under the click. See js/hover.js.
    if (!map || !movesHover(e)) return;
    hover[id] = toHover(map, toViewBox(svg, e));
    if (id === 'shift') track('shift-helper');
    RENDER[id]();
  });
  svg.addEventListener('pointerleave', () => {
    if (!leaveRedraws(hover[id])) return;
    hover[id] = null;
    RENDER[id]();
  });
}

/**
 * Picking a gear set from its lane name. One listener on the ladder's <svg>, which is built
 * once and never replaced, rather than on name nodes that any redraw throws away.
 */
function wireLanePick() {
  const svg = svgOf('ladder');
  let downType = '';
  svg.addEventListener('pointerdown', e => { downType = e.pointerType; });
  svg.addEventListener('click', e => {
    const coarse = coarseClick(downType, e.pointerType,
      window.matchMedia?.('(pointer: coarse)').matches);
    downType = '';
    const names = svg.querySelectorAll('text.rowlbl');
    const i = maps.ladder?.laneAt(toViewBox(svg, e),
      { coarse, nameBox: n => names[n]?.getBBox() });
    if (i === null || i === undefined) return;
    state.set = i;
    track('pick-gearset');
    commit();
  });
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
    maps.ladder = ladder.render(svgOf('ladder'), car, state, hover.ladder);
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
  syncSummary();
  const { floor, ceil } = controls.revs;
  const fb = floorBounds(car, state.ceil);
  floor.input.value = String(state.floor);
  floor.minus.disabled = state.floor <= fb.min;
  floor.plus.disabled = state.floor >= fb.max;
  const cb = ceilBounds(car, state.floor);
  ceil.input.value = String(state.ceil);
  ceil.minus.disabled = state.ceil <= cb.min;
  ceil.plus.disabled = state.ceil >= cb.max;
  document.querySelector('#sec-shift .cap').textContent =
    shiftPoints.shiftCaption(state.floor, state.ceil, car.engine.redline);
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
      fetch(new URL(`data/${slug}.json`, SITE)).then(r => r.json()),
      // only the footer's data line comes from here, so a missing index must not sink the page
      fetch(new URL('data/index.json', SITE)).then(r => r.json()).catch(() => ({})),
    ]);
  } catch (err) {
    const loading = root.querySelector('.loading');
    if (loading) loading.textContent = 'Could not load the data for this car.';
    throw err;
  }
  state = parseHash(location.hash, car);
  controls = buildShell();
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
