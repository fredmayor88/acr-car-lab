import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { rpmInputKey, ceilBounds, defaultState, floorBounds, floorFocusAfterStep, parseCeil, parseFloor,
  parseHash, stepCeil, stepFloor, toHash }
  from '../js/state.js';
import { finalDriveCombos } from '../js/gearing.js';
import { layout } from '../js/charts/finalDrive.js';

const set = (label, primary) => ({ label, gears: [], primary: { name: primary, value: 1 } });

const car = {
  gear_sets: [set('Gear set 1', 'b'), set('Gear set 2', 'b'), set('Gear set 3', 'b')],
  engine: { redline: 8750 },
  final_drive: {
    primaries: [{ name: 'a', value: 1.375 }, { name: 'b', value: 1.1 }],
    options: [{ name: 'x', value: 3.8 }, { name: 'y', value: 3.4 }],
    stock_option: 'y', rest: 1,
  },
  tyres: { Tarmac_Dry: {}, Gravel: {} },
  defaults: { loaded_radius_factor: 0.9904 },
};

test('the default state is dry tarmac, first gear set', () => {
  const s = defaultState(car);
  assert.equal(s.surface, 'Tarmac_Dry');
  assert.equal(s.set, 0);
  assert.equal(s.k, 0.9904);
  assert.equal('draw' in s, false, 'Speed against revs follows the gear set; no list of its own');
});

test('a full hash round-trips', () => {
  const s = { surface: 'Gravel', fd: 2, set: 1, k: 0.97, floor: 3500, rl: 8750,
    ceil: 8000 };
  assert.deepEqual(parseHash(toHash(s, car), car), s);
});

test('a surface the car does not have falls back to the default', () => {
  assert.equal(parseHash('#s=Sweden', car).surface, 'Tarmac_Dry');
});

test('a surface that is not a real key falls back to the default', () => {
  assert.equal(parseHash('#s=Moon', car).surface, 'Tarmac_Dry');
});

test('an out-of-range gear set falls back to the default', () => {
  assert.equal(parseHash('#set=99', car).set, 0);
  assert.equal(parseHash('#set=-1', car).set, 0);
  assert.equal(parseHash('#set=banana', car).set, 0);
});

test('an out-of-range final drive falls back to the default', () => {
  assert.equal(parseHash('#fd=999', car).fd, defaultState(car).fd);
});

test('an old link with draw= still loads, and draw is ignored', () => {
  const old = parseHash('#s=Gravel&fd=1&set=2&draw=0,1&k=0.97', car);
  assert.deepEqual(old, parseHash('#s=Gravel&fd=1&set=2&k=0.97', car));
  assert.equal(old.set, 2);
  assert.equal('draw' in old, false);
  for (const junk of ['#draw=', '#draw=99', '#draw=banana']) {
    assert.deepEqual(parseHash(junk, car), defaultState(car));
  }
});

test('the hash no longer carries draw', () => {
  const hash = toHash(parseHash('#set=1&draw=0,2', car), car);
  assert.equal(new URLSearchParams(hash.slice(1)).has('draw'), false);
  assert.match(hash, /(^#|&)set=1(&|$)/);
});

test('the factor is clamped to a sane range', () => {
  assert.equal(parseHash('#k=0', car).k, 0.9904);
  assert.equal(parseHash('#k=-3', car).k, 0.9904);
  assert.equal(parseHash('#k=99', car).k, 0.9904);
  assert.equal(parseHash('#k=1.02', car).k, 1.02);
});

test('an empty hash gives the default state', () => {
  assert.deepEqual(parseHash('', car), defaultState(car));
  assert.deepEqual(parseHash('#', car), defaultState(car));
});

test('a car with no adjustable final drive still parses', () => {
  const plain = { ...car, final_drive: null };
  assert.equal(parseHash('#fd=3', plain).fd, 0);
});

test('the stock combo matches the fitted primary, not just the option', () => {
  // stock option 'y' pairs with both primaries; the gear sets are fitted with 'b'
  const combos = finalDriveCombos(car.final_drive);
  const stock = combos[defaultState(car).fd];
  assert.equal(stock.option.name, 'y');
  assert.equal(stock.primary.name, 'b');
});

const load = slug =>
  JSON.parse(readFileSync(new URL(`../data/${slug}.json`, import.meta.url)));

test('the Stratos opens on its real stock combo: 33//31*31//30 with 65//19, 214 km/h', () => {
  const stratos = load('lancia-stratos');
  const state = defaultState(stratos);
  const stock = finalDriveCombos(stratos.final_drive)[state.fd];
  assert.equal(stock.primary.name, '33//31*31//30');
  assert.equal(stock.option.name, '65//19');
  const row = layout(stratos, state).rows.find(r => r.selected);
  assert.equal(Math.round(row.kmh), 214);
});

test('every car opens on a combo carrying its stock option and fitted primary', () => {
  const slugs = readdirSync(new URL('../data/', import.meta.url))
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.slice(0, -5));
  for (const slug of slugs) {
    const c = load(slug);
    const state = defaultState(c);
    if (!c.final_drive) {
      assert.equal(state.fd, 0, slug);
      continue;
    }
    const combos = finalDriveCombos(c.final_drive);
    const stock = combos[state.fd];
    assert.equal(stock.option.name, c.final_drive.stock_option, slug);
    if (stock.primary) {
      if (slug === 'peugeot-206-wrc-1999') {
        // the one exception: its gear sets carry 20//25, which is not one of its selectable
        // primaries, so the page opens on the first selectable one
        const selectable = c.final_drive.primaries.map(p => p.name);
        assert.ok(!selectable.includes(c.gear_sets[0].primary.name), slug);
        assert.equal(stock.primary.name, selectable[0], slug);
      } else {
        assert.equal(stock.primary.name, c.gear_sets[0].primary.name, slug);
      }
    }
    // and it is the row the chart highlights
    assert.equal(layout(c, state).rows.filter(r => r.selected).length, 1, slug);
  }
});

// --- the Shift points rev floor -------------------------------------------------------

test('the rev floor defaults to 3000 and stays out of the hash at that value', () => {
  assert.equal(defaultState(car).floor, 3000);
  assert.doesNotMatch(toHash(defaultState(car), car), /floor=/);
});

test('a non-default rev floor round-trips through the hash', () => {
  const s = { ...defaultState(car), floor: 4200 };
  assert.match(toHash(s, car), /floor=4200/);
  assert.deepEqual(parseHash(toHash(s, car), car), s);
  assert.equal(parseHash('#floor=0', car).floor, 0);
  assert.equal(parseHash('#floor=8650', car).floor, 8650);
});

test('an out-of-range or garbage rev floor falls back to the default', () => {
  for (const raw of ['8651', '8750', '99999', '-100', '3000.5', '35abc', 'banana', '', '1e3']) {
    assert.equal(parseHash(`#floor=${raw}`, car).floor, 3000, raw);
  }
});

test('a typed rev floor accepts any whole number from 0 to 100 under the limit', () => {
  assert.equal(parseFloor('3050', car), 3050);
  assert.equal(parseFloor(' 0 ', car), 0);
  assert.equal(parseFloor('8650', car), 8650);
  for (const raw of ['8651', '-1', '2.5', 'abc', '', '1e3', null]) {
    assert.equal(parseFloor(raw, car), null, String(raw));
  }
});

test('the buttons step the rev floor by 100 from where it is and clamp at the bounds', () => {
  assert.equal(stepFloor(3000, 1, car), 3100);
  assert.equal(stepFloor(3000, -1, car), 2900);
  assert.equal(stepFloor(3050, 1, car), 3150);
  assert.equal(stepFloor(50, -1, car), 0);
  assert.equal(stepFloor(0, -1, car), 0);
  assert.equal(stepFloor(8600, 1, car), 8650);
  assert.equal(stepFloor(8650, 1, car), 8650);
  assert.deepEqual(floorBounds(car), { min: 0, max: 8650 });
});

test('a keyboard step that disables its button hands focus to the rpm input', () => {
  const minus = { disabled: true }, plus = { disabled: false }, input = {};
  const floor = { minus, plus, input };
  assert.equal(floorFocusAfterStep(minus, floor, true), input);
  const disabledPlus = { disabled: true };
  assert.equal(floorFocusAfterStep(disabledPlus, { ...floor, plus: disabledPlus }, true), input);
});

test('a mouse or touch step never moves focus, even at a bound', () => {
  // Chrome focuses a clicked button, so focus alone cannot tell a tap from a key press;
  // focusing the numeric input from a tap would pop the on-screen keyboard
  const minus = { disabled: true }, plus = { disabled: true }, input = {};
  const floor = { minus, plus, input };
  assert.equal(floorFocusAfterStep(minus, floor, false), null);
  assert.equal(floorFocusAfterStep(plus, floor, false), null);
});

test('focus stays put when the stepped button is still enabled, or is not a step button', () => {
  const minus = { disabled: false }, plus = { disabled: true }, input = {};
  const floor = { minus, plus, input };
  assert.equal(floorFocusAfterStep(minus, floor, true), null);
  assert.equal(floorFocusAfterStep(input, floor, true), null);
  assert.equal(floorFocusAfterStep({ disabled: true }, floor, true), null);
  assert.equal(floorFocusAfterStep(null, floor, true), null);
});

// --- the Shift points rev ceiling -----------------------------------------------------

test('the rev ceiling defaults to the rev limit and stays out of the hash at that value', () => {
  assert.equal(defaultState(car).ceil, 8750);
  assert.doesNotMatch(toHash(defaultState(car), car), /ceil=/);
  // links from before the ceiling existed open exactly as they did
  assert.equal(parseHash('#s=Gravel&floor=4000', car).ceil, 8750);
  assert.equal(parseHash('#s=Gravel&floor=4000', car).floor, 4000);
});

test('a non-default rev ceiling round-trips through the hash', () => {
  const s = { ...defaultState(car), ceil: 7000 };
  assert.match(toHash(s, car), /ceil=7000/);
  assert.deepEqual(parseHash(toHash(s, car), car), s);
  const both = { ...defaultState(car), floor: 4000, ceil: 7000 };
  assert.deepEqual(parseHash(toHash(both, car), car), both);
  const low = { ...defaultState(car), floor: 1900, ceil: 2000 };
  assert.deepEqual(parseHash(toHash(low, car), car), low);
  const tight = { ...defaultState(car), floor: 3000, ceil: 3100 };
  assert.deepEqual(parseHash(toHash(tight, car), car), tight);
  assert.equal(parseHash('#ceil=100&floor=0', car).ceil, 100);
});

test('an out-of-range or garbage rev ceiling falls back to the rev limit', () => {
  for (const raw of ['8751', '99999', '99', '0', '-100', '7000.5', '70abc', 'banana', '', '7e3']) {
    assert.equal(parseHash(`#ceil=${raw}`, car).ceil, 8750, raw);
  }
});

test('the floor in a link is checked against the ceiling in that link', () => {
  // over ceil - 100: the default floor, pulled under the ceiling when it has to be
  assert.equal(parseHash('#floor=7000&ceil=7000', car).floor, 3000);
  assert.equal(parseHash('#floor=6950&ceil=7000', car).floor, 3000);
  assert.equal(parseHash('#floor=6900&ceil=7000', car).floor, 6900);
  assert.equal(parseHash('#floor=5000&ceil=2000', car).floor, 1900);
  assert.equal(parseHash('#ceil=2000', car).floor, 1900);
  assert.equal(parseHash('#ceil=100', car).floor, 0);
  // the order of the keys does not matter
  assert.deepEqual(parseHash('#ceil=7000&floor=4000', car),
                   parseHash('#floor=4000&ceil=7000', car));
});

test('the ceiling bounds: 100 over the floor (and at least 100) up to the rev limit', () => {
  assert.deepEqual(ceilBounds(car, 3000), { min: 3100, max: 8750 });
  assert.deepEqual(ceilBounds(car, 0), { min: 100, max: 8750 });
  assert.deepEqual(ceilBounds(car), { min: 100, max: 8750 });
  assert.deepEqual(floorBounds(car, 7000), { min: 0, max: 6900 });
});

test('a typed rev ceiling accepts any whole number from floor + 100 to the rev limit', () => {
  assert.equal(parseCeil('7050', car, 3000), 7050);
  assert.equal(parseCeil(' 8750 ', car, 3000), 8750);
  assert.equal(parseCeil('3100', car, 3000), 3100);
  for (const raw of ['3099', '3000', '8751', '-1', '2.5', 'abc', '', '1e3', null]) {
    assert.equal(parseCeil(raw, car, 3000), null, String(raw));
  }
});

test('a typed rev floor is capped at 100 under the ceiling', () => {
  assert.equal(parseFloor('6900', car, 7000), 6900);
  assert.equal(parseFloor('6901', car, 7000), null);
  assert.equal(parseFloor('7000', car, 7000), null);
});

test('the buttons step the ceiling by 100 and clamp at both bounds', () => {
  assert.equal(stepCeil(8750, -1, car, 3000), 8650);
  assert.equal(stepCeil(8650, 1, car, 3000), 8750);
  assert.equal(stepCeil(8700, 1, car, 3000), 8750, 'a limit off the 100 grid is reachable');
  assert.equal(stepCeil(8750, 1, car, 3000), 8750);
  assert.equal(stepCeil(3100, -1, car, 3000), 3100);
  assert.equal(stepCeil(3150, -1, car, 3000), 3100);
  assert.equal(stepCeil(200, -1, car, 0), 100);
});

test('the floor buttons clamp to 100 under the ceiling', () => {
  assert.equal(stepFloor(6800, 1, car, 7000), 6900);
  assert.equal(stepFloor(6900, 1, car, 7000), 6900);
});

// --- one rev ceiling, two controls ------------------------------------------------------

test('rpmControlView: the value, and each button disabled at its own bound', async () => {
  const { rpmControlView } = await import('../js/state.js');
  assert.deepEqual(rpmControlView(7000, { min: 3100, max: 8750 }),
    { value: '7000', minusDisabled: false, plusDisabled: false });
  assert.deepEqual(rpmControlView(3100, { min: 3100, max: 8750 }),
    { value: '3100', minusDisabled: true, plusDisabled: false });
  assert.deepEqual(rpmControlView(8750, { min: 3100, max: 8750 }),
    { value: '8750', minusDisabled: false, plusDisabled: true });
});

test('revControlViews: the floor and the ceiling views come from the one state', async () => {
  const { revControlViews } = await import('../js/state.js');
  const v = revControlViews(car, { ...defaultState(car), floor: 6000, ceil: 6100 });
  assert.deepEqual(v.ceil, { value: '6100', minusDisabled: true, plusDisabled: false });
  assert.deepEqual(v.floor, { value: '6000', minusDisabled: false, plusDisabled: true });
  assert.deepEqual(revControlViews(car, defaultState(car)).ceil,
    { value: '8750', minusDisabled: false, plusDisabled: true });
});

test('app.js: both rev ceiling controls are built from one spec and synced from one view', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  // one spec writes state.ceil and tracks the one event; both controls are made from it
  assert.equal((src.match(/state\.ceil = v/g) || []).length, 1);
  assert.equal((src.match(/'edit-rev-ceiling'/g) || []).length, 1);
  assert.match(src, /buildRpmControl\(ceilSpec\('rev-ceiling'\)[,)]/);
  assert.match(src, /buildRpmControl\(ceilSpec\('bar-rev-ceiling'\)[,)]/);
  // every sync paints the same ceiling view onto every ceiling control
  assert.match(src, /for \(const c of controls\.ceils\) paintRpm\(c, views\.ceil\)/);
});

test('rpmInputKey: Enter commits, Escape cancels, anything else is left to the input', () => {
  assert.equal(rpmInputKey('Enter'), 'commit');
  assert.equal(rpmInputKey('Escape'), 'cancel');
  for (const k of ['a', '5', 'Tab', 'Backspace', undefined]) assert.equal(rpmInputKey(k), null);
});

// --- the editable rev limit -------------------------------------------------------------

test("the rev limit defaults to the car's own and stays out of the hash at that value", async () => {
  const { revLimitOf } = await import('../js/state.js');
  assert.equal(defaultState(car).rl, 8750);
  assert.equal(revLimitOf(car, defaultState(car)), 8750);
  assert.doesNotMatch(toHash(defaultState(car), car), /rl=/);
});

test('an edited rev limit round-trips through the hash as rl, with the ceiling following it', async () => {
  const { applyRevLimit } = await import('../js/state.js');
  const s = applyRevLimit(defaultState(car), 8000, car);
  assert.equal(s.rl, 8000);
  assert.equal(s.ceil, 8000);
  assert.match(toHash(s, car), /rl=8000/);
  // the ceiling at the limit is the default, so it is left out
  assert.doesNotMatch(toHash(s, car), /ceil=/);
  assert.deepEqual(parseHash(toHash(s, car), car), s);
});

test('parseRevLimit: a whole rpm from 2000 to 15000, anything else is null', async () => {
  const { parseRevLimit, REV_LIMIT_MIN, REV_LIMIT_MAX } = await import('../js/state.js');
  assert.equal(REV_LIMIT_MIN, 2000);
  assert.equal(REV_LIMIT_MAX, 15000);
  assert.equal(parseRevLimit('2000'), 2000);
  assert.equal(parseRevLimit(' 15000 '), 15000);
  assert.equal(parseRevLimit('8450'), 8450);
  // to the nearest 10, as the measured limits and the input's step are
  assert.equal(parseRevLimit('8515'), 8520);
  assert.equal(parseRevLimit('8514'), 8510);
  assert.equal(parseRevLimit('14996'), 15000, 'in range typed, so rounded, not refused');
  for (const raw of ['1999', '15001', '0', '-8000', '8450.5', '8e3', 'abc', '', null, undefined]) {
    assert.equal(parseRevLimit(raw), null, String(raw));
  }
});

test("an invalid rl in a link falls back to the car's own limit", () => {
  for (const raw of ['1999', '15001', 'abc', '', '7000.5']) {
    const s = parseHash(`#rl=${raw}`, car);
    assert.equal(s.rl, 8750, raw);
    assert.equal(s.ceil, 8750, raw);
  }
});

test("a linked ceiling is checked against the linked rev limit, not the car's own", () => {
  assert.equal(parseHash('#rl=7000&ceil=6500', car).ceil, 6500);
  assert.equal(parseHash('#rl=7000&ceil=8000', car).ceil, 7000);
  assert.equal(parseHash('#ceil=8000&rl=7000', car).ceil, 7000);
  // a rev limit above the car's own is allowed, and the ceiling may reach it
  assert.equal(parseHash('#rl=9500&ceil=9200', car).ceil, 9200);
  assert.equal(parseHash('#rl=9500', car).ceil, 9500);
});

test('applyRevLimit: a limit dropped under a lowered ceiling clamps it; a higher one leaves it', async () => {
  const { applyRevLimit } = await import('../js/state.js');
  const lowered = { ...defaultState(car), ceil: 7000 };
  assert.equal(applyRevLimit(lowered, 6500, car).ceil, 6500);
  assert.equal(applyRevLimit(lowered, 7500, car).ceil, 7000);
  assert.equal(applyRevLimit(lowered, 9000, car).ceil, 7000);
  // a ceiling at the limit is not lowered, so it moves with the limit both ways
  assert.equal(applyRevLimit(defaultState(car), 9000, car).ceil, 9000);
  assert.equal(applyRevLimit(defaultState(car), 6000, car).ceil, 6000);
  // the ceiling clamped to the limit is left out of the hash
  assert.doesNotMatch(toHash(applyRevLimit(lowered, 6500, car), car), /ceil=/);
});

test('applyRevLimit keeps the floor 100 under the ceiling, and leaves it alone otherwise', async () => {
  const { applyRevLimit } = await import('../js/state.js');
  assert.equal(applyRevLimit(defaultState(car), 2500, car).floor, 2400);
  assert.equal(applyRevLimit(defaultState(car), 6000, car).floor, 3000);
  const s = { ...defaultState(car), floor: 6000, ceil: 7000 };
  assert.equal(applyRevLimit(s, 6050, car).floor, 5950);
});

test("resetting to the car's own limit restores the default state", async () => {
  const { applyRevLimit } = await import('../js/state.js');
  const edited = applyRevLimit(defaultState(car), 7000, car);
  assert.deepEqual(applyRevLimit(edited, 8750, car), defaultState(car));
});

test('app.js tracks rev limit edits as edit-rev-limit and reads the limit through withRevLimit', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.equal((src.match(/'edit-rev-limit'/g) || []).length, 1);
  assert.match(src, /car = withRevLimit\(data, state\.rl\)/);
  assert.match(src, /toHash\(state, data\)/);
  assert.doesNotMatch(src, /toHash\(state, car\)/);
});

// --- rev limits off the 100 rpm grid (measured 2026-09-14, rounded to 10 rpm) -------------

test('the Stratos at 8520: the ceiling opens on the limit, − goes to 8420, + back to 8520', () => {
  const stratos = load('lancia-stratos');
  assert.equal(stratos.engine.redline, 8520);
  const s = defaultState(stratos);
  assert.equal(s.ceil, 8520);
  assert.equal(s.rl, 8520);
  const down = stepCeil(s.ceil, -1, stratos, s.floor);
  assert.equal(down, 8420);
  assert.equal(stepCeil(down, 1, stratos, s.floor), 8520);
  assert.equal(stepCeil(8520, 1, stratos, s.floor), 8520);
  assert.equal(toHash(s, stratos).includes('ceil='), false);
  assert.equal(parseHash('#ceil=8420', stratos).ceil, 8420);
  assert.equal(stepFloor(8420, 1, stratos, 8520), 8420, 'the floor stays 100 under the ceiling');
});

test('every car: the default ceiling is its limit, and − then + comes back to it', () => {
  const slugs = readdirSync(new URL('../data/', import.meta.url))
    .filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.slice(0, -5));
  for (const slug of slugs) {
    const c = load(slug);
    const s = defaultState(c);
    assert.equal(s.ceil, c.engine.redline, slug);
    assert.equal(stepCeil(stepCeil(s.ceil, -1, c, s.floor), 1, c, s.floor), c.engine.redline, slug);
    assert.equal(c.engine.redline % 10, 0, `${slug}: limits are stored to the nearest 10 rpm`);
  }
});

test('the rev limit input steps by 10, so every stored limit is a valid value of it', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'rev-limit', type: 'number', step: '10',/);
});

// --- Power and torque's unit ---------------------------------------------------------------

test('power in hp: pw=hp in the hash when on, nothing when off, and it round-trips', async () => {
  const { powerUnitOf, setPowerUnit } = await import('../js/state.js');
  const off = defaultState(car);
  assert.equal(powerUnitOf(off), 'kW');
  assert.equal('pw' in off, false);
  assert.equal(toHash(off, car).includes('pw='), false);
  const on = setPowerUnit(off, true);
  assert.equal(powerUnitOf(on), 'hp');
  assert.match(toHash(on, car), /&pw=hp$/);
  assert.deepEqual(parseHash(toHash(on, car), car), on);
  assert.deepEqual(setPowerUnit(on, false), off);
  assert.deepEqual(parseHash(toHash(setPowerUnit(on, false), car), car), off);
});

test('an invalid pw in a link is kW', async () => {
  const { powerUnitOf } = await import('../js/state.js');
  for (const raw of ['ps', 'kW', 'HP', '1', '', 'hp ']) {
    const s = parseHash(`#s=Gravel&pw=${encodeURIComponent(raw)}`, car);
    assert.equal(powerUnitOf(s), 'kW', raw);
    assert.equal('pw' in s, false, raw);
  }
});

test('app.js: the Power in hp checkbox tracks toggle-power-unit and draws the chart in its unit', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.equal((src.match(/'toggle-power-unit'/g) || []).length, 1);
  assert.match(src, /'Power in hp'/);
  assert.match(src, /powerTorque\.render\(svgOf\('power'\), car, hover\.power, state\.ceil,\s*powerUnitOf\(state\)\)/);
  assert.match(src, /controls\.powerUnit\.checked = powerUnitOf\(state\) === 'hp'/);
});

test('Copy settings does not mention the power unit', async () => {
  const { settingsText } = await import('../js/settingsText.js');
  const { setPowerUnit } = await import('../js/state.js');
  const stratos = load('lancia-stratos');
  const s = defaultState(stratos);
  assert.equal(settingsText(stratos, setPowerUnit(s, true)), settingsText(stratos, s));
});
