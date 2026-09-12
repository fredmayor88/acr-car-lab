import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fdValue, layout, hoverLine } from '../js/charts/ladder.js';

// Stratos-shape: final_drive.primaries non-empty, so the selected combo's primary
// REPLACES each gear set's own primary. Values line up with the game's real Stratos data
// (see data/lancia-stratos.json) so the pinned lane tops below are the game's own numbers,
// not fixture arithmetic that happens to work.
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
  tyres: { Tarmac_Dry: { asset: 'PirelliT03', free_radius: 0.296 } },
  defaults: { loaded_radius_factor: 0.9562 },
};
const state = { surface: 'Tarmac_Dry', fd: 0, set: 0, draw: [0], k: 0.9562 };

// Mini-shape: final_drive.primaries is EMPTY, so each lane must use its own gear set's
// primary. Set A and Set B differ only in primary (1.0 vs 1.3) — same gears, same final
// drive — so any lane that used the wrong primary (e.g. always set 0's, or the state's
// selected set regardless of lane) would produce equal tops for both lanes. This is the
// regression guard for the per-set-primary bug.
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
  tyres: { Tarmac_Dry: { asset: 'x', free_radius: 0.3 } },
  defaults: { loaded_radius_factor: 0.95 },
};
const emptyState = { surface: 'Tarmac_Dry', fd: 0, set: 0, draw: [0], k: 0.95 };

test('every gear set gets a lane, selected or not', () => {
  const l = layout(car, state);
  assert.equal(l.lanes.length, 2);
  assert.equal(l.lanes[0].selected, true);
  assert.equal(l.lanes[1].selected, false);
});

test('changing the selected set moves the flag but drops no lane', () => {
  const l = layout(car, { ...state, set: 1 });
  assert.equal(l.lanes.length, 2);
  assert.equal(l.lanes[1].selected, true);
});

test('lane tops match the known Stratos figures', () => {
  const tops = layout(car, state).lanes[0].tops.map(Math.round);
  assert.deepEqual(tops, [89, 121, 153, 188, 215]);
});

test('base is the slowest gear across every lane, for the relative axis', () => {
  const l = layout(car, state);
  assert.equal(Math.round(l.base), 79);   // gear set 2 first gear
});

test('a car with no adjustable final drive still lays out at its stock ratio', () => {
  // final_drive: null cars carry fixed_final_drive instead (shape 3 — i20, Fabia, Polo
  // R5, 208 Rally4). belowGearbox() throws without it, so the fixture needs a real value.
  const plain = { ...car, final_drive: null, fixed_final_drive: 3.76321 };
  assert.ok(fdValue(plain, state) > 0);
  assert.equal(layout(plain, state).lanes.length, 2);
});

test('hover gives speed, gear and revs and nothing else', () => {
  // Separator is two spaces, one middle dot, two spaces — the brief's own regex asked
  // for two dots, which its own reference implementation (single dot) never produces;
  // corrected here to match the actual, intended format.
  const line = hoverLine(car, state, 0, 132);
  assert.match(line, /^132 km\/h {2}· {2}gear 3 {2}· {2}\d+ rpm$/);
});

test('hover says no more than one line — the shift comparison lives in chart 4', () => {
  assert.ok(!hoverLine(car, state, 0, 132).includes('\n'));
  assert.ok(!/upshift|downshift|↑|↓/.test(hoverLine(car, state, 0, 132)));
});

test('the Stratos combo primary replaces every lane\'s own primary, not just the selected one', () => {
  // Both gear sets carry the same stub primary (1.1) here; fdValue must equal the combo's
  // primary (1.1) x below regardless of which lane asks, because primaries is non-empty.
  const fdLane0 = fdValue(car, state, 0);
  const fdLane1 = fdValue(car, state, 1);
  assert.equal(fdLane0, fdLane1);
  assert.ok(Math.abs(fdLane0 - 1.1 * 3.4211) < 1e-9);
});

test('two gear sets with different primaries produce different lane tops (regression guard)', () => {
  const l = layout(emptyPrimaryCar, emptyState);
  assert.notEqual(l.lanes[0].tops[0], l.lanes[1].tops[0]);
  // Set B's primary (1.3) is larger than Set A's (1.0), so the same first gear (3.0) gears
  // shorter on Set B and tops out slower.
  assert.ok(l.lanes[1].tops[0] < l.lanes[0].tops[0]);
});

test('a fixed-final-drive car (shape 3) still lays out per-set with its own primary', () => {
  const fixed = {
    ...emptyPrimaryCar,
    slug: 'test-fixed',
    final_drive: null,
    fixed_final_drive: 3.9285714285714284,
  };
  const l = layout(fixed, emptyState);
  assert.equal(l.lanes.length, 2);
  assert.ok(l.lanes[1].tops[0] < l.lanes[0].tops[0]);
});
