// The selected settings as plain text, for pasting into notes. Pure: no DOM.
// Names are the game's setup-screen names from the data; the top speeds come from the
// same gearing functions the charts draw with, so the text can never disagree with them.

import { DEFAULT_FACTOR, SURFACES, circumference, finalDriveCombos, gearTops } from './gearing.js';
import { fdValue } from './charts/ladder.js';

export function settingsText(car, state) {
  const set = car.gear_sets[state.set];
  const combo = car.final_drive ? finalDriveCombos(car.final_drive)[state.fd] : null;
  const circ = circumference(car.tyres[state.surface].free_radius, state.k);
  const tops = gearTops(set.gears, fdValue(car, state), circ, car.engine.redline);
  const surface = SURFACES.find(s => s.key === state.surface).label;

  const lines = [car.name, `Gear set: ${set.label} (${set.gears.length}-speed)`];
  if (combo?.primary) lines.push(`Primary Gear: ${combo.primary.name}`);
  lines.push(combo ? `${car.final_drive.adjustment}: ${combo.option.name}` : 'Final drive: fixed');
  lines.push('Gears: ' + set.gears.map(g => g.name).join(' · '));
  lines.push(`Top speed per gear (${surface}, ${car.engine.redline} rpm): `
    + tops.map(v => v.toFixed(0)).join(' · ') + ' km/h');
  if (state.k !== (car.defaults?.loaded_radius_factor ?? DEFAULT_FACTOR)) {
    lines.push(`Rolling radius factor: ${state.k}`);
  }
  return lines.join('\n');
}
