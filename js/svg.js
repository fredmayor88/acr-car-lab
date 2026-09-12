// SVG plumbing shared by every chart. Knows nothing about gearing.

const NS = 'http://www.w3.org/2000/svg';

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
    fill: i === warnIndex ? '#E8A598' : '#F5F2EB', 'font-weight': '600',
  }));
  return w;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
