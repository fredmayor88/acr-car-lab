import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMO, dataLine } from '../js/footer.js';

test('the data line names the game version and the build date', () => {
  assert.equal(dataLine({ game_version: '0.6', generated: '2026-09-12' }),
               'Read from the ACR 0.6 game files. Generated 2026-09-12.');
});

test('a missing version or date drops that part and never prints undefined', () => {
  assert.equal(dataLine({ generated: '2026-09-12' }),
               'Read from the ACR game files. Generated 2026-09-12.');
  assert.equal(dataLine({ game_version: '0.6' }), 'Read from the ACR 0.6 game files.');
  assert.equal(dataLine({}), 'Read from the ACR game files.');
  assert.equal(dataLine(undefined), 'Read from the ACR game files.');
  assert.equal(dataLine({ game_version: null, generated: '' }), 'Read from the ACR game files.');
});

test('the promo line is the approved copy, with the skill name as the link', () => {
  assert.equal(PROMO.before + PROMO.link + PROMO.after,
    'Want a setup, not just the numbers? ACR Setup Engineer — a free Claude skill that '
    + 'tunes a car to how you drive and saves it to your Notion.');
  assert.equal(PROMO.link, 'ACR Setup Engineer');
  assert.equal(PROMO.href, 'https://github.com/fredmayor88/acr-setup-engineer');
});
