// The sitemap is written by hand, so it is the one file that can quietly fall behind the cars:
// a nineteenth car added without a line here is a page Google is never told about. These tests
// are that guard. They also hold the two exclusions in place, because each has a reason on the
// page itself: a <slug>/ redirect canonicals to gears/, and a drivetrain page is noindex.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');
const SITE = 'https://fredmayor88.github.io/acr-car-lab/';
const slugs = readdirSync(ROOT).filter(d => existsSync(new URL(`data/${d}.json`, ROOT)));
const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

test('the sitemap lists the home page and every car, in that order, and nothing else', () => {
  assert.equal(slugs.length, 18);
  assert.deepEqual(locs, [SITE, ...slugs.map(s => `${SITE}${s}/gears/`)]);
});

test('every URL in the sitemap is a directory that exists', () => {
  for (const loc of locs) {
    assert.ok(loc.endsWith('/'), loc);
    const p = `${loc.slice(SITE.length)}index.html`;
    assert.ok(existsSync(new URL(p, ROOT)), p);
  }
});

test('the redirect and drivetrain pages stay out, and stay unindexable', () => {
  for (const slug of slugs) {
    assert.ok(!locs.includes(`${SITE}${slug}/`), slug);
    assert.ok(!locs.includes(`${SITE}${slug}/drivetrain/`), slug);
    assert.match(read(`${slug}/index.html`), /<link rel="canonical" href="gears\/">/, slug);
    assert.match(read(`${slug}/drivetrain/index.html`),
      /<meta name="robots" content="noindex">/, slug);
  }
});

test('every page in the sitemap canonicals to itself', () => {
  // a gearing page takes ?pw=kW and a state hash, so the same page has many URLs; the
  // canonical folds them into one, and points at the directory, not at index.html
  for (const loc of locs) {
    const p = `${loc.slice(SITE.length)}index.html`;
    assert.ok(read(p).includes('<link rel="canonical" href="./">'), p);
  }
});

test('robots.txt allows everything and names the sitemap at the same site', () => {
  const robots = read('robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.ok(robots.includes(`Sitemap: ${SITE}sitemap.xml`));
});

// Deleting this file un-verifies the Search Console property, and nothing about it looks
// load-bearing: it is 53 bytes of token at the site root with no link to it anywhere.
test('the Search Console verification file is still here, and still says its own name', () => {
  const name = 'google8024ca1d43961260.html';
  assert.ok(existsSync(new URL(name, ROOT)), name);
  assert.equal(read(name), `google-site-verification: ${name}`);
});

test('the README sends people to the same site the sitemap does', () => {
  assert.ok(read('README.md').includes(SITE));
});
