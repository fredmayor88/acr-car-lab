// Page state, and its round trip through the URL hash. A link has to reproduce exactly
// what someone was looking at, so every control's value lives here and nowhere else.
// Values arriving from a URL get the same validation as typed input.

import { DEFAULT_FACTOR, REV_FLOOR, SURFACES, finalDriveCombos } from './gearing.js';

const K_MIN = 0.80;
const K_MAX = 1.10;
const FLOOR_STEP = 100;

/** The rev floor on Shift points: any whole rpm from 0 to one step under the limit. */
export const floorBounds = car => ({ min: 0, max: car.engine.redline - FLOOR_STEP });

/** A typed or linked rev floor as an integer, or null when it is not a valid one. */
export function parseFloor(raw, car) {
  if (typeof raw !== 'string' || !/^\s*\d+\s*$/.test(raw)) return null;
  const n = Number(raw);
  const { min, max } = floorBounds(car);
  return n >= min && n <= max ? n : null;
}

/** One click of the -/+ buttons: 100 rpm from the current value, clamped to the bounds. */
export function stepFloor(floor, direction, car) {
  const { min, max } = floorBounds(car);
  return Math.min(max, Math.max(min, floor + direction * FLOOR_STEP));
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

  const floor = parseFloor(q.get('floor'), car);
  if (floor !== null) out.floor = floor;

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
  return '#' + q.toString();
}
