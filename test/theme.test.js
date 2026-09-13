import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SET_COLOURS, SET_COLOURS_DARK } from '../js/gearing.js';
import { STORAGE_KEY } from '../js/theme.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('app.css').replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations inside the first block that opens with `selector{`. */
function block(selector) {
  const start = css.indexOf(selector + '{');
  assert.ok(start >= 0, `app.css has no ${selector} block`);
  const body = css.slice(start + selector.length + 1, css.indexOf('}', start));
  return Object.fromEntries(body.split(';').map(d => d.trim()).filter(Boolean)
    .map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]));
}

const light = block(':root');
const osDark = block(':root:not([data-theme="light"])');
const forcedDark = block(':root[data-theme="dark"]');

// WCAG relative luminance and contrast, for opaque #RRGGBB.
const channel = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = hex => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// CIE76 distance in Lab: how far apart two colours look, roughly.
const lab = hex => {
  const [r, g, b] = rgb(hex).map(channel);
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const distance = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
const closestPair = list => Math.min(...list.flatMap((a, i) =>
  list.slice(i + 1).map(b => distance(a, b))));

test('the OS dark block and the forced dark block are the same palette', () => {
  assert.deepEqual(osDark, forcedDark);
});

test('dark defines every colour token light does, and no others', () => {
  const tokens = o => Object.keys(o).filter(k => k.startsWith('--')).sort();
  assert.deepEqual(tokens(osDark), tokens(light));
  assert.equal(light['color-scheme'], 'light');
  assert.equal(osDark['color-scheme'], 'dark');
});

/** An `rgba(r,g,b,a)` token laid over an opaque ground, as the browser paints it. */
const over = (colour, ground) => {
  const m = colour.match(/^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/);
  if (!m) return colour;
  const a = Number(m[4]);
  return '#' + rgb(ground).map((g, i) => Math.round(a * Number(m[i + 1]) + (1 - a) * g)
    .toString(16).padStart(2, '0')).join('');
};

// Every token that colours text, and what it sits on.
const TEXT_ROLES = ['--fg', '--fg-strong', '--muted-text', '--accent-text', '--data'];
const PAIRS = [['--tip-fg', '--tip-bg'], ['--tip-warn', '--tip-bg'],
               ['--on-warn', '--warn'], ['--on-data', '--data']];

for (const [name, theme] of [['light', light], ['dark', osDark]]) {
  test(`${name}: every text role clears WCAG AA on the ground and on a panel`, () => {
    const grounds = [theme['--bg'], over(theme['--surface'], theme['--bg'])];
    for (const ground of grounds) {
      for (const role of TEXT_ROLES) {
        const ratio = contrast(theme[role], ground);
        assert.ok(ratio >= 4.5, `${role} ${theme[role]} on ${ground}: ${ratio.toFixed(2)}`);
      }
    }
    for (const [fg, bg] of PAIRS) {
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  });
}

test('app.css sets text in the text roles, never in the mark colours', () => {
  assert.doesNotMatch(css, /(?:^|[;{\s])(?:color|fill):var\(--(?:muted|accent)\)/m);
});

test('dark chart marks clear 3:1 on a panel', () => {
  for (const role of ['--data', '--accent', '--ink', '--warn-edge']) {
    assert.ok(contrast(osDark[role], osDark['--surface']) >= 3,
      `${role} ${osDark[role]}: ${contrast(osDark[role], osDark['--surface']).toFixed(2)}`);
  }
});

test('the dark gear-set colours: ten, distinct, frozen, and all readable on a panel', () => {
  assert.equal(SET_COLOURS_DARK.length, SET_COLOURS.length);
  assert.ok(Object.isFrozen(SET_COLOURS_DARK));
  assert.equal(new Set(SET_COLOURS_DARK.map(c => c.toUpperCase())).size, 10);
  // no closer together than the light set already is
  assert.ok(closestPair(SET_COLOURS_DARK) >= Math.floor(closestPair(SET_COLOURS)),
    `closest dark pair ${closestPair(SET_COLOURS_DARK).toFixed(1)}`);
  for (const c of SET_COLOURS_DARK) {
    assert.ok(contrast(c, osDark['--surface']) >= 3,
      `${c} on ${osDark['--surface']}: ${contrast(c, osDark['--surface']).toFixed(2)}`);
  }
});

test('no chart module names a colour; they all go through app.css', () => {
  const files = ['js/svg.js', 'js/app.js',
    ...readdirSync(new URL('../js/charts/', import.meta.url)).map(f => `js/charts/${f}`)];
  for (const f of files) {
    const src = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /#[0-9a-f]{3}(?:[0-9a-f]{3})?\b|rgba?\(/i, f);
  }
});

test('the no-flash head script in every page reads the key theme.js writes', () => {
  const pages = ['index.html', ...readdirSync(new URL('../', import.meta.url))
    .filter(d => { try { read(`${d}/index.html`); return true; } catch { return false; } })
    .map(d => `${d}/index.html`)];
  assert.ok(pages.length > 1);
  for (const page of pages) {
    const html = read(page);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(`localStorage.getItem('${STORAGE_KEY}')`), page);
    assert.ok(head.indexOf(STORAGE_KEY) < head.indexOf('stylesheet'), `${page}: script after css`);
    assert.match(html, /<button class="theme" type="button">/, page);
  }
});
