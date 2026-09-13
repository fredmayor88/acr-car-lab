import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveRedraws, movesHover } from '../js/hover.js';

test('a mouse with no button down hovers; with one down it does not', () => {
  assert.equal(movesHover({ pointerType: 'mouse', buttons: 0 }), true);
  assert.equal(movesHover({ pointerType: 'mouse', buttons: 1 }), false);
});

test('a touch never hovers, in contact or not', () => {
  assert.equal(movesHover({ pointerType: 'touch', buttons: 1 }), false);
  assert.equal(movesHover({ pointerType: 'touch', buttons: 0 }), false);
});

test('a pen hovers above the screen, not with its tip down', () => {
  assert.equal(movesHover({ pointerType: 'pen', buttons: 0 }), true);
  assert.equal(movesHover({ pointerType: 'pen', buttons: 1 }), false);
});

test('pointerleave redraws only when a readout is showing', () => {
  assert.equal(leaveRedraws(null), false);
  assert.equal(leaveRedraws(undefined), false);
  assert.equal(leaveRedraws({ lane: 0, speed: 40 }), true);
  assert.equal(leaveRedraws(0), true);   // the power chart's hover is a bare rpm
});
