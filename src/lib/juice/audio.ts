// Game sounds, synthesized with WebAudio: no asset files, no licences. The context is
// created on the first click / key press (browsers block audio before a user gesture),
// and every call is a no-op until then, or while muted.
import type { DisasterType } from "@/lib/supabase/types";

const MUTED_KEY = "elevation:muted";
const VOLUME_KEY = "elevation:volume";
const DEFAULT_VOLUME = 0.6;

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  endFreq?: number;
  delay?: number;
  // Seconds to reach full volume (a swell), and stereo position −1 (left) to 1 (right).
  attack?: number;
  pan?: number;
}

interface NoiseOptions {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  endFreq?: number;
  q?: number;
  delay?: number;
  attack?: number;
  pan?: number;
  // Brown noise (heavy in the lows, for rumbles) instead of white.
  brown?: boolean;
}

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;
  private muted: boolean | null = null;
  private volume: number | null = null;
  private lastImpactAt = 0;
  private lastImpactStrength = 0;
  private lastRotateAt = 0;
  private readonly lastCueAt: Record<string, number> = {};
  // The disaster's background loop: its own bus (for fades) and the sources to stop.
  private ambience: { bus: GainNode; sources: AudioScheduledSourceNode[] } | null = null;
  private ambienceBuffer: AudioBuffer | null = null;
  private readonly listeners = new Set<() => void>();

  // --- Mute and volume (a tiny external store, for the toggle button) -----------

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

  // 0–1, separate from mute: unmuting comes back at this level.
  getVolume = (): number => {
    if (this.volume === null) {
      let stored = NaN;
      try {
        stored = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
      } catch {
        // Storage blocked: use the default.
      }
      this.volume = Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : DEFAULT_VOLUME;
    }
    return this.volume;
  };

  getVolumeOnServer = () => DEFAULT_VOLUME;

  toggleMuted() {
    this.muted = !this.isMuted();
    try {
      localStorage.setItem(MUTED_KEY, this.muted ? "1" : "0");
    } catch {
      // Storage blocked: the setting just won't persist.
    }
    this.applyGain();
    this.listeners.forEach((listener) => listener());
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    try {
      localStorage.setItem(VOLUME_KEY, String(this.volume));
    } catch {
      // Storage blocked: the setting just won't persist.
    }
    this.applyGain();
    this.listeners.forEach((listener) => listener());
  }

  // A short glide, so dragging the slider doesn't click.
  private applyGain() {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.isMuted() ? 0 : this.getVolume(), this.ctx.currentTime, 0.02);
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
      this.master.gain.value = this.isMuted() ? 0 : this.getVolume();
      // A limiter just under full scale: however many sounds pile up, nothing clips.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      this.master.connect(limiter).connect(this.ctx.destination);
      // iOS only lets touchend / pointerup / click start audio (the game unlocks on
      // pointerdown), and suspends it after a call or backgrounding: retry on each of
      // those, and when the tab comes back. A no-op once audio is running.
      const retry = () => this.resume();
      for (const type of ["touchend", "pointerup", "click", "keydown"]) window.addEventListener(type, retry, { passive: true });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) this.resume();
      });
      const length = Math.floor(this.ctx.sampleRate * 1);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      // Brown noise: integrated white, 4 s so one-shots and the earthquake loop both fit.
      const brownLength = Math.floor(this.ctx.sampleRate * 4);
      this.brownBuffer = this.ctx.createBuffer(1, brownLength, this.ctx.sampleRate);
      const brown = this.brownBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < brownLength; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        brown[i] = last * 3.5;
      }
      // Remove the drift so both ends meet: the loop doesn't thump when it wraps.
      const drift = brown[brownLength - 1] - brown[0];
      for (let i = 0; i < brownLength; i++) brown[i] -= (drift * i) / (brownLength - 1);
    }
    this.resume();
  }

  // Resume a suspended (or iOS "interrupted") context. Older iOS also needs a sound
  // started inside the gesture, so play one silent sample.
  private resume() {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "running") return;
    ctx.resume().catch(() => {
      // Not a gesture the browser accepts: the next one retries.
    });
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
  }

  private ready() {
    return this.ctx && this.master && !this.isMuted() ? this.ctx : null;
  }

  // Where a voice plays: straight into the master, or through a panner first.
  private output(ctx: AudioContext, pan?: number): AudioNode {
    if (!pan || !ctx.createStereoPanner) return this.master!;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.master!);
    return panner;
  }

  // True at most once per `gap` seconds for each key: the per-cue throttle.
  private cooled(ctx: AudioContext, key: string, gap: number) {
    if (ctx.currentTime - (this.lastCueAt[key] ?? -Infinity) < gap) return false;
    this.lastCueAt[key] = ctx.currentTime;
    return true;
  }

  private tone(freq: number, duration: number, { type = "sine", gain = 0.2, endFreq, delay = 0, attack = 0.008, pan }: ToneOptions = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.output(ctx, pan));
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, { gain = 0.2, filter = "lowpass", freq = 800, endFreq, q = 1, delay = 0, attack = 0.01, pan, brown = false }: NoiseOptions = {}) {
    const ctx = this.ready();
    const buffer = brown ? this.brownBuffer : this.noiseBuffer;
    if (!ctx || !buffer) return;
    const t = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(freq, t);
    if (endFreq) biquad.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    biquad.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(biquad).connect(env).connect(this.output(ctx, pan));
    source.start(t, Math.random() * 0.5);
    source.stop(t + duration + 0.02);
  }

  // --- The sounds -------------------------------------------------------------------

  // strength 0–1. Throttled, so a pile settling isn't a machine gun, except that a hit
  // 1.5× harder than the last still gets through (a few more per frame at most), so a
  // crash isn't swallowed by a tap. Harder is louder, longer and lower; a little random
  // pitch keeps repeats from sounding identical.
  impact(strength: number, meteor = false) {
    const ctx = this.ready();
    if (!ctx || strength < 0.04) return;
    const now = ctx.currentTime;
    if (now - this.lastImpactAt < 0.045 && strength < this.lastImpactStrength * 1.5) return;
    this.lastImpactAt = now;
    this.lastImpactStrength = strength;
    const pitch = 0.95 + Math.random() * 0.1;
    this.noise(0.1 + strength * 0.2, { gain: 0.08 + strength * 0.45, freq: (700 + strength * 600) * pitch });
    this.tone((130 - strength * 55) * pitch, 0.1 + strength * 0.14, { gain: 0.1 + strength * 0.35, endFreq: (60 - strength * 20) * pitch });
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

  // --- UI buttons ----------------------------------------------------------------------

  // Secondary buttons (Skip): a soft, rounded tick.
  click() {
    this.tone(1100, 0.05, { type: "triangle", gain: 0.1, endFreq: 700 });
  }

  // Main buttons (the tutorial's CTA): a bright two-step pop with a little air on top.
  confirm() {
    this.tone(587, 0.08, { type: "triangle", gain: 0.16, endFreq: 640 });
    this.tone(880, 0.14, { type: "triangle", gain: 0.14, delay: 0.06 });
    this.noise(0.05, { gain: 0.03, filter: "highpass", freq: 4000 });
  }

  // "Start Building": a rising whoosh over a punchy thump, then two notes climbing.
  start() {
    this.noise(0.28, { gain: 0.12, filter: "bandpass", freq: 400, endFreq: 2400, q: 0.9, attack: 0.12 });
    this.tone(140, 0.18, { gain: 0.22, endFreq: 70 });
    this.tone(523, 0.12, { type: "triangle", gain: 0.14, delay: 0.1 });
    this.tone(784, 0.3, { type: "triangle", gain: 0.15, delay: 0.18 });
  }

  // "See Results": a quick rising arpeggio, then a sparkle.
  reveal() {
    [523, 659, 784, 1047].forEach((freq, i) => this.tone(freq, 0.3, { type: "triangle", gain: 0.12, delay: i * 0.06 }));
    this.tone(2093, 0.5, { gain: 0.04, delay: 0.24 });
    this.noise(0.4, { gain: 0.04, filter: "highpass", freq: 6000, delay: 0.2, attack: 0.05 });
  }

  // --- Disaster cues (strength 0–1, pan −1–1). Each has its own cooldown, so a cue
  // raised every physics step still plays at a sane rate. ---------------------------

  // Wind: a rising bandpass whoosh that swells in; a thin whistle on strong gusts.
  gust(strength: number, pan?: number) {
    const ctx = this.ready();
    if (!ctx || !this.cooled(ctx, "gust", 0.6)) return;
    const s = strength;
    const duration = 0.9 + s * 0.8;
    this.noise(duration, { gain: 0.1 + s * 0.34, filter: "bandpass", freq: 300 + s * 200, endFreq: 900 + s * 900, q: 0.7, attack: 0.25 + s * 0.2, pan });
    if (s > 0.6) this.tone(1100 + s * 500, duration * 0.8, { gain: (s - 0.6) * 0.12, endFreq: 900, attack: 0.3, pan });
  }

  // Earthquake: a brown-noise rumble that builds, rolls (overlapping low bursts at random
  // times), and sinks, over a falling sub, with an 80 Hz layer small speakers can reproduce.
  tremor(strength: number, pan?: number) {
    const ctx = this.ready();
    if (!ctx || !this.cooled(ctx, "tremor", 0.4)) return;
    const s = strength;
    const duration = 1.2 + s * 1.0;
    this.noise(duration, { brown: true, gain: 0.3 + s * 0.4, freq: 160, endFreq: 70, q: 0.7, attack: 0.15 + s * 0.1, pan });
    const rolls = 3 + Math.round(s * 3);
    for (let i = 0; i < rolls; i++) {
      this.noise(0.25 + Math.random() * 0.3, {
        brown: true,
        gain: (0.1 + s * 0.2) * (0.5 + Math.random() * 0.5),
        freq: 260,
        q: 1.2,
        attack: 0.05,
        delay: Math.random() * duration * 0.7,
        pan,
      });
    }
    this.tone(48, duration, { gain: 0.15 + s * 0.3, endFreq: 30, attack: 0.1 });
    this.tone(82, duration * 0.7, { type: "triangle", gain: 0.07 + s * 0.13, endFreq: 60, attack: 0.1, pan });
  }

  // Flood: a slow wash that rises and crests, pulls back, with a low slosh under it.
  wave(strength: number, pan?: number) {
    const ctx = this.ready();
    if (!ctx || !this.cooled(ctx, "wave", 0.8)) return;
    const s = strength;
    const rise = 0.4 + s * 0.2;
    this.noise(1.2 + s * 0.6, { gain: 0.12 + s * 0.38, freq: 300, endFreq: 1600, q: 0.5, attack: rise, pan });
    this.noise(0.9, { gain: 0.08 + s * 0.22, freq: 1400, endFreq: 250, q: 0.5, attack: 0.15, delay: rise, pan });
    this.tone(110, 1 + s * 0.4, { gain: 0.09 + s * 0.18, endFreq: 65, attack: 0.3 });
  }

  // Meteor spawn: a falling whistle that lands about when the rock does. Bigger is
  // lower and louder; the landing itself is impact(strength, true).
  meteorIncoming(strength: number, pan?: number) {
    const ctx = this.ready();
    if (!ctx || !this.cooled(ctx, "meteor-incoming", 0.25)) return;
    const s = strength;
    this.tone(1700 - s * 600, 0.8, { gain: 0.06 + s * 0.12, endFreq: 420 - s * 150, attack: 0.15, pan });
    this.noise(0.8, { gain: 0.045 + s * 0.09, filter: "highpass", freq: 3000, endFreq: 1200, attack: 0.3, pan });
  }

  // --- Ambience: one quiet loop per disaster, under the effects ------------------------

  // Fades in, then swells a little over 30 s as the disaster escalates. Starts even while
  // muted (the master gain silences it), so unmuting mid-test brings it back.
  startAmbience(type: DisasterType) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.stopAmbience(0.3);
    if (!this.ambienceBuffer) {
      // 4 s of noise, so the loop point isn't audible.
      const length = Math.floor(ctx.sampleRate * 4);
      this.ambienceBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.ambienceBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.7, t + 1.5);
    bus.gain.linearRampToValueAtTime(1, t + 30);
    bus.connect(this.master);
    const sources: AudioScheduledSourceNode[] = [];

    const noise = (filter: BiquadFilterType, freq: number, q: number, gain: number, brown = false) => {
      const source = ctx.createBufferSource();
      source.buffer = brown ? this.brownBuffer : this.ambienceBuffer;
      source.loop = true;
      const biquad = ctx.createBiquadFilter();
      biquad.type = filter;
      biquad.frequency.value = freq;
      biquad.Q.value = q;
      const env = ctx.createGain();
      env.gain.value = gain;
      source.connect(biquad).connect(env).connect(bus);
      sources.push(source);
      return { biquad, env };
    };
    const drone = (freq: number, gain: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.value = gain;
      osc.connect(env).connect(bus);
      sources.push(osc);
      return env;
    };
    // Slow wobble: param = its value ± depth, `rate` times a second.
    const lfo = (rate: number, depth: number, param: AudioParam) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = rate;
      const amount = ctx.createGain();
      amount.gain.value = depth;
      osc.connect(amount).connect(param);
      sources.push(osc);
    };

    switch (type) {
      case "wind":
      case "tornado": {
        // A swaying howl, with a thin whistle drifting above it.
        const howl = noise("bandpass", 500, 0.6, 0.07);
        lfo(0.25, 250, howl.biquad.frequency);
        lfo(0.11, 0.03, howl.env.gain);
        const whistle = noise("bandpass", 1400, 4, 0.015);
        lfo(0.17, 300, whistle.biquad.frequency);
        break;
      }
      case "earthquake": {
        // A deep brown-noise rumble that throbs and flutters, a grumble rolling over it,
        // and a 40 Hz bed.
        const rumble = noise("lowpass", 110, 0.7, 0.15, true);
        lfo(0.6, 0.06, rumble.env.gain);
        lfo(7, 0.03, rumble.env.gain);
        const grumble = noise("lowpass", 300, 1, 0.05, true);
        lfo(0.23, 0.03, grumble.env.gain);
        lfo(0.13, 80, grumble.biquad.frequency);
        lfo(0.37, 0.03, drone(40, 0.06).gain);
        break;
      }
      case "cat": {
        // A giant purr: low brown noise pulsing about 25 times a second, slowly swelling.
        const purr = noise("lowpass", 180, 0.8, 0.06, true);
        lfo(25, 0.05, purr.env.gain);
        lfo(0.2, 0.02, purr.env.gain);
        break;
      }
      case "fat-guy":
      case "meteor": {
        // An ominous beating drone (55 Hz against 55.7 Hz), with faint air above.
        drone(55, 0.04);
        drone(55.7, 0.04);
        drone(110, 0.012, "triangle");
        const air = noise("bandpass", 1200, 1, 0.015);
        lfo(0.08, 400, air.biquad.frequency);
        break;
      }
    }
    sources.forEach((source) => source.start(t));
    this.ambience = { bus, sources };
  }

  // Fade the loop out (0 = right away). Safe to call when nothing is playing.
  stopAmbience(fadeSeconds = 1.5) {
    const ambience = this.ambience;
    if (!ambience || !this.ctx) return;
    this.ambience = null;
    const t = this.ctx.currentTime;
    const fade = Math.max(fadeSeconds, 0.02);
    const { gain } = ambience.bus;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(Math.max(gain.value, 0.0001), t);
    gain.exponentialRampToValueAtTime(0.0001, t + fade);
    ambience.sources.forEach((source) => source.stop(t + fade + 0.05));
    ambience.sources[0].onended = () => ambience.bus.disconnect();
  }
}

export const sound = new Sound();
