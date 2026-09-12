// GoatCounter events, deduped. Same wrapper as gremlin-curve-converter: the script loads
// async, so events raised before it arrives are queued rather than dropped. On page load,
// drain any queued events even if no track() calls happen after goatcounter arrives.

const seen = new Set();
let queue = [];

export function resetTracking() {
  seen.clear();
  queue = [];
}

/** Test seam: the events still waiting for goatcounter to load. */
export const _queue = () => queue;

export function flush() {
  if (!globalThis.window?.goatcounter?.count) return;
  while (queue.length) globalThis.window.goatcounter.count(queue.shift());
}

export function track(name) {
  if (seen.has(name)) return;
  seen.add(name);
  queue.push({ path: name, title: name, event: true });
  flush();
}

// Register flush on page load to drain any queued events that never triggered track()
if (globalThis.window && typeof globalThis.window.addEventListener === 'function') {
  globalThis.window.addEventListener('load', flush);
}
