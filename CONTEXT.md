# Elevation — Shared Project Context

> **Read this first.** It is the single source of truth for anyone (teammate, Claude, Cursor, Grok) picking this project up cold.
> If you are an AI session: paste this whole file in before writing code.
> **Update it** at the end of every work session, or whenever a core decision is finalized (add a Session Log entry). **Never put secrets in it.**
>
> Full design spec: `HackTX Planning Doc.pdf` (repo root, Draft v3). § numbers below point into that doc.
> Wireframes: `Elevation.fig` (repo root) / figma.com/design/as3lihY6g66gW3VCrd5sIK/Elevation.

---

## 1. One-liner and current phase

**Elevation** is a 2D, browser-based daily puzzle game. Every player gets the same 10 pieces and two minutes to stack them as high and stable as they can, then the tower is hit by that day's natural disaster. Score = height + survival time, shown as a percentile against everyone who played today (Wordle × Tricky Towers × Krillion results).

**Current phase: Phase 7 — Polish. 🚧 IN PROGRESS. The approved plan, with a progress checklist, is in "Phase 7 plan" just below. A new session should continue from the first unchecked box.**

**Phase 6 — Materials library. ✅ Complete.** The cost-safe SerpAPI + Gemini pipeline works end to end: `src/data/items.generated.json` holds **20 real items** (traffic cone to giraffe), built from 20 SerpAPI + 20 Gemini calls (about $0.01 total). The daily puzzle now draws from these 20 plus the 3 basic shapes. Board zoom is in too. Pure real proportions are kept on purpose, so some days mix tiny and huge pieces (reviewed and accepted; numbers in §8, "Raised during Phase 6"). Phase 5's Supabase leaderboard is also still unverified against a real project (§7).
**Next:**
- **Track D:** optionally grow the library (20 more candidates are ready in `candidates.json`; §3.4). Size spread is an accepted trade-off (§8, Phase 6).
- **Everyone:** create the Supabase project and verify against it (§7). Only a mock PostgREST server has been tested.
- **Track A:** tune disaster magnitudes by playtesting. Every number in `src/lib/physics/disasters.ts` is a first pass. Once real items exist, also playtest day sets with huge and tiny items together.
- **Track B (Phase 7):** see the plan below.

**Team split (2026-10-25): physics, disasters and sound run as parallel tracks.** File ownership, the git workflow, the seams between tracks (disaster cues, `disasterVisuals.ts`, `sounds.ts` / `effects.ts`) and Claude Code kickoff prompts are in `docs/TEAM_PLAN.md`. Team rules for Claude Code are in `CLAUDE.md`, and each track logs its work in `docs/tracks/<track>.md`.

Read "Build-phase rules" in §4 first.

### Phase 7 plan (approved 2026-10-25, Joshua; tick boxes as you go)
**Why:** the 20 generated items render as anonymous black boxes, circles and trapezoids (we only draw the physics shape), so nobody can tell a couch from a fridge. Doc §3.4 / §8: items should be **flat-icon silhouettes** in the black/white + one-blue style, with the SerpAPI photo as the reference for whoever draws or auto-generates them. Phase 7 (§10.2) also covers the tutorial and juice. The doc's build HUD also wants a live height readout.

**Decisions:**
- Silhouettes are filled in ink, with the newest piece in accent.
- **Gemini draws each silhouette as an SVG path** from the cached reference photo: one more cached call per item, about $0.002.
- **The hitbox becomes the simplified convex hull of the silhouette** (≤ 12 points), so collisions match the art. `round` items keep a circle hitbox, so they still roll.
- In scope: tutorial, juice, live height. Out of scope: the pitch deck.

**A. Silhouettes**
- [x] **A1 Pipeline, new "icon" stage** (`scripts/materials/`). Same cost guards as Phase 6. **Done.** 21 unit tests pass. The `--existing` flag limits a run to items already in the library.
  - **Model:** `gemini-3.1-flash-lite` drew unrecognizable blobs, so icons use **`gemini-3.8-flash` with `thinkingLevel: "low"`** (`DEFAULT_ICON_MODEL`; about $0.0014 per icon).
  - **Prompt v2** asks for whole-number coordinates and ≤ 40 commands. v1 ran into the token cap.
  - **Ledger:** thinking tokens are now counted as output; they were missed once, and that call was corrected in the ledger with a `note` line.
  - **Retries:** network failures (status 0) are now retried once.
  - `icon.mjs`: one Gemini call with the name + cached photo. It returns `{ "path": "<svg d>" }`: a single filled side-view silhouette in a 0–100 box, resting on the bottom, using commands M/L/H/V/C/S/Q/T/Z only (no arcs), at most ~80 commands.
  - Separate `ICON_PROMPT_VERSION` and `GEMINI_ICON_MODEL` (default `gemini-3.1-flash-lite`). Cached in `scripts/cache/icons/<slug>.json`, committed.
  - `svgpath.mjs` (pure): parse (absolute and relative) → flatten curves → bbox → convex hull (monotone chain) → simplify to ≤ 12 vertices by dropping the least-area vertex. Validation rejects arcs, bad characters, > 4,000 characters, < 3 points, a zero bbox and NaN, and is cached as invalid (never re-paid).
  - `convert.mjs`, `toMaterial(name, estimate, iconPath?)`:
    - **Scale:** the silhouette is scaled uniformly so its bbox area equals `width_m × height_m`.
    - **Hitbox:** `shape = convex` (the hull, in meters), except `round`, which keeps a circle with the art fitted inside.
    - **Icon field:** `icon = { path, box }` **in the same meter frame as `shape.vertices`**.
  - `generate.mjs`: a "needs-icon" status for items without a cached icon (1 Gemini call each, counted in `materials:plan`). A run fills icons in and re-derives those items; ids are unchanged.
  - `validateLibrary`: convex ≤ 12 vertices, and the `icon` is validated.
  - Unit tests for all of it.
- [x] **A2 Game rendering** (done; the elephant was verified in-game, in the tray and at 3x zoom)
  - `materials.ts`: `icon?: { path: string; box: { x; y; w; h } }`.
  - `geometry.ts`: export `shapeCentroid(shape)` in meters, the same math `shapeOutline` uses. A Matter body's position is that centroid.
  - `draw.ts`: `DrawnPiece.icon = { path2d, x, y, angle, scale, cx, cy }`. Draw order: translate → rotate → scale(pxPerMeter) → translate(−centroid) → fill(Path2D), with Path2D cached per path.
    - Pieces without an icon (basic shapes, meteors) draw as before.
    - Blocked look: a grey silhouette plus the dashed hull outline.
  - `BuildSession.drawables()` passes the icon with the body or preview pose.
  - `PieceSvg` gets an icon mode, used by the tray and intro (normalized to 32px).
  - The off-board `HeldGhost` uses the path with an SVG transform (rotate + scale by `pxPerMeter × zoom`).
  - The path is only used via Path2D or a React `d` attribute, never as HTML.
- [ ] **A3 Real run** (8/20 done; see Status below)
  - `materials:plan` should show 20 needing an icon and 0 SerpAPI.
  - **Canary** `--limit 1` (~$0.002), then screenshot it in-game. If the art is poor, try one stronger Flash model through `GEMINI_ICON_MODEL`.
  - Then the remaining 19. Total under about $0.05.

**B. Live height readout**
- [x] `BuildSession.liveHeight`: platform top minus the highest vertex of the placed pieces, **excluding the frozen (floating) piece**. It's emitted when the shown 0.1 m value changes.
- [x] `HeightRuler`: during the build, an accent marker with a "3.4 m" label plus the live band highlight. After measurement, the official band as now.

**C. Tutorial (Figma 01 — Tutorial)**
- [x] `TutorialScreen.tsx`: "How to Play", "Skip →", 4 step cards using the Figma copy, and the "Got it — Start Building" button.
- [x] `Game.tsx`:
  - **First-time players:** Start Building → tutorial → play. The localStorage `elevation:tutorial-seen` flag makes it show once; Skip counts the same.
  - **Intro link:** the "How to Play" link opens it any time.

**D. Juice** (`src/lib/juice/`; view-only, never affects physics or scores)
- [x] **Events:**
  - `PhysicsWorld` records Matter `collisionStart` impacts (the point plus the relative normal speed).
  - `BuildSession` keeps a drainable queue: `impact` / `place` / `pickup` / `rotate` / `fallen` / meteor hit / phase changes / the last-10s timer ticks.
- [x] **`audio.ts`:** WebAudio-synthesized sounds (no assets).
  - **Sounds:** a thud scaled by impact speed (throttled), clicks, a rotate tick, timer ticks, a disaster whoosh, a collapse crash, and a survive chime.
  - **Setup:** the audio context is created on the first gesture. A mute toggle sits under the zoom control, saved in localStorage.
- [x] **`particles.ts`:** dust on impacts, debris on falls, meteor and splash bursts. Drawn in board coordinates in `drawBoard`, and capped.
- [x] **`shake.ts`:** decaying trauma from big impacts, meteors and collapse, plus a continuous earthquake shake. **Testing phase only** (it never offsets drops), and off for `prefers-reduced-motion`.
- [x] **Wiring:** `BoardCanvas` drains the events every frame.

**E.**
- [ ] CONTEXT.md: §3.1 icon type, §3.4 icon stage, §4 rendering / hull / juice, folder map, §7, §8, session log. Mark Phase 7 in the roadmap.

**Status 2026-10-25 (session ended at its usage limit; RESUME HERE):**
- **A1, A2, B, C, D are coded**, and tsc, lint and 22 unit tests pass. **B, C and D are not yet verified in the browser.** A ready-made test exists: `scratchpad/cdp/phase7-test.mjs` from the last session. Recreate it if it's missing; the checks are listed under Verification below.
- **A3:** 8 of 20 silhouettes were generated (elephant, ketchup bottle, soda can, brick, hardcover book, tennis ball, pizza box, traffic cone). A background run for the last 12 was started.
  - **To finish:** `npm run materials:plan -- --existing` shows what's left, then `npm run materials:run -- --limit 12 --existing`. Cached work is never re-paid.
- **What changed in icon generation (`scripts/materials/`):**
  - **Model:** `gemini-3.8-flash` (`DEFAULT_ICON_MODEL`). Flash-Lite drew blobs.
  - **Thinking:** capped with `thinkingConfig.thinkingBudget: 512` (`ICON_THINKING_BUDGET` in `icon.mjs`). `thinkingLevel: "low"` still burned 3–4k tokens on a brick.
  - **Retries:** network resets (`ECONNRESET`, status 0, not billed) now retry up to 3 times with backoff.
  - **Ledger:** costs are priced per model (`PRICES_PER_M_TOKENS`). Thinking tokens count as output.
  - **Bug fixed:** a thin book's hull wasn't convex after rounding; the hull is re-computed after rounding.
- **Spend so far:** 20 SerpAPI + about 31 Gemini calls, about $0.08 lifetime. The icons will total about $0.13, against the plan's ~$0.05, because of two thinking overruns before the cap. Per icon now: about $0.004–0.006.
- **Remaining for Phase 7:**
  1. Finish A3.
  2. Run the browser verification (silhouettes, live height, tutorial flow, juice, regression).
  3. Screenshot a few silhouettes to judge the art quality. If any look bad, bump `ICON_PROMPT_VERSION` or use `--retry-invalid --only "<name>"` for single items.
  4. Fill in the session log entry and mark Phase 7 in the roadmap.
- **Nothing from Phases 5–7 is committed yet.** Commit the new `scripts/cache/icons/` and `gemini/` files too, so nobody pays twice.

**Verification:**
1. `materials:test` and `materials:check`.
2. `materials:plan` shows 20 icon calls and 0 SerpAPI. `--dry-run` shows the request.
3. Canary, then the batch. Hull contains ≥ 95% of the silhouette points.
4. Headless Chrome with `?date=` previews:
   - silhouettes on the board, in the tray, on the intro and in the drag ghost;
   - collisions match the art;
   - zoom and drop mapping still exact;
   - the live height marker ignores the frozen piece;
   - tutorial once / Skip / How to Play;
   - juice events, no audio errors, shake only in testing;
   - a full-flow regression.
5. `tsc`, `lint` and `build`, with no console errors.

### Roadmap (§10.2)
| Phase | What | Who |
|---|---|---|
| **0 — Setup** ✅ | Repo scaffold, Next.js shell, Matter.js canvas with a static platform, this file | Single computer |
| **1 — Static placement** ✅ | Drag tray → canvas, rotate Q/E, no gravity. Validates the interaction feel | Single computer |
| **2 — Core physics** ✅ | Matter.js body per shape, freeze-on-placement rule (§4.3), friction-only materials, pickup/reposition (§4.4) | Single computer |
| **3 — Build → Test transition** ✅ | 2-min build timer, structure lock, settling window, height measurement + banding (§5.1) | Single computer, **then split into 4 tracks** |
| **4 — Disasters** ✅ | One disaster end to end first (wind), escalation + stability score, then the others | Track A |
| **5 — Daily system + leaderboard** ✅ | Supabase schema, device ID + display name, date seed → materials + disaster, percentile query | Track C |
| **6 — Materials library** ✅ (20 real items) | Offline SerpAPI + Gemini pipeline that grows the real-world-object library | Track D |
| 7 — Polish & pitch 🚧 | Tutorial, results screen, juice (sound, shake, particles), pitch deck. **Plan + checklist in §1, "Phase 7 plan"** | Track B + all |

**Cut order if time runs short:** library size (6) → disaster variety beyond the first (4) → breaking/durability (stretch). **Never cut** the core stacking feel or the daily/leaderboard hook.

### Hackathon tracks (§1.2, §9.3)
- **Most Entertaining** is the *primary design target*: satisfying collapses, disaster drama, and juice beat feature count.
- **Best Pitch:** lead with the daily-puzzle hook and the percentile leaderboard.
- **Cursor + Grok Bot:** build with Cursor (agentic coding) and Grok Bot (workflow orchestration).
- **Best Novice:** auto-qualified by team composition.

---

## 2. Locked architecture decisions

Treat these as settled unless something forces a change. If one changes, update this section and log it.

| Area | Decision | § |
|---|---|---|
| Frontend + hosting | **Next.js** (App Router, TypeScript) deployed on **Vercel** | 9.1 |
| Physics | **Matter.js** on an HTML canvas. Fallback only if needed for deterministic replay: Planck.js | 4.1 |
| Backend | **Supabase** (Postgres + client SDK). **No Supabase Auth product** | 7, 9.1 |
| Identity | **Anonymous device UUID**, generated on first visit and stored in `localStorage`, synced to a `players` row. **Optional display name**, editable anytime, shown on the leaderboard | 7 |
| Materials content | **SerpAPI + Gemini as an OFFLINE batch script** that writes a static library. The deployed game **never** calls either API | 3.4, 9.2 |
| Daily puzzle | One global seed per day, a pure function of the date → 10 materials + 1 disaster. Same for everyone. One attempt per device per day | 3.3, 6 |
| Leaderboard | One global board per day; players see "you beat X% of today's players" | 5.4 |
| Visual direction | Minimalist black/white plus a single accent blue, heavy whitespace, **Space Grotesk**. Juice carries the entertainment | 8 |
| Team process | Phases 0–3: one computer, one driver, mob style. After Phase 3: four parallel tracks (A–D, §6 below) | 10.1 |

---

## 3. Data models

### 3.1 Material / item (`src/data/materials.ts`)
Basic shapes and generated real-world objects share **one type**. No system (seed, physics, scoring) may special-case "real object" vs "basic shape".

```ts
type Archetype = "wide-stable" | "tall-narrow" | "round" | "flat-wide" | "irregular";

type PhysicsShape =                       // METERS; a simple approximation, never a silhouette hitbox
  | { kind: "box"; width; height }
  | { kind: "circle"; radius }
  | { kind: "regularPolygon"; sides; radius }
  | { kind: "convex"; vertices: {x, y}[] };

interface Material {
  id: string; name: string;
  source: "basic" | "generated";
  shape: PhysicsShape;
  mass: number;        // relative; Matter.js derives inertia from mass + shape
  friction: number;    // 0–1; the ONLY surface property that varies
  archetype?: Archetype;
  icon?: { path: string; box: {x, y, w, h} };  // flat silhouette, drawn instead of the hitbox (Phase 7).
                       // path: SVG (absolute M L C Q Z) in METERS, same frame as `shape`; unset for basic shapes
}
// There is NO restitution field: restitution is fixed at 0 for every material (§3.2).
```

**Pool:** `MATERIALS_POOL = BASIC_SHAPES + GENERATED_ITEMS`, where `GENERATED_ITEMS` is loaded from `src/data/items.generated.json` (currently `[]`). The daily seed draws from this pool. In dev only, `NEXT_PUBLIC_MOCK_ITEMS=1` also adds the fake items from `src/data/items.mock.json` (§3.4). Items repeat across days (each day draws independently); the library only ever grows, because stored daily puzzles reference ids.

**Prototype shapes (§3.1). Numbers are TBD placeholders.**
| id | Shape (m) | Mass | Friction | Design intent |
|---|---|---|---|---|
| square | box 1.8 × 1.8 | 2 | 1 | medium / medium / medium |
| triangle | 3-gon, r = 0.85 | 1 | 1 | low mass, small–medium |
| pentagon | 5-gon, r = 1.1 | 3.5 | 1.3 | high mass, medium–large, med-high friction |

Center of mass = geometric centroid (Matter.js does this automatically for polygon bodies).

### 3.2 Supabase schema (§7). Types in `src/lib/supabase/types.ts`, SQL in `supabase/migrations/0001_init.sql` (not yet applied to a project)
- **players**: `id uuid PK (= device ID)`, `display_name text null`, `created_at`
- **scores**: `id`, `player_id FK → players.id`, `date`, `height_score`, `stability_score`, `combined_score`, `created_at`. **unique (player_id, date)** enforces one attempt per day
- **daily_puzzle**: `date PK`, `seed`, `item_ids jsonb` (→ Material ids), `disaster_type`

`DisasterType = "wind" | "earthquake" | "flood" | "meteor"`

### 3.3 Score model (§5)
- **Height**: measured once, after the build timer hits 0 and the settling window ends (it doesn't change if the tower later falls). Banded as a % of that day's max possible height: **Grounded** 0–20 · **Mound** 20–40 · **Plateau** 40–60 · **Alps** 60–80 · **Limitless** 80–100.
  - **Max possible height (decided 2026-10-24).** The board is fixed. Each day's pieces are **scaled together**, keeping their real-world proportions. The scale is chosen so all pieces laid end to end by their **longest dimension** reach `HEIGHT_HEADROOM` (90%) of the space above the platform: `MAX_STACK_PX` = 468px = 100%. See `src/lib/game/dailyScale.ts`.
  - The height is shown as **real-world meters + band**, e.g. "5.4 m · Mound". Meters = px ÷ the day's `pxPerMeter`.
- **Stability** (implemented): 0.0–5.0. Starting formula: `5 × min(time_survived / MAX_TEST_DURATION, 1)` (`stabilityScore()` in `scoring.ts`).
- **Combined** (implemented): 50/50 height + stability. Height % and stability × 20 are averaged and rounded to 0–100 (`combinedScore()`). TBD.

### 3.4 Materials pipeline (Phase 6; `scripts/materials/`, offline, Track D)
Grows `src/data/items.generated.json` with real-world objects. **The game never calls SerpAPI or Gemini.** The scripts are plain Node (no dependencies) and never import from `src/`.

**Commands** (keys load from `.env.local` automatically):
| Command | What it does | Spends credit? |
|---|---|---|
| `npm run materials:plan` | Lists every candidate's status and the exact number of paid calls a run would make, plus lifetime spend. | No |
| `npm run materials:run -- --limit 1 --dry-run` | Prints the exact Gemini request for the next item. | No |
| `npm run materials:run -- --limit 1` | The **canary**: 1 SerpAPI search + 1 Gemini call for 1 new item. | **2 calls** |
| `npm run materials:run -- --limit 20` | Up to 20 new items. `--limit` is required; the ceiling is 25 per run. | up to 40 calls |
| `npm run materials:run -- --limit 1 --only "traffic cone"` | Target a specific object (any name, not only the candidates). | 2 calls |
| `npm run materials:rebuild` | Re-derive items from the caches after changing a conversion rule. | No |
| `npm run materials:mock -- --limit 20` | Fake items for testing into `items.mock.json`. | No |
| `npm run materials:check` / `materials:test` | Validate both library files / unit-test the conversion rules. | No |

**How a new item is made.** One SerpAPI Google Images search gives a reference photo. **One Gemini icon call (Phase 7)** draws a side-view silhouette as a single SVG path from that photo (`icon.mjs`; `gemini-3.8-flash` at `thinkingLevel: "minimal"`, `GEMINI_ICON_MODEL` overrides it). `svgpath.mjs` parses it, flattens the curves and takes the **convex hull (≤ 12 points) as the hitbox**; the art is stored in the item in the same meter frame. Round items keep a circle hitbox with the art fitted inside. Cached in `scripts/cache/icons/`. One Gemini estimate call (`gemini-3.1-flash-lite` by default; `GEMINI_MODEL` overrides it) looks at the name + photo and returns six values as structured JSON: `width_m`, `height_m`, `archetype`, `taper`, `density_kg_per_l`, `surface_roughness`. `convert.mjs` turns that into a `Material`:
- `round` → circle (any icon is fitted inside). With a valid icon, anything else → the icon's convex hull. Without one, `taper ≥ 0.9` → box, lower → convex trapezoid (narrow top).
- **Real proportions are kept.** Only clamped to engine limits (0.03–12 m per side, aspect ≤ 10).
- **Mass** = `2 × (area × density / 3.24)^0.35`, clamped to 0.4–12. **Friction** = `0.7 + 0.8 × roughness`, clamped to 0.7–1.5. All constants are in `convert.mjs` (`LIMITS`).
- No icon: the game draws the physics outline, which keeps the flat minimalist look. The SerpAPI photo is reference material only and is never shown.

**Cost safety** (the point of this design; constants in `lib.mjs`):
- **Nothing is paid for twice.** Each API answer is cached on disk: `scripts/cache/serpapi/` and `scripts/cache/gemini/` are **committed**, so teammates reuse them. Photos in `scripts/cache/images/` are git-ignored (web images aren't ours to commit).
- **Items already in the library, or with a cached estimate, make zero calls.** The library file is append-only; only `--rebuild` re-derives items, and only from cache.
- **A run needs `--limit N`** (no default; max `MAX_ITEMS_PER_RUN` = 25).
- **Fail fast:** any API error stops the whole run (one retry only for 429 / 5xx, and for Gemini 403, which was intermittent in practice). 3 invalid answers in a row also stop it. An invalid answer is cached so it isn't paid for again (`--retry-invalid` pays again on purpose).
- Calls are paced (default 4s; `--delay-ms`) for SerpAPI's 50/hour and Gemini's free-tier limits. Every real call is logged to `scripts/cache/ledger.jsonl` (no keys, no responses); `materials:plan` prints the totals.
- **Bumping `PROMPT_VERSION` or changing the model deliberately makes every cached estimate stale** and the next run pays again. Don't, unless you mean it.
- **Icons:** `ICON_PROMPT_VERSION` (now 3) is only written into new cache entries. Valid icons from `ICON_MIN_PROMPT_VERSION` (2) on are kept, so a prompt tweak doesn't repay all 20. **To redraw one poor icon:** `npm run materials:run -- --limit 1 --existing --redraw --only "<name>"` (`--redraw` refuses to run without `--only`). `--retry-invalid` only redoes icons cached as invalid. Raising `ICON_MIN_PROMPT_VERSION` redraws everything.
- **Thinking:** gemini-3.8-flash **ignores `thinkingBudget`**: with a 512 budget, half the calls still thought until the 4,000-token output cap, and those were the tilted, garbled or truncated (`MAX_TOKENS`, cached invalid) icons. Icons use `thinkingLevel: "minimal"`.
- **The Gemini key is on the free tier** (found 2026-10-25): **20 gemini-3.8-flash requests per day**, reset at midnight Pacific; a 429 then stops the run. Nothing is billed, so the ledger's dollar figure is a list-price estimate, not a charge.
- Reference prices at 2026-10-24: SerpAPI free plan 250 searches/month (50/hour; cached and errored searches don't count). Gemini 3.1 Flash-Lite about $0.25 / $1.50 per 1M input / output tokens, with a free tier. One item is a few hundred tokens, so the whole library costs cents. Re-check the pricing pages if you rely on these.

**Testing without credit.** `npm run materials:mock` writes deterministic fake items (sizes 0.1–4 m) to `src/data/items.mock.json`. Set `NEXT_PUBLIC_MOCK_ITEMS=1` in `.env.local` and restart `npm run dev` to play with them. This is dev-only, and **it also puts the game fully offline** (`client.ts`), so a puzzle or score using fake ids can never reach the shared Supabase. Keep `items.mock.json` as `[]` in commits.

**Adding a batch:** edit `scripts/materials/candidates.json` (or use `--only`) → `materials:plan` → canary → batch → `materials:check` → review the `git diff` of `items.generated.json` → commit the library **and** the new cache files.

---

## 4. Physics constants and rules in use

All constants live in **`src/lib/physics/constants.ts`**. Change them there and nowhere else.

| Constant | Value | Status |
|---|---|---|
| `PX_PER_METER` | 40 | Board/platform layout unit only. **Pieces use the per-day scale** from `pieceScale()` (≈22.4 px/m for the placeholder set, so a square is ~40px) |
| `HEIGHT_HEADROOM` | 0.9 | Max possible height = 90% of the space above the platform (§5.1) |
| Canvas | 10m × 14m (400 × 560 px) | Matches the Figma Build Area height |
| Platform | 5.5m × 0.5m (220 × 20 px), corner radius 6px, 0.5m from the bottom | TBD (§4.2). Matches Figma |
| `GRAVITY_Y` | 1 (Matter.js default) | TBD. At 40 px/m this is ≈1000 px/s² ≈ 25 m/s² (~2.5 g). It feels snappy. Tune by playtesting |
| `PHYSICS_STEP_MS` | 1000/60 | Fixed step. `BuildSession.step()` catches up on real time, capped at `MAX_FRAME_MS` (100) |
| `POSITION_ITERATIONS` / `VELOCITY_ITERATIONS` | 10 / 8 | TBD. Above Matter's 6 / 4 so stacks jitter less |
| Per-material mass | `Body.setMass(material.mass)` | Relative units (2 / 1 / 3.5). Inertia scales with it |
| `RESTITUTION` | 0 | **Locked** (§3.2) |
| `BUILD_DURATION_S` | 120 | §2.1 |
| `SETTLE_DURATION_S` | 1.5 | TBD (§4.6) |
| `MAX_TEST_DURATION_S` | 75 | TBD (§4.11). Suggested range 60–90 |
| `ROTATION_STEP_DEG` | 1 | TBD (§2.2). Fine steps; holding Q/E auto-repeats |
| `FRICTION_STATIC` | 2 | Matter takes the higher `frictionStatic` of two touching bodies, so resting pieces are hard to push off each other |
| `DAILY_PIECE_COUNT` | 10 | §3.3 |
| Per-material friction | 1 / 1 / 1.3 (square / triangle / pentagon) | TBD (§3.1). Raised from 0.5 / 0.5 / 0.7 so pieces grip. Matter allows values above 1. The table in 3.1 shows the old numbers |
| `HEIGHT_REVEAL_S` | 2 | Pause on the measured height before the disaster starts |
| `COLLAPSE_FALLEN_FRACTION` | 0.5 | TBD (§4.7). The test ends as "collapsed" once half the measured tower's pieces have fallen |
| `GROUND_TOLERANCE_PX` | 2 | A piece "touches the ground" within 2px of the platform top |
| Disaster force formulas | `src/lib/physics/disasters.ts` (`WIND`, `QUAKE`, `FLOOD`, `METEOR`) | TBD (§4.10). Linear ramps. Forces are in multiples of Matter's gravity |

**⚠ Unit convention (deviation from the letter of §4.2; read this before Phase 2).** The doc says Matter.js is tuned for meter units. In practice, Matter.js is tuned for **pixel-scale** bodies: its default slop, sleeping, and velocity thresholds assume bodies roughly 10–100 units across, and meter-sized bodies (1–2 units) jitter and sink. So:
- **Author** every dimension in meters (materials, constants).
- **Convert to pixels once, when the Matter body is created** (`toPx()`), and simulate in pixel space. Convert back with `toMeters()` for anything shown to the player or used in scoring (e.g. height).
This keeps the "meters internally, screen-proportionate" intent of §4.2 without fighting the engine.

**Physics rules (summarized; full text in the doc). ✅ = implemented:**
- ✅ **Freeze on placement (§4.3).** The most recently placed piece is *static* (weightless but collidable). Placing the next piece makes the previous one dynamic and freezes the new one. This is what lets `/\` leaning pairs work. (We tried an uncollidable frozen piece on 2026-10-24 and reverted it. Pieces that came to rest inside it stayed overlapping once it unfroze.)
- ✅ **Pickup (§4.4).** A placed piece can be picked back up, and its body is removed from the world. Anything leaning on it falls naturally. When re-placed, it re-enters the freeze rule as if new.
- ✅ **Friction-only materials (§3.2, §4.9).** Each body gets `material.friction`, restitution 0 and `setMass(material.mass)`. Matter uses the **lower** friction of two touching bodies, and static bodies (platform, frozen piece) are forced to friction 1, so a contact always uses the material's own friction.
- ✅ **Build forgiveness (§4.5).** A collapse during build doesn't end the run. Only the state at timer = 0 counts. Pieces that fall off the board during the build return to the tray.
- ✅ **Transition (§4.6).** At timer = 0, unfreeze *everything*, wait `SETTLE_DURATION_S` (no disaster force), then measure the official height.
- ✅ **Collapsed (§4.7, TBD).** Track each piece's peak height. A piece counts as fallen when its lowest point touches the ground after having been more than ~1 piece-height up. Leaving the board also counts. The tower collapses at `COLLAPSE_FALLEN_FRACTION`.
- **Despawn (§4.8).** A piece outside the "tower zone" for longer than a grace period is removed and not scored.
- ✅ **Disasters (§4.10).** All four escalate linearly with survival time:
  - **Wind:** a gusting horizontal force on each piece, scaled by its exposed height and stronger higher up.
  - **Earthquake:** the same sinusoidal horizontal acceleration on every piece. The platform is static, so it acts as ground shake.
  - **Flood:** a rising water line, with buoyancy by area, a sideways current and drag.
  - **Meteor:** rocks dropped over the tower that hit harder, more often, over time.
- **Breaking / health (§3.5)** is a stretch goal and out of MVP scope.

### Controls (§2.2, desktop first)
Drag and drop from the tray onto the canvas · **Q** rotates counter-clockwise, **E** clockwise (while holding or just after placing) · release places the piece. All 10 pieces are visible in the tray at once, and the player picks the order. Pieces can go anywhere on the canvas. Mobile controls are TBD.

### Build-phase rules (as built; `src/lib/game/buildSession.ts`)
- **Who owns what.**
  - `BuildSession` (a plain class) owns the rules: tray / held / placed status, which piece is frozen, and placement order.
  - `PhysicsWorld` (`src/lib/physics/world.ts`) owns the Matter bodies. A **placed piece's position lives only in its body**.
  - React subscribes to the session with `useSyncExternalStore` (tray, HUD, drag ghost).
  - `BoardCanvas` runs the loop: `session.step(elapsed)` then `drawBoard(session.drawables())` every animation frame.
  - In dev, `window.__elevation.debugPieces()` lists every piece's status, frozen flag and pose.
- **Coordinates.** A pose is the **centroid in board pixels** (origin top-left, y down) plus `angle` in **radians, clockwise**, the same as Matter.
- **Outlines.** `shapeOutline()` in `geometry.ts` is the single source of piece geometry. Regular polygons have their **first vertex pointing up** (as in Figma), and circles are 24-gons for drawing. Bodies are built from these vertices (`Bodies.fromVertices`), so the hitbox is exactly what's drawn.
- **Freezing.** The body is created dynamic, given its mass, then `setStatic(true)`. Matter saves mass and friction on freeze and restores them on unfreeze, so the order matters. Unfreezing zeroes the body's velocity.
- **Picking up.**
  - Press on an available tray slot, or on any placed piece. The frozen piece wins, then newest first.
  - The piece keeps its grab offset so it doesn't jump.
  - Picking up the frozen piece leaves **no** frozen piece: the one before it is already dynamic.
- **Rotating.** Q/E rotate the held piece freely. With nothing held, they rotate the **frozen piece**, but only if the result stays on the board and doesn't overlap anything.
- **Dropping.**
  - Release over the board → the piece is clamped fully inside the board, then placed (frozen) if it doesn't overlap the platform or any body. If it does overlap, it goes back where it came from.
  - Release off the board → the piece goes back to the tray.
  - **Esc** puts it back where it was, or into the tray if fallen pieces now fill that spot.
  - "Touching" is allowed (SAT overlap with a 0.5px tolerance), so pieces can sit flush.
- **No-overlap drop rule.** Not in the spec. It stops Matter from violently pushing overlapping bodies apart. Kept for Phase 2, still open in §8.
- **Fallen pieces.** A dynamic piece that leaves the board entirely (below the bottom, or past either side; there are no walls) is removed and **returned to the tray**. This is a placeholder for §4.8 despawn and §4.5 forgiveness, still open in §8.
- **Last piece.** When a drop puts the 10th piece on the board, it's placed **dynamic, not frozen**, since no "next placement" will ever release it. The previous frozen piece unfreezes as usual, so nothing is frozen. Picking a piece back up and re-dropping it follows the same rule.
- **Newest piece** is drawn in the accent blue, as in Figma. It's the frozen piece, and the Q/E target after placing.
- **Daily set.** `BuildSession` takes `{ materialIds, disaster, seed }` from today's `DailyPuzzle` (see "Daily system" below). The old placeholder cycle is only the default for tests.
- **Piece scale.** `session.pxPerMeter = pieceScale(materialIds)`. Every piece outline comes from `session.outline(materialId)`, which covers bodies, drawing, the drag ghost and tray icons. There's no module-level outline cache any more.
- **Phases.** `phase` moves `"build"` → `"settling"` → `"measured"`, all in the snapshot.
  - **Build.** A 120s countdown, in `secondsLeft`. It emits once per displayed second and calls `endBuild()` at 0.
  - **`endBuild()`** is public; the dev hook and a future "Done" button can call it.
    - Any held piece is cancelled (restored, or back to the tray).
    - The frozen piece unfreezes.
    - Input is locked: pickup, rotate and the hover cursor are no-ops, and the tray is disabled.
  - **Settling.** After `SETTLE_DURATION_S`, `measure()` sets `result: HeightResult` (`src/lib/game/scoring.ts`).
    - `heightPx` = platform top − the highest vertex of any placed piece.
    - Also `heightM`, `percent` of `MAX_STACK_PX`, and `band`.
    - Physics keeps running afterwards for the test phase.
  - **The clocks** advance by the same capped frame time as physics, so they **pause while the tab is hidden**.
- **Lost pieces.** After the build, a piece that falls off the board gets status `"lost"` and does not return to the tray.
- **Height UI.** The top bar shows `Build Time: mm:ss` → `Settling…` → `Height: 5.4 m · Mound`.
  - `HeightRuler` puts each band's tick at its real lower boundary on the board and highlights the achieved band in accent.
  - The canvas draws a dashed accent line at the measured height.
- **Testing Phase (`BuildSession`, after `"measured"`).**
  - Phases go `"measured"` → (`HEIGHT_REVEAL_S`) → `"testing"` → `"done"`.
  - **Tower.** The tower is the pieces resting at or above the platform top when the height is measured; pieces already sliding off the edge are excluded. Collapse tracking only looks at these pieces.
  - **Forces.** Each fixed physics step calls `disaster.apply()` before `world.step()`. The test clock (`testMs`) counts **fixed steps**, so a disaster plays out identically for the same tower and seed.
  - **Ending.** When the tower collapses or the clock reaches `MAX_TEST_DURATION_S`, `outcome: TestResult` is set (`survivedS`, `collapsed`, `stability`, `combined`). Forces then stop, but physics keeps running.
  - **Snapshot:** `disaster`, `disasterName`, `disasterLabel`, `testSeconds`, `integrity` (the fraction of the tower not fallen), `outcome`.
  - **Choosing the disaster.** Pass `new BuildSession({ materialIds, disaster, seed })`. `seed` drives `seededRandom()` (wind/flood direction, meteor spots). `Game` fills all three from today's puzzle.
  - **Playback speed** (1x / 2x / 4x, a segmented control in the testing top bar).
    - `session.setSpeed()` makes `step()` feed the physics backlog `dt × speed` (backlog cap scales too), so more fixed steps run per frame.
    - The step size never changes, and collapse / end-of-test is checked **after every fixed step**. The disaster and the recorded survival time are therefore identical at every speed. This was checked: the same tower scored 54.6s, combined 41 at 1x, 2x and 4x, in 54s / 27s / 14s of real time.
    - Speed only applies during `"testing"` and resets to 1x when the test ends, so the aftermath plays normally.
  - **Meteors** are extra Matter bodies (`world.addMeteor`), drawn grey. They're never pieces and are removed once off the board or after 6s.
- **Testing UI** (Figma "03 — Testing Phase").
  - **Top bar:** a black pill disaster chip, plus `Surviving: mm:ss`.
  - **Bottom slot:** the tray swaps for the **Stability Meter**, which shows `integrity`.
  - **At the end:** the top bar shows `Collapsed at mm:ss` / `Survived mm:ss!` with the disaster name, and the bottom shows Height · Stability · Combined score.
  - **Flood water** is drawn as a translucent accent band.
  - The top bar, bottom slot and hint have fixed heights, so **the board never moves between phases**.
- **Daily system (§6, §7; `src/lib/daily/`).**
  - **Flow.** `Game.tsx` runs the screens: intro → play → results.
    - On load it computes the UTC date, gets the device ID, and loads the day's puzzle.
    - If this device already played today, it goes straight to results.
  - **Rollover** is **midnight UTC** (`date.ts`). Day #1 is `LAUNCH_DATE` (2026-10-24).
  - **The puzzle** (`puzzle.ts`) is a pure function of the date.
    - `generatePuzzle(date)` hashes `elevation:<date>` (FNV-1a) into a seed. It draws the 10 materials from `MATERIALS_POOL` out of a reshuffled bag (so the set is varied), then picks the disaster.
    - The first visitor stores it in `daily_puzzle`, and everyone after reads that row. So **growing the library mid-day can't change the day's set**. A stored row with unknown material ids is ignored.
  - **Identity** (`storage.ts`): a device UUID in localStorage, used as `players.id`.
  - **One attempt per day:**
    - Enforced locally by the saved run (`elevation:run:<date>`).
    - Enforced on the server by `unique (player_id, date)`; a duplicate insert counts as success.
    - If the submit fails (offline), the run is flagged unsubmitted and retried next visit.
  - **Scores stored:** `height_score` = % of max height, `stability_score` 0–5, `combined_score` 0–100.
  - **Percentile** (`api.ts → fetchStanding`):
    - "You beat X%" = scores strictly below yours ÷ other players. It's null for the first player.
    - Rank = scores strictly above + 1.
  - **Leaderboard:** top 5, with a "View Full Leaderboard" toggle to the top 25. Your own row is appended at its real rank if it's below the cut. Unnamed players show as `Anonymous XXXX`.
  - **Display name:** an inline form on the results screen, cleaned to letters, numbers, space, `_` and `-`, at most 24 characters. It's saved to `players.display_name` and localStorage.
  - **Offline mode** (no `NEXT_PUBLIC_SUPABASE_*`):
    - The game fully works, with a local device ID and save.
    - The results show only your own score, with "The shared leaderboard is offline". Nothing is faked.
  - **Dev-only switches** (disabled in production builds):
    - `?replay=1`: unsubmitted practice rounds.
    - `?disaster=flood`: forces a disaster.
    - `?date=2026-11-03`: previews that day's puzzle (practice mode, generated locally, no database access for that date).
    - `window.__elevation` (the session).
- **Zoom** (`src/lib/game/boardView.ts`, view only).
  - `BoardView` is a camera over the fixed 400×560 board: `{ zoom 1–4×, x, y }`, subscribable like `BuildSession`. The physics, hit tests, overlap checks and scoring never see it.
  - **Controls:** `+` / `−` buttons and a reset (`2.3x`) beside the board, mouse wheel (zooms toward the cursor), and dragging empty space pans.
  - **Wiring:** `BoardCanvas` calls `view.applyTo(ctx, dpr)` each frame. `BuildPhase.toBoard()` goes through `view.toBoard()`, so drops, pick-ups and previews land under the cursor at any zoom. The off-board drag ghost is scaled by the zoom.
  - **Frame:** the board always has a 2px grey outline (black while zoomed in, accent blue while you hold a piece). It's a CSS `outline`, not a border, because a border would add to the canvas box and offset the pointer mapping.
  - **Why:** items keep their real proportions, so a ketchup bottle can be a few px next to an elephant. Zoom is how you place small ones. It works in the build and testing phases.
  - **Limit:** the frame is fixed. Zoom can't make an item wider than the 220px platform fit better; it only helps with small ones.
- **Silhouettes (Phase 7).** Items with an `icon` are drawn as their silhouette, not their hitbox.
  - **Canvas** (`draw.ts`, `DrawnPiece.icon`): translate to the body → rotate → scale by `pxPerMeter` → translate by `-shapeCentroid(shape)` → fill a cached `Path2D`.
    - Placed pieces are ink with a 1px background hairline, so touching pieces stay apart. The newest piece is accent; the preview is accent at 85%.
    - A blocked drop shows a grey silhouette plus the dashed hitbox.
  - **DOM:** the tray and intro use `glyph()` (`lib/game/icon.ts`) with `PieceSvg` `art` (32px). The drag ghost uses the same transform as SVG.
  - **Basic shapes and meteors** draw as before.
  - **Hitbox vs art:** the hitbox is the silhouette's convex hull, so concave gaps (between an elephant's legs) count as solid.
- **Live height (Phase 7).** `snapshot.live` (build phase only) is the tallest point of the placed pieces, **excluding the frozen piece**, in meters plus its band. It re-emits only when the 0.1 m value changes. `HeightRuler` shows it as an accent pill marker and highlights the live band.
- **Juice (Phase 7, `src/lib/juice/`, view-only).**
  - **Events:** `BuildSession` queues `JuiceEvent`s and `BoardCanvas` drains them every frame through `Juice.handle()`:
    - impacts, from Matter `collisionStart` (`PhysicsWorld.drainImpacts`), with strength = closing speed;
    - place / pickup / rotate;
    - fallen (collapse tracking);
    - timer ticks in the last 10s;
    - phase changes.
  - **Sound:** `audio.ts` synthesizes everything with WebAudio, no asset files. Sounds: an impact thud (throttled), clicks, a rotate tick, timer ticks, a time-up chime, a disaster whoosh, a collapse crash, and a survive chime. The context unlocks on the first click or key (`Game.tsx`). The mute toggle (speaker under the zoom buttons) is saved as `elevation:muted`.
  - **Particles:** `particles.ts` makes dust on impacts, ink debris on falls, and grey bursts on meteor hits. Capped at 320.
  - **Shake:** `shake.ts` is a decaying trauma value plus the earthquake's continuous `disasterShake()`. Only in testing/done, so it never offsets a drop, and off under `prefers-reduced-motion`. It moves only the drawing.
  - **Dev hooks:** `window.__juice`, `window.__sound`.
- **Tutorial (Phase 7).** `TutorialScreen` (Figma 01). The first Start Building goes through it once (`elevation:tutorial-seen`), where Skip is the same as Got it. The intro's "How to Play" link opens it any time and returns to the intro.
- **Rendering.** Custom canvas draw (`src/lib/game/draw.ts`), not `Matter.Render`. The held piece is drawn on the canvas when the pointer is over the board, and as a fixed-position SVG ghost when it's off the board.

---

## 5. UI / design tokens (from `Elevation.fig`)

**Screens (1440×900):** `00 — Daily Intro`, `01 — Tutorial`, `02 — Build Phase`, `03 — Testing Phase`, `04 — Results`.
**Shared components:** Button (Primary / Secondary / Disabled, radius 8), Badge (Neutral / Warning / Success, pill), Tray Piece (Square / Triangle / Pentagon × Available / Placed, 64×64, radius 10), Step Card (300×103, radius 12), Score Card (175×136, radius 14), Leaderboard Row (420×33), Height Ruler (140×560).

**Build Phase layout:** top bar ("Build Time: 01:47" left, "Pieces Left: 6 / 10" right) · Build Area (531×560) = Height Ruler (140 wide) + play area with the tower and platform · "PIECE TRAY" label + 10 tray slots (64px, 10px gap) at the bottom.

**Colors.** These are CSS vars in `src/app/globals.css`, mirrored in `src/lib/theme.ts` for canvas drawing. Keep both in sync. Verified against the live Figma file on 2026-10-24. The file defines **no Figma variables**, so these are the raw values used across all five screens and the component sets.
| Token | Hex | Use (in Figma) |
|---|---|---|
| background | `#ffffff` | page / canvas, cards, tray slots |
| fill-muted | `#ededf0` | Neutral badge bg, Disabled button bg |
| ink | `#000000` | primary text, placed pieces, Secondary button + Score Card borders (1.5px), Warning badge / disaster chip bg |
| ink-soft | `#1c1c21` | piece strokes |
| text-muted | `#6b6b73` | secondary text, labels |
| text-subtle | `#8c8c91` | Disabled button text |
| border | `#e0e0e3` | tray pieces, Step Cards |
| border-strong | `#dedee3` | stability-meter track, Leaderboard Preview border |
| platform | `#bfbfc4` | ground platform |
| tick | `#b2b2b8` | Height Ruler ticks |
| accent | `#296eed` | the single accent: newest piece, primary button, step numbers, combined score, links, meter fill |

Also: `--opacity-placed: 0.32` (used tray pieces) and radii button 8 · tray piece 10 · step card 12 · score card 14 · meter 5 · pill 999.

**Type:** Space Grotesk 400 / 500 / 700 via `next/font/google` (CSS var `--font-space-grotesk`). Sizes in use: 40 / 34 / 24 / 20 / 18 bold display; 16 / 15 / 14 / 13 / 12 / 11 body and labels; line-height `normal`.

---

## 6. File / folder structure

```
Elevation/
├── CONTEXT.md                  ← this file
├── HackTX Planning Doc.pdf     ← full design spec (source of truth for §refs)
├── Elevation.fig               ← Figma wireframes (5 screens + components)
├── README.md
├── AGENTS.md                   ← auto-maintained by `next dev` (Next 16 AI-agent notes). Leave it
├── .env.example                ← required env var NAMES (copy to .env.local)
├── package.json / tsconfig.json / next.config.ts / eslint.config.mjs
├── public/                     ← static assets (piece icons will go here)
├── scripts/
│   ├── materials/              ← Phase 6 offline pipeline (Track D). Never imported by the app, never imports from src/
│   │   ├── generate.mjs        ← CLI: plan / run / rebuild / mock (see §3.4)
│   │   ├── serp.mjs, gemini.mjs, icon.mjs ← the API clients (SerpAPI search; Gemini estimate; Gemini silhouette)
│   │   ├── svgpath.mjs         ← SVG path parse / flatten / convex hull / simplify (pure; svgpath.test.mjs)
│   │   ├── convert.mjs         ← estimate → Material (pure), validation, tunable LIMITS
│   │   ├── mock.mjs            ← deterministic fake estimates, no API
│   │   ├── lib.mjs             ← paths, cost guards, caches, ledger
│   │   ├── check.mjs, convert.test.mjs ← materials:check / materials:test
│   │   └── candidates.json     ← 40 hand-written object names (edit freely)
│   └── cache/                  ← serpapi/ + gemini/ + ledger.jsonl are committed; images/ is git-ignored
├── supabase/
│   └── migrations/             ← 0001_init.sql: players / scores / daily_puzzle + row-level-security policies (Track C)
└── src/
    ├── app/                    ← Next.js App Router
    │   ├── layout.tsx          ← root layout, Space Grotesk font
    │   ├── globals.css         ← design tokens (CSS vars) + reset
    │   ├── page.tsx            ← renders <Game />
    │   ├── page.module.css
    │   └── dev/page.tsx        ← /dev Dev Lab (404 in production)
    ├── components/
    │   ├── dev/DevLab.tsx               ← Dev Lab: pick pieces / disaster / build time, play via <Game dev={…}>
    │   ├── ui/                          ← Button (Primary / Secondary / Disabled), Badge (Neutral)
    │   │   (game/ also holds TutorialScreen.tsx, Figma 01, and SoundToggle.tsx)
    │   └── game/                        ← each .tsx has a sibling .module.css
    │       ├── Game.tsx                 ← orchestrator: loads today's puzzle + device, switches intro / play / results, saves + submits the run
    │       ├── IntroScreen.tsx          ← 00 — Daily Intro: today's materials, Start Building
    │       ├── ResultsScreen.tsx        ← 04 — Results: score cards, percentile, leaderboard, name form, share, countdown
    │       ├── BuildPhase.tsx           ← 02 Build → 03 Testing screen: owns the BuildSession, pointer + Q/E/Esc input, layout per phase
    │       ├── StabilityMeter.tsx       ← 03 — Testing Phase meter (share of the tower still standing)
    │       ├── BoardCanvas.tsx          ← the 400×560 board canvas (HiDPI) + the game loop (step physics, draw)
    │       ├── PieceTray.tsx            ← 10 tray slots (Available / Placed)
    │       ├── PieceSvg.tsx             ← a piece outline as SVG (tray icons, off-board drag ghost)
    │       └── HeightRuler.tsx          ← band ticks at their real heights; highlights the measured band (§5.1)
    ├── data/
    │   ├── materials.ts                 ← Material schema, BASIC_SHAPES, MATERIALS_POOL, getMaterial()
    │   ├── items.generated.json         ← the real library: pipeline output (Phase 6), append-only; currently []
    │   └── items.mock.json              ← FAKE items for testing (npm run materials:mock); keep as [] in commits
    └── lib/
        ├── theme.ts                     ← color tokens for canvas drawing
        ├── game/
        │   ├── geometry.ts              ← shapeOutline() (piece vertices, px), transforms, hit test, SAT overlap
        │   ├── board.ts                 ← board size + PLATFORM_RECT / PLATFORM_OUTLINE in px
        │   ├── buildSession.ts          ← BuildSession: build rules, timer, settle, height, testing phase, collapse tracking, scores
        │   ├── dailyScale.ts            ← per-day piece scale + MAX_STACK_PX (100% height)
        │   ├── scoring.ts               ← HEIGHT_BANDS, bandFor(), HeightResult, TestResult, stabilityScore(), combinedScore()
        │   ├── draw.ts                  ← custom canvas renderer (platform, pieces, meteors, height line)
        │   └── disasterVisuals.ts       ← disaster drawing over the pieces (flood water; disasters track)
        ├── juice/                       ← Phase 7: audio.ts (WebAudio synth), particles.ts, shake.ts; index.ts dispatches
        │                                   each event to sounds.ts (sound track) and effects.ts (particles + shake)
        ├── daily/                       ← Phase 5 (Track C)
        │   ├── date.ts                  ← UTC date, rollover countdown, Day #N
        │   ├── puzzle.ts                ← generatePuzzle(date), stored-row conversion
        │   ├── run.ts                   ← RunSummary: a finished run, from a session or a score row
        │   ├── storage.ts               ← device ID, saved run, display name (localStorage)
        │   └── api.ts                   ← Supabase calls: puzzle, players, scores, standing, leaderboard (offline-safe)
        ├── physics/
        │   ├── constants.ts             ← PX_PER_METER, platform, gravity, step + solver settings, timings, collapse rule
        │   ├── disasters.ts             ← wind / earthquake / flood / meteor force models, seededRandom()
        │   └── world.ts                 ← PhysicsWorld: Matter engine + platform + piece and meteor bodies (no game rules)
        └── supabase/
            ├── client.ts                ← getSupabase(): null when the env vars are unset (offline mode)
            └── types.ts                 ← row types for players / scores / daily_puzzle
```

**Where new work should land (keeps the four tracks from colliding after Phase 3):**
| Track | Owns | Primary folders |
|---|---|---|
| A: Physics & Gameplay | collapse detection, disasters, freeze-rule edge cases, constant tuning | `src/lib/physics/`, `src/lib/game/` (new) |
| B: Frontend & UI | Figma screens → components, HUD, tutorial, results, juice | `src/components/`, `src/app/` |
| C: Backend & Data | Supabase schema, daily seed, leaderboard/percentile, device ID + name | `src/lib/supabase/`, `src/lib/daily/` (new), `supabase/` |
| D: Materials & Pitch | offline items pipeline, item balance, pitch deck | `scripts/`, `src/data/items.generated.json` |

**Integration sync points (schedule these explicitly):**
1. **Phase 3, A ↔ B:** the data crossing from the physics sim to the UI (height, per-piece fallen/standing state).
2. **Phase 5, C ↔ B:** the results-screen data shape (scores, percentile, display name).

---

## 7. Running locally

**Prereqs:** Node.js 20+ (developed on Node 24) and npm.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build (what Vercel runs)
npm run lint
npx tsc --noEmit   # typecheck. Run `npm run build` or `npm run dev` once first so Next generates its route types (e.g. LayoutProps)
```

**Dev Lab: `http://localhost:3000/dev`** (dev builds only; a 404 in production). Use it to test every object, disaster and screen:
- **Pieces:** click any library card to add it, any number of times (right-click removes one). Click a selected slot to remove it. Presets: Today, any date (that day's set, disaster and seed), Random 10, One of each, Clear. Each card shows the size, mass, friction and hitbox kind, and flags generated items that have no icon. A line shows the set's px/m and its smallest and largest piece on the board.
- **Disaster, seed and build time:** 10s, 30s, 2 min (daily) or 10 min (`BuildSessionOptions.buildSeconds`).
- **Start:** Play (straight to the build), Via intro screen, or Via tutorial. "Reset tutorial seen" brings the first-run tutorial back. During a run, a bottom-right bar has **← Dev Lab** and **Restart**.
- Runs go through the real `Game` with a `dev` prop: always practice, no network, nothing saved. The setup is remembered in localStorage (`elevation:dev-setup`).

**What you should see (Phase 7):** the generated items are black silhouettes (the newest piece in blue) on the board, in the tray, on the intro and in the drag ghost. The first "Start Building" shows the "How to Play" tutorial once (Skip counts as seen; clear `elevation:tutorial-seen` in localStorage to see it again), and the intro's "How to Play" link opens it any time. While building, the ruler shows a blue live-height pill. Impacts kick up dust and make sound after your first click, and a speaker toggle under the zoom box mutes it. The screen shakes only during the disaster. Good preview day: `?date=2026-11-22&disaster=earthquake` (elephant + giraffe). Dev console hooks: `window.__elevation`, `__view`, `__juice`, `__sound`.

**What you should see (Phase 6):** next to the board there's a small zoom box (`+`, the current zoom, `−`). Scroll over the board to zoom toward the cursor; at more than 1× drag empty space to pan; click the zoom value to reset. With the real library empty, the game looks the same as Phase 5 otherwise. To try big and tiny items: `npm run materials:mock`, set `NEXT_PUBLIC_MOCK_ITEMS=1` in `.env.local`, restart `npm run dev` (it runs offline while that flag is on).

**What you should see (Phase 5):** the Figma "00 — Daily Intro" screen first ("Today's Stack", 10 materials, Start Building). After a run, "04 — Results" with the score cards, the percentile, the leaderboard and a name box. Reloading after playing goes straight to results. In dev, add `?replay=1` to play again.
- The rest is the "02 — Build Phase" and "03 — Testing Phase" screens at 1440×900:
- After the height is shown (2s), the screen becomes "03 — Testing Phase": a disaster chip, `Surviving: mm:ss`, and the Stability meter where the tray was.
- The disaster runs until half the tower has fallen or 75s pass. Then the score line appears: Height · Stability / 5 · Combined.
- The disaster comes from today's puzzle. In dev, force one with `http://localhost:3000/?disaster=earthquake` (or `wind`, `flood`, `meteor`).
- **Top bar:** a live "Build Time" countdown and a live "Pieces Left: N / 10".
- **Board:** the Height Ruler (band ticks at their real heights), the 400×560 board with the grey platform, and the 10-piece tray.
- **When the timer hits 0** (or you run `window.__elevation.endBuild()` in the dev console):
  - the tray locks and the top bar shows "Settling…";
  - about 1.5s later it shows the height and band, the band lights up on the ruler, and a dashed blue line marks the height.
- Drag a tray piece onto the board. It **hangs where you drop it (blue, frozen)** until you place the next piece, then falls and stacks under gravity.
- **Q/E** rotate 1° per press (hold to keep rotating) while holding, or rotate the frozen piece right after placing.
- Drops that overlap another piece or the platform show grey and dashed, and the piece bounces back.
- Grab any placed piece to move it, and whatever rested on it falls. Drag it off the board to return it to the tray. **Esc** cancels a drag.
- Pieces that fall off the board return to the tray during the build. After the build they're lost.

**Stack versions:** Next.js 16.4 (App Router, Turbopack, `cacheComponents` on), React 19.3, TypeScript 5, Matter.js 0.20.
⚠ Next 16 has breaking changes from older Next versions. Check `node_modules/next/dist/docs/` before relying on remembered APIs (see `AGENTS.md`).

**Environment variables.** Copy `.env.example` to `.env.local`. **None are needed to run the game.** Without the Supabase pair it runs offline. Never commit real values. Never paste them here.
| Var | Needed from | Where to get it | Where it lives |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Phase 5 (optional: enables the shared leaderboard) | Supabase dashboard → Project Settings → API | `.env.local` + Vercel project env vars |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 5 (optional) | same page (anon/public key) | `.env.local` + Vercel project env vars |
| `SERPAPI_API_KEY` | Phase 6 (offline script only) | serpapi.com → Dashboard | the local `.env.local` of whoever runs the script. **Not** on Vercel |
| `GEMINI_API_KEY` | Phase 6 (offline script only) | aistudio.google.com → Get API key | the local `.env.local` of whoever runs the script. **Not** on Vercel |
| `GEMINI_MODEL` | optional | any Gemini model id | `.env.local`. Default `gemini-3.1-flash-lite` (cheapest). Changing it makes cached estimates stale, so the next run pays again |
| `GEMINI_ICON_MODEL` | optional | any Gemini model id | `.env.local`. Default `gemini-3.8-flash` (Flash-Lite drew blobs). Changing it makes cached icons stale |
| `NEXT_PUBLIC_MOCK_ITEMS` | optional, dev only | set to `1` | `.env.local`. Adds the FAKE items and forces offline mode. Ignored in production |

The SerpAPI and Gemini keys must never get a `NEXT_PUBLIC_` prefix and must never be imported from `src/`, because the deployed game must not call those APIs.

**Deploying:** import the repo in Vercel. The defaults (framework: Next.js, `npm run build`) work as is. Add the two Supabase env vars in Project Settings (`NEXT_PUBLIC_` values are inlined at build time, so redeploy after changing them).

**Setting up Supabase (one time):**
1. Create a project at supabase.com.
2. Open the SQL editor and run `supabase/migrations/0001_init.sql`.
3. Copy the project URL and anon key into `.env.local` and Vercel, then restart `npm run dev`.
4. Play a run. A row should appear in `scores`. The results should say "You beat X%" instead of "offline".

⚠ There's no auth, so the row-level-security policies are open to the anon role. Anyone with the anon key can write any row, including renaming other players. That's the accepted §7 limitation. Don't store anything sensitive.

---

## 8. Open questions (synced with §12 of the planning doc)

Resolved and removed: backend provider, identity model, deployment target, visual direction, team work-split model.

- **Physics**
  - [ ] Exact "collapsed" detection rule (§4.7)
  - [ ] Settling-window duration (§4.6). Currently 1.5s
  - [ ] Platform width and `PX_PER_METER` (§4.2). Currently 5.5m and 40, picked to match Figma
  - [ ] Disaster escalation formulas, and whether disasters target specific tower zones (§4.10)
  - [ ] Max test duration (§4.11). Currently 75s
  - [ ] Rotation increment per Q/E press (§2.2). Currently 1°, relying on the browser's key repeat (it has a short initial delay). A custom repeat loop would feel smoother and could accelerate.
- **Materials**
  - [ ] Numeric mass/size/friction for the 3 prototype shapes (§3.1). Placeholders in `materials.ts`
  - [ ] Breaking/health system and structural-reinforcement bonus (§3.5). Stretch goal
- **Materials library**
  - [x] ~~Initial size of the generated library (§3.4)~~ **20 items** generated (canary of 1, then 19, picked across the size range). Candidates left in `candidates.json`: 20 more.
  - [ ] Static file vs Supabase table (§3.4). Currently a static file (`items.generated.json`), the hackathon default
  - [x] ~~Source/rotation of the candidate object-name list (§3.4)~~ **Hand-written** `candidates.json` (40 names across sizes), editable, plus `--only "name"` for one-offs. No SerpAPI searches are spent finding names.
- **Scoring**
  - [ ] Stability-score curve: linear vs stepped vs intensity-weighted (§5.2)
  - [ ] Exact height + stability combination formula (§5.3)
- **Daily system**
  - [x] ~~Daily rollover time~~ **Midnight UTC** (`src/lib/daily/date.ts`). Everyone shares the same puzzle clock; for US Central that's 7pm. Say so if you want a fixed US-time rollover instead.
- **Accounts**
  - [x] ~~When the display-name prompt appears~~ **On the results screen**, as an inline box in the leaderboard card. Editable only until set (no rename UI yet).
  - [ ] Device-ID spoofing lets a player replay a day. **Accepted hackathon limitation**, do not harden (§7)
- **UI/UX**
  - [ ] Full results-screen content and share/percentile layout (§8). A first version is built from Figma 04 (see Phase 5 notes)
  - [ ] Tutorial: forced on first play vs always skippable with a reminder (§8)
- **Mobile**
  - [ ] Touch control scheme, especially rotation (§2.2)
- **Team**
  - [ ] Exact moment to switch to the 4-track split. Tied to Phase 3 completion, not a clock time (§10.1)
- **Hackathon logistics**
  - [ ] Confirm with organizers that offline (not in-app) use of SerpAPI and Gemini satisfies the sponsor track (§9.2)
- **Raised during Phase 0**
  - [x] ~~Keep `Matter.Render` or switch to a custom draw loop?~~ **Custom draw** (`src/lib/game/draw.ts`). `Matter.Render` was removed from `world.ts` in Phase 2.
- **Raised during Phase 1**
  - [ ] Keep the **no-overlap drop rule**? It's still in place in Phase 2. The alternative is allowing overlap and letting Matter resolve it, which risks pieces being flung. Playtest.
  - [ ] The newest piece floats exactly where it's released until the next placement (§4.3 as written). Playtest whether players expect it to drop to rest instead.
  - [ ] Tray icons are all normalized to 32px, as in Figma, so they don't show relative size. Fine for 3 shapes, but it may need revisiting for generated items (§3.4).
- **Raised during Phase 2**
  - [ ] **Fallen pieces.** During build, a piece that leaves the board currently returns to the tray (forgiving, §4.5). Should it instead be lost, matching §2.3 "simply disappears"? Also decide whether a piece resting off the platform but still on the board counts as fallen (§4.7, §4.8).
  - [ ] **Gravity strength.** The Matter default is ~2.5 g at 40 px/m. Pick by feel (snappy vs readable collapses) before tuning disasters.
- **Raised during Phase 3**
  - [x] ~~How "max possible height" fits a fixed board~~ **Per-day scale**: the longest dimensions end to end fill 90% of the space above the platform (§3.3).
  - [ ] Pieces now draw at ~56% of their Phase 2 size with the placeholder set (a square is ~40px, down from 72), because longest-dimension fitting is conservative. Playtest whether they feel too small.
  - [ ] The build timer pauses while the tab is hidden, since it shares the physics clock. Decide whether a daily competitive run needs wall-clock time instead.
  - [x] ~~"Done building" button~~ Added as **Start Early** in the build top bar (not in Figma; styled like the Primary / Disabled Button). It calls `endBuild()` and is disabled until at least one piece is placed.
  - [ ] Height counts every placed piece still on the board, including one dangling off the platform edge. Revisit along with §4.7 / §4.8.
- **Raised during Phase 7**
  - [ ] **Silhouette quality is uneven.** Gemini's outlines are good for simple upright objects (cone, bottle, can, hydrant, office chair, couch) and rough for animals (the elephant is a blob with legs and a trunk). Hand-drawn SVGs for the worst ones would beat more paid redraws; keep them in the same 0–100, bottom-resting format so `convert.mjs` can use them.
  - [ ] **Silhouettes stay at 32px in the tray** (relative size not shown, as in Figma). Revisit together with the Phase 6 size-spread question.
  - [ ] Dev console warning **"Multiple GoTrueClient instances detected"** (Supabase) appeared once in the full-flow run. `getSupabase()` is a module singleton, so this probably comes from dev bundling or HMR. It's harmless; check that it doesn't appear in the production build.
- **Raised during Phase 6**
  - [x] **Size spread: accepted as-is (decided 2026-10-25).** Pure real proportions stay, with no per-day size cap. Measured on 40 days (2026-11-01 onward) with the 20 real items + 3 basic shapes (dev preview: `?date=YYYY-MM-DD`), so the trade-off is on record:
    - **No day has a piece wider than the platform** (widest 180px vs 220px), so the elephant fear was unfounded.
    - **But the smallest piece is under 8px on 37 of 40 days, and down to 1.7px** (a tennis ball in a day with a giraffe and an elephant). The median size spread within a day is 37× (max 77×).
    - A 2–3px body is invisible, can't be grabbed, and is unreliable in Matter (tunnelling). Zoom (max 4×) turns 1.7px into 7px, still too small.
    - **If it's revisited:** (a) cap each day's size spread (e.g. ≤ 12×, chosen deterministically by the seed; needs a library with enough mid-size items); (b) set a minimum piece size (breaks strict proportions for small items only); (c) drop the smallest candidates from the library; (d) raise max zoom to 8×.
  - [ ] **Mass compression** (`2 × (area × density / 3.24)^0.35`, clamped 0.4–12) and the friction mapping are guesses. 9 of the 20 items sit at the 0.4 mass floor, so small items all weigh the same. They're free to retune: edit `LIMITS` in `convert.mjs`, then `npm run materials:rebuild`.
  - [x] ~~The Gemini request shape is unconfirmed~~ **Confirmed by the real canary** (2026-10-25): `response_mime_type`, `response_schema` and `inline_data` work. Each item costs about 1,270 input + 80 output tokens.
  - [x] **`gemini-2.5-flash-lite` is no longer available to new API users** (404). The default is now `gemini-3.1-flash-lite` ($0.25 / $1.50 per 1M tokens). The pricing page listed 2.5 as available; the canary caught it.
  - [ ] **Gemini returned an intermittent 403** ("caller does not have permission") twice in ~21 requests; the identical request worked on retry. The pipeline now retries a Gemini 403 once after 15s, then stops. If it becomes frequent, check the API key's restrictions in Google AI Studio.
  - [ ] **Sponsor track (§9.2)** still needs confirming with the organizers that an offline pipeline counts.
  - [x] ~~Tray icons are the physics outline (no art)~~ **Phase 7:** generated items now show Gemini-drawn silhouettes everywhere, and the hitbox is the silhouette's hull.
- **Raised during Phase 4**
  - [ ] **Disaster strength.** A bare 4-square column (7.2 m, Mound) collapses in about 4s (meteor), 10s (wind, earthquake) and 17s (flood). That's harsh on a naive tower; playtest with real builds before tuning. A flat pile with nothing elevated survives the full 75s (stability 5.0), which may be too generous.
  - [ ] The Stability meter shows the **share of the tower still standing**, as in Figma ("Stability: 68%" mid-test). The **stability score** is survival time (§5.2). Same word, two meanings: consider renaming one.
  - [ ] Collapse threshold: half the tower's pieces fallen (`COLLAPSE_FALLEN_FRACTION`). Alternatives: current height below X% of the measured height.
  - [ ] Forces stop when the test ends, but physics keeps running. Decide whether the disaster should keep going for drama on the results view.
  - [ ] Pieces that fall during the 2s height reveal count against the tower. That's intentional, but check that it feels fair.

---

## 9. Session log

Newest first. One entry per work session: **date · who · phase · what changed · decisions/notes.**

<!-- Template:
### YYYY-MM-DD · Name (+ tool) · Phase N
- Changed:
- Decisions:
- Next / blockers:
-->

### 2026-10-24 · Joshua (+ Claude Code) · Phase 6
- **Changed**
  - **Pipeline** in `scripts/materials/` (plain Node, no new dependencies): SerpAPI + Gemini clients, a pure converter, a deterministic mock, a CLI with plan / run / rebuild / mock modes, a validator and 11 unit tests. Details in §3.4.
  - **Cost safety is the main design:**
    - Plan by default, and a real run needs `--limit`.
    - Every API answer is cached on disk, so nothing is paid for twice.
    - Any error stops the run.
    - A call ledger with a cost estimate.
    - A mock mode that writes to a separate file.
  - **Zoom:** `BoardView` camera, wheel / buttons / pan, wired through `BoardCanvas` and `BuildPhase`.
  - `materials.ts` and `client.ts`: `NEXT_PUBLIC_MOCK_ITEMS` adds the fake items and forces offline mode (dev only).
  - `.gitignore`, `.env.example`, npm scripts.
- **Decisions**
  - Both APIs per item (1 search + 1 estimate).
  - The library is append-only and permanent; the same object can come up on many days.
  - Pure real-world proportions, with zoom instead of capping sizes.
  - Hand-written candidate names.
  - The default model is the cheapest listed one.
  - Caches are committed (except photos); the ledger is too.
- **Verified**
  - **Without spending any credit:**
    - Unit tests: 11 pass.
    - `materials:plan`: 40 candidates, correct counts, no network.
    - `--run` without `--limit`, and `--limit 26`: both refused.
    - Missing keys: nothing spent.
    - `--dry-run`: prints the exact request and writes nothing.
    - **Bogus keys:** the run stopped at the first rejected call, items 2 and 3 were never attempted, nothing was cached, and the key appeared nowhere in output or files.
    - Mock: 20 fake items, byte-identical on rerun, a 19× size spread, valid; the real library and ledger untouched.
  - **Zoom** (headless Chrome, real mouse and wheel, with mock items on a throwaway dev server): 13/13 checks.
    - Wheel zoom keeps the point under the cursor fixed.
    - A drop at 2.25× lands exactly under the cursor, and a pick-up works where the piece appears on screen.
    - Panning works and zoom clamps at 4×.
    - The mock day's set (5px to 104px pieces) totals 468px, as designed.
  - **Regression on the real dev server:** 1× drags, rotation, no panning at 1×, pick-up and return to the tray, and the full flow to results.
  - tsc, lint and the production build pass.
- **Real run (after the keys were added):**
  - **Canary** (1 item = 2 calls): the first attempt got a 404 because `gemini-2.5-flash-lite` is no longer available to new users. Fail-fast worked: only the SerpAPI search was spent, and it's cached. Switched the default to `gemini-3.1-flash-lite` and the retry worked, which also confirmed the request shape.
  - **Batch of 19**, picked across the size range: stopped twice on a transient Gemini 403 (nothing lost, the cache made the retry free). The pipeline now retries a Gemini 403 once, and the final 13 ran clean.
  - **Total:** 20 SerpAPI + 20 Gemini calls, about 27k tokens, about $0.009. `materials:check` passes with 20 real items. No key value appears in any project file, and the photos are git-ignored.
- **Added at the end:** a dev-only `?date=YYYY-MM-DD` preview (generates that day's puzzle locally, practice mode, no database access), used to scan 40 days for fit problems. Findings are in §8.
- **Next / blockers:** none for Phase 6. The size-spread trade-off was reviewed and accepted by Joshua (§8).

### 2026-10-24 · Joshua (+ Claude Code) · Phase 5
- **Changed**
  - **Daily system** in `src/lib/daily/`: UTC date and rollover, the pure-function puzzle, device ID and saved run, and offline-safe Supabase calls.
  - **Supabase** (`@supabase/supabase-js` added): `client.ts` returns null when the env vars are unset. `0001_init.sql` holds the tables, a unique `(player_id, date)`, an index, and open RLS policies.
  - **Screens:** `Game` orchestrates the new `IntroScreen` (Figma 00) and `ResultsScreen` (Figma 04) around `BuildPhase`.
    - `BuildPhase` now takes the puzzle and reports the finished run.
    - It gained a "See Results →" button.
    - New shared `Button` and `Badge`.
  - **Smaller changes:**
    - `iconOutline` moved to `lib/game/icon.ts`.
    - `DISASTER_NAMES` was added.
    - The `?disaster=` override is now dev-only.
- **Decisions**
  - Rollover at midnight UTC.
  - The first visitor stores the day's puzzle in `daily_puzzle`, so a library change can't alter it mid-day.
  - The display-name box lives on the results screen.
  - Supabase is optional, with an honest offline mode.
  - Only a finished run counts. Reloading mid-run gives a fresh attempt (no forfeit).
  - Left out for now: the Tutorial / "How to Play" link (Phase 7) and a separate full-leaderboard page (an inline top-25 toggle instead).
- **Verified** (headless Chrome over CDP, no console errors)
  - **Offline:** intro (10 materials, Day #2) → build → Start Early → disaster → results → name saved ("Tower Tina!" cleaned to "Tower Tina") → reload lands on results with the name.
  - **Against a mock PostgREST server I wrote** (not a real Supabase):
    - A stored puzzle row beats the generated one (the intro showed its 10 pentagons).
    - The player row was registered, and the score was inserted as `{height 17.7, stability 3.61, combined 45}`.
    - Percentile was "beat 38%", which matches 3 of 8 other players below. Rank was #6, with the own row appended under the top 5 and highlighted.
    - The rename PATCHed `players`.
    - The top-25 toggle worked.
    - "3 people played yesterday" showed.
    - A reload went straight to results.
  - tsc, lint and a production build pass. The build contains no mock URL.
- **Not verified:** a real Supabase project, real RLS behaviour, concurrent first-visitors storing the puzzle, and a score submit after a network failure.
- **Next / blockers:** create the Supabase project (§7) and rerun the flow against it. Tune disasters (Track A). Tutorial + polish (Track B).

### 2026-10-24 · Joshua (+ Claude Code) · Phase 4
- **Changed**
  - New `src/lib/physics/disasters.ts`: wind, earthquake, flood and meteor force models, plus a seeded PRNG.
  - `BuildSession` gained the reveal → testing → done phases, collapse tracking (§4.7), `outcome` (stability + combined) and options `{ materialIds, disaster, seed }`.
  - `PhysicsWorld` gained a public `body()`, plus `applyForce`, `addMeteor` and `gravityAccel`.
  - New `StabilityMeter`. The disaster chip, survival clock, end-of-run score line and water/meteor drawing are in.
  - Fixed-height top bar, hint and bottom slot, so the board no longer jumps between phases.
  - Also this session: when the drop puts the 10th piece on the board, it's placed dynamic, not frozen.
- **Decisions**
  - The Stability meter shows tower integrity (Figma). The stability score is survival time (§5.2).
  - Collapse means half the measured tower has fallen.
  - The disaster comes from the URL until Phase 5.
- **Verified** (headless Chrome over CDP, 4 disasters in parallel, no console errors)
  - Messy 7-piece pile: wind collapsed at 23s, flood at 18s, meteor at 20s; the earthquake run survived the full 75s (stability 5.0, combined 58).
  - Clean 4-square column (7.2 m, Mound): meteor collapsed at 4s, wind and earthquake at 10s, flood at 17s. Integrity stayed at 1.0 until the collapse.
  - The board moves at most 0.5px across phases, and the page is exactly 900px tall.
  - tsc, lint and build pass.
- **Next / blockers:** playtest and tune the disaster magnitudes (Track A). Phase 5 daily seed (Track C). Results screen (Track B).

### 2026-10-24 · Joshua (+ Claude Code) · Phase 3
- **Changed**
  - Live build timer.
  - `endBuild()` handles the build end: held piece cancelled, frozen piece unfrozen, input locked.
  - Then the settling window, then height measured into `HeightResult` with its band. New `scoring.ts`.
  - New per-day piece scale (`dailyScale.ts`).
  - `shapeOutline()` takes a px/m scale, and `longestDimension()` was added.
  - Session-owned outlines replace `localOutline()`.
  - New piece status `"lost"`.
  - The HeightRuler shows real band positions and the active band, and the canvas draws a height line.
- **Decisions**
  - Max height comes from a per-day scale: the longest dimensions end to end fill 90% of the space above the platform.
  - The height is shown in real meters plus the band.
  - The clocks share the physics frame time.
  - Tried an uncollidable frozen piece earlier this session and reverted it (see §4).
- **Verified** (headless Chrome over CDP, real input, no console errors)

  | Check | Result |
  |---|---|
  | Pixels per meter | 22.42; a square is 40.4px wide |
  | Timer counts down | 01:58 → 01:56 over 2s |
  | Three stacked squares + a frozen triangle off the edge, then `endBuild()` | "Settling…", no frozen piece, tray all disabled, tray click and E ignored |
  | Result after the settle | "Height: 5.4 m · Mound" (120.66px, 25.8%), matching the vertex math exactly |
  | The triangle that fell after the lock | `"lost"` |

  - tsc, lint and build pass.
- **Next / blockers:** split into tracks. Track A: wind (Phase 4). Track B: Testing / Results screens from `HeightResult`.

### 2026-10-24 · Joshua (+ Claude Code) · Phase 2
- **Changed**
  - Placed pieces are now Matter.js bodies. `PhysicsWorld` (`world.ts`) replaces `createPhysicsWorld` and `Matter.Render`.
  - New `BuildSession` (`buildSession.ts`) replaces the Phase 1 `buildState.ts` reducer. Positions now live in bodies, so the rules moved into a class React subscribes to.
  - The freeze-on-placement rule (§4.3), pickup with body removal (§4.4), and per-material friction and mass are in.
  - Fixed-step game loop in `BoardCanvas`. Pieces that fall off the board return to the tray.
  - Dev hook `window.__elevation`.
- **Decisions**
  - Bodies are built from `shapeOutline()` vertices.
  - Each body is created dynamic → `setMass` → `setStatic` (needed for a correct unfreeze).
  - Solver iterations are 10 / 8.
  - Fallen pieces return to the tray (open in §8).
  - The no-overlap drop rule is kept (open in §8).
- **Verified**
  - `tsc`, `lint` and `build` pass, including the static prerender.
  - Headless Chrome over CDP with real input, reading body poses through `__elevation`. Results:

    | Check | Result |
    |---|---|
    | Frozen piece holds mid-air | ✓ |
    | Placing the next piece drops the previous one onto the platform | y=484.1, expected 484 |
    | A piece that misses the platform falls off → tray | ✓ |
    | Pentagon settles on top of the square | y=412.5 |
    | E rotates the frozen piece 15° in place | ✓ |
    | Pulling out the bottom square drops the pentagon to the platform | ✓ |
    | Esc restores a picked-up piece | ✓ |
    | A frozen piece supports the previous one in mid-air | y=300.3 |
    | Unfreezing lets that pair stack on the platform | ✓ |

    No console errors.
- **Next / blockers:** Phase 3 (build timer → unfreeze all → settle → measure height and band). Playtest feel: gravity, iterations, and the no-overlap rule.

### 2026-10-24 · Joshua (+ Claude Code) · Phase 1
- **Changed**
  - **Figma check.** Verified the design tokens against the live Figma file (read through the Figma MCP, all 5 screens + component sets):
    - added `fill-muted #ededf0`;
    - renamed `disabled` → `tick` (it's only the ruler tick color);
    - removed the unused `surface #f9f9fa`;
    - added `--opacity-placed` and `--radius-meter`.
  - **Phase 1: static placement.** Build Phase screen with the tray, drag and drop onto the board, Q/E rotation (15°), newest piece in accent, no-overlap drops, Esc to cancel, drag off the board to return a piece to the tray.
  - **Code moves.** New `src/lib/game/` (geometry, board, build reducer, canvas drawing). `world.ts` now takes the platform from `PLATFORM_RECT`. Removed `PhysicsCanvas`.
- **Decisions**
  - Custom canvas renderer instead of `Matter.Render`.
  - Piece state is centroid px + clockwise radians.
  - Phase 2 builds bodies from `shapeOutline()` vertices.
  - No-overlap drop rule, flagged as open in §8.
- **Verified**
  - `tsc`, `lint` and `build` pass.
  - Drove the real page in headless Chrome over CDP with real mouse and key input. Covered: tray → board, E×2, blocked drop bouncing back, placing, Q×3 while held, board → off-board → tray, Esc, edge clamping. All state transitions correct, no console errors.
- **Next / blockers:** Phase 2 (core physics).
