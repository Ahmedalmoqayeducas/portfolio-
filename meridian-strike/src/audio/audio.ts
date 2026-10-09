import type * as THREE from 'three';
import type { SimEvent, Snapshot } from '../sim/types';
import type { Settings } from '../game/engine';

type Alert = Extract<SimEvent, { k: 'alert' }>;

/** Fully synthesised audio: SFX, UI sounds, adaptive music and radio-style voice lines. No asset files. */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private rate = new Map<string, { t: number; n: number }>();
  private failed = false;
  listenerYaw = 0;
  private lx = 0;
  private lz = 0;
  private ldist = 150;
  intensity = 0;
  private musicOn = false;
  private pad: { o1: OscillatorNode; o2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode }[] = [];
  private chordT = 0;
  private chordI = 0;
  private beat = 0;
  private lastVoice = 0;
  private viewer = 0;
  mood: 'usa' | 'china' | 'iran' = 'usa';

  constructor(private settings: Settings) {}

  private ensure(): boolean {
    if (this.failed) return false;
    if (!this.ctx) {
      try {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ctx = new AC();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.settings.masterVolume;
        this.master.connect(ctx.destination);
        this.sfx = ctx.createGain(); this.sfx.gain.value = this.settings.sfxVolume; this.sfx.connect(this.master);
        this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.settings.musicVolume * 0.32; this.musicBus.connect(this.master);
        // noise + reverb impulse
        const len = ctx.sampleRate * 2;
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const irLen = Math.floor(ctx.sampleRate * 2.2);
        const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
        for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
        this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
        this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.35;
        this.reverbSend.connect(this.reverb); this.reverb.connect(this.master);
      } catch { this.failed = true; return false; }
    }
    if (this.ctx!.state === 'suspended') void this.ctx!.resume();
    return true;
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    this.master.gain.value = s.masterVolume;
    this.sfx.gain.value = s.sfxVolume;
    this.musicBus.gain.value = s.musicVolume * 0.32;
  }

  setViewer(v: number): void { this.viewer = v; }

  private limit(key: string, max: number, windowMs = 70): boolean {
    const now = performance.now();
    const r = this.rate.get(key);
    if (!r || now - r.t > windowMs) { this.rate.set(key, { t: now, n: 1 }); return true; }
    if (r.n >= max) return false;
    r.n++;
    return true;
  }

  /** attenuation 0..1 and stereo pan for a world position */
  private spatial(x: number, z: number): { g: number; pan: number } {
    const dx = x - this.lx, dz = z - this.lz;
    const d = Math.hypot(dx, dz);
    const radius = 380 + this.ldist * 1.3;
    const g = Math.pow(Math.max(0, 1 - d / radius), 1.6);
    const c = Math.cos(this.listenerYaw), s = Math.sin(this.listenerYaw);
    const right = dx * c - dz * s;
    return { g, pan: Math.max(-0.9, Math.min(0.9, right / (60 + d * 0.4))) };
  }

  private out(pan: number, gain: number, reverb = 0): { node: GainNode; end: AudioNode } {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    let end: AudioNode = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); end = p; }
    end.connect(this.sfx);
    if (reverb > 0) { const s = ctx.createGain(); s.gain.value = reverb; end.connect(s); s.connect(this.reverbSend); }
    return { node: g, end };
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, dest: AudioNode, vol: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  private tone(t: number, f0: number, f1: number, dur: number, type: OscillatorType, dest: AudioNode, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ gameplay sounds
  shot(ev: Extract<SimEvent, { k: 'shot' }>, cam: THREE.Vector3): void {
    this.lx = cam.x; this.lz = cam.z;
    if (!this.ensure()) return;
    const sp = this.spatial(ev.x, ev.z);
    if (sp.g < 0.02) return;
    this.intensity = Math.min(1.5, this.intensity + 0.012);
    const t = this.ctx!.currentTime;
    switch (ev.vfx) {
      case 'bullet': {
        if (!this.limit('mg', 6)) return;
        const o = this.out(sp.pan, sp.g * 0.22);
        this.noiseBurst(t, 0.05, 'bandpass', 2600, 1100, 1.2, o.node, 1);
        this.tone(t, 900, 200, 0.03, 'square', o.node, 0.25);
        break;
      }
      case 'cannon': {
        if (!this.limit('cannon', 4)) return;
        const o = this.out(sp.pan, sp.g * (ev.big ? 0.7 : 0.35), 0.15);
        this.noiseBurst(t, 0.16, 'lowpass', 1800, 220, 0.8, o.node, 1);
        this.tone(t, 150, 42, 0.28, 'sine', o.node, 1.0);
        this.noiseBurst(t, 0.04, 'highpass', 3000, 2000, 0.7, o.node, 0.6);
        break;
      }
      case 'missile': case 'rocket': {
        if (!this.limit('missile', 3)) return;
        const o = this.out(sp.pan, sp.g * 0.4, 0.1);
        this.noiseBurst(t, 0.9, 'bandpass', 500, 2400, 0.9, o.node, 0.7);
        this.tone(t, 220, 90, 0.25, 'sawtooth', o.node, 0.15);
        break;
      }
      case 'shell': {
        if (!this.limit('shell', 3)) return;
        const o = this.out(sp.pan, sp.g * 0.8, 0.5);
        this.noiseBurst(t, 0.3, 'lowpass', 1200, 120, 0.8, o.node, 1);
        this.tone(t, 90, 30, 0.5, 'sine', o.node, 1.0);
        break;
      }
      case 'flame': {
        if (!this.limit('flame', 3)) return;
        const o = this.out(sp.pan, sp.g * 0.3);
        this.noiseBurst(t, 0.2, 'bandpass', 700, 500, 0.6, o.node, 0.8);
        break;
      }
      case 'cyber': case 'emp': {
        if (!this.limit('zap', 2, 200)) return;
        const o = this.out(sp.pan, sp.g * 0.3);
        this.tone(t, 1800, 300, 0.4, 'square', o.node, 0.4);
        break;
      }
      default: break;
    }
  }

  boom(ev: Extract<SimEvent, { k: 'boom' }>, cam: THREE.Vector3): void {
    this.lx = cam.x; this.lz = cam.z;
    if (!this.ensure()) return;
    const sp = this.spatial(ev.x, ev.z);
    if (sp.g < 0.015) return;
    if (!this.limit('boom', ev.size > 3 ? 3 : 5, 90)) return;
    this.intensity = Math.min(1.5, this.intensity + 0.05 + ev.size * 0.02);
    const t = this.ctx!.currentTime;
    const s = Math.max(0.5, Math.min(8, ev.size));
    if (ev.kind === 'emp' || ev.kind === 'cyber') {
      const o = this.out(sp.pan, sp.g * 0.5, 0.3);
      this.tone(t, 2400, 90, 0.9, 'sawtooth', o.node, 0.4);
      return;
    }
    const o = this.out(sp.pan, sp.g * Math.min(1.1, 0.35 + s * 0.15), Math.min(0.8, 0.1 + s * 0.1));
    const dur = 0.5 + s * 0.45;
    this.noiseBurst(t, dur, 'lowpass', 2600, 110, 0.7, o.node, 1);
    this.tone(t, 90 - s * 4, 28, dur * 0.8, 'sine', o.node, 1.0);
    if (s > 2) this.noiseBurst(t + 0.05, dur * 1.6, 'lowpass', 600, 60, 0.6, o.node, 0.8);
    if (ev.kind === 'nuke') this.tone(t, 50, 18, 4, 'sine', o.node, 1.2);
  }

  private beepSeq(notes: [number, number][], vol = 0.25, type: OscillatorType = 'sine'): void {
    if (!this.ensure()) return;
    const t0 = this.ctx!.currentTime;
    const o = this.out(0, vol);
    notes.forEach(([f, d], i) => this.tone(t0 + i * 0.11, f, f * 0.98, d, type, o.node, 0.9));
  }

  ui(kind: 'click' | 'error' | 'select' | 'build'): void {
    if (!this.ensure()) return;
    if (!this.limit('ui' + kind, 2, 80)) return;
    switch (kind) {
      case 'click': this.beepSeq([[880, 0.05]], 0.12, 'triangle'); break;
      case 'select': this.beepSeq([[520, 0.04], [780, 0.05]], 0.1, 'triangle'); break;
      case 'error': this.beepSeq([[180, 0.18]], 0.22, 'sawtooth'); break;
      case 'build': this.beepSeq([[440, 0.07], [660, 0.1]], 0.16, 'triangle'); break;
    }
  }

  alert(ev: Alert): void {
    if (ev.owner !== this.viewer && ev.type !== 'super') return;
    if (!this.ensure()) return;
    switch (ev.type) {
      case 'attack': this.beepSeq([[740, 0.12], [740, 0.12], [520, 0.2]], 0.22, 'square'); this.say('Base under attack'); break;
      case 'built': this.beepSeq([[523, 0.1], [784, 0.16]], 0.16, 'triangle'); this.say('Construction complete'); break;
      case 'ready': this.beepSeq([[660, 0.08]], 0.12, 'triangle'); break;
      case 'lost': this.beepSeq([[400, 0.15], [250, 0.25]], 0.2, 'sawtooth'); break;
      case 'capture': this.beepSeq([[600, 0.1], [900, 0.14]], 0.16, 'triangle'); this.say('Structure captured'); break;
      case 'super': this.beepSeq([[880, 0.2], [660, 0.2], [880, 0.2], [660, 0.2]], 0.25, 'sawtooth'); this.say('Superweapon launch detected'); break;
      case 'power': this.beepSeq([[523, 0.08], [659, 0.08], [784, 0.14]], 0.16, 'triangle'); this.say('Promotion. Command points available'); break;
      default: break;
    }
  }

  say(text: string): void {
    if (!this.settings.voice || typeof speechSynthesis === 'undefined') return;
    const now = performance.now();
    if (now - this.lastVoice < 6000) return;
    this.lastVoice = now;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 0.75; u.volume = Math.min(1, this.settings.masterVolume);
      if (this.ctx) {
        const o = this.out(0, 0.12);
        this.noiseBurst(this.ctx.currentTime, 0.12, 'bandpass', 2500, 2500, 2, o.node, 0.5); // squelch
      }
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  onSnapshot(_s: Snapshot): void { /* reserved */ }

  // ------------------------------------------------------------------ music
  private startMusic(): void {
    if (this.musicOn || !this.ensure()) return;
    this.musicOn = true;
    const ctx = this.ctx!;
    for (let i = 0; i < 3; i++) {
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.8;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.detune.value = -7;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 7;
      o1.connect(filter); o2.connect(filter); filter.connect(gain); gain.connect(this.musicBus);
      o1.start(); o2.start();
      this.pad.push({ o1, o2, filter, gain });
    }
  }

  private chords: Record<string, number[][]> = {
    usa: [[55, 82.4, 110, 164.8], [43.65, 65.4, 87.3, 130.8], [65.4, 98, 130.8, 196], [49, 73.4, 98, 146.8]],
    china: [[58.3, 87.3, 116.5, 174.6], [51.9, 77.8, 103.8, 155.6], [65.4, 98, 130.8, 196], [46.2, 69.3, 92.5, 138.6]],
    iran: [[51.9, 77.8, 103.8, 155.6], [58.3, 87.3, 116.5, 174.6], [46.2, 69.3, 92.5, 138.6], [55, 82.4, 110, 164.8]],
  };

  frame(dt: number, cam: THREE.Vector3, dist: number): void {
    this.lx = cam.x; this.lz = cam.z; this.ldist = dist;
    this.intensity = Math.max(0, this.intensity - dt * 0.12);
    if (!this.ctx) return;
    if (this.settings.musicVolume > 0.01 && !this.musicOn) this.startMusic();
    if (!this.musicOn) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.chordT -= dt;
    const calm = Math.min(1, this.intensity * 2);
    if (this.chordT <= 0) {
      this.chordT = 7;
      this.chordI = (this.chordI + 1) % 4;
      const ch = this.chords[this.mood][this.chordI];
      this.pad.forEach((p, i) => {
        p.o1.frequency.setTargetAtTime(ch[i + 1] ?? ch[0], now, 1.2);
        p.o2.frequency.setTargetAtTime(ch[i + 1] ?? ch[0], now, 1.2);
      });
    }
    this.pad.forEach((p, i) => {
      const target = (i === 0 ? 0.16 : i === 1 ? 0.07 + 0.12 * calm : 0.02 + 0.16 * calm);
      p.gain.gain.setTargetAtTime(target, now, 0.8);
      p.filter.frequency.setTargetAtTime(380 + 900 * calm + i * 120, now, 0.6);
    });
    // pulse drums when the fight is hot
    this.beat -= dt;
    if (this.beat <= 0 && this.intensity > 0.35) {
      this.beat = 0.46;
      const o = ctx.createGain(); o.gain.value = 0.55 * Math.min(1, this.intensity); o.connect(this.musicBus);
      this.tone(now, 110, 38, 0.22, 'sine', o, 1);
      if (Math.random() < 0.5) this.noiseBurst(now + 0.23, 0.07, 'highpass', 6000, 4000, 0.7, o, 0.4);
    } else if (this.beat <= 0) this.beat = 0.2;
  }

  dispose(): void {
    try { for (const p of this.pad) { p.o1.stop(); p.o2.stop(); } void this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null; this.musicOn = false;
  }
}
