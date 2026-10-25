## What and why

<!-- One topic per PR. Which track: physics / disasters / sound / contract / integrator -->

## How I tested it

<!-- Dev Lab (/dev) setup: pieces, disaster, build time. What you looked or listened for. -->

## Checklist

- [ ] Rebased on the latest `main` (`git pull --rebase origin main`)
- [ ] Only files my track owns changed (see docs/TEAM_PLAN.md §1), or this is a contract PR and the other tracks know
- [ ] `npx tsc --noEmit`, `npm run lint` and `npm run build` pass
- [ ] No new npm dependencies, no `.env.local`, no `CONTEXT.md` / `scripts/` / `src/data/` changes
- [ ] Logged in `docs/tracks/<track>.md`
