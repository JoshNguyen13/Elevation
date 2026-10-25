// The build phase: which pieces are in the tray, held, or placed, and the
// rules for picking up, dropping and rotating them. Placed pieces are Matter.js
// bodies (PhysicsWorld), which own their positions. React subscribes to the
// snapshot (useSyncExternalStore) and the canvas draws from drawables() each frame.
// When the build timer ends, everything unfreezes, settles, and the height is measured (§4.6, §5.1).
// Then the day's disaster tests the tower until it collapses or time runs out (§4.10, §5.2).
import { getMaterial } from "@/data/materials";
import {
  BUILD_DURATION_S,
  COLLAPSE_FALLEN_FRACTION,
  DAILY_PIECE_COUNT,
  GROUND_TOLERANCE_PX,
  HEIGHT_REVEAL_S,
  MAX_FRAME_MS,
  MAX_TEST_DURATION_S,
  PHYSICS_STEP_MS,
  ROTATION_STEP_DEG,
  SETTLE_DURATION_S,
} from "@/lib/physics/constants";
import {
  createDisaster,
  seededRandom,
  type Disaster,
  type DisasterBuildUp,
  type DisasterCue,
} from "@/lib/physics/disasters";
import { PhysicsWorld, type Pose } from "@/lib/physics/world";
import type { DisasterType } from "@/lib/supabase/types";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_OUTLINE, PLATFORM_RECT } from "./board";
import { dayGravity, MAX_STACK_PX, pieceScale } from "./dailyScale";
import type { BoardOverlay, DrawnIcon, DrawnPiece } from "./draw";
import {
  boundsOf,
  containsPoint,
  overlaps,
  shapeCentroid,
  shapeOutline,
  transformOutline,
  type Vec,
} from "./geometry";
import {
  bandFor,
  type HeightBand,
  combinedScore,
  stabilityScore,
  type HeightResult,
  type TestResult,
} from "./scoring";

// "lost": fell off the board after the build ended, so it's gone for good.
export type PieceStatus = "tray" | "held" | "placed" | "lost";

// Disaster playback speed multipliers.
export const SIM_SPEEDS = [1, 2, 4] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

// build → (timer hits 0) → settling → (SETTLE_DURATION_S) → measured → (HEIGHT_REVEAL_S)
// → testing → (collapse or MAX_TEST_DURATION_S) → done
export type Phase = "build" | "settling" | "measured" | "testing" | "done";

export interface Piece {
  uid: string;
  materialId: string;
  status: PieceStatus;
  // Placement order; the highest is the newest piece. null while in the tray.
  placedSeq: number | null;
}

export interface Held {
  uid: string;
  angle: number;
  // Piece center minus pointer, in board px, so a picked-up piece doesn't jump.
  grab: Vec;
  pointerClient: Vec;
  // null while the pointer is off the board.
  pointerBoard: Vec | null;
  // Where a piece picked up off the board was, restored on cancel. null if it came from the tray.
  origin: { pose: Pose; frozen: boolean; placedSeq: number } | null;
}

export interface Preview {
  pose: Pose;
  outline: Vec[];
  valid: boolean;
}

export interface BuildSnapshot {
  pieces: readonly Piece[];
  held: Held | null;
  // The newest placed piece: static until the next placement (§4.3).
  frozenUid: string | null;
  phase: Phase;
  // Build time left, whole seconds rounded up.
  secondsLeft: number;
  // The official height, once measured.
  result: HeightResult | null;
  disaster: DisasterType;
  disasterName: string;
  disasterLabel: string;
  // Whole seconds survived in the Testing Phase.
  testSeconds: number;
  // Disaster playback speed.
  speed: SimSpeed;
  // Fraction of the measured tower's pieces not yet fallen (§4.7), 1 before the test.
  integrity: number;
  // Stability and combined score, once the test ends.
  outcome: TestResult | null;
  // Live tower height during the build (§8 HUD), not counting the frozen (floating)
  // piece. null when nothing is standing. Updated when the shown 0.1 m value changes.
  live: { heightM: number; percent: number; band: HeightBand } | null;
}

// Moments the view layer turns into sound, particles and shake (src/lib/juice). Read-only:
// nothing here feeds back into physics or scores. Positions are board px; strength 0–1.
export type JuiceEvent =
  | { kind: "impact"; x: number; y: number; strength: number; meteor: boolean }
  | { kind: "place" }
  | { kind: "pickup" }
  | { kind: "rotate" }
  | { kind: "fallen"; x: number; y: number }
  | { kind: "tick"; secondsLeft: number }
  // `disaster` is set when the test starts, so sound can loop that disaster's ambience.
  | { kind: "phase"; phase: Phase; collapsed?: boolean; disaster?: DisasterType }
  // A moment a disaster wants heard or seen (DisasterCue), raised from Disaster.apply.
  | { kind: "disaster"; cue: DisasterCue; x?: number; y?: number; strength: number };

// Impacts slower than this (px per step) are silent resting contacts.
const MIN_IMPACT_SPEED = 1.2;
// The gravity (px/s²) the impact thresholds were tuned at; speeds are normalized to it.
const IMPACT_TUNED_GRAVITY_PX_S2 = 1000;
const MAX_QUEUED_JUICE = 200;

export interface BuildSessionOptions {
  materialIds?: string[];
  disaster?: DisasterType;
  // Seeds the disaster's randomness (wind direction, meteor spots). Phase 5: the daily seed.
  seed?: number;
  // Dev Lab only: a shorter or longer build than the daily BUILD_DURATION_S.
  buildSeconds?: number;
}

const ROTATION_STEP_RAD = (ROTATION_STEP_DEG * Math.PI) / 180;

// Placeholder until the daily seed exists (Phase 5, §6). Mirrors the Figma tray.
const PLACEHOLDER_MATERIAL_IDS = Array.from(
  { length: DAILY_PIECE_COUNT },
  (_, i) => ["square", "triangle", "pentagon"][i % 3],
);

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function isInsideBoard(outline: Vec[]): boolean {
  const b = boundsOf(outline);
  return b.minX >= 0 && b.minY >= 0 && b.maxX <= BOARD_WIDTH_PX && b.maxY <= BOARD_HEIGHT_PX;
}

function isOffBoard(outline: Vec[]): boolean {
  const b = boundsOf(outline);
  return b.minY > BOARD_HEIGHT_PX || b.maxX < 0 || b.minX > BOARD_WIDTH_PX;
}

export class BuildSession {
  private readonly world: PhysicsWorld;
  // Board px per real-world meter for today's set (§5.1).
  readonly pxPerMeter: number;
  // Fall speed scales with √gravity, so impacts sound the same on every day's gravity.
  private readonly impactSpeedScale: number;
  private readonly outlines = new Map<string, Vec[]>();
  private readonly iconFrames = new Map<string, { path: string; cx: number; cy: number } | null>();
  private pieces: Piece[];
  private held: Held | null = null;
  private frozenUid: string | null = null;
  private nextSeq = 0;
  private stepBacklogMs = 0;
  private speed: SimSpeed = 1;
  private phase: Phase = "build";
  private buildMsLeft = BUILD_DURATION_S * 1000;
  private readonly buildMsTotal: number;
  private settleMsLeft = SETTLE_DURATION_S * 1000;
  private result: HeightResult | null = null;
  private juiceQueue: JuiceEvent[] = [];
  private revealMsLeft = HEIGHT_REVEAL_S * 1000;
  private readonly disaster: Disaster;
  private testMs = 0;
  // Collapse tracking (§4.7) for the pieces that made up the measured tower.
  private towerUids: string[] = [];
  private readonly peakElevation = new Map<string, number>();
  private readonly pieceHeight = new Map<string, number>();
  private readonly fallen = new Set<string>();
  private outcome: TestResult | null = null;
  private snapshot: BuildSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor({
    materialIds = PLACEHOLDER_MATERIAL_IDS,
    disaster = "wind",
    seed = 1,
    buildSeconds = BUILD_DURATION_S,
  }: BuildSessionOptions = {}) {
    this.buildMsLeft = buildSeconds * 1000;
    this.buildMsTotal = this.buildMsLeft;
    this.disaster = createDisaster(disaster, seededRandom(seed));
    this.pxPerMeter = pieceScale(materialIds);
    const gravity = dayGravity(this.pxPerMeter);
    this.world = new PhysicsWorld(gravity);
    this.impactSpeedScale = Math.sqrt(gravity / IMPACT_TUNED_GRAVITY_PX_S2);
    this.pieces = materialIds.map((materialId, i) => ({
      uid: `piece-${i}`,
      materialId,
      status: "tray",
      placedSeq: null,
    }));
    this.snapshot = this.createSnapshot();
  }

  // --- React subscription -------------------------------------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private createSnapshot(): BuildSnapshot {
    return {
      pieces: this.pieces,
      held: this.held,
      frozenUid: this.frozenUid,
      phase: this.phase,
      secondsLeft: Math.ceil(this.buildMsLeft / 1000),
      result: this.result,
      disaster: this.disaster.type,
      disasterName: this.disaster.name,
      disasterLabel: this.disaster.label,
      testSeconds: Math.floor(this.testMs / 1000),
      speed: this.speed,
      integrity: this.integrity(),
      outcome: this.outcome,
      live: this.liveHeight(),
    };
  }

  // --- Live height and juice -------------------------------------------------

  private liveHeight(): BuildSnapshot["live"] {
    const tops = this.placedPieces()
      .filter((p) => p.uid !== this.frozenUid)
      .flatMap((p) => this.world.vertices(p.uid).map((v) => v.y));
    if (tops.length === 0) return null;
    const heightPx = Math.max(0, PLATFORM_RECT.y - Math.min(...tops));
    if (heightPx === 0) return null;
    const percent = Math.min(100, (heightPx / MAX_STACK_PX) * 100);
    return { heightM: Math.round((heightPx / this.pxPerMeter) * 10) / 10, percent, band: bandFor(percent) };
  }

  private juice(event: JuiceEvent) {
    if (this.juiceQueue.length < MAX_QUEUED_JUICE) this.juiceQueue.push(event);
  }

  // Everything that happened since the last call (the canvas loop calls this every frame).
  drainJuice(): JuiceEvent[] {
    const events = this.juiceQueue;
    this.juiceQueue = [];
    return events;
  }

  // 0–1 continuous screen shake from the disaster itself (the earthquake), testing only.
  disasterShake(): number {
    return this.phase === "testing" ? this.disaster.visualShake() : 0;
  }

  private collectImpacts() {
    for (const impact of this.world.drainImpacts()) {
      const speed = impact.speed / this.impactSpeedScale;
      if (speed < MIN_IMPACT_SPEED) continue;
      this.juice({
        kind: "impact",
        x: impact.x,
        y: impact.y,
        strength: Math.min(1, (speed - MIN_IMPACT_SPEED) / 10),
        meteor: impact.labels.some((label) => label.startsWith("meteor-")),
      });
    }
  }

  private emit() {
    this.snapshot = this.createSnapshot();
    this.listeners.forEach((listener) => listener());
  }

  private setStatus(uid: string, status: PieceStatus, placedSeq: number | null) {
    this.pieces = this.pieces.map((p) => (p.uid === uid ? { ...p, status, placedSeq } : p));
  }

  private piece(uid: string): Piece {
    return this.pieces.find((p) => p.uid === uid)!;
  }

  private placedPieces(): Piece[] {
    return this.pieces.filter((p) => p.status === "placed");
  }

  private get building() {
    return this.phase === "build";
  }

  // --- Queries -------------------------------------------------------------

  // The material's outline at angle 0, centered on its centroid, in px at today's scale.
  outline(materialId: string): Vec[] {
    let outline = this.outlines.get(materialId);
    if (!outline) {
      outline = shapeOutline(getMaterial(materialId).shape, this.pxPerMeter);
      this.outlines.set(materialId, outline);
    }
    return outline;
  }

  // Topmost placed piece under a board point: the frozen one first, then newest first.
  pieceAt(point: Vec): Piece | null {
    if (!this.building) return null;
    const rank = (p: Piece) => (p.uid === this.frozenUid ? Infinity : p.placedSeq!);
    return (
      this.placedPieces()
        .sort((a, b) => rank(b) - rank(a))
        .find((p) => containsPoint(this.world.vertices(p.uid), point)) ?? null
    );
  }

  // No overlap with the platform or any placed piece's current body.
  private isClear(outline: Vec[], ignoreUid: string): boolean {
    if (overlaps(outline, PLATFORM_OUTLINE)) return false;
    return this.placedPieces().every(
      (p) => p.uid === ignoreUid || !overlaps(outline, this.world.vertices(p.uid)),
    );
  }

  // Where the held piece would land if released now, or null when the pointer is off the board.
  getPreview(): Preview | null {
    const { held } = this;
    if (!held?.pointerBoard) return null;
    const local = this.outline(this.piece(held.uid).materialId);

    // Clamp so the whole piece stays on the board — pieces can go anywhere on it (§2.3).
    const b = boundsOf(transformOutline(local, 0, 0, held.angle));
    const x = clamp(held.pointerBoard.x + held.grab.x, -b.minX, BOARD_WIDTH_PX - b.maxX);
    const y = clamp(held.pointerBoard.y + held.grab.y, -b.minY, BOARD_HEIGHT_PX - b.maxY);
    const outline = transformOutline(local, x, y, held.angle);

    return { pose: { x, y, angle: held.angle }, outline, valid: this.isClear(outline, held.uid) };
  }

  // A material's silhouette, with the centroid of its shape (both in meters), or null.
  private iconFrame(materialId: string) {
    if (!this.iconFrames.has(materialId)) {
      const material = getMaterial(materialId);
      const c = shapeCentroid(material.shape);
      this.iconFrames.set(materialId, material.icon ? { path: material.icon.path, cx: c.x, cy: c.y } : null);
    }
    return this.iconFrames.get(materialId)!;
  }

  private drawnIcon(materialId: string, pose: Pose): DrawnIcon | null {
    const frame = this.iconFrame(materialId);
    return frame && { ...frame, x: pose.x, y: pose.y, angle: pose.angle, scale: this.pxPerMeter };
  }

  drawables(): DrawnPiece[] {
    const placed = this.placedPieces().sort((a, b) => a.placedSeq! - b.placedSeq!);
    const drawn: DrawnPiece[] = placed.map((p) => ({
      outline: this.world.vertices(p.uid),
      look: p.uid === this.frozenUid ? "newest" : "placed",
      icon: this.drawnIcon(p.materialId, this.world.pose(p.uid)),
    }));
    for (const uid of this.disaster.extraBodyUids()) {
      drawn.push({ outline: this.world.vertices(uid), look: "meteor" });
    }
    const preview = this.getPreview();
    if (preview) {
      drawn.push({
        outline: preview.outline,
        look: preview.valid ? "preview" : "blocked",
        icon: this.drawnIcon(this.piece(this.held!.uid).materialId, preview.pose),
      });
    }
    return drawn;
  }

  // Board-wide marks: the measured height line, and the disaster while it runs.
  overlay(): BoardOverlay {
    return {
      heightLineY: this.result && PLATFORM_RECT.y - this.result.heightPx,
      disaster: this.phase === "testing" || this.phase === "done" ? this.disaster : null,
    };
  }

  private integrity(): number {
    return this.towerUids.length === 0 ? 1 : 1 - this.fallen.size / this.towerUids.length;
  }

  // Debug view for tests and the console (window.__elevation in dev).
  debugPieces() {
    return this.pieces.map((p) => ({
      ...p,
      frozen: p.uid === this.frozenUid,
      pose: p.status === "placed" ? this.world.pose(p.uid) : null,
      vertices: p.status === "placed" ? this.world.vertices(p.uid) : null,
      bondedTo: p.status === "placed" ? this.world.bondedTo(p.uid) : [],
    }));
  }

  // --- Input (build phase only) --------------------------------------------

  pickUpFromTray(uid: string, pointerClient: Vec, pointerBoard: Vec | null) {
    if (!this.building || this.held || this.piece(uid).status !== "tray") return;
    this.held = { uid, angle: 0, grab: { x: 0, y: 0 }, pointerClient, pointerBoard, origin: null };
    this.setStatus(uid, "held", null);
    this.juice({ kind: "pickup" });
    this.emit();
  }

  // Picking up a placed piece takes its body out of the world, so anything
  // leaning on it loses support and physics resolves it (§4.4).
  pickUpAt(pointerBoard: Vec, pointerClient: Vec): boolean {
    if (this.held) return false;
    const piece = this.pieceAt(pointerBoard);
    if (!piece) return false;

    const pose = this.world.pose(piece.uid);
    const frozen = piece.uid === this.frozenUid;
    this.world.removePiece(piece.uid);
    if (frozen) this.frozenUid = null;

    this.held = {
      uid: piece.uid,
      angle: pose.angle,
      grab: { x: pose.x - pointerBoard.x, y: pose.y - pointerBoard.y },
      pointerClient,
      pointerBoard,
      origin: { pose, frozen, placedSeq: piece.placedSeq! },
    };
    this.setStatus(piece.uid, "held", null);
    this.juice({ kind: "pickup" });
    this.emit();
    return true;
  }

  movePointer(pointerClient: Vec, pointerBoard: Vec | null) {
    if (!this.held) return;
    this.held = { ...this.held, pointerClient, pointerBoard };
    this.emit();
  }

  // 1 = clockwise (E), -1 = counter-clockwise (Q). §2.2
  rotate(direction: 1 | -1) {
    if (!this.building) return;
    const delta = direction * ROTATION_STEP_RAD;
    if (this.held) {
      this.held = { ...this.held, angle: this.held.angle + delta };
      this.juice({ kind: "rotate" });
      this.emit();
      return;
    }

    // Nothing held: rotate the piece just placed (it's still frozen), if it still fits.
    const uid = this.frozenUid;
    if (!uid) return;
    const pose = this.world.pose(uid);
    const angle = pose.angle + delta;
    const outline = transformOutline(this.outline(this.piece(uid).materialId), pose.x, pose.y, angle);
    if (isInsideBoard(outline) && this.isClear(outline, uid)) {
      this.world.setAngle(uid, angle);
      this.juice({ kind: "rotate" });
    }
  }

  drop() {
    const { held } = this;
    if (!held) return;
    const preview = this.getPreview();

    // Released off the board: back to the tray (unused pieces just aren't scored, §2.3).
    if (!preview) return this.returnHeldToTray();
    if (!preview.valid) return this.cancel();

    // Freeze rule (§4.3): placing this piece locks in the previous one (it becomes
    // dynamic), and this one becomes the new frozen piece — re-placed pieces count as new.
    // Once every piece is on the board there's no "next" placement to release it, so it falls now.
    const lastPiece = this.pieces.every((p) => p.uid === held.uid || p.status === "placed");
    if (this.frozenUid) this.world.setFrozen(this.frozenUid, false);
    this.addBody(held.uid, preview.pose, !lastPiece);
    this.frozenUid = lastPiece ? null : held.uid;
    this.setStatus(held.uid, "placed", this.nextSeq++);
    this.held = null;
    this.juice({ kind: "place" });
    this.emit();
  }

  cancel() {
    const { held } = this;
    if (!held) return;
    const { origin } = held;
    if (!origin) return this.returnHeldToTray();

    // Put it back where it was — unless the pieces it supported have since fallen into that spot.
    const outline = transformOutline(
      this.outline(this.piece(held.uid).materialId),
      origin.pose.x,
      origin.pose.y,
      origin.pose.angle,
    );
    if (!this.isClear(outline, held.uid)) return this.returnHeldToTray();

    this.addBody(held.uid, origin.pose, origin.frozen);
    if (origin.frozen) this.frozenUid = held.uid;
    this.setStatus(held.uid, "placed", origin.placedSeq);
    this.held = null;
    this.emit();
  }

  private returnHeldToTray() {
    this.setStatus(this.held!.uid, "tray", null);
    this.held = null;
    this.emit();
  }

  private addBody(uid: string, pose: Pose, frozen: boolean) {
    const { materialId } = this.piece(uid);
    this.world.addPiece(uid, getMaterial(materialId), this.outline(materialId), pose, frozen);
  }

  // --- Build → Test transition (§4.6) --------------------------------------

  // Ends the build now: any held piece is put back, the frozen piece unfreezes
  // so the whole structure is dynamic, and the settling window starts.
  endBuild() {
    if (!this.building) return;
    this.cancel();
    if (this.frozenUid) this.world.setFrozen(this.frozenUid, false);
    this.frozenUid = null;
    this.buildMsLeft = 0;
    this.phase = "settling";
    this.juice({ kind: "phase", phase: "settling" });
    this.emit();
  }

  // Official height (§5.1): the highest point of any piece still on the board, above the platform top.
  private measure() {
    const tops = this.placedPieces().flatMap((p) => this.world.vertices(p.uid).map((v) => v.y));
    const heightPx = Math.max(0, PLATFORM_RECT.y - Math.min(PLATFORM_RECT.y, ...tops));
    const percent = Math.min(100, (heightPx / MAX_STACK_PX) * 100);
    this.result = { heightPx, heightM: heightPx / this.pxPerMeter, percent, band: bandFor(percent) };

    // The measured tower is what the disaster tests (§4.7): pieces resting at or
    // above the platform top (not ones already sliding off the edge). Remember each
    // one's size and elevation so a toppled piece can be told apart from a base piece.
    for (const p of this.placedPieces()) {
      const b = boundsOf(this.world.vertices(p.uid));
      if (b.maxY > PLATFORM_RECT.y + GROUND_TOLERANCE_PX) continue;
      this.towerUids.push(p.uid);
      this.pieceHeight.set(p.uid, b.maxY - b.minY);
      this.peakElevation.set(p.uid, PLATFORM_RECT.y - b.maxY);
    }
    this.phase = "measured";
    this.juice({ kind: "phase", phase: "measured" });
    this.emit();
  }

  // --- Testing Phase (§4.7, §4.10, §5.2) -----------------------------------

  // A piece has fallen once its lowest point is back at the ground after it was
  // more than one piece-height up, or once it has left the board. Returns whether any fell.
  private trackCollapse(): boolean {
    let changed = false;
    for (const uid of this.towerUids) {
      if (this.fallen.has(uid)) continue;
      if (this.piece(uid).status !== "placed") {
        this.fallen.add(uid);
        changed = true;
        continue;
      }
      const b = boundsOf(this.world.vertices(uid));
      const peak = Math.max(this.peakElevation.get(uid)!, PLATFORM_RECT.y - b.maxY);
      this.peakElevation.set(uid, peak);
      if (peak > this.pieceHeight.get(uid)! && b.maxY >= PLATFORM_RECT.y - GROUND_TOLERANCE_PX) {
        this.fallen.add(uid);
        this.juice({ kind: "fallen", x: (b.minX + b.maxX) / 2, y: b.maxY });
        changed = true;
      }
    }
    return changed;
  }

  // How close the day's disaster is, for the page's build-up (view only: never read back).
  // The build-up runs over the build timer, then the settle + height reveal is the last approach.
  buildUp(): DisasterBuildUp {
    // Clamped: the first frame can step by a hair of negative time.
    const build = this.buildMsTotal > 0 ? Math.min(1, Math.max(0, 1 - this.buildMsLeft / this.buildMsTotal)) : 1;
    const finalMs = (SETTLE_DURATION_S + HEIGHT_REVEAL_S) * 1000;
    const finalDone =
      this.phase === "settling"
        ? SETTLE_DURATION_S * 1000 - this.settleMsLeft
        : this.phase === "measured"
          ? finalMs - Math.max(0, this.revealMsLeft)
          : this.phase === "build"
            ? 0
            : finalMs;
    let tower: DisasterBuildUp["tower"] = null;
    const placed = this.placedPieces().filter((p) => p.uid !== this.frozenUid);
    if (placed.length > 0) {
      const b = boundsOf(placed.flatMap((p) => this.world.vertices(p.uid)));
      tower = { cx: (b.minX + b.maxX) / 2, minX: b.minX, maxX: b.maxX, top: Math.min(b.minY, PLATFORM_RECT.y) };
    }
    return {
      disaster: this.disaster,
      stage: this.phase === "build" ? "build" : this.phase === "testing" ? "testing" : this.phase === "done" ? "done" : "final",
      build,
      final: Math.min(1, Math.max(0, finalDone / finalMs)),
      testS: this.testMs / 1000,
      tower,
    };
  }

  private finishTest(collapsed: boolean) {
    this.disaster.end(this.world);
    const survivedS = Math.min(this.testMs / 1000, MAX_TEST_DURATION_S);
    const stability = stabilityScore(survivedS, MAX_TEST_DURATION_S);
    this.outcome = {
      survivedS,
      collapsed,
      stability,
      combined: combinedScore(this.result!.percent, stability),
    };
    this.phase = "done";
    this.juice({ kind: "phase", phase: "done", collapsed });
    // The aftermath plays at normal speed.
    this.speed = 1;
    this.stepBacklogMs = Math.min(this.stepBacklogMs, MAX_FRAME_MS);
    this.emit();
  }

  // Checked after every fixed step, so the recorded survival time is the same at any speed.
  // Returns true when the test just ended.
  private checkTestEnd(): boolean {
    const fell = this.trackCollapse();
    if (this.fallen.size >= COLLAPSE_FALLEN_FRACTION * this.towerUids.length) {
      this.finishTest(true);
      return true;
    }
    if (this.testMs >= MAX_TEST_DURATION_S * 1000) {
      this.finishTest(false);
      return true;
    }
    if (fell) this.emit();
    return false;
  }

  // Disaster playback speed (Clash-of-Clans style). It only runs more fixed steps per
  // frame, so the outcome is identical at 1x, 2x and 4x.
  setSpeed(speed: SimSpeed) {
    if (this.speed === speed) return;
    this.speed = speed;
    this.emit();
  }

  // --- Simulation ----------------------------------------------------------

  // Advance physics and the phase clocks by real elapsed time, in fixed steps.
  // The clocks use the same capped time as physics, so they pause with a hidden tab.
  // The test clock counts fixed steps, so a disaster plays out identically every run.
  step(elapsedMs: number) {
    const dt = Math.min(elapsedMs, MAX_FRAME_MS);
    const speed = this.phase === "testing" ? this.speed : 1;
    this.stepBacklogMs = Math.min(this.stepBacklogMs + dt * speed, MAX_FRAME_MS * speed);
    while (this.stepBacklogMs >= PHYSICS_STEP_MS) {
      const testing = this.phase === "testing";
      if (testing) {
        this.disaster.apply({
          world: this.world,
          pieceUids: this.placedPieces().map((p) => p.uid),
          t: this.testMs / 1000,
          dt: PHYSICS_STEP_MS / 1000,
          cue: (cue, detail) => this.juice({ kind: "disaster", cue, strength: 1, ...detail }),
        });
        this.testMs += PHYSICS_STEP_MS;
      }
      this.world.step(PHYSICS_STEP_MS);
      this.collectImpacts();
      this.stepBacklogMs -= PHYSICS_STEP_MS;
      if (testing) {
        this.removeFallenPieces();
        this.checkTestEnd();
      }
    }

    this.removeFallenPieces();

    if (this.phase === "build") {
      const shownBefore = Math.ceil(this.buildMsLeft / 1000);
      this.buildMsLeft = Math.max(0, this.buildMsLeft - dt);
      const shownNow = Math.ceil(this.buildMsLeft / 1000);
      if (shownNow !== shownBefore && shownNow > 0 && shownNow <= 10) this.juice({ kind: "tick", secondsLeft: shownNow });
      if (this.buildMsLeft === 0) this.endBuild();
      else if (shownNow !== shownBefore) this.emit();
      // The live height readout: re-emit only when its shown value changes.
      else if (this.liveHeight()?.heightM !== this.snapshot.live?.heightM) this.emit();
    } else if (this.phase === "settling") {
      this.settleMsLeft -= dt;
      if (this.settleMsLeft <= 0) this.measure();
    } else if (this.phase === "measured") {
      this.revealMsLeft -= dt;
      if (this.revealMsLeft > 0) return;
      // Nothing standing to test: the run ends with zero survival.
      if (this.towerUids.length === 0) return this.finishTest(true);
      this.phase = "testing";
      // Disasters play on fully awake physics (resting is a build-phase aid).
      this.world.setResting(false);
      this.juice({ kind: "phase", phase: "testing", disaster: this.disaster.type });
      this.emit();
    } else if (this.phase === "testing") {
      if (Math.floor(this.testMs / 1000) !== this.snapshot.testSeconds) this.emit();
    }
  }

  // A piece that falls off the board goes back to the tray during the build (§4.5
  // forgiveness) and is lost after it. TBD: §4.8 despawn grace period / tower zone.
  private removeFallenPieces() {
    const fallen = this.placedPieces().filter(
      (p) => p.uid !== this.frozenUid && isOffBoard(this.world.vertices(p.uid)),
    );
    if (fallen.length === 0) return;
    for (const p of fallen) {
      this.world.removePiece(p.uid);
      this.setStatus(p.uid, this.building ? "tray" : "lost", null);
    }
    this.emit();
  }
}
