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
//   - a selectable primary from `final_drive.primaries` — the Stratos and the 206 WRC, where
//     the picked primary REPLACES the set's primary. They are alternatives, not factors.
//
// `below` is everything under the gearbox: `final_drive.rest * option.value` when there
// is a selectable final drive, otherwise the car's `fixed_final_drive`.
//
// Five AWD cars (Delta Integrale, 206 WRC, Impreza, Xsara WRC, Audi Quattro) publish every
// ratio setting on their drivetrain (`final_drive.settings`) and the formula that turns them
// into `below` (`final_drive.formula`). Their centre differential averages its two outputs,
// measured in game (ruling R51):
//
//   below = fixed_pre * prod(pre) * (fixed_front * prod(front) + fixed_rear * prod(rear)) / 2
//
// A state for one of them carries `ratios`, `{ settingKey: stepIndex }`. Every other car has
// no `settings` and no `ratios`, and takes exactly the path above.

// Fitted in acr-setup-engineer (tools/gearing-charts/calibration.json) against measured top
// speeds on seven cars at their measured rev limits. Every car's data carries the same value.
export const DEFAULT_FACTOR = 0.9904;
export const REV_FLOOR = 3000;

// Frozen: these are shared across every chart module on the page, and one in-place
// .sort() or .splice() by a consumer would poison all the others for the page's lifetime.
export const SURFACES = Object.freeze([
  Object.freeze({ key: 'Tarmac_Dry', label: 'Dry tarmac' }),
  Object.freeze({ key: 'Tarmac_Wet', label: 'Wet tarmac' }),
  Object.freeze({ key: 'Gravel', label: 'Gravel' }),
  Object.freeze({ key: 'Sweden', label: 'Snow' }),
  Object.freeze({ key: 'Montecarlo', label: 'Winter tarmac' }),
]);

export const SET_COLOURS = Object.freeze(
  ['#7A583B', '#148FAC', '#30353A', '#B07A4E', '#0E6E85',
   '#8D949B', '#4FB3C9', '#5A3F29',
   // 50/50 mixes: GRAPHITE with STEEL, WALNUT with STEEL. Sets 9 and 10 of the 306 Maxi.
   '#555D64', '#7A6E64']);

// The same ten roles for the dark theme, where walnut and graphite vanish on the panel.
// Brand colours and mixes of them only: Light Oak, Signal Cyan, Warm White, Oak/Warm White,
// Deep Cyan, Steel/Warm White, Signal Cyan/Warm White, Oak/Walnut, Steel, Oak/Steel.
// Every one clears 3:1 on the dark panel (#30353A).
export const SET_COLOURS_DARK = Object.freeze(
  ['#B89873', '#25C4E2', '#F5F2EB', '#D7C5AF', '#148FAC',
   '#A6ABAF', '#8DDBE7', '#997857', '#7B858E', '#9A8F80']);

/**
 * The rpm every "top speed" on the page is read at: the rev ceiling when it has been lowered,
 * otherwise the rev limit. The over-limit downshift warning still uses the real limit.
 */
export const ceilingOf = (car, state) => state?.ceil ?? car.engine.redline;

/**
 * The car with its rev limit set to `rpm`: every chart, caption and warning reads the limit
 * from `car.engine.redline`, so an edited limit is one substitution here. The same object
 * back when nothing changes; the data object is never mutated.
 */
export const withRevLimit = (car, rpm) => (rpm == null || rpm === car.engine.redline
  ? car
  : { ...car, engine: { ...car.engine, redline: rpm } });

/** A loaded tyre rolls on a smaller radius than the stored free one. */
export const circumference = (freeRadius, factor) => 2 * Math.PI * freeRadius * factor;

/** Road speed for an engine speed and an overall ratio. */
export const kmh = (rpm, total, circ) => rpm * circ * 0.06 / total;

/** The inverse: engine speed for a road speed. */
export const rpmAt = (speed, total, circ) => speed * total / (circ * 0.06);

/** Engine-to-wheel ratio for one gear. `below` already includes `rest`. */
export const totalRatio = (gear, primary, below) => gear * primary * below;

/** True for the averaged-axle cars: the ones that publish each ratio setting. */
export const hasRatioSettings = car => Array.isArray(car?.final_drive?.settings);

/** Each setting's step index as the car ships: `{ key: index }`. */
export const stockRatios = fd => Object.fromEntries(
  fd.settings.map(s => [s.key, s.steps.findIndex(step => step.name === s.stock)]));

/** The step each setting is on, `{ key: { name, value } }`, for `ratios` (step indices). */
export const ratioSteps = (fd, ratios) => Object.fromEntries(
  fd.settings.map(s => [s.key, s.steps[ratios[s.key]]]));

/**
 * The ratio below the gearbox on an averaged-axle car, from its formula and the step index of
 * each setting: the pre-split ratios times the mean of the front and rear chains.
 */
export function averagedBelow(fd, ratios) {
  const steps = ratioSteps(fd, ratios);
  const prod = keys => keys.reduce((p, k) => p * steps[k].value, 1);
  const f = fd.formula;
  return f.fixed_pre * prod(f.pre)
    * (f.fixed_front * prod(f.front) + f.fixed_rear * prod(f.rear)) / 2;
}

/**
 * `ratios` with Final drive chart row `option` applied: every `rows` setting moves to its step
 * of that option's name; every other setting is held.
 */
export function rowRatios(fd, ratios, option) {
  const name = fd.options[option].name;
  const out = { ...ratios };
  for (const key of fd.rows) {
    out[key] = fd.settings.find(s => s.key === key).steps.findIndex(st => st.name === name);
  }
  return out;
}

/** The row (option index) `ratios` sit on, or -1 when the row settings disagree (front ≠ rear). */
export function matchingRow(fd, ratios) {
  const steps = ratioSteps(fd, ratios);
  return fd.options.findIndex(o => fd.rows.every(k => steps[k].name === o.name));
}

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
export function finalDriveCombos(fd, ratios = null) {
  if (!fd) return [];
  const out = [];
  const primaries = fd.primaries && fd.primaries.length ? fd.primaries : [null];
  // an averaged-axle car with its settings: each row holds every other setting as selected
  const averaged = ratios && Array.isArray(fd.settings);
  for (const primary of primaries) {
    fd.options.forEach((option, i) => {
      out.push({ primary, option,
        below: averaged ? averagedBelow(fd, rowRatios(fd, ratios, i)) : fd.rest * option.value });
    });
  }
  return out;
}

/** The primary actually in force: a selected one wins, otherwise the gear set's own. */
export const effectivePrimary = (car, setIndex, combo) =>
  (combo && combo.primary) ? combo.primary : car.gear_sets[setIndex].primary;

/**
 * Everything under the gearbox: the averaged-axle formula when the car has ratio settings and
 * `ratios` is given, otherwise the selected combo, or the car's fixed final drive.
 *
 * Throws when neither exists. The twelve fixed-primary cars have `fixed_final_drive: null`
 * and REQUIRE a combo; without this guard `primary * null` is 0 and km/h comes out
 * Infinity, which a chart draws silently. Failing loudly here is the cheapest place to
 * catch a UI that renders before a combo is picked, or nulls the combo on a car change.
 */
export function belowGearbox(car, combo, ratios = null) {
  if (ratios && hasRatioSettings(car)) return averagedBelow(car.final_drive, ratios);
  if (combo) return combo.below;
  if (car.fixed_final_drive == null) {
    throw new Error(
      `${car.slug}: a final-drive combo is required for this car ` +
      `(fixed_final_drive is null, so there is no ratio below the gearbox without one)`);
  }
  return car.fixed_final_drive;
}

/**
 * The whole drivetrain below the individual gear, for one gear set and one combo.
 * This is what the final-drive grid sorts and takes percentages on.
 * Shortest gearing is the LARGEST value.
 */
export const overallRatio = (car, setIndex, combo, ratios = null) =>
  effectivePrimary(car, setIndex, combo).value * belowGearbox(car, combo, ratios);

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
