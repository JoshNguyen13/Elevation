# Physics track log

Newest first. One entry per session or PR: date · who · branch · what changed · numbers tried · what's open. The integrator folds this into CONTEXT.md §9.

<!-- Template:
## YYYY-MM-DD · Name · physics/<topic>
- Changed:
- Tried / numbers:
- Open:
-->

## 2026-10-25 · Josh (integrator) · main (resting: no more creep while building)
- Changed: **resting** (`holdRestingPieces()` in `world.ts`, `REST_*` in `constants.ts`).
  - A piece calm for 30 steps (below 0.1 px/step at its centre and rim) is held where it rested. Each step the solver runs as usual, then its centre is put back, which undoes Matter's creep. **Turning stays free**, so pieces still lean, rock and tip.
  - Lets go when the piece moves faster than 0.1 px/step (a hit, a push, its support leaving: one step of unsupported gravity is ≥ 0.14 px/step), or when it turns more than 0.5° while held. A pinned centre would otherwise stall a slow topple.
  - Build and settle only. `setResting(false)` when the test starts (one line in `buildSession.ts`), so disasters run on plain physics.
- Why: pieces resting on the platform slid sideways at a steady 1–6 px/s, often as a welded group, on 15–30% of pieces.
  - Matter's grip depends on overlap, so any sideways push slowly slides a piece.
  - Weld pins nudge their pieces every step.
- Tried / numbers: a headless Node run of `BuildSession` (outside the repo) over 12 puzzles, placing pieces side by side with 0 / 1 / 4 px gaps, then a second row. After the build: 10 s at rest, a 0.3 px/step shove and a small twist on each piece, then every hold released.

  | Version | Drift > 2 px in 10 s | Shove slide | Twist | Neighbours that react | Drops after release |
  |---|---|---|---|---|---|
  | Plain physics (before) | 14–29 | 0.67–0.99 px | 0.24–0.27° | 318–389 | none |
  | Full pin, first version (too sticky) | 0–2 | 0.23–0.44 px | **0.00°** | 31–36 | up to 114 px |
  | **Now** (centre held, turning free, turn release) | 4–7 | 0.20–0.36 px | 0.11–0.41° | 86–99 | ≤ 8 px on 1 / 4 px gaps |

  - **Rejected: a partial hold** (undo 50–90% of each step's motion). Drift came back (13–33 pieces), because the weld pins push harder against the gap that never closes.
  - **Rejected: lower calm limits** (0.03 / 0.05 / 0.07). Creep and gentle pushes happen at the same speeds, so drift returned (6–19).
  - **Rejected: letting go when anything moving touches the piece.** A loose piece frees its welded group, and the glide comes back (8–12).
  - **Rejected: Matter sleeping.**
    - Welded pieces never sleep, because `Constraint.postSolveAll` wakes any body a pin touched.
    - Sleeping bodies still move: `Constraint.preSolveAll` applies the cached pin impulse every step.
    - Sleepers held pieces in mid-air (a pizza box dropped 27 px on waking).
  - **Rejected: no welds.** Turning bonding off made the drift worse (27–39).
- Disasters (same bot builds; test physics unchanged, but towers reach it intact): mean stability, column / spread.

  | Disaster | Before | After |
  |---|---|---|
  | Earthquake | 2.40 / 2.52 | 3.07 / 2.34 |
  | Cat | 2.73 / 1.60 | 3.07 / 2.39 |
  | Meteor | 1.75 / 2.55 | 2.37 / 2.19 |
  | Fat guy | 1.34 / 1.74 | 2.09 / 1.51 |
  | Wind | 1.34 / 1.13 | 1.21 / 1.35 |
  | Tornado | 4.47 / 3.94 | 4.23 / 4.41 (18/24 at 5/5) |
- Open:
  - Gentle pushes under 0.1 px/step still barely move a resting piece.
  - When the test starts, the plain-physics creep resumes (2–5 px), as it always has during the test.
  - The tornado needs toughening.

## 2026-10-25 · Matthew/Joshua (+ Claude Code) · physics/bonded-stacks
- Changed:
  - **Bonded stacks** (`world.ts`, `BOND_*` in `constants.ts`). Two pieces in contact that both stay calm for 30 steps (0.5s) are welded by two Matter pins at their contact points. A weld snaps once its anchors are pulled 0.5px apart, and calm pieces bond again.
    - Never bonds: the platform (towers still slide and tip on the ground), the frozen piece (welds removed on freeze), meteors.
    - `removePiece` (pickup, fallen, lost) removes a piece's welds.
    - Runs once per fixed step from physics state only, so disasters stay deterministic.
    - `debugPieces()` lists each piece's `bondedTo`.
  - **Friction up** (integrator OK):
    - Generated items +0.3 (`LIMITS` in `convert.mjs`: base/min 0.7 → 1, max 1.5 → 1.8), now 1.16–1.72.
    - Basic shapes 1/1/1.3 → 1.3/1.3/1.6.
    - `FRICTION_STATIC` 2 → 3.
    - The platform's friction is now `PLATFORM_FRICTION` 2 (Matter forced static bodies to 1, which capped every contact with the platform at 1). A frozen piece keeps its material's friction.
  - **Elephant redrawn as a side view.** Hand-drawn path in `scripts/cache/icons/elephant.json` (`"model": "hand-drawn"`; `generate.mjs` now always keeps hand-drawn icons, so a run never pays to replace them). Same cached area, so 3.16 × 3.26 → 3.78 × 2.78 m, mass 2.765 → 2.881.
  - **Flatter animal hitboxes.** `FLAT_HULL_IDS` (elephant, giraffe) in `convert.mjs`: each hull point moves halfway (`LIMITS.flatHullBlend`) out to the bounding box. Flatter top and sides, corners still rounded. Rebuilt with `npm run materials:rebuild` (no API calls); `materials:test` 28/28, `materials:check` ok.
- Tried / numbers (Dev Lab; tray = 6 squares + refrigerator + 3 tennis balls, 26.9 px/m; 6-square column, then the disaster at 4x):
  - **Before:** pieces slide off each other while the piece below is still level (0.1–0.5° tilt).

    | Disaster | Before: survived | Before: slip | After: survived | After: slip |
    |---|---|---|---|---|
    | Earthquake | 49.7s | 71–81px | **75s (full)** | 0.1px |
    | Flood | 21–23s | 64–87px | **31s** | 0px |
    | Meteor | 23–24s | 64–98px | 22s | 28px (welds snap on hits) |
    | Wind | 3s | 23px | 3s (tips as one) | 0.1px |

  - **Friction alone does nothing measurable.** Item and platform friction 0.5–4 and frictionStatic 0.5–10 gave the same first-slip times (17s quake, 13s flood), the same slope creep (5.7 px/s at 20°), and the same slide after a 6 px/step shove (53–62px). Matter's grip depends on overlap, not weight. Raised anyway on request.
  - **Bond tuning:** break 3 or 6px never snapped, even on a full collapse. 0.5px snaps on meteor hits but not quakes. 0.3px with stiffness 0.2 lets a quake break the tower at ~69s.
  - **Build rules checked:**
    - the frozen piece holds no welds;
    - picking up a middle piece removed its 2 welds, the piece above fell 48px and re-bonded;
    - Esc returned it to the tray (spot taken);
    - live height 5.4 → 3.6 m;
    - no page errors.
- Open:
  - **Disasters need retuning:** a bonded column now survives the full 75s earthquake, and wind still flattens a bare column in 3s.
  - **Item sizes changed,** so the elephant's new shape changes `pieceScale()` on elephant days.
  - **The giraffe's hull is still steep** at blend 0.5; 1.0 (the full rounded box) would flatten it but leaves pieces floating above its back.

## 2026-10-25 · Preston (sound, drafted for physics) · physics/juice-phase-disaster
- Changed: contract PR. The `phase` `JuiceEvent` gets an optional `disaster?: DisasterType`, set on the `testing` event, so sound can start that disaster's ambience loop. No behavior change; the disasters track can ignore the field.
- Open: none.

## 2026-10-25 · Matthew (+ Claude Code) · physics/feel-and-stability (goal 1: gravity)
- Changed:
  - **Gravity is per day now**: `GRAVITY_G` (2.5 g) × `STANDARD_GRAVITY` × the day's `pxPerMeter`, clamped to `MIN_GRAVITY_PX_S2`–`MAX_GRAVITY_PX_S2` (500–1000 px/s²). This is `dayGravity()` in `dailyScale.ts`; `GRAVITY_Y` is gone. `PhysicsWorld` takes the gravity in its constructor, and `BuildSession` creates the world after the scale is known. The methods disasters call are unchanged.
  - **Why:** gravity was a fixed 1000 px/s² while piece scale changes per day, so in real-world terms it was 0.81–4.36 g (median 2.8 g) over the next 29 days. Now it's 2.5 g on 19 of those days and 0.81–2.5 g on the 10 small-item days that hit the cap. Screen gravity ranges 574 / 922 / 1000 px/s² (min / median / max).
  - **Impact sounds:** `collectImpacts()` divides impact speed by √(gravity / 1000), so `MIN_IMPACT_SPEED` and the strength curve keep the meaning they were tuned with.
  - **Friction:** unchanged (see below).
- Tried / numbers (Dev Lab, 10-min timer; tray = 6 squares + refrigerator + 3 tennis balls, 26.9 px/m; 6-square column, each piece released 10px above the top, 1.5s apart). Runs are deterministic (fixed step); 3 repeats matched exactly.
  - **Gravity 1000 / 600 / 400 px/s²:**
    - Landings stop in 150–450 / 183–466 / 233–650 ms.
    - A refrigerator tilted 20° falls over in 994 / 1286 / 1611 ms (∝ 1/√g).
    - Contact depth at rest 0.53 / 0.34 / 0.24 px.
    - Settle after `endBuild()` 665 / 1682 / 882 ms. 600 crept 1.79px in 10s in this configuration and settled past the 1.5s window.
  - **Now (660 px/s² on that tray):** landings 182–517 ms, refrigerator 1220 ms, depth 0.37px, drift 0.02px / 10s, settle 832 ms. 10 squares (floor, 500 px/s²): settle 815 ms. `SETTLE_DURATION_S` can stay at 1.5.
  - **Why the cap is 1000, not the 1600 first proposed:** on 2026-11-12 (126 px/m), a microwave / bucket / pizza box / soda can stack (9–18px pieces) crept 1.8 / 3.9 / 7.2 px in 10s at 1000 / 1100 / 1200 px/s² and collapsed at 1600 (6.2px contact depth).
  - **Friction does nothing for resting pieces.** On a refrigerator under tilted gravity (a slope), creep is identical at friction 0.86 / 0.5 / 0.3 / 0.1 and frictionStatic 2 / 1 / 0.5: 5.7 px/s at 20°, no sliding, tips at 55°. Creep = g·sinθ·dt exactly, because Matter moves a body by that step's gravity before the contact solver cancels it. Matter's static friction depends on overlap, not weight. So creep falls with gravity (3.4 / 2.3 px/s at 600 / 400) and with smaller steps or sleeping (goal 3), not with friction.
- Open:
  - **Disasters need a re-baseline.** Wind, quake and flood forces scale with `world.gravityAccel` and follow automatically. Meteor launch speed (px/step) and flood rise (px/s) don't, so their relative strength now changes on days below the cap.
  - **Raising the cap** depends on goals 2–3 (small-piece stability).
  - **Freeze rule:** stacking on the floating frozen piece compounds drops. Each released piece falls the sum of the gaps below it (~8 → 42px over 5 placements).
  - **Hull shapes:** the piano's hull has a sloped lid, so pieces slide off it; the car tire's hull rolls.
