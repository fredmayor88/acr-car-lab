// Footer copy. Pure: the page wiring in app.js puts it on the page.

/** The source of the numbers, from data/index.json. Missing parts are left out. */
export function dataLine(index) {
  const version = index?.game_version;
  const date = index?.generated;
  return `Read from the ACR ${version ? version + ' ' : ''}game files.`
    + (date ? ` Generated ${date}.` : '');
}

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
