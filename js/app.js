// Entry point. Loads one car's JSON, builds the control bar and the five chart sections,
// and re-renders everything on any state change. All arithmetic lives in the modules;
// this file only moves state around.

import { REV_FLOOR, SET_COLOURS, SET_COLOURS_DARK, SURFACES, finalDriveCombos, hasRatioSettings,
  primaryIndex, withRevLimit } from './gearing.js';
import { REV_LIMIT_MAX, REV_LIMIT_MIN, applyRevLimit, floorFocusAfterStep, parseCeil, parseFloor,
  parseHash, parseRevLimit, pickRow, revControlViews, rpmInputKey, setPrimary,
  setRatio, stepCeil, stepFloor, toHash } from './state.js';
import { settingsText } from './settingsText.js';
import { barSummaryParts, setLabel } from './barSummary.js';
import { FACTOR_NOTE, ISSUES, PROMO, dataLine, revLimitNote } from './footer.js';
import { currentTheme, onThemeChange } from './theme.js';
import { track } from './tracking.js';
import { coarseClick, isTap, leaveRedraws, movesHover, touchStep } from './hover.js';
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
//
// `data` is the car as loaded. `car` is the same car with the rev limit in force (state.rl),
// which is what every chart and caption reads; the URL hash and the reset link compare
// against `data`, where the car's own limit is.
let data = null;
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
  { id: 'revs', title: 'Speed against revs', cap: 'One line per gear of the selected gear set.' },
];

const K_MIN = 0.8;
const K_MAX = 1.1;

// Everything else in the charts is a CSS variable and repaints itself on a theme change.
// The gear-set colours are an indexed list, so they are picked here and redrawn.
const setColours = () => (currentTheme() === 'dark' ? SET_COLOURS_DARK : SET_COLOURS);

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

/** The line under the name. The rev limit span is kept, so an edited limit repaints it. */
function subtitle() {
  const counts = car.gear_sets.map(s => s.gears.length);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const n = car.gear_sets.length;
  const limit = h('span', { class: 'sublimit' }, String(car.engine.redline));
  return { limit, node: h('p', { class: 'sub' },
    h('span', {}, lo === hi ? String(lo) : `${lo}–${hi}`), ' speed · ',
    h('span', {}, String(n)), n === 1 ? ' gear set · ' : ' gear sets · ',
    'rev limit ', limit, ' rpm') };
}

/** A state change that is not a control's own: the rev limit and the ceiling under it. */
function setRevLimit(rl) {
  state = applyRevLimit(state, rl, data);
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
  // an averaged-axle car has a select per ratio setting instead of the combined one
  const ratios = hasRatioSettings(car) ? buildRatioControls() : null;

  const surfaceSel = h('select', { onchange: e => {
    state.surface = e.target.value;
    track('surface-' + state.surface);
    commit();
  } }, ...surfaces.map(s => h('option', { value: s.key }, s.label)));

  const fdSel = ratios ? null : h('select', { onchange: e => {
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
    // the hash is written on every commit(); writing it again here makes the link line match
    // the settings above it even if something changed state without committing
    copyButton('Copy settings', 'copy-settings', () => {
      history.replaceState(null, '', toHash(state, data));
      return settingsText(data, state, location.href);
    }));

  // On a wide screen the head is hidden and the controls box lays out as if it were not
  // there (display: contents), so the bar is the row of controls it always was. On a narrow
  // one the bar collapses to the head: a summary line and a button that opens the controls.
  const ctls = h('div', { class: 'barctls', id: 'bar-controls' },
    h('div', { class: 'ctl' }, h('label', {}, 'Surface'), surfaceSel));
  if (!ratios && combos.length) {
    ctls.appendChild(h('div', { class: 'ctl' }, h('label', {}, 'Final drive'), fdSel));
  }
  ctls.appendChild(h('div', { class: 'ctl' }, h('label', {}, 'Gear set'), setSel));
  // the same rev ceiling as Shift points', a second control on the one state.ceil
  const barCeil = buildRpmControl(ceilSpec('bar-rev-ceiling'), { stacked: true });
  ctls.appendChild(barCeil.box);
  ctls.appendChild(copies);
  if (ratios) {
    // an averaged-axle car: the Primary Gear where it has one, a select per ratio setting in
    // the game's order, and what they make below the gearbox. They do not fit beside the other
    // controls at 1280, so they take a second row of the bar, on these cars only.
    ctls.appendChild(h('div', { class: 'ratiorow', role: 'group', 'aria-label': 'Final drive' },
      ...ratios.boxes));
  }

  const summary = h('p', { class: 'barsum' });
  const setOpen = open => {
    // closing hides the controls, and focus inside them would drop to the page
    if (!open && ctls.contains(document.activeElement)) toggle.focus();
    bar.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
  };
  const toggle = h('button', { class: 'bartoggle', type: 'button',
    'aria-controls': 'bar-controls', 'aria-expanded': 'false', 'aria-label': 'Show controls',
    onclick: () => setOpen(!bar.classList.contains('open')) }, chevron());
  const bar = h('div', { class: 'bar' }, h('div', { class: 'barhead' }, summary, toggle), ctls);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !bar.classList.contains('open')) return;
    setOpen(false);
    toggle.focus();
  });

  const sub = subtitle();
  root.appendChild(sub.node);
  root.appendChild(bar);
  root.appendChild(tarmacNote());

  for (const s of SECTIONS) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'svg-' + s.id;
    const panel = h('div', { class: 'panel' });
    panel.appendChild(svg);
    if (s.id === 'shift') panel.appendChild(revs.box);
    // the 206 WRC runs on another car's curve, and its power section says whose
    const borrowed = s.id === 'power' ? powerTorque.borrowedCurveNote(car) : '';
    // the averaged-axle cars say how their settings make the final drive
    const formula = s.id === 'fd' ? finalDrive.formulaNote(car) : '';
    const warn = s.id === 'fd' && car.final_drive?.formula?.centre_differential === false;
    root.appendChild(h('section', { id: 'sec-' + s.id },
      h('h2', {}, s.title), h('p', { class: 'cap' }, s.cap),
      ...(borrowed ? [h('p', { class: 'cap borrowed' }, borrowed)] : []),
      ...(formula ? [h('p', { class: 'cap formula' }, formula)] : []),
      ...(warn ? [h('p', { class: 'cap axlewarn', role: 'status' })] : []), panel));
  }
  const { foot, factor, revLimit } = buildFooter();
  root.appendChild(foot);

  wireHover('power', (map, p) => map.xToRpm(p.x));
  wireHover('ladder', (map, p) => ({ lane: map.yToLane(p.y), speed: map.xToSpeed(p.x) }));
  wireHover('shift', (map, p) => ({ gear: map.yToGear(p.y), speed: map.xToSpeed(p.x) }));
  wireHover('revs', (map, p) => map.atPoint(p.x, p.y));
  wireLanePick();
  wireTouchDismiss();

  return { surfaceSel, fdSel, setSel, factor, revLimit, revs, summary, subLimit: sub.limit,
    ceils: [revs.ceil, barCeil], ratios };
}

// The bar's short labels for the ratio settings; each select's accessible name and title is
// the game's own adjustment name.
const RATIO_LABELS = Object.freeze({
  cdr: 'Centre diff', ctf: 'Centre to front', ctr: 'Centre to rear',
  dfr: 'Front diff', drr: 'Rear diff',
});

/** An averaged-axle car's Primary Gear (206 WRC), ratio setting selects and readout. */
function buildRatioControls() {
  const fd = car.final_drive;
  const boxes = [];
  let primary = null;
  if (fd.primaries.length) {
    primary = h('select', { id: 'bar-primary', class: 'ratio', onchange: e => {
      state = setPrimary(data, state, Number(e.target.value));
      track('edit-final-drive-setting');
      commit();
    } }, ...fd.primaries.map((p, i) => h('option', { value: String(i) }, p.name)));
    boxes.push(h('div', { class: 'ctl' }, h('label', { for: 'bar-primary' }, 'Primary Gear'),
      primary));
  }
  const selects = fd.settings.map(s => {
    const id = 'bar-ratio-' + s.key;
    const sel = h('select', { id, class: 'ratio', title: s.adjustment, 'aria-label': s.adjustment,
      onchange: e => {
        state = setRatio(data, state, s.key, Number(e.target.value));
        track('edit-final-drive-setting');
        commit();
      } }, ...s.steps.map((st, i) => h('option', { value: String(i) }, st.name)));
    boxes.push(h('div', { class: 'ctl' },
      h('label', { for: id, title: s.adjustment }, RATIO_LABELS[s.key] ?? s.adjustment), sel));
    return { key: s.key, sel };
  });
  const readout = h('span', { class: 'fdread', 'aria-live': 'polite' });
  boxes.push(h('div', { class: 'ctl fdreadbox' }, readout));
  return { boxes, primary, selects, readout };
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
  const ceil = buildRpmControl(ceilSpec('rev-ceiling'));
  const box = h('div', { class: 'revboxes' }, floor.box, ceil.box);
  return { box, floor, ceil };
}

/**
 * The rev ceiling, for either of its two controls (Shift points and the control bar). Both
 * read and write state.ceil, so there is one ceiling and syncControls keeps both showing it.
 */
const ceilSpec = id => ({
  id, label: 'Rev ceiling', noun: 'rev ceiling', event: 'edit-rev-ceiling',
  get: () => state.ceil, put: v => { state.ceil = v; },
  parse: raw => parseCeil(raw, car, state.floor),
  step: d => stepCeil(state.ceil, d, car, state.floor),
});

/**
 * [−] [typed rpm] [+]. `stacked` puts the label above the row, the way the control bar's
 * other controls are labelled; otherwise it sits inline, as over the Shift points chart.
 */
function buildRpmControl({ id, label, noun, event, get, put, parse, step }, { stacked } = {}) {
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
    // a blur commits too: after Enter, retyping the value the input had when focused and
    // leaving fires no change event, so the typed value would sit there uncommitted
    onblur: typed,
    onkeydown: e => {
      const action = rpmInputKey(e.key);
      if (action === 'commit') typed();
      // revert first: the blur that follows (or the bar closing on Escape) fires change,
      // which then finds nothing typed to commit
      if (action === 'cancel') { input.value = String(get()); input.blur(); }
    } });
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
  const unit = h('span', { class: 'unit' }, 'rpm');
  const box = stacked
    ? h('div', { class: 'ctl' }, h('label', { for: id }, label),
        h('div', { class: 'floorbox' }, minus, input, plus, unit))
    : h('div', { class: 'floorbox' }, h('label', { for: id }, label), minus, input, plus, unit);
  return { box, input, minus, plus };
}

const paintRpm = (control, view) => {
  control.input.value = view.value;
  control.minus.disabled = view.minusDisabled;
  control.plus.disabled = view.plusDisabled;
};

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
  // the car's rev limit, editable the same way as the factor: typed, with a reset link
  const revLimit = h('input', { id: 'rev-limit', type: 'number', step: '50',
    min: String(REV_LIMIT_MIN), max: String(REV_LIMIT_MAX), value: String(state.rl),
    inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Rev limit in rpm',
    onchange: e => {
      const v = parseRevLimit(e.target.value);
      if (v === null) {
        e.target.value = String(state.rl);
      } else if (v !== state.rl) {
        setRevLimit(v);
        track('edit-rev-limit');
        commit();
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
      h('p', { class: 'fnote' }, FACTOR_NOTE)),
    h('div', {},
      h('h3', {}, 'Rev limit'),
      h('div', { class: 'kbox' }, revLimit, h('span', { class: 'unit' }, 'rpm'),
        h('a', { href: '#', onclick: e => {
          e.preventDefault();
          setRevLimit(data.engine.redline);
          commit();
        } }, 'reset')),
      h('p', { class: 'fnote' }, revLimitNote(data.engine.redline_source))),
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
  return { foot, factor, revLimit };
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

const HOVER_IDS = ['power', 'ladder', 'shift', 'revs'];

function wireHover(id, toHover) {
  const svg = svgOf(id);
  const show = e => {
    const map = maps[id];
    if (!map) return;
    hover[id] = toHover(map, toViewBox(svg, e));
    if (id === 'shift') track('shift-helper');
    RENDER[id]();
  };
  // A finger: tap to place the readout, drag sideways to scrub it (js/hover.js touchStep).
  let gesture = null;
  const onTouch = e => {
    if (e.pointerType !== 'touch') return false;
    // a finger down on a lane name is picking a gear set: see wireLanePick
    const lane = e.type === 'pointerdown' && id === 'ladder' && isLaneTap(svg, e);
    const step = touchStep(gesture, { type: e.type, x: e.clientX, y: e.clientY, lane });
    gesture = step.gesture;
    // keep a scrub's moves coming to the svg, which a redraw never replaces
    if (e.type === 'pointerdown' && !lane) svg.setPointerCapture?.(e.pointerId);
    if (step.draw) show(e);
    return true;
  };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    svg.addEventListener(type, onTouch);
  }
  svg.addEventListener('pointermove', e => {
    if (onTouch(e)) return;
    // Redrawing replaces every node, so a redraw between pointerdown and click swaps the
    // lane name out from under the click. See js/hover.js.
    if (movesHover(e)) show(e);
  });
  svg.addEventListener('pointerleave', e => {
    if (!leaveRedraws(hover[id], e.pointerType)) return;
    hover[id] = null;
    RENDER[id]();
  });
}

/** Whether a finger went down on a lane name of the ladder, the same test its click uses. */
function isLaneTap(svg, e) {
  const i = maps.ladder?.laneAt(toViewBox(svg, e), { coarse: true });
  return i !== null && i !== undefined;
}

/** A tap outside every chart takes a touch readout away. */
function wireTouchDismiss() {
  let down = null;
  const onChart = target => target instanceof Element && !!target.closest('svg[id^="svg-"]');
  document.addEventListener('pointerdown', e => {
    down = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, chart: onChart(e.target) }
      : null;
  });
  document.addEventListener('pointercancel', () => { down = null; });
  document.addEventListener('pointerup', e => {
    const from = down;
    down = null;
    if (!from || e.pointerType !== 'touch' || from.chart
        || !isTap(from, { x: e.clientX, y: e.clientY })) return;
    for (const id of HOVER_IDS) {
      if (hover[id] === null) continue;
      hover[id] = null;
      RENDER[id]();
    }
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
    section.querySelector('.cap').textContent = finalDrive.caption(car, state);
    const warning = section.querySelector('.axlewarn');
    if (warning) {
      warning.textContent = finalDrive.axleWarning(car, state);
      warning.hidden = !warning.textContent;
    }
    finalDrive.render(svg, car, state, i => {
      state = pickRow(data, state, i);
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
  power: () => {
    maps.power = powerTorque.render(svgOf('power'), car, hover.power, state.ceil);
  },
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
  car = withRevLimit(data, state.rl);
  clearHover();
  history.replaceState(null, '', toHash(state, data));
  syncControls();
  draw();
}

function syncControls() {
  controls.surfaceSel.value = state.surface;
  if (controls.ratios) {
    const { primary, selects, readout } = controls.ratios;
    if (primary) primary.value = String(primaryIndex(car, state));
    for (const { key, sel } of selects) sel.value = String(state.ratios[key]);
    readout.textContent = finalDrive.finalDriveReadout(car, state);
  } else if (controls.fdSel?.options.length) controls.fdSel.value = String(state.fd);
  controls.setSel.value = String(state.set);
  controls.factor.value = String(state.k);
  controls.revLimit.value = String(state.rl);
  controls.subLimit.textContent = String(car.engine.redline);
  syncSummary();
  const views = revControlViews(car, state);
  paintRpm(controls.revs.floor, views.floor);
  for (const c of controls.ceils) paintRpm(c, views.ceil);
  document.querySelector('#sec-shift .cap').textContent =
    shiftPoints.shiftCaption(state.floor, state.ceil, car.engine.redline);
}

async function main() {
  try {
    [data, index] = await Promise.all([
      fetch(new URL(`data/${slug}.json`, SITE)).then(r => r.json()),
      // only the footer's data line comes from here, so a missing index must not sink the page
      fetch(new URL('data/index.json', SITE)).then(r => r.json()).catch(() => ({})),
    ]);
  } catch (err) {
    const loading = root.querySelector('.loading');
    if (loading) loading.textContent = 'Could not load the data for this car.';
    throw err;
  }
  state = parseHash(location.hash, data);
  car = withRevLimit(data, state.rl);
  controls = buildShell();
  commit();
  onThemeChange(() => {
    syncControls();
    RENDER.revs();
  });
  window.addEventListener('hashchange', () => {
    state = parseHash(location.hash, data);
    car = withRevLimit(data, state.rl);
    clearHover();
    syncControls();
    draw();
  });
}

main();
