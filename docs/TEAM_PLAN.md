# Elevation team plan: three parallel tracks

Three people, each with their own Claude Code session, on three tracks:

| Track | Goal |
|---|---|
| **Physics** | How pieces feel: gravity, friction, stability, tiny-piece reliability, the build-phase rules |
| **Disasters** | How the four disasters play and look: forces, escalation, visuals, collapse rules |
| **Sound** | How everything sounds: impacts, UI, disaster cues and ambience |

**Joshua is the integrator.** He reviews and merges every PR, owns `main`, and is the only one who touches the shared files listed below.

The process is built around one idea: **each track owns its own files, and tracks talk through a few small, agreed interfaces.** If two people never edit the same lines, git merges their work without conflicts.

---

## 0. Before anyone branches (once)

1. **Joshua:** commit and push everything to `main`, including this plan, `CLAUDE.md` and the "seams" refactor (§2). Every branch must start from that commit. A branch made from an older `main` will conflict.
2. **Everyone:**
   ```bash
   git clone https://github.com/JoshNguyen13/Elevation.git   # or: git switch main && git pull
   npm install
   npm run dev          # http://localhost:3000, then open http://localhost:3000/dev
   ```
   No API keys are needed to play. Supabase keys in `.env.local` are optional, and the SerpAPI and Gemini keys stay with Joshua.
3. **Everyone:** read `CLAUDE.md` (one screen). Your Claude Code session loads it automatically.

---

## 1. Who owns what

Edit the files in **your** row freely. For anything else, see §4.

| Owner | Files |
|---|---|
| **Physics** | `src/lib/physics/world.ts` · `src/lib/physics/constants.ts` (everything **above** the "Testing Phase" block) · `src/lib/game/buildSession.ts` (everything **except** the "Testing Phase" section) · `src/lib/game/geometry.ts`, `board.ts`, `dailyScale.ts`, `scoring.ts`, `draw.ts` |
| **Disasters** | `src/lib/physics/disasters.ts` (split it into a `disasters/` folder if it grows) · `src/lib/game/disasterVisuals.ts` · `src/lib/juice/effects.ts`, `particles.ts`, `shake.ts` · the "Testing Phase" block in `constants.ts` and the "Testing Phase" section in `buildSession.ts` · `src/components/game/StabilityMeter.tsx` |
| **Sound** | `src/lib/juice/audio.ts`, `sounds.ts` · `src/components/game/SoundToggle.tsx` · `public/sounds/` (new, if you use audio files) |
| **Joshua (integrator)** | `CONTEXT.md` · `scripts/**` · `src/data/**` · `src/lib/daily/**` · `supabase/**` · `package.json`, `package-lock.json` · screens (`Game.tsx`, `BuildPhase.tsx`, `BoardCanvas.tsx`, `*Screen.tsx`, `HeightRuler.tsx`, `PieceTray.tsx`) · the camera (`src/lib/game/boardView.ts`: zoom, pan, edge auto-pan) · `src/components/dev/**` · `src/lib/juice/index.ts` |

**Shared contracts.** These are the interfaces between tracks. Change them only through a contract PR (§4):
- `JuiceEvent` and `Phase` at the top of `buildSession.ts`: events the game raises for sound and effects.
- `DisasterCue` and `DisasterStep` at the top of `disasters.ts`: how a disaster raises cues.
- `DisasterType` in `src/lib/supabase/types.ts`, plus the database check constraint. Adding a disaster type also changes which disaster future days get.
- The `Material` type in `src/data/materials.ts`.
- `PhysicsWorld` methods that `disasters.ts` calls (`applyForce`, `addMeteor`, `removePiece`, `body`).

---

## 2. The seams: how tracks connect without sharing files

**Disaster → sound and visuals.** Inside `apply()`, a disaster raises a named cue:
```ts
cue("gust", { x, y, strength: 0.8 });   // strength 0–1
```
- **Sound** plays it in `src/lib/juice/sounds.ts`, under `case "disaster"`.
- **Disasters** shows it in `src/lib/juice/effects.ts`, also under `case "disaster"`.
- The view layer ignores a cue it doesn't map yet.
- **The agreed cues:** `gust` (wind), `tremor` (earthquake), `wave` (flood) and `meteor-incoming` (meteor; already raised when a meteor spawns). Adding a cue means adding its name to `DisasterCue` and listing it in `docs/tracks/disasters.md`, so the sound dev knows to map it.

**Disaster drawing.** `drawDisaster(ctx, disaster)` in `src/lib/game/disasterVisuals.ts` draws over the pieces in board pixels, during testing only. It reads state from the disaster object (the flood's water line is the current example). Disasters may add getters to their own disaster objects for this. Nothing outside `disasters.ts` and `disasterVisuals.ts` uses them.

**Physics → sound.** The existing events are: `impact` (x, y, strength 0–1, meteor), `place`, `pickup`, `rotate`, `fallen`, `tick` (last 10 s) and `phase`. If sound needs more (say, the piece's mass on `impact` so heavy things thud lower), that's a contract PR from Physics.

**Physics ↔ disasters.** Disasters push the world only through `PhysicsWorld` methods. If a disaster needs a new one (for example, spawning debris bodies), Physics adds it in a small contract PR.

---

## 3. Git workflow

**Branches:** `physics/<topic>`, `disasters/<topic>`, `sound/<topic>`. For example, `disasters/wind-visuals`.

**Starting a topic:**
```bash
git switch main && git pull
git switch -c disasters/wind-visuals
```

**Keep PRs small.** One topic, about a day of work or less. Open the PR as a draft early so the others can see what's coming.

**Sync at least once a day, and always before asking for review:**
```bash
git fetch origin
git rebase origin/main        # replays your commits on top of the latest main
# On a conflict: if it's only in your files, fix it, then `git add <file>` and `git rebase --continue`.
#                if it's in someone else's file, run `git rebase --abort` and ask them.
```

**Merging:**
- Joshua squash-merges reviewed PRs into `main`.
- After any merge, everyone else rebases.
- Use the checklist in the PR template.

**Never:**
- force-push `main`, or commit `.env.local`;
- run `npm run materials:run`;
- edit `CONTEXT.md` (log in `docs/tracks/<track>.md` instead);
- reformat or rename code you don't own;
- add an npm dependency without asking Joshua first.

**Two specific conflict cases:**
- **`package-lock.json`:** never hand-merge it. Take `main`'s version and run `npm install`.
- **`AGENTS.md`:** `next dev` sometimes rewrites it. If it shows up as changed, commit it as is.

---

## 4. When you need someone else's file

1. **Ask in the team chat:** "I need `X` in `<file>` because `Y`."
2. **The owner makes the change**, or OKs you making it, in a **tiny separate PR** that contains only that change.
3. **Joshua merges it first.** Everyone rebases, and then you build on it.

Contract changes (§1) always follow this process, even one-line ones.

---

## 5. Working with Claude Code

- **Where to start it:** at the repo root. It reads `CLAUDE.md` and `AGENTS.md` by itself.
- **The first message** of every new session is your track's **kickoff prompt** (§6). Then give it tasks, one topic at a time.
- **Plan first.** For anything bigger than a tweak, ask *"Plan this first; don't edit yet."* Read the plan, then say go.
- **Review before committing.** Claude doesn't commit unless you ask. Read `git diff` yourself first.
- **One session per checkout.** Two Claude sessions editing the same folder will trip over each other. For parallel tasks, use `git worktree add ../elevation-2 -b physics/other-topic`.
- **Test in the Dev Lab** at `http://localhost:3000/dev`:
  - pick any pieces (including duplicates), any disaster, a seed and a build time;
  - start straight into the build, or through the intro or tutorial;
  - use **Restart** and **← Dev Lab** during a run;
  - drive it from the console with `window.__elevation` (`.debugPieces()`, `.endBuild()`), `__view`, `__juice` and `__sound`.

---

## 6. Prompts

**Kickoff prompts:** paste your track's prompt as the **first message** of your first Claude Code session. It creates your branch, reads the right docs and starts on goal 1. In later sessions on the same branch, skip SETUP step 2 (say "we're already on my branch"). Edit the goals as the team's priorities change. The task prompts underneath are examples to adapt.

### 6.1 Physics: kickoff

```text
You're my Claude Code partner on the PHYSICS track of Elevation, a daily 2D physics-stacking
puzzle (Next.js 16 + React 19 + Matter.js). Everyone gets the same 10 real-world objects each day,
stacks them as high as they can in 2 minutes, then a disaster tests the tower.

SETUP (do this first):
1. Run git status and git pull on main. If there are uncommitted changes or main isn't up to date,
   stop and tell me.
2. Create my branch: git switch -c physics/feel-and-stability
3. Read CLAUDE.md, AGENTS.md, docs/TEAM_PLAN.md §1–5, CONTEXT.md §4 ("Physics constants and rules",
   "Build-phase rules") and the CONTEXT.md §8 open questions under Phases 1, 2, 3 and 6.

MY FILES (edit only these): src/lib/physics/world.ts · src/lib/physics/constants.ts (above the
"Testing Phase" block) · src/lib/game/buildSession.ts (everything except its "Testing Phase" section)
· src/lib/game/geometry.ts, board.ts, dailyScale.ts, scoring.ts, draw.ts.
If a change needs any other file, or a shared contract (JuiceEvent, the PhysicsWorld methods
disasters.ts uses, the Material type), stop and tell me what and why. Don't edit it.

GOALS, in order. Each one is its own small PR:
1. Feel: gravity is Matter's default (~2.5 g at our scale). Measure how a 6-piece stack behaves in the
   Dev Lab now, then propose 2–3 gravity/friction settings with the trade-offs. Don't change anything
   until I pick one.
2. Tiny pieces: some days have 2–8 px pieces (e.g. a tennis ball next to a giraffe) that tunnel through
   others or jitter. Make them reliable without changing real-world proportions. Compare substeps,
   slop and a minimum collision size before choosing.
3. Calm stacks: resting stacks shouldn't creep or jitter (solver iterations, sleeping), without
   breaking pickup, the freeze-on-placement rule or the live height readout.

HOW WE WORK:
- For each goal: investigate, then give me a short plan, and wait for my OK before editing.
- Test in the Dev Lab at http://localhost:3000/dev (any pieces, any disaster, a 10-minute build
  timer). If a dev server is already running on :3000, use it; don't start another. Measure with
  window.__elevation.debugPieces() and report numbers, not impressions.
- Keep the existing code and comment style. No new npm packages. Don't commit or push.
- When a goal is done: run npx tsc --noEmit, npm run lint and npm run build, add an entry to
  docs/tracks/physics.md, then give me a PR description using .github/pull_request_template.md.

Start with SETUP, then report what you found for goal 1.
```

**Example task prompts:**
- *"In the Dev Lab, put 4 bricks and a tennis ball on the platform with the 10-minute timer. Log how far each piece drifts in 20 s at rest, then propose changes to cut that in half."*
- *"Mass and friction come from `scripts/materials/convert.mjs` (`LIMITS`), which Joshua owns. Write me the numbers you'd change and why, so I can send them to him. Don't edit that file."*
- *"Pieces dangling off the platform edge still count toward the measured height (CONTEXT §8). Propose a rule, plan the change in `measure()`, and wait for my OK."*

### 6.2 Disasters: kickoff

```text
You're my Claude Code partner on the DISASTERS track of Elevation, a daily 2D physics-stacking
puzzle (Next.js 16 + React 19 + Matter.js). Everyone gets the same 10 real-world objects each day,
stacks them for 2 minutes, then that day's disaster (wind, earthquake, flood or meteor shower) hits
the tower. The disaster is the drama: it should be readable, escalating and fair.

SETUP (do this first):
1. Run git status and git pull on main. If there are uncommitted changes or main isn't up to date,
   stop and tell me.
2. Create my branch: git switch -c disasters/readability
3. Read CLAUDE.md, AGENTS.md, docs/TEAM_PLAN.md §1–5 (especially §2, the cue seam), CONTEXT.md §4
   (Testing Phase and disaster notes) and CONTEXT.md §8 "Raised during Phase 4".

MY FILES (edit only these): src/lib/physics/disasters.ts (you may split it into a disasters/ folder) ·
src/lib/game/disasterVisuals.ts · src/lib/juice/effects.ts, particles.ts, shake.ts · the "Testing
Phase" block in src/lib/physics/constants.ts · the "Testing Phase" section of
src/lib/game/buildSession.ts · src/components/game/StabilityMeter.tsx.
If a change needs any other file, a new cue name, or a shared contract (DisasterType, JuiceEvent,
PhysicsWorld methods), stop and tell me what and why. Don't edit it.

GOALS, in order. Each one is its own small PR:
1. Baseline: run all 4 disasters in the Dev Lab with seed 1 and the same set (elephant, giraffe, piano,
   3 bricks, soda can). Report survival seconds and when the first piece fell, as a table. No changes.
2. Readability: a player should see what's hitting the tower. Wind streaks or leaves, waves on the
   flood's water line, ground cracks or dust for the earthquake, and a warning marker plus trail before
   each meteor lands. Drawing goes in disasterVisuals.ts; particles and shake go in effects.ts.
3. Cues for sound: raise cue("gust" | "tremor" | "wave", { x, y, strength }) at the dramatic moments
   (gust peaks, tremor peaks, wave crests). meteor-incoming already exists. Keep the list of raised
   cues current in docs/tracks/disasters.md; the sound track maps them.
4. Tuning: today a bare 4-square column collapses in 4–17 s and a flat pile survives all 75 s.
   Propose magnitudes so a decent tower lasts about 30–60 s and a flat pile doesn't get a free 5.0.
   Show before/after numbers with the same seed.

HARD RULES:
- Disasters must stay deterministic for a given seed (same day = same disaster for everyone). Use the
  rng passed into createDisaster, never Math.random() in physics code, and keep rng call order stable.
- Visuals, particles and shake must never affect physics.

HOW WE WORK:
- For each goal: investigate, then give me a short plan, and wait for my OK before editing.
- Test in the Dev Lab at http://localhost:3000/dev (pick pieces, disaster, seed, build time; Restart
  re-runs). If a dev server is already running on :3000, use it; don't start another.
- Keep the existing code and comment style. No new npm packages. Don't commit or push.
- When a goal is done: run npx tsc --noEmit, npm run lint and npm run build, add an entry to
  docs/tracks/disasters.md, then give me a PR description using .github/pull_request_template.md.

Start with SETUP, then do goal 1.
```

**Example task prompts:**
- *"Run each disaster in the Dev Lab with seed 1 and the set elephant, giraffe, piano, 3 bricks. Report survival seconds and when the first piece fell, as a table. Don't change anything yet."*
- *"Add a 1-second warning marker at the top of the board where each meteor will land, drawn in `disasterVisuals.ts`. The meteor spawn already knows its x."*
- *"I want a fifth disaster, a tornado. Write the plan, including what Joshua must change (`DisasterType`, the database migration, the daily generator) and what it does to future days. Don't implement it yet."*

### 6.3 Sound: kickoff

```text
You're my Claude Code partner on the SOUND track of Elevation, a daily 2D physics-stacking puzzle
(Next.js 16 + React 19). Players stack 10 real-world objects for 2 minutes, then a disaster (wind,
earthquake, flood or meteor shower) hits the tower. Sound should make every placement satisfying and
every disaster dramatic.

SETUP (do this first):
1. Run git status and git pull on main. If there are uncommitted changes or main isn't up to date,
   stop and tell me.
2. Create my branch: git switch -c sound/disaster-audio
3. Read CLAUDE.md, AGENTS.md, docs/TEAM_PLAN.md §1–5 (especially §2: the event list and the disaster
   cue seam), CONTEXT.md §4 "Juice", then src/lib/juice/audio.ts, sounds.ts and index.ts.
   All sound is synthesized with WebAudio in audio.ts (no audio files yet). sounds.ts decides which
   game moment plays which sound.

MY FILES (edit only these): src/lib/juice/audio.ts · src/lib/juice/sounds.ts ·
src/components/game/SoundToggle.tsx · a new public/sounds/ folder.
If you need data the events don't carry (e.g. the piece's mass on impact) or any other file, stop and
tell me what and why. That's a contract change I'll arrange with the other tracks.

GOALS, in order. Each one is its own small PR:
1. Audition tool: in dev builds only, add window.__sound.preview(name), which plays any sound or
   disaster cue by name, so we can tune sounds without playing a round.
2. Disaster cues: give gust, tremor, wave and meteor-incoming their own sounds. They arrive in sounds.ts
   as { kind: "disaster", cue, x, y, strength }. meteor-incoming is already raised; the others will
   come from the disasters track, so test them with the audition tool.
3. Ambience: a quiet loop per disaster while the test runs (starts on phase "testing", fades out on
   "done"), mixed under the effects.
4. Polish: impacts that vary with strength without clipping when many land at once; a master volume
   that respects the existing mute toggle (saved in localStorage); works after the first click on
   Safari/iOS.

HARD RULES:
- Audio is view-only: never affect the game.
- Keep the existing throttling, so 30 impacts in one frame don't become 30 sounds.
- If you add audio files: small, CC0 or otherwise license-free, with their sources listed in
  docs/tracks/sound.md.

HOW WE WORK:
- For each goal: investigate, then give me a short plan, and wait for my OK before editing.
- Test in the Dev Lab at http://localhost:3000/dev (pick a disaster, start the run, Restart to repeat).
  If a dev server is already running on :3000, use it; don't start another.
- Keep the existing code and comment style. No new npm packages. Don't commit or push.
- When a goal is done: run npx tsc --noEmit, npm run lint and npm run build, add an entry to
  docs/tracks/sound.md, then give me a PR description using .github/pull_request_template.md.

Start with SETUP, then propose a plan for goal 1.
```

**Example task prompts:**
- *"Ten placements in a row sound robotic. Add a little random pitch and timing variation to `place` and `impact` (a few percent), and let me A/B it with the audition tool."*
- *"The earthquake is currently silent apart from impacts. Design a low rumble that swells with the quake's intensity. Plan how you'd get the intensity without editing `disasters.ts`."*

### 6.4 Prompts for every track

**Start of day:**
```text
I just ran git pull --rebase origin main. Summarize what changed on main since my last commit that
touches my track's files or the shared contracts, and whether any of it affects my current branch.
```

**Before opening a PR:**
```text
Prepare this branch for a PR: run npx tsc --noEmit, npm run lint, npm run build. Show me git diff --stat
and flag any file outside my track's ownership (docs/TEAM_PLAN.md §1). Update docs/tracks/<track>.md.
Then write a PR description using .github/pull_request_template.md. Don't commit or push.
```

**Rebase conflict:**
```text
I'm mid-rebase with conflicts. For each conflicted file, tell me whose file it is (TEAM_PLAN §1),
what both sides changed, and a proposed resolution. Only resolve files my track owns; for the rest,
tell me who to ask.
```

**Asking another track for a change:**
```text
Write a short message for the team chat asking <owner> for this change in <file>: what exactly,
why my track needs it, and the smallest version that would unblock me.
```

---

## 7. Merge order and rhythm

1. **Contract PRs first.** They're small and unblock the others.
2. **Then feature PRs, in whatever order they're ready.** Keep each one small so they merge cleanly.
3. **Twice a day** (for example, after lunch and at the end of the day), Joshua merges what's reviewed and posts "main updated" in chat. Everyone rebases.
4. **Before the demo,** freeze `main` an hour ahead. After that, bug fixes only.
5. **Joshua folds the `docs/tracks/*.md` logs** into `CONTEXT.md` §9 when he updates it.
