// User-visible copy (ruling R56): formulas are written out, never described with the word
// "average", and no text names a person. Internal identifiers (averagedBelow, AveragedAxles)
// and comments may keep their names; the footer's GitHub owner (fredmayor88) is a URL, not a name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { defaultState, setRatio } from '../js/state.js';
import { hasRatioSettings } from '../js/gearing.js';
import { settingsText } from '../js/settingsText.js';
import { barSummary } from '../js/barSummary.js';
import { ISSUES, PROMO, dataLine, factorNote, revLimitNote } from '../js/footer.js';
import * as finalDrive from '../js/charts/finalDrive.js';
import { borrowedCurveNote } from '../js/charts/powerTorque.js';
import { shiftCaption } from '../js/charts/shiftPoints.js';
import { axisTitle, hoverLine } from '../js/charts/ladder.js';

const ROOT = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');
const AVERAGE = /averag/i;
const NAME = /Fred\b/;
const clean = (text, where) => {
  assert.doesNotMatch(text, AVERAGE, where);
  assert.doesNotMatch(text, NAME, where);
};

const slugs = readdirSync(ROOT).filter(d => existsSync(new URL(`data/${d}.json`, ROOT)));
const load = slug => JSON.parse(read(`data/${slug}.json`));

test('no generated page and not the README says average or names a person', () => {
  assert.equal(slugs.length, 18);
  const pages = ['index.html', 'README.md'];
  for (const d of slugs) {
    for (const p of [`${d}/index.html`, `${d}/gears/index.html`, `${d}/drivetrain/index.html`]) {
      if (existsSync(new URL(p, ROOT))) pages.push(p);
    }
  }
  assert.equal(pages.length, 2 + 18 * 3);
  for (const p of pages) clean(read(p), p);
});

// What the site is, in the served HTML of every page a crawler is allowed to read. The line
// under a car's name on screen ("5 speed · 3 gear sets · rev limit ...") is built in JS, so it
// is the car's numbers and not the site's purpose; this one is static and says the purpose.
test('every indexed page names itself a gearing calculator for the game', () => {
  const TAGLINE = 'Gearing calculator for Assetto Corsa Rally';
  const home = read('index.html');
  assert.ok(home.includes(`<h1>${TAGLINE}</h1>`));
  assert.ok(home.includes(`<title>${TAGLINE} — ACR Car Lab</title>`));
  for (const slug of slugs) {
    const p = `${slug}/gears/index.html`;
    const { name } = load(slug);
    const html = read(p);
    assert.ok(html.includes(`<title>${name} gearing — Assetto Corsa Rally</title>`), p);
    const h1 = html.indexOf(`<h1>${name}</h1>`);
    const tagline = html.indexOf(`<p class="sub">${TAGLINE}</p>`);
    assert.ok(h1 > 0, p);
    // straight under the name, and still inside the header
    assert.ok(tagline > h1 && tagline < html.indexOf('</header>'), p);
  }
});

test('the strings the gears page builds, for every car and each of its gear sets', () => {
  for (const slug of slugs) {
    const car = load(slug);
    const states = car.gear_sets.map((_, set) => ({ ...defaultState(car), set }));
    if (hasRatioSettings(car)) {
      // every ratio setting moved to its last step, so the Audi's warning shows too
      let apart = defaultState(car);
      for (const s of car.final_drive.settings) {
        apart = setRatio(car, apart, s.key, s.steps.length - 1);
      }
      states.push(apart);
    }
    for (const state of states) {
      const texts = [
        finalDrive.formulaNote(car), finalDrive.caption(car, state),
        finalDrive.axleWarning(car, state),
        ...(hasRatioSettings(car) ? [finalDrive.finalDriveReadout(car, state),
          ...finalDrive.ratioLines(car, state)] : []),
        settingsText(car, state, 'https://example.test/x/gears/#'),
        barSummary(car, state), borrowedCurveNote(car),
        shiftCaption(state.floor, state.ceil, car.engine.redline), axisTitle(car, state),
        hoverLine(car, state, state.set, 60),
        revLimitNote(car.engine.redline_source),
      ];
      texts.forEach((t, i) => clean(String(t), `${slug} set ${state.set} text ${i}: ${t}`));
    }
  }
  clean([factorNote(JSON.parse(readFileSync(new URL('../data/index.json', import.meta.url), 'utf8'))), dataLine({ generated: '2026-09-13', game_version: '0.6' }),
    PROMO.before, PROMO.link, PROMO.after, ISSUES.before, ISSUES.link].join('\n'), 'footer');
});

/** Every string and template literal in a JS source, comments left out. */
function stringLiterals(src) {
  const out = [];
  let i = 0;
  let last = '';   // the last significant character, to tell a regex literal from a division
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === '/' && (last === '' || '(,=:[!&|?{};+'.includes(last))) {
      // a regex literal: skip it, classes included
      let j = i + 1;
      let cls = false;
      while (j < src.length && (src[j] !== '/' || cls)) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') cls = true;
        else if (src[j] === ']') cls = false;
        j++;
      }
      i = j + 1;
      last = '/';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let text = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { text += src[j] + src[j + 1]; j += 2; continue; }
        if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          // an interpolation is code: its own literals are collected, the rest skipped
          let depth = 1;
          const start = j + 2;
          j = start;
          while (j < src.length && depth) {
            if (src[j] === '`' || src[j] === "'" || src[j] === '"') {
              const q = src[j];
              let k = j + 1;
              while (k < src.length && src[k] !== q) { if (src[k] === '\\') k++; k++; }
              j = k + 1;
              continue;
            }
            if (src[j] === '{') depth++;
            if (src[j] === '}') depth--;
            j++;
          }
          out.push(...stringLiterals(src.slice(start, j - 1)));
          text += ' ';
          continue;
        }
        text += src[j];
        j++;
      }
      out.push(text);
      i = j + 1;
      last = c;
      continue;
    }
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out;
}

test('stringLiterals finds strings and skips comments and regex literals', () => {
  assert.deepEqual(stringLiterals("// 'no'\nconst a = 'yes'; /* \"no\" */ const r = /'[\"]/; f(`t ${x}`)"),
    ['yes', 't  ']);
  assert.deepEqual(stringLiterals("`a ${averaged(b) ? `in ${c}` : 'd'} e`"),
    ['in  ', 'd', 'a   e']);
});

test('no string literal in the site JS says average or names a person', () => {
  const files = [...readdirSync(new URL('js/', ROOT)).filter(f => f.endsWith('.js')).map(f => `js/${f}`),
    ...readdirSync(new URL('js/charts/', ROOT)).filter(f => f.endsWith('.js')).map(f => `js/charts/${f}`)];
  assert.ok(files.includes('js/app.js') && files.includes('js/charts/finalDrive.js'));
  // the scan does reach the captions and the formula text
  assert.ok(stringLiterals(read('js/app.js')).includes('One line per gear of the selected gear set.'));
  assert.ok(stringLiterals(read('js/charts/finalDrive.js')).some(s => s.includes('÷')));
  for (const f of files) {
    for (const s of stringLiterals(read(f))) clean(s, `${f}: ${s}`);
  }
});
