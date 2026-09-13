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

test('readout snaps to the nearest sampled rpm rather than inventing a point', () => {
  assert.equal(readout(car, 5900).rpm, 6000);
  assert.equal(readout(car, 3100).rpm, 3000);
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
  assert.deepEqual(readout(car, 5000), readout(car, 5000));
});
