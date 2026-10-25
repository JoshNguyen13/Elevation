"use client";

import { useEffect, type PointerEventHandler, type RefObject } from "react";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "@/lib/game/board";
import type { BoardView } from "@/lib/game/boardView";
import type { BuildSession } from "@/lib/game/buildSession";
import { drawBoard } from "@/lib/game/draw";
import { Juice, sound } from "@/lib/juice";
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

    // Sound, particles and shake: driven by the session's events, never feeding back into it.
    const juice = new Juice();
    // Console / test hook (dev only): window.__juice.particles.count, window.__sound
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __juice: juice, __sound: sound });

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      session.step(dt);
      last = now;
      juice.handle(session.drainJuice(), session.getSnapshot().phase);
      juice.update(dt);

      view.applyTo(ctx, dpr);
      // Shake moves only the drawing (board px); pointer mapping ignores it.
      const shake = juice.shake.offset(session.disasterShake());
      if (shake.x !== 0 || shake.y !== 0) ctx.translate(shake.x, shake.y);
      drawBoard(ctx, session.drawables(), session.overlay());
      juice.particles.draw(ctx);
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
