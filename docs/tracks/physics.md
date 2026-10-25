# Physics track log

Newest first. One entry per session or PR: date · who · branch · what changed · numbers tried · what's open. The integrator folds this into CONTEXT.md §9.

<!-- Template:
## YYYY-MM-DD · Name · physics/<topic>
- Changed:
- Tried / numbers:
- Open:
-->

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
