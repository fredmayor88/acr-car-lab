// The averaged-axle cars (Delta Integrale, 206 WRC, Impreza, Xsara WRC, Audi Quattro): every
// ratio setting, the averaged front and rear chains below the gearbox (ruling R51), their
// state and links, the Final drive chart rows, the notes and the copied text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_FACTOR, averagedBelow, circumference, finalDriveCombos, gearTops,
  hasRatioSettings, matchingRow, primaryIndex, rowRatios, selectedRow, stockRatios }
  from '../js/gearing.js';
import { defaultState, parseHash, pickRow, setPrimary, setRatio, toHash } from '../js/state.js';
import { axleWarning, finalDriveReadout, formulaNote, layout } from '../js/charts/finalDrive.js';
import { fdValue } from '../js/charts/ladder.js';
import { settingsText } from '../js/settingsText.js';

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));
const slugs = readdirSync(new URL('../data/', import.meta.url))
  .filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.slice(0, -5));

const DELTA = 'lancia-delta-integrale-evoluzione-1992';
const P206 = 'peugeot-206-wrc-1999';
const IMPREZA = 'subaru-impreza-555-s3-1993';
const XSARA = 'citroen-xsara-wrc-2003';
const AUDI = 'audi-quattro-gr4-1981';
const FIVE = [DELTA, P206, IMPREZA, XSARA, AUDI];

const near = (a, b, eps) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);
/** The step index of a spelling in one setting. */
const step = (car, key, name) => car.final_drive.settings.find(s => s.key === key)
  .steps.findIndex(st => st.name === name);
/** A state with settings given by spelling: `{ key: '55//12' }`. */
const withSteps = (car, spelled, state = defaultState(car)) => {
  let out = state;
  for (const [key, name] of Object.entries(spelled)) out = setRatio(car, out, key, step(car, key, name));
  return out;
};

test('exactly the five averaged-axle cars publish ratio settings', () => {
  assert.deepEqual(slugs.filter(s => hasRatioSettings(load(s))).sort(), [...FIVE].sort());
  for (const slug of slugs.filter(s => !FIVE.includes(s))) {
    assert.equal(defaultState(load(slug)).ratios, undefined, slug);
  }
});

test('settings in the game order, with the keys the links carry', () => {
  const keys = slug => load(slug).final_drive.settings.map(s => `${s.key}:${s.adjustment}`);
  assert.deepEqual(keys(DELTA), ['cdr:Center Differential Ratio', 'ctr:Center Ratio to Rear',
    'drr:Differential Ratio Rear']);
  assert.deepEqual(keys(P206), ['dfr:Differential Ratio Front', 'cdr:Center Differential Ratio',
    'drr:Differential Ratio Rear']);
  assert.deepEqual(keys(IMPREZA), ['dfr:Differential Ratio Front', 'ctr:Center Ratio to Rear',
    'drr:Differential Ratio Rear']);
  assert.deepEqual(keys(XSARA), ['cdr:Center Differential Ratio']);
  assert.deepEqual(keys(AUDI), ['dfr:Differential Ratio Front', 'drr:Differential Ratio Rear']);
});

test('stock below the gearbox is the mean of the front and rear chains', () => {
  const stock = slug => { const c = load(slug); return averagedBelow(c.final_drive, stockRatios(c.final_drive)); };
  near(stock(DELTA), 51 / 13 * (1 + 13 / 34 * 30 / 12) / 2, 1e-12);
  near(stock(P206), 46 / 14 * 26 / 16, 1e-12);
  near(stock(IMPREZA), 35 / 9, 1e-12);
  near(stock(XSARA), 37 / 26 * (75 / 27 + 26 / 28 * 27 / 9) / 2, 1e-12);
  near(stock(AUDI), 37 / 10, 1e-12);
});

test('rest x option still gives below with every other setting at stock', () => {
  for (const slug of FIVE) {
    const fd = load(slug).final_drive;
    fd.options.forEach((o, i) => near(averagedBelow(fd, rowRatios(fd, stockRatios(fd), i)),
      fd.rest * o.value, 1e-12));
  }
});

test('the formula follows each setting: the Delta run with 17//38 and 34//13', () => {
  const delta = load(DELTA);
  const s = withSteps(delta, { cdr: '55//12', ctr: '17//38', drr: '34//13' });
  near(averagedBelow(delta.final_drive, s.ratios), 55 / 12 * (1 + 17 / 38 * 34 / 13) / 2, 1e-12);
});

// --- state and links ------------------------------------------------------------------------

test('the default state opens on stock settings and its link names none of them', () => {
  for (const slug of FIVE) {
    const car = load(slug);
    const s = defaultState(car);
    assert.deepEqual(s.ratios, stockRatios(car.final_drive), slug);
    assert.equal(selectedRow(car, s), s.fd, slug);
    const hash = toHash(s, car);
    assert.doesNotMatch(hash, /(^|[#&])(fd|pg|cdr|ctr|ctf|dfr|drr)=/, slug);
    assert.deepEqual(parseHash(hash, car), s, slug);
  }
});

test('one key per setting off stock, as its step index, and the link round-trips', () => {
  const car = load(DELTA);
  const s = withSteps(car, { ctr: '17//38', drr: '34//13' });
  const hash = toHash(s, car);
  assert.match(hash, new RegExp(`&ctr=${step(car, 'ctr', '17//38')}&drr=${step(car, 'drr', '34//13')}`));
  assert.doesNotMatch(hash, /cdr=|fd=/);
  assert.deepEqual(parseHash(hash, car), s);
});

test('the 206: Primary Gear as pg, both diffs apart, round-trips', () => {
  const car = load(P206);
  const s = setPrimary(car, withSteps(car, { dfr: '43//13*21//13', drr: '40//18*26//16',
    cdr: '31//21' }), 1);
  const hash = toHash(s, car);
  assert.match(hash, /pg=1/);
  assert.match(hash, /dfr=0/);
  assert.deepEqual(parseHash(hash, car), s);
  assert.equal(primaryIndex(car, parseHash(hash, car)), 1);
});

test('an old fd=N link picks Final drive chart row N: primary and both diffs, the rest at stock', () => {
  const car = load(P206);
  // rows are primaries x [46//14*26//16, 40//18*26//16]: fd=3 is 22//24 with 40//18*26//16
  const s = parseHash('#s=Tarmac_Dry&fd=3&set=0&draw=0', car);
  assert.equal(car.final_drive.primaries[primaryIndex(car, s)].name, '22//24');
  assert.equal(s.ratios.dfr, step(car, 'dfr', '40//18*26//16'));
  assert.equal(s.ratios.drr, step(car, 'drr', '40//18*26//16'));
  assert.equal(s.ratios.cdr, defaultState(car).ratios.cdr);
  assert.equal(selectedRow(car, s), 3);
  assert.equal(layout(car, s).rows.find(r => r.selected).index, 3);
  // and the link it writes back reads the same
  assert.deepEqual(parseHash(toHash(s, car), car), s);
});

test('an old fd=N link on the Delta sets its centre differential', () => {
  const car = load(DELTA);
  const s = parseHash('#fd=0', car);
  assert.equal(s.ratios.cdr, step(car, 'cdr', '55//12'));
  assert.equal(s.fd, 0);
});

test('a setting key overrides what an old fd link set; invalid values fall back', () => {
  const car = load(P206);
  const s = parseHash('#fd=1&dfr=0', car);
  assert.equal(s.ratios.dfr, 0);
  assert.equal(s.ratios.drr, step(car, 'drr', '40//18*26//16'));
  const stock = defaultState(car);
  for (const bad of ['#dfr=9', '#dfr=-1', '#dfr=x', '#cdr=1.5', '#pg=7', '#drr=']) {
    assert.deepEqual(parseHash(bad, car), stock, bad);
  }
});

// --- rows, highlight and the chart -----------------------------------------------------------

test('a row click sets the row settings together and holds every other one', () => {
  const car = load(IMPREZA);
  const s = withSteps(car, { ctr: '22//28' });
  const picked = pickRow(car, s, 0);   // 36//7 on both diffs
  assert.equal(picked.ratios.dfr, step(car, 'dfr', '36//7'));
  assert.equal(picked.ratios.drr, step(car, 'drr', '36//7'));
  assert.equal(picked.ratios.ctr, s.ratios.ctr);
  assert.equal(selectedRow(car, picked), 0);
});

test('front and rear apart: no row is highlighted', () => {
  const car = load(IMPREZA);
  const s = withSteps(car, { dfr: '31//9', drr: '48//11' });
  assert.equal(matchingRow(car.final_drive, s.ratios), -1);
  assert.equal(selectedRow(car, s), -1);
  assert.equal(layout(car, s).rows.filter(r => r.selected).length, 0);
});

test('chart rows hold the other settings: the Impreza rows move with Center Ratio to Rear', () => {
  const car = load(IMPREZA);
  const stock = layout(car, defaultState(car)).rows;
  const s = withSteps(car, { ctr: '22//28' });
  const rows = layout(car, s).rows;
  const circ = circumference(car.tyres.Tarmac_Dry.free_radius, DEFAULT_FACTOR);
  const top = Math.min(...car.gear_sets[0].gears.map(g => g.value));
  for (const r of rows) {
    const ratios = rowRatios(car.final_drive, s.ratios, r.index);
    const below = averagedBelow(car.final_drive, ratios);
    near(r.value, car.gear_sets[0].primary.value * below, 1e-12);
    near(r.kmh, car.engine.redline * circ * 0.06 / (top * r.value), 1e-9);
  }
  assert.ok(rows[0].value < stock[0].value, 'a taller centre-to-rear ratio lowers every row');
  assert.equal(rows[0].pct, 100);
});

test('every chart reads the settings: the ladder tops follow Center Ratio to Rear', () => {
  const car = load(DELTA);
  const stock = defaultState(car);
  const s = withSteps(car, { ctr: '17//38' });
  const circ = circumference(car.tyres.Tarmac_Dry.free_radius, DEFAULT_FACTOR);
  const tops = state => gearTops(car.gear_sets[0].gears, fdValue(car, state), circ, car.engine.redline);
  near(fdValue(car, s) / fdValue(car, stock),
    (1 + 17 / 38 * 30 / 12) / (1 + 13 / 34 * 30 / 12), 1e-12);
  assert.ok(tops(s).at(-1) < tops(stock).at(-1));
});

test('without ratios in the state the combos keep the stock path', () => {
  const fd = load(DELTA).final_drive;
  finalDriveCombos(fd).forEach((c, i) => assert.equal(c.below, fd.rest * fd.options[i].value));
});

// --- the notes, the readout and the copied text -----------------------------------------------

test('each car names its formula under the Final drive caption; no other car has a note', () => {
  assert.equal(formulaNote(load(DELTA)), 'Final drive = average of the front axle (Center '
    + 'Differential Ratio) and the rear axle (Center Differential Ratio × Center Ratio to Rear × '
    + 'Differential Ratio Rear).');
  assert.equal(formulaNote(load(P206)), 'Final drive = Center Differential Ratio × average of '
    + 'Differential Ratio Front and Differential Ratio Rear.');
  assert.equal(formulaNote(load(IMPREZA)), 'Final drive = average of Differential Ratio Front '
    + 'and Center Ratio to Rear × Differential Ratio Rear.');
  assert.equal(formulaNote(load(XSARA)), 'Final drive = Center Differential Ratio × 2.782 (the '
    + 'front and rear differentials are fixed).');
  assert.equal(formulaNote(load(AUDI)), 'Final drive = average of Differential Ratio Front and '
    + 'Differential Ratio Rear.');
  for (const slug of slugs.filter(s => !FIVE.includes(s))) assert.equal(formulaNote(load(slug)), '');
});

test('the Audi warns only while front and rear differ; no other car ever warns', () => {
  const audi = load(AUDI);
  assert.equal(axleWarning(audi, defaultState(audi)), '');
  const apart = withSteps(audi, { dfr: '39//8' });
  assert.equal(axleWarning(audi, apart), 'No centre differential: different front and rear '
    + 'ratios make the axles fight and the car hard to control.');
  assert.equal(axleWarning(audi, withSteps(audi, { drr: '39//8' }, apart)), '');
  const imp = load(IMPREZA);
  assert.equal(axleWarning(imp, withSteps(imp, { dfr: '31//9' })), '');
});

test('the readout is below the gearbox only, two decimals', () => {
  const car = load(P206);
  assert.equal(finalDriveReadout(car, defaultState(car)), 'final drive 5.34');
  assert.equal(finalDriveReadout(car, setPrimary(car, defaultState(car), 1)), 'final drive 5.34');
  const delta = load(DELTA);
  assert.equal(finalDriveReadout(delta, defaultState(delta)), 'final drive 3.84');
});

test('Copy settings lists every ratio setting by game name, and Primary Gear on the 206', () => {
  const car = load(P206);
  const s = withSteps(car, { dfr: '43//13*21//13', drr: '40//18*26//16' });
  const lines = settingsText(car, s, 'URL').split('\n');
  assert.deepEqual(lines.slice(0, 6), [
    'Peugeot 206 WRC 1999',
    'Gear set: Gear set 1 (5-speed)',
    'Primary Gear: 21//24',
    'Differential Ratio Front: 43//13*21//13',
    'Center Differential Ratio: 24//24',
    'Differential Ratio Rear: 40//18*26//16',
  ]);
  assert.equal(lines.at(-1), 'URL');
  const delta = load(DELTA);
  assert.deepEqual(settingsText(delta, defaultState(delta)).split('\n').slice(2, 5), [
    'Center Differential Ratio: 51//13',
    'Center Ratio to Rear: 13//34',
    'Differential Ratio Rear: 30//12',
  ]);
});

// --- Fred's speed runs (ruling R51), through the site's own modules ------------------------------

const RUNS = [
  [P206, 0, { pg: '21//24', dfr: '46//14*26//16', drr: '46//14*26//16', cdr: '24//24' }, [64, 93, 127, 164], [4]],
  [P206, 2, { pg: '22//24', dfr: '46//14*26//16', drr: '46//14*26//16', cdr: '24//24' }, [57, 75, 96, 119, 143]],
  [P206, 2, { pg: '22//24', dfr: '46//14*26//16', drr: '46//14*26//16', cdr: '31//21' }, [38, 52, 65, 80, 98, 119]],
  [P206, 2, { pg: '22//24', dfr: '43//13*21//13', drr: '40//18*26//16', cdr: '24//24' }, [68, 89, 114, 142]],
  [DELTA, 0, { cdr: '55//12', ctr: '13//34', drr: '34//14' }, [60, 77, 100, 128, 152, 180]],
  [DELTA, 0, { cdr: '55//12', ctr: '17//38', drr: '34//13' }, [53, 69, 90, 113, 135, 160]],
  [IMPREZA, 0, { dfr: '36//7', ctr: '31//31', drr: '31//9' }, [65, 89, 109, 131, 155]],
  [IMPREZA, 0, { dfr: '31//9', ctr: '22//28', drr: '48//11' }, [81, 110, 136, 164]],
];

test('every measured gear 2+ of the eight settings runs is within 3% on the page', () => {
  for (const [slug, set, { pg, ...spelled }, kmh, exclude = []] of RUNS) {
    const car = load(slug);
    let s = { ...withSteps(car, spelled), set };
    if (pg) s = setPrimary(car, s, car.final_drive.primaries.findIndex(p => p.name === pg));
    const circ = circumference(car.tyres.Tarmac_Dry.free_radius, car.defaults.loaded_radius_factor);
    const tops = gearTops(car.gear_sets[set].gears, fdValue(car, s), circ, car.engine.redline);
    kmh.forEach((m, i) => {
      if (i === 0 || exclude.includes(i + 1)) return;
      assert.ok(Math.abs(tops[i] - m) / m < 0.03, `${slug} set ${set + 1} gear ${i + 1}: ${tops[i]} vs ${m}`);
    });
  }
});

test('chart modules import no page state: selectedRow and primaryIndex live in gearing.js', () => {
  for (const f of readdirSync(new URL('../js/charts/', import.meta.url))) {
    const src = readFileSync(new URL(`../js/charts/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /from '\.\.\/state\.js'/, f);
  }
});
