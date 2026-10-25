"use client";

import { useEffect, type PointerEventHandler, type RefObject } from "react";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "@/lib/game/board";
import type { BuildSession } from "@/lib/game/buildSession";
import { drawBoard } from "@/lib/game/draw";
import styles from "./BoardCanvas.module.css";

interface BoardCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  session: BuildSession;
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
}

export default function BoardCanvas({
  canvasRef,
  session,
  isDragging,
  onPointerDown,
  onPointerMove,
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
      drawBoard(ctx, session.drawables());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, session]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      data-dragging={isDragging ? "" : undefined}
      width={BOARD_WIDTH_PX}
      height={BOARD_HEIGHT_PX}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      aria-label="Build area"
    />
  );
}
