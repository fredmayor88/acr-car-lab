import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layout } from '../js/charts/finalDrive.js';

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));

const stateFor = (car, over = {}) => ({
  surface: 'Tarmac_Dry', fd: 0, set: 0, draw: [0],
  k: car.defaults.loaded_radius_factor, ...over,
});

// Shape 1 — selectable primaries (the Stratos; the 206 WRC is the only other car with them).
const stratos = load('lancia-stratos');
// Shape 2 — an empty `primaries` list: the primary comes from the gear set.
const mini = load('mini-cooper-s-1964');
// Shape 3 — no adjustable final drive at all.
const i20 = load('hyundai-i20-rally2-2021');

test('every primary x option combination gets a row', () => {
  assert.equal(layout(stratos, stateFor(stratos)).rows.length, 8 * 2);
});

test('a car with an empty primaries list gets one row per option', () => {
  const rows = layout(mini, stateFor(mini)).rows;
  assert.equal(rows.length, mini.final_drive.options.length);
  assert.ok(rows.every(r => r.primary === null));
});

test('rows without a primary are labelled with the option alone', () => {
  const rows = layout(mini, stateFor(mini)).rows;
  assert.equal(rows[0].label, '67//14');
  assert.equal(layout(stratos, stateFor(stratos)).rows[0].label,
               '35//30*33//28  ·  65//17');
});

test('rows are sorted shortest gearing first and the first row is 100%', () => {
  const rows = layout(stratos, stateFor(stratos)).rows;
  assert.equal(rows[0].pct, 100);
  assert.ok(rows[0].value > rows[rows.length - 1].value);
  assert.ok(rows[rows.length - 1].pct > 100);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].value >= rows[i].value);
});

test('the picked primary replaces the gear set primary instead of stacking on it', () => {
  const rows = layout(stratos, stateFor(stratos)).rows;
  const top = rows[0];
  // 1.375 x 3.8235, not 1.375 x 1.1 x 3.8235
  assert.ok(Math.abs(top.value - 1.375 * (65 / 17)) < 1e-9);
});

test('the stock Stratos combination reads 214 km/h and 140% of the shortest', () => {
  const state = stateFor(stratos, { set: 0 });
  const rows = layout(stratos, state).rows;
  const stock = rows.find(r => r.primary.name === '33//31*31//30'
                            && r.option.name === '65//19');
  assert.equal(Math.round(stock.kmh), 214);
  assert.equal(Math.round(stock.pct), 140);
});

test('speed uses the top gear of the selected gear set', () => {
  // Stratos gear set 3 tops out at 0.897, taller than set 1's 1.154, so it reads faster
  const a = layout(stratos, stateFor(stratos, { set: 0 })).rows[0].kmh;
  const b = layout(stratos, stateFor(stratos, { set: 2 })).rows[0].kmh;
  assert.ok(b > a);
});

test('the gear set primary is what drives speed when the combo has none', () => {
  // Mini set 3 has primary 1.25 against set 1's 1.043, so it gears the car down
  const a = layout(mini, stateFor(mini, { set: 0 })).rows[0];
  const b = layout(mini, stateFor(mini, { set: 2 })).rows[0];
  assert.ok(b.value > a.value);
});

test('shape-2 speeds are pinned: the Fiat 131 shortest combo on its three gear sets', () => {
  // Both halves of the speed path vary here — the top gear AND the set's primary
  // (1.043 / 1.045 / 1.269) — so dropping the primary from the path fails this.
  // The Mini cannot catch that: its four sets all have top gear x primary = 1.0000.
  const fiat = load('fiat-131-abarth-1976');
  const speeds = fiat.gear_sets.map((_, set) =>
    Number(layout(fiat, stateFor(fiat, { set })).rows[0].kmh.toFixed(1)));
  assert.deepEqual(speeds, [168.0, 134.9, 155.0]);
});

test('the selected row is flagged once, wherever it sorts', () => {
  const rows = layout(stratos, stateFor(stratos, { fd: 5 })).rows;
  assert.equal(rows.filter(r => r.selected).length, 1);
  const picked = rows.find(r => r.selected);
  assert.equal(picked.index, 5);
});

test('row.index addresses the unsorted combo list, not the display order', () => {
  const rows = layout(mini, stateFor(mini)).rows;
  assert.deepEqual(rows.map(r => r.index).sort((a, b) => a - b),
                   rows.map((_, i) => i));
  assert.equal(mini.final_drive.options[rows[0].index].name, rows[0].option.name);
});

test('a car with no adjustable final drive reports it instead of drawing rows', () => {
  const l = layout(i20, stateFor(i20));
  assert.equal(l.adjustable, false);
  assert.deepEqual(l.rows, []);
});

test('surface changes every speed', () => {
  const dry = layout(stratos, stateFor(stratos)).rows.map(r => r.kmh);
  const snow = layout(stratos, stateFor(stratos, { surface: 'Sweden' })).rows
    .map(r => r.kmh);
  assert.ok(snow.every((v, i) => v > dry[i]));
});

test('every car in data/ lays out without throwing, on every gear set', () => {
  const slugs = readdirSync(new URL('../data/', import.meta.url))
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.slice(0, -5));
  assert.ok(slugs.length >= 18);
  for (const slug of slugs) {
    const car = load(slug);
    for (let set = 0; set < car.gear_sets.length; set++) {
      const l = layout(car, stateFor(car, { set }));
      assert.equal(l.adjustable, Boolean(car.final_drive), slug);
      for (const r of l.rows) {
        assert.ok(Number.isFinite(r.kmh) && r.kmh > 0 && r.kmh < 500, `${slug} ${r.kmh}`);
        assert.ok(r.pct >= 100, slug);
      }
    }
  }
});

// --- the page-wide rev ceiling ----------------------------------------------------------

test('a lowered ceiling reads km/h at the ceiling; ratios and percentages do not move', () => {
  const full = layout(stratos, stateFor(stratos));
  assert.deepEqual(layout(stratos, stateFor(stratos, { ceil: stratos.engine.redline })), full);
  const low = layout(stratos, stateFor(stratos, { ceil: 7000 }));
  low.rows.forEach((r, i) => {
    assert.equal(r.pct, full.rows[i].pct);
    assert.equal(r.value, full.rows[i].value);
    assert.ok(Math.abs(r.kmh - full.rows[i].kmh * 7000 / stratos.engine.redline) < 1e-9);
  });
  const stock = low.rows.find(r => r.primary.name === '33//31*31//30' && r.option.name === '65//19');
  assert.equal(Math.round(stock.kmh), 177);
});

test('the caption names the rev limit at the default and the ceiling when it is lowered', async () => {
  const { caption } = await import('../js/charts/finalDrive.js');
  assert.equal(caption(stratos, stateFor(stratos)),
    'Every selectable combination. 100% is the shortest. Speed is top gear of gear set 1 '
    + 'at the rev limit. Click a row to use that final drive.');
  assert.equal(caption(stratos, stateFor(stratos, { ceil: 8450 })), caption(stratos, stateFor(stratos)));
  assert.equal(caption(stratos, stateFor(stratos, { set: 1, ceil: 7000 })),
    'Every selectable combination. 100% is the shortest. Speed is top gear of gear set 2 '
    + 'at the 7000 rpm rev ceiling. Click a row to use that final drive.');
});
