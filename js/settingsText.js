// The selected settings as plain text, for pasting into notes. Pure: no DOM.
// Names are the game's setup-screen names from the data; the top speeds come from the
// same gearing functions the charts draw with, so the text can never disagree with them.

import { DEFAULT_FACTOR, SURFACES, ceilingOf, circumference, finalDriveCombos, gearTops,
  hasRatioSettings, withRevLimit } from './gearing.js';
import { fdValue } from './charts/ladder.js';
import { ratioLines } from './charts/finalDrive.js';

/**
 * `url` is the link that reproduces this view (what Copy link copies). When given it is the
 * last line, on its own, so a pasted note carries the way back to these exact settings.
 */
export function settingsText(data, state, url) {
  // `data` is the car as loaded; an edited rev limit is applied here, and named below
  const car = withRevLimit(data, state.rl);
  const set = car.gear_sets[state.set];
  const combo = car.final_drive ? finalDriveCombos(car.final_drive)[state.fd] : null;
  const circ = circumference(car.tyres[state.surface].free_radius, state.k);
  // read at the rev ceiling, which is the rev limit unless it has been lowered
  const ceil = ceilingOf(car, state);
  const tops = gearTops(set.gears, fdValue(car, state), circ, ceil);
  const surface = SURFACES.find(s => s.key === state.surface).label;

  const lines = [car.name, `Gear set: ${set.label} (${set.gears.length}-speed)`];
  if (combo?.primary) lines.push(`Primary Gear: ${combo.primary.name}`);
  if (hasRatioSettings(car) && state.ratios) lines.push(...ratioLines(car, state));
  else lines.push(combo ? `${car.final_drive.adjustment}: ${combo.option.name}` : 'Final drive: fixed');
  lines.push('Gears: ' + set.gears.map(g => g.name).join(' · '));
  lines.push(`Top speed per gear (${surface}, ${ceil} rpm): `
    + tops.map(v => v.toFixed(0)).join(' · ') + ' km/h');
  if (car.engine.redline !== data.engine.redline) {
    lines.push(`Rev limit: ${car.engine.redline} rpm`);
  }
  if (state.k !== (car.defaults?.loaded_radius_factor ?? DEFAULT_FACTOR)) {
    lines.push(`Rolling radius factor: ${state.k}`);
  }
  if (url) lines.push(url);
  return lines.join('\n');
}
