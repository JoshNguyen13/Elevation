// The board's zoom and pan: a camera over the fixed 400x560 board. View only: the
// physics, hit tests and scoring all stay in board px and never see it. Pieces are
// real-world proportions (a bottle next to an elephant), so zoom is how you place
// the small ones. Panning works at any zoom; BuildPhase maps input to it the way design
// tools do (scroll pans, ctrl + scroll / pinch zooms, Space + drag grabs).
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "./board";
import type { Vec } from "./geometry";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
// How far past the board's edges the view may pan, as a fraction of the visible area,
// so you can move around even at 1x.
export const PAN_MARGIN = 0.25;

export interface ViewSnapshot {
  zoom: number;
  // Board px at the top-left corner of the view.
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export class BoardView {
  private state: ViewSnapshot = { zoom: 1, x: 0, y: 0 };
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private set(zoom: number, x: number, y: number) {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    // The view stays on the board, give or take PAN_MARGIN of empty space around it.
    const w = BOARD_WIDTH_PX / z;
    const h = BOARD_HEIGHT_PX / z;
    const nx = clamp(x, -w * PAN_MARGIN, BOARD_WIDTH_PX - w + w * PAN_MARGIN);
    const ny = clamp(y, -h * PAN_MARGIN, BOARD_HEIGHT_PX - h + h * PAN_MARGIN);
    if (z === this.state.zoom && nx === this.state.x && ny === this.state.y) return;
    this.state = { zoom: z, x: nx, y: ny };
    this.listeners.forEach((listener) => listener());
  }

  // Zoom by `factor`, keeping `boardPoint` under the same spot on screen (like a map).
  zoomAt(boardPoint: Vec, factor: number) {
    const { zoom, x, y } = this.state;
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const fx = (boardPoint.x - x) / (BOARD_WIDTH_PX / zoom);
    const fy = (boardPoint.y - y) / (BOARD_HEIGHT_PX / zoom);
    this.set(next, boardPoint.x - fx * (BOARD_WIDTH_PX / next), boardPoint.y - fy * (BOARD_HEIGHT_PX / next));
  }

  // Zoom toward the middle of what's currently visible (the +/- buttons).
  zoomBy(factor: number) {
    const { zoom, x, y } = this.state;
    this.zoomAt({ x: x + BOARD_WIDTH_PX / zoom / 2, y: y + BOARD_HEIGHT_PX / zoom / 2 }, factor);
  }

  // Move the view by board px (positive = look further right / down).
  panBy(dx: number, dy: number) {
    this.set(this.state.zoom, this.state.x + dx, this.state.y + dy);
  }

  // Like panBy, but only toward board that's out of view, never into the margin past its
  // edge: the auto-pan while a held piece nears the canvas edge.
  revealBy(dx: number, dy: number) {
    const { zoom, x, y } = this.state;
    const maxX = Math.max(x, BOARD_WIDTH_PX - BOARD_WIDTH_PX / zoom);
    const maxY = Math.max(y, BOARD_HEIGHT_PX - BOARD_HEIGHT_PX / zoom);
    this.set(zoom, clamp(x + dx, Math.min(x, 0), maxX), clamp(y + dy, Math.min(y, 0), maxY));
  }

  // Whole board in view, as at the start.
  get isHome() {
    const { zoom, x, y } = this.state;
    return zoom === 1 && x === 0 && y === 0;
  }

  reset() {
    this.set(1, 0, 0);
  }

  // Client (screen) px -> board px. `rect` is the canvas's on-screen rectangle.
  toBoard(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Vec {
    const { zoom, x, y } = this.state;
    return {
      x: x + ((clientX - rect.left) * (BOARD_WIDTH_PX / rect.width)) / zoom,
      y: y + ((clientY - rect.top) * (BOARD_HEIGHT_PX / rect.height)) / zoom,
    };
  }

  // Board px per CSS px on screen, for sizing things drawn outside the canvas.
  get zoom() {
    return this.state.zoom;
  }

  // Board -> canvas bitmap transform (dpr = device pixel ratio).
  applyTo(ctx: CanvasRenderingContext2D, dpr: number) {
    const { zoom, x, y } = this.state;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -x * zoom * dpr, -y * zoom * dpr);
  }
}
