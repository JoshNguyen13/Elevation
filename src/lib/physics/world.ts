import Matter from "matter-js";
import {
  CANVAS_HEIGHT_M,
  CANVAS_WIDTH_M,
  GRAVITY_Y,
  PLATFORM_CORNER_RADIUS_PX,
  RESTITUTION,
  toPx,
} from "./constants";
import { PLATFORM_RECT } from "@/lib/game/board";
import { colors } from "@/lib/theme";

export interface PhysicsWorld {
  engine: Matter.Engine;
  platform: Matter.Body;
  destroy: () => void;
}

export function createPlatform(): Matter.Body {
  const { x, y, width, height } = PLATFORM_RECT;

  return Matter.Bodies.rectangle(x + width / 2, y + height / 2, width, height, {
    isStatic: true,
    label: "platform",
    restitution: RESTITUTION,
    chamfer: { radius: PLATFORM_CORNER_RADIUS_PX },
    render: { fillStyle: colors.platform, lineWidth: 0 },
  });
}

export function createPhysicsWorld(canvas: HTMLCanvasElement): PhysicsWorld {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: GRAVITY_Y } });

  const render = Matter.Render.create({
    canvas,
    engine,
    options: {
      width: toPx(CANVAS_WIDTH_M),
      height: toPx(CANVAS_HEIGHT_M),
      pixelRatio: window.devicePixelRatio || 1,
      background: colors.background,
      wireframes: false,
    },
  });

  const platform = createPlatform();
  Matter.Composite.add(engine.world, platform);

  const runner = Matter.Runner.create();
  Matter.Runner.run(runner, engine);
  Matter.Render.run(render);

  return {
    engine,
    platform,
    destroy() {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    },
  };
}
