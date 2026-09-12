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

import { circumference, finalDriveCombos, kmh, overallRatio } from '../gearing.js';
import { el, text, clear } from '../svg.js';

const C = { warm: '#F5F2EB', graphite: '#30353A', steel: '#7B858E',
            walnut: '#7A583B', cyan: '#148FAC' };

/** Cars with an empty `primaries` list have no primary of their own to show. */
const comboLabel = combo =>
  combo.primary ? `${combo.primary.name}  ·  ${combo.option.name}` : combo.option.name;

export function layout(car, state) {
  if (!car.final_drive) return { adjustable: false, rows: [] };

  const circ = circumference(car.tyres[state.surface].free_radius, state.k);
  // One stated gear set keeps the speed something a real configuration produces.
  const top = Math.min(...car.gear_sets[state.set].gears.map(g => g.value));

  const rows = finalDriveCombos(car.final_drive)
    .map((combo, index) => ({
      index,
      primary: combo.primary,
      option: combo.option,
      label: comboLabel(combo),
      value: overallRatio(car, state.set, combo),
      selected: index === state.fd,
    }))
    .sort((a, b) => b.value - a.value); // shortest gearing first — largest ratio

  const shortest = rows[0].value;
  for (const r of rows) {
    r.pct = shortest / r.value * 100;
    r.kmh = kmh(car.engine.redline, top * r.value, circ);
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
  svg.setAttribute('viewBox', `0 0 1100 ${bottom + 56}`);

  for (let v = 100; v <= maxPct + 6; v += 10) {
    el(svg, 'line', { x1: xs(v), x2: xs(v), y1: T, y2: bottom,
                      stroke: C.steel, 'stroke-opacity': 0.16 });
    text(svg, xs(v), bottom + 17, v + '%', 'axis', { 'text-anchor': 'middle' });
  }
  el(svg, 'line', { x1: xs(100), x2: xs(100), y1: T, y2: bottom,
                    stroke: C.steel, 'stroke-opacity': 0.75, 'stroke-width': 1.3 });

  rows.forEach((r, i) => {
    const y = T + i * step + step / 2;
    // Paint order, and it matters: the selected row's tint goes down first so the marks
    // sit on it, then the marks, then the click target LAST so nothing paints over it.
    // SVG gives a click to the topmost painted element, and these are siblings with no
    // listener of their own — with the target underneath, clicking the row label or the
    // km/h readout (the two most natural targets) hit a text node and the event was lost.
    if (r.selected) {
      el(svg, 'rect', { x: 6, y: y - 12, width: 1080, height: 24, rx: 2,
                        fill: C.cyan, 'fill-opacity': 0.07 });
    }
    el(svg, 'line', { x1: xs(100), x2: xs(r.pct), y1: y, y2: y, stroke: C.steel,
                      'stroke-opacity': 0.42, 'stroke-width': 1.3 });
    el(svg, 'circle', { cx: xs(r.pct), cy: y, r: r.selected ? 6.4 : 5,
                        fill: r.selected ? C.cyan : C.walnut, stroke: C.warm,
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

  text(svg, L - 190, bottom + 40,
       '100% is the shortest combination. Speed is top gear of '
       + car.gear_sets[state.set].label.toLowerCase() + '.', 'lbl');
}
