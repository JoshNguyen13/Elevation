"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { BuildSession } from "@/lib/game/buildSession";
import { Backdrop } from "@/lib/game/disasterBackdrop";
import { moveLetters, resetLetters } from "@/lib/game/doomLetters";
import styles from "./DisasterBackdrop.module.css";

interface DisasterBackdropProps {
  session: BuildSession;
  // The board canvas: the hand-off aims at it, and wind streaks stay off it.
  boardRef: RefObject<HTMLCanvasElement | null>;
}

// How the approach ramps over the build: barely there at first, close by the end.
const BUILD_APPROACH = (k: number) => 0.06 + 0.74 * k ** 1.6;
const FADE_AFTER_DONE_MS = 2500;

// The day's disaster approaching while you build (disasters track): scenery behind the
// page, things in flight in front of it, and the page's letters (DoomText) reacting.
// View only: it reads the session and never writes back, and nothing moves the board.
export default function DisasterBackdrop({ session, boardRef }: DisasterBackdropProps) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const back = backRef.current?.getContext("2d");
    const front = frontRef.current?.getContext("2d");
    if (!back || !front) return;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const backdrop = new Backdrop();
    let size = { width: 0, height: 0, dpr: 1 };
    let endApproach = 0;
    let doneAt: number | null = null;
    let letters: HTMLElement[] = [];
    let last = performance.now();
    let frame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      size = { width: window.innerWidth, height: window.innerHeight, dpr };
      for (const ctx of [back, front]) {
        ctx.canvas.width = size.width * dpr;
        ctx.canvas.height = size.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      frame = requestAnimationFrame(loop);
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      const up = session.buildUp();
      let approach: number;
      if (up.stage === "build") {
        approach = BUILD_APPROACH(up.build);
        endApproach = approach;
      } else if (up.stage === "final") {
        approach = endApproach + (1 - endApproach) * up.final;
      } else {
        approach = 1;
      }
      if (up.stage === "done") doneAt ??= now;
      const fade = doneAt === null ? 1 : Math.max(0, 1 - (now - doneAt) / FADE_AFTER_DONE_MS);
      const view = up.stage === "testing" || up.stage === "done" ? up.disaster.view() : null;

      const pulses = backdrop.draw(
        back,
        front,
        { width: size.width, height: size.height, board: rect, up, approach, fade, view, now, dt },
        letters.length,
      );

      // The letters: re-collect them each frame (React re-renders text as it changes).
      letters = Array.from(document.querySelectorAll<HTMLElement>("[data-doom-letter]"));
      if (calm) return;
      const felt = up.stage === "testing" ? 0.55 + 0.45 * (view?.strength ?? 0) : approach ** 1.5;
      moveLetters(letters, up.disaster.type, up.disaster.side, felt * fade, now, pulses);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      resetLetters(letters);
    };
  }, [session, boardRef]);

  return (
    <>
      <canvas ref={backRef} className={styles.back} aria-hidden />
      <canvas ref={frontRef} className={styles.front} aria-hidden />
    </>
  );
}
