# Sound track log

Newest first. One entry per session or PR: date · who · branch · what changed · what's open. The integrator folds this into CONTEXT.md §9.

<!-- Template:
## YYYY-MM-DD · Name · sound/<topic>
- Changed:
- Events / cues now mapped:
- Open:
-->

## 2026-10-25 · Preston · sound/disaster-audio (polish)
- Changed:
  - Limiter (`DynamicsCompressorNode`, −3 dB, 20:1) between the master and the speakers, so piles of sounds don't clip.
  - Impacts: harder hits are lower as well as louder and longer, with ±5% random pitch. The 45 ms throttle stays, but a hit 1.5× harder than the last one still gets through.
  - Master volume: `getVolume` / `setVolume`, saved as `elevation:volume` (default 0.6, today's level), separate from mute. It glides, so changes don't click.
  - Vertical volume slider in `SoundToggle`, under the speaker button. Styled inline, since the column's CSS is `BuildPhase.module.css`. Dragging it to 0 mutes and dragging it up unmutes.
  - Safari/iOS: `unlock()` adds permanent `touchend` / `pointerup` / `click` / `keydown` and `visibilitychange` listeners that resume a suspended or "interrupted" context, and plays a silent sample, which older iOS needs.
- Audition: `impact-burst` (30 impacts in one frame) and `__sound.setVolume(0–1)`.
- Decided against `navigator.audioSession.type = "playback"`. It would play through the iPhone silent switch, but it also stops the player's own music. Games normally respect the switch.
- Open: test on a real iPhone (`http://<your LAN IP>:3000/dev`). If Next blocks the cross-origin dev request, `allowedDevOrigins` in `next.config.ts` is the integrator's call.

## 2026-10-25 · Preston · sound/disaster-audio (ambience)
- Changed: `audio.ts` gets `startAmbience(type)` / `stopAmbience(fade)`, one quiet loop per disaster on its own bus into the master, so mute still works. Each loop fades in over 1.5 s and swells about 40% over 30 s.
  - Wind: a swaying bandpass howl plus a thin whistle.
  - Earthquake: a throbbing low rumble over a 40 Hz bed.
  - Flood: lowpass surf over a water bed.
  - Meteor: a beating 55 Hz drone with faint air.
- Earthquake reworked into a rumble: a 4 s brown-noise buffer (`noise({ brown: true })`). `tremor` now builds over about 0.2 s, rolls with 3–6 overlapping low bursts at random times, and lasts 1.2–2.2 s. The earthquake loop is a brown rumble with a throb (0.6 Hz) and a flutter (7 Hz), plus a grumble layer over the 40 Hz bed.
- Also raised the disaster cue gains: about 1.5× (gust, wave, meteor whistle), 1.25× (tremor).
- Events now mapped: `phase: "testing"` (with a disaster) starts the loop, `done` fades it out over 1.5 s, and any other phase stops it straight away.
- Audition: `ambience-wind` / `-earthquake` / `-flood` / `-meteor` (fakes the testing event, so the whoosh plays too) and `ambience-stop`.
- Needs: landed alongside this work (integrator merge, 2026-10-25).
  - `physics/juice-phase-disaster` adds `disaster?: DisasterType` on the testing `phase` event, so `sounds.ts` reads `event.disaster`.
  - `disasters/raise-cues` raises `gust` / `tremor` / `wave` in real rounds.
  - `integrator/board-stop-ambience` makes `BoardCanvas` cleanup call `sound.stopAmbience(0.3)`.

## 2026-10-25 · Preston · sound/disaster-audio (disaster cues)
- Changed: `tone()` / `noise()` take optional `attack` (swell time) and `pan` (−1–1, via `StereoPannerNode`). Defaults keep the old sounds identical. New voices in `audio.ts`: `gust`, `tremor`, `wave`, `meteorIncoming`, each scaling with strength and throttled per cue (0.6 / 0.4 / 0.8 / 0.25 s), so a cue raised every physics step is still safe.
- Events / cues now mapped: `gust`, `tremor`, `wave`, `meteor-incoming`. Pan comes from the cue's `x` (kept within ±0.6; centered when there's no `x`), and strength is clamped to 0–1.
- Asked the disasters track: raise `gust` / `tremor` / `wave` at moments (gust peak, strong jolt, wave crest) with that moment's strength, plus `x` where it means something, not every step.
- Open: only `meteor-incoming` is raised in-game so far; the others are tuned with `__sound.preview`. Retune once the disasters track's cue timing lands.

## 2026-10-25 · Preston · sound/disaster-audio
- Changed: dev-only audition tool in `sounds.ts`. In the console during a run, `__sound.preview(name, strength = 0.5)` fakes the matching `JuiceEvent` and plays it through `playSoundFor`, so it sounds exactly like the game (throttles included). `__sound.preview()` lists the names. Stripped from production builds.
- Names: `impact`, `impact-meteor`, `fallen`, `place`, `pickup`, `rotate`, `tick`, `tick-final`, `time-up`, `whoosh`, `crash`, `chime`, `gust`, `tremor`, `wave`, `meteor-incoming`.
- Events / cues now mapped: unchanged (the disaster cues are still silent; goal 2).
- Open: `__sound` only exists while a board is mounted (`BoardCanvas`). Click the page once before previewing, or the browser keeps audio locked.
