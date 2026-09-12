// Core gearing arithmetic. Pure — no DOM, no globals, no imports. Everything the charts
// show is derived from these functions, which is why they are the only unit-tested
// surface that really matters.
//
// The ratio model, stated once so nobody double-counts again:
//
//   total = gear.value * primary.value * below
//
// `primary` is the gearbox primary/transfer step. It comes from ONE of two places and
// never both:
//   - the gear set itself (`gear_sets[i].primary`) — every car has this;
//   - a selectable primary from `final_drive.primaries` — only the Stratos, where the
//     picked primary REPLACES the set's primary. They are alternatives, not factors.
//
// `below` is everything under the gearbox: `final_drive.rest * option.value` when there
// is a selectable final drive, otherwise the car's `fixed_final_drive`.

export const DEFAULT_FACTOR = 0.9562;
export const REV_FLOOR = 3000;

export const SURFACES = [
  { key: 'Tarmac_Dry', label: 'Dry tarmac' },
  { key: 'Tarmac_Wet', label: 'Wet tarmac' },
  { key: 'Gravel', label: 'Gravel' },
  { key: 'Sweden', label: 'Snow' },
  { key: 'Montecarlo', label: 'Winter tarmac' },
];

export const SET_COLOURS = ['#7A583B', '#148FAC', '#30353A', '#B07A4E', '#0E6E85',
                            '#8D949B', '#4FB3C9', '#5A3F29'];

/** A loaded tyre rolls on a smaller radius than the stored free one. */
export const circumference = (freeRadius, factor) => 2 * Math.PI * freeRadius * factor;

/** Road speed for an engine speed and an overall ratio. */
export const kmh = (rpm, total, circ) => rpm * circ * 0.06 / total;

/** The inverse: engine speed for a road speed. */
export const rpmAt = (speed, total, circ) => speed * total / (circ * 0.06);

/** Engine-to-wheel ratio for one gear. `below` already includes `rest`. */
export const totalRatio = (gear, primary, below) => gear * primary * below;

/**
 * Every selectable final-drive combination as `{ primary, option, below }`.
 *
 * The primary is NOT folded into `below` — it is an alternative to the gear set's own
 * primary, not a factor on top of it. Folding it in double-counts by up to 1.375x.
 *
 * An empty `primaries` array means "this car has no primary selector", not "no primary":
 * those rows carry `primary: null` and the gear set's primary is used instead.
 *
 * Ordering is the caller's job, because the sort key depends on the gear set (see
 * `overallRatio`).
 */
export function finalDriveCombos(fd) {
  if (!fd) return [];
  const out = [];
  const primaries = fd.primaries && fd.primaries.length ? fd.primaries : [null];
  for (const primary of primaries) {
    for (const option of fd.options) {
      out.push({ primary, option, below: fd.rest * option.value });
    }
  }
  return out;
}

/** The primary actually in force: a selected one wins, otherwise the gear set's own. */
export const effectivePrimary = (car, setIndex, combo) =>
  (combo && combo.primary) ? combo.primary : car.gear_sets[setIndex].primary;

/** Everything under the gearbox: the selected combo, or the car's fixed final drive. */
export const belowGearbox = (car, combo) =>
  combo ? combo.below : car.fixed_final_drive;

/**
 * The whole drivetrain below the individual gear, for one gear set and one combo.
 * This is what the final-drive grid sorts and takes percentages on.
 * Shortest gearing is the LARGEST value.
 */
export const overallRatio = (car, setIndex, combo) =>
  effectivePrimary(car, setIndex, combo).value * belowGearbox(car, combo);

/** Where each gear tops out, in km/h. */
export const gearTops = (gears, overall, circ, redline) =>
  gears.map(g => kmh(redline, g.value * overall, circ));

/**
 * The gear you are in at a given speed: the lowest one that has not topped out yet.
 * Clamped to top gear, because past the last top speed there is nothing higher to pick.
 */
export function gearAtSpeed(tops, speed) {
  const i = tops.findIndex(v => v >= speed);
  return i < 0 ? tops.length - 1 : i;
}
