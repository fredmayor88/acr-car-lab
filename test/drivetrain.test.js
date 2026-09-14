import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { WORKINGS_EVENT, WORKINGS_THRESHOLD, watchWorkings } from '../js/drivetrain.js';
import { _queue, resetTracking, track } from '../js/tracking.js';
import { formulaNote } from '../js/charts/finalDrive.js';

/** A stand-in IntersectionObserver the test drives by hand. */
function fakeObserver() {
  const made = [];
  class Fake {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.targets = [];
      this.disconnected = false;
      made.push(this);
    }
    observe(t) { this.targets.push(t); }
    disconnect() { this.disconnected = true; }
    /** What the browser does: call back while still connected. */
    fire(entries) { if (!this.disconnected) this.callback(entries, this); }
  }
  return { Fake, made };
}

beforeEach(() => {
  resetTracking();
  globalThis.window = {};
});

/** A scroll source the test drives by hand. */
function fakeScroll() {
  const s = { fns: [], unsubscribed: false };
  s.onScroll = fn => { s.fns.push(fn); return () => { s.unsubscribed = true; }; };
  s.scroll = () => { if (!s.unsubscribed) s.fns.forEach(fn => fn()); };
  return s;
}

test('the workings event fires once, when the reader scrolls the section into view', () => {
  const { Fake, made } = fakeObserver();
  const scroll = fakeScroll();
  const target = { id: 'workhead' };
  watchWorkings(target, { Observer: Fake, onScroll: scroll.onScroll, canScroll: () => true });
  const obs = made[0];
  assert.deepEqual(obs.targets, [target]);
  assert.equal(obs.options.threshold, WORKINGS_THRESHOLD);

  // the first callback arrives on observe() with the section still below the fold
  obs.fire([{ isIntersecting: false, intersectionRatio: 0 }]);
  scroll.scroll();
  assert.equal(_queue().length, 0);
  // a sliver at the bottom edge is not reading it
  obs.fire([{ isIntersecting: true, intersectionRatio: 0.1 }]);
  assert.equal(_queue().length, 0);

  obs.fire([{ isIntersecting: true, intersectionRatio: 0.8 }]);
  assert.deepEqual(_queue().map(e => e.path), [WORKINGS_EVENT]);
  assert.equal(obs.disconnected, true);
  assert.equal(scroll.unsubscribed, true);

  // scrolling away and back does not count it again
  obs.fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  scroll.scroll();
  track(WORKINGS_EVENT);
  assert.equal(_queue().length, 1);
});

test('a section already on screen at load counts only once the reader scrolls', () => {
  const { Fake, made } = fakeObserver();
  const scroll = fakeScroll();
  watchWorkings({}, { Observer: Fake, onScroll: scroll.onScroll, canScroll: () => true });
  made[0].fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(_queue().length, 0);
  scroll.scroll();
  assert.deepEqual(_queue().map(e => e.path), [WORKINGS_EVENT]);
});

test('on a page that cannot scroll, the section on screen is enough', () => {
  const { Fake, made } = fakeObserver();
  const scroll = fakeScroll();
  watchWorkings({}, { Observer: Fake, onScroll: scroll.onScroll, onResize: () => null,
    canScroll: () => false });
  made[0].fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.deepEqual(_queue().map(e => e.path), [WORKINGS_EVENT]);
  made[0].fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(_queue().length, 1);
});

test('a page that scrolls still waits for a scroll with the section on screen at load', () => {
  const { Fake, made } = fakeObserver();
  const scroll = fakeScroll();
  const resize = fakeScroll();
  watchWorkings({}, { Observer: Fake, onScroll: scroll.onScroll, onResize: resize.onScroll,
    canScroll: () => true });
  made[0].fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  resize.scroll();
  assert.equal(_queue().length, 0);
  scroll.scroll();
  assert.deepEqual(_queue().map(e => e.path), [WORKINGS_EVENT]);
  assert.equal(resize.unsubscribed, true);
});

test('a resize that makes the page fit counts, once the section is on screen', () => {
  const { Fake, made } = fakeObserver();
  const resize = fakeScroll();
  let tall = true;
  watchWorkings({}, { Observer: Fake, onScroll: () => null, onResize: resize.onScroll,
    canScroll: () => tall });
  made[0].fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  assert.equal(_queue().length, 0);
  tall = false;
  resize.scroll();
  assert.deepEqual(_queue().map(e => e.path), [WORKINGS_EVENT]);
});

test('a page that fits but has the section off screen does not count', () => {
  const { Fake, made } = fakeObserver();
  watchWorkings({}, { Observer: Fake, onScroll: () => null, onResize: () => null,
    canScroll: () => false });
  made[0].fire([{ isIntersecting: false, intersectionRatio: 0 }]);
  assert.equal(_queue().length, 0);
});

test('scrolling that leaves the section out of view does not count', () => {
  const { Fake, made } = fakeObserver();
  const scroll = fakeScroll();
  watchWorkings({}, { Observer: Fake, onScroll: scroll.onScroll, canScroll: () => true });
  made[0].fire([{ isIntersecting: true, intersectionRatio: 1 }]);
  made[0].fire([{ isIntersecting: false, intersectionRatio: 0 }]);
  scroll.scroll();
  assert.equal(_queue().length, 0);
});

test('the event name is the one the brief asks for', () => {
  assert.equal(WORKINGS_EVENT, 'read-drivetrain-workings');
});

test('without IntersectionObserver or a section nothing is watched', () => {
  assert.equal(watchWorkings({}, { Observer: undefined }), null);
  assert.equal(watchWorkings(null, { Observer: fakeObserver().Fake }), null);
  assert.equal(_queue().length, 0);
});

// ---- the generated pages ----

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = path => { try { read(path); return true; } catch { return false; } };
const carDirs = readdirSync(new URL('../', import.meta.url)).filter(d => exists(`data/${d}.json`));
const decode = s => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('every car has a drivetrain page that links back to its gears page', () => {
  assert.equal(carDirs.length, 18);
  for (const d of carDirs) {
    const html = read(`${d}/drivetrain/index.html`);
    const car = JSON.parse(read(`data/${d}.json`));
    assert.ok(decode(html).includes(`<h1>${car.name} — drivetrain</h1>`), d);
    assert.ok(html.includes('<a class="crumb" href="../gears/">'), d);
    assert.ok(html.includes('src="../../js/drivetrain.js"'), d);
    assert.ok(html.includes(`data-event="${WORKINGS_EVENT}"`), d);
    assert.ok(html.includes('gc.zgo.at/count.js'), d);
    assert.doesNotMatch(html, /undefined|NaN|Infinity|\{[a-z_]+(?::[^{}]*)?\}/, d);
  }
});

test('each gears page links to its drivetrain page', () => {
  for (const d of carDirs) {
    assert.ok(read(`${d}/gears/index.html`).includes('<a class="crumb" href="../drivetrain/">'), d);
  }
});

test('every drivetrain page states the formula the gears page Final drive note does', () => {
  // the exporter's formula_note (Python) and formulaNote here are two implementations of one
  // string: the page's formula line must be exactly the note wherever the site shows a note
  let n = 0;
  for (const d of carDirs) {
    const car = JSON.parse(read(`data/${d}.json`));
    const note = formulaNote(car);
    const line = decode(read(`${d}/drivetrain/index.html`)).match(/<span class="formula">([^<]*)<\/span>/)[1];
    if (note) {
      n += 1;
      assert.equal(line, note, d);
      assert.match(note, /\u00a0÷\u00a02/, d);
      assert.doesNotMatch(line, /[ \n]÷\s2|÷[ \n]2/, d + ': the ÷ 2 is held together');
    } else {
      assert.doesNotMatch(line, /÷/, `${d}: a car with no note has no (front + rear) ÷ 2 line`);
    }
  }
  assert.equal(carDirs.length, 18);
  assert.equal(n, 5);
});

test('the picker keeps its 18 gears links and adds 18 drivetrain links below them', () => {
  const html = read('index.html');
  const gears = [...html.matchAll(/href="([a-z0-9-]+)\/gears\/"/g)].map(m => m[1]);
  const drivetrain = [...html.matchAll(/href="([a-z0-9-]+)\/drivetrain\/"/g)].map(m => m[1]);
  assert.equal(gears.length, 18);
  assert.deepEqual(drivetrain, gears);
  assert.ok(html.lastIndexOf('/gears/"') < html.indexOf('<h2>Drivetrain notes</h2>'));
  assert.ok(html.indexOf('<h2>Drivetrain notes</h2>') < html.indexOf('/drivetrain/"'));
});
