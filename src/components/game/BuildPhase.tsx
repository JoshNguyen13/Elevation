"use client";

import { useCallback, useEffect, useReducer, useRef, type PointerEvent } from "react";
import { BUILD_DURATION_S } from "@/lib/physics/constants";
import { BOARD_WIDTH_PX } from "@/lib/game/board";
import {
  buildReducer,
  createInitialState,
  getPreview,
  localOutline,
  newestPlacedUid,
  pieceAt,
  pieceOutline,
} from "@/lib/game/buildState";
import type { DrawnPiece } from "@/lib/game/draw";
import { boundsOf, transformOutline, type Vec } from "@/lib/game/geometry";
import { colors } from "@/lib/theme";
import BoardCanvas from "./BoardCanvas";
import HeightRuler from "./HeightRuler";
import PieceSvg from "./PieceSvg";
import PieceTray from "./PieceTray";
import styles from "./BuildPhase.module.css";

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

// 02 — Build Phase (Figma). Phase 1: drag from the tray, Q/E to rotate, no gravity.
export default function BuildPhase() {
  const [state, dispatch] = useReducer(buildReducer, undefined, () => createInitialState());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Client px → board px, or null when the point is off the board.
  const toBoard = useCallback((clientX: number, clientY: number): Vec | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const scale = BOARD_WIDTH_PX / rect.width;
    return { x: x * scale, y: y * scale };
  }, []);

  // While a piece is held, follow the pointer anywhere on the page.
  const isHolding = state.held !== null;
  useEffect(() => {
    if (!isHolding) return;
    const move = (e: globalThis.PointerEvent) =>
      dispatch({
        type: "movePointer",
        pointerClient: { x: e.clientX, y: e.clientY },
        pointerBoard: toBoard(e.clientX, e.clientY),
      });
    const drop = (e: globalThis.PointerEvent) => {
      move(e);
      dispatch({ type: "drop" });
    };
    const cancel = () => dispatch({ type: "cancel" });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [isHolding, toBoard]);

  // Q / E rotate the held piece, or the one just placed (§2.2). Esc cancels a drag.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "q") dispatch({ type: "rotate", direction: -1 });
      else if (key === "e") dispatch({ type: "rotate", direction: 1 });
      else if (key === "escape") dispatch({ type: "cancel" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const pickUpFromTray = (uid: string, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    dispatch({
      type: "pickUp",
      uid,
      grab: { x: 0, y: 0 },
      pointerClient: { x: e.clientX, y: e.clientY },
      pointerBoard: toBoard(e.clientX, e.clientY),
    });
  };

  const pickUpFromBoard = (e: PointerEvent<HTMLCanvasElement>) => {
    const point = toBoard(e.clientX, e.clientY);
    const piece = point && pieceAt(state.pieces, point);
    if (!point || !piece) return;
    e.preventDefault();
    dispatch({
      type: "pickUp",
      uid: piece.uid,
      grab: { x: piece.x - point.x, y: piece.y - point.y },
      pointerClient: { x: e.clientX, y: e.clientY },
      pointerBoard: point,
    });
  };

  const updateHoverCursor = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isHolding) return;
    const point = toBoard(e.clientX, e.clientY);
    e.currentTarget.style.cursor = point && pieceAt(state.pieces, point) ? "grab" : "";
  };

  const preview = getPreview(state);
  const newestUid = newestPlacedUid(state.pieces);
  const drawnPieces: DrawnPiece[] = state.pieces
    .filter((p) => p.status === "placed")
    .sort((a, b) => a.placedSeq! - b.placedSeq!)
    .map((p) => ({ outline: pieceOutline(p), look: p.uid === newestUid ? "newest" : "placed" }));
  if (preview) drawnPieces.push({ outline: preview.outline, look: preview.valid ? "preview" : "blocked" });

  const { held } = state;
  const piecesLeft = state.pieces.filter((p) => p.status !== "placed").length;

  return (
    <div className={styles.screen} data-holding={isHolding ? "" : undefined}>
      <header className={styles.topBar}>
        <p className={styles.timer}>Build Time: {formatClock(BUILD_DURATION_S)}</p>
        <p className={styles.piecesLeft}>
          Pieces Left: {piecesLeft} / {state.pieces.length}
        </p>
      </header>

      <div className={styles.buildArea}>
        <HeightRuler />
        <div className={styles.play}>
          <BoardCanvas
            canvasRef={canvasRef}
            pieces={drawnPieces}
            isDragging={isHolding}
            onPointerDown={pickUpFromBoard}
            onPointerMove={updateHoverCursor}
          />
          <p className={styles.hint}>
            Drag a piece onto the platform. The newest piece won&apos;t fall
            <br />
            until you place the next one. Q / E to rotate.
          </p>
        </div>
      </div>

      <PieceTray pieces={state.pieces} onPickUp={pickUpFromTray} />

      {/* Off the board, the held piece follows the pointer at true scale. On the board, the canvas draws it. */}
      {held && !held.pointerBoard && <HeldGhost held={held} materialId={pieceMaterial(state.pieces, held.uid)} />}
    </div>
  );
}

function pieceMaterial(pieces: { uid: string; materialId: string }[], uid: string) {
  return pieces.find((p) => p.uid === uid)!.materialId;
}

function HeldGhost({
  held,
  materialId,
}: {
  held: { angle: number; grab: Vec; pointerClient: Vec };
  materialId: string;
}) {
  const outline = transformOutline(localOutline(materialId), 0, 0, held.angle);
  const b = boundsOf(outline);
  return (
    <PieceSvg
      outline={outline}
      fill={colors.ink}
      className={styles.ghost}
      style={{
        left: held.pointerClient.x + held.grab.x + b.minX,
        top: held.pointerClient.y + held.grab.y + b.minY,
      }}
    />
  );
}
