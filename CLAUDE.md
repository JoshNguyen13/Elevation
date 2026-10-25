# Team rules for Claude Code

Three tracks work in parallel on separate branches: **physics**, **disasters** and **sound**. The full plan, file ownership and prompts are in `docs/TEAM_PLAN.md`. `CONTEXT.md` is the project's source of truth (read §4 before changing game rules). `AGENTS.md` covers Next.js 16.

Unless the user says they're the integrator:

- **Only edit files your track owns** (table in `docs/TEAM_PLAN.md` §1). If a change needs another track's file or a shared contract (`JuiceEvent` / `Phase` in `buildSession.ts`; `Disaster` / `DisasterStep` / `DisasterCue` in `disasters.ts`; `DisasterType`; `Material`), stop and tell the user what and why instead of editing it.
- **Never edit** `CONTEXT.md`, `scripts/materials/**`, `scripts/cache/**`, `src/data/**`, `supabase/**`, `package.json` or `package-lock.json`. **Never run** `npm run materials:run` (it spends API quota).
- Don't reformat, rename or reorder code you weren't asked to change. Match the surrounding style and comment density.
- Don't commit or push unless the user asks. Don't start a second dev server; if one is running on :3000, use it.
- Test in the Dev Lab at `/dev` (pick any pieces, disaster and build time). Dev hooks: `window.__elevation` (session), `__view` (zoom), `__juice`, `__sound`.
- Before calling work done: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Log what changed and what's still open in `docs/tracks/<track>.md`, not in `CONTEXT.md`.
