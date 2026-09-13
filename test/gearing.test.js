import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  circumference, kmh, rpmAt, totalRatio, finalDriveCombos,
  effectivePrimary, belowGearbox, overallRatio, gearTops, gearAtSpeed,
  DEFAULT_FACTOR, REV_FLOOR, SURFACES, SET_COLOURS,
} from '../js/gearing.js';

const near = (a, b, eps = 0.5) =>
  assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

// The real exported data, not fixtures — these three files are the three shapes the
// site has to handle, and a test against the real bytes is the only honest one.
const read = name => {
  const url = new URL(`../data/${name}.json`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch (err) {
    throw new Error(`data/${name}.json could not be read (${err.code || err.message}) — ` +
                    `is the slug in data/index.json still correct?`);
  }
};

const car = slug => read(slug);

// The manifest, so "every car" in the fleet test means every car and new exports are
// covered without editing this file.
const index = read('index');

const stratos = car('lancia-stratos');            // selectable primary
const mini = car('mini-cooper-s-1964');           // fixed primary, selectable diff
const fabia = car('skoda-fabia-rs-rally2-2022');  // nothing adjustable

const dry = c => circumference(c.tyres.Tarmac_Dry.free_radius,
                               c.defaults.loaded_radius_factor);

// Lancia Stratos HF, dry tarmac, read from the game files
const R = 0.2960;
const CIRC = circumference(R, DEFAULT_FACTOR);

test('circumference applies the loaded-radius factor to the free radius', () => {
  near(CIRC, 2 * Math.PI * R * 0.9904, 1e-9);
});

test('the factor is what makes the control real — a different factor moves the number', () => {
  assert.notEqual(circumference(R, 0.99), CIRC);
});

test('top gear at the measured 8450 rpm rev limit on the stock final drive is 215 km/h', () => {
  const total = totalRatio(1.154, 1.100, 1.0 * 3.4211);
  near(kmh(8450, total, CIRC), 215, 1);
});

test('rpmAt inverts kmh', () => {
  const total = totalRatio(1.619, 1.100, 1.0 * 3.4211);
  const v = kmh(6000, total, CIRC);
  near(rpmAt(v, total, CIRC), 6000, 1e-6);
});

test('gearTops gives each gear its speed at the rev limit', () => {
  const gears = [{ name: '', value: 2.8 }, { name: '', value: 1.154 }];
  const tops = gearTops(gears, 1.100 * 3.4211, CIRC, 8450);
  near(tops[0], 89, 1);
  near(tops[1], 215, 1);
});

test('gearAtSpeed picks the lowest gear that has not topped out', () => {
  const tops = [89, 121, 153, 188, 215];
  assert.equal(gearAtSpeed(tops, 132), 2);   // third gear, zero-indexed
  assert.equal(gearAtSpeed(tops, 89), 0);    // exactly at a top speed stays in that gear
  assert.equal(gearAtSpeed(tops, 0), 0);
});

test('gearAtSpeed clamps above the top gear rather than returning -1', () => {
  assert.equal(gearAtSpeed([89, 121, 153, 188, 215], 400), 4);
  assert.equal(gearAtSpeed([89, 121, 153], 400), 2);
});

test('constants match the spec', () => {
  assert.equal(DEFAULT_FACTOR, 0.9904);
  assert.equal(REV_FLOOR, 3000);
  assert.deepEqual(SURFACES.map(s => s.key),
    ['Tarmac_Dry', 'Tarmac_Wet', 'Gravel', 'Sweden', 'Montecarlo']);
  assert.deepEqual(SURFACES.map(s => s.label),
    ['Dry tarmac', 'Wet tarmac', 'Gravel', 'Snow', 'Winter tarmac']);
  assert.deepEqual([...SET_COLOURS],
    ['#7A583B', '#148FAC', '#30353A', '#B07A4E', '#0E6E85',
     '#8D949B', '#4FB3C9', '#5A3F29', '#555D64', '#7A6E64']);
});

test('the 306 Maxi has ten gear sets, and no two of them share a colour', () => {
  assert.ok(SET_COLOURS.length >= 10);
  assert.equal(new Set(SET_COLOURS.slice(0, 10).map(c => c.toUpperCase())).size, 10);
});

test('the shared constants are frozen — one chart cannot poison another', () => {
  assert.ok(Object.isFrozen(SURFACES));
  assert.ok(Object.isFrozen(SET_COLOURS));
  assert.ok(SURFACES.every(s => Object.isFrozen(s)));
  assert.throws(() => SET_COLOURS.push('#FFFFFF'));
  assert.throws(() => { SURFACES[0].label = 'nope'; });
});

test('studded Montecarlo is not offered', () => {
  assert.ok(!SURFACES.some(s => s.key.includes('Studded')));
});

// --- finalDriveCombos -------------------------------------------------------------

test('finalDriveCombos returns the cross product when primaries are selectable', () => {
  const combos = finalDriveCombos(stratos.final_drive);
  assert.equal(combos.length, 8 * 2);
  assert.ok(combos.every(c => c.primary !== null));
});

test('finalDriveCombos leaves the primary OUT of below — it is an alternative, not a factor', () => {
  const combos = finalDriveCombos({
    primaries: [{ name: 'a', value: 1.375 }],
    options: [{ name: 'x', value: 3.8235 }],
    rest: 1.0,
  });
  assert.equal(combos[0].below, 1.0 * 3.8235);
  assert.equal(combos[0].primary.value, 1.375);
});

test('finalDriveCombos folds rest into below so drivetrain layout cannot skew the ratio', () => {
  const combos = finalDriveCombos({
    primaries: [{ name: 'a', value: 2 }],
    options: [{ name: 'x', value: 3 }],
    rest: 1.5,
  });
  assert.equal(combos[0].below, 4.5);
});

test('an empty primaries array means no primary SELECTOR, not no primary', () => {
  const combos = finalDriveCombos(mini.final_drive);
  assert.equal(combos.length, mini.final_drive.options.length);
  assert.ok(combos.every(c => c.primary === null));
});

test('finalDriveCombos is empty when there is no adjustable final drive at all', () => {
  assert.deepEqual(finalDriveCombos(fabia.final_drive), []);
  assert.deepEqual(finalDriveCombos(null), []);
});

// --- shape 1: selectable primary (Stratos) ----------------------------------------

test('Stratos: a selected primary REPLACES the gear set primary, it does not multiply it', () => {
  const long = finalDriveCombos(stratos.final_drive)
    .find(c => c.primary.name === '35//30*33//28' && c.option.name === '65//19');
  assert.equal(effectivePrimary(stratos, 0, long).name, '35//30*33//28');
  // the trap: folding both in would be 1.375 * 1.1 = 1.5125
  near(overallRatio(stratos, 0, long), 1.375 * 3.4210526315789473, 1e-9);
});

test('Stratos: with no combo chosen, the gear set primary applies', () => {
  assert.equal(effectivePrimary(stratos, 0, null).value, 1.1);
});

test('Stratos gear set 1 on the stock final drive is 89/121/153/188/215 km/h', () => {
  const stock = finalDriveCombos(stratos.final_drive)
    .find(c => c.primary.name === '33//31*31//30' && c.option.name === '65//19');
  const tops = gearTops(stratos.gear_sets[0].gears,
                        overallRatio(stratos, 0, stock), dry(stratos),
                        stratos.engine.redline);
  [89, 121, 153, 188, 215].forEach((expected, i) => near(tops[i], expected, 1));
});

test('shortest gearing is the largest overall ratio', () => {
  const combos = finalDriveCombos(stratos.final_drive);
  const sorted = [...combos].sort((a, b) =>
    overallRatio(stratos, 0, b) - overallRatio(stratos, 0, a));
  assert.equal(sorted[0].primary.value, 1.3750000000000002);
  assert.equal(sorted[0].option.value, 3.823529411764706);
  assert.ok(overallRatio(stratos, 0, sorted[0]) >
            overallRatio(stratos, 0, sorted[sorted.length - 1]));
});

// --- shape 2: fixed primary, selectable diff (Mini) -------------------------------

test('Mini: the four gear sets have different primaries', () => {
  assert.deepEqual(mini.gear_sets.map(s => s.primary.name),
    ['24//23', '23//22', '25//20', '26//20']);
});

test('Mini: per-set primaries must actually reach the speeds — the bug that shipped', () => {
  const stock = finalDriveCombos(mini.final_drive)
    .find(c => c.option.name === mini.final_drive.stock_option);
  const firsts = mini.gear_sets.map((set, i) =>
    gearTops(set.gears, overallRatio(mini, i, stock), dry(mini), mini.engine.redline)[0]);
  // all four sets share the same first gear (2.4615), so if the primary were ignored
  // every set would give an identical first-gear speed. It must not.
  assert.equal(new Set(firsts.map(v => v.toFixed(3))).size, 4);
  // and the biggest primary must give the shortest first gear
  assert.ok(firsts[3] < firsts[0]);
});

test('Mini: overallRatio uses the set primary when the combo carries none', () => {
  const stock = finalDriveCombos(mini.final_drive)
    .find(c => c.option.name === '63//16');
  near(overallRatio(mini, 2, stock), 1.25 * 3.9375, 1e-12);
});

// --- shape 3: nothing adjustable (Fabia) ------------------------------------------

test('Fabia: belowGearbox falls back to fixed_final_drive, not 1', () => {
  assert.equal(belowGearbox(fabia, null), 4.230769230769231);
  assert.notEqual(belowGearbox(fabia, null), 1);
});

test('belowGearbox throws rather than returning null when a combo is required', () => {
  // Every shape-2 car has fixed_final_drive: null, so `primary * null` would be 0 and
  // km/h would come out Infinity — silently drawn by a chart. Fail loudly instead.
  assert.equal(mini.fixed_final_drive, null);
  assert.throws(() => belowGearbox(mini, null), /mini-cooper-s-1964/);
  assert.throws(() => overallRatio(mini, 0, null), /combo is required/);
});

test('no car in data/ can produce a non-finite speed through the public path', () => {
  for (const { slug } of index.cars) {
    const c = car(slug);
    const combos = finalDriveCombos(c.final_drive);
    if (combos.length === 0) {
      assert.notEqual(c.fixed_final_drive, null, `${slug} has neither combos nor a fixed FD`);
      assert.ok(Number.isFinite(overallRatio(c, 0, null)) && overallRatio(c, 0, null) > 0);
    } else {
      assert.throws(() => belowGearbox(c, null), /combo is required/,
        `${slug} should demand a combo`);
    }
  }
});

test('Fabia gear set 1 is 60.0/84.7/115.2/152.4/189.3 km/h on dry tarmac', () => {
  const tops = gearTops(fabia.gear_sets[0].gears, overallRatio(fabia, 0, null),
                        dry(fabia), fabia.engine.redline);
  [60.0, 84.7, 115.2, 152.4, 189.3].forEach((expected, i) => near(tops[i], expected, 0.2));
});

test('Fabia: the gear set primary still applies even with no final drive object', () => {
  assert.equal(effectivePrimary(fabia, 0, null).value, fabia.gear_sets[0].primary.value);
});

// --- the whole fleet ---------------------------------------------------------------

test('every car in data/ produces finite top speeds for every gear set', () => {
  assert.ok(index.cars.length >= 18, `index.json lists only ${index.cars.length} cars`);
  for (const { slug } of index.cars) {
    const c = car(slug);
    const combos = finalDriveCombos(c.final_drive);
    const choices = combos.length ? combos : [null];
    c.gear_sets.forEach((set, i) => {
      for (const combo of choices) {
        const tops = gearTops(set.gears, overallRatio(c, i, combo), dry(c),
                              c.engine.redline);
        assert.ok(tops.every(v => Number.isFinite(v) && v > 0),
          `${slug} set ${i} produced ${tops}`);
      }
    });
  }
});

// --- the page-wide rev ceiling ----------------------------------------------------------

test('ceilingOf: the state ceiling, or the rev limit when there is none', async () => {
  const { ceilingOf } = await import('../js/gearing.js');
  const car = { engine: { redline: 8750 } };
  assert.equal(ceilingOf(car, { ceil: 7000 }), 7000);
  assert.equal(ceilingOf(car, { ceil: 8750 }), 8750);
  assert.equal(ceilingOf(car, {}), 8750);
  assert.equal(ceilingOf(car, undefined), 8750);
});

// --- the rev limit and the factor, as published ------------------------------------------

test('every car carries the fitted factor the site defaults to', () => {
  for (const { slug } of index.cars) {
    assert.equal(car(slug).defaults.loaded_radius_factor, DEFAULT_FACTOR, slug);
  }
});

test('every car has a whole-rpm rev limit in range, with a source the page knows', () => {
  for (const { slug } of index.cars) {
    const e = car(slug).engine;
    assert.ok(Number.isInteger(e.redline) && e.redline >= 2000 && e.redline <= 15000, slug);
    assert.ok(['measured', 'estimated', 'measured-stale'].includes(e.redline_source), slug);
  }
});

test('the 206 WRC is published on the Xsara WRC curve, with its own gearing', () => {
  const p206 = car('peugeot-206-wrc-1999');
  const xsara = car('citroen-xsara-wrc-2003');
  assert.ok(index.cars.some(c => c.slug === 'peugeot-206-wrc-1999'));
  assert.equal(index.cars.length, 18);
  assert.deepEqual(p206.engine.curve, xsara.engine.curve);
  assert.equal(p206.engine.curve_source, 'CitroenXsaraWRC');
  assert.equal(p206.engine.curve_from.slug, 'citroen-xsara-wrc-2003');
  assert.equal(xsara.engine.curve_from, null);
  assert.equal(p206.gear_sets.length, 4);
  assert.equal(p206.engine.redline, 7400);
});

test('withRevLimit swaps the limit without touching the data', async () => {
  const { withRevLimit } = await import('../js/gearing.js');
  const data = { slug: 'x', engine: { redline: 8450, curve: [[0, 0, 0]] }, gear_sets: [] };
  assert.equal(withRevLimit(data, 8450), data);
  assert.equal(withRevLimit(data, undefined), data);
  const edited = withRevLimit(data, 7000);
  assert.equal(edited.engine.redline, 7000);
  assert.equal(edited.engine.curve, data.engine.curve);
  assert.equal(edited.gear_sets, data.gear_sets);
  assert.equal(data.engine.redline, 8450);
});
