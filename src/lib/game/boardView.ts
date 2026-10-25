// The board's zoom and pan: a camera over the fixed 400x560 board. View only: the
// physics, hit tests and scoring all stay in board px and never see it. Pieces are
// real-world proportions (a bottle next to an elephant), so zoom is how you place
// the small ones.
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX } from "./board";
import type { Vec } from "./geometry";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

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
    // The view can't leave the board.
    const nx = clamp(x, 0, BOARD_WIDTH_PX - BOARD_WIDTH_PX / z);
    const ny = clamp(y, 0, BOARD_HEIGHT_PX - BOARD_HEIGHT_PX / z);
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
