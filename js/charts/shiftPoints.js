// Chart 4 — the selected gear set, one row per gear.
// Bars run from a usable-revs floor to the limiter, so they OVERLAP: the same road speed
// is reachable in more than one gear, and that overlap is what the chart exists to show.
// A tiled version where each gear owned its own band was tried and rejected — it draws a
// tidy staircase that hides the choice.

import { REV_FLOOR, circumference, gearTops, kmh, rpmAt } from '../gearing.js';
import { fdValue } from './ladder.js';
import { C, el, text, clear } from '../svg.js';

const circOf = (car, state) =>
  circumference(car.tyres[state.surface].free_radius, state.k);

const totals = (car, state) =>
  car.gear_sets[state.set].gears.map(g => g.value * fdValue(car, state));

export function layout(car, state) {
  const circ = circOf(car, state);
  const tot = totals(car, state);
  const tops = gearTops(car.gear_sets[state.set].gears, fdValue(car, state), circ,
                        car.engine.redline);
  return {
    bars: tot.map((t, i) => ({ gear: i, from: kmh(REV_FLOOR, t, circ), to: tops[i] })),
    tops,
    vmax: tops[tops.length - 1] * 1.06,
  };
}

/**
 * `gear` is the row under the cursor, not something inferred from the speed. Inferring it
 * as "the lowest gear that has not topped out" would put you in the shortest usable gear
 * every time, so every downshift would over-rev and the warning would be meaningless.
 */
export function shiftReadout(car, state, gear, speed) {
  const circ = circOf(car, state);
  const tot = totals(car, state);
  // The axis runs past every bar, so the cursor can sit where this gear cannot be:
  // clamp to its own bar, rev floor to limiter, or the readout invents revs.
  speed = Math.min(Math.max(speed, kmh(REV_FLOOR, tot[gear], circ)),
                   kmh(car.engine.redline, tot[gear], circ));
  const revsIn = i => rpmAt(speed, tot[i], circ);
  const up = gear + 1 < tot.length ? { gear: gear + 1, rpm: revsIn(gear + 1) } : null;
  const down = gear > 0 ? { gear: gear - 1, rpm: revsIn(gear - 1) } : null;
  return {
    gear,
    rpm: revsIn(gear),
    speed,
    up,
    down,
    overRev: down !== null && down.rpm > car.engine.redline,
  };
}

/** Left edge of a shift chip: right of the cursor line, or left of it when that overflows. */
export function chipX(cursorX, width, edge = 1096) {
  const right = cursorX + 13;
  return right + width <= edge ? right : cursorX - 13 - width;
}

export function render(svg, car, state, hover = null) {
  clear(svg);
  const l = layout(car, state);
  const L = 132, R = 1012, T = 76, step = 44;
  const xs = v => L + (v / l.vmax) * (R - L);
  const bottom = T + l.bars.length * step;
  svg.setAttribute('viewBox', `0 0 1100 ${bottom + 60}`);

  const hot = hover ? hover.gear : -1;

  for (let v = 0; v <= l.vmax; v += 20) {
    el(svg, 'line', { x1: xs(v), x2: xs(v), y1: T - 6, y2: bottom,
                      stroke: C.muted, 'stroke-opacity': 0.16 });
    if (v % 40 === 0) text(svg, xs(v), bottom + 19, v, 'axis',
                           { 'text-anchor': 'middle' });
  }

  l.bars.forEach((bar, i) => {
    const y = T + i * step + step / 2;
    const on = i === hot;
    el(svg, 'line', { x1: xs(bar.from), x2: xs(bar.to), y1: y, y2: y,
                      stroke: C.data, 'stroke-width': on ? 11 : 8,
                      'stroke-opacity': on ? 0.95 : 0.45, 'stroke-linecap': 'round' });
    text(svg, L - 16, y + 4, 'Gear ' + (i + 1), 'rowlbl',
         { 'text-anchor': 'end', 'fill-opacity': on ? 1 : 0.7,
           'font-weight': on ? '600' : '400' });
    text(svg, xs(bar.to) + 12, y + 3.6, bar.to.toFixed(0), 'val',
         { 'fill-opacity': on ? 1 : 0.6 });
  });

  text(svg, 16, T - 44, car.gear_sets[state.set].label, 'lbl', { fill: C.accentText });

  if (hover) {
    const r = shiftReadout(car, state, hover.gear, hover.speed);
    const speed = r.speed;
    el(svg, 'line', { x1: xs(speed), x2: xs(speed), y1: T - 34, y2: bottom,
                      stroke: C.ink, 'stroke-width': 1.3, 'stroke-opacity': 0.7,
                      'stroke-dasharray': '3 3' });
    // the readout sits above the plot, so it covers no bar
    const label = `${speed.toFixed(0)} km/h   ·   gear ${r.gear + 1}`
                + `   ·   ${r.rpm.toFixed(0)} rpm`;
    const w = label.length * 6.4 + 24;
    const x = Math.min(Math.max(xs(speed) - w / 2, 4), 1096 - w);
    el(svg, 'rect', { x, y: T - 62, width: w, height: 25, rx: 3, fill: C.tipBg });
    text(svg, x + w / 2, T - 44.5, label, 'val',
         { 'text-anchor': 'middle', fill: C.tipFg, 'font-weight': '600' });
    el(svg, 'circle', { cx: xs(speed), cy: T + r.gear * step + step / 2, r: 5,
                        fill: C.ink, stroke: C.halo, 'stroke-width': 1.7 });

    const chip = (target, arrow, warn) => {
      const y = T + target.gear * step + step / 2;
      const t = `${arrow} ${target.rpm.toFixed(0)} rpm`
              + (warn ? '   over limit' : '');
      const cw = t.length * 6.4 + 18;
      el(svg, 'circle', { cx: xs(speed), cy: y, r: 4.4,
                          fill: warn ? C.warn : C.ink, stroke: warn ? C.warnRing : C.halo,
                          'stroke-width': 1.6 });
      const cx = chipX(xs(speed), cw);
      el(svg, 'rect', { x: cx, y: y - 10.5, width: cw, height: 21,
                        rx: 2, fill: warn ? C.warn : C.tipBg,
                        stroke: warn ? C.warnEdge : 'none', 'stroke-width': 1.2 });
      text(svg, cx + cw / 2, y + 3.8, t, 'val',
           { 'text-anchor': 'middle', fill: warn ? C.onWarn : C.tipFg, 'font-weight': '600' });
    };
    if (r.up) chip(r.up, '↑ upshift', false);
    if (r.down) chip(r.down, '↓ downshift', r.overRev);
  }

  text(svg, (L + R) / 2, bottom + 43, 'road speed — km/h', 'lbl',
       { 'text-anchor': 'middle' });
  return {
    xToSpeed: x => Math.max(0, Math.min(l.vmax, (x - L) / (R - L) * l.vmax)),
    yToGear: y => Math.max(0, Math.min(l.bars.length - 1, Math.floor((y - T) / step))),
  };
}
