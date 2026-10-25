"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { BOARD_WIDTH_PX } from "@/lib/game/board";
import { BoardView } from "@/lib/game/boardView";
import { BuildSession, SIM_SPEEDS, type BuildSnapshot, type Held } from "@/lib/game/buildSession";
import { boundsOf, transformOutline, type Vec } from "@/lib/game/geometry";
import type { DailyPuzzle } from "@/lib/daily/puzzle";
import { runFromSnapshot, type RunSummary } from "@/lib/daily/run";
import { colors } from "@/lib/theme";
import Button from "@/components/ui/Button";
import BoardCanvas from "./BoardCanvas";
import HeightRuler from "./HeightRuler";
import PieceSvg from "./PieceSvg";
import PieceTray from "./PieceTray";
import StabilityMeter from "./StabilityMeter";
import styles from "./BuildPhase.module.css";

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function statusText({ phase, secondsLeft, result }: BuildSnapshot) {
  if (phase === "build") return `Build Time: ${formatClock(secondsLeft)}`;
  if (phase === "settling" || !result) return "Settling…";
  return `Height: ${result.heightM.toFixed(1)} m · ${result.band}`;
}

interface BuildPhaseProps {
  puzzle: DailyPuzzle;
  // Called once when the test ends, with the finished run (the parent saves + submits it).
  onComplete: (run: RunSummary) => void;
  // "See Results" after the test ends.
  onContinue: () => void;
}

// 02 — Build Phase → 03 — Testing Phase (Figma). Drag from the tray, Q/E to rotate,
// pieces fall under the freeze-on-placement rule (§4.3). When the timer ends the
// tower settles, its height is measured (§4.6, §5.1), then the day's disaster tests
// it (§4.10). The BuildSession owns the rules and physics.
export default function BuildPhase({ puzzle, onComplete, onContinue }: BuildPhaseProps) {
  const [session] = useState(
    () =>
      new BuildSession({
        materialIds: puzzle.itemIds,
        disaster: puzzle.disaster,
        seed: puzzle.seedNumber,
      }),
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const { pieces, held, phase, result, outcome } = snapshot;
  const testing = phase === "testing" || phase === "done";
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Report the finished run exactly once.
  const reported = useRef(false);
  useEffect(() => {
    if (phase !== "done" || reported.current) return;
    const run = runFromSnapshot(puzzle.date, snapshot);
    if (!run) return;
    reported.current = true;
    onComplete(run);
  }, [phase, snapshot, puzzle.date, onComplete]);

  // Zoom / pan camera. View only: the session and physics always work in board px.
  const [view] = useState(() => new BoardView());
  const { zoom } = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);

  // Console / test hook: window.__elevation.debugPieces(), window.__view
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __elevation: session, __view: view });
  }, [session, view]);

  // Client px → board px (through the zoom), or null when the point is off the canvas.
  const toBoard = useCallback(
    (clientX: number, clientY: number): Vec | null => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
      return view.toBoard(clientX, clientY, rect);
    },
    [view],
  );

  // Mouse wheel zooms toward the cursor. Native listener: React's onWheel is passive.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const point = toBoard(e.clientX, e.clientY);
      if (point) view.zoomAt(point, Math.exp(-e.deltaY * 0.002));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [toBoard, view]);

  // Dragging empty board space pans the zoomed view.
  const panFrom = useRef<Vec | null>(null);

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
    if (point && session.pickUpAt(point, { x: e.clientX, y: e.clientY })) {
      e.preventDefault();
    } else if (view.zoom > 1) {
      panFrom.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.style.cursor = "grabbing";
    }
  };

  const onBoardPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (panFrom.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const k = BOARD_WIDTH_PX / rect.width / view.zoom;
      view.panBy(-(e.clientX - panFrom.current.x) * k, -(e.clientY - panFrom.current.y) * k);
      panFrom.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (isHolding) return;
    const point = toBoard(e.clientX, e.clientY);
    e.currentTarget.style.cursor = point && session.pieceAt(point) ? "grab" : view.zoom > 1 ? "move" : "";
  };

  const endPan = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!panFrom.current) return;
    panFrom.current = null;
    e.currentTarget.style.cursor = "";
  };

  const piecesLeft = pieces.filter((p) => p.status === "tray" || p.status === "held").length;
  const heldMaterialId = held && pieces.find((p) => p.uid === held.uid)!.materialId;

  return (
    <div className={styles.screen} data-holding={isHolding ? "" : undefined}>
      <header className={styles.topBar}>
        {phase === "testing" ? (
          <>
            <p className={styles.disasterChip}>{snapshot.disasterLabel}</p>
            <div className={styles.topRight}>
              <div className={styles.speedControl} role="group" aria-label="Disaster speed">
                {SIM_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    className={styles.speedButton}
                    aria-pressed={snapshot.speed === speed}
                    onClick={() => session.setSpeed(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              <p className={styles.timer}>Surviving: {formatClock(snapshot.testSeconds)}</p>
            </div>
          </>
        ) : phase === "done" && outcome ? (
          <>
            <p className={styles.timer}>
              {outcome.collapsed
                ? `Collapsed at ${formatClock(outcome.survivedS)}`
                : `Survived ${formatClock(outcome.survivedS)}!`}
            </p>
            <p className={styles.piecesLeft}>{snapshot.disasterName}</p>
          </>
        ) : (
          <>
            <p className={styles.timer}>{statusText(snapshot)}</p>
            <div className={styles.topRight}>
              <p className={styles.piecesLeft}>
                Pieces Left: {piecesLeft} / {pieces.length}
              </p>
              {phase === "build" && (
                <button
                  type="button"
                  className={styles.startButton}
                  disabled={!pieces.some((p) => p.status === "placed")}
                  onClick={() => session.endBuild()}
                >
                  Start Early
                </button>
              )}
            </div>
          </>
        )}
      </header>

      <div className={styles.buildArea}>
        <HeightRuler activeBand={result?.band} />
        <div className={styles.play}>
          <div className={styles.boardWrap}>
            <BoardCanvas
              canvasRef={canvasRef}
              session={session}
              view={view}
              zoomed={zoom > 1}
              isDragging={isHolding}
              onPointerDown={pickUpFromBoard}
              onPointerMove={onBoardPointerMove}
              onPointerUp={endPan}
            />
            <div className={styles.zoomControls} role="group" aria-label="Zoom">
              <button type="button" className={styles.zoomButton} aria-label="Zoom in" onClick={() => view.zoomBy(1.5)}>
                +
              </button>
              <button
                type="button"
                className={styles.zoomLevel}
                aria-label="Reset zoom"
                disabled={zoom === 1}
                onClick={() => view.reset()}
              >
                {zoom.toFixed(1)}x
              </button>
              <button type="button" className={styles.zoomButton} aria-label="Zoom out" onClick={() => view.zoomBy(1 / 1.5)}>
                −
              </button>
            </div>
          </div>
          {/* Always rendered (empty while testing) so the board never shifts. */}
          <p className={styles.hint}>
            {phase === "build" ? (
              <>
                Drag a piece onto the platform. The newest piece won&apos;t fall
                <br />
                until you place the next one. Q / E to rotate.
              </>
            ) : !testing ? (
              <>
                Time&apos;s up. Your tower is settling
                <br />
                and its height is the official one.
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Fixed-height slot so the board doesn't move when the tray swaps for the meter. */}
      <div className={styles.bottom}>
      {phase === "done" && outcome && result ? (
        <div className={styles.doneRow}>
          <dl className={styles.summary}>
            <div>
              <dt>Height</dt>
              <dd>
                {result.heightM.toFixed(1)} m · {result.band}
              </dd>
            </div>
            <div>
              <dt>Stability</dt>
              <dd>{outcome.stability.toFixed(1)} / 5</dd>
            </div>
            <div>
              <dt>Combined score</dt>
              <dd className={styles.combined}>{outcome.combined}</dd>
            </div>
          </dl>
          <Button onClick={onContinue}>See Results →</Button>
        </div>
      ) : testing ? (
        <StabilityMeter integrity={snapshot.integrity} />
      ) : (
        <PieceTray pieces={pieces} enabled={phase === "build"} onPickUp={pickUpFromTray} />
      )}
      </div>

      {/* Off the board, the held piece follows the pointer at true scale. On the board, the canvas draws it. */}
      {held && heldMaterialId && !held.pointerBoard && (
        <HeldGhost held={held} local={session.outline(heldMaterialId)} zoom={zoom} />
      )}
    </div>
  );
}

// The off-board drag ghost, at the size the piece will have on the (zoomed) board.
function HeldGhost({ held, local, zoom }: { held: Held; local: Vec[]; zoom: number }) {
  const outline = transformOutline(local, 0, 0, held.angle).map((v) => ({ x: v.x * zoom, y: v.y * zoom }));
  const b = boundsOf(outline);
  return (
    <PieceSvg
      outline={outline}
      fill={colors.ink}
      className={styles.ghost}
      style={{
        left: held.pointerClient.x + held.grab.x * zoom + b.minX,
        top: held.pointerClient.y + held.grab.y * zoom + b.minY,
      }}
    />
  );
}
