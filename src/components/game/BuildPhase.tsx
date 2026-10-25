"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "@/lib/game/board";
import { BoardView } from "@/lib/game/boardView";
import { BuildSession, SIM_SPEEDS, type BuildSnapshot, type Held } from "@/lib/game/buildSession";
import { getMaterial } from "@/data/materials";
import { boundsOf, shapeCentroid, transformOutline, type Vec } from "@/lib/game/geometry";
import type { DailyPuzzle } from "@/lib/daily/puzzle";
import { runFromSnapshot, type RunSummary } from "@/lib/daily/run";
import { colors } from "@/lib/theme";
import Button from "@/components/ui/Button";
import BoardCanvas from "./BoardCanvas";
import DisasterBackdrop from "./DisasterBackdrop";
import DoomText from "./DoomText";
import HeightRuler from "./HeightRuler";
import PieceSvg from "./PieceSvg";
import PieceTray from "./PieceTray";
import SoundToggle from "./SoundToggle";
import StabilityMeter from "./StabilityMeter";
import styles from "./BuildPhase.module.css";

// View movement, as in Figma / Canva. Wheel deltas in lines or pages become px; ctrl+wheel
// (also a trackpad pinch) zooms by exp(-deltaY * WHEEL_ZOOM_RATE), with deltaY clamped to
// WHEEL_ZOOM_MAX_DELTA so a mouse notch (~100) zooms ~18% while small pinch steps stay smooth.
// A held piece within EDGE_SCROLL_PX of the canvas edge scrolls the view, up to
// EDGE_SCROLL_SPEED px per frame.
const WHEEL_LINE_PX = 16;
const WHEEL_ZOOM_RATE = 0.005;
const WHEEL_ZOOM_MAX_DELTA = 40;
const EDGE_SCROLL_PX = 28;
const EDGE_SCROLL_SPEED = 6;

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
  // Dev Lab only: overrides the daily build time.
  buildSeconds?: number;
}

// 02 — Build Phase → 03 — Testing Phase (Figma). Drag from the tray, Q/E to rotate,
// pieces fall under the freeze-on-placement rule (§4.3). When the timer ends the
// tower settles, its height is measured (§4.6, §5.1), then the day's disaster tests
// it (§4.10). The BuildSession owns the rules and physics.
export default function BuildPhase({ puzzle, onComplete, onContinue, buildSeconds }: BuildPhaseProps) {
  const [session] = useState(
    () =>
      new BuildSession({
        materialIds: puzzle.itemIds,
        disaster: puzzle.disaster,
        seed: puzzle.seedNumber,
        buildSeconds,
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
  const viewState = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const { zoom } = viewState;
  const viewMoved = viewState.zoom !== 1 || viewState.x !== 0 || viewState.y !== 0;

  // Console / test hook: window.__elevation.debugPieces(), window.__view
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __elevation: session, __view: view });
  }, [session, view]);

  // Client px → board px (through the zoom and pan), or null when the point is off the canvas.
  const toView = useCallback(
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

  // The same, but also null over the empty margin a panned view shows around the board:
  // for pieces, the margin counts as off the board (a drop there returns to the tray).
  const toBoard = useCallback(
    (clientX: number, clientY: number): Vec | null => {
      const point = toView(clientX, clientY);
      return point && point.x >= 0 && point.y >= 0 && point.x <= BOARD_WIDTH_PX && point.y <= BOARD_HEIGHT_PX
        ? point
        : null;
    },
    [toView],
  );

  // The view moved under a held piece: re-aim it at whatever is now under the pointer.
  const followPointer = useCallback(() => {
    const pointer = session.getSnapshot().held?.pointerClient;
    if (pointer) session.movePointer(pointer, toBoard(pointer.x, pointer.y));
  }, [session, toBoard]);

  // Scroll (or two fingers) moves the view; ctrl/cmd + scroll (or a pinch) zooms toward the
  // cursor; shift + scroll moves sideways. Native listener: React's onWheel is passive.
  // The context menu is off: it has no use on the board.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? canvas.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        const point = toView(e.clientX, e.clientY);
        const delta = Math.min(Math.max(e.deltaY * unit, -WHEEL_ZOOM_MAX_DELTA), WHEEL_ZOOM_MAX_DELTA);
        if (point) view.zoomAt(point, Math.exp(-delta * WHEEL_ZOOM_RATE));
      } else {
        const k = (BOARD_WIDTH_PX / canvas.clientWidth / view.zoom) * unit;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        view.panBy(dx * k, dy * k);
      }
      followPointer();
    };
    const noMenu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", noMenu);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", noMenu);
    };
  }, [toView, followPointer, view]);

  // Dragging empty board space, a middle drag, or any drag while Space is held (the hand
  // tool) pans the view, at any zoom.
  const panFrom = useRef<Vec | null>(null);
  const spaceHeld = useRef(false);

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

  // Holding a piece near the canvas edge scrolls toward board that's out of view, so you
  // can carry a piece anywhere without letting go. Never scrolls into the empty margin.
  useEffect(() => {
    if (!isHolding) return;
    let frame = 0;
    const tick = () => {
      const pointer = session.getSnapshot().held?.pointerClient;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (pointer && rect && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom) {
        const push = (distance: number) => Math.max(0, 1 - distance / EDGE_SCROLL_PX);
        const dx = push(rect.right - pointer.x) - push(pointer.x - rect.left);
        const dy = push(rect.bottom - pointer.y) - push(pointer.y - rect.top);
        const before = view.getSnapshot();
        if (dx || dy) view.revealBy((dx * EDGE_SCROLL_SPEED) / view.zoom, (dy * EDGE_SCROLL_SPEED) / view.zoom);
        if (view.getSnapshot() !== before) followPointer();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isHolding, session, view, followPointer]);

  // Q / E rotate the held piece, or the one just placed (§2.2). Esc cancels a drag.
  // Ctrl/Cmd + = / - / 0 zoom in, out and reset (instead of zooming the page). Space held = hand tool.
  useEffect(() => {
    const setHand = (on: boolean) => {
      spaceHeld.current = on;
      const canvas = canvasRef.current;
      if (canvas && !panFrom.current) canvas.style.cursor = on ? "grab" : "";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        const zoom = key === "=" || key === "+" ? 1.5 : key === "-" ? 1 / 1.5 : key === "0" ? 0 : null;
        if (zoom === null || e.altKey) return;
        e.preventDefault();
        if (zoom === 0) view.reset();
        else view.zoomBy(zoom);
        followPointer();
        return;
      }
      if (e.altKey) return;
      if (key === " ") {
        // Also keeps Space from scrolling the page or pressing a focused button.
        e.preventDefault();
        if (!e.repeat) setHand(true);
      } else if (key === "q") session.rotate(-1);
      else if (key === "e") session.rotate(1);
      else if (key === "escape") session.cancel();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") setHand(false);
    };
    const onBlur = () => setHand(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [session, view, followPointer]);

  const pickUpFromTray = (uid: string, e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    session.pickUpFromTray(uid, { x: e.clientX, y: e.clientY }, toBoard(e.clientX, e.clientY));
  };

  const startPan = (e: PointerEvent<HTMLCanvasElement>) => {
    panFrom.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = "grabbing";
  };

  // Left button: pick up the piece under the pointer, else pan. Middle button or Space held:
  // always pan. Right button: nothing.
  const pickUpFromBoard = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      e.preventDefault();
      return startPan(e);
    }
    if (e.button !== 0) return;
    const point = toBoard(e.clientX, e.clientY);
    if (point && session.pickUpAt(point, { x: e.clientX, y: e.clientY })) e.preventDefault();
    else startPan(e);
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
    e.currentTarget.style.cursor = spaceHeld.current ? "grab" : point && session.pieceAt(point) ? "grab" : "move";
  };

  const endPan = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!panFrom.current) return;
    panFrom.current = null;
    e.currentTarget.style.cursor = spaceHeld.current ? "grab" : "";
  };

  const piecesLeft = pieces.filter((p) => p.status === "tray" || p.status === "held").length;
  const heldMaterialId = held && pieces.find((p) => p.uid === held.uid)!.materialId;

  return (
    <div className={styles.screen} data-holding={isHolding ? "" : undefined}>
      {/* The day's disaster approaching: scenery, things in flight, letters reacting. View only. */}
      <DisasterBackdrop session={session} boardRef={canvasRef} />
      <header className={styles.topBar}>
        {phase === "testing" ? (
          <>
            <p className={styles.disasterChip}>
              <DoomText text={snapshot.disasterLabel} />
            </p>
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
              <p className={styles.timer}>
                <DoomText text={`Surviving: ${formatClock(snapshot.testSeconds)}`} />
              </p>
            </div>
          </>
        ) : phase === "done" && outcome ? (
          <>
            <p className={styles.timer}>
              <DoomText
                text={
                  outcome.collapsed
                    ? `Collapsed at ${formatClock(outcome.survivedS)}`
                    : `Survived ${formatClock(outcome.survivedS)}!`
                }
              />
            </p>
            <p className={styles.piecesLeft}>
              <DoomText text={snapshot.disasterName} />
            </p>
          </>
        ) : (
          <>
            <p className={styles.timer}>
              <DoomText text={statusText(snapshot)} />
            </p>
            <div className={styles.topRight}>
              <p className={styles.piecesLeft}>
                <DoomText text={`Pieces Left: ${piecesLeft} / ${pieces.length}`} />
              </p>
              {phase === "build" && (
                <button
                  type="button"
                  className={styles.startButton}
                  disabled={!pieces.some((p) => p.status === "placed")}
                  onClick={() => session.endBuild()}
                >
                  <DoomText text="Start Early" />
                </button>
              )}
            </div>
          </>
        )}
      </header>

      <div className={styles.buildArea}>
        <HeightRuler
          activeBand={result?.band ?? (phase === "build" ? snapshot.live?.band : undefined)}
          live={phase === "build" ? snapshot.live : null}
        />
        <div className={styles.play}>
          <div className={styles.boardWrap}>
            <BoardCanvas
              canvasRef={canvasRef}
              session={session}
              view={view}
              zoomed={viewMoved}
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
                title="Reset view"
                disabled={!viewMoved}
                onClick={() => view.reset()}
              >
                {zoom.toFixed(1)}x
              </button>
              <button type="button" className={styles.zoomButton} aria-label="Zoom out" onClick={() => view.zoomBy(1 / 1.5)}>
                −
              </button>
              <SoundToggle />
            </div>
          </div>
          {/* Always rendered (empty while testing) so the board never shifts. */}
          <p className={styles.hint}>
            {phase === "build" ? (
              <>
                <DoomText text="Drag a piece onto the platform. It won't fall until you place the next." />
                <br />
                <DoomText text="Scroll to move · Ctrl + scroll or pinch to zoom · Q / E rotate" />

              </>
            ) : !testing ? (
              <>
                <DoomText text="Time's up. Your tower is settling" />
                <br />
                <DoomText text="and its height is the official one." />
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
        <HeldGhost
          held={held}
          local={session.outline(heldMaterialId)}
          materialId={heldMaterialId}
          pxPerMeter={session.pxPerMeter}
          zoom={zoom}
        />
      )}
    </div>
  );
}

interface HeldGhostProps {
  held: Held;
  local: Vec[];
  materialId: string;
  pxPerMeter: number;
  zoom: number;
}

// The off-board drag ghost, at the size the piece will have on the (zoomed) board.
function HeldGhost({ held, local, materialId, pxPerMeter, zoom }: HeldGhostProps) {
  const outline = transformOutline(local, 0, 0, held.angle).map((v) => ({ x: v.x * zoom, y: v.y * zoom }));
  const b = boundsOf(outline);
  // Same transform as the canvas: rotate, meters -> px (with zoom), centroid to the origin.
  const material = getMaterial(materialId);
  const c = shapeCentroid(material.shape);
  const art = material.icon && {
    path: material.icon.path,
    transform: `rotate(${(held.angle * 180) / Math.PI}) scale(${pxPerMeter * zoom}) translate(${-c.x} ${-c.y})`,
  };
  return (
    <PieceSvg
      outline={outline}
      art={art || undefined}
      fill={colors.ink}
      className={styles.ghost}
      style={{
        left: held.pointerClient.x + held.grab.x * zoom + b.minX,
        top: held.pointerClient.y + held.grab.y * zoom + b.minY,
      }}
    />
  );
}
