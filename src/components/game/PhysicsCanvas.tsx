"use client";

import { useEffect, useRef } from "react";
import { createPhysicsWorld } from "@/lib/physics/world";
import { CANVAS_HEIGHT_M, CANVAS_WIDTH_M, toPx } from "@/lib/physics/constants";
import styles from "./PhysicsCanvas.module.css";

export default function PhysicsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const world = createPhysicsWorld(canvasRef.current);
    return world.destroy;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      width={toPx(CANVAS_WIDTH_M)}
      height={toPx(CANVAS_HEIGHT_M)}
      aria-label="Elevation build area"
    />
  );
}
