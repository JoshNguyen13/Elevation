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

**Current phase: Phase 0 — Setup. ✅ Complete.**
**Next: Phase 1 — Static placement.** Drag shapes from the tray onto the canvas and rotate with Q/E, with no gravity yet.

### Roadmap (§10.2)
| Phase | What | Who |
|---|---|---|
| **0 — Setup** ✅ | Repo scaffold, Next.js shell, Matter.js canvas with a static platform, this file | Single computer |
| 1 — Static placement | Drag tray → canvas, rotate Q/E, no gravity. Validates the interaction feel | Single computer |
| 2 — Core physics | Matter.js body per shape, freeze-on-placement rule (§4.3), friction-only materials, pickup/reposition (§4.4) | Single computer |
| 3 — Build → Test transition | 2-min build timer, structure lock, settling window, height measurement + banding (§5.1) | Single computer, **then split into 4 tracks** |
| 4 — Disasters | One disaster end to end first (wind), escalation + stability score, then the others | Track A |
| 5 — Daily system + leaderboard | Supabase schema, device ID + display name, date seed → materials + disaster, percentile query | Track C |
| 6 — Materials library | Offline SerpAPI + Gemini pipeline that grows the real-world-object library | Track D |
| 7 — Polish & pitch | Tutorial, results screen, juice (sound, shake, particles), pitch deck | Track B + all |

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
  icon?: string;       // flat silhouette icon (not the SerpAPI photo)
}
// There is NO restitution field: restitution is fixed at 0 for every material (§3.2).
```

**Pool:** `MATERIALS_POOL = BASIC_SHAPES + GENERATED_ITEMS`, where `GENERATED_ITEMS` is loaded from `src/data/items.generated.json` (currently `[]`). The daily seed draws from this pool.

**Prototype shapes (§3.1). Numbers are TBD placeholders.**
| id | Shape (m) | Mass | Friction | Design intent |
|---|---|---|---|---|
| square | box 1.8 × 1.8 | 2 | 0.5 | medium / medium / medium |
| triangle | 3-gon, r = 0.85 | 1 | 0.5 | low mass, small–medium |
| pentagon | 5-gon, r = 1.1 | 3.5 | 0.7 | high mass, medium–large, med-high friction |

Center of mass = geometric centroid (Matter.js does this automatically for polygon bodies).

### 3.2 Supabase schema (§7). Types in `src/lib/supabase/types.ts`, SQL not written yet (Phase 5)
- **players**: `id uuid PK (= device ID)`, `display_name text null`, `created_at`
- **scores**: `id`, `player_id FK → players.id`, `date`, `height_score`, `stability_score`, `combined_score`, `created_at`. **unique (player_id, date)** enforces one attempt per day
- **daily_puzzle**: `date PK`, `seed`, `item_ids jsonb` (→ Material ids), `disaster_type`

`DisasterType = "wind" | "earthquake" | "flood" | "meteor"`

### 3.3 Score model (§5)
- **Height**: measured once, when the build timer hits 0 (it doesn't change if the tower later falls). Banded as a % of that day's max possible height (all 10 pieces stacked end to end): **Grounded** 0–20 · **Mound** 20–40 · **Plateau** 40–60 · **Alps** 60–80 · **Limitless** 80–100.
- **Stability**: 0.0–5.0. Starting formula: `5 × min(time_survived / MAX_TEST_DURATION, 1)`.
- **Combined**: 50/50 height + stability. Default to implement first: normalize both to 0–100 and average (TBD).

---

## 4. Physics constants and rules in use

All constants live in **`src/lib/physics/constants.ts`**. Change them there and nowhere else.

| Constant | Value | Status |
|---|---|---|
| `PX_PER_METER` | 40 | TBD (§4.2). Chosen so the Figma pieces (~50–86px) are ~1.5–2m |
| Canvas | 10m × 14m (400 × 560 px) | Matches the Figma Build Area height |
| Platform | 5.5m × 0.5m (220 × 20 px), corner radius 6px, 0.5m from the bottom | TBD (§4.2). Matches Figma |
| `GRAVITY_Y` | 1 (Matter.js default) | |
| `RESTITUTION` | 0 | **Locked** (§3.2) |
| `BUILD_DURATION_S` | 120 | §2.1 |
| `SETTLE_DURATION_S` | 1.5 | TBD (§4.6) |
| `MAX_TEST_DURATION_S` | 75 | TBD (§4.11). Suggested range 60–90 |
| `ROTATION_STEP_DEG` | 15 | TBD (§2.2) |
| `DAILY_PIECE_COUNT` | 10 | §3.3 |
| Per-material friction | 0.5 / 0.5 / 0.7 | TBD (§3.1). See table in 3.1 |
| Disaster force formulas | not implemented yet | Start with `intensity = base + k × seconds_survived` (§4.10) |

**⚠ Unit convention (deviation from the letter of §4.2; read this before Phase 2).** The doc says Matter.js is tuned for meter units. In practice, Matter.js is tuned for **pixel-scale** bodies: its default slop, sleeping, and velocity thresholds assume bodies roughly 10–100 units across, and meter-sized bodies (1–2 units) jitter and sink. So:
- **Author** every dimension in meters (materials, constants).
- **Convert to pixels once, when the Matter body is created** (`toPx()`), and simulate in pixel space. Convert back with `toMeters()` for anything shown to the player or used in scoring (e.g. height).
This keeps the "meters internally, screen-proportionate" intent of §4.2 without fighting the engine.

**Rules later phases must implement (summarized; full text in the doc):**
- **Freeze on placement (§4.3).** The most recently placed piece is *static* (weightless but collidable). Placing the next piece makes the previous one dynamic and freezes the new one. This is what lets `/\` leaning pairs work.
- **Pickup (§4.4).** A placed piece can be picked back up. Remove it from collision (sensor or temporarily remove it). Anything leaning on it falls naturally. When re-placed, it re-enters the freeze rule as if new.
- **Build forgiveness (§4.5).** A collapse during build doesn't end the run. Only the state at timer = 0 counts.
- **Transition (§4.6).** At timer = 0, unfreeze *everything*, wait `SETTLE_DURATION_S` (no disaster force), then measure the official height.
- **Collapsed (§4.7, TBD).** Track each piece's peak height. A piece counts as fallen when its lowest point touches the ground after having been more than ~1 piece-height up.
- **Despawn (§4.8).** A piece outside the "tower zone" for longer than a grace period is removed and not scored.
- **Disasters (§4.10).** Wind (horizontal force scaled by exposed area/height), earthquake (sinusoidal horizontal motion), flood (rising water, buoyancy + drag), meteor (one big impulse). All escalate with survival time. Build wind first.
- **Breaking / health (§3.5)** is a stretch goal and out of MVP scope.

### Controls (§2.2, desktop first)
Drag and drop from the tray onto the canvas · **Q** rotates counter-clockwise, **E** clockwise (while holding or just after placing) · release places the piece. All 10 pieces are visible in the tray at once, and the player picks the order. Pieces can go anywhere on the canvas. Mobile controls are TBD.

---

## 5. UI / design tokens (from `Elevation.fig`)

**Screens (1440×900):** `00 — Daily Intro`, `01 — Tutorial`, `02 — Build Phase`, `03 — Testing Phase`, `04 — Results`.
**Shared components:** Button (Primary / Secondary / Disabled, radius 8), Badge (Neutral / Warning / Success, pill), Tray Piece (Square / Triangle / Pentagon × Available / Placed, 64×64, radius 10), Step Card (300×103, radius 12), Score Card (175×136, radius 14), Leaderboard Row (420×33), Height Ruler (140×560).

**Build Phase layout:** top bar ("Build Time: 01:47" left, "Pieces Left: 6 / 10" right) · Build Area (531×560) = Height Ruler (140 wide) + play area with the tower and platform · "PIECE TRAY" label + 10 tray slots (64px, 10px gap) at the bottom.

**Colors.** These are CSS vars in `src/app/globals.css`, mirrored in `src/lib/theme.ts` for canvas drawing. Keep both in sync.
| Token | Hex | Use |
|---|---|---|
| background | `#ffffff` | page / canvas |
| surface | `#f9f9fa` | subtle panels |
| ink | `#000000` | primary text, placed pieces |
| ink-soft | `#1c1c21` | piece strokes |
| text-muted | `#6b6b73` | secondary text, labels |
| text-subtle | `#8c8c91` | tertiary text |
| border | `#e0e0e3` | tray pieces, cards |
| border-strong | `#dedee3` | |
| platform | `#bfbfc4` | ground platform |
| disabled | `#b2b2b8` | disabled states |
| accent | `#296eed` | the single accent (active piece, primary button) |

**Type:** Space Grotesk 400 / 500 / 700 via `next/font/google` (CSS var `--font-space-grotesk`). Sizes in use: 40 / 34 / 24 / 20 / 18 bold display; 16 / 15 / 14 / 13 / 12 / 11 body and labels; line-height 100%.

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
├── scripts/                    ← Phase 6: offline SerpAPI + Gemini materials pipeline (Track D). Never imported by the app
├── supabase/
│   └── migrations/             ← Phase 5: SQL for players / scores / daily_puzzle (Track C)
└── src/
    ├── app/                    ← Next.js App Router
    │   ├── layout.tsx          ← root layout, Space Grotesk font
    │   ├── globals.css         ← design tokens (CSS vars) + reset
    │   ├── page.tsx            ← current: Phase 0 page with the physics canvas
    │   └── page.module.css
    ├── components/
    │   └── game/
    │       ├── PhysicsCanvas.tsx        ← client component; mounts/unmounts the Matter world
    │       └── PhysicsCanvas.module.css
    ├── data/
    │   ├── materials.ts                 ← Material schema, BASIC_SHAPES, MATERIALS_POOL
    │   └── items.generated.json         ← pipeline output (Phase 6); currently []
    └── lib/
        ├── theme.ts                     ← color tokens for canvas drawing
        ├── physics/
        │   ├── constants.ts             ← PX_PER_METER, platform, timings, toPx/toMeters
        │   └── world.ts                 ← createPhysicsWorld(): engine, renderer, runner, platform
        └── supabase/
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

**What you should see (Phase 0):** an "Elevation" title and a 400×560 white canvas with a single grey rounded platform near the bottom. That platform is a static Matter.js body rendered by `Matter.Render`.

**Stack versions:** Next.js 16.4 (App Router, Turbopack, `cacheComponents` on), React 19.3, TypeScript 5, Matter.js 0.20.
⚠ Next 16 has breaking changes from older Next versions. Check `node_modules/next/dist/docs/` before relying on remembered APIs (see `AGENTS.md`).

**Environment variables.** Copy `.env.example` to `.env.local`. **None are needed for Phase 0–4.** Never commit real values. Never paste them here.
| Var | Needed from | Where to get it | Where it lives |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Phase 5 | Supabase dashboard → Project Settings → API | `.env.local` + Vercel project env vars |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Phase 5 | same page (anon/public key) | `.env.local` + Vercel project env vars |
| `SERPAPI_API_KEY` | Phase 6 (offline script only) | serpapi.com → Dashboard | the local `.env.local` of whoever runs the script. **Not** on Vercel |
| `GEMINI_API_KEY` | Phase 6 (offline script only) | aistudio.google.com → Get API key | the local `.env.local` of whoever runs the script. **Not** on Vercel |

The SerpAPI and Gemini keys must never get a `NEXT_PUBLIC_` prefix and must never be imported from `src/`, because the deployed game must not call those APIs.

**Deploying:** import the repo in Vercel. The defaults (framework: Next.js, `npm run build`) work as is. Add the Supabase env vars in Project Settings once Phase 5 lands.

---

## 8. Open questions (synced with §12 of the planning doc)

Resolved and removed: backend provider, identity model, deployment target, visual direction, team work-split model.

- **Physics**
  - [ ] Exact "collapsed" detection rule (§4.7)
  - [ ] Settling-window duration (§4.6). Currently 1.5s
  - [ ] Platform width and `PX_PER_METER` (§4.2). Currently 5.5m and 40, picked to match Figma
  - [ ] Disaster escalation formulas, and whether disasters target specific tower zones (§4.10)
  - [ ] Max test duration (§4.11). Currently 75s
  - [ ] Rotation increment per Q/E press (§2.2). Currently 15°
- **Materials**
  - [ ] Numeric mass/size/friction for the 3 prototype shapes (§3.1). Placeholders in `materials.ts`
  - [ ] Breaking/health system and structural-reinforcement bonus (§3.5). Stretch goal
- **Materials library**
  - [ ] Initial size of the generated library (§3.4). 15–20 items is enough for a demo
  - [ ] Static file vs Supabase table (§3.4). Currently a static file (`items.generated.json`), the hackathon default
  - [ ] Source/rotation of the candidate object-name list (§3.4)
- **Scoring**
  - [ ] Stability-score curve: linear vs stepped vs intensity-weighted (§5.2)
  - [ ] Exact height + stability combination formula (§5.3)
- **Daily system**
  - [ ] Daily rollover time: midnight UTC vs local (§6)
- **Accounts**
  - [ ] When the display-name prompt appears: onboarding vs first results screen (§7)
  - [ ] Device-ID spoofing lets a player replay a day. **Accepted hackathon limitation**, do not harden (§7)
- **UI/UX**
  - [ ] Full results-screen content and share/percentile layout (§8)
  - [ ] Tutorial: forced on first play vs always skippable with a reminder (§8)
- **Mobile**
  - [ ] Touch control scheme, especially rotation (§2.2)
- **Team**
  - [ ] Exact moment to switch to the 4-track split. Tied to Phase 3 completion, not a clock time (§10.1)
- **Hackathon logistics**
  - [ ] Confirm with organizers that offline (not in-app) use of SerpAPI and Gemini satisfies the sponsor track (§9.2)
- **New: raised during Phase 0**
  - [ ] Keep `Matter.Render` (the debug renderer) or switch to a custom canvas draw loop? Custom drawing will likely be needed for Figma-accurate pieces and for juice (shake, particles, cracks). Decide in Phase 1–2.

---

## 9. Session log

Newest first. One entry per work session: **date · who · phase · what changed · decisions/notes.**

<!-- Template:
### YYYY-MM-DD · Name (+ tool) · Phase N
- Changed:
- Decisions:
- Next / blockers:
-->
