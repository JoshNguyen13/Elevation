import Matter from "matter-js";
import type { Material } from "@/data/materials";
import { PLATFORM_RECT } from "@/lib/game/board";
import type { Vec } from "@/lib/game/geometry";
import {
  FRICTION_STATIC,
  PLATFORM_CORNER_RADIUS_PX,
  POSITION_ITERATIONS,
  RESTITUTION,
  VELOCITY_ITERATIONS,
} from "./constants";

export interface Impact {
  x: number;
  y: number;
  speed: number;
  labels: [string, string];
}

// Centroid in board px + clockwise rotation in radians.
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

function createPlatform(): Matter.Body {
  const { x, y, width, height } = PLATFORM_RECT;
  return Matter.Bodies.rectangle(x + width / 2, y + height / 2, width, height, {
    isStatic: true,
    label: "platform",
    restitution: RESTITUTION,
    chamfer: { radius: PLATFORM_CORNER_RADIUS_PX },
  });
}

// The Matter.js world, in pixel space. It knows nothing about game rules
// (freeze order, the tray, disasters) — BuildSession drives it.
export class PhysicsWorld {
  readonly engine: Matter.Engine;
  private readonly bodies = new Map<string, Matter.Body>();
  // New contacts since the last drain, for sound / particles only (never fed back).
  private impacts: Impact[] = [];

  // gravityPxPerS2: downward gravity in board px/s² (dayGravity() for the day's scale).
  constructor(gravityPxPerS2: number) {
    this.engine = Matter.Engine.create({
      // Matter multiplies gravity.y by gravity.scale (0.001 px/ms² = 1000 px/s²).
      gravity: { x: 0, y: gravityPxPerS2 / 1000 },
      positionIterations: POSITION_ITERATIONS,
      velocityIterations: VELOCITY_ITERATIONS,
    });
    Matter.Composite.add(this.engine.world, createPlatform());
    Matter.Events.on(this.engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB, collision } = pair;
        const rvx = bodyA.velocity.x - bodyB.velocity.x;
        const rvy = bodyA.velocity.y - bodyB.velocity.y;
        // Closing speed along the contact normal, in px per step.
        const speed = Math.abs(rvx * collision.normal.x + rvy * collision.normal.y);
        const at = collision.supports?.[0] ?? {
          x: (bodyA.position.x + bodyB.position.x) / 2,
          y: (bodyA.position.y + bodyB.position.y) / 2,
        };
        if (this.impacts.length < 100) {
          this.impacts.push({ x: at.x, y: at.y, speed, labels: [bodyA.label, bodyB.label] });
        }
      }
    });
  }

  drainImpacts(): Impact[] {
    const impacts = this.impacts;
    this.impacts = [];
    return impacts;
  }

  // outline: centroid-centered px vertices from shapeOutline(), so the hitbox matches the drawing.
  addPiece(uid: string, material: Material, outline: Vec[], pose: Pose, frozen: boolean) {
    const body = Matter.Bodies.fromVertices(pose.x, pose.y, [outline.map((v) => ({ ...v }))], {
      label: uid,
      friction: material.friction,
      frictionStatic: FRICTION_STATIC,
      restitution: RESTITUTION,
    });
    // Mass before freezing: setStatic() stores mass/friction and restores them on unfreeze.
    Matter.Body.setMass(body, material.mass);
    Matter.Body.setAngle(body, pose.angle);
    if (frozen) Matter.Body.setStatic(body, true);
    Matter.Composite.add(this.engine.world, body);
    this.bodies.set(uid, body);
  }

  removePiece(uid: string) {
    const body = this.bodies.get(uid);
    if (!body) return;
    Matter.Composite.remove(this.engine.world, body);
    this.bodies.delete(uid);
  }

  // Frozen = static: weightless and immovable, but still collidable (§4.3).
  setFrozen(uid: string, frozen: boolean) {
    const body = this.body(uid);
    Matter.Body.setStatic(body, frozen);
    if (!frozen) {
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
    }
  }

  setAngle(uid: string, angle: number) {
    Matter.Body.setAngle(this.body(uid), angle);
  }

  pose(uid: string): Pose {
    const { position, angle } = this.body(uid);
    return { x: position.x, y: position.y, angle };
  }

  vertices(uid: string): Vec[] {
    return this.body(uid).vertices.map(({ x, y }) => ({ x, y }));
  }

  // A disaster projectile (§4.10 meteor). Not a piece: never scored or picked up.
  addMeteor(uid: string, x: number, y: number, radius: number, mass: number, velocity: Vec) {
    const body = Matter.Bodies.circle(x, y, radius, {
      label: uid,
      friction: 0.3,
      restitution: RESTITUTION,
    });
    Matter.Body.setMass(body, mass);
    Matter.Body.setVelocity(body, velocity);
    Matter.Composite.add(this.engine.world, body);
    this.bodies.set(uid, body);
  }

  // Matter accumulates forces until the next step(), then clears them.
  applyForce(uid: string, force: Vec) {
    const body = this.body(uid);
    Matter.Body.applyForce(body, body.position, force);
  }

  // Gravity as Matter applies it: weight = mass × gravityAccel. Disaster forces are scaled by it.
  get gravityAccel(): number {
    return this.engine.gravity.y * this.engine.gravity.scale;
  }

  step(deltaMs: number) {
    Matter.Engine.update(this.engine, deltaMs);
  }

  body(uid: string): Matter.Body {
    const body = this.bodies.get(uid);
    if (!body) throw new Error(`No body for piece ${uid}`);
    return body;
  }
}
