import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layout } from '../js/charts/finalDrive.js';
import { finalDriveCombos, stockRatios } from '../js/gearing.js';

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));

const stateFor = (car, over = {}) => ({
  surface: 'Tarmac_Dry', fd: 0, set: 0,
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
  assert.deepEqual(speeds, [167.1, 134.1, 154.1]);
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
  assert.equal(Math.round(stock.kmh), 176);
});

test('the caption names the rev limit at the default and the ceiling when it is lowered', async () => {
  const { caption } = await import('../js/charts/finalDrive.js');
  assert.equal(caption(stratos, stateFor(stratos)),
    'Every selectable combination. 100% is the shortest. Speed is top gear of gear set 1 '
    + 'at the rev limit. Click a row to use that final drive.');
  assert.equal(caption(stratos, stateFor(stratos, { ceil: 8520 })), caption(stratos, stateFor(stratos)));
  assert.equal(caption(stratos, stateFor(stratos, { set: 1, ceil: 7000 })),
    'Every selectable combination. 100% is the shortest. Speed is top gear of gear set 2 '
    + 'at the 7000 rpm rev ceiling. Click a row to use that final drive.');
});

// --- front and rear ratios that differ (Impreza, 206 WRC, Quattro) -----------------------

const impreza = load('subaru-impreza-555-s3-1993');
const ratiosFor = (car, over = {}) => ({ ...stockRatios(car.final_drive), ...over });

test('equal front and rear ratios sit on a chart row and add none', () => {
  const state = stateFor(impreza, { ratios: ratiosFor(impreza, { dfr: 1, drr: 1 }) });
  const rows = layout(impreza, state).rows;
  assert.equal(rows.length, impreza.final_drive.options.length);
  assert.equal(rows.find(r => r.selected).option.name, '39//8');
});

test('different front and rear ratios get their own selected row, sorted into place', () => {
  // front 39//8 (4.875), rear stock 35//9 (3.889), centre to rear 1.0: mean 4.3819
  const state = stateFor(impreza, { ratios: ratiosFor(impreza, { dfr: 1 }) });
  const rows = layout(impreza, state).rows;
  assert.equal(rows.length, impreza.final_drive.options.length + 1);
  const picked = rows.filter(r => r.selected);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].custom, true);
  assert.equal(picked[0].index, -1);
  assert.equal(picked[0].label, 'Current settings');
  assert.ok(Math.abs(picked[0].value - (4.875 + 35 / 9) / 2) < 1e-9);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].value >= rows[i].value);
  assert.ok(rows.every(r => r.pct >= 100 && Number.isFinite(r.kmh)));
});

test('the custom row carries the selected primary on the 206 WRC', () => {
  const p206 = load('peugeot-206-wrc-1999');
  const n = p206.final_drive.options.length;
  const state = stateFor(p206, { fd: n, ratios: ratiosFor(p206, { dfr: 0, drr: 1 }) });
  const rows = layout(p206, state).rows;
  assert.equal(rows.length, 3 * n + 1);
  const picked = rows.find(r => r.selected);
  assert.equal(picked.primary.name, p206.final_drive.primaries[1].name);
  assert.equal(picked.label, `${picked.primary.name}  ·  current settings`);
});

test('the caption explains the current-settings row only while it is shown', async () => {
  const { caption } = await import('../js/charts/finalDrive.js');
  const note = ' The highlighted row is your current front and rear ratios.';
  assert.ok(caption(impreza, stateFor(impreza, { ratios: ratiosFor(impreza, { dfr: 1 }) })).endsWith(note));
  assert.ok(!caption(impreza, stateFor(impreza, { ratios: ratiosFor(impreza) })).includes(note));
});

// --- the selected row's note, the rows caption, and the dropdown labels -------------------

const p206 = load('peugeot-206-wrc-1999');
const quattro = load('audi-quattro-gr4-1981');
const delta = load('lancia-delta-integrale-evoluzione-1992');
const stepOf = (car, key, name) =>
  car.final_drive.settings.find(s => s.key === key).steps.findIndex(st => st.name === name);

test('the selected row carries its role and the final drive the bar reads out', () => {
  const rows = layout(impreza, stateFor(impreza, { ratios: ratiosFor(impreza) })).rows;
  assert.equal(rows.find(r => r.selected).note, 'selected · final drive 3.89');
  assert.ok(rows.filter(r => !r.selected).every(r => r.note === ''));
  // a car without ratio settings has no readout to tie to: no note
  assert.ok(layout(stratos, stateFor(stratos)).rows.every(r => r.note === ''));
});

test('the note moves with a setting the rows hold: the 206 centre diff', () => {
  const at = name => layout(p206, stateFor(p206, { ratios: ratiosFor(p206, { cdr: stepOf(p206, 'cdr', name) }) }))
    .rows.find(r => r.selected);
  const a = at(p206.final_drive.settings[1].steps[0].name);
  const b = at(p206.final_drive.settings[1].steps[5].name);
  assert.equal(a.index, b.index);
  assert.notEqual(a.note, b.note);
  assert.match(b.note, /^selected · final drive \d+\.\d\d · with primary gear \d+\.\d\d$/);
});

test('the current-settings row carries the note too', () => {
  const rows = layout(impreza, stateFor(impreza, { ratios: ratiosFor(impreza, { dfr: 1 }) })).rows;
  assert.equal(rows.find(r => r.custom).note, 'selected · final drive 4.38');
});

test('the caption of a car with ratio settings says what the rows are and what they hold', async () => {
  const { caption } = await import('../js/charts/finalDrive.js');
  const tail = ' 100% is the shortest. Speed is top gear of gear set 1 at the rev limit. '
    + 'Click a row to use that final drive.';
  const cap = car => caption(car, stateFor(car, { ratios: ratiosFor(car) }));
  assert.equal(cap(impreza),
    'Rows are front diff and rear diff on the same ratio, with centre to rear 31//31 as selected.' + tail);
  assert.equal(cap(p206),
    'Rows are front diff and rear diff on the same ratio, with centre diff 24//24 as selected.' + tail);
  assert.equal(cap(quattro), 'Rows are front diff and rear diff on the same ratio.' + tail);
  const [, ctr, drr] = delta.final_drive.settings.map(s => s.stock);
  assert.equal(cap(delta),
    `Rows are centre diff ratios, with centre to rear ${ctr} and rear diff ${drr} as selected.` + tail);
});

test('dropdown labels put the decimal value next to the name', async () => {
  const { stepLabel, selectLabel } = await import('../js/charts/finalDrive.js');
  assert.equal(stepLabel({ name: '23//25', value: 0.92 }), '23//25 · 0.920');
  assert.equal(stepLabel({ name: '36//7', value: 36 / 7 }), '36//7 · 5.143');
  // the combined Final drive select: the option's decimal; a primary x option pair (the Stratos)
  // shows what the two make together, 1.375 x 3.8235
  assert.equal(selectLabel({ primary: null, option: { name: '67//14', value: 67 / 14 }, below: 67 / 14 }),
    '67//14 · 4.786');
  const pair = finalDriveCombos(stratos.final_drive)[0];
  assert.equal(selectLabel(pair), '35//30*33//28  ·  65//17 · 5.257');
});

test('on the 206 the note adds the primary gear, so rows that differ by primary read differently', async () => {
  const { fullReadout } = await import('../js/charts/finalDrive.js');
  const n = p206.final_drive.options.length;
  const at = p => stateFor(p206, { fd: p * n, ratios: ratiosFor(p206) });
  // stock settings: 5.34 below the gearbox; primaries 21//24, 22//24, 21//25
  assert.equal(fullReadout(p206, at(0)), 'final drive 5.34 · with primary gear 4.67');
  assert.equal(fullReadout(p206, at(1)), 'final drive 5.34 · with primary gear 4.89');
  assert.equal(fullReadout(p206, at(2)), 'final drive 5.34 · with primary gear 4.49');
  assert.equal(layout(p206, at(2)).rows.find(r => r.selected).note,
    'selected · final drive 5.34 · with primary gear 4.49');
  // a car without a primary selector: the final drive alone
  assert.equal(fullReadout(impreza, stateFor(impreza, { ratios: ratiosFor(impreza) })), 'final drive 3.89');
});
