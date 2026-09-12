// SVG plumbing shared by every chart. Knows nothing about gearing.

const NS = 'http://www.w3.org/2000/svg';

// Brand warning colour is #9C3B2E, but that's near-unreadable set as text on the
// tooltip's dark #212529 fill (their luminances are too close for body-text contrast).
// This is a 50/50 mix of #9C3B2E with white, kept as a named on-dark tint rather than
// an unrelated pink, for exactly the one place (tip()) that needs warning text on dark.
const WARN_ON_DARK = '#CE9D97';

export function el(parent, tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  parent.appendChild(node);
  return node;
}

export function text(parent, x, y, str, cls = 'axis', attrs = {}) {
  const node = el(parent, 'text', { x, y, class: cls });
  // a class-level `fill` beats a presentation attribute, so colour has to go inline
  for (const k in attrs) {
    if (k === 'fill') node.style.fill = attrs[k];
    else node.setAttribute(k, attrs[k]);
  }
  node.textContent = str;
  return node;
}

/** Width of a monospace tooltip, needed before drawing when it is right-aligned. */
export const tipWidth = lines => Math.max(...lines.map(l => l.length)) * 6.4 + 22;

export function tip(parent, x, y, lines, warnIndex = -1) {
  const w = tipWidth(lines);
  const h = lines.length * 15 + 13;
  el(parent, 'rect', { x, y, width: w, height: h, rx: 3, fill: '#212529' });
  lines.forEach((line, i) => text(parent, x + 11, y + 19 + i * 15, line, 'val', {
    fill: i === warnIndex ? WARN_ON_DARK : '#F5F2EB', 'font-weight': '600',
  }));
  return w;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
