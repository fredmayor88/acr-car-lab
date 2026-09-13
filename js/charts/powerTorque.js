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
export function drawCeilingMarker(svg, x, T, B) {
  el(svg, 'line', { x1: x, x2: x, y1: T, y2: B, stroke: C.muted, 'stroke-opacity': 0.9,
                    'stroke-width': 1.2, 'stroke-dasharray': '2 3' });
  text(svg, x - 7, B - 8, 'rev ceiling', 'lbl', { 'text-anchor': 'end' });
}

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

/** The hover readout: both values, and how much of the peak you are giving up. */
export function readout(car, rpm) {
  const l = layout(car);
  const point = l.points.reduce((best, r) =>
    Math.abs(r[0] - rpm) < Math.abs(best[0] - rpm) ? r : best);
  return {
    rpm: point[0],
    nm: point[1],
    kw: point[2],
    nmPct: Math.round(point[1] / l.peakTorque.nm * 100),
    kwPct: Math.round(point[2] / l.peakPower.kw * 100),
  };
}

export function render(svg, car, hoverRpm = null, ceil = car.engine.redline) {
  clear(svg);
  svg.setAttribute('viewBox', '0 0 1100 340');
  const l = layout(car, ceil);
  const L = 64, R = 1030, T = 46, B = 292;
  const rpmMax = Math.ceil(l.redline / 1000) * 1000 + 250;
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
  text(svg, xs(l.redline) - 7, T + 12, 'rev limit', 'lbl', { 'text-anchor': 'end' });
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
    text(svg, x, y - 12, label, 'val',
         { 'text-anchor': 'middle', fill: textColour, 'font-weight': '600' });
  };
  mark(xs(l.peakTorque.rpm), yt(l.peakTorque.nm),
       `${l.peakTorque.nm.toFixed(0)} Nm  ·  ${l.peakTorque.rpm} rpm`, C.data, C.data);
  mark(xs(l.peakPower.rpm), yp(l.peakPower.kw),
       `${l.peakPower.kw.toFixed(0)} kW  ·  ${l.peakPower.rpm} rpm`, C.accent, C.accentText);

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
    // checked against all 17 cars in data/, including the two closest-margin curves
    // (Citroen Xsara WRC, Audi Quattro Gr4 — both turbo, both torque-heavy low down):
    // the tooltip box's y-range never reaches the curve's y at the rpm the box's
    // x-range spans. See task-6-report.md for the per-car numbers.
    tip(svg, L + 16, T + 6, [
      `${r.rpm} rpm`,
      `${r.nm.toFixed(0)} Nm    ${r.nmPct}% of peak`,
      `${r.kw.toFixed(0)} kW    ${r.kwPct}% of peak`,
    ]);
  }

  // rpm under the cursor, for the caller to feed back in as hoverRpm
  return { xToRpm: x => Math.max(0, Math.min(rpmMax, (x - L) / (R - L) * rpmMax)),
           plot: { L, R, T, B } };
}
