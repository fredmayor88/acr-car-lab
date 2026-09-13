import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { barSummary, barSummaryParts } from '../js/barSummary.js';
import { defaultState, parseHash, toHash } from '../js/state.js';
import { SURFACES, finalDriveCombos } from '../js/gearing.js';
import { comboLabel } from '../js/charts/finalDrive.js';

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));
const slugs = readdirSync(new URL('../data/', import.meta.url))
  .filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.replace(/\.json$/, ''));

test('Stratos, stock: surface, primary and diff, gear set', () => {
  const car = load('lancia-stratos');
  assert.equal(barSummary(car, defaultState(car)),
    'Dry tarmac  ·  33//31*31//30  ·  65//19  ·  Gear set 1  (5-speed)');
});

test('Stratos: follows the state it is given', () => {
  const car = load('lancia-stratos');
  const state = { ...defaultState(car), surface: 'Gravel', set: 2, fd: 0 };
  const combo = finalDriveCombos(car.final_drive)[0];
  assert.equal(barSummary(car, state),
    `Gravel  ·  ${comboLabel(combo)}  ·  Gear set 3  (${car.gear_sets[2].gears.length}-speed)`);
});

test('a car with no final drive adjustment leaves that part out', () => {
  const car = load('hyundai-i20-rally2-2021');
  const state = defaultState(car);
  const parts = barSummary(car, state).split('  ·  ');
  assert.equal(parts.length, 2);
  assert.equal(parts[1], `${car.gear_sets[state.set].label}  (${car.gear_sets[state.set].gears.length}-speed)`);
});

test('every car: the parts are exactly the labels the three selects show', () => {
  let fixed = 0;
  for (const slug of slugs) {
    const car = load(slug);
    const combos = car.final_drive ? finalDriveCombos(car.final_drive) : [];
    if (!combos.length) fixed++;
    car.gear_sets.forEach((set, i) => {
      const state = { ...defaultState(car), set: i, fd: Math.max(0, combos.length - 1) };
      const want = [SURFACES.find(s => s.key === state.surface).label];
      if (combos.length) want.push(comboLabel(combos[state.fd]));
      want.push(`${set.label}  (${set.gears.length}-speed)`);
      assert.equal(barSummary(car, state), want.join('  ·  '), slug);
    });
  }
  assert.equal(fixed, 4, 'four cars have no final drive adjustment');
});

test('a state read back from a link summarises the same as the state that made it', () => {
  const car = load('peugeot-306-ii-maxi-1997');
  const state = { ...defaultState(car), set: 7, surface: 'Sweden', fd: 1 };
  const back = parseHash(toHash(state, car), car);
  assert.equal(barSummary(car, back), barSummary(car, state));
  assert.match(barSummary(car, back), /^Snow  ·  .+  ·  Gear set 8  \(\d-speed\)$/);
});

test('parts say which control each one stands for', () => {
  const stratos = load('lancia-stratos');
  assert.deepEqual(barSummaryParts(stratos, defaultState(stratos)).map(p => p.key),
    ['surface', 'fd', 'set']);
  const polo = load('volkswagen-polo-gti-r5-2018');
  assert.deepEqual(barSummaryParts(polo, defaultState(polo)).map(p => p.key), ['surface', 'set']);
});

test('a lowered rev ceiling is appended; at the rev limit it is left out', () => {
  const car = load('lancia-stratos');
  const base = barSummary(car, defaultState(car));
  assert.equal(barSummary(car, { ...defaultState(car), ceil: 8750 }), base);
  assert.equal(barSummary(car, { ...defaultState(car), ceil: 7000 }), base + '  ·  ceiling 7000 rpm');
  assert.deepEqual(barSummaryParts(car, { ...defaultState(car), ceil: 7000 }).map(p => p.key),
    ['surface', 'fd', 'set', 'ceil']);
  const polo = load('volkswagen-polo-gti-r5-2018');
  assert.deepEqual(barSummaryParts(polo, { ...defaultState(polo), ceil: 6000 }).at(-1),
    { key: 'ceil', text: 'ceiling 6000 rpm' });
});
