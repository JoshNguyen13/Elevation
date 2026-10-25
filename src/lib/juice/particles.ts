// Small canvas particles in board px: dust on impacts, debris when a piece falls, bits
// on meteor hits. Purely visual and capped, so a chaotic collapse can't slow a frame.

interface Particle {
  x: number;
  y: number;
  vx: number; // px per ms
  vy: number;
  life: number; // ms left
  maxLife: number;
  size: number;
  color: string;
}

export interface BurstOptions {
  count: number;
  color: string;
  speed?: number; // px per ms
  size?: number;
  life?: number; // ms
  upward?: boolean; // spray up and out, like dust kicked off a surface
}

const MAX_PARTICLES = 320;
const GRAVITY = 0.0009; // px per ms^2

export class Particles {
  private list: Particle[] = [];

  burst(x: number, y: number, { count, color, speed = 0.12, size = 2.2, life = 520, upward = true }: BurstOptions) {
    for (let i = 0; i < count && this.list.length < MAX_PARTICLES; i++) {
      const angle = upward ? -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 : Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      const l = life * (0.6 + Math.random() * 0.6);
      this.list.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: l,
        maxLife: l,
        size: size * (0.6 + Math.random() * 0.8),
        color,
      });
    }
  }

  update(dtMs: number) {
    const dt = Math.min(dtMs, 50);
    for (const p of this.list) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += GRAVITY * dt;
      p.vx *= 0.995;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  // Draws in whatever transform the board is drawn in (board px).
  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  get count() {
    return this.list.length;
  }
}
