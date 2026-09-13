// Chart 1 — power and torque. The curves never change with the controls; the only thing
// that does is a dashed rev ceiling marker, drawn when the ceiling is below the rev limit.
// The peaks are annotated with their values rather than the words "peak torque" and
// "peak power": where they sit on the curve already says which is which.

import { C, el, text, tip, clear } from '../svg.js';

/** The rev ceiling marker, or null when the ceiling is the rev limit (or not given). */
export const ceilingMarker = (redline, ceil) =>
  ceil != null && ceil < redline ? { rpm: ceil, label: 'rev ceiling' } : null;

/**
 * The dashed ceiling line, and its label low down on the plot: every curve that reaches the
 * ceiling is high up there, and the rev limit's own label takes the top.
 */
/**
 * Where the "rev limit" label goes. Alone it sits over the top left of its line, as it always
 * has. Beside a lowered ceiling the two lines can be a few rpm apart, and the ceiling line
 * would cut the label, so it drops to the bottom right of its own line: the ceiling's label is
 * bottom left of the ceiling line, and the curves are high up past the rev limit. `crowded`
 * does the same when a peak's value label sits where the label would: with the limit inside
 * the curve, peak power can be a few hundred rpm either side of it.
 */
export const revLimitLabel = (x, T, B, lowered, crowded = false) => (lowered || crowded
  ? { x: x + 7, y: B - 8, anchor: 'start' }
  : { x: x - 7, y: T + 12, anchor: 'end' });

/** Whether two boxes ({ x, y, width, height }) overlap, with `pad` of clearance. */
export const boxesOverlap = (a, b, pad = 0) =>
  a.x < b.x + b.width + pad && b.x < a.x + a.width + pad
  && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;

export function drawCeilingMarker(svg, x, T, B) {
  el(svg, 'line', { x1: x, x2: x, y1: T, y2: B, stroke: C.muted, 'stroke-opacity': 0.9,
                    'stroke-width': 1.2, 'stroke-dasharray': '2 3' });
  text(svg, x - 7, B - 8, 'rev ceiling', 'lbl', { 'text-anchor': 'end' });
}

/**
 * The caption line for a car whose curve belongs to another car in the game files (the 206 WRC
 * runs on the Xsara WRC's), or '' for a car's own curve. The model year is left off the name.
 */
export const borrowedCurveNote = car => {
  const from = car.engine.curve_from;
  if (!from || from.slug === car.slug) return '';
  return `This car uses the ${from.name.replace(/\s+\d{4}$/, '')} engine curve in the game files.`;
};

/** The x axis reaches past both the rev limit and the end of the curve, whichever is later. */
export const rpmAxisMax = car =>
  Math.ceil(Math.max(car.engine.redline, ...car.engine.curve.map(r => r[0])) / 1000) * 1000 + 250;

export function layout(car, ceil = car.engine.redline) {
  const curve = car.engine.curve;
  const at = rpm => curve.find(r => r[0] === rpm) || curve[curve.length - 1];
  const pt = at(car.engine.peak_torque_rpm);
  const pp = at(car.engine.peak_power_rpm);
  return {
    points: curve,
    redline: car.engine.redline,
    peakTorque: { rpm: pt[0], nm: pt[1] },
    peakPower: { rpm: pp[0], kw: pp[2] },
    maxNm: Math.max(...curve.map(r => r[1])),
    maxKw: Math.max(...curve.map(r => r[2])),
    ceilMarker: ceilingMarker(car.engine.redline, ceil),
  };
}

/**
 * The curve at any rpm: torque and power interpolated linearly between the two stored points
 * either side, which is exactly the line the chart draws between them. Held to the curve's
 * own extent, so a pointer past either end reads that end.
 */
export function curveAt(points, rpm) {
  const first = points[0];
  const last = points[points.length - 1];
  if (rpm <= first[0]) return { rpm: first[0], nm: first[1], kw: first[2] };
  if (rpm >= last[0]) return { rpm: last[0], nm: last[1], kw: last[2] };
  const i = points.findIndex(p => p[0] >= rpm);
  const [r1, nm1, kw1] = points[i];
  if (r1 === rpm) return { rpm, nm: nm1, kw: kw1 };
  const [r0, nm0, kw0] = points[i - 1];
  const t = (rpm - r0) / (r1 - r0);
  return { rpm, nm: nm0 + t * (nm1 - nm0), kw: kw0 + t * (kw1 - kw0) };
}

/**
 * The hover readout at the pointer rpm: both values, and how much of the peak you are giving
 * up. Continuous, like every other chart's hover; the text rounds the way theirs does.
 */
export function readout(car, rpm) {
  const l = layout(car);
  const at = curveAt(l.points, rpm);
  return {
    ...at,
    nmPct: Math.round(at.nm / l.peakTorque.nm * 100),
    kwPct: Math.round(at.kw / l.peakPower.kw * 100),
  };
}

/** The three tooltip lines: whole rpm, Nm and kW, as the other charts' readouts show them. */
export const readoutLines = r => [
  `${r.rpm.toFixed(0)} rpm`,
  `${r.nm.toFixed(0)} Nm    ${r.nmPct}% of peak`,
  `${r.kw.toFixed(0)} kW    ${r.kwPct}% of peak`,
];

export function render(svg, car, hoverRpm = null, ceil = car.engine.redline) {
  clear(svg);
  svg.setAttribute('viewBox', '0 0 1100 340');
  const l = layout(car, ceil);
  const L = 64, R = 1030, T = 46, B = 292;
  // the curve is drawn whole, so the axis runs to its end even past the rev limit
  const rpmMax = rpmAxisMax(car);
  const nmMax = Math.ceil(l.maxNm / 70) * 70;
  const kwMax = Math.ceil(l.maxKw / 70) * 70;
  const xs = r => L + (r / rpmMax) * (R - L);
  const yt = v => B - (v / nmMax) * (B - T);
  const yp = v => B - (v / kwMax) * (B - T);

  for (let v = 0; v <= nmMax; v += 70) {
    el(svg, 'line', { x1: L, x2: R, y1: yt(v), y2: yt(v),
                      stroke: C.muted, 'stroke-opacity': 0.18 });
    text(svg, L - 9, yt(v) + 3.5, v, 'axis', { 'text-anchor': 'end' });
  }
  for (let v = 0; v <= kwMax; v += 70) {
    text(svg, R + 9, yp(v) + 3.5, v, 'axis', { fill: C.accentText });
  }
  for (let r = 0; r <= rpmMax; r += 1000) {
    text(svg, xs(r), B + 18, r / 1000 + 'k', 'axis', { 'text-anchor': 'middle' });
  }

  el(svg, 'line', { x1: xs(l.redline), x2: xs(l.redline), y1: T, y2: B,
                    stroke: C.fg, 'stroke-opacity': 0.5, 'stroke-width': 1.2,
                    'stroke-dasharray': '4 4' });
  const limitAt = revLimitLabel(xs(l.redline), T, B, Boolean(l.ceilMarker));
  const limitLabel = text(svg, limitAt.x, limitAt.y, 'rev limit', 'lbl',
                          { 'text-anchor': limitAt.anchor });
  if (l.ceilMarker) drawCeilingMarker(svg, xs(l.ceilMarker.rpm), T, B);

  let dt = '', dp = '';
  l.points.forEach(([r, nm, kw], i) => {
    dt += (i ? 'L' : 'M') + xs(r).toFixed(1) + ' ' + yt(nm).toFixed(1);
    dp += (i ? 'L' : 'M') + xs(r).toFixed(1) + ' ' + yp(kw).toFixed(1);
  });
  el(svg, 'path', { d: dp, fill: 'none', stroke: C.accent, 'stroke-width': 2.1 });
  el(svg, 'path', { d: dt, fill: 'none', stroke: C.data, 'stroke-width': 2.4 });

  const mark = (x, y, label, colour, textColour) => {
    el(svg, 'circle', { cx: x, cy: y, r: 4.6, fill: colour, stroke: C.halo,
                        'stroke-width': 1.7 });
    return text(svg, x, y - 12, label, 'val',
                { 'text-anchor': 'middle', fill: textColour, 'font-weight': '600' });
  };
  const peakLabels = [
    mark(xs(l.peakTorque.rpm), yt(l.peakTorque.nm),
         `${l.peakTorque.nm.toFixed(0)} Nm  ·  ${l.peakTorque.rpm} rpm`, C.data, C.data),
    mark(xs(l.peakPower.rpm), yp(l.peakPower.kw),
         `${l.peakPower.kw.toFixed(0)} kW  ·  ${l.peakPower.rpm} rpm`, C.accent, C.accentText),
  ];
  // measured once drawn: a peak label over the rev limit label moves the latter down
  if (!l.ceilMarker && peakLabels.some(p => boxesOverlap(p.getBBox(), limitLabel.getBBox(), 4))) {
    const moved = revLimitLabel(xs(l.redline), T, B, false, true);
    limitLabel.setAttribute('x', moved.x);
    limitLabel.setAttribute('y', moved.y);
    limitLabel.setAttribute('text-anchor', moved.anchor);
  }

  text(svg, L - 9, T - 16, 'Nm', 'lbl', { 'text-anchor': 'end', fill: C.data });
  text(svg, R + 9, T - 16, 'kW', 'lbl', { fill: C.accentText });
  text(svg, (L + R) / 2, B + 42, 'engine speed — rpm', 'lbl',
       { 'text-anchor': 'middle' });

  if (hoverRpm !== null) {
    const r = readout(car, hoverRpm);
    el(svg, 'line', { x1: xs(r.rpm), x2: xs(r.rpm), y1: T, y2: B, stroke: C.ink,
                      'stroke-opacity': 0.6, 'stroke-width': 1.2,
                      'stroke-dasharray': '3 3' });
    el(svg, 'circle', { cx: xs(r.rpm), cy: yt(r.nm), r: 4.4, fill: C.data,
                        stroke: C.halo, 'stroke-width': 1.6 });
    el(svg, 'circle', { cx: xs(r.rpm), cy: yp(r.kw), r: 4.4, fill: C.accent,
                        stroke: C.halo, 'stroke-width': 1.6 });
    // Parks top-left. Bottom-left was tried and rejected: both curves start at zero,
    // and zero is the bottom of the plot, so bottom-left is the one corner every car's
    // torque curve is guaranteed to pass through at low rpm — it hid the curve. The
    // top-left corner requires high torque at very low rpm, which no car's curve does;
    // checked against all 17 curves in data/ (the 206 WRC shares the Xsara's), including
    // the two closest-margin curves
    // (Citroen Xsara WRC, Audi Quattro Gr4 — both turbo, both torque-heavy low down):
    // the tooltip box's y-range never reaches the curve's y at the rpm the box's
    // x-range spans. See task-6-report.md for the per-car numbers. Still true with the
    // readout interpolated: the box and the curves are unchanged, and the axis now runs at
    // least to the curve end, so the box spans no more rpm than it did. Rechecked in the
    // rev-limit fix round (revlimit-report.md).
    tip(svg, L + 16, T + 6, readoutLines(r));
  }

  // rpm under the cursor, for the caller to feed back in as hoverRpm
  return { xToRpm: x => Math.max(0, Math.min(rpmMax, (x - L) / (R - L) * rpmMax)),
           plot: { L, R, T, B } };
}
