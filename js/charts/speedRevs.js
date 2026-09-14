// Chart 5 — speed against revs, one line per gear of the gear set selected in the control
// bar (state.set). drawnSets is the list the chart draws; it holds that one set.
//
// fdValue(car, state, si) is called per set inside the loop, not hoisted once outside it.
// Every gear set carries its own primary, and on four cars (Mini, Fiat 124, Fiat 131,
// Fulvia) that primary differs between sets — hoisting fdValue(car, state) (which resolves
// to state.set's ratio) and reusing it for every drawn set would publish speeds up to 26%
// wrong on any set other than the selected one. This exact bug already shipped once in this
// project's PNG charts (see js/charts/ladder.js).

import { SET_COLOURS, ceilingOf, circumference, kmh } from '../gearing.js';
import { fdValue } from './ladder.js';
import { ceilingMarker, drawCeilingMarker, revLimitLabel } from './powerTorque.js';
import { C, el, text, tip, tipWidth, clear } from '../svg.js';

/** Plot frame in viewBox units. The km/h title sits above the plot, clear of the ticks. */
export const FRAME = Object.freeze({ L: 64, R: 876, T: 38, B: 346, H: 416, titleY: 20 });

const MIN_WIDTH = 940;
const COLUMN_STEP = 26;
const LABEL_ROOM = 22;          // widest gear number plus a margin
const LABEL_WIDTH = 14;         // a two-character gear number at 10.5px monospace
const LINE_CLEAR = 4;           // space kept either side of a line a number must not touch

/**
 * One gear-number column per drawn set, right of where the lines end (the rev limit, or the
 * ceiling when it is lower). The viewBox widens to fit them rather than letting the last
 * columns run off the edge. `avoidX` is a vertical line the numbers must not sit on (the rev
 * limit, when the lines stop short of it at a ceiling): a column that would touch it moves
 * just past it, and the columns after it keep their spacing from there.
 */
export function labelColumns(endX, count, avoidX = null) {
  const xs = [];
  let x = endX + 11;
  for (let i = 0; i < count; i++) {
    if (avoidX !== null && x + LABEL_WIDTH + LINE_CLEAR >= avoidX && x <= avoidX + LINE_CLEAR) {
      x = avoidX + LINE_CLEAR + 1;
    }
    xs.push(x);
    x += COLUMN_STEP;
  }
  return { xs, width: Math.max(MIN_WIDTH, Math.ceil(xs[count - 1] + LABEL_ROOM)) };
}

/** Top of a hover tooltip drawn above its point, held inside the viewBox. */
export const tipTop = pointY => Math.max(4, pointY - 46);

/** The rpm a hover reads: never below zero, never past the ceiling the lines end at. */
export const hoverRpm = (rpm, ceil) => Math.max(0, Math.min(ceil, rpm));

/** The gear sets the chart draws: the selected one. */
export const drawnSets = state => [state.set];

export function layout(car, state) {
  const ceil = ceilingOf(car, state);
  const circ = circumference(car.tyres[state.surface].free_radius, state.k);
  const lines = [];
  for (const si of drawnSets(state)) {
    const fd = fdValue(car, state, si);
    car.gear_sets[si].gears.forEach((g, gi) => {
      const total = g.value * fd;
      lines.push({ set: si, gear: gi, total,
                   topSpeed: kmh(ceil, total, circ) });
    });
  }
  return { lines, circ, ceil, vmax: Math.max(...lines.map(l => l.topSpeed)) * 1.06 };
}

/**
 * The drawn line closest to a point. Every line runs straight from the origin to its top
 * speed at `ceil` (the rev limit unless lowered), so the speed it shows at any rpm is a simple proportion — no
 * need for the circumference here.
 */
export function nearestLine(lines, ceil, rpm, speed) {
  let best = null;
  let bestDistance = Infinity;
  for (const line of lines) {
    const distance = Math.abs(line.topSpeed * (rpm / ceil) - speed);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = line;
    }
  }
  return best;
}

/** `colours` is the gear-set list for the theme showing; app.js picks it. */
export function render(svg, car, state, hover = null, colours = SET_COLOURS) {
  clear(svg);
  const l = layout(car, state);
  const { L, R, T, B } = FRAME;
  const rpmMax = Math.ceil(car.engine.redline / 1000) * 1000 + 300;
  const xs = r => L + (r / rpmMax) * (R - L);
  const ys = v => B - (v / l.vmax) * (B - T);
  const marker = ceilingMarker(car.engine.redline, l.ceil);
  const sets = drawnSets(state);
  const cols = labelColumns(xs(l.ceil), sets.length,
                            marker ? xs(car.engine.redline) : null);
  svg.setAttribute('viewBox', `0 0 ${cols.width} ${FRAME.H}`);

  for (let v = 0; v <= l.vmax; v += 40) {
    el(svg, 'line', { x1: L, x2: R, y1: ys(v), y2: ys(v),
                      stroke: C.muted, 'stroke-opacity': 0.16 });
    text(svg, L - 9, ys(v) + 3.5, v, 'axis', { 'text-anchor': 'end' });
  }
  for (let r = 0; r <= rpmMax; r += 1000) {
    text(svg, xs(r), B + 18, r / 1000 + 'k', 'axis', { 'text-anchor': 'middle' });
  }
  el(svg, 'line', { x1: xs(car.engine.redline), x2: xs(car.engine.redline), y1: T, y2: B,
                    stroke: C.fg, 'stroke-opacity': 0.5, 'stroke-width': 1.2,
                    'stroke-dasharray': '4 4' });
  const limitAt = revLimitLabel(xs(car.engine.redline), T, B, Boolean(marker));
  text(svg, limitAt.x, limitAt.y, 'rev limit', 'lbl', { 'text-anchor': limitAt.anchor });
  if (marker) drawCeilingMarker(svg, xs(marker.rpm), T, B);

  l.lines.forEach(line => {
    const colour = colours[line.set % colours.length];
    el(svg, 'line', { x1: xs(0), x2: xs(l.ceil), y1: ys(0),
                      y2: ys(line.topSpeed), stroke: colour, 'stroke-width': 2.1,
                      'stroke-opacity': 0.85 });
    // one label column per gear set, so two sets never collide
    text(svg, cols.xs[sets.indexOf(line.set)],
         ys(line.topSpeed) + 3.6, line.gear + 1, 'val', { fill: colour });
  });

  if (hover) {
    const line = l.lines.find(x => x.set === hover.set && x.gear === hover.gear);
    if (line) {
      const v = kmh(hover.rpm, line.total, l.circ);
      const colour = colours[line.set % colours.length];
      el(svg, 'circle', { cx: xs(hover.rpm), cy: ys(v), r: 5, fill: colour,
                          stroke: C.halo, 'stroke-width': 1.7 });
      const lines = [`${car.gear_sets[line.set].label}  ·  gear ${line.gear + 1}`,
                     `${hover.rpm.toFixed(0)} rpm    ${v.toFixed(0)} km/h`];
      // tooltip sits left of the point by default, but that runs off the viewBox's
      // left edge at low rpm — flip it to the right of the point instead when it would.
      const leftX = xs(hover.rpm) - tipWidth(lines) - 13;
      const tipX = leftX < 4 ? xs(hover.rpm) + 13 : leftX;
      tip(svg, tipX, tipTop(ys(v)), lines);
    }
  }

  text(svg, (L + R) / 2, B + 42, 'engine speed — rpm', 'lbl',
       { 'text-anchor': 'middle' });
  text(svg, L - 9, FRAME.titleY, 'km/h', 'lbl', { 'text-anchor': 'end' });
  return {
    atPoint(x, y) {
      const rpm = hoverRpm((x - L) / (R - L) * rpmMax, l.ceil);
      const speed = Math.max(0, (B - y) / (B - T) * l.vmax);
      const line = nearestLine(l.lines, l.ceil, rpm, speed);
      return line ? { set: line.set, gear: line.gear, rpm } : null;
    },
  };
}
