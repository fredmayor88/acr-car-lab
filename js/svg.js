// SVG plumbing shared by every chart. Knows nothing about gearing.

const NS = 'http://www.w3.org/2000/svg';

/**
 * Chart colours, by role. Each is a custom property from app.css, which holds the light
 * and dark values; nothing in the charts names a hex. A theme change repaints these with
 * no redraw. The gear-set colours are the exception: they are indexed, so they come from
 * js/gearing.js and a theme change redraws chart 5.
 */
export const C = Object.freeze({
  fg: 'var(--fg)', muted: 'var(--muted)', data: 'var(--data)', accent: 'var(--accent)',
  // muted and accent are for marks; text in those colours uses these darker text roles
  mutedText: 'var(--muted-text)', accentText: 'var(--accent-text)',
  warn: 'var(--warn)', halo: 'var(--halo)', ink: 'var(--ink)',
  tipBg: 'var(--tip-bg)', tipFg: 'var(--tip-fg)', tipWarn: 'var(--tip-warn)',
  onWarn: 'var(--on-warn)', warnEdge: 'var(--warn-edge)',
});

// Presentation attributes do not accept var(), and a class-level `fill` beats one anyway,
// so paint always goes inline.
const PAINT = new Set(['fill', 'stroke']);

function apply(node, attrs) {
  for (const k in attrs) {
    if (PAINT.has(k)) node.style[k] = attrs[k];
    else node.setAttribute(k, attrs[k]);
  }
}

export function el(parent, tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  apply(node, attrs);
  parent.appendChild(node);
  return node;
}

export function text(parent, x, y, str, cls = 'axis', attrs = {}) {
  const node = el(parent, 'text', { x, y, class: cls });
  apply(node, attrs);
  node.textContent = str;
  return node;
}

/** Width of a monospace tooltip, needed before drawing when it is right-aligned. */
export const tipWidth = lines => Math.max(...lines.map(l => l.length)) * 6.4 + 22;

export function tip(parent, x, y, lines, warnIndex = -1) {
  const w = tipWidth(lines);
  const h = lines.length * 15 + 13;
  el(parent, 'rect', { x, y, width: w, height: h, rx: 3, fill: C.tipBg });
  lines.forEach((line, i) => text(parent, x + 11, y + 19 + i * 15, line, 'val', {
    fill: i === warnIndex ? C.tipWarn : C.tipFg, 'font-weight': '600',
  }));
  return w;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
