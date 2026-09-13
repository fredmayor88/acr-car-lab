// The one-line summary the control bar shows when it is collapsed on a narrow screen.
// Pure: no DOM. Each part is the label the matching select shows, so the line always reads
// the same as the controls it stands for.

import { SURFACES, ceilingOf, finalDriveCombos } from './gearing.js';
import { comboLabel } from './charts/finalDrive.js';

export const setLabel = set => `${set.label}  (${set.gears.length}-speed)`;

/**
 * Surface, final drive, gear set, each tagged with which control it stands for. No final
 * drive part on a car without one.
 */
export function barSummaryParts(car, state) {
  const parts = [{ key: 'surface',
    text: SURFACES.find(s => s.key === state.surface)?.label ?? state.surface }];
  if (car.final_drive) {
    const combo = finalDriveCombos(car.final_drive)[state.fd];
    if (combo) parts.push({ key: 'fd', text: comboLabel(combo) });
  }
  parts.push({ key: 'set', text: setLabel(car.gear_sets[state.set]) });
  const ceil = ceilingOf(car, state);
  if (ceil < car.engine.redline) parts.push({ key: 'ceil', text: `ceiling ${ceil} rpm` });
  return parts;
}

/** Surface · final drive · gear set (· a lowered rev ceiling), as one line of text. */
export const barSummary = (car, state) =>
  barSummaryParts(car, state).map(p => p.text).join('  ·  ');
