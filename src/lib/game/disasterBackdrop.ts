// The page backdrop: the day's disaster approaching from far away while you build
// (disasters track). A volcano that erupts harder, a fat guy walking closer, a funnel
// growing on the horizon, a cat rising over the page edge, trees bending, the ground
// cracking. During the settle + height reveal the "final approach" brings the first hit
// to the board's edge, where the real disaster body takes over at the start of the test.
//
// View only: it reads BuildSession.buildUp() and the disaster's view(), and never writes
// back. Math.random is fine here (it's not physics). Drawn in screen (CSS) px.
import type { DisasterBuildUp, DisasterView } from "@/lib/physics/disasters";
import { colors } from "@/lib/theme";
import { BOARD_HEIGHT_PX, BOARD_WIDTH_PX, PLATFORM_RECT } from "./board";
import { FX, drawFatGuy, drawFatGuyStanding, drawFireball, drawFunnel, drawPaw } from "./disasterArt";

export interface BackdropFrame {
  // Viewport, CSS px.
  width: number;
  height: number;
  // The board canvas on screen, CSS px.
  board: { left: number; top: number; width: number; height: number };
  up: DisasterBuildUp;
  // 0–1: how close the disaster is (1 from the test on).
  approach: number;
  // 0–1 fade-out after the test ends.
  fade: number;
  view: DisasterView | null;
  now: number;
  dt: number;
}

// What the letters on the page should do this frame (doomLetters.ts).
export interface LetterPulses {
  // Fat guy footsteps / landings: 0–1 envelope since the last stomp, and how big it was.
  hop: number;
  hopAmp: number;
  // Wind gust 0–1, and the one big "blown away" moment as the test starts (0–1 envelope).
  gust: number;
  blow: number;
  // Earthquake sway, -1–1.
  sway: number;
  // Letters the cat is batting right now: index into the page's letters, start time, direction.
  swats: { index: number; at: number; dir: 1 | -1 }[];
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
}

// Board constants the hand-off aims at (the first hit of each disaster, see disasters/).
const FIRST_METEOR_RADIUS_PX = 8;
const FIRST_GUY_RADIUS_PX = 15;
const PAW_RADIUS_PX = 20;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const hash = (i: number, salt = 0) => {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export class Backdrop {
  private smoke: Mote[] = [];
  private embers: Mote[] = [];
  private dust: Mote[] = [];
  private flyerTrail: { x: number; y: number }[] = [];
  private stride = 0;
  private lastStompAt = -Infinity;
  private stompAmp = 0;
  private blowAt = -Infinity;
  private lastStage: DisasterBuildUp["stage"] | null = null;
  private lastCatStage: string | null = null;
  private swats: LetterPulses["swats"] = [];
  private spin = 0;
  private lastGuyCount = 0;
  private endApproach = 0;

  // Draws the frame on `back` (behind the page) and `front` (over it, for things in flight)
  // and returns what the letters should do. `letters` is how many animated letters there are.
  draw(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, f: BackdropFrame, letters: number): LetterPulses {
    const { up } = f;
    if (up.stage === "testing" && this.lastStage !== "testing") this.blowAt = f.now;
    this.lastStage = up.stage;
    const dtS = Math.min(f.dt, 50) / 1000;

    back.clearRect(0, 0, f.width, f.height);
    front.clearRect(0, 0, f.width, f.height);
    back.globalAlpha = f.fade;
    front.globalAlpha = f.fade;
    const pulses: LetterPulses = { hop: 0, hopAmp: 0, gust: 0, blow: 0, sway: 0, swats: this.swats };

    this.drawGround(back, f);
    switch (up.disaster.type) {
      case "meteor":
        this.meteor(back, front, f, dtS);
        break;
      case "fat-guy":
        this.fatGuy(back, front, f, dtS);
        break;
      case "tornado":
        this.tornado(back, front, f, dtS);
        break;
      case "cat":
        this.cat(back, front, f, letters);
        break;
      case "wind":
        pulses.gust = this.wind(back, front, f);
        break;
      case "earthquake":
        pulses.sway = this.quake(back, f, dtS);
        break;
    }
    this.updateMotes(this.dust, dtS, 0);
    this.drawMotes(back, this.dust, FX.dust, 0.5);

    const sinceStomp = (f.now - this.lastStompAt) / 1000;
    pulses.hop = sinceStomp < 0.5 ? Math.sin((sinceStomp / 0.5) * Math.PI) : 0;
    pulses.hopAmp = this.stompAmp;
    pulses.blow = blowEnvelope((f.now - this.blowAt) / 1000);
    this.swats = this.swats.filter((s) => f.now - s.at < 1200);
    pulses.swats = this.swats;
    back.globalAlpha = 1;
    front.globalAlpha = 1;
    return pulses;
  }

  // --- Layout ---------------------------------------------------------------

  private toScreen(f: BackdropFrame, x: number, y: number) {
    return { x: f.board.left + (x * f.board.width) / BOARD_WIDTH_PX, y: f.board.top + (y * f.board.height) / BOARD_HEIGHT_PX };
  }

  private scale(f: BackdropFrame) {
    return f.board.width / BOARD_WIDTH_PX;
  }

  private horizonY(f: BackdropFrame) {
    return this.toScreen(f, 0, PLATFORM_RECT.y).y;
  }

  // The open space beside the board on the side a disaster comes from (left of the
  // ruler, or right of the zoom controls), and where in it things stand.
  private region(f: BackdropFrame) {
    const from = -f.up.disaster.side;
    const left = { min: 0, max: Math.max(120, f.board.left - 200) };
    const right = { min: Math.min(f.width - 120, f.board.left + f.board.width + 80), max: f.width };
    const r = from < 0 ? left : right;
    return {
      from,
      center: (r.min + r.max) / 2,
      far: from < 0 ? r.min + 70 : r.max - 70,
      near: from < 0 ? r.max - 40 : r.min + 40,
      width: r.max - r.min,
      // The board edge the disaster enters by.
      edgeX: from < 0 ? f.board.left : f.board.left + f.board.width,
    };
  }

  // Faint distant hills and a horizon line at the platform's height.
  private drawGround(ctx: CanvasRenderingContext2D, f: BackdropFrame) {
    const y = this.horizonY(f);
    const a = clamp01(0.25 + f.approach);
    ctx.save();
    ctx.globalAlpha *= 0.55 * a;
    ctx.fillStyle = colors.fillMuted;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= f.width; x += 24) {
      ctx.lineTo(x, y - 18 - 14 * Math.sin(x / 140) - 10 * Math.sin(x / 57 + 1));
    }
    ctx.lineTo(f.width, y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = f.fade * 0.8 * a;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(f.width, y);
    ctx.stroke();
    ctx.restore();
  }

  // --- Meteor: a volcano erupting harder, then a fireball arcs onto the board ----------

  private meteor(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, f: BackdropFrame, dtS: number) {
    const a = f.approach;
    const region = this.region(f);
    const ground = this.horizonY(f);
    const s = Math.min(1, region.width / 380) * (0.6 + 0.4 * a);
    const vx = region.center;
    const craterY = ground - 150 * s;

    // A warm sky.
    const sky = back.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, `rgba(255, 138, 61, ${0.13 * a})`);
    sky.addColorStop(1, "rgba(255, 138, 61, 0)");
    back.fillStyle = sky;
    back.fillRect(0, 0, f.width, ground);

    // Smoke, then the cone over it, then the glow in the crater.
    if (Math.random() < dtS * (1 + 6 * a)) {
      this.smoke.push(mote(vx + (Math.random() - 0.5) * 16 * s, craterY, (Math.random() - 0.5) * 12, -(14 + 26 * a), 6, 7 * s));
    }
    this.updateMotes(this.smoke, dtS, 0, 4 * s);
    this.drawMotes(back, this.smoke, FX.smoke, 0.45);
    back.save();
    back.fillStyle = "#e3dfdb";
    back.strokeStyle = colors.border;
    back.beginPath();
    back.moveTo(vx - 170 * s, ground);
    back.lineTo(vx - 26 * s, craterY);
    back.lineTo(vx + 26 * s, craterY);
    back.lineTo(vx + 170 * s, ground);
    back.closePath();
    back.fill();
    back.stroke();
    const glow = back.createRadialGradient(vx, craterY, 0, vx, craterY, 60 * s);
    glow.addColorStop(0, `rgba(255, 138, 61, ${0.3 + 0.6 * a})`);
    glow.addColorStop(1, "rgba(255, 138, 61, 0)");
    back.fillStyle = glow;
    back.beginPath();
    back.arc(vx, craterY, 60 * s, 0, Math.PI * 2);
    back.fill();
    // Lava running down the near side, longer as it gets angrier.
    back.strokeStyle = FX.fire;
    back.lineWidth = 3 * s;
    back.globalAlpha *= 0.4 + 0.5 * a;
    back.beginPath();
    back.moveTo(vx + 8 * s, craterY);
    back.quadraticCurveTo(vx + 30 * s, craterY + 60 * s * a, vx + 50 * s, craterY + 120 * s * a);
    back.stroke();
    back.restore();

    // Embers thrown out of the crater, more and higher over time.
    const rate = f.up.stage === "testing" ? 6 : 0.3 + 5 * a * a;
    if (Math.random() < dtS * rate) {
      const dir = Math.random() < 0.7 ? -region.from : region.from;
      this.embers.push(mote(vx, craterY, dir * (20 + 60 * Math.random()), -(70 + 150 * a * Math.random()), 2.5, 1.2 + 2 * Math.random()));
    }
    this.updateMotes(this.embers, dtS, 120);
    this.drawMotes(back, this.embers, FX.fire, 1);

    // The final approach: one big fireball from the crater to the board edge.
    if (f.up.stage === "final") {
      const target = this.firstMeteorEntry(f);
      const u = easeInOut(f.up.final);
      const p0 = { x: vx, y: craterY };
      const c = { x: (vx + target.x) / 2, y: Math.min(craterY, target.y) - 220 };
      const x = (1 - u) ** 2 * p0.x + 2 * (1 - u) * u * c.x + u * u * target.x;
      const y = (1 - u) ** 2 * p0.y + 2 * (1 - u) * u * c.y + u * u * target.y;
      this.flyerTrail.push({ x, y });
      if (this.flyerTrail.length > 18) this.flyerTrail.shift();
      drawFireball(front, x, y, lerp(5, FIRST_METEOR_RADIUS_PX * this.scale(f) * 1.4, u), this.flyerTrail);
    } else {
      this.flyerTrail = [];
    }
  }

  // Where the first meteor enters the board (same aim as disasters/meteor.ts).
  private firstMeteorEntry(f: BackdropFrame) {
    const { tower, disaster } = f.up;
    const top = tower?.top ?? PLATFORM_RECT.y - 120;
    const targetY = top + (PLATFORM_RECT.y - top) / 3;
    const y = Math.min(Math.max(targetY - 50, 24), PLATFORM_RECT.y - 12);
    return this.toScreen(f, disaster.side > 0 ? 0 : BOARD_WIDTH_PX, y);
  }

  // --- Fat guy: walking closer (every step shakes the letters), then a cannonball ---------

  private fatGuy(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, f: BackdropFrame, dtS: number) {
    const a = f.approach;
    const region = this.region(f);
    const ground = this.horizonY(f);
    const towerX = this.toScreen(f, f.up.tower?.cx ?? BOARD_WIDTH_PX / 2, 0).x;
    const walkK = this.approachAtEnd(f);
    const x = lerp(region.far, region.near, walkK);
    const h = lerp(26, Math.min(170, region.width * 0.5), walkK ** 1.2);

    if (f.up.stage === "build") {
      // Footsteps: faster as he gets closer. Each one is a stomp the letters feel.
      const before = Math.floor(this.stride / Math.PI);
      this.stride += dtS * Math.PI * lerp(0.9, 2.6, a);
      if (Math.floor(this.stride / Math.PI) !== before) {
        this.lastStompAt = f.now;
        this.stompAmp = 0.15 + 0.85 * a * a;
        if (a > 0.25) this.dust.push(mote(x, ground, (Math.random() - 0.5) * 30, -12, 0.8, 3 + 5 * a));
      }
      shadow(back, x, ground, h * 0.35);
      drawFatGuyStanding(back, x, ground, h, Math.sin(this.stride));
    } else if (f.up.stage === "final") {
      // Crouch, leap off the top of the screen, then drop onto the tower as a cannonball.
      const k = f.up.final;
      if (k < 0.15) {
        shadow(back, x, ground, h * 0.35);
        drawFatGuyStanding(back, x, ground + h * 0.08 * (k / 0.15), h * (1 - 0.1 * (k / 0.15)), 0);
      } else if (k < 0.6) {
        const u = (k - 0.15) / 0.45;
        const px = lerp(x, towerX, u);
        const py = lerp(ground - h * 0.4, -h, u) - Math.sin(u * Math.PI) * 120;
        drawFatGuy(front, px, py, h * 0.32, u * Math.PI * 2);
      } else {
        const u = easeInOut((k - 0.6) / 0.4);
        const r = lerp(h * 0.32, FIRST_GUY_RADIUS_PX * this.scale(f), u);
        drawFatGuy(front, towerX, lerp(-r * 2, f.board.top - r * 0.6, u), r, 0);
      }
    } else {
      // The test: his buddies line up on the horizon for their turn.
      this.stride += dtS * Math.PI * 1.5;
      for (let i = 0; i < 3; i++) {
        drawFatGuyStanding(back, region.center + (i - 1) * 34, ground, 28, Math.sin(this.stride + i));
      }
      // A landing on the board shakes the letters too.
      const guys = f.view?.type === "fat-guy" ? f.view.guys.length : 0;
      if (guys > this.lastGuyCount) {
        this.lastStompAt = f.now + 350;
        this.stompAmp = 1;
      }
      this.lastGuyCount = guys;
    }
  }

  // How close it had got when the build ended (the final approach starts from there).
  // Call it every frame: during the build it tracks the live approach.
  private approachAtEnd(f: BackdropFrame) {
    if (f.up.stage === "build") this.endApproach = f.approach;
    return this.endApproach;
  }

  // --- Tornado: a funnel growing on the horizon, then it slides onto the board ----------

  private tornado(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, f: BackdropFrame, dtS: number) {
    const a = f.approach;
    const region = this.region(f);
    const ground = this.horizonY(f);
    this.spin += dtS * (4 + 10 * a);

    // Dark clouds gathering along the top.
    back.save();
    back.fillStyle = colors.tick;
    for (let i = 0; i < 9; i++) {
      back.globalAlpha = f.fade * 0.16 * a;
      const cx = ((hash(i, 1) * f.width + f.now * 0.01 * (0.5 + hash(i, 2))) % (f.width + 300)) - 150;
      back.beginPath();
      back.ellipse(cx, 30 + hash(i, 3) * 60, 120 + 80 * hash(i, 4), 26, 0, 0, Math.PI * 2);
      back.fill();
    }
    back.restore();

    const startK = this.approachAtEnd(f);
    if (f.up.stage === "build") {
      const x = lerp(region.far, region.near, a);
      const h = lerp(70, Math.min(360, ground - 40), a);
      this.funnelWithDust(back, x, ground, h, h * 0.6, f.fade * (0.3 + 0.5 * a), dtS);
    } else if (f.up.stage === "final") {
      const u = easeInOut(f.up.final);
      const x = lerp(lerp(region.far, region.near, startK), region.edgeX, u);
      const h = lerp(lerp(70, Math.min(360, ground - 40), startK), f.board.height * 0.95, u);
      this.funnelWithDust(front, x, ground, h, h * 0.6, f.fade * 0.8, dtS);
    }
  }

  private funnelWithDust(ctx: CanvasRenderingContext2D, x: number, ground: number, h: number, w: number, alpha: number, dtS: number) {
    if (Math.random() < dtS * 14) {
      this.dust.push(mote(x + (Math.random() - 0.5) * w * 0.3, ground, (Math.random() - 0.5) * 80, -10 - 30 * Math.random(), 1, 3 + 4 * Math.random()));
    }
    drawFunnel(ctx, x, ground, h, w, this.spin, alpha);
  }

  // --- Cat: rising over the page edge, eyes on your tower, batting letters ----------------

  private cat(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, f: BackdropFrame, letters: number) {
    const a = f.approach;
    const region = this.region(f);
    const R = Math.min(170, region.width * 0.42);
    const cx = region.center;
    const rise = lerp(-0.15, 1.3, a) * R;
    const cy = f.height + R * 0.95 - rise;
    const look = this.toScreen(f, f.up.tower?.cx ?? BOARD_WIDTH_PX / 2, f.up.tower?.top ?? PLATFORM_RECT.y - 100);

    // Tail, swishing faster and wider as it gets keen.
    back.save();
    back.lineCap = "round";
    const swish = Math.sin(f.now * 0.0015 * (1 + 2 * a)) * R * 0.7 * (0.3 + a);
    const baseX = cx - region.from * R * 1.05;
    back.strokeStyle = colors.ink;
    back.lineWidth = R * 0.24 + 3;
    back.beginPath();
    back.moveTo(baseX, f.height + 10);
    back.quadraticCurveTo(baseX - region.from * R * 0.3, cy, baseX + swish, cy - R * 0.4);
    back.stroke();
    back.strokeStyle = FX.fur;
    back.lineWidth = R * 0.24;
    back.stroke();
    back.restore();

    drawCatHead(back, cx, cy, R, look, f.now, a);

    // Batting letters: rarely at first, constantly at the end.
    if (letters > 0 && f.up.stage !== "done") {
      const rate = f.up.stage === "testing" ? 0.6 : 0.15 + 3 * a * a;
      if (Math.random() < (f.dt / 1000) * rate) {
        this.swats.push({ index: Math.floor(Math.random() * letters), at: f.now, dir: Math.random() < 0.5 ? 1 : -1 });
      }
    }
    // On each real swat, the paw takes a row of letters with it.
    const stage = f.view?.type === "cat" ? f.view.stage : null;
    if (stage === "strike" && this.lastCatStage !== "strike" && letters > 0) {
      const start = Math.floor(Math.random() * letters);
      for (let i = 0; i < 8; i++) this.swats.push({ index: (start + i) % letters, at: f.now + i * 30, dir: f.up.disaster.side });
    }
    this.lastCatStage = stage;

    // The final approach: a paw rises from the bottom toward the board edge.
    if (f.up.stage === "final") {
      const u = easeInOut(f.up.final);
      const { tower } = f.up;
      const lowest = PLATFORM_RECT.y - PAW_RADIUS_PX - 3;
      const highest = Math.min(lowest, (tower?.top ?? lowest - 90) + PAW_RADIUS_PX);
      const target = this.toScreen(f, f.up.disaster.side > 0 ? 0 : BOARD_WIDTH_PX, highest + (lowest - highest) / 3);
      const r = PAW_RADIUS_PX * this.scale(f) * 1.1;
      const x = lerp(region.near, target.x - region.from * -r * 0.2, u);
      const y = lerp(f.height + r * 2, target.y, u);
      drawPaw(front, x, y, r, x + region.from * 140, 0);
    }
  }

  // --- Wind: trees bending, streaks and leaves across the page --------------------------

  private wind(back: CanvasRenderingContext2D, front: CanvasRenderingContext2D, f: BackdropFrame): number {
    const a = f.approach;
    const side = f.up.disaster.side;
    const ground = this.horizonY(f);
    const gust =
      f.view?.type === "wind" ? f.view.gust : a * clamp01(0.45 + 0.4 * Math.sin(f.now / 1500) + 0.25 * Math.sin(f.now / 530));

    // A row of trees each side of the board, bending downwind.
    back.save();
    back.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const leftSide = i < 6;
      const span = leftSide ? Math.max(120, f.board.left - 200) : f.width - (f.board.left + f.board.width + 80);
      const x0 = leftSide ? 0 : f.board.left + f.board.width + 80;
      const x = x0 + ((i % 6) + 0.5) * (span / 6);
      const h = 40 + 30 * hash(i, 5);
      const bend = side * (0.08 + 0.5 * a * (0.5 + 0.5 * gust)) * (1 + 0.15 * Math.sin(f.now * 0.004 + i));
      const tipX = x + Math.sin(bend) * h;
      const tipY = ground - Math.cos(bend) * h;
      back.strokeStyle = colors.tick;
      back.lineWidth = 3;
      back.beginPath();
      back.moveTo(x, ground);
      back.quadraticCurveTo(x, ground - h * 0.5, tipX, tipY);
      back.stroke();
      back.fillStyle = colors.fillMuted;
      back.beginPath();
      back.ellipse(tipX + side * 6 * a, tipY, 15, 12, bend, 0, Math.PI * 2);
      back.fill();
    }
    back.restore();

    // Streaks and leaves over the page, never over the board.
    front.save();
    front.beginPath();
    front.rect(0, 0, f.width, f.height);
    front.rect(f.board.left, f.board.top, f.board.width, f.board.height);
    front.clip("evenodd");
    const span = f.width + 300;
    const streaks = Math.round(6 + 70 * a);
    front.lineCap = "round";
    for (let i = 0; i < streaks; i++) {
      const speed = 0.4 + 0.6 * hash(i, 1) + gust * 0.6;
      const travel = (f.now * speed + hash(i, 2) * span) % span;
      const x = side > 0 ? travel - 150 : f.width + 150 - travel;
      const y = hash(i, 3) * f.height;
      const len = 30 + 90 * hash(i, 4) * (0.4 + a);
      front.globalAlpha = f.fade * (0.08 + 0.3 * a * hash(i, 5));
      front.strokeStyle = colors.textMuted;
      front.lineWidth = 1 + hash(i, 6);
      front.beginPath();
      front.moveTo(x, y);
      front.lineTo(x - side * len, y + Math.sin(f.now * 0.003 + i) * 3);
      front.stroke();
    }
    const leaves = Math.round(1 + 24 * a * a);
    front.fillStyle = FX.leaf;
    for (let i = 0; i < leaves; i++) {
      const speed = 0.25 + 0.3 * hash(i, 7) + gust * 0.3;
      const travel = (f.now * speed + hash(i, 8) * span) % span;
      const x = side > 0 ? travel - 150 : f.width + 150 - travel;
      const y = hash(i, 9) * f.height + Math.sin(f.now * 0.003 + i * 2) * 20;
      front.globalAlpha = f.fade * 0.85;
      front.beginPath();
      front.ellipse(x, y, 5, 2.5, f.now * 0.01 + i, 0, Math.PI * 2);
      front.fill();
    }
    front.restore();
    return gust;
  }

  // --- Earthquake: buildings swaying, cracks running out from under the board --------------

  private quake(back: CanvasRenderingContext2D, f: BackdropFrame, dtS: number): number {
    const a = f.approach;
    const sway = f.view?.type === "earthquake" ? f.view.sway : Math.sin(f.now * 0.012 * (1 + a)) * a * a * 0.5;
    const ground = this.horizonY(f) + sway * 4;

    back.save();
    for (let i = 0; i < 10; i++) {
      const leftSide = i < 5;
      const span = leftSide ? Math.max(120, f.board.left - 200) : f.width - (f.board.left + f.board.width + 80);
      const x0 = leftSide ? 0 : f.board.left + f.board.width + 80;
      const w = 26 + 30 * hash(i, 1);
      const h = 50 + 90 * hash(i, 2);
      const x = x0 + ((i % 5) + 0.5) * (span / 5);
      back.save();
      back.translate(x, ground);
      back.rotate((sway * 0.08 + Math.sin(f.now * 0.006 + i) * 0.02 * a) * (0.6 + hash(i, 3)));
      back.fillStyle = colors.fillMuted;
      back.strokeStyle = colors.border;
      back.fillRect(-w / 2, -h, w, h);
      back.strokeRect(-w / 2, -h, w, h);
      back.fillStyle = colors.border;
      for (let wy = 10; wy < h - 8; wy += 14) {
        for (let wx = -w / 2 + 6; wx < w / 2 - 6; wx += 10) back.fillRect(wx, -h + wy, 4, 5);
      }
      back.restore();
    }

    // Cracks running out along the ground from both sides of the board.
    back.strokeStyle = colors.inkSoft;
    back.lineWidth = 1.4;
    back.globalAlpha = f.fade * 0.55;
    for (const dir of [-1, 1]) {
      const startX = dir < 0 ? f.board.left - 10 : f.board.left + f.board.width + 10;
      const length = a * (dir < 0 ? startX : f.width - startX);
      let x = startX;
      let y = ground + 2;
      back.beginPath();
      back.moveTo(x, y);
      for (let s = 0; Math.abs(x - startX) < length; s++) {
        x += dir * (14 + 10 * hash(s, dir + 5));
        y = ground + 2 + (hash(s, dir + 7) - 0.3) * 8;
        back.lineTo(x, y);
      }
      back.stroke();
    }
    back.restore();

    if (Math.random() < dtS * 8 * a * a) {
      const x = Math.random() < 0.5 ? Math.random() * f.board.left : f.board.left + f.board.width + Math.random() * (f.width - f.board.left - f.board.width);
      this.dust.push(mote(x, ground, (Math.random() - 0.5) * 20, -15 - 20 * Math.random(), 1.2, 3 + 4 * Math.random()));
    }
    return sway;
  }

  // --- Motes (smoke, embers, dust) ----------------------------------------------------

  private updateMotes(list: Mote[], dtS: number, gravity: number, grow = 0) {
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      m.x += m.vx * dtS;
      m.y += m.vy * dtS;
      m.vy += gravity * dtS;
      m.r += grow * dtS;
      m.life -= dtS;
      if (m.life <= 0) list.splice(i, 1);
    }
    if (list.length > 160) list.splice(0, list.length - 160);
  }

  private drawMotes(ctx: CanvasRenderingContext2D, list: Mote[], color: string, alpha: number) {
    ctx.save();
    ctx.fillStyle = color;
    const base = ctx.globalAlpha;
    for (const m of list) {
      ctx.globalAlpha = base * alpha * (m.life / m.maxLife);
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function mote(x: number, y: number, vx: number, vy: number, life: number, r: number): Mote {
  return { x, y, vx, vy, life, maxLife: life, r };
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.save();
  ctx.globalAlpha *= 0.15;
  ctx.fillStyle = colors.ink;
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Out fast, hang there, drift back: the letters' "blown away" moment as the wind test starts.
function blowEnvelope(t: number) {
  if (t < 0 || t > 2) return 0;
  if (t < 0.35) return 1 - (1 - t / 0.35) ** 2;
  if (t < 0.8) return 1;
  return 1 - easeInOut((t - 0.8) / 1.2);
}

// A big orange tabby head, ears first, eyes on `look`. Pupils widen as it gets keen.
function drawCatHead(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, look: { x: number; y: number }, now: number, keen: number) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = Math.max(2, R * 0.03);
  // Ears.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * R * 0.25, cy - R * 0.8);
    ctx.lineTo(cx + s * R * 0.85, cy - R * 1.25);
    ctx.lineTo(cx + s * R * 0.92, cy - R * 0.45);
    ctx.closePath();
    ctx.fillStyle = FX.fur;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * R * 0.42, cy - R * 0.8);
    ctx.lineTo(cx + s * R * 0.78, cy - R * 1.08);
    ctx.lineTo(cx + s * R * 0.8, cy - R * 0.62);
    ctx.closePath();
    ctx.fillStyle = FX.bean;
    ctx.fill();
  }
  // Head.
  ctx.beginPath();
  ctx.ellipse(cx, cy, R, R * 0.88, 0, 0, Math.PI * 2);
  ctx.fillStyle = FX.fur;
  ctx.fill();
  ctx.stroke();
  // Forehead stripes.
  ctx.strokeStyle = FX.furDark;
  ctx.lineWidth = R * 0.06;
  ctx.lineCap = "round";
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * R * 0.18, cy - R * 0.82);
    ctx.lineTo(cx + i * R * 0.14, cy - R * 0.55);
    ctx.stroke();
  }
  // Eyes, blinking now and then, pupils on the target.
  const blink = now % 3800 < 140 ? 0.1 : 1;
  const dx = look.x - cx;
  const dy = look.y - cy;
  const len = Math.hypot(dx, dy) || 1;
  for (const s of [-1, 1]) {
    const ex = cx + s * R * 0.38;
    const ey = cy - R * 0.2;
    ctx.beginPath();
    ctx.ellipse(ex, ey, R * 0.2, R * 0.17 * blink, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#e9f2a0";
    ctx.fill();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = Math.max(2, R * 0.025);
    ctx.stroke();
    if (blink === 1) {
      ctx.beginPath();
      ctx.ellipse(ex + (dx / len) * R * 0.08, ey + (dy / len) * R * 0.06, R * (0.03 + 0.09 * keen), R * 0.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = colors.ink;
      ctx.fill();
    }
  }
  // Nose, mouth and whiskers.
  ctx.fillStyle = FX.bean;
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.08, cy + R * 0.08);
  ctx.lineTo(cx + R * 0.08, cy + R * 0.08);
  ctx.lineTo(cx, cy + R * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = Math.max(1.5, R * 0.02);
  ctx.beginPath();
  ctx.moveTo(cx, cy + R * 0.18);
  ctx.quadraticCurveTo(cx - R * 0.1, cy + R * 0.3, cx - R * 0.2, cy + R * 0.22);
  ctx.moveTo(cx, cy + R * 0.18);
  ctx.quadraticCurveTo(cx + R * 0.1, cy + R * 0.3, cx + R * 0.2, cy + R * 0.22);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.moveTo(cx + s * R * 0.25, cy + R * (0.15 + i * 0.06));
      ctx.lineTo(cx + s * R * 0.85, cy + R * (0.05 + i * 0.1));
    }
  }
  ctx.stroke();
  ctx.restore();
}
