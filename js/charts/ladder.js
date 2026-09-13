// Chart 3 — where each gear tops out, one lane per gear set, every set drawn.
// Ported from chart_gear_ladder in make_gearing_chart.py, which is already the right
// answer for a car like the 306 Maxi with ten sets of differing gear counts.
//
// fdValue() takes an explicit setIndex (defaulting to the selected set) because every
// lane must use its OWN gear set's overall ratio, not the selected set's. Every gear set
// carries its own primary, and on four cars (Mini, Fiat 124, Fiat 131, Fulvia) that
// primary differs between sets, so folding in the selected set's ratio for every lane
// published speeds up to 26% wrong on the other lanes. Only the Stratos's selectable primary
// (final_drive.primaries non-empty) replaces every lane's primary uniformly — see
// overallRatio / effectivePrimary in js/gearing.js.

import { ceilingOf, circumference, finalDriveCombos, gearAtSpeed, gearTops, overallRatio, rpmAt }
  from '../gearing.js';
import { C, el, text, tip, tipWidth, clear } from '../svg.js';

/**
 * The overall ratio below the individual gear, for one gear set (default: the selected
 * one). Reused as-is by charts 4 and 5 (Tasks 9/10), which call fdValue(car, state) and
 * get the selected set's ratio.
 */
export function fdValue(car, state, setIndex = state.set) {
  const combos = finalDriveCombos(car.final_drive);
  return overallRatio(car, setIndex, combos[state.fd] ?? combos[0] ?? null);
}

const circOf = (car, state) =>
  circumference(car.tyres[state.surface].free_radius, state.k);

export function layout(car, state) {
  const circ = circOf(car, state);
  const lanes = car.gear_sets.map((set, i) => ({
    label: `${set.label}   (${set.gears.length}-speed)`,
    tops: gearTops(set.gears, fdValue(car, state, i), circ, ceilingOf(car, state)),
    selected: i === state.set,
  }));
  const all = lanes.flatMap(l => l.tops);
  return { lanes, base: Math.min(...all), vmax: Math.max(...all) * 1.05 };
}

/** The x axis title: the rev limit, or the ceiling the tops are read at when it is lower. */
export function axisTitle(car, state) {
  const ceil = ceilingOf(car, state);
  return ceil === car.engine.redline
    ? `speed at the ${ceil} rpm rev limit — km/h`
    : `speed at the ${ceil} rpm rev ceiling — km/h`;
}

/** A hovered speed, held inside its lane: a standing start up to that lane's top gear. */
export function clampSpeed(l, laneIndex, speed) {
  const tops = l.lanes[laneIndex].tops;
  return Math.min(Math.max(speed, 0), tops[tops.length - 1]);
}

/** Speed, gear, revs. One line. Uses the hovered lane's own ratio, not the selected set's. */
export function hoverLine(car, state, laneIndex, speed) {
  const l = layout(car, state);
  speed = clampSpeed(l, laneIndex, speed);
  const tops = l.lanes[laneIndex].tops;
  const gear = gearAtSpeed(tops, speed);
  const total = car.gear_sets[laneIndex].gears[gear].value * fdValue(car, state, laneIndex);
  const rpm = rpmAt(speed, total, circOf(car, state));
  return `${speed.toFixed(0)} km/h  ·  gear ${gear + 1}  ·  ${rpm.toFixed(0)} rpm`;
}

// viewBox geometry: plot left and right edges, top of the first lane, lane height
const L = 214, R = 1020, T = 56, step = 62;

/**
 * The tap target for lane i's name: the whole label column over the full height of the
 * lane, stopping short of the plot. The name itself is 11 viewBox units tall, which a
 * 400px-wide screen scales to about 5px, far too small for a finger.
 */
export const laneNameHit = i => ({ x: 0, y: T + i * step, width: L - 8, height: step });

const inside = (p, b) =>
  p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;

/**
 * The lane a click at p (viewBox units) picks, or null. A coarse pointer (a finger) picks
 * anywhere in the lane's name column, laneNameHit(i). A fine one (mouse, trackpad) picks
 * only on the name itself: nameBox(i) is that name's box, as the browser measures it.
 * Clicks are read off the chart's <svg>, which is never redrawn, so a redraw between a
 * finger going down and its click cannot lose the tap.
 */
export function laneAtPoint(p, count, { coarse, nameBox }) {
  const i = Math.floor((p.y - T) / step);
  if (!(i >= 0 && i < count)) return null;
  const box = coarse ? laneNameHit(i) : nameBox?.(i);
  return box && inside(p, box) ? i : null;
}

export function render(svg, car, state, hover = null) {
  clear(svg);
  const l = layout(car, state);
  const xs = v => L + (v / l.vmax) * (R - L);
  const bottom = T + l.lanes.length * step;
  svg.setAttribute('viewBox', `0 0 1100 ${bottom + 60}`);

  for (let p = 0; p <= Math.floor(l.vmax / l.base * 100); p += 50) {
    const v = p * l.base / 100;
    if (v > l.vmax) break;
    el(svg, 'line', { x1: xs(v), x2: xs(v), y1: T - 10, y2: bottom,
                      stroke: C.muted, 'stroke-opacity': 0.16 });
    text(svg, xs(v), T - 20, p + '%', 'axis', { 'text-anchor': 'middle' });
  }
  text(svg, (L + R) / 2, T - 38, 'relative to the slowest gear', 'lbl',
       { 'text-anchor': 'middle' });
  for (let v = 0; v <= l.vmax; v += 50) {
    text(svg, xs(v), bottom + 19, v, 'axis', { 'text-anchor': 'middle' });
  }

  l.lanes.forEach((lane, i) => {
    const y = T + i * step + step / 2;
    if (lane.selected) {
      el(svg, 'rect', { x: 16, y: y - 23, width: R - 6, height: 46, rx: 2,
                        fill: C.accent, 'fill-opacity': 0.06 });
    }
    // starts at a standing start, so first gear reads as a span like every other gear
    el(svg, 'line', { x1: xs(0), x2: xs(lane.tops[lane.tops.length - 1]), y1: y, y2: y,
                      stroke: C.muted, 'stroke-width': 1.3, 'stroke-opacity': 0.5 });
    lane.tops.forEach((v, gi) => {
      el(svg, 'circle', { cx: xs(v), cy: y, r: 9, fill: C.data, stroke: C.halo,
                          'stroke-width': 1.6 });
      text(svg, xs(v), y + 3.3, gi + 1, 'pip', { 'text-anchor': 'middle' });
      text(svg, xs(v), y - 15, v.toFixed(0), 'val', { 'text-anchor': 'middle' });
    });
    const name = text(svg, L - 22, y + 4, lane.label, 'rowlbl', {
      'text-anchor': 'end', fill: lane.selected ? C.accentText : C.fg,
      'font-weight': lane.selected ? '600' : '400',
    });
    name.setAttribute('class', 'rowlbl hit');
    if (lane.selected) {
      text(svg, L - 22, y + 19, 'selected', 'lbl',
           { 'text-anchor': 'end', fill: C.accentText });
    }
    // Invisible, and no listener of its own: the <svg> has it (see laneAtPoint). On a
    // coarse pointer app.css lets it take the pointer, so the name column reads as tappable.
    el(svg, 'rect', { ...laneNameHit(i), fill: 'transparent', class: 'lanehit' });
  });

  if (hover) {
    const { lane } = hover;
    const speed = clampSpeed(l, lane, hover.speed);
    const y = T + lane * step + step / 2;
    el(svg, 'line', { x1: xs(speed), x2: xs(speed), y1: T - 10, y2: bottom,
                      stroke: C.ink, 'stroke-width': 1.3, 'stroke-opacity': 0.7,
                      'stroke-dasharray': '3 3' });
    el(svg, 'circle', { cx: xs(speed), cy: y, r: 4.4, fill: C.ink, stroke: C.halo,
                        'stroke-width': 1.6 });
    const lines = [hoverLine(car, state, lane, speed)];
    const tops = l.lanes[lane].tops;
    // after the lane's last dot, clamped, so it stays inside its own lane
    tip(svg, Math.min(xs(tops[tops.length - 1]) + 16, 1096 - tipWidth(lines)),
        y - 14, lines);
  }

  text(svg, (L + R) / 2, bottom + 42, axisTitle(car, state), 'lbl',
       { 'text-anchor': 'middle' });
  return { laneAt: (p, how) => laneAtPoint(p, l.lanes.length, how),
           xToSpeed: x => Math.max(0, (x - L) / (R - L) * l.vmax),
           yToLane: y => Math.max(0, Math.min(l.lanes.length - 1,
                                              Math.floor((y - T) / step))) };
}
