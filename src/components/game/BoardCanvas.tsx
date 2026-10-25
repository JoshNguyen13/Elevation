"use client";

import { useEffect, type PointerEventHandler, type RefObject } from "react";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "@/lib/game/board";
import { drawBoard, type DrawnPiece } from "@/lib/game/draw";
import styles from "./BoardCanvas.module.css";

interface BoardCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pieces: DrawnPiece[];
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
}

export default function BoardCanvas({
  canvasRef,
  pieces,
  isDragging,
  onPointerDown,
  onPointerMove,
}: BoardCanvasProps) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Back the canvas with device pixels so shapes stay crisp on HiDPI screens.
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== BOARD_WIDTH_PX * dpr) {
      canvas.width = BOARD_WIDTH_PX * dpr;
      canvas.height = BOARD_HEIGHT_PX * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(ctx, pieces);
  }, [canvasRef, pieces]);

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
