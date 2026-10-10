import type * as THREE from 'three';
import { ENT_STRIDE, F_AIRBORNE, F_GHOST, F_MOVING, type EntityDef, type SimEvent, type Snapshot } from '../sim/types';
import { DEF_LIST } from '../sim/defs';
import { skillClass, type SkillClass } from '../sim/skills';
import type { Settings } from '../game/engine';
import { makeImpulse, makeNoise, type Rig } from './dsp';
import * as R from './recipes';
import { createLoop, type Loop, type LoopKind } from './loops';

type Alert = Extract<SimEvent, { k: 'alert' }>;

/** where a one-shot sits relative to the listener */
interface Spot { d: number; g: number; pan: number; delay: number }

interface LoopVoice {
  id: number;
  kind: LoopKind;
  loop: Loop;
  lp: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  x: number; y: number; z: number;
  pd: number; pt: number; vr: number;
  seen: number;
}

/** which continuous voice a unit definition uses (cached per definition index) */
const loopKinds = new Map<number, LoopKind | 'foot' | null>();
function loopKindOf(idx: number): LoopKind | 'foot' | null {
  let k = loopKinds.get(idx);
  if (k !== undefined) return k;
  const d = DEF_LIST[idx] as EntityDef | undefined;
  k = null;
  if (d && d.kind === 'unit') {
    switch (d.move) {
      case 'track': k = 'tracked'; break;
      case 'wheel': k = 'wheeled'; break;
      case 'foot': k = 'foot'; break;
      case 'heli': k = 'heli'; break;
      case 'drone': k = 'prop'; break;
      case 'plane': k = 'jet'; break;
      default: k = null;
    }
  }
  loopKinds.set(idx, k);
  return k;
}

/** radio acknowledgements by unit class, spoken through the browser's speech synthesiser */
const SAY: Record<SkillClass, Record<string, string[]>> = {
  infantry: { select: ['Ready', 'Sir?', 'Standing by', 'Squad ready'], move: ['Moving out', 'Yes sir', 'On the move', 'Roger that'], attack: ['Engaging', 'Open fire', 'Contact, engaging', 'Weapons free'], capture: ['Moving to secure', 'Breaching'], garrison: ['Taking position', 'Moving in'] },
  armor: { select: ['Armor ready', 'Awaiting orders', 'Tank ready'], move: ['Rolling', 'Moving', 'Affirmative', 'Tracks moving'], attack: ['Target acquired', 'Engaging', 'Cannon loaded'] },
  artillery: { select: ['Battery ready', 'Guns ready'], move: ['Redeploying', 'Moving'], attack: ['Fire mission', 'Shot out', 'Rounds on the way'] },
  fighter: { select: ['Wings ready', 'Pilot standing by'], move: ['Copy, vectoring', 'Wings up'], attack: ['Engaging bandits', 'Fox two', 'Attacking'] },
  bomber: { select: ['Bomber ready'], move: ['Copy, vectoring'], attack: ['Beginning bombing run', 'Target locked'] },
  heli: { select: ['Rotors ready', 'Chopper standing by'], move: ['Lifting off', 'Copy, moving'], attack: ['Guns hot', 'Engaging', 'Rockets away'] },
  drone: { select: ['Drone online'], move: ['Drone moving'], attack: ['Locking target'] },
  aa: { select: ['Air defense ready'], move: ['Moving'], attack: ['Tracking', 'Engaging aircraft'] },
  support: { select: ['Ready', 'Standing by'], move: ['On my way', 'Moving out'], attack: ['Affirmative'], build: ['Building', 'Construction under way'], harvest: ['Resupplying', 'On my way to the depot'], repair: ['Repairing'] },
};

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/**
 * Fully synthesised audio: layered weapon / explosion recipes with a spatial chain (distance filter, speed-of-sound delay, pan, reverb send),
 * continuous engine / rotor / jet voices that follow the units near the camera (with Doppler), adaptive music and radio-style voice lines.
 * No asset files.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private rig!: Rig;
  private master!: GainNode;
  private sfx!: GainNode;
  private loopBus!: GainNode;
  private ambBus!: GainNode;
  private uiBus!: GainNode;
  private musicBus!: GainNode;
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
  private lastAck = 0;
  private viewer = 0;
  mood: 'usa' | 'china' | 'iran' = 'usa';

  /** end times (ctx seconds) of one-shot voices in flight: the global voice budget */
  private active: number[] = [];
  private loops = new Map<number, LoopVoice>();
  private snapSeq = 0;
  private infNear: number[] = [];
  private stepT = 0;
  private ambient: Loop | null = null;
  private duckT = 0;

  constructor(private settings: Settings) {
    // browsers only allow audio after a gesture: unlock on the first one
    if (typeof window !== 'undefined') {
      const unlock = (): void => { this.ensure(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
  }

  private ensure(): boolean {
    if (this.failed) return false;
    if (!this.ctx) {
      try {
        const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
        const ctx = new AC({ latencyHint: 'interactive' });
        this.ctx = ctx;
        this.rig = { ctx, noise: makeNoise(ctx) };
        this.noise = this.rig.noise.white;
        // master -> compressor keeps big battles from clipping while preserving punch
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4.5; comp.attack.value = 0.004; comp.release.value = 0.22;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.value = this.settings.masterVolume;
        this.master.connect(comp);
        this.sfx = ctx.createGain(); this.sfx.gain.value = this.settings.sfxVolume; this.sfx.connect(this.master);
        this.loopBus = ctx.createGain(); this.loopBus.gain.value = AudioSystem.LOOP_TRIM; this.loopBus.connect(this.sfx);
        this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.5; this.ambBus.connect(this.sfx);
        this.uiBus = ctx.createGain(); this.uiBus.connect(this.master);
        this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.settings.musicVolume * 0.32; this.musicBus.connect(this.master);
        // shared reverb: dark, decaying tail with early reflections
        const reverb = ctx.createConvolver(); reverb.buffer = makeImpulse(ctx, 2.8);
        const rv = ctx.createBiquadFilter(); rv.type = 'lowpass'; rv.frequency.value = 5200;
        this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.55;
        this.reverbSend.connect(reverb); reverb.connect(rv); rv.connect(this.master);
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

  // ------------------------------------------------------------------ spatial model
  /** closer camera = louder: zooming in on the action should feel like standing closer */
  private zoomGain(): number { return clamp(1.35 - this.ldist / 320, 0.6, 1.3); }

  /** audibility of a world position (null if it cannot be heard) */
  private query(x: number, y: number, z: number, loop: boolean, min: number): Spot | null {
    const dx = x - this.lx, dz = z - this.lz;
    const d = Math.hypot(dx, dz, Math.max(0, y) * 0.4);
    const radius = (loop ? 250 + this.ldist * 0.9 : 420 + this.ldist * 1.5);
    const g = Math.pow(Math.max(0, 1 - d / radius), loop ? 2 : 1.5) * this.zoomGain();
    if (g < min) return null;
    const c = Math.cos(this.listenerYaw), s = Math.sin(this.listenerYaw);
    const right = dx * c - dz * s;
    return { d, g, pan: clamp(right / (50 + d * 0.35), -0.92, 0.92), delay: Math.min(1.5, d / 450) };
  }

  /** build the spatial chain for a one-shot and return its input node */
  private chain(sp: Spot, wet: number): GainNode {
    const ctx = this.ctx!;
    const input = ctx.createGain();
    input.gain.value = sp.g;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.value = clamp(19000 * Math.exp(-sp.d / 240), 1000, 19000); // air absorbs highs: far-off gunfire turns into a thud
    const pan = ctx.createStereoPanner(); pan.pan.value = sp.pan;
    input.connect(lp); lp.connect(pan); pan.connect(this.sfx);
    if (wet > 0) {
      const send = ctx.createGain(); send.gain.value = clamp(wet * (0.5 + sp.d / 500), 0, 0.9);
      pan.connect(send); send.connect(this.reverbSend);
    }
    return input;
  }

  /** global voice budget: low priority sounds are dropped first when the battle gets busy */
  private reserve(dur: number, prio: number): boolean {
    const now = this.ctx!.currentTime;
    const a = this.active;
    let w = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > now) a[w++] = a[i];
    a.length = w;
    const cap = prio >= 2 ? 90 : prio === 1 ? 64 : 44;
    if (a.length >= cap) return false;
    a.push(now + dur);
    return true;
  }

  /** play a recipe at a world position through the spatial chain */
  private fire(key: string, max: number, win: number, x: number, y: number, z: number, wet: number, prio: number, dur: number, fn: (o: AudioNode, t: number) => void): boolean {
    if (!this.limit(key, max, win)) return false;
    const sp = this.query(x, y, z, false, prio >= 2 ? 0.006 : 0.02);
    if (!sp || !this.reserve(dur, prio)) return false;
    fn(this.chain(sp, wet), this.ctx!.currentTime + sp.delay);
    return true;
  }

  private setListener(cam: THREE.Vector3): void { this.lx = cam.x; this.lz = cam.z; }

  /** briefly pull the engines and music down so a big explosion cuts through */
  private duck(amount: number, secs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now < this.duckT) return;
    this.duckT = now + secs * 0.8;
    this.loopBus.gain.cancelScheduledValues(now);
    this.loopBus.gain.setTargetAtTime(AudioSystem.LOOP_TRIM * (1 - amount), now, 0.015);
    this.loopBus.gain.setTargetAtTime(AudioSystem.LOOP_TRIM, now + secs * 0.5, secs * 0.5);
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setTargetAtTime(this.settings.musicVolume * 0.32 * (1 - amount * 0.8), now, 0.015);
    this.musicBus.gain.setTargetAtTime(this.settings.musicVolume * 0.32, now + secs * 0.5, secs * 0.5);
  }

  // simple helpers used by UI beeps, music drums and voice squelch
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
    this.setListener(cam);
    if (!this.ensure()) return;
    const rig = this.rig;
    const d = ev.src !== undefined ? DEF_LIST[ev.src] : undefined;
    const air = d?.layer === 'air';
    const inf = !!d?.roles.includes('infantry');
    // faction flavour: Western guns are crisp, Chinese slightly lower, Iranian heavier and rougher
    const fac = d?.faction === 'china' ? 0.93 : d?.faction === 'iran' ? 0.86 : 1;
    const jit = 0.94 + Math.random() * 0.12;
    const dmg = ev.dmg ?? 0;
    this.intensity = Math.min(1.5, this.intensity + 0.012);
    const { x, y, z } = ev;
    switch (ev.vfx) {
      case 'bullet': {
        if (inf) {
          if (this.fire('rifle', 4, 80, x, y, z, 0.08, 0, 0.5, (o, t) => R.rifle(rig, o, t, fac * jit, ev.big ? 0.3 : 0)) && Math.random() < 0.4) this.directImpact(ev);
        } else if (air) {
          if (this.fire('gat', 3, 80, x, y, z, 0.1, 1, 0.5, (o, t) => R.autocannon(rig, o, t, fac * jit))) this.directImpact(ev);
        } else if (this.fire('mg', 3, 80, x, y, z, 0.1, 1, 0.5, (o, t) => R.rifle(rig, o, t, 0.9 * fac * jit, 1)) && Math.random() < 0.4) this.directImpact(ev);
        break;
      }
      case 'cannon': {
        if (ev.big || dmg >= 40) {
          this.fire('tank', 3, 90, x, y, z, 0.3, 2, 1.6, (o, t) => R.tankGun(rig, o, t, fac * jit, 1));
        } else if (this.fire('auto', 3, 80, x, y, z, 0.12, 1, 0.5, (o, t) => R.autocannon(rig, o, t, fac * jit))) {
          if (Math.random() < 0.5) this.directImpact(ev);
        }
        break;
      }
      case 'shell': {
        // howitzer / mortar: deep thump now, whistle just before the round lands
        if (this.fire('shell', 3, 90, x, y, z, 0.4, 2, 2.2, (o, t) => R.tankGun(rig, o, t, 0.75 * fac * jit, 1.4))) {
          const w = d?.weapons?.find((q) => q.vfx === 'shell');
          const dist = Math.hypot(ev.tx - x, ev.tz - z);
          const flight = dist / Math.max(60, w?.speed || 150);
          const dur = clamp(flight * 0.7, 0.5, 1.4);
          const lag = Math.max(0, flight - dur);
          this.fire('whistle', 3, 120, ev.tx, ev.ty, ev.tz, 0.2, 0, dur + lag + 0.2, (o, t) => R.whistle(rig, o, t + lag, dur));
        }
        break;
      }
      case 'rocket': this.fire('rocket', 3, 100, x, y, z, 0.25, 1, 2, (o, t) => R.rocketLaunch(rig, o, t, ev.big ? 1.4 : 1)); break;
      case 'missile': this.fire('missile', 3, 100, x, y, z, 0.2, 1, 1.6, (o, t) => R.missileLaunch(rig, o, t)); break;
      case 'bomb': {
        const dur = clamp(Math.sqrt(2 * Math.max(10, y) / 40), 0.6, 1.6);
        this.fire('bombw', 2, 150, ev.tx, ev.ty, ev.tz, 0.2, 1, dur + 0.3, (o, t) => R.whistle(rig, o, t, dur));
        break;
      }
      case 'flame': this.fire('flame', 3, 100, x, y, z, 0.05, 0, 1, (o, t) => R.flameThrower(rig, o, t)); break;
      case 'cyber': case 'emp': this.fire('zap', 2, 200, x, y, z, 0.1, 1, 1, (o, t) => R.zap(rig, o, t, 0)); break;
      default: break;
    }
  }

  /** the thwack of a direct-fire round hitting its target */
  private directImpact(ev: Extract<SimEvent, { k: 'shot' }>): void {
    if (ev.p) return;
    const rig = this.rig;
    const metal = Math.random() < 0.5;
    this.fire('imp', 3, 90, ev.tx, ev.ty, ev.tz, 0.03, 0, 0.5, (o, t) => (metal ? R.impactMetal : R.impactDirt)(rig, o, t + 0.04));
  }

  boom(ev: Extract<SimEvent, { k: 'boom' }>, cam: THREE.Vector3): void {
    this.setListener(cam);
    if (!this.ensure()) return;
    const rig = this.rig;
    const s = Math.max(0.5, Math.min(8, ev.size));
    const big = s > 3;
    this.intensity = Math.min(1.5, this.intensity + 0.05 + ev.size * 0.02);
    const wet = Math.min(0.8, 0.12 + s * 0.08);
    let played = false;
    switch (ev.kind) {
      case 'nuke': played = this.fire('nuke', 1, 400, ev.x, ev.y, ev.z, 0.9, 3, 9, (o, t) => R.nukeBlast(rig, o, t)); break;
      case 'emp': case 'cyber': played = this.fire('zapb', 2, 200, ev.x, ev.y, ev.z, 0.4, 1, 2.5, (o, t) => R.zap(rig, o, t, 1)); break;
      case 'fire': played = this.fire('fireb', 3, 120, ev.x, ev.y, ev.z, wet, 0, 2, (o, t) => R.explosion(rig, o, t, s * 0.55)); break;
      default:
        played = this.fire(big ? 'boomL' : 'boomS', big ? 3 : 5, 90, ev.x, ev.y, ev.z, wet, big ? 2 : 1, 1.4 + s * 0.45, (o, t) => R.explosion(rig, o, t, s, ev.kind === 'big' && s >= 3));
    }
    if (played && big) {
      const sp = this.query(ev.x, ev.y, ev.z, false, 0);
      if (sp && sp.g > 0.35) this.duck(Math.min(0.55, 0.15 + s * 0.05) * sp.g, 0.9);
    }
  }

  flare(ev: { x: number; y: number; z: number }, cam: THREE.Vector3): void {
    this.setListener(cam);
    if (!this.ensure()) return;
    const rig = this.rig;
    this.fire('flare', 2, 200, ev.x, ev.y, ev.z, 0.1, 1, 0.8, (o, t) => R.flareHiss(rig, o, t));
  }

  promote(vet: number): void {
    if (!this.ensure()) return;
    const n: [number, number][] = vet >= 3 ? [[523, 0.09], [659, 0.09], [784, 0.09], [1047, 0.3]] : vet === 2 ? [[523, 0.09], [784, 0.09], [988, 0.22]] : [[523, 0.09], [784, 0.2]];
    this.beepSeq(n, 0.2, 'triangle');
    this.say(vet >= 3 ? 'Heroic' : vet === 2 ? 'Elite' : 'Veteran');
  }

  private beepSeq(notes: [number, number][], vol = 0.25, type: OscillatorType = 'sine'): void {
    if (!this.ensure()) return;
    const t0 = this.ctx!.currentTime;
    const g = this.ctx!.createGain(); g.gain.value = vol; g.connect(this.uiBus);
    notes.forEach(([f, d], i) => this.tone(t0 + i * 0.11, f, f * 0.98, d, type, g, 0.9));
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
      if (this.ctx) R.squelch(this.rig, this.uiBus, this.ctx.currentTime);
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  /** a unit acknowledges a selection or an order ("Moving out", "Engaging", ...) */
  ack(kind: string, defIdx: number): void {
    if (!this.settings.voice || typeof speechSynthesis === 'undefined') return;
    const now = performance.now();
    if (now - this.lastAck < (kind === 'select' ? 1500 : 1100)) return;
    const d = DEF_LIST[defIdx] as EntityDef | undefined;
    if (!d || d.kind !== 'unit') return;
    const cls = skillClass(d);
    const lines = SAY[cls][kind] ?? SAY[cls].move;
    if (!lines?.length) return;
    this.lastAck = now;
    try {
      const u = new SpeechSynthesisUtterance(lines[Math.floor(Math.random() * lines.length)]);
      u.rate = 1.12 + Math.random() * 0.08;
      u.pitch = (cls === 'infantry' ? 0.8 : cls === 'armor' ? 0.65 : cls === 'heli' || cls === 'fighter' || cls === 'bomber' ? 0.9 : 0.75) + Math.random() * 0.1;
      u.volume = Math.min(1, this.settings.masterVolume * 0.85);
      if (this.ensure()) R.squelch(this.rig, this.uiBus, this.ctx!.currentTime);
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ engines, rotors, footsteps
  private static readonly MAX_LOOPS = 14;
  private static readonly LOOP_TRIM = 0.8;

  /** pick the engine voices nearest the camera, keep them in step with their units and fade out the rest */
  onSnapshot(s: Snapshot): void {
    if (!this.ctx || this.failed) return;
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    this.snapSeq++;
    const E = s.ents;
    const reach = 310 + this.ldist;
    const cands: { o: number; d2: number; kind: LoopKind }[] = [];
    this.infNear.length = 0;
    for (let i = 0; i < s.n; i++) {
      const o = i * ENT_STRIDE;
      const flags = E[o + 9] | 0;
      if (flags & F_GHOST) continue;
      const kind = loopKindOf(E[o + 1] | 0);
      if (!kind) continue;
      const air = kind === 'jet' || kind === 'heli' || kind === 'prop';
      if (air ? !(flags & F_AIRBORNE) : !(flags & F_MOVING)) continue;
      const dx = E[o + 3] - this.lx, dz = E[o + 5] - this.lz;
      const d2 = dx * dx + dz * dz;
      if (kind === 'foot') { if (d2 < 95 * 95 && this.infNear.length < 24) this.infNear.push(E[o + 3], E[o + 5]); continue; }
      if (d2 < reach * reach) cands.push({ o, d2, kind });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    if (cands.length > AudioSystem.MAX_LOOPS) cands.length = AudioSystem.MAX_LOOPS;
    for (const c of cands) {
      const o = c.o;
      const id = E[o] | 0;
      const d = DEF_LIST[E[o + 1] | 0];
      let v = this.loops.get(id);
      if (!v) { v = this.makeVoice(id, c.kind); this.loops.set(id, v); }
      v.seen = this.snapSeq;
      v.x = E[o + 3]; v.y = E[o + 4]; v.z = E[o + 5];
      const ratio = clamp((E[o + 14] || 0) / Math.max(1, d?.speed ?? 1), 0, 1.2);
      // radial velocity -> Doppler (full strength for aircraft, a hint for ground vehicles)
      const dist = Math.hypot(v.x - this.lx, v.z - this.lz);
      const dt = now - v.pt;
      if (dt > 0.03 && v.pt > 0) v.vr += ((dist - v.pd) / dt - v.vr) * 0.5;
      v.pd = dist; v.pt = now;
      const strength = c.kind === 'jet' || c.kind === 'heli' || c.kind === 'prop' ? 0.9 : 0.25;
      const pitch = clamp(1 / (1 + (strength * v.vr) / 343), 0.8, 1.25);
      const rpm = c.kind === 'jet' ? 0.5 + 0.5 * ratio : c.kind === 'heli' ? 0.35 + 0.65 * ratio : c.kind === 'prop' ? 0.4 + 0.6 * ratio : 0.25 + 0.75 * ratio;
      v.loop.set({ rpm: Math.min(1, rpm), speed: Math.min(1, ratio), pitch }, ctx.currentTime, 0.25);
    }
    for (const [id, v] of this.loops) {
      if (v.seen === this.snapSeq) continue;
      this.loops.delete(id);
      v.loop.stop(ctx.currentTime);
      setTimeout(() => { try { v.lp.disconnect(); v.gain.disconnect(); v.pan.disconnect(); } catch { /* gone */ } }, 900);
    }
  }

  private makeVoice(id: number, kind: LoopKind): LoopVoice {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    lp.connect(gain); gain.connect(pan); pan.connect(this.loopBus);
    const loop = createLoop(kind, this.rig, lp, ctx.currentTime);
    return { id, kind, loop, lp, gain, pan, x: 0, y: 0, z: 0, pd: 0, pt: 0, vr: 0, seen: 0 };
  }

  /** per-frame spatial update of the engine voices, footsteps and the ambient bed */
  private updateVoices(dt: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    for (const v of this.loops.values()) {
      const sp = this.query(v.x, v.y, v.z, true, 0);
      const g = sp ? sp.g : 0;
      v.gain.gain.setTargetAtTime(g * (v.kind === 'jet' ? 1.0 : v.kind === 'heli' ? 1.0 : 0.9), now, 0.08);
      if (sp) {
        v.pan.pan.setTargetAtTime(sp.pan, now, 0.08);
        v.lp.frequency.setTargetAtTime(clamp(16000 * Math.exp(-sp.d / 260), 900, 16000), now, 0.1);
      }
    }
    if (!this.ambient) this.ambient = createLoop('wind', this.rig, this.ambBus, now);
    this.ambient.set({ rpm: Math.min(1, 0.25 + this.intensity * 0.3), speed: 0, pitch: 1 }, now, 1.5);
    // footsteps of marching infantry: a few of the nearest per second
    this.stepT -= dt;
    if (this.stepT <= 0 && this.infNear.length) {
      this.stepT = 0.1 + Math.random() * 0.12;
      const k = Math.floor(Math.random() * (this.infNear.length / 2)) * 2;
      const x = this.infNear[k], z = this.infNear[k + 1];
      const rig = this.rig;
      this.fire('step', 2, 100, x, 0, z, 0.02, 0, 0.3, (o, t) => R.footstep(rig, o, t));
    }
  }

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
    this.updateVoices(dt);
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
    this.loops.clear(); this.ambient = null; this.pad = [];
    this.ctx = null; this.musicOn = false;
  }
}
