// Page state, and its round trip through the URL hash. A link has to reproduce exactly
// what someone was looking at, so every control's value lives here and nowhere else.
// Values arriving from a URL get the same validation as typed input.

import { DEFAULT_FACTOR, REV_FLOOR, SURFACES, finalDriveCombos } from './gearing.js';

const K_MIN = 0.80;
const K_MAX = 1.10;
const FLOOR_STEP = 100;

/**
 * The rev floor on Shift points: any whole rpm from 0 to one step under the ceiling, which
 * is the rev limit unless it has been lowered.
 */
export const floorBounds = (car, ceil = car.engine.redline) =>
  ({ min: 0, max: ceil - FLOOR_STEP });

/** A typed or linked rev floor as an integer, or null when it is not a valid one. */
export function parseFloor(raw, car, ceil = car.engine.redline) {
  const n = wholeRpm(raw);
  const { min, max } = floorBounds(car, ceil);
  return n !== null && n >= min && n <= max ? n : null;
}

/** One click of the -/+ buttons: 100 rpm from the current value, clamped to the bounds. */
export function stepFloor(floor, direction, car, ceil = car.engine.redline) {
  const { min, max } = floorBounds(car, ceil);
  return Math.min(max, Math.max(min, floor + direction * FLOOR_STEP));
}

/**
 * The rev ceiling on Shift points: one step over the floor (and never under one step) up
 * to the rev limit. The limit need not sit on the 100 rpm grid (the Stratos is 8750), so
 * it is the exact default and a clamped step up reaches it.
 */
export const ceilBounds = (car, floor = 0) =>
  ({ min: Math.max(FLOOR_STEP, floor + FLOOR_STEP), max: car.engine.redline });

/** A typed or linked rev ceiling as an integer, or null when it is not a valid one. */
export function parseCeil(raw, car, floor = 0) {
  const n = wholeRpm(raw);
  const { min, max } = ceilBounds(car, floor);
  return n !== null && n >= min && n <= max ? n : null;
}

/** One click of the ceiling's -/+ buttons, clamped to its bounds. */
export function stepCeil(ceil, direction, car, floor = 0) {
  const { min, max } = ceilBounds(car, floor);
  return Math.min(max, Math.max(min, ceil + direction * FLOOR_STEP));
}

/** What an rpm control shows: its value, and each button disabled at its own bound. */
export const rpmControlView = (value, { min, max }) =>
  ({ value: String(value), minusDisabled: value <= min, plusDisabled: value >= max });

/**
 * The rev floor's and ceiling's views, from one state. The ceiling has two controls (Shift
 * points and the control bar); both are painted from the one `ceil` view, so they cannot
 * disagree.
 */
export const revControlViews = (car, state) => ({
  floor: rpmControlView(state.floor, floorBounds(car, state.ceil)),
  ceil: rpmControlView(state.ceil, ceilBounds(car, state.floor)),
});

/**
 * What a key does in an rpm input. Enter commits the typed value; Escape cancels it, so the
 * input goes back to the current value before anything (a blur, a closing panel) can commit it.
 */
export const rpmInputKey = key =>
  key === 'Enter' ? 'commit' : key === 'Escape' ? 'cancel' : null;

function wholeRpm(raw) {
  return typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : null;
}

/**
 * Where focus goes after a −/+ step. A button that just disabled itself at a bound drops
 * keyboard focus to <body>, so a keyboard step hands it to the rpm input. A mouse or touch
 * step leaves focus alone: Chrome focuses a clicked button too, and focusing the numeric
 * input from a tap would open the on-screen keyboard. `stepped` is the button used;
 * `byKeyboard` is whether the click came from Enter/Space. Null means leave focus alone.
 */
export function floorFocusAfterStep(stepped, { minus, plus, input }, byKeyboard) {
  const atBound = stepped && (stepped === minus || stepped === plus) && stepped.disabled;
  return byKeyboard && atBound ? input : null;
}

const surfacesFor = car =>
  SURFACES.filter(s => Object.prototype.hasOwnProperty.call(car.tyres, s.key));

const combosFor = car => (car.final_drive ? finalDriveCombos(car.final_drive) : []);

/**
 * The combination the car ships with, so the page opens on something real.
 *
 * The option alone does not identify it on the Stratos: its stock option pairs with all
 * eight selectable primaries, and the first of those is the 1.375, not the 1.1 the car is
 * actually fitted with. The fitted primary is the one stored in the gear set asset, so a
 * combo that carries a primary has to match that too. Combos with `primary: null` (every
 * other car with a selector) have nothing to match and the option is enough.
 */
function stockIndex(car) {
  const combos = combosFor(car);
  if (!combos.length) return 0;
  const fitted = car.gear_sets[0].primary;
  const i = combos.findIndex(c =>
    c.option.name === car.final_drive.stock_option
    && (!c.primary || (fitted != null && c.primary.name === fitted.name)));
  return i < 0 ? 0 : i;
}

export function defaultState(car) {
  const available = surfacesFor(car);
  return {
    surface: available.length ? available[0].key : 'Tarmac_Dry',
    fd: stockIndex(car),
    set: 0,
    draw: [0],
    k: car.defaults?.loaded_radius_factor ?? DEFAULT_FACTOR,
    floor: REV_FLOOR,
    ceil: car.engine.redline,
  };
}

const intOr = (raw, fallback) => {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) ? n : fallback;
};

export function parseHash(hash, car) {
  const base = defaultState(car);
  const q = new URLSearchParams((hash || '').replace(/^#/, ''));
  const out = { ...base };

  const surface = q.get('s');
  if (surface && surfacesFor(car).some(x => x.key === surface)) out.surface = surface;

  const combos = combosFor(car);
  const fd = intOr(q.get('fd'), -1);
  if (fd >= 0 && fd < combos.length) out.fd = fd;

  const set = intOr(q.get('set'), -1);
  if (set >= 0 && set < car.gear_sets.length) out.set = set;

  if (q.has('draw')) {
    const drawn = [...new Set((q.get('draw') || '').split(',')
      .map(v => intOr(v, -1))
      .filter(i => i >= 0 && i < car.gear_sets.length))].sort((a, b) => a - b);
    if (drawn.length) out.draw = drawn;
  }

  const k = Number.parseFloat(q.get('k'));
  if (Number.isFinite(k) && k >= K_MIN && k <= K_MAX) out.k = k;

  // the ceiling first, so the floor can be checked against the ceiling it will sit under
  const ceil = parseCeil(q.get('ceil'), car);
  if (ceil !== null) out.ceil = ceil;
  const floor = parseFloor(q.get('floor'), car, out.ceil);
  out.floor = floor !== null ? floor : Math.min(REV_FLOOR, out.ceil - FLOOR_STEP);

  return out;
}

export function toHash(state, car) {
  const q = new URLSearchParams();
  q.set('s', state.surface);
  if (combosFor(car).length) q.set('fd', String(state.fd));
  q.set('set', String(state.set));
  q.set('draw', state.draw.join(','));
  q.set('k', String(state.k));
  if (state.floor !== REV_FLOOR) q.set('floor', String(state.floor));
  const ceil = state.ceil ?? car.engine.redline;
  if (ceil !== car.engine.redline) q.set('ceil', String(ceil));
  return '#' + q.toString();
}
