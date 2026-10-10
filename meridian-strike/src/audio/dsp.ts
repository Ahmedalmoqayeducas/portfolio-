/** Small synthesis toolkit shared by the live audio engine and the offline renderer used in tests. Works with any BaseAudioContext. */

export type Ctx = BaseAudioContext;
export interface Noise { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer }
export type NoiseKind = 'white' | 'pink' | 'brown';

export interface Rig { ctx: Ctx; noise: Noise }

export interface Filt { type: BiquadFilterType; f0: number; f1?: number; q?: number }

/** deterministic LCG so every run (and every offline render) sounds the same */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function makeNoise(ctx: Ctx, seconds = 3): Noise {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const rnd = lcg(0x9e3779b9);
  const white = ctx.createBuffer(1, len, sr), pink = ctx.createBuffer(1, len, sr), brown = ctx.createBuffer(1, len, sr);
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  let pMax = 0, bMax = 0;
  for (let i = 0; i < len; i++) {
    const x = rnd() * 2 - 1;
    w[i] = x;
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    b[i] = last;
    pMax = Math.max(pMax, Math.abs(p[i])); bMax = Math.max(bMax, Math.abs(b[i]));
  }
  for (let i = 0; i < len; i++) { p[i] /= pMax; b[i] /= bMax; }
  return { white: loopable(ctx, white), pink: loopable(ctx, pink), brown: loopable(ctx, brown) };
}

/** crossfade the tail into the head so the buffer loops without a click */
function loopable(ctx: Ctx, buf: AudioBuffer): AudioBuffer {
  const d = buf.getChannelData(0);
  const n = Math.min(4096, d.length >> 3);
  const out = ctx.createBuffer(1, d.length - n, buf.sampleRate);
  const o = out.getChannelData(0);
  o.set(d.subarray(0, d.length - n));
  for (let i = 0; i < n; i++) { const k = i / n; o[i] = d[d.length - n + i] * (1 - k) + d[i] * k; }
  return out;
}

/** envelope gain node: instant start, linear attack, exponential decay to silence over `dur` */
export function envGain(rig: Rig, out: AudioNode, t: number, dur: number, peak: number, attack = 0.001): GainNode {
  const g = rig.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.0003, attack));
  g.gain.exponentialRampToValueAtTime(0.0005, t + Math.max(attack + 0.002, dur));
  g.connect(out);
  return g;
}

/** filtered noise burst with an exponential decay */
export function burst(rig: Rig, out: AudioNode, t: number, kind: NoiseKind, dur: number, peak: number, filt: Filt | null, attack = 0.001, rate = 1): void {
  const { ctx, noise } = rig;
  const src = ctx.createBufferSource();
  src.buffer = noise[kind];
  src.loop = true;
  src.playbackRate.value = rate;
  const g = envGain(rig, out, t, dur, peak, attack);
  if (filt) {
    const f = ctx.createBiquadFilter();
    f.type = filt.type;
    f.Q.value = filt.q ?? 0.8;
    f.frequency.setValueAtTime(filt.f0, t);
    if (filt.f1 && filt.f1 !== filt.f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, filt.f1), t + dur);
    src.connect(f); f.connect(g);
  } else src.connect(g);
  src.start(t, ((t * 7919) % 1) * 1.5);
  src.stop(t + dur + 0.05);
}

export function tone(rig: Rig, out: AudioNode, t: number, f0: number, f1: number, dur: number, type: OscillatorType, peak: number, attack = 0.001): void {
  const o = rig.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(8, f1), t + dur);
  const g = envGain(rig, out, t, dur, peak, attack);
  o.connect(g);
  o.start(t); o.stop(t + dur + 0.05);
}

/** impulse response: exponentially decaying noise with early reflections, progressively darker (air absorption) */
export function makeImpulse(ctx: Ctx, seconds = 2.6): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const rnd = lcg(777);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.55 - 0.5 * t; // one-pole lowpass coefficient: later parts get duller
      lp += (rnd() * 2 - 1 - lp) * Math.max(0.04, k);
      d[i] = lp * Math.pow(1 - t, 2.6) * (i < 40 ? 0.2 : 1);
    }
    // a few discrete early reflections (rock walls / buildings)
    for (const [ms, g] of [[23, 0.5], [41, 0.35], [67, 0.28], [97, 0.2]] as [number, number][]) {
      const idx = Math.floor((ms + c * 7) * sr / 1000);
      if (idx < len) d[idx] += g * (c ? -1 : 1);
    }
  }
  return ir;
}

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** gain stage in front of `out` (keeps every recipe peaking around -3 dBFS before spatial attenuation) */
export function lvl(rig: Rig, out: AudioNode, v: number): GainNode {
  const g = rig.ctx.createGain();
  g.gain.value = v;
  g.connect(out);
  return g;
}

/** periodic wave from one cycle of a function f(phase 0..1) -> -1..1 */
export function makeWave(ctx: Ctx, f: (p: number) => number, harmonics = 48): PeriodicWave {
  const N = 1024;
  const re = new Float32Array(harmonics + 1), im = new Float32Array(harmonics + 1);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) samples[i] = f(i / N);
  for (let h = 1; h <= harmonics; h++) {
    let a = 0, b = 0;
    for (let i = 0; i < N; i++) { const ph = (2 * Math.PI * h * i) / N; a += samples[i] * Math.cos(ph); b += samples[i] * Math.sin(ph); }
    re[h] = (2 * a) / N; im[h] = (2 * b) / N;
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: true });
}
