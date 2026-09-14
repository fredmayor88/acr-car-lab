import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAP_SLOP, coarseClick, isDrag, isTap, leaveRedraws, movesHover, touchStep }
  from '../js/hover.js';

test('a mouse with no button down hovers; with one down it does not', () => {
  assert.equal(movesHover({ pointerType: 'mouse', buttons: 0 }), true);
  assert.equal(movesHover({ pointerType: 'mouse', buttons: 1 }), false);
});

test('a touch never hovers on pointermove alone, in contact or not', () => {
  assert.equal(movesHover({ pointerType: 'touch', buttons: 1 }), false);
  assert.equal(movesHover({ pointerType: 'touch', buttons: 0 }), false);
});

test('a pen hovers above the screen, not with its tip down', () => {
  assert.equal(movesHover({ pointerType: 'pen', buttons: 0 }), true);
  assert.equal(movesHover({ pointerType: 'pen', buttons: 1 }), false);
});

test('pointerleave redraws only when a readout is showing, and never for a finger', () => {
  assert.equal(leaveRedraws(null, 'mouse'), false);
  assert.equal(leaveRedraws(undefined, 'mouse'), false);
  assert.equal(leaveRedraws({ lane: 0, speed: 40 }, 'mouse'), true);
  assert.equal(leaveRedraws(0, 'mouse'), true);   // the power chart's hover is a bare rpm
  assert.equal(leaveRedraws({ lane: 0, speed: 40 }, 'pen'), true);
  assert.equal(leaveRedraws({ lane: 0, speed: 40 }, 'touch'), false, 'a lift leaves it shown');
  assert.equal(leaveRedraws(0, 'touch'), false);
});

test('coarseClick: the pointerdown decides, then the click, then the media query', () => {
  assert.equal(coarseClick('touch', 'touch', false), true);
  assert.equal(coarseClick('mouse', 'mouse', true), false, 'a mouse on a touch laptop');
  assert.equal(coarseClick('touch', 'mouse', false), true, 'a WebKit tap whose click says mouse');
  assert.equal(coarseClick('pen', 'pen', false), true, 'a pen gets the finger-sized target');
  assert.equal(coarseClick('', 'touch', false), true);
  assert.equal(coarseClick('', 'mouse', true), false);
  assert.equal(coarseClick('', '', true), true, 'nothing known, coarse device');
  assert.equal(coarseClick('', undefined, false), false, 'nothing known, fine device');
});

test('isDrag: sideways beyond the slop; not within it, and not mostly vertical', () => {
  const o = { x: 100, y: 100 };
  assert.equal(isDrag(o, { x: 100 + TAP_SLOP, y: 100 }), false, 'at the slop is still a tap');
  assert.equal(isDrag(o, { x: 100 + TAP_SLOP + 1, y: 100 }), true);
  assert.equal(isDrag(o, { x: 100 - TAP_SLOP - 1, y: 100 }), true, 'leftwards too');
  assert.equal(isDrag(o, { x: 100 + 20, y: 100 + 30 }), false, 'mostly vertical: a scroll');
  assert.equal(isDrag(o, { x: 100 + 20, y: 100 + 20 }), true, 'a diagonal counts');
});

test('isTap: a lift within the slop of the touchdown, in any direction', () => {
  const o = { x: 50, y: 50 };
  assert.equal(isTap(o, o), true);
  assert.equal(isTap(o, { x: 56, y: 58 }), true);   // 10px away
  assert.equal(isTap(o, { x: 50, y: 61 }), false);
});

// a whole gesture through touchStep, collecting the positions it draws at
const run = (events) => {
  let gesture = null;
  const draws = [];
  for (const ev of events) {
    const step = touchStep(gesture, ev);
    gesture = step.gesture;
    if (step.draw) draws.push(ev.type + '@' + ev.x);
  }
  return { draws, gesture };
};

test('touchStep: a still tap draws once, on lift, never on the way down', () => {
  const down = touchStep(null, { type: 'pointerdown', x: 10, y: 10, lane: false });
  assert.equal(down.draw, false);
  assert.deepEqual(run([
    { type: 'pointerdown', x: 10, y: 10, lane: false },
    { type: 'pointerup', x: 10, y: 10 },
  ]), { draws: ['pointerup@10'], gesture: null });
});

test('touchStep: a tap that wobbles within the slop draws only on lift', () => {
  assert.deepEqual(run([
    { type: 'pointerdown', x: 10, y: 10, lane: false },
    { type: 'pointermove', x: 14, y: 11 },
    { type: 'pointermove', x: 10 + TAP_SLOP, y: 12 },
    { type: 'pointerup', x: 12, y: 11 },
  ]).draws, ['pointerup@12']);
});

test('touchStep: a drag draws on every move past the slop, and not again on lift', () => {
  assert.deepEqual(run([
    { type: 'pointerdown', x: 10, y: 10, lane: false },
    { type: 'pointermove', x: 15, y: 10 },
    { type: 'pointermove', x: 30, y: 10 },
    { type: 'pointermove', x: 18, y: 10 },   // back inside the slop: still a drag
    { type: 'pointermove', x: 60, y: 12 },
    { type: 'pointerup', x: 60, y: 12 },
  ]).draws, ['pointermove@30', 'pointermove@18', 'pointermove@60']);
});

test('touchStep: a gesture that starts on a lane name never draws', () => {
  assert.deepEqual(run([
    { type: 'pointerdown', x: 10, y: 10, lane: true },
    { type: 'pointermove', x: 11, y: 10 },
    { type: 'pointerup', x: 11, y: 10 },
  ]).draws, [], 'a lane tap');
  assert.deepEqual(run([
    { type: 'pointerdown', x: 10, y: 10, lane: true },
    { type: 'pointermove', x: 80, y: 10 },
    { type: 'pointermove', x: 120, y: 10 },
    { type: 'pointerup', x: 120, y: 10 },
  ]).draws, [], 'even dragged off the name');
});

test('touchStep: a cancelled gesture (the page scrolled) draws nothing', () => {
  assert.deepEqual(run([
    { type: 'pointerdown', x: 10, y: 10, lane: false },
    { type: 'pointermove', x: 12, y: 30 },
    { type: 'pointercancel', x: 12, y: 30 },
    { type: 'pointerup', x: 12, y: 30 },
  ]), { draws: [], gesture: null });
});

test('touchStep: moves and lifts with no touchdown seen draw nothing', () => {
  assert.deepEqual(run([
    { type: 'pointermove', x: 80, y: 10 },
    { type: 'pointerup', x: 80, y: 10 },
  ]).draws, []);
});
