import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SET_COLOURS, SET_COLOURS_DARK } from '../js/gearing.js';
import { STORAGE_KEY, toggleLabel } from '../js/theme.js';

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
  // --warn-edge rings the over-limit chip, --warn-ring its dot: brand red alone is 1.8:1
  for (const role of ['--data', '--accent', '--ink', '--warn-edge', '--warn-ring']) {
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

const exists = path => { try { read(path); return true; } catch { return false; } };
const carDirs = readdirSync(new URL('../', import.meta.url))
  .filter(d => exists(`data/${d}.json`));

test('the no-flash head script in every page reads the key theme.js writes', () => {
  const pages = ['index.html', ...carDirs.flatMap(d =>
    [`${d}/gears/index.html`, `${d}/drivetrain/index.html`])];
  assert.equal(carDirs.length, JSON.parse(read('data/index.json')).cars.length);
  for (const page of pages) {
    const html = read(page);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(`localStorage.getItem('${STORAGE_KEY}')`), page);
    assert.ok(head.indexOf(STORAGE_KEY) < head.indexOf('stylesheet'), `${page}: script after css`);
    assert.match(html, /<button class="theme" type="button">/, page);
    assert.match(html, /<span class="to-dark"><svg class="icon moon"[^>]*aria-hidden="true"/, page);
    assert.match(html, /<span class="to-light"><svg class="icon sun"[^>]*aria-hidden="true"/, page);
  }
});

test('car pages live at <slug>/gears/ and reach the site root two levels up', () => {
  for (const d of carDirs) {
    const html = read(`${d}/gears/index.html`);
    assert.match(html, new RegExp(`data-car="${d}"`), d);
    assert.match(html, /href="\.\.\/\.\.\/app\.css"/, d);
    assert.match(html, /src="\.\.\/\.\.\/js\/app\.js"/, d);
    assert.match(html, /class="crumb" href="\.\.\/\.\.\/"/, d);
  }
});

// --- the header row ----------------------------------------------------------------------

/** A page's header row as its element list: tag.class=text, in order. */
const brandrow = html => {
  const row = html.slice(html.indexOf('<div class="brandrow">'), html.indexOf('<h1>'));
  return [...row.matchAll(/<(a|span|button) class="([^"]+)"[^>]*>(.*?)<\/\1>/g)]
    .map(([, tag, cls, inner]) => `${tag}.${cls}=${inner.replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/<[^>]+>/g, '')}`);
};
const BACK = 'a.crumb=‹All cars';

test('a car page header: the wordmark links home, then a dot and ‹ All cars, then the toggle', () => {
  for (const d of carDirs) {
    const gears = read(`${d}/gears/index.html`);
    assert.deepEqual(brandrow(gears), ['a.brand=ACR Car Lab', 'span.sep=·', BACK, 'button.theme=DarkLight'], d);
    assert.ok(gears.includes('<a class="brand" href="../../">ACR <b>Car Lab</b></a>'), d);
    // the chevron is decoration, so the link is named "All cars"
    assert.ok(gears.includes('<a class="crumb" href="../../"><span class="chev" aria-hidden="true">‹</span>All cars</a>'), d);
    assert.ok(gears.includes('<span class="sep" aria-hidden="true">·</span>'), d);
    const dt = read(`${d}/drivetrain/index.html`);
    assert.deepEqual(brandrow(dt), ['a.brand=ACR Car Lab', 'span.sep=·', BACK, 'span.sep=·',
      'a.crumb=Gearing charts', 'button.theme=DarkLight'], d);
  }
});

test('the picker keeps its plain wordmark and has no back link', () => {
  assert.deepEqual(brandrow(read('index.html')), ['span.brand=ACR Car Lab', 'button.theme=DarkLight']);
});

test('the crumbs sit on the left; only the toggle takes the free space', () => {
  assert.equal(block('.crumb')['margin-left'], undefined);
  assert.equal(block('.theme')['margin-left'], 'auto');
  assert.doesNotMatch(css, /\.crumb \+ \.theme/);
  assert.equal(block('a.brand')['text-decoration'], 'none');
  // the header dot is scoped to the row: the bar summary has .sep dots of its own
  assert.doesNotMatch(css, /(?:^|\})\s*\.sep\{/);
  assert.match(css, /a\.brand:focus-visible,\.crumb:focus-visible\{outline:2px solid var\(--accent\)/);
});

test('<slug>/ forwards to gears/ with the hash, and is not counted', () => {
  for (const d of carDirs) {
    const html = read(`${d}/index.html`);
    assert.ok(html.includes("location.replace('gears/'+location.search+location.hash)"), d);
    assert.ok(html.includes('<meta http-equiv="refresh" content="0; url=gears/">'), d);
    assert.ok(html.includes('<link rel="canonical" href="gears/">'), d);
    assert.ok(html.includes('<meta name="color-scheme" content="light dark">'), d);
    assert.doesNotMatch(html, /goatcounter|gc\.zgo\.at|id="app"/, d);
  }
});

test('the picker links straight to each car page', () => {
  const html = read('index.html');
  for (const d of carDirs) assert.ok(html.includes(`href="${d}/gears/"`), d);
});

test('app.js resolves data from its own location, not the page depth', () => {
  const src = read('js/app.js');
  assert.doesNotMatch(src, /fetch\(\s*[`'"]\.\.\//);
  assert.match(src, /new URL\('\.\.\/', import\.meta\.url\)/);
});

test('the toggle icon stays inline and label-sized, not a full-width chart svg', () => {
  // app.css makes every svg a full-width block for the charts; the icon has to opt out or
  // it lands on its own line and the toggle outgrows the brand line
  const icon = block('.theme .icon');
  assert.equal(icon.display, 'inline-block');
  assert.equal(icon.width, '12px');
  assert.equal(icon.height, '12px');
});

test('the toggle is named for what a click does, and the name holds the visible word', () => {
  assert.equal(toggleLabel('light'), 'Switch to dark theme');
  assert.equal(toggleLabel('dark'), 'Switch to light theme');
  // the visible label is the target theme (app.css shows "Dark" in light, "Light" in dark)
  assert.match(toggleLabel('light'), /dark/i);
  assert.match(toggleLabel('dark'), /light/i);
});
