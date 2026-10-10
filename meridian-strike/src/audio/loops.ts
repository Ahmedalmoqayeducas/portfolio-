import { makeWave, Rig, Ctx, NoiseKind } from './dsp';

/**
 * Continuous engine / rotor / wind voices. Each loop is a small node graph whose parameters follow a LoopState:
 *   rpm   0..1  engine load (idle .. flat out)
 *   speed 0..1  ground / air speed relative to the unit's maximum
 *   pitch       Doppler factor (>1 approaching, <1 receding)
 * Everything is synthesised from oscillators + noise so no samples need to ship with the game.
 */
export type LoopKind = 'tracked' | 'wheeled' | 'jet' | 'heli' | 'prop' | 'wind';
export const LOOP_KIND_LIST: LoopKind[] = ['tracked', 'wheeled', 'jet', 'heli', 'prop', 'wind'];

export interface LoopState { rpm: number; speed: number; pitch: number }
export interface Loop { set(s: LoopState, t: number, tc?: number): void; stop(t: number): void }

type Upd = (s: LoopState, t: number, tc: number) => void;
interface B { ctx: Ctx; rig: Rig; master: GainNode; srcs: AudioScheduledSourceNode[]; upd: Upd[] }

const gn = (ctx: Ctx, v: number, to?: AudioNode): GainNode => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
const bq = (ctx: Ctx, type: BiquadFilterType, f: number, q = 0.8): BiquadFilterNode => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

function noise(b: B, kind: NoiseKind): AudioBufferSourceNode {
  const s = b.ctx.createBufferSource();
  s.buffer = b.rig.noise[kind]; s.loop = true;
  b.srcs.push(s);
  return s;
}
function osc(b: B, type: Exclude<OscillatorType, 'custom'> | PeriodicWave, f = 100): OscillatorNode {
  const o = b.ctx.createOscillator();
  if (typeof type === 'string') o.type = type as OscillatorType; else o.setPeriodicWave(type);
  o.frequency.value = f;
  b.srcs.push(o);
  return o;
}

interface WaveInfo { w: PeriodicWave; mean: number }
const waveCache = new WeakMap<Ctx, Record<string, WaveInfo>>();
const SHAPES: Record<string, (p: number) => number> = {
  // two overlapping exhaust pulses per cycle: gives the lumpy diesel "burble"
  exhaust: (p) => Math.exp(-p * 7) + 0.55 * Math.exp(-((p + 0.5) % 1) * 7),
  spike: (p) => Math.exp(-p * 15),
  chop: (p) => Math.exp(-p * 9) * (1 + 0.5 * Math.sin(p * 40)),
};
function shape(ctx: Ctx, name: 'exhaust' | 'spike' | 'chop'): WaveInfo {
  let c = waveCache.get(ctx);
  if (!c) { c = {}; waveCache.set(ctx, c); }
  if (!c[name]) {
    const f = SHAPES[name];
    let peak = 1e-6, sum = 0;
    for (let i = 0; i < 1024; i++) { const v = f(i / 1024); peak = Math.max(peak, Math.abs(v)); sum += v; }
    c[name] = { w: makeWave(ctx, (p) => f(p) / peak, 56), mean: sum / 1024 / peak };
  }
  return c[name];
}

/** amplitude-modulates `target` gains with a pulse train; returns the oscillator so its rate can follow speed */
function pulseAm(b: B, name: 'spike' | 'chop', rate: number, ...targets: GainNode[]): OscillatorNode {
  const info = shape(b.ctx, name);
  const o = osc(b, info.w, rate);
  for (const t of targets) { t.gain.value = info.mean; o.connect(t.gain); }
  return o;
}

const BUILD: Record<LoopKind, (b: B) => void> = {
  /** diesel / turbine tank: exhaust lope, growl, brown rumble, and the clatter of track links that follows ground speed */
  tracked(b) {
    const { ctx, master } = b;
    const e1 = osc(b, shape(ctx, 'exhaust').w, 30), e2 = osc(b, shape(ctx, 'exhaust').w, 30);
    const lp = bq(ctx, 'lowpass', 220, 0.9), eg = gn(ctx, 0.4, master);
    e1.connect(lp); e2.connect(lp); lp.connect(eg);
    const bp = bq(ctx, 'bandpass', 420, 0.8), gg = gn(ctx, 0.15, master);
    e1.connect(bp); bp.connect(gg);
    const rum = noise(b, 'brown'), rl = bq(ctx, 'lowpass', 170, 0.7), rg = gn(ctx, 0.5, master);
    rum.connect(rl); rl.connect(rg);
    // track links: pink noise through a band-pass, chopped by a spike train
    const cl = noise(b, 'pink'), cbp = bq(ctx, 'bandpass', 1300, 1.1), cam = gn(ctx, 0), cg = gn(ctx, 0, master);
    cl.connect(cbp); cbp.connect(cam); cam.connect(cg);
    const cm = pulseAm(b, 'spike', 8, cam);
    const sq = noise(b, 'white'), sh = bq(ctx, 'highpass', 3400, 0.7), sam = gn(ctx, 0), sg = gn(ctx, 0, master);
    sq.connect(sh); sh.connect(sam); sam.connect(sg);
    const sm = pulseAm(b, 'spike', 11, sam);
    b.upd.push((s, t, tc) => {
      const f = (26 + 40 * s.rpm) * s.pitch;
      e1.frequency.setTargetAtTime(f, t, tc); e2.frequency.setTargetAtTime(f * 1.013, t, tc);
      lp.frequency.setTargetAtTime((170 + 520 * s.rpm) * s.pitch, t, tc);
      eg.gain.setTargetAtTime(0.22 + 0.3 * s.rpm, t, tc);
      gg.gain.setTargetAtTime(0.05 + 0.16 * s.rpm, t, tc);
      rg.gain.setTargetAtTime(0.28 + 0.34 * s.rpm, t, tc);
      cm.frequency.setTargetAtTime((4 + 12 * s.speed) * s.pitch, t, tc);
      sm.frequency.setTargetAtTime((6.4 + 18 * s.speed) * s.pitch, t, tc);
      cbp.frequency.setTargetAtTime((900 + 900 * s.speed) * s.pitch, t, tc);
      cg.gain.setTargetAtTime(Math.pow(s.speed, 0.7) * 0.75, t, tc);
      sg.gain.setTargetAtTime(Math.pow(s.speed, 1.2) * 0.12, t, tc);
    });
  },

  /** trucks / APCs: higher revving engine plus tyre roar */
  wheeled(b) {
    const { ctx, master } = b;
    const e1 = osc(b, shape(ctx, 'exhaust').w, 50), e2 = osc(b, 'sawtooth', 100);
    const lp = bq(ctx, 'lowpass', 350, 0.8), eg = gn(ctx, 0.3, master);
    e1.connect(lp); lp.connect(eg);
    const lp2 = bq(ctx, 'lowpass', 500, 0.7), g2 = gn(ctx, 0.05, master);
    e2.connect(lp2); lp2.connect(g2);
    const rum = noise(b, 'brown'), rl = bq(ctx, 'lowpass', 200, 0.7), rg = gn(ctx, 0.35, master);
    rum.connect(rl); rl.connect(rg);
    const tyre = noise(b, 'pink'), tl = bq(ctx, 'lowpass', 700, 0.6), tg = gn(ctx, 0, master);
    tyre.connect(tl); tl.connect(tg);
    b.upd.push((s, t, tc) => {
      const f = (42 + 62 * s.rpm) * s.pitch;
      e1.frequency.setTargetAtTime(f, t, tc); e2.frequency.setTargetAtTime(f * 2.01, t, tc);
      lp.frequency.setTargetAtTime((260 + 700 * s.rpm) * s.pitch, t, tc);
      eg.gain.setTargetAtTime(0.18 + 0.26 * s.rpm, t, tc);
      g2.gain.setTargetAtTime(0.02 + 0.06 * s.rpm, t, tc);
      rg.gain.setTargetAtTime(0.2 + 0.2 * s.rpm, t, tc);
      tl.frequency.setTargetAtTime((450 + 900 * s.speed) * s.pitch, t, tc);
      tg.gain.setTargetAtTime(Math.pow(s.speed, 0.9) * 0.4, t, tc);
    });
  },

  /** jet: broadband roar, hiss, low rumble and a compressor whine */
  jet(b) {
    const { ctx, master } = b;
    const rr = noise(b, 'white'), rbp = bq(ctx, 'bandpass', 800, 0.45), rg = gn(ctx, 0.3, master);
    rr.connect(rbp); rbp.connect(rg);
    const fl = osc(b, 'sine', 29), fd = gn(ctx, 0.07); fl.connect(fd); fd.connect(rg.gain); // turbulence flutter
    const hs = noise(b, 'white'), hh = bq(ctx, 'highpass', 3800, 0.7), hg = gn(ctx, 0.05, master);
    hs.connect(hh); hh.connect(hg);
    const rb = noise(b, 'brown'), rl = bq(ctx, 'lowpass', 260, 0.7), bg = gn(ctx, 0.5, master);
    rb.connect(rl); rl.connect(bg);
    const w1 = osc(b, 'sawtooth', 1200), wb = bq(ctx, 'bandpass', 1200, 6), wg = gn(ctx, 0.03, master);
    w1.connect(wb); wb.connect(wg);
    const w2 = osc(b, 'sine', 1800), wg2 = gn(ctx, 0.02, master);
    w2.connect(wg2);
    b.upd.push((s, t, tc) => {
      const th = s.rpm, p = s.pitch;
      rbp.frequency.setTargetAtTime((450 + 1200 * th) * p, t, tc);
      rg.gain.setTargetAtTime(0.1 + 0.26 * th, t, tc);
      hg.gain.setTargetAtTime(0.01 + 0.1 * th, t, tc);
      hh.frequency.setTargetAtTime(3200 * p, t, tc);
      bg.gain.setTargetAtTime(0.25 + 0.5 * th, t, tc);
      const wf = (900 + 1700 * th) * p;
      w1.frequency.setTargetAtTime(wf, t, tc); wb.frequency.setTargetAtTime(wf, t, tc);
      w2.frequency.setTargetAtTime(wf * 1.52, t, tc);
      wg.gain.setTargetAtTime(0.012 + 0.04 * th, t, tc);
      wg2.gain.setTargetAtTime(0.008 + 0.025 * th, t, tc);
    });
  },

  /** helicopter: main-rotor chop, tail-rotor buzz and a turbine whine */
  heli(b) {
    const { ctx, master } = b;
    const ch = noise(b, 'pink'), cbp = bq(ctx, 'bandpass', 380, 0.9), cam = gn(ctx, 0), cg = gn(ctx, 0.9, master);
    ch.connect(cbp); cbp.connect(cam); cam.connect(cg);
    const th = osc(b, 'sine', 64), tam = gn(ctx, 0), tg = gn(ctx, 0.6, master);
    th.connect(tam); tam.connect(tg);
    const sl = noise(b, 'white'), shp = bq(ctx, 'highpass', 1800, 0.7), sam = gn(ctx, 0), sg = gn(ctx, 0.1, master);
    sl.connect(shp); shp.connect(sam); sam.connect(sg);
    const rotor = pulseAm(b, 'chop', 11, cam, tam, sam);
    const tr = noise(b, 'pink'), tbp = bq(ctx, 'bandpass', 1500, 2.5), tram = gn(ctx, 0), trg = gn(ctx, 0.1, master);
    tr.connect(tbp); tbp.connect(tram); tram.connect(trg);
    const tail = pulseAm(b, 'spike', 44, tram);
    const tu = osc(b, 'sine', 1900), tug = gn(ctx, 0.02, master);
    tu.connect(tug);
    const tu2 = osc(b, 'sawtooth', 950), tub = bq(ctx, 'bandpass', 950, 5), tug2 = gn(ctx, 0.012, master);
    tu2.connect(tub); tub.connect(tug2);
    b.upd.push((s, t, tc) => {
      const p = s.pitch, k = 0.55 + 0.45 * s.rpm;
      rotor.frequency.setTargetAtTime((9.5 + 3.5 * s.rpm + 1.5 * s.speed) * p, t, tc);
      tail.frequency.setTargetAtTime((38 + 14 * s.rpm) * p, t, tc);
      cbp.frequency.setTargetAtTime((320 + 160 * s.speed) * p, t, tc);
      th.frequency.setTargetAtTime(62 * p, t, tc);
      cg.gain.setTargetAtTime(0.6 * k + 0.35 * s.speed, t, tc);
      tg.gain.setTargetAtTime(0.45 * k, t, tc);
      sg.gain.setTargetAtTime(0.05 + 0.17 * s.speed, t, tc);
      trg.gain.setTargetAtTime(0.05 + 0.1 * s.rpm, t, tc);
      tu.frequency.setTargetAtTime((1700 + 500 * s.rpm) * p, t, tc);
      tu2.frequency.setTargetAtTime((850 + 250 * s.rpm) * p, t, tc); tub.frequency.setTargetAtTime((850 + 250 * s.rpm) * p, t, tc);
      tug.gain.setTargetAtTime(0.006 + 0.02 * s.rpm, t, tc);
      tug2.gain.setTargetAtTime(0.004 + 0.012 * s.rpm, t, tc);
    });
  },

  /** small piston / two-stroke engine of loitering drones and light aircraft: buzzy and a little wobbly */
  prop(b) {
    const { ctx, master } = b;
    const a = osc(b, 'sawtooth', 110), a2 = osc(b, 'sawtooth', 110), lp = bq(ctx, 'bandpass', 520, 0.7), hp = bq(ctx, 'highpass', 150, 0.7), g = gn(ctx, 0.16, master);
    a.connect(lp); a2.connect(lp); lp.connect(hp); hp.connect(g);
    const wob = osc(b, 'sine', 5.3), wd = gn(ctx, 0.03); wob.connect(wd); wd.connect(g.gain);
    const ns = noise(b, 'pink'), nb = bq(ctx, 'bandpass', 1700, 0.8), ng = gn(ctx, 0.03, master);
    ns.connect(nb); nb.connect(ng);
    b.upd.push((s, t, tc) => {
      const f = (92 + 70 * s.rpm) * s.pitch;
      a.frequency.setTargetAtTime(f, t, tc); a2.frequency.setTargetAtTime(f * 1.007, t, tc);
      lp.frequency.setTargetAtTime((420 + 700 * s.rpm) * s.pitch, t, tc);
      g.gain.setTargetAtTime(0.12 + 0.12 * s.rpm, t, tc);
      ng.gain.setTargetAtTime(0.015 + 0.04 * s.rpm, t, tc);
    });
  },

  /** battlefield wind: low rumble with slow gusts; `rpm` = gustiness */
  wind(b) {
    const { ctx, master } = b;
    const w = noise(b, 'brown'), wl = bq(ctx, 'lowpass', 420, 0.5), wg = gn(ctx, 0.25, master);
    w.connect(wl); wl.connect(wg);
    const gust = osc(b, 'sine', 0.13), gd = gn(ctx, 0.12); gust.connect(gd); gd.connect(wg.gain);
    const gust2 = osc(b, 'sine', 0.047), gd2 = gn(ctx, 0.08); gust2.connect(gd2); gd2.connect(wl.frequency);
    gd2.gain.value = 120;
    const hs = noise(b, 'pink'), hb = bq(ctx, 'bandpass', 900, 0.4), hg = gn(ctx, 0.04, master);
    hs.connect(hb); hb.connect(hg);
    b.upd.push((s, t, tc) => { wg.gain.setTargetAtTime(0.18 + 0.2 * s.rpm, t, tc); hg.gain.setTargetAtTime(0.02 + 0.06 * s.rpm, t, tc); });
  },
};

/** per-kind output trim so every voice sits around -24 dB RMS at full load before spatial attenuation */
const LOOP_LEVEL: Record<LoopKind, number> = { tracked: 0.3, wheeled: 0.5, jet: 0.4, heli: 0.7, prop: 0.8, wind: 1 };

export function createLoop(kind: LoopKind, rig: Rig, out: AudioNode, t0: number): Loop {
  const ctx = rig.ctx;
  const master = gn(ctx, 0, out);
  const b: B = { ctx, rig, master, srcs: [], upd: [] };
  BUILD[kind](b);
  // the oscillators and noise buffers all start together; noise starts at random offsets so stacked voices are decorrelated
  for (const s of b.srcs) { if (s instanceof AudioBufferSourceNode) s.start(t0, Math.random() * 1.5); else s.start(t0); }
  master.gain.setTargetAtTime(LOOP_LEVEL[kind], t0, 0.12);
  let dead = false;
  return {
    set(s, t, tc = 0.12) { if (!dead) for (const u of b.upd) u(s, t, tc); },
    stop(t) {
      if (dead) return;
      dead = true;
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(0, t, 0.06);
      for (const s of b.srcs) { try { s.stop(t + 0.6); } catch { /* already stopped */ } }
    },
  };
}

/** lab entry points: every loop rendered as a rev-up from idle to full load */
export const LOOP_KINDS: Record<string, (r: Rig, o: AudioNode, seconds: number) => void> = {};
for (const k of LOOP_KIND_LIST) {
  LOOP_KINDS['loop_' + k] = (r, o, secs) => {
    const l = createLoop(k, r, o, 0);
    for (let t = 0; t < secs - 0.2; t += 0.1) {
      const u = Math.max(0, Math.min(1, (t - secs * 0.2) / (secs * 0.4)));
      l.set({ rpm: 0.2 + 0.8 * u, speed: u, pitch: 1 }, t, 0.08);
    }
    l.stop(secs - 0.15);
  };
}
/** jet flyby: pitch drops through the Doppler shift as it passes the listener */
LOOP_KINDS['loop_jet_pass'] = (r, o, secs) => {
  const l = createLoop('jet', r, o, 0);
  for (let t = 0; t < secs - 0.2; t += 0.05) {
    const u = t / secs;
    l.set({ rpm: 1, speed: 1, pitch: 1.18 - 0.36 * (1 / (1 + Math.exp(-(u - 0.5) * 14))) }, t, 0.04);
  }
  l.stop(secs - 0.15);
};
