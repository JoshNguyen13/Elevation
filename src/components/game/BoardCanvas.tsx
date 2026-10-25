"use client";

import { useEffect, type PointerEventHandler, type RefObject } from "react";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "@/lib/game/board";
import type { BoardView } from "@/lib/game/boardView";
import type { BuildSession } from "@/lib/game/buildSession";
import { drawBoard } from "@/lib/game/draw";
import styles from "./BoardCanvas.module.css";

interface BoardCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  session: BuildSession;
  view: BoardView;
  zoomed: boolean;
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: PointerEventHandler<HTMLCanvasElement>;
}

export default function BoardCanvas({
  canvasRef,
  session,
  view,
  zoomed,
  isDragging,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: BoardCanvasProps) {
  // Game loop: step physics by real elapsed time, then draw the current bodies.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Back the canvas with device pixels so shapes stay crisp on HiDPI screens.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_WIDTH_PX * dpr;
    canvas.height = BOARD_HEIGHT_PX * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      session.step(now - last);
      last = now;
      view.applyTo(ctx, dpr);
      drawBoard(ctx, session.drawables(), session.overlay());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, session, view]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      data-dragging={isDragging ? "" : undefined}
      data-zoomed={zoomed ? "" : undefined}
      width={BOARD_WIDTH_PX}
      height={BOARD_HEIGHT_PX}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Build area"
    />
  );
}
