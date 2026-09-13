import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME, labelColumns, layout, nearestLine, tipTop } from '../js/charts/speedRevs.js';

// Stratos-shape: final_drive.primaries non-empty, so the selected combo's primary
// REPLACES each gear set's own primary. Gear set 1 top gear pins to the game's real
// Stratos top speed (215 km/h) — see test/ladder.test.js for the same pin.
const car = {
  slug: 'test-stratos',
  engine: { redline: 8750 },
  gear_sets: [
    { label: 'Gear set 1', primary: { name: 'p', value: 1.1 },
      gears: [2.8, 2.053, 1.619, 1.32, 1.154].map(v => ({ name: '', value: v })) },
    { label: 'Gear set 2', primary: { name: 'p', value: 1.1 },
      gears: [3.143, 2.235, 1.762].map(v => ({ name: '', value: v })) },
    { label: 'Gear set 3', primary: { name: 'p', value: 1.1 },
      gears: [3.231, 2.235].map(v => ({ name: '', value: v })) },
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

test('only the ticked gear sets are drawn', () => {
  assert.equal(layout(car, state).lines.length, 5);
  assert.equal(layout(car, { ...state, draw: [0, 2] }).lines.length, 7);
});

test('drawn sets are independent of the selected set', () => {
  const l = layout(car, { ...state, set: 2, draw: [1] });
  assert.deepEqual([...new Set(l.lines.map(x => x.set))], [1]);
});

test('each line carries its set index so it can be coloured consistently', () => {
  const l = layout(car, { ...state, draw: [0, 1] });
  assert.deepEqual([...new Set(l.lines.map(x => x.set))], [0, 1]);
});

test('top speed matches the known Stratos top gear figure', () => {
  const l = layout(car, state);
  assert.equal(Math.round(l.lines[4].topSpeed), 215);
});

test('vmax leaves headroom above the fastest drawn line', () => {
  const l = layout(car, state);
  assert.ok(l.vmax > Math.max(...l.lines.map(x => x.topSpeed)));
});

test('nearestLine picks the gear whose line passes closest to the cursor', () => {
  const l = layout(car, state);
  // every line is straight from the origin to its top speed at the rev limit, so at
  // half the rev limit each gear sits at half its top speed
  const target = l.lines[2];
  const hit = nearestLine(l.lines, car.engine.redline, 4375, target.topSpeed / 2);
  assert.equal(hit.gear, target.gear);
  assert.equal(hit.set, target.set);
});

test('nearestLine only ever returns a line that is actually drawn', () => {
  const l = layout(car, { ...state, draw: [1] });
  assert.equal(nearestLine(l.lines, car.engine.redline, 4000, 500).set, 1);
});

// Mini-shape: final_drive.primaries is EMPTY, so each drawn set must use its own gear
// set's primary — not the selected set's. Set A and Set B differ only in primary
// (1.0 vs 1.3) with identical gears, so any line that used the wrong primary (e.g.
// always set 0's, or the state's selected set regardless of which set is drawn) would
// produce equal top speeds for both sets. This is the regression guard for the exact
// bug the brief's layout() would have shipped: hoisting fdValue(car, state) once outside
// the loop over state.draw uses the SELECTED set's primary for every drawn set.
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
const emptyState = { surface: 'Tarmac_Dry', fd: 0, set: 0, draw: [0, 1], k: 0.95 };

test('sets with different primaries and identical gears draw different top speeds ' +
     '(regression guard for the hoisted-fdValue bug)', () => {
  const l = layout(emptyPrimaryCar, emptyState);
  const set0Tops = l.lines.filter(x => x.set === 0).map(x => x.topSpeed);
  const set1Tops = l.lines.filter(x => x.set === 1).map(x => x.topSpeed);
  set0Tops.forEach((top0, i) => {
    assert.notEqual(top0, set1Tops[i]);
    // set 1's primary (1.3) is larger than set 0's (1.0), so the same gear ratio
    // gears shorter on set 1 and tops out proportionally slower, by exactly the
    // ratio between the two primaries.
    assert.ok(Math.abs(top0 / set1Tops[i] - 1.3 / 1.0) < 1e-9);
  });
});

test('changing state.set does not change any drawn line\'s top speed', () => {
  const atSet0 = layout(emptyPrimaryCar, { ...emptyState, set: 0 }).lines.map(x => x.topSpeed);
  const atSet1 = layout(emptyPrimaryCar, { ...emptyState, set: 1 }).lines.map(x => x.topSpeed);
  assert.deepEqual(atSet0, atSet1);
});

// Shape 3: final_drive is null, fixed_final_drive is a plain number (i20, Fabia, Polo R5,
// 208 Rally4). No combo exists to select, so fdValue must fall back to the fixed ratio.
test('final_drive null with a numeric fixed_final_drive still produces finite, positive lines', () => {
  const fixed = {
    ...emptyPrimaryCar,
    slug: 'test-fixed',
    final_drive: null,
    fixed_final_drive: 3.76321,
  };
  const l = layout(fixed, emptyState);
  assert.ok(l.lines.length > 0);
  l.lines.forEach(line => {
    assert.ok(Number.isFinite(line.topSpeed));
    assert.ok(line.topSpeed > 0);
  });
});

// --- label columns, title and tooltip stay inside the frame -----------------------------

test('every gear-number column fits the viewBox with all ten sets drawn', () => {
  const x = FRAME.R - 30;               // the rev limit can sit this close to the plot edge
  const cols = labelColumns(x, 10);
  assert.equal(cols.xs.length, 10);
  // a two-character label at 10.5px monospace is under 14 units wide
  assert.ok(cols.xs[9] + 14 <= cols.width, `last column at ${cols.xs[9]} overflows ${cols.width}`);
});

test('columns never overlap and the default width holds for a single set', () => {
  const cols = labelColumns(800, 3);
  assert.ok(cols.xs[1] - cols.xs[0] >= 14);
  assert.equal(labelColumns(800, 1).width, 940);
});

test('the km/h axis title sits clear of the top tick label', () => {
  // top tick label: baseline at ys(v) + 3.5 >= T + 3.5, glyphs ~8 units tall
  const tickTop = FRAME.T + 3.5 - 8;
  // title baseline at titleY; descenders ~3 units
  assert.ok(FRAME.titleY + 3 < tickTop, `title at ${FRAME.titleY} meets tick top ${tickTop}`);
});

test('the hover tooltip never starts above the viewBox', () => {
  assert.equal(tipTop(FRAME.T), 4);
  assert.equal(tipTop(200), 154);
});

// --- the page-wide rev ceiling ----------------------------------------------------------

test('at the default ceiling the lines are what they always were, ending at the rev limit', () => {
  assert.deepEqual(layout(car, { ...state, ceil: 8750 }), layout(car, state));
  assert.equal(layout(car, state).ceil, 8750);
});

test('a lowered ceiling ends every line at the ceiling rpm, and vmax follows', () => {
  const full = layout(car, { ...state, draw: [0, 1] });
  const low = layout(car, { ...state, draw: [0, 1], ceil: 7000 });
  assert.equal(low.ceil, 7000);
  low.lines.forEach((line, i) => {
    assert.equal(line.total, full.lines[i].total);
    assert.ok(Math.abs(line.topSpeed - full.lines[i].topSpeed * 0.8) < 1e-9);
  });
  assert.ok(Math.abs(low.vmax - full.vmax * 0.8) < 1e-9);
  assert.equal(Math.round(low.lines[4].topSpeed), 172);
});

test('nearestLine against the ceiling: a line at half the ceiling sits at half its top', () => {
  const low = layout(car, { ...state, ceil: 7000 });
  const target = low.lines[3];
  const hit = nearestLine(low.lines, low.ceil, 3500, target.topSpeed / 2);
  assert.equal(hit.gear, target.gear);
});

test('hoverRpm never passes the ceiling', async () => {
  const { hoverRpm } = await import('../js/charts/speedRevs.js');
  assert.equal(hoverRpm(9999, 7000), 7000);
  assert.equal(hoverRpm(-5, 7000), 0);
  assert.equal(hoverRpm(4200, 7000), 4200);
});
