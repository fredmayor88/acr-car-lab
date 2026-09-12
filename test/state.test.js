import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, parseHash, toHash } from '../js/state.js';

const car = {
  gear_sets: [{ label: 'Gear set 1', gears: [] }, { label: 'Gear set 2', gears: [] },
              { label: 'Gear set 3', gears: [] }],
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
