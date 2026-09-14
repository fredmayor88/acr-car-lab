import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSpeed, fdValue, layout, hoverLine } from '../js/charts/ladder.js';
import { DEFAULT_FACTOR } from '../js/gearing.js';

// Stratos-shape: final_drive.primaries non-empty, so the selected combo's primary
// REPLACES each gear set's own primary. Values line up with the game's real Stratos data
// (see data/lancia-stratos.json: the measured 8450 rpm rev limit and the fitted factor), so
// the pinned lane tops below are the site's own numbers, not fixture arithmetic that
// happens to work.
const car = {
  slug: 'test-stratos',
  engine: { redline: 8450 },
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
  defaults: { loaded_radius_factor: DEFAULT_FACTOR },
};
const state = { surface: 'Tarmac_Dry', fd: 0, set: 0, k: DEFAULT_FACTOR };

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
const emptyState = { surface: 'Tarmac_Dry', fd: 0, set: 0, k: 0.95 };

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

test('hovering past a lane\'s last dot clamps to that lane\'s top speed', () => {
  // gear set 1 tops out at 215 km/h; the axis runs further, but the car does not
  assert.match(hoverLine(car, state, 0, 260), /^215 km\/h {2}· {2}gear 5 {2}· {2}8450 rpm$/);
});

test('clampSpeed keeps a hovered speed inside the lane, from a standing start to its top', () => {
  const l = layout(car, state);
  assert.equal(clampSpeed(l, 1, -5), 0);
  assert.equal(clampSpeed(l, 0, 999), l.lanes[0].tops[4]);
  assert.equal(clampSpeed(l, 0, 120), 120);
});

test('lane name hit boxes: tile the label column lane by lane, cover the name, stop before the plot', async () => {
  const { laneNameHit } = await import('../js/charts/ladder.js');
  const L = 214, T = 56, step = 62;
  for (let i = 0; i < 10; i++) {
    const b = laneNameHit(i);
    const y = T + i * step + step / 2;
    // the name is end-anchored at L - 22 on y + 4, and "selected" sits at y + 19
    assert.ok(b.x <= 0 && b.x + b.width >= L - 22, 'spans the label column');
    assert.ok(b.y <= y - 11 && b.y + b.height >= y + 19, 'covers the name and the selected tag');
    assert.ok(b.x + b.width < L, 'stops before the plot, where the lane line starts');
    if (i > 0) assert.equal(laneNameHit(i - 1).y + laneNameHit(i - 1).height, b.y, 'no gap, no overlap');
    // the chart is 330px wide on a 400px screen, so a lane is 18.6px tall there
    assert.ok(b.height * 330 / 1100 >= 18, 'at least 18px tall on a 400px screen');
  }
});

test('laneAtPoint, coarse: anywhere in a lane name column picks that lane; the plot and the margins pick nothing', async () => {
  const { laneAtPoint } = await import('../js/charts/ladder.js');
  const T = 56, step = 62, L = 214;
  const how = { coarse: true };
  assert.equal(laneAtPoint({ x: 100, y: T + step / 2 }, 3, how), 0);
  assert.equal(laneAtPoint({ x: 2, y: T + 2 * step + 1 }, 3, how), 2, 'far left edge, top of lane 3');
  assert.equal(laneAtPoint({ x: L - 9, y: T + step - 0.5 }, 3, how), 0, 'last unit of the column');
  assert.equal(laneAtPoint({ x: L - 8, y: T + step / 2 }, 3, how), null, 'the column stops 8 short of the plot');
  assert.equal(laneAtPoint({ x: 600, y: T + step / 2 }, 3, how), null, 'a click in the plot');
  assert.equal(laneAtPoint({ x: 100, y: T - 1 }, 3, how), null, 'above the first lane');
  assert.equal(laneAtPoint({ x: 100, y: T + 3 * step }, 3, how), null, 'below the last lane');
  assert.equal(laneAtPoint({ x: 100, y: T + 9 * step + 5 }, 10, how), 9, 'a tenth lane on the 306 Maxi');
});

test('laneAtPoint, fine: only on the name box itself, never beside a short name', async () => {
  const { laneAtPoint } = await import('../js/charts/ladder.js');
  const T = 56, step = 62;
  // "Gear set 2   (5-speed)", end-anchored at x 192, about 120 units wide
  const nameBox = i => ({ x: 72, y: T + i * step + step / 2 - 7, width: 120, height: 13 });
  const y = T + step + step / 2;
  const how = { coarse: false, nameBox };
  assert.equal(laneAtPoint({ x: 130, y }, 3, how), 1, 'on the name');
  assert.equal(laneAtPoint({ x: 40, y }, 3, how), null, 'left of a short name');
  assert.equal(laneAtPoint({ x: 200, y }, 3, how), null, 'between the name and the plot');
  assert.equal(laneAtPoint({ x: 130, y: y + 12 }, 3, how), null, 'under the name, on the selected tag row');
  assert.equal(laneAtPoint({ x: 130, y }, 3, { coarse: false, nameBox: () => undefined }), null,
    'no name node measured, nothing picked');
});

// --- the page-wide rev ceiling ----------------------------------------------------------

test('at the default ceiling the lanes and the axis title are what they always were', async () => {
  const { axisTitle } = await import('../js/charts/ladder.js');
  assert.deepEqual(layout(car, { ...state, ceil: 8450 }), layout(car, state));
  assert.equal(axisTitle(car, state), 'speed at the 8450 rpm rev limit — km/h');
  assert.equal(axisTitle(car, { ...state, ceil: 8450 }), 'speed at the 8450 rpm rev limit — km/h');
});

test('a lowered ceiling reads every lane top at the ceiling rpm, and the relative base follows', async () => {
  const { axisTitle } = await import('../js/charts/ladder.js');
  const full = layout(car, state);
  const low = layout(car, { ...state, ceil: 7000 });
  low.lanes.forEach((lane, i) => lane.tops.forEach((v, gi) =>
    assert.ok(Math.abs(v - full.lanes[i].tops[gi] * 7000 / 8450) < 1e-9)));
  assert.ok(Math.abs(low.base - full.base * 7000 / 8450) < 1e-9);
  assert.ok(Math.abs(low.vmax - full.vmax * 7000 / 8450) < 1e-9);
  assert.equal(Math.round(low.lanes[0].tops[4]), 178);
  assert.equal(axisTitle(car, { ...state, ceil: 7000 }), 'speed at the 7000 rpm rev ceiling — km/h');
});

test('hover past the last dot under a lowered ceiling clamps to the ceiling rpm', () => {
  assert.match(hoverLine(car, { ...state, ceil: 7000 }, 0, 260),
    /^178 km\/h {2}· {2}gear 5 {2}· {2}7000 rpm$/);
});
