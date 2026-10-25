// Helpers shared by the disaster force models. Physics only: nothing here reads the view.
import type Matter from "matter-js";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_RECT } from "@/lib/game/board";
import { MAX_STACK_PX } from "@/lib/game/dailyScale";
import { MAX_TEST_DURATION_S, PHYSICS_STEP_MS } from "../constants";
import type { PhysicsWorld } from "../world";
import type { Projectile } from "./index";

// Matter turns force into a velocity change of force / mass × step² (px per step).
export const STEP_MS_SQ = PHYSICS_STEP_MS ** 2;
// Matter's default air friction: the share of velocity lost each step.
const AIR_FRICTION = 0.01;

export function verticalExtent(body: Matter.Body) {
  return { top: body.bounds.min.y, bottom: body.bounds.max.y, height: body.bounds.max.y - body.bounds.min.y };
}

// 0 at the platform top, 1 at the max possible height.
export function elevation(body: Matter.Body): number {
  return Math.min(Math.max((PLATFORM_RECT.y - body.position.y) / MAX_STACK_PX, 0), 1);
}

// 0 at the start of the test, 1 at MAX_TEST_DURATION_S. Visual strengths and cue strengths use it.
export const testProgress = (t: number) => Math.min(t / MAX_TEST_DURATION_S, 1);

// The horizontal span and top of what's still standing, or the platform if nothing is.
export function towerSpan(world: PhysicsWorld, pieceUids: readonly string[]) {
  if (pieceUids.length === 0) {
    return { minX: PLATFORM_RECT.x, maxX: PLATFORM_RECT.x + PLATFORM_RECT.width, top: PLATFORM_RECT.y - 40 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let top = PLATFORM_RECT.y;
  for (const uid of pieceUids) {
    const { bounds } = world.body(uid);
    minX = Math.min(minX, bounds.min.x);
    maxX = Math.max(maxX, bounds.max.x);
    top = Math.min(top, bounds.min.y);
  }
  return { minX, maxX, top };
}

export function isOffBoard(body: Matter.Body) {
  const { bounds } = body;
  return bounds.min.y > BOARD_HEIGHT_PX || bounds.max.x < -60 || bounds.min.x > BOARD_WIDTH_PX + 60;
}

// Initial vertical speed (px per step) so a projectile launched horizontally at `speed`
// reaches (dx, dy) under gravity and air friction, the way Matter integrates it.
export function aimVy(dx: number, dy: number, speed: number, gravityPerStep: number): number {
  let x = 0;
  let vx = Math.abs(speed);
  let steps = 0;
  while (x < Math.abs(dx) && steps < 600 && vx > 0.05) {
    vx *= 1 - AIR_FRICTION;
    x += vx;
    steps++;
  }
  // y(steps) is linear in the launch speed: y = vy0 × a + b.
  let a = 0;
  let b = 0;
  let va = 1;
  let vb = 0;
  for (let i = 0; i < steps; i++) {
    va *= 1 - AIR_FRICTION;
    vb = vb * (1 - AIR_FRICTION) + gravityPerStep;
    a += va;
    b += vb;
  }
  return a === 0 ? 0 : (dy - b) / a;
}

// Gravity as a velocity change per step, in px.
export const gravityPerStep = (world: PhysicsWorld) => world.gravityAccel * STEP_MS_SQ;

// Live projectile bodies for drawing. Bodies already removed are skipped.
export function projectilesOf(world: PhysicsWorld | null, uids: readonly { uid: string; radius: number }[]): Projectile[] {
  if (!world) return [];
  const out: Projectile[] = [];
  for (const { uid, radius } of uids) {
    let body: Matter.Body;
    try {
      body = world.body(uid);
    } catch {
      continue;
    }
    out.push({
      uid,
      x: body.position.x,
      y: body.position.y,
      radius,
      angle: body.angle,
      vx: body.velocity.x,
      vy: body.velocity.y,
    });
  }
  return out;
}
