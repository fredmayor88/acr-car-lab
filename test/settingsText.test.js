import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settingsText } from '../js/settingsText.js';
import { defaultState } from '../js/state.js';
import { layout } from '../js/charts/shiftPoints.js';

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));

test('Stratos, stock: the exact text, with the primary and 215 km/h in top gear', () => {
  const car = load('lancia-stratos');
  assert.equal(settingsText(car, defaultState(car)), [
    'Lancia Stratos HF 1976',
    'Gear set: Gear set 1 (5-speed)',
    'Primary Gear: 33//31*31//30',
    'Differential Ratio Rear: 65//19',
    'Gears: 42//15 · 39//19 · 34//21 · 33//25 · 30//26',
    'Top speed per gear (Dry tarmac, 8750 rpm): 89 · 121 · 153 · 188 · 215 km/h',
  ].join('\n'));
});

test('Stratos: the selected gear set, surface and final drive are the ones named', () => {
  const car = load('lancia-stratos');
  const text = settingsText(car, { ...defaultState(car), set: 1, surface: 'Gravel', fd: 0 });
  const lines = text.split('\n');
  assert.equal(lines[1], 'Gear set: Gear set 2 (5-speed)');
  assert.equal(lines[2], 'Primary Gear: 35//30*33//28');
  assert.equal(lines[3], 'Differential Ratio Rear: 65//17');
  assert.equal(lines[4], 'Gears: 44//14 · 38//17 · 37//21 · 34//24 · 30//26');
  assert.match(lines[5], /^Top speed per gear \(Gravel, 8750 rpm\): /);
});

test('Mini: no primary selector, so no Primary Gear line, and a front differential', () => {
  const car = load('mini-cooper-s-1964');
  const state = defaultState(car);
  const lines = settingsText(car, state).split('\n');
  assert.equal(lines[0], 'Mini Cooper S 1964');
  assert.ok(!lines.some(l => l.startsWith('Primary Gear')));
  assert.equal(lines[2], 'Differential Ratio Front: 63//16');
  assert.equal(lines[3], 'Gears: ' + car.gear_sets[0].gears.map(g => g.name).join(' · '));
  assert.match(lines[4], /^Top speed per gear \(Dry tarmac, 7750 rpm\): \d+( · \d+){3} km\/h$/);
  assert.equal(lines.length, 5);
});

test('Fabia: a fixed final drive says so', () => {
  const car = load('skoda-fabia-rs-rally2-2022');
  const lines = settingsText(car, defaultState(car)).split('\n');
  assert.equal(lines[0], 'Skoda Fabia RS Rally2 2022');
  assert.equal(lines[2], 'Final drive: fixed');
  assert.ok(!lines.some(l => l.startsWith('Primary Gear')));
  assert.match(lines[4], /^Top speed per gear \(Dry tarmac, 7750 rpm\): /);
});

test('the top speeds are the same numbers the charts draw, for any set and factor', () => {
  for (const slug of ['lancia-stratos', 'mini-cooper-s-1964', 'skoda-fabia-rs-rally2-2022']) {
    const car = load(slug);
    const state = { ...defaultState(car), set: car.gear_sets.length - 1, k: 1.0 };
    const tops = layout(car, state).bars.map(b => b.to.toFixed(0)).join(' · ');
    assert.ok(settingsText(car, state).includes(`): ${tops} km/h`), slug);
  }
});

test('the rolling radius factor line appears only when it differs from the default', () => {
  const car = load('lancia-stratos');
  const state = defaultState(car);
  assert.doesNotMatch(settingsText(car, state), /Rolling radius factor/);
  const lines = settingsText(car, { ...state, k: 0.97 }).split('\n');
  assert.equal(lines[lines.length - 1], 'Rolling radius factor: 0.97');
});

test('the rev floor is not a gearing setting and stays out of the text', () => {
  const car = load('lancia-stratos');
  assert.equal(settingsText(car, { ...defaultState(car), floor: 5000 }),
               settingsText(car, defaultState(car)));
});
