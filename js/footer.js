// Footer copy. Pure: the page wiring in app.js puts it on the page.

/** The source of the numbers, from data/index.json. Missing parts are left out. */
export function dataLine(index) {
  const version = index?.game_version;
  const date = index?.generated;
  return `Read from the ACR ${version ? version + ' ' : ''}game files.`
    + (date ? ` Generated ${date}.` : '');
}

const REV_LIMIT_NOTES = Object.freeze({
  measured: 'Measured in game with telemetry.',
  estimated: 'Estimated from the game files, not yet measured.',
  'measured-stale': 'Measured on an earlier game version.',
});

/**
 * The note under the rev limit input, from the data's `engine.redline_source`. A source this
 * page does not know gets only the editing line rather than a claim it cannot back.
 */
export function revLimitNote(source) {
  const lead = REV_LIMIT_NOTES[source];
  return (lead ? lead + ' ' : '') + 'If your limiter differs, edit it here.';
}

/** The rolling radius factor's note. */
export const FACTOR_NOTE = 'A loaded tyre rolls on a smaller radius than the stored one. This '
  + 'factor was fitted against measured in-game top speeds on four cars (Stratos, 306 Maxi, '
  + 'Xsara WRC, 037), and is applied to every car and surface. Edit it and every chart redraws.';

export const PROMO = Object.freeze({
  before: 'Want a setup, not just the numbers? ',
  link: 'ACR Setup Engineer',
  after: ' — a free Claude skill that tunes a car to how you drive and saves it to your Notion.',
  href: 'https://github.com/fredmayor88/acr-setup-engineer',
});

/** Closes the promo line: where to report a wrong number or ask for something. */
export const ISSUES = Object.freeze({
  before: ' · ',
  link: 'Issues and feedback',
  href: 'https://github.com/fredmayor88/acr-car-lab/issues',
});
