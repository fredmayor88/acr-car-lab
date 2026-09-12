import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { defaultState, parseHash, toHash } from '../js/state.js';
import { finalDriveCombos } from '../js/gearing.js';
import { layout } from '../js/charts/finalDrive.js';

const set = (label, primary) => ({ label, gears: [], primary: { name: primary, value: 1 } });

const car = {
  gear_sets: [set('Gear set 1', 'b'), set('Gear set 2', 'b'), set('Gear set 3', 'b')],
  final_drive: {
    primaries: [{ name: 'a', value: 1.375 }, { name: 'b', value: 1.1 }],
    options: [{ name: 'x', value: 3.8 }, { name: 'y', value: 3.4 }],
    stock_option: 'y', rest: 1,
  },
  tyres: { Tarmac_Dry: {}, Gravel: {} },
  defaults: { loaded_radius_factor: 0.9562 },
};

test('the default state is dry tarmac, first gear set, first set drawn', () => {
  const s = defaultState(car);
  assert.equal(s.surface, 'Tarmac_Dry');
  assert.equal(s.set, 0);
  assert.deepEqual(s.draw, [0]);
  assert.equal(s.k, 0.9562);
});

test('exactly one gear set is drawn by default', () => {
  assert.equal(defaultState(car).draw.length, 1);
});

test('a full hash round-trips', () => {
  const s = { surface: 'Gravel', fd: 2, set: 1, draw: [0, 2], k: 0.97 };
  assert.deepEqual(parseHash(toHash(s, car), car), s);
});

test('a surface the car does not have falls back to the default', () => {
  assert.equal(parseHash('#s=Sweden', car).surface, 'Tarmac_Dry');
});

test('a surface that is not a real key falls back to the default', () => {
  assert.equal(parseHash('#s=Moon', car).surface, 'Tarmac_Dry');
});

test('an out-of-range gear set falls back to the default', () => {
  assert.equal(parseHash('#set=99', car).set, 0);
  assert.equal(parseHash('#set=-1', car).set, 0);
  assert.equal(parseHash('#set=banana', car).set, 0);
});

test('an out-of-range final drive falls back to the default', () => {
  assert.equal(parseHash('#fd=999', car).fd, defaultState(car).fd);
});

test('drawn sets drop out-of-range entries and never end up empty', () => {
  assert.deepEqual(parseHash('#draw=0,99', car).draw, [0]);
  assert.deepEqual(parseHash('#draw=99', car).draw, [0]);
  assert.deepEqual(parseHash('#draw=', car).draw, [0]);
});

test('drawn sets are de-duplicated and sorted', () => {
  assert.deepEqual(parseHash('#draw=2,0,2', car).draw, [0, 2]);
});

test('the factor is clamped to a sane range', () => {
  assert.equal(parseHash('#k=0', car).k, 0.9562);
  assert.equal(parseHash('#k=-3', car).k, 0.9562);
  assert.equal(parseHash('#k=99', car).k, 0.9562);
  assert.equal(parseHash('#k=1.02', car).k, 1.02);
});

test('an empty hash gives the default state', () => {
  assert.deepEqual(parseHash('', car), defaultState(car));
  assert.deepEqual(parseHash('#', car), defaultState(car));
});

test('a car with no adjustable final drive still parses', () => {
  const plain = { ...car, final_drive: null };
  assert.equal(parseHash('#fd=3', plain).fd, 0);
});

test('the stock combo matches the fitted primary, not just the option', () => {
  // stock option 'y' pairs with both primaries; the gear sets are fitted with 'b'
  const combos = finalDriveCombos(car.final_drive);
  const stock = combos[defaultState(car).fd];
  assert.equal(stock.option.name, 'y');
  assert.equal(stock.primary.name, 'b');
});

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));

test('the Stratos opens on its real stock combo: 33//31*31//30 with 65//19, 215 km/h', () => {
  const stratos = load('lancia-stratos');
  const state = defaultState(stratos);
  const stock = finalDriveCombos(stratos.final_drive)[state.fd];
  assert.equal(stock.primary.name, '33//31*31//30');
  assert.equal(stock.option.name, '65//19');
  const row = layout(stratos, state).rows.find(r => r.selected);
  assert.equal(Math.round(row.kmh), 215);
});

test('every car opens on a combo carrying its stock option and fitted primary', () => {
  const slugs = readdirSync(new URL('../data/', import.meta.url))
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.slice(0, -5));
  for (const slug of slugs) {
    const c = load(slug);
    const state = defaultState(c);
    if (!c.final_drive) {
      assert.equal(state.fd, 0, slug);
      continue;
    }
    const combos = finalDriveCombos(c.final_drive);
    const stock = combos[state.fd];
    assert.equal(stock.option.name, c.final_drive.stock_option, slug);
    if (stock.primary) {
      assert.equal(stock.primary.name, c.gear_sets[0].primary.name, slug);
    }
    // and it is the row the chart highlights
    assert.equal(layout(c, state).rows.filter(r => r.selected).length, 1, slug);
  }
});
