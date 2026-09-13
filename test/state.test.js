import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { defaultState, floorBounds, parseFloor, parseHash, stepFloor, toHash }
  from '../js/state.js';
import { finalDriveCombos } from '../js/gearing.js';
import { layout } from '../js/charts/finalDrive.js';

const set = (label, primary) => ({ label, gears: [], primary: { name: primary, value: 1 } });

const car = {
  gear_sets: [set('Gear set 1', 'b'), set('Gear set 2', 'b'), set('Gear set 3', 'b')],
  engine: { redline: 8750 },
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
  const s = { surface: 'Gravel', fd: 2, set: 1, draw: [0, 2], k: 0.97, floor: 3500 };
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

// --- the Shift points rev floor -------------------------------------------------------

test('the rev floor defaults to 3000 and stays out of the hash at that value', () => {
  assert.equal(defaultState(car).floor, 3000);
  assert.doesNotMatch(toHash(defaultState(car), car), /floor=/);
});

test('a non-default rev floor round-trips through the hash', () => {
  const s = { ...defaultState(car), floor: 4200 };
  assert.match(toHash(s, car), /floor=4200/);
  assert.deepEqual(parseHash(toHash(s, car), car), s);
  assert.equal(parseHash('#floor=0', car).floor, 0);
  assert.equal(parseHash('#floor=8650', car).floor, 8650);
});

test('an out-of-range or garbage rev floor falls back to the default', () => {
  for (const raw of ['8651', '8750', '99999', '-100', '3000.5', '35abc', 'banana', '', '1e3']) {
    assert.equal(parseHash(`#floor=${raw}`, car).floor, 3000, raw);
  }
});

test('a typed rev floor accepts any whole number from 0 to 100 under the limit', () => {
  assert.equal(parseFloor('3050', car), 3050);
  assert.equal(parseFloor(' 0 ', car), 0);
  assert.equal(parseFloor('8650', car), 8650);
  for (const raw of ['8651', '-1', '2.5', 'abc', '', '1e3', null]) {
    assert.equal(parseFloor(raw, car), null, String(raw));
  }
});

test('the buttons step the rev floor by 100 from where it is and clamp at the bounds', () => {
  assert.equal(stepFloor(3000, 1, car), 3100);
  assert.equal(stepFloor(3000, -1, car), 2900);
  assert.equal(stepFloor(3050, 1, car), 3150);
  assert.equal(stepFloor(50, -1, car), 0);
  assert.equal(stepFloor(0, -1, car), 0);
  assert.equal(stepFloor(8600, 1, car), 8650);
  assert.equal(stepFloor(8650, 1, car), 8650);
  assert.deepEqual(floorBounds(car), { min: 0, max: 8650 });
});
