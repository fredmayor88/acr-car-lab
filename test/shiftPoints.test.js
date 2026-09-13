import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipX, floorValueX, layout, readoutX, shiftCaption, shiftReadout }
  from '../js/charts/shiftPoints.js';
import { circumference, kmh } from '../js/gearing.js';

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

// --- the configurable rev floor -------------------------------------------------------

test('bars start at the configured rev floor, not the constant', () => {
  const at3000 = layout(car, state).bars;
  const at5000 = layout(car, { ...state, floor: 5000 }).bars;
  at3000.forEach((bar, i) => {
    assert.ok(Math.abs(at5000[i].from / bar.from - 5000 / 3000) < 1e-9, `gear ${i}`);
    assert.equal(at5000[i].to, bar.to, 'the top end does not move');
  });
  assert.equal(layout(car, { ...state, floor: 0 }).bars[0].from, 0);
});

test('a state with no floor uses the 3000 rpm default', () => {
  assert.deepEqual(layout(car, state).bars, layout(car, { ...state, floor: 3000 }).bars);
});

test('the readout clamps to the configured rev floor', () => {
  const s = { ...state, floor: 6000 };
  const r = shiftReadout(car, s, 4, 10);
  assert.ok(Math.abs(r.speed - layout(car, s).bars[4].from) < 1e-9);
  assert.ok(Math.abs(r.rpm - 6000) < 1e-6);
});

test('the caption names the current rev floor', () => {
  assert.match(shiftCaption(3000), /from 3000 rpm to the rev limit/);
  assert.match(shiftCaption(4500), /from 4500 rpm to the rev limit/);
});

test('the caption names a lowered ceiling, and says rev limit when it is the limit', () => {
  assert.match(shiftCaption(3000, 8750, 8750), /from 3000 rpm to the rev limit\./);
  assert.match(shiftCaption(3000, 7000, 8750), /from 3000 rpm to 7000 rpm\./);
  assert.match(shiftCaption(5000, 8000, 8750), /from 5000 rpm to 8000 rpm\./);
});

// --- the configurable rev ceiling -----------------------------------------------------

test('bars end at the configured ceiling; the floor end does not move', () => {
  const atLimit = layout(car, state).bars;
  const at7000 = layout(car, { ...state, ceil: 7000 }).bars;
  atLimit.forEach((bar, i) => {
    assert.ok(Math.abs(at7000[i].to / bar.to - 7000 / 8750) < 1e-9, `gear ${i}`);
    assert.equal(at7000[i].from, bar.from);
  });
  assert.deepEqual(layout(car, state).bars, layout(car, { ...state, ceil: 8750 }).bars);
});

test('the axis keeps its scale when the ceiling drops, so the bars visibly shorten', () => {
  assert.equal(layout(car, { ...state, ceil: 5000 }).vmax, layout(car, state).vmax);
});

test('the readout clamps to the configured ceiling', () => {
  const s = { ...state, ceil: 7000 };
  const r = shiftReadout(car, s, 0, 300);
  assert.ok(Math.abs(r.speed - layout(car, s).bars[0].to) < 1e-9);
  assert.ok(Math.abs(r.rpm - 7000) < 1e-6);
});

test('the over-limit warning keys off the rev limit, not the ceiling', () => {
  const s = { ...state, ceil: 7000 };
  const circ = circumference(0.296, 0.9562);
  const overall = 1.1 * 3.4211;
  // fourth gear at a speed where third runs 8000 rpm: above the ceiling, under the limit
  const speed = kmh(8000, 1.619 * overall, circ);
  const r = shiftReadout(car, s, 3, speed);
  assert.ok(r.down.rpm > 7000 && r.down.rpm < 8750);
  assert.equal(r.overRev, false);
  // and a downshift past 8750 is still flagged with the ceiling lowered: third at 7000
  // rpm puts second at ~8877
  const hot = shiftReadout(car, s, 2, 132);
  assert.ok(Math.abs(hot.rpm - 7000) < 1e-6);
  assert.ok(hot.down.rpm > 8750);
  assert.equal(hot.overRev, true);
});

// --- the speed at the rev floor, left of each bar -------------------------------------

test('each bar starts at the speed at the floor in that gear, and moves with the floor', () => {
  const circ = circumference(0.296, 0.9562);
  const overall = 1.1 * 3.4211;
  const gears = car.gear_sets[0].gears;
  for (const floor of [3000, 5000]) {
    layout(car, { ...state, floor }).bars.forEach((bar, i) => {
      assert.ok(Math.abs(bar.from - kmh(floor, gears[i].value * overall, circ)) < 1e-9);
    });
  }
  assert.ok(layout(car, { ...state, floor: 5000 }).bars[0].from
            > layout(car, state).bars[0].from);
});

test('the floor value ends 12 left of the bar start, mirroring the top value', () => {
  assert.equal(floorValueX(300, '31'), 288);
});

test('the floor value hides rather than cross the plot edge or the gear labels', () => {
  assert.equal(floorValueX(132, '0'), null, 'a floor of 0 starts the bar on the axis');
  assert.equal(floorValueX(150, '12'), null);
  const x = floorValueX(160, '12');
  assert.ok(x === null || x - 2 * 6.4 >= 132);
  assert.equal(floorValueX(160, '1', 132), 148);
});

// --- the readout above the plot keeps clear of the rev floor control -------------------

test('the readout centres on the cursor when there is room', () => {
  assert.equal(readoutX(500, 200), 400);
});

test('the readout never runs past the edge it is given', () => {
  const w = 270;
  assert.ok(readoutX(1010, w) + w <= 1096);
  assert.ok(readoutX(1010, w, 820) + w <= 820, 'must stop short of the control box');
  assert.ok(readoutX(700, w, 820) + w <= 820);
  assert.equal(readoutX(10, w, 820), 4, 'and never runs off the left');
});
