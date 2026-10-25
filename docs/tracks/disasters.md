# Disasters track log

Newest first. One entry per session or PR: date · who · branch · what changed · numbers tried · what's open. The integrator folds this into CONTEXT.md §9.

**Cues currently raised** (keep this list current; the sound track maps these). All arrive as `{ kind: "disaster", cue, x, y, strength }`, positions in board px, strength 0–1:
| Cue | Disaster | When | x, y | strength |
|---|---|---|---|---|
| `gust` | wind | each gust peak (at most every 1.5 s) | the upwind board edge, mid-height | wind × gust, vs. its 75 s max |
| `tremor` | earthquake | each surge peak (every 6 s) | platform center | surge amplitude, vs. its max |
| `fat-guy-incoming` | fat guy | 1.3 s before each jump after the first (the warning appears) | where he'll land, tower top | 0.5–1, grows over time |
| `meteor-incoming` | meteor | 1 s before each fireball after the first (the edge warning appears) | the entry edge, launch height | fireball size |
| `twister` | tornado | the funnel's core crosses the tower's center | the core, near the base | 0.3–1, grows over time |
| `swat` | cat | the paw starts a strike | the board edge, swat height | 0.3–1, grows over time |

Landings and hits are `impact` events with `meteor: true` (every disaster body's label starts with `meteor-`: `meteor-guy-N`, `meteor-rock-N`, `meteor-paw`). Removed: `wave` (flood is gone). Changed: `meteor-incoming` now fires at the warning, 1 s before the fireball enters, not at spawn.

<!-- Template:
## YYYY-MM-DD · Name · disasters/<topic>
- Changed:
- Tried / numbers:
- Cues added or changed:
- Open:
-->

## 2026-10-25 · Jason (+ Claude Code) · disasters/readability
New disaster lineup and the build-up. Joshua OK'd the shared-file changes listed below.

- **Changed: disasters** (`src/lib/physics/disasters/`, split from `disasters.ts`; imports unchanged)
  - **Lineup:** wind, earthquake, **fat guy**, **meteor**, **tornado**, **cat**. Flood is removed.
  - **Fat guy** (`fatGuy.ts`): the old falling-rock meteor, reworked. He cannonballs onto the tower again and again, bigger and faster each time, with a landing warning before every jump after the first.
  - **Meteor** (`meteor.ts`): fireballs fly in from the side on a shallow arc (Angry Birds style). Each launch is aimed at a point on the tower using Matter's own gravity and air friction (`aimVy`).
  - **Tornado** (`tornado.ts`): a funnel enters from the edge and sweeps back and forth through the tower. Inside it, pieces get lift, a pull toward the core, and a height-dependent churn. All forces scale with mass, so a day's piece scale doesn't change them.
  - **Cat** (`cat.ts`): a paw swats in from the side. Each swat is windup (the paw peeks in as the warning), strike, hold, retract. The paw is a disaster body steered by speed-capped forces, using only `addMeteor` / `applyForce`. Strikes start as grazes and grow faster and deeper.
  - **Wind:** forces unchanged. It now raises `gust` cues.
  - **Earthquake:** now comes in surges (0.75–1.3× amplitude over a 6 s period, about −6% average force) and raises a `tremor` cue at each surge peak.
  - **The first hit of every approaching disaster is aimed at the tower with no rng call:** the fat guy lands on its middle, the first meteor hits its upper third, and the first swat lands a third of the way down. That's how the backdrop's approach can land exactly where the real hit does.
  - **Disaster interface:** `side` (the seeded direction), `view()` (a `DisasterView` snapshot for drawing; replaces `waterLineY()`) and `end(world)` (called once from `finishTest`; the cat removes its paw). New types: `DisasterView`, `Projectile`, `DisasterBuildUp`.
- **Changed: shared files** (OK'd by Joshua)
  - `DisasterType` in `src/lib/supabase/types.ts`.
  - New migration `supabase/migrations/0002_disaster_types.sql`: it swaps the check constraint and deletes stored flood days, which then regenerate.
  - `DISASTER_TYPES` grew from 4 to 6, so **the daily generator now picks different disasters for future days.**
  - `buildSession.ts`, physics section: one line, `buildMsTotal`, which the build-up needs.
  - `BuildPhase.tsx` / `.module.css`, `HeightRuler.tsx`, `PieceTray.tsx`: they mount the backdrop, put the page text through `DoomText`, and add `.screen { position: relative; z-index: 0; overflow: clip }`.
  - `Game.tsx`: a comment.
- **Changed: the build-up** (view only)
  - **`BuildSession.buildUp()`** (Testing Phase section) reports build progress, the final approach (settle + height reveal), test time and the standing tower.
  - **`DisasterBackdrop.tsx`** draws two full-screen canvases.
    - **Behind the page,** scenery approaches over the build: a volcano erupting harder, the fat guy walking closer (each footstep makes the letters hop), a funnel growing on the horizon, a cat rising over the page edge with its eyes on the tower, trees bending, buildings swaying and the ground cracking.
    - **In front of the page,** things in flight: the final approach brings the first hit to the board edge exactly as the test starts.
    - **Wind streaks** never draw over the board.
  - **`doomLetters.ts` + `DoomText.tsx`:** every letter of the page text reacts to the disaster.
    - **Wind:** flutters, then everything is blown away as the test starts and drifts back.
    - **Earthquake:** trembles.
    - **Fat guy:** hops on his footsteps and landings.
    - **Meteor:** heat shimmer and glow.
    - **Tornado:** orbits.
    - **Cat:** letters get batted.
  - **Fairness:** physics, the board and the tray never move during the build. The page clips flung letters, so no scrollbars appear and the board never shifts.
  - **Reduced motion:** with `prefers-reduced-motion`, the letters stay still and the scenery still draws.
  - **Board** (`disasterVisuals.ts`, drawn from `view()`; art in `disasterArt.ts`): wind streaks and leaves; platform cracks and ground ripples; the fat guy (cannonball) with a landing shadow, dashed drop line and "!"; fireballs with trails plus edge chevrons and "!"; the funnel with debris; the cat's arm and paw with claws out on the strike, plus "!" on the windup.
  - **`effects.ts`:** particles and shake for every cue.
- **Tried / numbers.** Dev Lab, seed 1, scripted build (identical tower every run), test at 4x (same outcome as 1x). Results are seconds survived, with the first fall in brackets.

  | Tower | Wind | Quake | Fat guy | Meteor | Tornado | Cat |
  |---|---|---|---|---|---|---|
  | 4 squares, column, 7.2 m | 2.4 (2.2) | 52.9 (52.8) | 22.0 (21.7) | 16.6 (16.6) | 75 (none) | 32.5 (32.2) |
  | 6 squares, column, 10.7 m | 2.0 (1.8) | 35.4 (35.3) | 17.9 (17.8) | 11.9 (11.7) | 22.3 (22.2) | 37.4 (36.8) |
  | 1 square, grounded, 1.8 m | 18.4 | 75 | 53.2 | 33.0 | 75 | 46.5 |

  - **Determinism:** two runs with seed 3 (meteor, fat guy, cat) matched exactly.
  - **First-pass cat and tornado** collapsed everything in 1–3 s. The fixes: tornado forces went from area-based to mass-based; the cat got speed-capped strikes that start as grazes.
- **Cues added or changed:** see the table at the top.
- **Open**
  - **Tuning (goal 4).**
    - Wind fells a 4-square column in about 2 s at this set's scale. Its force grows with the piece's size in px but not its mass, so big-scale days are much harsher.
    - The fat guy and meteor sit below the 30–60 s target for columns.
    - A grounded piece still gets a free 5.0 against the quake and tornado.
  - **Sound:** `sounds.ts` still lists the old cues in a comment, and the per-disaster ambience is still to do (sound track).
  - **Docs:** `CONTEXT.md` and `docs/TEAM_PLAN.md` still mention flood and `wave` (Joshua).
  - **Hand-off sizes:** the backdrop fat guy is bigger than the body that lands (radius 15 px on the board), so there's a size jump at the hand-off.
  - **Unrelated quirk:** the build timer can tick up by a few ms on the first frame (negative frame time in `BoardCanvas`). `buildUp()` clamps it.
