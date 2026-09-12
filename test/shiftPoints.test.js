import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipX, layout, shiftReadout } from '../js/charts/shiftPoints.js';

// Stratos-shape: final_drive.primaries non-empty, each gear set also carries its own
// primary (unused here since the combo's primary replaces it) — same fixture shape as
// test/ladder.test.js, so the pinned numbers (first gear tops out at 89 km/h) hold.
const car = {
  slug: 'test-stratos',
  engine: { redline: 8750 },
  gear_sets: [
    { label: 'Gear set 1', primary: { name: 'p', value: 1.1 },
      gears: [2.8, 2.053, 1.619, 1.32, 1.154].map(v => ({ name: '', value: v })) },
    { label: 'Gear set 2', primary: { name: 'p', value: 1.1 },
      gears: [3.143, 2.235, 1.762, 1.417, 1.154].map(v => ({ name: '', value: v })) },
  ],
  final_drive: {
    adjustment: 'Differential Ratio Rear',
    primaries: [{ name: 'p', value: 1.1 }],
    options: [{ name: 'o', value: 3.4211 }],
    stock_option: 'o', rest: 1.0,
  },
  fixed_final_drive: null,
  tyres: { Tarmac_Dry: { asset: 'PirelliT03', free_radius: 0.296 } },
  defaults: { loaded_radius_factor: 0.9562 },
};
const state = { surface: 'Tarmac_Dry', fd: 0, set: 0, draw: [0], k: 0.9562 };

test('only the selected gear set is drawn', () => {
  assert.equal(layout(car, state).bars.length, 5);
  assert.equal(layout(car, { ...state, set: 1 }).bars.length, 5);
});

test('bars overlap — the same speed is reachable in more than one gear', () => {
  const bars = layout(car, state).bars;
  // third gear's band starts before second gear's band ends
  assert.ok(bars[2].from < bars[1].to,
    'bars must overlap; a tiled staircase hides the choice of gear');
});

test('every bar ends at its top speed and starts at the rev floor', () => {
  const bars = layout(car, state).bars;
  assert.equal(Math.round(bars[0].to), 89);
  assert.ok(bars[0].from > 0);
  assert.ok(bars[0].from < bars[0].to);
});

test('the readout reports the gear it was asked about', () => {
  assert.equal(shiftReadout(car, state, 2, 132).gear, 2);
  assert.equal(shiftReadout(car, state, 3, 132).gear, 3);
});

test('an upshift always drops the revs', () => {
  const r = shiftReadout(car, state, 2, 132);
  assert.ok(r.up.rpm < r.rpm);
  assert.equal(r.up.gear, 3);
});

test('a downshift from third at 132 km/h over-revs this engine', () => {
  const r = shiftReadout(car, state, 2, 132);
  assert.equal(r.down.gear, 1);
  assert.ok(r.down.rpm > car.engine.redline);
  assert.equal(r.overRev, true);
});

test('a downshift inside the limit is not flagged', () => {
  // fourth gear at 132 km/h: dropping to third stays under the limiter
  const r = shiftReadout(car, state, 3, 132);
  assert.ok(r.down.rpm <= car.engine.redline);
  assert.equal(r.overRev, false);
});

test('over-rev is not the normal case, or the warning colour means nothing', () => {
  const flagged = [1, 2, 3, 4].map(g => shiftReadout(car, state, g, 132).overRev);
  assert.ok(flagged.includes(false),
    'inferring the gear rather than taking it makes every downshift over-rev');
});

test('first gear has no downshift and top gear has no upshift', () => {
  assert.equal(shiftReadout(car, state, 0, 40).down, null);
  assert.equal(shiftReadout(car, state, 4, 210).up, null);
});

// Mini-shape: final_drive.primaries is EMPTY, so each set carries its own primary
// (1.0 vs 1.3, identical gears otherwise). Regression guard for the bug where one set's
// primary leaked onto every set: switching state.set must move every bar's top speed by
// exactly the ratio between the two primaries (1.3 / 1.0).
const emptyPrimaryCar = {
  slug: 'test-mini',
  engine: { redline: 6000 },
  gear_sets: [
    { label: 'Set A', primary: { name: 'pa', value: 1.0 },
      gears: [3.0, 2.0, 1.5, 1.1].map(v => ({ name: '', value: v })) },
    { label: 'Set B', primary: { name: 'pb', value: 1.3 },
      gears: [3.0, 2.0, 1.5, 1.1].map(v => ({ name: '', value: v })) },
  ],
  final_drive: {
    adjustment: 'Differential Ratio Front',
    primaries: [],
    options: [{ name: 'o', value: 4.0 }],
    stock_option: 'o', rest: 1.0,
  },
  fixed_final_drive: null,
  tyres: { Tarmac_Dry: { asset: 'x', free_radius: 0.3 } },
  defaults: { loaded_radius_factor: 0.95 },
};
const emptyState = { surface: 'Tarmac_Dry', fd: 0, set: 0, draw: [0], k: 0.95 };

test('switching sets with different primaries scales every bar top by that ratio ' +
     '(regression guard: one set\'s primary leaking onto every set)', () => {
  const setA = layout(emptyPrimaryCar, emptyState).bars;
  const setB = layout(emptyPrimaryCar, { ...emptyState, set: 1 }).bars;
  const ratio = 1.3 / 1.0;
  setA.forEach((bar, i) => {
    assert.ok(Math.abs(setA[i].to / setB[i].to - ratio) < 1e-9,
      `gear ${i} top speed should scale by the primary ratio between sets`);
  });
});

// Shape 3 — cars with no adjustable final drive (i20, Fabia, Polo R5, 208 Rally4) carry
// final_drive: null and a numeric fixed_final_drive instead.
test('a fixed-final-drive car (final_drive null) still lays out to finite, positive bars', () => {
  const fixed = { ...car, final_drive: null, fixed_final_drive: 3.76321 };
  const bars = layout(fixed, state).bars;
  assert.equal(bars.length, 5);
  bars.forEach(bar => {
    assert.ok(Number.isFinite(bar.from) && bar.from > 0);
    assert.ok(Number.isFinite(bar.to) && bar.to > 0);
  });
});

// --- the readout never describes a state the gear cannot reach ------------------------

test('hovering past the end of a gear\'s bar clamps to the rev limit, not beyond', () => {
  const bars = layout(car, state).bars;
  const r = shiftReadout(car, state, 0, 300);
  assert.ok(Math.abs(r.speed - bars[0].to) < 1e-9);
  assert.ok(Math.abs(r.rpm - car.engine.redline) < 1e-6);
});

test('hovering before the start of a gear\'s bar clamps to the rev floor', () => {
  const bars = layout(car, state).bars;
  const r = shiftReadout(car, state, 4, 10);
  assert.ok(Math.abs(r.speed - bars[4].from) < 1e-9);
});

// --- the shift chips stay inside the 1100-wide viewBox ---------------------------------

test('a chip sits right of the cursor line when it fits', () => {
  assert.equal(chipX(500, 200), 513);
});

test('a chip that would overflow the right edge flips to the left of the cursor line', () => {
  const cw = '↓ downshift 9311 rpm   over limit'.length * 6.4 + 18;
  const x = chipX(990, cw);
  assert.ok(x + cw <= 1096, 'chip must end inside the viewBox');
  assert.ok(x + cw <= 990, 'chip must not cover the cursor line or its marker');
});
