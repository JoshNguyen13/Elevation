// Game sounds, synthesized with WebAudio: no asset files, no licences. The context is
// created on the first click / key press (browsers block audio before a user gesture),
// and every call is a no-op until then, or while muted.

const MUTED_KEY = "elevation:muted";

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  endFreq?: number;
  delay?: number;
}

interface NoiseOptions {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  endFreq?: number;
  q?: number;
  delay?: number;
}

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean | null = null;
  private lastImpactAt = 0;
  private lastRotateAt = 0;
  private readonly listeners = new Set<() => void>();

  // --- Mute (a tiny external store, for the toggle button) --------------------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isMuted = (): boolean => {
    if (this.muted === null) {
      try {
        this.muted = localStorage.getItem(MUTED_KEY) === "1";
      } catch {
        this.muted = false;
      }
    }
    return this.muted;
  };

  // Server render: always "not muted", so the toggle hydrates consistently.
  isMutedOnServer = () => false;

  toggleMuted() {
    this.muted = !this.isMuted();
    try {
      localStorage.setItem(MUTED_KEY, this.muted ? "1" : "0");
    } catch {
      // Storage blocked: the setting just won't persist.
    }
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime);
    this.listeners.forEach((listener) => listener());
  }

  // --- Setup ---------------------------------------------------------------------

  // Call from a user gesture (click / key press). Safe to call repeatedly.
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.isMuted() ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 1);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private ready() {
    return this.ctx && this.master && !this.isMuted() ? this.ctx : null;
  }

  private tone(freq: number, duration: number, { type = "sine", gain = 0.2, endFreq, delay = 0 }: ToneOptions = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, { gain = 0.2, filter = "lowpass", freq = 800, endFreq, q = 1, delay = 0 }: NoiseOptions = {}) {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t);
    if (endFreq) biquad.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    biquad.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(biquad).connect(env).connect(this.master!);
    source.start(t, Math.random() * 0.5);
    source.stop(t + duration + 0.02);
  }

  // --- The sounds -------------------------------------------------------------------

  // strength 0–1. Throttled, so a pile settling isn't a machine gun.
  impact(strength: number, meteor = false) {
    const ctx = this.ready();
    if (!ctx || strength < 0.04) return;
    const now = ctx.currentTime;
    if (now - this.lastImpactAt < 0.045) return;
    this.lastImpactAt = now;
    this.noise(0.1 + strength * 0.2, { gain: 0.08 + strength * 0.45, freq: 500 + strength * 900 });
    this.tone(95, 0.12 + strength * 0.1, { gain: 0.1 + strength * 0.35, endFreq: 45 });
    if (meteor) this.noise(0.5, { gain: 0.35, filter: "highpass", freq: 1800, endFreq: 400 });
  }

  place() {
    this.tone(520, 0.07, { type: "triangle", gain: 0.18, endFreq: 380 });
  }

  pickup() {
    this.tone(660, 0.05, { type: "triangle", gain: 0.12, endFreq: 820 });
  }

  rotate() {
    const ctx = this.ready();
    if (!ctx || ctx.currentTime - this.lastRotateAt < 0.05) return;
    this.lastRotateAt = ctx.currentTime;
    this.tone(1600, 0.018, { type: "square", gain: 0.025 });
  }

  tick(secondsLeft: number) {
    this.tone(secondsLeft <= 3 ? 1320 : 880, 0.09, { gain: secondsLeft <= 3 ? 0.18 : 0.1 });
  }

  // Build over: a falling two-note "time's up".
  timeUp() {
    this.tone(660, 0.25, { gain: 0.16 });
    this.tone(440, 0.45, { gain: 0.16, delay: 0.18 });
  }

  // The disaster arrives.
  whoosh() {
    this.noise(0.9, { gain: 0.3, filter: "bandpass", freq: 250, endFreq: 2400, q: 0.8 });
    this.tone(70, 0.9, { gain: 0.2, endFreq: 40 });
  }

  crash() {
    this.noise(1.1, { gain: 0.5, freq: 1400, endFreq: 200 });
    this.tone(75, 0.7, { gain: 0.4, endFreq: 32 });
  }

  chime() {
    [660, 880, 1320].forEach((freq, i) => this.tone(freq, 0.6, { gain: 0.13, delay: i * 0.12 }));
  }
}

export const sound = new Sound();
