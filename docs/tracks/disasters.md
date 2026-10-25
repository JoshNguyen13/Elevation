# Disasters track log

Newest first. One entry per session or PR: date · who · branch · what changed · numbers tried · what's open. The integrator folds this into CONTEXT.md §9.

**Cues currently raised** (keep this list current; the sound track maps these):
- `meteor-incoming`: each meteor spawn, with x and strength by size.
- `gust`: each strong gust peak (gust > 0.85), with x on the upwind side and strength = intensity × gust / 1.6.
- `tremor`: once per shake cycle, at its peak, with strength = amplitude / 0.6 and no x.
- `wave`: each crest, from 2 s, every 3.5 s shrinking to 1.5 s, with x upstream, y at the water line, and strength 0.3 → 1 over 42 s.

<!-- Template:
## YYYY-MM-DD · Name · disasters/<topic>
- Changed:
- Tried / numbers:
- Cues added or changed:
- Open:
-->

## 2026-10-25 · Preston (sound, drafted for disasters) · disasters/raise-cues
- Changed: wind, earthquake and flood now raise their cues, so their sounds play in real rounds.
  - Wind: `gust` at each strong gust peak.
  - Earthquake: `tremor` once per shake cycle.
  - Flood: `wave` on a timer that speeds up, set by the new `FLOOD.*Wave*` constants.
  - Cues are view-only: no forces changed, and a seeded run plays out the same.
- Tried / numbers: first pass. Gust strength reaches 1 at about 30 s, tremor at 40 s and wave at 42 s.
- Cues added or changed: `gust`, `tremor` and `wave` are now raised (see the list above).
- Open: `effects.ts` could show these too (for example a dust streak on a gust, or a splash on a wave).
