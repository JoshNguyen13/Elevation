// "Par": the best tower the solver finds for a day's puzzle. It plays the real BuildSession with
// a player's own moves (pick up from the tray, rotate, drop, wait), so the game enforces every
// rule (no overlap, on the board, freeze on placement, 10 pieces, the build timer) and the
// physics and disaster are unchanged. A greedy beam search, each candidate scored by the real
// disaster test: the best tower found, not a proven maximum.
//
// Computed in the Dev Lab ("Compute par") and stored per date in src/data/par.generated.json.
// The results screen replays the stored moves, so what it shows always matches the current game.
import parData from "@/data/par.generated.json";
import type { DailyPuzzle } from "@/lib/daily/puzzle";
import { MAX_FRAME_MS, PHYSICS_STEP_MS } from "@/lib/physics/constants";
import type { DisasterType } from "@/lib/supabase/types";
import { PLATFORM_RECT } from "./board";
import { BuildSession } from "./buildSession";
import type { Vec } from "./geometry";
import type { HeightBand } from "./scoring";

// One placement: which tray slot, where its centroid goes (board px; it's dropped resting
// 1px above whatever is under it) and its rotation.
export interface ParMove {
  slot: number;
  x: number;
  angleDeg: number;
}

export interface ParOutcome {
  heightPercent: number;
  heightM: number;
  band: HeightBand;
  survivedS: number;
  collapsed: boolean;
  combined: number;
}

export interface ParEntry {
  itemIds: string[];
  disaster: DisasterType;
  seed: number;
  // Fixed physics steps between placements.
  waitSteps: number;
  moves: ParMove[];
  outcome: ParOutcome;
  // How many towers the search simulated.
  builds: number;
  solvedAt: string;
}

export type ParPuzzle = Pick<DailyPuzzle, "date" | "itemIds" | "disaster" | "seedNumber">;

// 1.5s between placements: 10 pieces use 15s of the 120s build.
const WAIT_STEPS = 90;
const BEAM_WIDTH = 3;
// Where to try each piece, relative to the centre of the tower's top (board px).
const X_OFFSETS = [0, -6, 6, -14, 14, -24, 24];
const ANGLES_DEG = [0, 90, 180, 270];
// Safety cap on fixed steps for one phase (a full test is ~4,500).
const MAX_STEPS = 20_000;
// A tower that survives the test must still stand this long after it (2s): no lost
// pieces, and its top no more than 10% of its height lower.
const AFTERMATH_STEPS = 120;

const session = (p: ParPuzzle) => new BuildSession({ materialIds: p.itemIds, disaster: p.disaster, seed: p.seedNumber });

function rotated(outline: Vec[], angleDeg: number): Vec[] {
  const a = (angleDeg * Math.PI) / 180;
  return outline.map((v) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) }));
}

// The top (smallest y) of a polygon at x, or Infinity if x misses it.
function topAt(polygon: Vec[], x: number): number {
  let top = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a.x === b.x || (a.x - x) * (b.x - x) > 0) continue;
    top = Math.min(top, a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
  }
  return top;
}

// The highest surface under [x0, x1]: placed pieces and the platform.
function supportY(s: BuildSession, x0: number, x1: number): number {
  const outlines = s.placedOutlines();
  let y = Infinity;
  for (let k = 0; k <= 8; k++) {
    const x = x0 + ((x1 - x0) * k) / 8;
    if (x >= PLATFORM_RECT.x && x <= PLATFORM_RECT.x + PLATFORM_RECT.width) y = Math.min(y, PLATFORM_RECT.y);
    for (const outline of outlines) y = Math.min(y, topAt(outline, x));
  }
  return y;
}

// The x of the tower's top: the middle of the vertices within 8px of the highest one.
function topCenterX(s: BuildSession): number {
  const vertices = s.placedOutlines().flat();
  if (vertices.length === 0) return PLATFORM_RECT.x + PLATFORM_RECT.width / 2;
  const highest = Math.min(...vertices.map((v) => v.y));
  const near = vertices.filter((v) => v.y < highest + 8);
  return near.reduce((sum, v) => sum + v.x, 0) / near.length;
}

// Makes one move like a player would. False if the game refused the drop.
export function playMove(s: BuildSession, move: ParMove): boolean {
  const piece = s.getSnapshot().pieces[move.slot];
  const outline = rotated(s.outline(piece.materialId), move.angleDeg);
  const xs = outline.map((v) => v.x);
  const y = supportY(s, move.x + Math.min(...xs), move.x + Math.max(...xs)) - 1 - Math.max(...outline.map((v) => v.y));
  if (!Number.isFinite(y)) return false;
  s.pickUpFromTray(piece.uid, { x: 0, y: 0 }, { x: move.x, y });
  if (move.angleDeg) s.rotateBy((move.angleDeg * Math.PI) / 180);
  s.movePointer({ x: 0, y: 0 }, { x: move.x, y });
  s.drop();
  return s.getSnapshot().pieces[move.slot].status === "placed";
}

// A fresh session with the moves played, still in the build. Null if a move was refused.
export function buildPar(puzzle: ParPuzzle, moves: ParMove[], waitSteps = WAIT_STEPS): BuildSession | null {
  const s = session(puzzle);
  for (const move of moves) {
    if (!playMove(s, move)) return null;
    for (let k = 0; k < waitSteps; k++) s.step(PHYSICS_STEP_MS);
  }
  return s;
}

// Ends the build and runs fixed steps until `phase` (exact steps, so replays match the solver).
export function stepUntil(s: BuildSession, phase: "measured" | "testing" | "done") {
  if (s.getSnapshot().phase === "build") s.endBuild();
  const order = ["settling", "measured", "testing", "done"];
  for (let k = 0; k < MAX_STEPS && order.indexOf(s.getSnapshot().phase) < order.indexOf(phase); k++) {
    s.step(PHYSICS_STEP_MS);
  }
}

// The moves' real result: build, settle, measure, then the whole disaster test.
export function runPar(puzzle: ParPuzzle, moves: ParMove[], waitSteps = WAIT_STEPS): ParOutcome | null {
  return playOut(puzzle, moves, waitSteps, false);
}

// `standing`: null unless every placed piece is still on the tower once it has settled
// (the search only keeps towers that stand up before the disaster).
function playOut(puzzle: ParPuzzle, moves: ParMove[], waitSteps: number, standing: boolean): ParOutcome | null {
  const s = buildPar(puzzle, moves, waitSteps);
  if (!s) return null;
  stepUntil(s, "measured");
  if (standing) {
    const outlines = s.placedOutlines();
    const onTower = outlines.every((o) => Math.max(...o.map((v) => v.y)) <= PLATFORM_RECT.y + 2);
    if (outlines.length !== moves.length || !onTower) return null;
  }
  stepUntil(s, "done");
  const { result, outcome } = s.getSnapshot();
  if (!result || !outcome) return null;
  // A "survivor" must still stand a moment after the clock, or the replay would show it
  // crumbling as the test ends (seen: 2026-11-07's first par toppled 1s after 75s).
  if (standing && !outcome.collapsed) {
    const before = s.placedOutlines();
    for (let k = 0; k < AFTERMATH_STEPS; k++) s.step(PHYSICS_STEP_MS);
    const after = s.placedOutlines();
    const top = (outlines: Vec[][]) => Math.min(...outlines.flat().map((v) => v.y));
    if (after.length < before.length || top(after) > top(before) + 0.1 * result.heightPx) return null;
  }
  return {
    heightPercent: result.percent,
    heightM: result.heightM,
    band: result.band,
    survivedS: outcome.survivedS,
    collapsed: outcome.collapsed,
    combined: outcome.combined,
  };
}

// One orientation per distinct outline (a square needs only one of its four).
function distinctAngles(s: BuildSession, materialId: string): number[] {
  const seen = new Set<string>();
  return ANGLES_DEG.filter((deg) => {
    const key = rotated(s.outline(materialId), deg)
      .map((v) => `${Math.round(v.x)},${Math.round(v.y)}`)
      .sort()
      .join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface ParProgress {
  pieces: number;
  builds: number;
  bestCombined: number;
}

// Beam search over the next move, every candidate scored by its real combined score.
// Async: it yields between candidates so the page stays responsive (it takes 1–3 minutes).
export async function solvePar(puzzle: ParPuzzle, onProgress?: (p: ParProgress) => void): Promise<ParEntry | null> {
  let builds = 0;
  const run = (moves: ParMove[]) => {
    builds++;
    return playOut(puzzle, moves, WAIT_STEPS, true);
  };
  const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));
  const probe = session(puzzle);
  const angles = new Map(puzzle.itemIds.map((id) => [id, distinctAngles(probe, id)]));

  type Node = { moves: ParMove[]; outcome: ParOutcome | null };
  let beam: Node[] = [{ moves: [], outcome: null }];
  let best: Node | null = null;
  for (let depth = 0; depth < puzzle.itemIds.length; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      const built = buildPar(puzzle, node.moves);
      if (!built) continue;
      const cx = topCenterX(built);
      const used = new Set(node.moves.map((m) => m.slot));
      const tried = new Set<string>();
      for (let slot = 0; slot < puzzle.itemIds.length; slot++) {
        const id = puzzle.itemIds[slot];
        // Duplicate pieces are interchangeable: try each material once.
        if (used.has(slot) || tried.has(id)) continue;
        tried.add(id);
        for (const angleDeg of angles.get(id)!) {
          for (const dx of X_OFFSETS) {
            const moves = [...node.moves, { slot, x: Math.round(cx + dx), angleDeg }];
            const outcome = run(moves);
            if (outcome) next.push({ moves, outcome });
          }
          await yieldToPage();
        }
      }
    }
    if (next.length === 0) break;
    next.sort((a, b) => b.outcome!.combined - a.outcome!.combined || b.outcome!.heightPercent - a.outcome!.heightPercent);
    // The best few, skipping near-copies of the same tower.
    beam = [];
    for (const node of next) {
      if (beam.length === BEAM_WIDTH) break;
      if (beam.some((b) => Math.abs(b.outcome!.heightPercent - node.outcome!.heightPercent) < 0.3)) continue;
      beam.push(node);
    }
    if (!best || beam[0].outcome!.combined > best.outcome!.combined) best = beam[0];
    onProgress?.({ pieces: depth + 1, builds, bestCombined: best.outcome!.combined });
  }
  if (!best?.outcome) return null;
  return {
    itemIds: puzzle.itemIds,
    disaster: puzzle.disaster,
    seed: puzzle.seedNumber,
    waitSteps: WAIT_STEPS,
    moves: best.moves,
    outcome: best.outcome,
    builds,
    solvedAt: new Date().toISOString(),
  };
}

// The par played live, for watching: every piece placed at the same fixed step as in
// buildPar() and stepUntil(), so the tower and its score match the solver whatever the frame
// rate. The build runs `buildSpeed`× faster than real time; the test is the session's own
// (its clock counts fixed steps, so any frame timing gives the same outcome).
export class ParPlayback extends BuildSession {
  private readonly entry: ParEntry;
  private readonly buildSpeed: number;
  private backlogMs = 0;
  private steps = 0;
  private played = 0;

  constructor(puzzle: ParPuzzle, entry: ParEntry, buildSpeed = 3) {
    super({ materialIds: puzzle.itemIds, disaster: puzzle.disaster, seed: puzzle.seedNumber });
    this.entry = entry;
    this.buildSpeed = buildSpeed;
  }

  override step(elapsedMs: number) {
    const before = this.getSnapshot().phase;
    if (before === "testing" || before === "done") return super.step(elapsedMs);
    this.backlogMs += Math.min(elapsedMs, MAX_FRAME_MS) * this.buildSpeed;
    const { moves, waitSteps } = this.entry;
    while (this.backlogMs >= PHYSICS_STEP_MS) {
      const phase = this.getSnapshot().phase;
      if (phase === "testing" || phase === "done") break;
      if (phase === "build" && this.steps === this.played * waitSteps) {
        if (this.played < moves.length) playMove(this, moves[this.played++]);
        else this.endBuild();
      }
      super.step(PHYSICS_STEP_MS);
      this.backlogMs -= PHYSICS_STEP_MS;
      this.steps++;
    }
  }
}

const PAR = parData as Record<string, ParEntry>;

// The stored par for this exact puzzle (same pieces, disaster and seed), or null.
export function storedPar(puzzle: ParPuzzle): ParEntry | null {
  const entry = PAR[puzzle.date];
  if (!entry) return null;
  const same =
    entry.disaster === puzzle.disaster &&
    entry.seed === puzzle.seedNumber &&
    entry.itemIds.length === puzzle.itemIds.length &&
    entry.itemIds.every((id, i) => id === puzzle.itemIds[i]);
  return same ? entry : null;
}
