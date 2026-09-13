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

test('coarseClick: the pointerdown decides, then the click, then the media query', async () => {
  const { coarseClick } = await import('../js/hover.js');
  assert.equal(coarseClick('touch', 'touch', false), true);
  assert.equal(coarseClick('mouse', 'mouse', true), false, 'a mouse on a touch laptop');
  assert.equal(coarseClick('touch', 'mouse', false), true, 'a WebKit tap whose click says mouse');
  assert.equal(coarseClick('pen', 'pen', false), true, 'a pen gets the finger-sized target');
  assert.equal(coarseClick('', 'touch', false), true);
  assert.equal(coarseClick('', 'mouse', true), false);
  assert.equal(coarseClick('', '', true), true, 'nothing known, coarse device');
  assert.equal(coarseClick('', undefined, false), false, 'nothing known, fine device');
});
