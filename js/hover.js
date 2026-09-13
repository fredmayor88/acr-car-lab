// When a pointer may redraw a chart's hover readout. Pure: takes plain event-shaped data.
//
// A redraw replaces every node in the chart. If it lands between a finger going down on a
// lane name and the click that tap produces, the node the tap started on is gone: WebKit
// (every browser on iOS) then drops the tap, and Chromium only survives it by hit-testing
// again. A touch pointer fires pointermove while in contact and pointerleave on every lift,
// so a tap on a lane name used to redraw the chart once or twice before its click.

/** A pointermove draws a readout only from a pointer that is hovering: never a touch, and
 *  never while a button or a pen tip is down. */
export const movesHover = e => e.pointerType !== 'touch' && !e.buttons;

/** A pointerleave redraws only when there is a readout to take away. */
export const leaveRedraws = current => current !== null && current !== undefined;

/**
 * Whether a click came from a coarse pointer. The pointerdown that started it is the most
 * reliable witness (a WebKit tap can arrive as a mouse-typed click); then the click's own
 * type; with neither, whether the device's primary pointer is coarse.
 */
export function coarseClick(downType, clickType, mediaCoarse) {
  const type = downType || clickType;
  return type ? type !== 'mouse' : !!mediaCoarse;
}
