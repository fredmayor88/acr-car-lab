// Chart 2 — every selectable final drive, against the shortest one.
// Clicking a row is the main reason this beats the static PNG.
//
// Two things this module must not get wrong:
//
// 1. A combination's overall ratio is NOT `combo.below`. The primary in force is either
//    the combo's own (the Stratos, where picking one REPLACES the gear set's) or the gear
//    set's (every other car with a final-drive selector, whose `primaries` list is empty).
//    `overallRatio` resolves that; nothing here multiplies a primary on top of it.
//
// 2. Because the gear set supplies the primary on those cars, the sort key depends on the
//    selected gear set. So the sort lives inside `layout` and the sorted list is never
//    cached across calls.
//
// Row order is display order; `row.index` is the combo's index in `finalDriveCombos`,
// which is what `state.fd` and the URL hash mean. They are not the same number.

import { averagedBelow, ceilingOf, circumference, finalDriveCombos, hasRatioSettings, kmh,
  matchingRow, overallRatio, ratioSteps } from '../gearing.js';
import { selectedRow } from '../state.js';
import { C, el, text, clear } from '../svg.js';

/**
 * Cars with an empty `primaries` list have no primary of their own to show.
 * Exported so the control bar's final-drive dropdown labels rows the same way.
 */
export const comboLabel = combo =>
  combo.primary ? `${combo.primary.name}  ·  ${combo.option.name}` : combo.option.name;

/** The section caption: which gear set and rpm the km/h column is read at. */
export function caption(car, state) {
  const ceil = ceilingOf(car, state);
  const at = ceil === car.engine.redline ? 'the rev limit' : `the ${ceil} rpm rev ceiling`;
  return 'Every selectable combination. 100% is the shortest. Speed is top gear of '
    + `${car.gear_sets[state.set].label.toLowerCase()} at ${at}. `
    + 'Click a row to use that final drive.';
}

/**
 * The averaged-axle cars' line under the caption: how their settings make the final drive.
 * Built from the data's formula, so it names exactly the settings the car publishes.
 */
export function formulaNote(car) {
  if (!hasRatioSettings(car)) return '';
  const fd = car.final_drive;
  const f = fd.formula;
  const name = key => fd.settings.find(s => s.key === key).adjustment;
  const chain = keys => keys.map(name).join(' × ');
  if (!f.front.length && !f.rear.length) {
    const fixed = f.fixed_pre * (f.fixed_front + f.fixed_rear) / 2;
    return `Final drive = ${chain(f.pre)} × ${fixed.toFixed(3)} `
      + '(the front and rear differentials are fixed).';
  }
  if (!f.front.length) {
    return `Final drive = average of the front axle (${chain(f.pre)}) and the rear axle `
      + `(${chain([...f.pre, ...f.rear])}).`;
  }
  const average = `average of ${chain(f.front)} and ${chain(f.rear)}`;
  return f.pre.length ? `Final drive = ${chain(f.pre)} × ${average}.` : `Final drive = ${average}.`;
}

/** Only on a car with no centre differential, and only while its row settings disagree. */
export function axleWarning(car, state) {
  if (!hasRatioSettings(car) || car.final_drive.formula.centre_differential !== false) return '';
  return matchingRow(car.final_drive, state.ratios) < 0
    ? 'No centre differential: different front and rear ratios make the axles fight and the car '
      + 'hard to control.'
    : '';
}

/** The bar's readout on an averaged-axle car: below the gearbox, primary not included. */
export const finalDriveReadout = (car, state) =>
  `final drive ${averagedBelow(car.final_drive, state.ratios).toFixed(2)}`;

/** Each ratio setting's game name and spelling, in the car's order. */
export const ratioLines = (car, state) => {
  const steps = ratioSteps(car.final_drive, state.ratios);
  return car.final_drive.settings.map(s => `${s.adjustment}: ${steps[s.key].name}`);
};

export function layout(car, state) {
  if (!car.final_drive) return { adjustable: false, rows: [] };

  const circ = circumference(car.tyres[state.surface].free_radius, state.k);
  // One stated gear set keeps the speed something a real configuration produces.
  const top = Math.min(...car.gear_sets[state.set].gears.map(g => g.value));
  // an averaged-axle car: each row holds every other setting as selected, and the highlighted
  // row is the one the settings sit on (none when they sit on none)
  const averaged = hasRatioSettings(car) && state.ratios;
  const selected = averaged ? selectedRow(car, state) : state.fd;

  const rows = finalDriveCombos(car.final_drive, averaged ? state.ratios : null)
    .map((combo, index) => ({
      index,
      primary: combo.primary,
      option: combo.option,
      label: comboLabel(combo),
      value: overallRatio(car, state.set, combo),
      selected: index === selected,
    }))
    .sort((a, b) => b.value - a.value); // shortest gearing first — largest ratio

  const shortest = rows[0].value;
  for (const r of rows) {
    r.pct = shortest / r.value * 100;
    r.kmh = kmh(ceilingOf(car, state), top * r.value, circ);
  }
  return { adjustable: true, rows };
}

export function render(svg, car, state, onPick) {
  clear(svg);
  const l = layout(car, state);
  if (!l.adjustable) return;

  const rows = l.rows;
  const L = 196, R = 930, T = 16, step = 26.6;
  const maxPct = Math.max(...rows.map(r => r.pct));
  const xs = v => L + ((v - 97) / (maxPct * 1.06 - 97)) * (R - L);
  const bottom = T + rows.length * step;
  svg.setAttribute('viewBox', `0 0 1100 ${bottom + 30}`);

  for (let v = 100; v <= maxPct + 6; v += 10) {
    el(svg, 'line', { x1: xs(v), x2: xs(v), y1: T, y2: bottom,
                      stroke: C.muted, 'stroke-opacity': 0.16 });
    text(svg, xs(v), bottom + 17, v + '%', 'axis', { 'text-anchor': 'middle' });
  }
  el(svg, 'line', { x1: xs(100), x2: xs(100), y1: T, y2: bottom,
                    stroke: C.muted, 'stroke-opacity': 0.75, 'stroke-width': 1.3 });

  rows.forEach((r, i) => {
    const y = T + i * step + step / 2;
    // Paint order, and it matters: the selected row's tint goes down first so the marks
    // sit on it, then the marks, then the click target LAST so nothing paints over it.
    // SVG gives a click to the topmost painted element, and these are siblings with no
    // listener of their own — with the target underneath, clicking the row label or the
    // km/h readout (the two most natural targets) hit a text node and the event was lost.
    if (r.selected) {
      el(svg, 'rect', { x: 6, y: y - 12, width: 1080, height: 24, rx: 2,
                        fill: C.accent, 'fill-opacity': 0.07 });
    }
    el(svg, 'line', { x1: xs(100), x2: xs(r.pct), y1: y, y2: y, stroke: C.muted,
                      'stroke-opacity': 0.42, 'stroke-width': 1.3 });
    el(svg, 'circle', { cx: xs(r.pct), cy: y, r: r.selected ? 6.4 : 5,
                        fill: r.selected ? C.accent : C.data, stroke: C.halo,
                        'stroke-width': 1.6 });
    text(svg, L - 12, y + 3.6, r.label, 'val',
         { 'text-anchor': 'end', 'fill-opacity': r.selected ? 1 : 0.72 });
    text(svg, xs(r.pct) + 12, y + 3.6,
         `${r.pct.toFixed(0).padStart(3)}%     ${r.kmh.toFixed(0)} km/h`, 'val',
         { 'fill-opacity': r.selected ? 1 : 0.72 });
    // `fill: transparent` is still a painted fill, so `visiblePainted` hit-testing finds
    // it; `pointer-events: all` says so outright rather than relying on that reading.
    const hit = el(svg, 'rect', { x: 6, y: y - 12, width: 1080, height: 24, rx: 2,
                                  fill: 'transparent', 'pointer-events': 'all',
                                  class: 'hit' });
    hit.addEventListener('click', () => onPick(r.index));
  });
}
