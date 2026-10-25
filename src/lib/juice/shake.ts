// Screen shake as "trauma": hits add to it, it decays over time, and the offset scales
// with trauma squared, so small hits are subtle and big ones are violent. A continuous
// amount (the earthquake) can be added per frame. Off entirely for reduced motion.

const MAX_OFFSET_PX = 9;
const DECAY_PER_MS = 0.0016;

export class Shake {
  private trauma = 0;
  private time = 0;
  private readonly enabled =
    typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  add(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dtMs: number) {
    this.time += dtMs;
    this.trauma = Math.max(0, this.trauma - DECAY_PER_MS * dtMs);
  }

  // Offset in board px for this frame. `continuous` (0–1) is added on top of the trauma.
  offset(continuous = 0): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    const amount = Math.min(1, this.trauma * this.trauma + continuous * 0.35);
    if (amount <= 0.001) return { x: 0, y: 0 };
    // Smooth pseudo-noise from layered sines: jittery but not white noise.
    const t = this.time;
    const nx = Math.sin(t * 0.071) * 0.6 + Math.sin(t * 0.153 + 1.3) * 0.4;
    const ny = Math.sin(t * 0.089 + 2.1) * 0.6 + Math.sin(t * 0.131 + 0.4) * 0.4;
    return { x: nx * MAX_OFFSET_PX * amount, y: ny * MAX_OFFSET_PX * amount * 0.6 };
  }
}
