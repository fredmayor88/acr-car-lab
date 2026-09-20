# ACR Car Lab

**→ https://fredmayor88.github.io/acr-car-lab/**

Interactive gearing and power charts for 18 cars in Assetto Corsa Rally. Each car has a
gearing page at **`<slug>/gears/`**: the power and torque curve, every selectable final drive,
where each gear tops out, shift points, and speed against revs.

`<slug>/` forwards to `<slug>/gears/`, keeping the hash, for links from before the move.

Every gearing number is read from the game's own files. The rev limits are measured in game
and the rolling factor is fitted, not read — see below.

## Using a gearing page

**The control bar** at the top holds:

- **Surface**: the tyre, and so the tyre radius, the speeds are worked out for.
- **Final drive**: one select listing every final drive the car offers (on the Stratos each
  entry is a Primary Gear and Differential Ratio Rear pair). The four fixed-final-drive cars
  (i20, Fabia, Polo R5, 208 Rally4) have no Final drive select. On the five cars with front and
  rear ratio settings (Delta Integrale, 206 WRC, Impreza, Xsara WRC, Quattro) there is instead
  one select per ratio setting, plus Primary Gear on the 206, and a readout of the final drive
  they make. Clicking a row of the Final drive chart picks that final drive too.
- **Gear set**, also picked by clicking or tapping a lane name in "Where each gear tops out".
- **Rev ceiling**: every top speed is read here instead of at the rev limit when lowered.
- **Copy link** and **Copy settings** (the selected settings and each gear's top speed as
  plain text for notes, ending with the link).

On a narrow screen the bar collapses to a one-line summary and a button that opens it.

**Power and torque** has a **kW · hp** switch in its top right corner. The power axis, the
peak power label and the readout are in hp by default (metric hp, kW × 1.35962, the unit of the
car catalogue in acr-setup-engineer); on kW they switch to kW. The curves and the percentages do
not change.

**Shift points** has its own **Rev floor** and **Rev ceiling** over the chart (the ceiling is
the same one as the bar's). **Speed against revs** draws one line per gear of the gear set
selected in the bar. The rolling factor, labelled **Rolling radius factor** (0.8–1.1), and the
**Rev limit** (2000–15000 rpm, to the nearest 10) are editable at the foot of the page, each
with a reset link.

**Readouts.** With a mouse, hover over Power and torque, Where each gear tops out, Shift
points or Speed against revs; the readout goes when the pointer leaves. On a touch screen,
tap to show a readout (it stays after the finger lifts), drag sideways to move it, and tap
anywhere outside the charts to clear it. A vertical swipe scrolls the page as usual, and a
tap on a lane name selects that gear set without drawing a readout.

**The URL hash** holds the state, so a link reopens the same view:

| Key | What |
| --- | --- |
| `s` | Surface: `Tarmac_Dry`, `Tarmac_Wet`, `Gravel`, `Sweden`, `Montecarlo` |
| `fd` | Final drive, as an index into the car's selectable combinations (cars without ratio settings) |
| `pg`, `cdr`, `ctr`, `dfr`, `drr` | On the five cars with ratio settings: the step index of Primary Gear and of each ratio setting, only where it is off stock |
| `set` | Gear set index, from 0 |
| `k` | Rolling factor |
| `floor` | Rev floor, only when not 3000 |
| `rl` | Rev limit, only when edited |
| `ceil` | Rev ceiling, only when below the rev limit |
| `pw` | `kW` when the power unit switch is on kW; absent (hp, the default) otherwise |

The old `draw` key (which gear sets Speed against revs drew) is gone; links that still carry
it load normally and ignore it.

## How the numbers are made

Speed comes from gearing alone — no drag, no slip. Drive passes through three reductions on
its way from the engine to the wheels:

```
engine → primary → gearbox gear → final drive → wheels
```

Every speed on the site is:

```
speed (km/h)             = rpm × tyre circumference (m) × 0.06 ÷ total ratio
total ratio              = primary × gear × final drive
tyre circumference (m)   = 2π × free radius × 0.978
```

0.06 turns metres per minute into km/h: × 60 minutes per hour ÷ 1000 metres per kilometre.
This is `kmh`, `totalRatio` and `circumference` in `js/gearing.js`.

**Free radius and rolling factor.** The free radius is the tyre's, read from the game files.
A loaded tyre rolls on a smaller radius than the stored free one, so it is multiplied by a
rolling factor, 0.978. The factor was fitted to the top speeds measured in game on 15 runs
across eight cars (Lancia Stratos, Peugeot 306 Maxi, Citroen Xsara WRC, Lancia 037, Peugeot
206 WRC, Lancia Delta Integrale, Subaru Impreza, Alfa Romeo GTA Junior), each read at that
car's measured rev limit, and is applied to every car and every surface.

**Primary.** A fixed gear pair in front of the gearbox that scales every gear in the set by
the same amount. Each gear set in the game files carries its own: `primary = the gear set's own
primary`. On most cars it is `25//25`, a ratio of 1. The Alfa Romeo GTA Junior has `30//23` on
every set, and a speed run on it fits that stored primary. On the Mini, Fiat 124, Fiat 131 and
Fulvia it changes from one gear set to the next; each set is taken to use its own in the same
way, which no run has tested yet. The Lancia Stratos and the Peugeot 206 WRC have a Primary
Gear adjustment in setup, and the one you pick replaces the gear set's primary:
`primary = Primary Gear` (measured on both).

**Final drive.** Everything after the gearbox, as one number:

- On the single-ratio cars it is the one ratio setup offers: `final drive = Differential Ratio
  Front` or `final drive = Differential Ratio Rear`.
- The Hyundai i20, Skoda Fabia, VW Polo R5 and Peugeot 208 Rally4 have no final drive
  adjustment: `final drive = <value> (fixed)`, stored as `fixed_final_drive`.
- On the five cars with front and rear ratio settings, see below.

**Front and rear path ratios.** On the Delta Integrale, 206 WRC, Impreza, Xsara WRC and Audi
Quattro the drive goes to the front and the rear wheels along two paths. Each path ratio is
whatever is applied before the centre differential times that path's own ratios, for example
on the Delta:

```
front path ratio = Center Differential Ratio
rear path ratio  = Center Differential Ratio × Center Ratio to Rear × Differential Ratio Rear
```

With all four wheels turning at the same road speed, the centre differential's input turns at
(front output speed + rear output speed) ÷ 2, so the equivalent final drive is:

```
final drive = (front path ratio + rear path ratio) ÷ 2
```

That was measured in game with speed runs on the Delta Integrale, 206 WRC and Impreza. Each
ratio setting on those paths is its own control on the gearing page, and the note under the
Final drive chart writes the formula out in the game's setting names. The fixed ratios are read
from the car data (the Xsara's two differentials are fixed). The Audi has no centre
differential, so it cannot be driven with the front and rear ratios apart to test it; the same
formula is taken from the measured cars, and its gearing page warns while they differ. In the data these cars carry
`final_drive.settings` and `final_drive.formula`.

**Rev limit.** Every top speed is read at the rev limit (or the rev ceiling when lowered). The
rev limits come from in-game telemetry (the highest rpm held over a few seconds at the
limiter, rounded to the nearest 10), not from the end of the torque curve in the game files,
which runs past the limiter on every car but the Lancia Delta Integrale (its curve ends at
7250 rpm, 10 short of the limiter). A car that has not been measured gets an estimate from the
shift-light rev stages in the game files, and its pages say so.

**Peugeot 206 WRC.** The game files have no torque curve of its own: its car data points at
the Citroen Xsara WRC's, so that is the curve its page draws, with a note saying so. Its
gearing is its own.

## Updating after a game patch

The site holds no numbers in its code, so a patch only changes `data/` and the generated
pages.

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

   This writes `data/`, `index.html`, and each car's `gears/`, `drivetrain/` and forwarding
   page. The game version the footer names comes from the install: `ProjectVersion` in
   `acr/Config/DefaultGame.ini` inside the paks (`0.6.0.100866` is shown as `0.6`). It is
   written to `data/index.json` as `game_version`, next to `generated`. If it cannot be read,
   the export fails before writing anything.

   What the exporter reads besides the game files, all in `acr-setup-engineer/tools/gearing-charts/`:
   - `calibration.json`: the measured rev limits (each with its date, game version and the
     shift-light value it was measured against), the speed runs and the fit. The runs and cars
     of the fit are also written to `data/index.json` as `fit`, which the gearing page's rolling
     factor note names.
   - `drivetrain_notes.json`: the drivetrain pages' prose. Every number in it is a placeholder
     computed at export, so a data change updates the text. A note that no longer resolves
     fails that car: it is left out of the export, the rest of the export completes, and the
     run ends non-zero naming it. A car left out is also pruned: its `data/<slug>.json` and its
     three pages are deleted, so committing with `git add -A` (step 4) removes it from the site.
     Fix the note and export again before committing.

3. Check the result before committing:
   - The export prints `!! <slug>: … re-measure` when a car's shift-light rev stages changed
     since its rev limit was measured (or can no longer be read). That car's rev limit is
     then shown as measured on an earlier game version: re-measure it and update
     `calibration.json`.
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
     drive, dry tarmac should read 214 km/h. If it has drifted, the rolling factor needs
     refitting rather than the code changing: add the new runs to `calibration.json`, run
     `python tools/gearing-charts/calibration.py` to refit, set `LOADED_RADIUS_FACTOR` in
     `tools/gearing-charts/gearing.py` to the printed value (the acr-setup-engineer tests fail
     until the two agree), and set `DEFAULT_FACTOR` in this repo's `js/gearing.js` to the same
     value (`node --test` fails until it matches).
   - `node --test` here: the tests read the generated pages too.

4. Commit here:

   ```bash
   git add -A && git commit -m "chore: regenerate for ACR <game_version from data/index.json>"
   ```

## Search

Every page that may be indexed says what the site is in the HTML it serves: the picker's h1,
and a line under the car's name on each gearing page. The line the app draws under that name
is the car's own numbers, and a crawler does not run the app, so it never sees that line. The
purpose has to be in the markup the server sends. Each page canonicals to `./`, so `?pw=kW`
and the state hash do not read as pages of their own.

`sitemap.xml` is written by the exporter from the same car list as the picker, in the same
run, so a car cannot be exported without being listed or pruned without leaving. The forward
at `<slug>/` and the drivetrain pages are left out: one canonicals to `gears/` and the other
is noindex. `test/sitemap.test.js` holds all of that in place.

**`robots.txt` does nothing while this is a project page.** Crawlers read robots.txt from the
host root, and a project page does not own it: for `https://fredmayor88.github.io/acr-car-lab/`
the file they fetch is `https://fredmayor88.github.io/robots.txt`, which this repo cannot
serve. It is in place for the day the site has its own domain. Until then the sitemap is
submitted by hand, once:

1. Open [Google Search Console](https://search.google.com/search-console) and sign in with the
   Google account you want to own the data.
2. Add a property, and pick **URL prefix**, not Domain — Domain needs DNS records, which a
   `github.io` subpath cannot have. Enter the address with its trailing slash:
   `https://fredmayor88.github.io/acr-car-lab/`.
3. Verify with the **HTML file** method. Download the `google<...>.html` file it offers, commit
   it to this repo's root, push, and wait for Pages to deploy (a minute). Check it is live at
   `https://fredmayor88.github.io/acr-car-lab/google<...>.html`, then press Verify. The HTML tag
   method works too, but the picker is generated, so the tag would have to go into the
   exporter's template. **Done:** `google8024ca1d43961260.html` is in the root, and a test keeps
   it there — removing it un-verifies the property.
4. In the left sidebar open **Sitemaps**. The field is relative to the property, so enter
   `sitemap.xml` and press Submit. It should read *Success* within a few minutes, and
   *19 discovered pages* within a day or so.
5. Optional, and the same idea: [Bing Webmaster Tools](https://www.bing.com/webmasters) can
   import the property straight from Search Console once step 4 is done.

Nothing needs doing after a re-export. The sitemap is rewritten with the pages, and Google
re-reads it on its own; there is no resubmitting.

## Local development

ES modules need a server; `file://` will not work.

```bash
python -m http.server 8000
# http://localhost:8000/lancia-stratos/gears/
```

Tests cover the pure modules — the maths, the URL state, touch and hover gestures, tracking,
the theme, and each chart's layout — and the generated pages: every drivetrain page's
formulas against the gears page note, that nothing links to the drivetrain pages yet, and the
copy rules (formulas written out, no personal names).

```bash
node --test
```

## Layout

| Path | What it is |
| --- | --- |
| `js/gearing.js` | Core maths. Pure. |
| `js/state.js` | Page state and the URL hash. Pure. |
| `js/hover.js` | When a mouse, pen or finger draws or clears a chart readout. Pure. |
| `js/barSummary.js` | The collapsed bar's one-line summary. Pure. |
| `js/settingsText.js` | The Copy settings text. Pure. |
| `js/footer.js` | The footer's notes and links. Pure. |
| `js/theme.js` | Light and dark theme toggle, shared by every page. |
| `js/svg.js` | SVG helpers. |
| `js/charts/*.js` | One file per chart: a pure `layout()` and a `render()`. |
| `js/tracking.js` | GoatCounter event wrapper, deduped and queued until the script loads. |
| `js/app.js` | Gearing page wiring. |
| `js/drivetrain.js` | The drivetrain pages' theme toggle and tracking (`read-drivetrain-workings`, promo and issues clicks). |
| `app.css` | Shared styles. |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | The site icon: a rev dial in the site's colours. The PNGs are rendered from the SVG (32 and 180 px) for browsers and home screens that don't take SVG. |
| `test/` | Unit tests, one file per module, plus the generated pages and the copy rules. |
| `package.json` | `npm test` runs `node --test`. |
| `data/` | Generated. Never edit by hand. |
| `index.html` | The car picker. Generated. Never edit by hand. |
| `sitemap.xml` | The picker and every car's gearing page, absolute. Generated. Never edit by hand. |
| `robots.txt` | Hand-written, and inert while the site is a project page — see Search. |
| `google8024ca1d43961260.html` | Search Console's verification token. Deleting it un-verifies the property. |
| `<slug>/gears/index.html` | A car's gearing page. Generated. Never edit by hand. |
| `<slug>/drivetrain/index.html` | A car's drivetrain page. Static, generated with its prose from `drivetrain_notes.json` in acr-setup-engineer and kept current, but not linked from the site yet and marked noindex: set `PUBLISH_DRIVETRAIN_LINKS = True` in `export_car_data.py` to link them from the picker and each gearing page. Never edit by hand. |
| `<slug>/index.html` | Forwards to `gears/`, keeping the hash, for links from before the move. Generated. |

## Licence

Code, chart design and docs: [AGPL-3.0](LICENSE). Reuse is welcome; keep the copyright notice
and release what you build from it under the same licence, including when it runs as a
network service.

Game data in `data/` is extracted from Assetto Corsa Rally and belongs to its rights holders.
