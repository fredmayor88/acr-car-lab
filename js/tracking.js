// GoatCounter events, deduped. Same wrapper as gremlin-curve-converter: the script loads
// async, so events raised before it arrives are queued rather than dropped.

const seen = new Set();
let queue = [];

export function resetTracking() {
  seen.clear();
  queue = [];
}

/** Test seam: the events still waiting for goatcounter to load. */
export const _queue = () => queue;

export function track(name) {
  if (seen.has(name)) return;
  seen.add(name);
  queue.push({ path: name, title: name, event: true });
  const gc = globalThis.window && globalThis.window.goatcounter;
  if (!gc || !gc.count) return;
  while (queue.length) gc.count(queue.shift());
}
