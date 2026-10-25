// Build-phase state for Phase 1 (static placement, no physics): which pieces
// are in the tray, held, or placed, and the rules for dropping and rotating.
// Pure — the component converts pointer events to board coordinates.
import { getMaterial } from "@/data/materials";
import { DAILY_PIECE_COUNT, ROTATION_STEP_DEG } from "@/lib/physics/constants";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_OUTLINE } from "./board";
import {
  boundsOf,
  containsPoint,
  overlaps,
  shapeOutline,
  transformOutline,
  type Vec,
} from "./geometry";

export type PieceStatus = "tray" | "held" | "placed";

export interface Piece {
  uid: string;
  materialId: string;
  status: PieceStatus;
  // Centroid in board px and clockwise rotation in radians. Meaningful once placed.
  x: number;
  y: number;
  angle: number;
  // Placement order. The highest is the newest piece (the one §4.3 will freeze).
  placedSeq: number | null;
}

export interface Held {
  uid: string;
  // Restored if the drop is cancelled or lands somewhere invalid.
  origin: Pick<Piece, "status" | "x" | "y" | "angle" | "placedSeq">;
  angle: number;
  // Piece center minus pointer, in board px, so a picked-up piece doesn't jump.
  grab: Vec;
  pointerClient: Vec;
  // null while the pointer is off the board.
  pointerBoard: Vec | null;
}

export interface BuildState {
  pieces: Piece[];
  held: Held | null;
  nextSeq: number;
}

export interface Preview {
  x: number;
  y: number;
  angle: number;
  outline: Vec[];
  valid: boolean;
}

export type BuildAction =
  | { type: "pickUp"; uid: string; grab: Vec; pointerClient: Vec; pointerBoard: Vec | null }
  | { type: "movePointer"; pointerClient: Vec; pointerBoard: Vec | null }
  | { type: "drop" }
  | { type: "cancel" }
  // 1 = clockwise (E), -1 = counter-clockwise (Q). §2.2
  | { type: "rotate"; direction: 1 | -1 };

const ROTATION_STEP_RAD = (ROTATION_STEP_DEG * Math.PI) / 180;

// Phase 1 placeholder until the daily seed exists (Phase 5, §6). Mirrors the Figma tray.
const PLACEHOLDER_MATERIAL_IDS = Array.from(
  { length: DAILY_PIECE_COUNT },
  (_, i) => ["square", "triangle", "pentagon"][i % 3],
);

export function createInitialState(materialIds: string[] = PLACEHOLDER_MATERIAL_IDS): BuildState {
  return {
    pieces: materialIds.map((materialId, i) => ({
      uid: `piece-${i}`,
      materialId,
      status: "tray",
      x: 0,
      y: 0,
      angle: 0,
      placedSeq: null,
    })),
    held: null,
    nextSeq: 0,
  };
}

const localOutlines = new Map<string, Vec[]>();

export function localOutline(materialId: string): Vec[] {
  let outline = localOutlines.get(materialId);
  if (!outline) {
    outline = shapeOutline(getMaterial(materialId).shape);
    localOutlines.set(materialId, outline);
  }
  return outline;
}

export function pieceOutline(piece: Pick<Piece, "materialId" | "x" | "y" | "angle">): Vec[] {
  return transformOutline(localOutline(piece.materialId), piece.x, piece.y, piece.angle);
}

export function newestPlacedUid(pieces: Piece[]): string | null {
  let newest: Piece | null = null;
  for (const p of pieces) {
    if (p.status === "placed" && (newest === null || p.placedSeq! > newest.placedSeq!)) newest = p;
  }
  return newest?.uid ?? null;
}

// Topmost placed piece under a board point, newest first.
export function pieceAt(pieces: Piece[], point: Vec): Piece | null {
  const placed = pieces
    .filter((p) => p.status === "placed")
    .sort((a, b) => b.placedSeq! - a.placedSeq!);
  return placed.find((p) => containsPoint(pieceOutline(p), point)) ?? null;
}

function isInsideBoard(outline: Vec[]): boolean {
  const b = boundsOf(outline);
  return b.minX >= 0 && b.minY >= 0 && b.maxX <= BOARD_WIDTH_PX && b.maxY <= BOARD_HEIGHT_PX;
}

// No overlap with the platform or any other placed piece.
function isClear(outline: Vec[], pieces: Piece[], ignoreUid: string): boolean {
  if (overlaps(outline, PLATFORM_OUTLINE)) return false;
  return pieces.every(
    (p) => p.uid === ignoreUid || p.status !== "placed" || !overlaps(outline, pieceOutline(p)),
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// Where the held piece would land if released now, or null when the pointer is off the board.
export function getPreview(state: BuildState): Preview | null {
  const { held } = state;
  if (!held?.pointerBoard) return null;
  const piece = state.pieces.find((p) => p.uid === held.uid)!;
  const local = localOutline(piece.materialId);

  // Clamp so the whole piece stays on the board — pieces can go anywhere on it (§2.3).
  const b = boundsOf(transformOutline(local, 0, 0, held.angle));
  const x = clamp(held.pointerBoard.x + held.grab.x, -b.minX, BOARD_WIDTH_PX - b.maxX);
  const y = clamp(held.pointerBoard.y + held.grab.y, -b.minY, BOARD_HEIGHT_PX - b.maxY);
  const outline = transformOutline(local, x, y, held.angle);

  return { x, y, angle: held.angle, outline, valid: isClear(outline, state.pieces, held.uid) };
}

function updatePiece(state: BuildState, uid: string, changes: Partial<Piece>): Piece[] {
  return state.pieces.map((p) => (p.uid === uid ? { ...p, ...changes } : p));
}

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case "pickUp": {
      const piece = state.pieces.find((p) => p.uid === action.uid);
      if (state.held || !piece || piece.status === "held") return state;
      const { status, x, y, angle, placedSeq } = piece;
      return {
        ...state,
        pieces: updatePiece(state, piece.uid, { status: "held" }),
        held: {
          uid: piece.uid,
          origin: { status, x, y, angle, placedSeq },
          angle: status === "placed" ? angle : 0,
          grab: action.grab,
          pointerClient: action.pointerClient,
          pointerBoard: action.pointerBoard,
        },
      };
    }

    case "movePointer": {
      if (!state.held) return state;
      return {
        ...state,
        held: { ...state.held, pointerClient: action.pointerClient, pointerBoard: action.pointerBoard },
      };
    }

    case "drop": {
      const { held } = state;
      if (!held) return state;
      const preview = getPreview(state);

      // Released off the board: the piece goes back to the tray (unused pieces just aren't scored, §2.3).
      if (!preview) {
        return {
          ...state,
          pieces: updatePiece(state, held.uid, { status: "tray", angle: 0, placedSeq: null }),
          held: null,
        };
      }
      if (!preview.valid) return buildReducer(state, { type: "cancel" });

      return {
        pieces: updatePiece(state, held.uid, {
          status: "placed",
          x: preview.x,
          y: preview.y,
          angle: preview.angle,
          placedSeq: state.nextSeq,
        }),
        held: null,
        nextSeq: state.nextSeq + 1,
      };
    }

    case "cancel": {
      const { held } = state;
      if (!held) return state;
      return { ...state, pieces: updatePiece(state, held.uid, held.origin), held: null };
    }

    case "rotate": {
      const delta = action.direction * ROTATION_STEP_RAD;
      if (state.held) {
        return { ...state, held: { ...state.held, angle: state.held.angle + delta } };
      }

      // Nothing held: rotate the piece that was just placed (§2.2), if it still fits.
      const uid = newestPlacedUid(state.pieces);
      const piece = state.pieces.find((p) => p.uid === uid);
      if (!piece) return state;
      const angle = piece.angle + delta;
      const outline = pieceOutline({ ...piece, angle });
      if (!isInsideBoard(outline) || !isClear(outline, state.pieces, piece.uid)) return state;
      return { ...state, pieces: updatePiece(state, piece.uid, { angle }) };
    }
  }
}
