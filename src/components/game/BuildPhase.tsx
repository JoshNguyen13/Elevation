"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { BUILD_DURATION_S } from "@/lib/physics/constants";
import { BOARD_WIDTH_PX } from "@/lib/game/board";
import { BuildSession, localOutline, type Held } from "@/lib/game/buildSession";
import { boundsOf, transformOutline, type Vec } from "@/lib/game/geometry";
import { colors } from "@/lib/theme";
import BoardCanvas from "./BoardCanvas";
import HeightRuler from "./HeightRuler";
import PieceSvg from "./PieceSvg";
import PieceTray from "./PieceTray";
import styles from "./BuildPhase.module.css";

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

// 02 — Build Phase (Figma): drag from the tray, Q/E to rotate, pieces fall under
// the freeze-on-placement rule (§4.3). The BuildSession owns the rules and physics.
export default function BuildPhase() {
  const [session] = useState(() => new BuildSession());
  const { pieces, held } = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Console / test hook: window.__elevation.debugPieces()
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __elevation: session });
  }, [session]);

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
  const isHolding = held !== null;
  useEffect(() => {
    if (!isHolding) return;
    const move = (e: globalThis.PointerEvent) =>
      session.movePointer({ x: e.clientX, y: e.clientY }, toBoard(e.clientX, e.clientY));
    const drop = (e: globalThis.PointerEvent) => {
      move(e);
      session.drop();
    };
    const cancel = () => session.cancel();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [isHolding, session, toBoard]);

  // Q / E rotate the held piece, or the one just placed (§2.2). Esc cancels a drag.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "q") session.rotate(-1);
      else if (key === "e") session.rotate(1);
      else if (key === "escape") session.cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session]);

  const pickUpFromTray = (uid: string, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    session.pickUpFromTray(uid, { x: e.clientX, y: e.clientY }, toBoard(e.clientX, e.clientY));
  };

  const pickUpFromBoard = (e: PointerEvent<HTMLCanvasElement>) => {
    const point = toBoard(e.clientX, e.clientY);
    if (point && session.pickUpAt(point, { x: e.clientX, y: e.clientY })) e.preventDefault();
  };

  const updateHoverCursor = (e: PointerEvent<HTMLCanvasElement>) => {
    if (isHolding) return;
    const point = toBoard(e.clientX, e.clientY);
    e.currentTarget.style.cursor = point && session.pieceAt(point) ? "grab" : "";
  };

  const piecesLeft = pieces.filter((p) => p.status !== "placed").length;
  const heldMaterialId = held && pieces.find((p) => p.uid === held.uid)!.materialId;

  return (
    <div className={styles.screen} data-holding={isHolding ? "" : undefined}>
      <header className={styles.topBar}>
        <p className={styles.timer}>Build Time: {formatClock(BUILD_DURATION_S)}</p>
        <p className={styles.piecesLeft}>
          Pieces Left: {piecesLeft} / {pieces.length}
        </p>
      </header>

      <div className={styles.buildArea}>
        <HeightRuler />
        <div className={styles.play}>
          <BoardCanvas
            canvasRef={canvasRef}
            session={session}
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

      <PieceTray pieces={pieces} onPickUp={pickUpFromTray} />

      {/* Off the board, the held piece follows the pointer at true scale. On the board, the canvas draws it. */}
      {held && heldMaterialId && !held.pointerBoard && <HeldGhost held={held} materialId={heldMaterialId} />}
    </div>
  );
}

function HeldGhost({ held, materialId }: { held: Held; materialId: string }) {
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
