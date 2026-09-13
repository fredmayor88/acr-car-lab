import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, readout } from '../js/charts/powerTorque.js';

const car = {
  engine: {
    redline: 8750,
    peak_torque_rpm: 6000,
    peak_power_rpm: 7750,
    curve: [[3000, 198, 198 * 3000 / 9549], [5000, 248, 248 * 5000 / 9549],
            [6000, 260, 260 * 6000 / 9549], [7750, 240, 240 * 7750 / 9549],
            [8750, 192, 192 * 8750 / 9549]],
  },
};

test('layout carries the peaks as values, not labels', () => {
  const l = layout(car);
  assert.equal(l.peakTorque.rpm, 6000);
  assert.equal(l.peakTorque.nm, 260);
  assert.equal(l.peakPower.rpm, 7750);
  assert.equal(Math.round(l.peakPower.kw), 195);
});

test('layout exposes the redline', () => {
  assert.equal(layout(car).redline, 8750);
});

test('readout gives both values as a percentage of peak', () => {
  const r = readout(car, 5000);
  assert.equal(r.nm, 248);
  assert.equal(r.nmPct, Math.round(248 / 260 * 100));
  assert.equal(r.kwPct, Math.round((248 * 5000 / 9549) / (240 * 7750 / 9549) * 100));
});

test('readout is continuous: it reads the pointer rpm, not the nearest sampled one', () => {
  assert.equal(readout(car, 5900).rpm, 5900);
  assert.equal(readout(car, 3100).rpm, 3100);
  assert.notEqual(readout(car, 5010).nm, readout(car, 5020).nm);
});

test('halfway between two curve points reads the average of both values', async () => {
  const { curveAt } = await import('../js/charts/powerTorque.js');
  const mid = curveAt(car.engine.curve, 5500);
  assert.equal(mid.rpm, 5500);
  assert.ok(Math.abs(mid.nm - (248 + 260) / 2) < 1e-9);
  assert.ok(Math.abs(mid.kw - (248 * 5000 / 9549 + 260 * 6000 / 9549) / 2) < 1e-9);
  // a quarter of the way is a quarter of the difference
  assert.ok(Math.abs(curveAt(car.engine.curve, 5250).nm - 251) < 1e-9);
});

test('exact curve points read the stored values', async () => {
  const { curveAt } = await import('../js/charts/powerTorque.js');
  for (const [rpm, nm, kw] of car.engine.curve) {
    assert.deepEqual(curveAt(car.engine.curve, rpm), { rpm, nm, kw });
  }
});

test('the readout is held to the curve extent at both ends', async () => {
  const { curveAt } = await import('../js/charts/powerTorque.js');
  assert.deepEqual(curveAt(car.engine.curve, 0), { rpm: 3000, nm: 198, kw: 198 * 3000 / 9549 });
  assert.deepEqual(curveAt(car.engine.curve, 9250),
    { rpm: 8750, nm: 192, kw: 192 * 8750 / 9549 });
});

test('percentages follow the interpolated values', () => {
  const r = readout(car, 5500);
  assert.equal(r.nmPct, Math.round(254 / 260 * 100));
  assert.equal(r.kwPct, Math.round(r.kw / (240 * 7750 / 9549) * 100));
});

test('the tooltip text rounds rpm, Nm and kW to whole numbers, as the other charts do', async () => {
  const { readoutLines } = await import('../js/charts/powerTorque.js');
  const lines = readoutLines(readout(car, 5512.7));
  assert.equal(lines[0], '5513 rpm');
  assert.match(lines[1], /^\d+ Nm {4}\d+% of peak$/);
  assert.match(lines[2], /^\d+ kW {4}\d+% of peak$/);
  assert.equal(lines[1], `${(248 + 0.5127 * 12).toFixed(0)} Nm    98% of peak`);
});

test('at peak torque the torque percentage is exactly 100', () => {
  assert.equal(readout(car, 6000).nmPct, 100);
});

test('at peak power the power percentage is exactly 100', () => {
  assert.equal(readout(car, 7750).kwPct, 100);
});

// --- the page-wide rev ceiling ----------------------------------------------------------

test('no ceiling marker at the rev limit, or with no ceiling given', async () => {
  const { ceilingMarker } = await import('../js/charts/powerTorque.js');
  assert.equal(ceilingMarker(8750, 8750), null);
  assert.equal(ceilingMarker(8750, undefined), null);
  assert.equal(layout(car).ceilMarker, null);
  assert.equal(layout(car, 8750).ceilMarker, null);
});

test('a lowered ceiling gets a marker at its rpm, and the curves do not change', async () => {
  const { ceilingMarker } = await import('../js/charts/powerTorque.js');
  assert.deepEqual(ceilingMarker(8750, 7000), { rpm: 7000, label: 'rev ceiling' });
  const low = layout(car, 7000);
  assert.deepEqual(low.ceilMarker, { rpm: 7000, label: 'rev ceiling' });
  assert.deepEqual(low.points, layout(car).points);
  assert.equal(low.redline, 8750);
  const { ceilMarker: _a, ...lowRest } = low;
  const { ceilMarker: _b, ...fullRest } = layout(car);
  assert.deepEqual(lowRest, fullRest, 'peaks, maxima and the redline are untouched');
});

test('revLimitLabel: over the top left of its line alone, bottom right of it beside a ceiling', async () => {
  const { revLimitLabel } = await import('../js/charts/powerTorque.js');
  assert.deepEqual(revLimitLabel(800, 46, 292, false), { x: 793, y: 58, anchor: 'end' });
  // with a ceiling marker, the ceiling label takes bottom left of its own line, so the rev
  // limit label goes bottom right of the rev limit line, where no line or curve reaches
  assert.deepEqual(revLimitLabel(800, 46, 292, true), { x: 807, y: 284, anchor: 'start' });
});

// --- rev limit and curve end ------------------------------------------------------------

test('the axis runs to the end of the curve when the rev limit is short of it', async () => {
  const { rpmAxisMax } = await import('../js/charts/powerTorque.js');
  assert.equal(rpmAxisMax(car), 9250);
  const measured = { engine: { ...car.engine, redline: 8450 } };
  assert.equal(rpmAxisMax(measured), 9250, 'the curve still ends at 8750');
  const raised = { engine: { ...car.engine, redline: 9600 } };
  assert.equal(rpmAxisMax(raised), 10250);
});

test('the rev limit marker sits at the rev limit, not the curve end', () => {
  const measured = { engine: { ...car.engine, redline: 8450 } };
  const l = layout(measured);
  assert.equal(l.redline, 8450);
  assert.equal(l.points[l.points.length - 1][0], 8750);
});

test('a borrowed curve gets a caption line naming its owner without the year', async () => {
  const { borrowedCurveNote } = await import('../js/charts/powerTorque.js');
  const p206 = { slug: 'peugeot-206-wrc-1999', engine: { curve_source: 'CitroenXsaraWRC',
    curve_from: { slug: 'citroen-xsara-wrc-2003', name: 'Citroen Xsara WRC 2003' } } };
  assert.equal(borrowedCurveNote(p206),
    'This car uses the Citroen Xsara WRC engine curve in the game files.');
  assert.equal(borrowedCurveNote({ slug: 'x', engine: { curve_from: null } }), '');
  assert.equal(borrowedCurveNote({ slug: 'x', engine: {} }), '');
});

test('revLimitLabel: a crowded label takes the bottom right of its line, like a lowered one', async () => {
  const { revLimitLabel } = await import('../js/charts/powerTorque.js');
  assert.deepEqual(revLimitLabel(800, 46, 292, false, true), { x: 807, y: 284, anchor: 'start' });
  assert.deepEqual(revLimitLabel(800, 46, 292, false, false), revLimitLabel(800, 46, 292, false));
});

test('boxesOverlap: touching within the padding counts, clear boxes do not', async () => {
  const { boxesOverlap } = await import('../js/charts/powerTorque.js');
  const a = { x: 0, y: 0, width: 10, height: 10 };
  assert.equal(boxesOverlap(a, { x: 5, y: 5, width: 10, height: 10 }), true);
  assert.equal(boxesOverlap(a, { x: 12, y: 0, width: 10, height: 10 }), false);
  assert.equal(boxesOverlap(a, { x: 12, y: 0, width: 10, height: 10 }, 4), true);
  assert.equal(boxesOverlap(a, { x: 0, y: 20, width: 10, height: 10 }, 4), false);
});
