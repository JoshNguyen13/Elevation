// Giant cat: a paw swats the tower sideways, again and again, reaching deeper and
// coming faster over time. Each swat winds up (the paw peeks in at the board edge, the
// warning), strikes through the tower, holds, then pulls back off the board.
// The paw is one heavy body steered toward its target by forces (speed-capped), with
// gravity cancelled, so it really shoves what it hits.
import { BOARD_WIDTH_PX, PLATFORM_RECT } from "@/lib/game/board";
import type { PhysicsWorld } from "../world";
import type { Disaster } from "./index";
import { DISASTER_NAMES } from "./names";
import { STEP_MS_SQ, projectilesOf, testProgress, towerSpan } from "./shared";

const CAT = {
  pawRadiusPx: 20,
  pawMass: 12,
  // The first swat winds up right away; later gaps shrink over time.
  baseIntervalS: 5.5,
  minIntervalS: 2.4,
  intervalShrinkPerS: 0.045,
  windupS: 0.7,
  strikeS: 0.3,
  holdS: 0.15,
  retractS: 0.6,
  // How far past the tower's near edge the strike aims, px: a graze at first, deeper later.
  baseReachPx: 6,
  reachPerS: 0.9,
  // The paw heads for its target at up to this speed (px per step); a strike's speed is how
  // hard it lands, and grows over time. Moving into place (windup, retract) is quicker.
  baseStrikeSpeed: 2.5,
  strikeSpeedPerS: 0.1,
  moveSpeed: 7,
  // How fast it closes on the target (per step), and how fast it reaches the wanted speed.
  approach: 0.15,
  response: 0.5,
  maxAccel: 2,
};

type Stage = "idle" | "windup" | "strike" | "retract";

const PAW_UID = "meteor-paw";

export function createCat(side: 1 | -1, rng: () => number): Disaster {
  const r = CAT.pawRadiusPx;
  // Off-board rest and the "peeking in" spot, on the side it swats from.
  const restX = side > 0 ? -2.5 * r : BOARD_WIDTH_PX + 2.5 * r;
  const peekX = side > 0 ? r * 0.2 : BOARD_WIDTH_PX - r * 0.2;
  const lowestY = PLATFORM_RECT.y - r - 3;
  let world: PhysicsWorld | null = null;
  let spawned = false;
  let stage: Stage = "idle";
  let stageAt = 0;
  let nextAt = 0;
  let count = 0;
  let swatY = lowestY;
  let strikeX = peekX;
  let strength = 0;
  return {
    type: "cat",
    name: DISASTER_NAMES.cat,
    label: "⚠ Giant Cat — Swatting",
    side,
    apply(step) {
      const { pieceUids, t, cue } = step;
      world = step.world;
      strength = 0.3 + 0.7 * testProgress(t);
      const span = towerSpan(world, pieceUids);
      const highestY = Math.min(lowestY, span.top + r);

      if (stage === "idle" && t >= nextAt) {
        // The first swat hits a third of the way down the tower; later ones pick a height (one rng call).
        swatY = count === 0 ? highestY + (lowestY - highestY) / 3 : highestY + rng() * (lowestY - highestY);
        count++;
        stage = "windup";
        stageAt = t;
      }
      if (!spawned) {
        world.addMeteor(PAW_UID, restX, swatY, r, CAT.pawMass, { x: 0, y: 0 });
        spawned = true;
      }
      const since = t - stageAt;
      if (stage === "windup" && since >= CAT.windupS) {
        const reach = CAT.baseReachPx + CAT.reachPerS * t;
        strikeX = side > 0 ? span.minX + reach : span.maxX - reach;
        stage = "strike";
        stageAt = t;
        cue("swat", { x: peekX, y: swatY, strength });
      } else if (stage === "strike" && since >= CAT.strikeS + CAT.holdS) {
        stage = "retract";
        stageAt = t;
      } else if (stage === "retract" && since >= CAT.retractS) {
        stage = "idle";
        nextAt = t + Math.max(CAT.minIntervalS, CAT.baseIntervalS - CAT.intervalShrinkPerS * t) - CAT.windupS;
      }

      const target = { x: stage === "windup" ? peekX : stage === "strike" ? strikeX : restX, y: swatY };
      const paw = world.body(PAW_UID);
      const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
      const maxSpeed = stage === "strike" ? CAT.baseStrikeSpeed + CAT.strikeSpeedPerS * t : CAT.moveSpeed;
      // Steer toward the speed that closes on the target, capped at maxSpeed.
      const wantX = clamp(CAT.approach * (target.x - paw.position.x), maxSpeed);
      const wantY = clamp(CAT.approach * (target.y - paw.position.y), CAT.moveSpeed);
      const ax = clamp(CAT.response * (wantX - paw.velocity.x), CAT.maxAccel);
      const ay = clamp(CAT.response * (wantY - paw.velocity.y), CAT.maxAccel);
      world.applyForce(PAW_UID, {
        x: (paw.mass * ax) / STEP_MS_SQ,
        y: (paw.mass * ay) / STEP_MS_SQ - paw.mass * world.gravityAccel,
      });
    },
    end(endWorld) {
      if (spawned) endWorld.removePiece(PAW_UID);
      spawned = false;
    },
    view: () => ({
      type: "cat",
      strength,
      paw: spawned ? (projectilesOf(world, [{ uid: PAW_UID, radius: r }])[0] ?? null) : null,
      stage,
      swatY,
    }),
    extraBodyUids: () => (spawned ? [PAW_UID] : []),
    visualShake: () => 0,
  };
}
