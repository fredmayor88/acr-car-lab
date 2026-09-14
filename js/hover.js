// When a pointer may redraw a chart's hover readout. Pure: takes plain event-shaped data.
//
// A redraw replaces every node in the chart. If it lands between a finger going down on a
// lane name and the click that tap produces, the node the tap started on is gone: WebKit
// (every browser on iOS) then drops the tap, and Chromium only survives it by hit-testing
// again. A touch pointer fires pointermove while in contact and pointerleave on every lift,
// so a finger never redraws on those alone: it goes through `touchStep` instead.

/** A pointermove draws a readout only from a pointer that is hovering: never a touch (see
 *  touchStep), and never while a button or a pen tip is down. */
export const movesHover = e => e.pointerType !== 'touch' && !e.buttons;

/** A pointerleave redraws only when there is a readout to take away, and never for a touch:
 *  a finger leaves on every lift, and a tapped readout stays until the next tap. */
export const leaveRedraws = (current, pointerType) =>
  pointerType !== 'touch' && current !== null && current !== undefined;

/**
 * Whether a click came from a coarse pointer. The pointerdown that started it is the most
 * reliable witness (a WebKit tap can arrive as a mouse-typed click); then the click's own
 * type; with neither, whether the device's primary pointer is coarse.
 */
export function coarseClick(downType, clickType, mediaCoarse) {
  const type = downType || clickType;
  return type ? type !== 'mouse' : !!mediaCoarse;
}

/** How far a finger may move, in CSS pixels, and still be a tap. */
export const TAP_SLOP = 10;

/** A finger moved from `from` to `to` far enough sideways to be scrubbing, not tapping. The
 *  chart only gets sideways moves anyway: a vertical one scrolls the page (touch-action). */
export const isDrag = (from, to) => {
  const dx = Math.abs(to.x - from.x);
  return dx > TAP_SLOP && dx >= Math.abs(to.y - from.y);
};

/** A finger that went down at `from` and lifted at `to` without moving beyond the slop. */
export const isTap = (from, to) => Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP;

/**
 * One touch pointer event on a hover chart, as a step of that finger's gesture.
 *
 * `gesture` is null or `{ x, y, lane, dragging }`; `ev` is `{ type, x, y, lane }` with `type`
 * a pointer event name, x/y client pixels, and `lane` (pointerdown only) whether the finger
 * went down on a lane name. Returns the next gesture and whether to draw the readout at ev.
 *
 * - pointerdown never draws: nothing is redrawn before a tap's click can arrive.
 * - pointermove draws only once the finger has moved sideways beyond the slop (a drag), and
 *   then on every move, so the readout follows the finger.
 * - pointerup draws for a tap, the readout staying after the finger lifts. After a drag the
 *   readout is already where the finger was.
 * - A gesture that started on a lane name never draws: that tap selects a gear set, and a
 *   redraw between its pointerdown and its click is what WebKit drops a tap for.
 * - pointercancel (the page took the gesture to scroll) ends it without drawing.
 */
export function touchStep(gesture, ev) {
  switch (ev.type) {
    case 'pointerdown':
      return { gesture: { x: ev.x, y: ev.y, lane: !!ev.lane, dragging: false }, draw: false };
    case 'pointermove': {
      if (!gesture || gesture.lane) return { gesture, draw: false };
      const dragging = gesture.dragging || isDrag(gesture, ev);
      return { gesture: { ...gesture, dragging }, draw: dragging };
    }
    case 'pointerup':
      return { gesture: null, draw: !!gesture && !gesture.lane && !gesture.dragging };
    default:
      return { gesture: null, draw: false };
  }
}
