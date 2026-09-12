import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { track, resetTracking, _queue } from '../js/tracking.js';

beforeEach(() => {
  resetTracking();
  globalThis.window = {};
});

test('an event fires once and only once', () => {
  track('car-lancia-stratos');
  track('car-lancia-stratos');
  assert.equal(_queue().length, 1);
});

test('different events both queue', () => {
  track('surface-Gravel');
  track('copy-link');
  assert.equal(_queue().length, 2);
});

test('events queue when goatcounter has not loaded, rather than being lost', () => {
  track('edit-factor');
  assert.equal(_queue()[0].path, 'edit-factor');
  assert.equal(_queue()[0].event, true);
});

test('the queue drains once goatcounter arrives', () => {
  track('copy-link');
  const seen = [];
  globalThis.window.goatcounter = { count: e => seen.push(e) };
  track('pick-gearset');
  assert.deepEqual(seen.map(e => e.path), ['copy-link', 'pick-gearset']);
  assert.equal(_queue().length, 0);
});
