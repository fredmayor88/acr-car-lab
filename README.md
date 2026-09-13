# ACR Car Lab

**→ https://fredmayor88.github.io/acr-car-lab/**

Interactive gearing and power charts for 18 cars in Assetto Corsa Rally. One page per
car: the power and torque curve, every selectable final drive, where each gear tops out,
shift points, and speed against revs.

Every gearing number is read from the game's own files. The rev limits are measured in game
and the rolling radius factor is fitted, not read — see below.

## How the numbers are made

Speed comes from gearing alone — no drag, no slip. Drive passes through three reductions on
its way from the engine to the wheels:

```
engine → primary gear → gearbox gear → final drive → wheels
```

Multiply them and you get the total ratio, which turns revs into speed:

```
total_ratio   = primary * gear * final_drive
circumference = 2 * pi * free_tyre_radius * rolling_radius_factor
km/h          = rpm * circumference * 0.06 / total_ratio
```

**Primary gear.** A fixed gear pair in front of the gearbox that scales every gear in the set
by the same amount. Each gear set in the game files carries its own. On most cars it is
`25//25`, a ratio of 1, but on the Mini, Fiat 124, Fiat 131 and Fulvia it changes from one
gear set to the next. The Lancia Stratos and the Peugeot 206 WRC have a separate Primary Gear
adjustment in setup; the one you pick there replaces the gear set's primary.

**Final drive.** Everything after the gearbox, as one number:

- On most cars it is the differential ratio you pick in setup.
- The Hyundai i20, Skoda Fabia, VW Polo R5 and Peugeot 208 Rally4 have no final drive
  adjustment. Their final drive is a single fixed number, stored as `fixed_final_drive`.

**Averaged axles.** On the Lancia Delta Integrale, Peugeot 206 WRC, Subaru Impreza, Citroen
Xsara WRC and Audi Quattro the drive splits to a front and a rear axle, each with its own chain
of ratios. With every wheel at the same road speed the gearbox output turns at the average of
the two chains. That was measured in game with speed runs on the Delta, 206 and Impreza:

```
final_drive = pre-split ratios * (front axle chain + rear axle chain) / 2
```

Each ratio on those chains that setup offers is its own control on these pages, and the note
under their Final drive chart spells out the formula. The fixed ratios are read from the car
data (the Xsara's two differentials are fixed). The Audi has no centre differential, so it
cannot be driven with the front and rear ratios apart to measure it; the same formula is
assumed, and its page warns while they differ. In the data these cars carry
`final_drive.settings` and `final_drive.formula`.

`rolling_radius_factor` defaults to `0.9904`. A loaded tyre rolls on a smaller radius than
the stored free one; the factor was fitted against measured in-game top speeds on seven cars
(Lancia Stratos, Peugeot 306 Maxi, Citroen Xsara WRC, Lancia 037, Peugeot 206 WRC, Lancia
Delta Integrale, Subaru Impreza), each read at that car's measured rev limit, and is applied to every car and every surface. It is editable at the
foot of each car page.

**Rev limit.** Every top speed is read at the rev limit. The rev limits come from in-game
telemetry measurements, not from the end of the torque curve, which runs past the limiter on
most cars. A car that has not been measured yet gets an estimate from the game files, and its
page says so. The rev limit is editable at the foot of each car page too; the power and
torque chart still draws the whole curve.

**Peugeot 206 WRC.** The game files have no torque curve of its own: its car data points at
the Citroen Xsara WRC's, so that is the curve its page draws. Its gearing is its own.

## Updating after a game patch

The site holds no numbers in its code, so a patch only changes `data/`.

1. Check out `acr-setup-engineer` **as a sibling of this repo** — the exporter writes to
   `../acr-car-lab` by default:

   ```
   parent/
     acr-setup-engineer/
     acr-car-lab/
   ```

2. From `acr-setup-engineer`, with the game installed:

   ```bash
   make car-lab
   ```

   The game version the footer names comes from the install as well: `ProjectVersion` in
   `acr/Config/DefaultGame.ini` inside the paks (`0.6.0.100866` is shown as `0.6`). It is
   written to `data/index.json` as `game_version`, next to `generated`. If it cannot be
   read, the export fails before writing anything.

3. Check the result before committing:
   - New cars appear in `data/index.json` and have their own folder.
   - No car lost a surface. Three cars legitimately have four tyre entries instead of five
     (Alpine A110 1.8: no Sweden; Fiat 124 Abarth Rally and Lancia Fulvia Coupé HF: no
     Gravel) — that's expected, not a regression. What matters is nothing *shrank* versus
     the last commit:

     ```bash
     node -e "
     const { execSync } = require('child_process');
     const fs = require('fs');
     for (const f of fs.readdirSync('data')) {
       if (!f.endsWith('.json') || f === 'index.json') continue;
       let prev;
       try { prev = JSON.parse(execSync('git show HEAD:data/' + f, { encoding: 'utf8' })); }
       catch { continue; }
       const cur = JSON.parse(fs.readFileSync('data/' + f, 'utf8'));
       const lost = Object.keys(prev.tyres || {}).filter(k => !(cur.tyres || {})[k]);
       if (lost.length) console.log(f, 'lost', lost);
     }
     "
     ```

     Prints nothing if nothing shrank. Any output names the car and the missing surface —
     that means a tyre asset stopped resolving.
   - Spot-check one top speed in game. The Stratos on gear set 1, top gear, stock final
     drive, dry tarmac should read 215 km/h. If it has drifted, the rolling radius factor
     needs refitting rather than the code changing. The export warns when a car's engine
     data changed since its rev limit was measured (`measured-stale`): re-measure that car.

4. Commit here:

   ```bash
   git add -A && git commit -m "chore: regenerate for ACR <game_version from data/index.json>"
   ```

## Local development

ES modules need a server; `file://` will not work.

```bash
python -m http.server 8000
# http://localhost:8000/lancia-stratos/gears/
```

Tests cover the pure modules — the maths, the URL state, tracking, and each chart's layout:

```bash
node --test
```

## Layout

| Path | What it is |
| --- | --- |
| `js/gearing.js` | Core maths. Pure. |
| `js/state.js` | Page state and the URL hash. Pure. |
| `js/svg.js` | SVG helpers. |
| `js/charts/*.js` | One file per chart: a pure `layout()` and a `render()`. |
| `js/tracking.js` | GoatCounter event wrapper, deduped and queued until the script loads. |
| `js/app.js` | Wiring. |
| `app.css` | Shared styles. |
| `test/` | Unit tests, one file per pure module. |
| `package.json` | `npm test` runs `node --test`. |
| `data/` | Generated. Never edit by hand. |
| `index.html` | Generated. Never edit by hand. |
| `<slug>/gears/index.html` | A car's gearing page. Generated. Never edit by hand. |
| `<slug>/index.html` | Forwards to `gears/`, keeping the hash, for links from before the move. Generated. |

## Licence

Code, chart design and docs: [AGPL-3.0](LICENSE). Reuse is welcome; keep the copyright notice
and release what you build from it under the same licence, including when it runs as a
network service.

Game data in `data/` is extracted from Assetto Corsa Rally and belongs to its rights holders.
