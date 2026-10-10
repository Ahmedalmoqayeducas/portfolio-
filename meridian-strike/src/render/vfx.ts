import * as THREE from 'three';
import type { Terrain } from './terrain';
import { bakeVfxTextures, SHEET, type VfxTextures } from './particleTex';
import { buildHeightTexture, groundFrom, makeUniforms, type Ground, type VfxUniforms } from './vfxCore';
import { VolLayer, type CamInfo } from './vfxVol';
import { GlowLayer, GLOW } from './vfxGlow';
import { DecalLayer, DomeLayer, ShockLayer, StreakLayer, DECAL } from './vfxMisc';
import { DebrisField, DEBRIS } from './debris';

export type ExplosionKind = 'gen' | 'big' | 'air' | 'nuke' | 'emp' | 'fire' | 'ground' | 'cyber';
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

const rnd = Math.random;
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Emitter {
  x: number; y: number; z: number; start: number; until: number; rate: number; acc: number; kind: number; size: number; spread: number; light: boolean; a2: number;
}
interface Timed { at: number; fn: () => void }

/** dust / dirt tint by biome */
const BIOME_DUST: Record<string, [number, number, number]> = {
  desert: [0.47, 0.35, 0.24], urban: [0.40, 0.37, 0.33], oasis: [0.47, 0.35, 0.24], highland: [0.74, 0.77, 0.83], mixed: [0.40, 0.33, 0.25],
};
const BIOME_DIRT: Record<string, number> = { desert: 0x6b4a2c, urban: 0x4a4640, oasis: 0x6b4a2c, highland: 0x55575c, mixed: 0x4e3d2a };

const CAP_VOL = 26000, CAP_GLOW = 14000;

/**
 * Combat / atmosphere VFX facade.
 *  - VolLayer   : sorted premultiplied billboards (smoke, dust, fire, flames) driven by procedural flipbooks
 *  - GlowLayer  : additive HDR sparks / flashes / glows
 *  - DebrisField: instanced lit chunks with ballistic physics
 *  - decals, shock rings, blast domes, tracer streaks, point-light pool
 */
export class Vfx {
  readonly group = new THREE.Group();
  readonly tex: VfxTextures;
  readonly vol: VolLayer;
  readonly glow: GlowLayer;
  readonly streaks: StreakLayer;
  readonly decals: DecalLayer;
  readonly shocks: ShockLayer;
  readonly domes: DomeLayer;
  readonly debris: DebrisField;
  readonly ground: Ground;
  readonly uniforms: VfxUniforms;
  private lights: { l: THREE.PointLight; t: number; peak: number }[] = [];
  private fireLights: { l: THREE.PointLight; em: Emitter | null; seed: number }[] = [];
  private emitters: Emitter[] = [];
  private timed: Timed[] = [];
  private shakes: { x: number; z: number; amt: number; t: number }[] = [];
  /** legacy field (previously the smoke tint); kept for API compatibility */
  readonly light = new THREE.Vector3(1, 1, 1);
  private now = 0;
  flash = 0;
  /** 0 freezes all effects (used by screenshot tests), 1 = realtime */
  timeScale = 1;
  private q = 1;
  private lightsOn = true;
  private sunSet = false;
  private windX = 2.2;
  private windZ = 0.9;
  private cam: CamInfo & { known: boolean } = { x: 0, y: 80, z: 0, fx: 0, fy: -1, fz: 0, known: false };
  private dustCol: [number, number, number];
  private dirt: number;
  private lightScan = 0;
  private anchors = new Float32Array(96 * 5);
  private nAnch = 0;
  private frame = 0;

  constructor(terrain: Terrain, scene: THREE.Scene) {
    this.ground = groundFrom(terrain);
    this.tex = bakeVfxTextures();
    const heightTex = buildHeightTexture(this.ground, 512);
    this.uniforms = makeUniforms(this.tex, heightTex, this.ground);
    this.vol = new VolLayer(CAP_VOL, this.uniforms, this.ground);
    this.glow = new GlowLayer(CAP_GLOW, this.uniforms, this.ground);
    this.streaks = new StreakLayer(3000);
    this.decals = new DecalLayer(1500, this.uniforms, this.tex.decal);
    this.shocks = new ShockLayer(48, this.uniforms);
    this.domes = new DomeLayer(10);
    this.debris = new DebrisField(this.ground);
    this.debris.onTrail = (x, y, z, heat, size) => this.debrisTrail(x, y, z, heat, size);
    this.dustCol = BIOME_DUST[this.ground.biome] ?? BIOME_DUST.desert;
    this.dirt = BIOME_DIRT[this.ground.biome] ?? BIOME_DIRT.desert;
    this.group.add(this.decals.mesh, this.shocks.mesh, this.domes.mesh, this.debris.group, this.vol.mesh, this.glow.mesh, this.streaks.mesh);
    const hook = this.beforeRender;
    this.vol.mesh.onBeforeRender = hook; this.glow.mesh.onBeforeRender = hook; this.streaks.mesh.onBeforeRender = hook;
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 90, 1.6);
      l.castShadow = false;
      this.group.add(l);
      this.lights.push({ l, t: 0, peak: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 70, 1.7);
      l.castShadow = false;
      this.group.add(l);
      this.fireLights.push({ l, em: null, seed: i * 17.3 });
    }
    this.group.name = 'vfx';
    scene.add(this.group);
    this.setSun(this.uniforms.uSunDir.value, 1);
    this.sunSet = false;
  }

  // ---------------------------------------------------------------------------------- environment hooks
  /** legacy: scalar daylight 0..1 (night..day). Prefer setSun(). */
  setDaylight(k: number): void {
    if (this.sunSet) return;
    const d = this.uniforms.uSunDir.value;
    // a plausible default sun if the caller never gives us one
    this.applyLight(d, k, 0.35);
  }

  /** sun direction (pointing from the ground towards the sun) and 0..1 daylight, as computed by Environment */
  setSun(sunDir: THREE.Vector3, daylight: number): void {
    this.sunSet = true;
    const elev = Math.asin(Math.min(1, Math.max(-1, sunDir.y))) * (180 / Math.PI);
    const low = 1 - smooth(4, 30, elev);
    this.applyLight(sunDir, daylight, low);
  }

  private applyLight(sunDir: THREE.Vector3, day: number, low: number): void {
    const u = this.uniforms;
    const L = u.uSunDir.value;
    if (day > 0.02) L.copy(sunDir); else L.set(-sunDir.x, Math.max(0.5, -sunDir.y), -sunDir.z);
    L.normalize();
    // warm near the horizon, blue moon at night (mirrors Environment.setHour)
    const r = mix(1, 1, low), g = mix(0.96, 0.58, low), b = mix(0.9, 0.3, low);
    const nr = mix(0.45, r, day), ng = mix(0.58, g, day), nb = mix(1.0, b, day);
    const k = 0.78 * (0.22 + 0.78 * day) * (day > 0.02 ? 1 : 0.55);
    u.uSunCol.value.set(nr * k, ng * k, nb * k);
    const sk = 0.12 + 0.88 * day;
    u.uSkyCol.value.set(mix(0.05, mix(0.30, 0.36, low), day) * sk + 0.02, mix(0.07, mix(0.34, 0.29, low), day) * sk + 0.03, mix(0.13, mix(0.40, 0.26, low), day) * sk + 0.06);
    u.uGndCol.value.set(0.20 * sk + 0.012, 0.165 * sk + 0.012, 0.125 * sk + 0.011);
  }

  /** scale particle counts / detail. Wired from GameSession.applyQuality. */
  setQuality(level: QualityLevel): void {
    this.q = level === 'low' ? 0.34 : level === 'medium' ? 0.62 : level === 'high' ? 0.88 : 1;
    this.uniforms.uDetail.value = level === 'low' ? 0 : 1;
    this.vol.sortEnabled = level !== 'low';
    this.lightsOn = level !== 'low';
    if (!this.lightsOn) for (const L of this.lights) { L.l.intensity = 0; L.t = 0; }
  }

  private beforeRender = (_r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void => {
    const override = scene.overrideMaterial !== null;
    this.vol.setPassVisibility(override); this.glow.setPassVisibility(override); this.streaks.setPassVisibility(override);
    if (!override) {
      const e = camera.matrixWorld.elements, c = this.cam;
      c.x = e[12]; c.y = e[13]; c.z = e[14]; c.fx = -e[8]; c.fy = -e[9]; c.fz = -e[10]; c.known = true;
    }
  };

  // ---------------------------------------------------------------------------------- frame update
  update(dtReal: number): void {
    const dt = Math.min(0.1, dtReal) * this.timeScale;
    if (dt <= 0) return;
    this.step(dt);
  }

  /** advance the effects by `seconds` in fixed steps (tests / cinematics) */
  simulate(seconds: number, step = 1 / 30): void {
    let t = seconds;
    while (t > 1e-6) { const d = Math.min(step, t); this.step(d); t -= d; }
  }

  private step(dt: number): void {
    this.now += dt;
    this.frame++;
    const gust = 0.85 + 0.3 * Math.sin(this.now * 0.37) * Math.cos(this.now * 0.13 + 1);
    const wx = this.windX * gust, wz = this.windZ * gust;
    this.uniforms.uTime.value = this.now;
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (this.now >= this.timed[i].at) { const f = this.timed[i].fn; this.timed.splice(i, 1); f(); }
    }
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (this.now > e.until) { this.emitters.splice(i, 1); continue; }
      this.runEmitter(e, dt);
    }
    this.vol.update(dt, this.now, this.cam, wx, wz);
    this.glow.update(dt, this.now);
    this.streaks.update(dt);
    this.decals.update(dt);
    this.shocks.update(dt);
    this.domes.update(dt);
    this.debris.update(dt);
    // anchors for projectile trails expire
    for (let i = this.nAnch - 1; i >= 0; i--) if (this.now - this.anchors[i * 5 + 3] > 0.25) this.removeAnchor(i);
    if (this.lightsOn) {
      for (const L of this.lights) {
        if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.peak * (L.t / 0.45)); if (L.t <= 0) L.l.intensity = 0; }
      }
      this.updateFireLights(dt);
    }
    for (let i = this.shakes.length - 1; i >= 0; i--) { this.shakes[i].t -= dt; if (this.shakes[i].t <= 0) this.shakes.splice(i, 1); }
    this.flash = Math.max(0, this.flash - dt * 1.6);
  }

  shakeAt(x: number, z: number, amt: number): void { this.shakes.push({ x, z, amt, t: 0.45 }); }
  shakeValue(cx: number, cz: number): number {
    let v = 0;
    for (const s of this.shakes) { const d = Math.hypot(s.x - cx, s.z - cz); v += (s.amt * (s.t / 0.45)) / (1 + d * 0.012); }
    return Math.min(2.5, v);
  }

  private later(delay: number, fn: () => void): void { this.timed.push({ at: this.now + delay, fn }); }

  private pointLight(x: number, y: number, z: number, intensity: number, color = 0xffa860): void {
    if (!this.lightsOn) return;
    let best = this.lights[0];
    for (const L of this.lights) if (L.t < best.t) best = L;
    best.l.position.set(x, y + 3, z);
    best.l.color.setHex(color);
    best.peak = intensity; best.t = 0.45;
    best.l.intensity = intensity;
  }

  private updateFireLights(dt: number): void {
    this.lightScan -= dt;
    if (this.lightScan <= 0) {
      this.lightScan = 0.35;
      const c = this.cam;
      for (const F of this.fireLights) F.em = null;
      // pick the two nearest sizeable fires to the camera focus
      for (const e of this.emitters) {
        if (!e.light || e.kind !== 0) continue;
        const d = Math.hypot(e.x - c.x - c.fx * 60, e.z - c.z - c.fz * 60) / Math.max(0.6, e.size);
        for (const F of this.fireLights) {
          if (!F.em || d < Math.hypot(F.em.x - c.x - c.fx * 60, F.em.z - c.z - c.fz * 60) / Math.max(0.6, F.em.size)) { const prev = F.em; F.em = e; if (prev) { /* push previous down */ for (const G of this.fireLights) if (G !== F && !G.em) G.em = prev; } break; }
        }
      }
    }
    for (const F of this.fireLights) {
      const e = F.em;
      if (!e || this.now > e.until) { F.l.intensity *= Math.max(0, 1 - dt * 6); continue; }
      const age = this.now - e.start, left = e.until - this.now;
      const ramp = Math.min(1, age / 1.2) * Math.min(1, left / Math.max(1, (e.until - e.start) * 0.3));
      const fl = 0.78 + 0.22 * Math.sin(this.now * 17 + F.seed) * Math.sin(this.now * 7.3 + F.seed * 2) + 0.12 * Math.sin(this.now * 31 + F.seed);
      F.l.position.set(e.x, e.y + 2.5 + e.size, e.z);
      F.l.intensity = (1.4 + 1.5 * e.size) * ramp * fl;
      F.l.color.setHex(0xff8a3a);
    }
  }

  // ---------------------------------------------------------------------------------- spawn helpers
  private lodAt(x: number, z: number): number {
    // global budget: thin everything out as the particle pool fills up
    const bud = 1 - smooth(0.45, 0.95, this.vol.n / CAP_VOL) * 0.85;
    if (!this.cam.known) return this.q * bud;
    const d = Math.hypot(x - this.cam.x, z - this.cam.z);
    return this.q * bud * (d < 220 ? 1 : d < 520 ? mix(1, 0.5, (d - 220) / 300) : 0.4);
  }
  private cnt(n: number, k: number): number { return n <= 0 ? 0 : Math.max(1, Math.round(n * k)); }

  private groundY(x: number, z: number): number { return Math.max(this.ground.heightAt(x, z), this.ground.waterY); }

  /** smoke puff preset: returns a reset spawn configured as billowing smoke. caller sets x,y,z,v*,life,s0,s1 */
  pSmoke(shade: number, a: number): ReturnType<VolLayer['s']['reset']> {
    const s = this.vol.s.reset();
    s.sheet = Math.floor(rnd() * 4);
    s.frame0 = rnd() * 1.2; s.frames = 2.2;
    s.r = shade * (0.96 + rnd() * 0.1); s.g = shade * (0.95 + rnd() * 0.08); s.b = shade * (0.93 + rnd() * 0.1);
    s.a = a; s.drag = 0.55; s.buoy = 1.4; s.turb = 1.8; s.windK = 1;
    s.rotv = (rnd() - 0.5) * 0.35; s.fadeIn = 0.25; s.fadeOut = 0.5; s.dis0 = 0.03; s.dis1 = 0.72;
    return s;
  }
  private pFire(heat: number): ReturnType<VolLayer['s']['reset']> {
    const s = this.vol.s.reset();
    s.sheet = SHEET.FIRE; s.frame0 = 0; s.frames = 15; s.heat = heat; s.hdecay = 0.9; s.add = 0.4; s.a = 1;
    s.drag = 1.4; s.buoy = 2.5; s.turb = 1.0; s.windK = 0.25; s.rotv = (rnd() - 0.5) * 0.9; s.fadeIn = 0.04; s.fadeOut = 0.28; s.dis0 = 0; s.dis1 = 0.5;
    return s;
  }
  private pDust(a: number): ReturnType<VolLayer['s']['reset']> {
    const s = this.vol.s.reset();
    s.sheet = SHEET.DUST; s.frame0 = Math.floor(rnd() * 8); s.frames = 0;
    const d = this.dustCol, v = 0.9 + rnd() * 0.2;
    s.r = d[0] * v; s.g = d[1] * v; s.b = d[2] * v;
    s.a = a; s.drag = 1.8; s.buoy = 0.6; s.turb = 1.2; s.windK = 0.8; s.hug = 0.35;
    s.rotv = (rnd() - 0.5) * 0.7; s.fadeIn = 0.12; s.fadeOut = 0.6; s.dis0 = 0; s.dis1 = 0.65;
    return s;
  }
  private gDisc(): ReturnType<GlowLayer['s']['reset']> { return this.glow.s.reset(); }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, width: number, hot = 1): void {
    const g = this.gDisc();
    g.x = x; g.y = y; g.z = z; g.vx = vx; g.vy = vy; g.vz = vz; g.life = life; g.shape = GLOW.STREAK; g.s0 = width; g.s1 = width * 0.4;
    g.r0 = 6 * hot; g.g0 = 4.0 * hot; g.b0 = 1.5 * hot; g.r1 = 1.6; g.g1 = 0.3; g.b1 = 0.04; g.a0 = 1; g.a1 = 0.35;
    g.stretch = 0.05; g.drag = 0.25; g.grav = 22; g.bounce = 1;
    this.glow.commit();
  }

  private flashAt(x: number, y: number, z: number, size: number, life: number, star = true): void {
    const g = this.gDisc();
    g.x = x; g.y = y; g.z = z; g.life = life; g.shape = GLOW.DISC; g.s0 = size * 0.7; g.s1 = size * 1.1;
    g.r0 = 5.0; g.g0 = 3.6; g.b0 = 1.9; g.r1 = 1.6; g.g1 = 0.6; g.b1 = 0.15; g.a0 = 0.9; g.a1 = 0;
    this.glow.commit();
    if (star) {
      const h = this.gDisc();
      h.x = x; h.y = y; h.z = z; h.life = life * 0.8; h.shape = GLOW.STAR; h.s0 = size * 1.4; h.s1 = size * 2.0;
      h.r0 = 7; h.g0 = 5.4; h.b0 = 3.2; h.r1 = 2.4; h.g1 = 1.0; h.b1 = 0.3; h.a0 = 1; h.a1 = 0;
      this.glow.commit();
    }
  }

  // ---------------------------------------------------------------------------------- continuous emitters
  private addEmitter(kind: number, x: number, y: number, z: number, seconds: number, rate: number, size: number, spread: number, light = false, a2 = 0): void {
    if (this.emitters.length > 160) return;
    this.emitters.push({ x, y, z, start: this.now, until: this.now + seconds, rate, acc: 0, kind, size, spread, light, a2 });
  }

  private runEmitter(e: Emitter, dt: number): void {
    const age = this.now - e.start, left = e.until - this.now, dur = e.until - e.start;
    const ramp = Math.min(1, age / 1.3) * Math.min(1, left / Math.max(1, dur * 0.28));
    const lod = this.lodAt(e.x, e.z);
    if (lod < 0.12) return;
    e.acc += dt * e.rate * ramp * Math.min(1, lod * 1.3);
    while (e.acc >= 1) {
      e.acc -= 1;
      if (e.kind === 0) this.burnPuff(e, ramp);
      else if (e.kind === 1) this.thinSmoke(e, ramp);
      else this.columnPuff(e, ramp);
    }
  }

  private burnPuff(e: Emitter, ramp: number): void {
    const sz = Math.max(e.size, e.spread * 0.32), sp = e.spread;
    const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * sp;
    const x = e.x + Math.cos(a) * rr, z = e.z + Math.sin(a) * rr;
    const gy = this.groundY(x, z);
    const y = Math.max(e.y, gy) + 0.3;
    const k = rnd();
    if (k < 0.34) {
      // flame tongue
      const s = this.vol.s.reset();
      s.sheet = SHEET.FLAME; s.frame0 = 0; s.frames = 7; s.heat = 1.0; s.hdecay = 0.7; s.add = 0.5; s.a = 1;
      s.x = x; s.y = y + sz * 0.9; s.z = z; s.vx = (rnd() - 0.5) * 0.6; s.vy = 2.6 + rnd() * 2.6; s.vz = (rnd() - 0.5) * 0.6;
      s.life = 0.6 + rnd() * 0.5; s.s0 = sz * (2.4 + rnd() * 1.4); s.s1 = sz * 1.0; s.rot = (rnd() - 0.5) * 0.25; s.rotv = 0;
      s.drag = 0.9; s.buoy = 3; s.turb = 1.4; s.windK = 0.3; s.fadeIn = 0.06; s.fadeOut = 0.35; s.dis0 = 0; s.dis1 = 0.4;
      this.vol.commit();
    } else if (k < 0.56) {
      // billowing fire puff (late fireball frames)
      const s = this.pFire(0.85); s.add = 0.55; s.frame0 = 5; s.frames = 9;
      s.x = x; s.y = y + sz * 0.6; s.z = z; s.vx = (rnd() - 0.5) * 0.8; s.vy = 1.6 + rnd() * 2; s.vz = (rnd() - 0.5) * 0.8;
      s.life = 0.7 + rnd() * 0.5; s.s0 = sz * (1.6 + rnd()); s.s1 = sz * (2.6 + rnd()); s.drag = 1.2; s.buoy = 2.5; s.hdecay = 0.8; s.windK = 0.25;
      this.vol.commit();
    } else if (k < 0.92) {
      // black smoke column
      const s = this.pSmoke(0.085 + rnd() * 0.05, 0.62);
      s.x = x; s.y = y + sz * 1.4; s.z = z; s.vx = (rnd() - 0.5) * 0.8; s.vy = 3.4 + rnd() * 2.4 + sz; s.vz = (rnd() - 0.5) * 0.8;
      s.life = 5 + rnd() * 3.5; s.s0 = sz * (1.3 + rnd()); s.s1 = sz * (4.5 + rnd() * 2.5);
      s.buoy = 1.0; s.drag = 0.4; s.glow0 = 0.5; s.frames = 2;
      this.vol.commit();
    } else if (rnd() < 0.7 * this.q) {
      // ember
      const g = this.gDisc();
      g.x = x; g.y = y + 0.5; g.z = z; g.vx = (rnd() - 0.5) * 2; g.vy = 2 + rnd() * 4; g.vz = (rnd() - 0.5) * 2;
      g.life = 0.8 + rnd() * 1.2; g.shape = GLOW.DISC; g.s0 = 0.16 + rnd() * 0.12; g.s1 = 0.05;
      g.r0 = 3.4; g.g0 = 1.5; g.b0 = 0.3; g.r1 = 1.0; g.g1 = 0.12; g.b1 = 0.0; g.a0 = 1; g.a1 = 0.2; g.drag = 0.4; g.grav = -1.5; g.flicker = 0.6;
      this.glow.commit();
    }
    // glow bed
    if (rnd() < 0.18 * this.q) {
      const g = this.gDisc();
      g.x = e.x; g.y = gy + 0.6; g.z = e.z; g.life = 0.35; g.shape = GLOW.DISC; g.s0 = sp * 1.6 + sz; g.s1 = sp * 1.9 + sz;
      g.r0 = 0.9 * ramp; g.g0 = 0.38 * ramp; g.b0 = 0.07 * ramp; g.r1 = 0.4; g.g1 = 0.12; g.b1 = 0; g.a0 = 1; g.a1 = 0; g.flicker = 0.3;
      this.glow.commit();
    }
  }

  private thinSmoke(e: Emitter, ramp: number): void {
    const s = this.pSmoke(0.28 + rnd() * 0.1, 0.5 * ramp + 0.1);
    const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * e.spread;
    s.x = e.x + Math.cos(a) * rr; s.y = Math.max(e.y, this.groundY(e.x, e.z)) + 0.8; s.z = e.z + Math.sin(a) * rr;
    s.vx = (rnd() - 0.5) * 0.6; s.vy = 2.2 + rnd() * 1.8; s.vz = (rnd() - 0.5) * 0.6;
    s.life = 5 + rnd() * 4; s.s0 = 1.1 + e.size * 0.6; s.s1 = 4.2 + e.size * 2.2; s.buoy = 0.8; s.drag = 0.35; s.dis1 = 0.7;
    this.vol.commit();
  }

  /** a dense smoke column puff (used by explosion stems) */
  private columnPuff(e: Emitter, ramp: number): void {
    const s = this.pSmoke(0.15 + rnd() * 0.07, 0.9);
    const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * e.spread;
    s.x = e.x + Math.cos(a) * rr; s.y = e.y + rnd() * 1.5; s.z = e.z + Math.sin(a) * rr;
    const up = 8 + e.size * 2.2 + rnd() * 5;
    s.vx = (rnd() - 0.5) * 2.2; s.vy = up; s.vz = (rnd() - 0.5) * 2.2;
    s.life = 8 + rnd() * 5 + e.size * 1.4; s.s0 = 3.4 + e.size * 1.2; s.s1 = 8 + e.size * 3.6;
    s.buoy = 1.0; s.drag = 0.65; s.glow0 = 0.8 * ramp; s.windK = 1; s.dis1 = 0.75; s.frames = 2.2;
    this.vol.commit();
  }

  fireAt(x: number, y: number, z: number, seconds: number, size = 1, spread = 0): void {
    this.addEmitter(0, x, y, z, seconds, 9 * size + 3, size, spread || size * 1.1, size >= 0.9);
  }
  smokeAt(x: number, y: number, z: number, seconds: number, size = 1): void {
    this.addEmitter(1, x, y, z, seconds, 2.6 * size + 1, size, 1 + size, false);
  }

  // ---------------------------------------------------------------------------------- trails
  private removeAnchor(i: number): void {
    const a = this.anchors, l = (this.nAnch - 1) * 5;
    for (let k = 0; k < 5; k++) a[i * 5 + k] = a[l + k];
    this.nAnch--;
  }

  /** projectile trail point. Called every render frame per projectile; consecutive calls are linked so the smoke chain is continuous. */
  trail(x: number, y: number, z: number, kind: 'missile' | 'rocket' | 'shell' | 'bomb' | 'bullet'): void {
    if (kind === 'bullet') return;
    const a = this.anchors;
    // find the closest anchor (the same projectile's previous point)
    let best = -1, bd = 14 * 14;
    for (let i = 0; i < this.nAnch; i++) {
      if (a[i * 5 + 4] === this.frame || this.now - a[i * 5 + 3] > 0.13) continue;
      const dx = a[i * 5] - x, dy = a[i * 5 + 1] - y, dz = a[i * 5 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    let px = x, py = y, pz = z, hasPrev = false;
    if (best >= 0) {
      px = a[best * 5]; py = a[best * 5 + 1]; pz = a[best * 5 + 2]; hasPrev = true;
      a[best * 5] = x; a[best * 5 + 1] = y; a[best * 5 + 2] = z; a[best * 5 + 3] = this.now; a[best * 5 + 4] = this.frame;
    } else if (this.nAnch < 96) {
      const i = this.nAnch++;
      a[i * 5] = x; a[i * 5 + 1] = y; a[i * 5 + 2] = z; a[i * 5 + 3] = this.now; a[i * 5 + 4] = this.frame;
    }
    const lod = this.lodAt(x, z);
    if (lod < 0.15) return;
    const strong = kind === 'missile' || kind === 'rocket';
    const spacing = (strong ? 1.5 : 3.0) / Math.max(0.5, lod);
    const dx = x - px, dy = y - py, dz = z - pz;
    const len = hasPrev ? Math.hypot(dx, dy, dz) : 0;
    const n = hasPrev ? Math.min(6, Math.max(1, Math.round(len / spacing))) : 1;
    for (let i = 0; i < n; i++) {
      const f = hasPrev ? (i + 1) / n : 1;
      const tx = px + dx * f + (rnd() - 0.5) * 0.2, ty = py + dy * f + (rnd() - 0.5) * 0.2, tz = pz + dz * f + (rnd() - 0.5) * 0.2;
      const s = this.vol.s.reset();
      s.sheet = SHEET.DUST; s.frame0 = Math.floor(rnd() * 8); s.frames = 0;
      const v = (strong ? 0.82 : 0.7) + rnd() * 0.08;
      s.r = v; s.g = v * 0.99; s.b = v * 0.97;
      s.a = strong ? 0.5 : 0.28;
      s.x = tx; s.y = ty; s.z = tz; s.vx = (rnd() - 0.5) * 0.5; s.vy = 0.15; s.vz = (rnd() - 0.5) * 0.5;
      s.life = strong ? 1.9 + rnd() * 0.7 : 1.3 + rnd() * 0.4; s.s0 = strong ? 1.4 : 1.1; s.s1 = strong ? 4.2 + rnd() * 1.2 : 2.8;
      s.drag = 0.9; s.buoy = 0.2; s.turb = 0.35; s.windK = 0.7; s.fadeIn = 0.04; s.fadeOut = 0.75; s.dis0 = 0.02; s.dis1 = 0.6; s.glow0 = strong ? 0.35 : 0;
      s.rotv = (rnd() - 0.5) * 0.6;
      this.vol.commit();
    }
    if (strong) {
      // hot exhaust at the head
      const g = this.gDisc();
      g.x = x; g.y = y; g.z = z; g.life = 0.07; g.shape = GLOW.DISC; g.s0 = kind === 'missile' ? 1.7 : 1.3; g.s1 = 1.0;
      g.r0 = 4.2; g.g0 = 2.3; g.b0 = 0.8; g.r1 = 2.2; g.g1 = 0.8; g.b1 = 0.15; g.a0 = 1; g.a1 = 0.5;
      this.glow.commit();
      const h = this.gDisc();
      h.x = x; h.y = y; h.z = z; h.life = 0.06; h.shape = GLOW.STAR; h.s0 = 0.9; h.s1 = 0.7;
      h.r0 = 5; h.g0 = 3.5; h.b0 = 1.6; h.r1 = 2; h.g1 = 0.9; h.b1 = 0.2; h.a0 = 0.8; h.a1 = 0.3; h.rotv = 0;
      this.glow.commit();
    }
  }

  /** afterburner / engine glow for jets and helicopters: call once per frame with the nozzle position and backward direction */
  engineGlow(x: number, y: number, z: number, bx: number, by: number, bz: number, size = 1, power = 1): void {
    const lod = this.lodAt(x, z);
    if (lod < 0.2) return;
    const g = this.gDisc();
    g.x = x; g.y = y; g.z = z; g.life = 0.06; g.shape = GLOW.DISC; g.s0 = size * 1.5; g.s1 = size * 1.1;
    g.r0 = 3.2 * power; g.g0 = 1.5 * power; g.b0 = 0.5 * power; g.r1 = 1.4; g.g1 = 0.5; g.b1 = 0.1; g.a0 = 1; g.a1 = 0.6;
    this.glow.commit();
    const h = this.gDisc();
    h.x = x; h.y = y; h.z = z; h.vx = bx * 18; h.vy = by * 18; h.vz = bz * 18; h.life = 0.09; h.shape = GLOW.STREAK; h.s0 = size * 0.7; h.s1 = size * 0.3;
    h.r0 = 4.5 * power; h.g0 = 2.4 * power; h.b0 = 0.9 * power; h.r1 = 2; h.g1 = 0.7; h.b1 = 0.1; h.a0 = 1; h.a1 = 0.2; h.stretch = 0.09 * size * 2.2;
    this.glow.commit();
    if (rnd() < 0.5 * lod) {
      const s = this.pSmoke(0.5, 0.18 * power);
      s.x = x + bx * 1.2; s.y = y + by * 1.2; s.z = z + bz * 1.2; s.vx = bx * 4; s.vy = by * 4; s.vz = bz * 4;
      s.life = 1.2; s.s0 = size * 0.6; s.s1 = size * 2.2; s.drag = 1.2; s.buoy = 0; s.dis1 = 0.5; s.sheet = SHEET.SMOKE_B; s.fadeOut = 0.8;
      this.vol.commit();
    }
  }

  /** rotor wash dust kicked up by a low helicopter */
  rotorWash(x: number, z: number, height: number, radius = 8): void {
    if (height > 14 || this.lodAt(x, z) < 0.3) return;
    const k = 1 - height / 14;
    if (rnd() > 0.55 * k) return;
    const a = rnd() * 6.2832, gy = this.groundY(x, z);
    const s = this.pDust(0.2 * k + 0.05);
    s.x = x + Math.cos(a) * radius * 0.3; s.y = gy + 0.4; s.z = z + Math.sin(a) * radius * 0.3;
    s.vx = Math.cos(a) * (6 + rnd() * 6) * k; s.vy = 0.6; s.vz = Math.sin(a) * (6 + rnd() * 6) * k;
    s.life = 1.3 + rnd() * 0.8; s.s0 = 1.5; s.s1 = 4.2 + radius * 0.25; s.drag = 1.6;
    this.vol.commit();
  }

  // ---------------------------------------------------------------------------------- muzzle / tracer / hits
  muzzle(x: number, y: number, z: number, dx: number, dz: number, kind: string, big: boolean): void {
    const lod = this.lodAt(x, z);
    const gy = this.groundY(x, z);
    const heavy = kind === 'cannon' || big;
    const rocketLike = kind === 'missile' || kind === 'rocket';
    const art = kind === 'shell';
    const col = kind === 'cyber' ? 0x66ff9a : kind === 'emp' ? 0x7ad2ff : 0;
    if (col) {
      const g = this.gDisc();
      g.x = x + dx; g.y = y; g.z = z + dz; g.life = 0.12; g.shape = GLOW.DISC; g.s0 = 0.9; g.s1 = 1.6;
      const r = ((col >> 16) & 255) / 255 * 3, gg = ((col >> 8) & 255) / 255 * 3, b = (col & 255) / 255 * 3;
      g.r0 = r; g.g0 = gg; g.b0 = b; g.r1 = r * 0.2; g.g1 = gg * 0.2; g.b1 = b * 0.2; g.a0 = 0.9; g.a1 = 0;
      this.glow.commit();
      return;
    }
    if (kind === 'flame') { this.flameJet(x, y, z, dx, dz); return; }
    if (kind === 'swarm') return;
    if (!heavy && !rocketLike && !art) {
      // small arms: a quick star + occasional wisp
      const g = this.gDisc();
      g.x = x + dx * 0.5; g.y = y; g.z = z + dz * 0.5; g.life = 0.05; g.shape = GLOW.STAR; g.s0 = 0.75; g.s1 = 0.55;
      g.r0 = 5; g.g0 = 3.6; g.b0 = 1.6; g.r1 = 2.2; g.g1 = 1.0; g.b1 = 0.25; g.a0 = 1; g.a1 = 0.2;
      this.glow.commit();
      if (rnd() < 0.12 * lod) {
        const s = this.pSmoke(0.6, 0.18);
        s.x = x + dx; s.y = y; s.z = z + dz; s.vx = dx * 1.5; s.vy = 0.5; s.vz = dz * 1.5; s.life = 1.0; s.s0 = 0.25; s.s1 = 0.9; s.drag = 1.2; s.buoy = 0.3; s.dis1 = 0.5; s.fadeOut = 0.8;
        this.vol.commit();
      }
      return;
    }
    const sc = art ? 1.7 : heavy ? 1.15 : 0.9;
    const fx = x + dx * 1.2, fz = z + dz * 1.2;
    // flash: star + disc
    this.flashAt(x + dx * 1.6, y, z + dz * 1.6, 3.4 * sc, 0.12);
    if (rocketLike) {
      // backblast behind the launcher + forward puff
      const n = this.cnt(4, lod);
      for (let i = 0; i < n; i++) {
        const f = this.pFire(0.9); f.add = 0.55; f.frame0 = 2;
        f.x = x - dx * 1.4; f.y = y; f.z = z - dz * 1.4; f.vx = -dx * (9 + rnd() * 8) + (rnd() - 0.5) * 3; f.vy = (rnd() - 0.2) * 2; f.vz = -dz * (9 + rnd() * 8) + (rnd() - 0.5) * 3;
        f.life = 0.4 + rnd() * 0.25; f.s0 = 0.9 * sc; f.s1 = 2.2 * sc; f.drag = 3; f.buoy = 0; f.windK = 0;
        this.vol.commit();
      }
      const m = this.cnt(5, lod);
      for (let i = 0; i < m; i++) {
        const s = this.pSmoke(0.55, 0.45);
        s.x = x - dx * 1.2; s.y = y + 0.2; s.z = z - dz * 1.2; s.vx = -dx * (5 + rnd() * 9) + (rnd() - 0.5) * 3; s.vy = rnd() * 1.4; s.vz = -dz * (5 + rnd() * 9) + (rnd() - 0.5) * 3;
        s.life = 2.2 + rnd() * 1.2; s.s0 = 1.0; s.s1 = 3.4 * sc; s.drag = 1.8; s.buoy = 0.5; s.dis1 = 0.6;
        this.vol.commit();
      }
      if (gy + 3 > y) this.groundKick(x - dx * 2, z - dz * 2, 2.5 * sc, lod);
    } else {
      // cannon / artillery: forward fire jet, smoke ring, ground kick
      const n = this.cnt(art ? 4 : 3, lod);
      for (let i = 0; i < n; i++) {
        const f = this.pFire(0.85); f.add = 0.5; f.frame0 = 3;
        f.x = fx; f.y = y; f.z = fz; f.vx = dx * (10 + rnd() * 14) + (rnd() - 0.5) * 3; f.vy = (rnd() - 0.4) * 2; f.vz = dz * (10 + rnd() * 14) + (rnd() - 0.5) * 3;
        f.life = 0.3 + rnd() * 0.2; f.s0 = 0.9 * sc; f.s1 = 2.0 * sc; f.drag = 2.6; f.buoy = 0; f.windK = 0;
        this.vol.commit();
      }
      const m = this.cnt(art ? 8 : 5, lod);
      for (let i = 0; i < m; i++) {
        const s = this.pSmoke(0.5 + rnd() * 0.12, art ? 0.55 : 0.42);
        const a = rnd() * 6.28;
        s.x = fx; s.y = y; s.z = fz; s.vx = dx * (6 + rnd() * 10) + Math.cos(a) * 1.6; s.vy = (rnd() - 0.2) * 1.6; s.vz = dz * (6 + rnd() * 10) + Math.sin(a) * 1.6;
        s.life = 2.4 + rnd() * 1.4; s.s0 = 0.8; s.s1 = (3.0 + rnd() * 1.4) * sc; s.drag = 1.5; s.buoy = 0.6; s.dis1 = 0.6; s.glow0 = 0.4;
        this.vol.commit();
      }
      this.groundKick(x, z, 3 * sc, lod);
    }
    this.pointLight(x + dx * 2, y, z + dz * 2, art ? 4.5 : heavy ? 3 : 2.2);
  }

  private groundKick(x: number, z: number, size: number, lod: number): void {
    const gy = this.groundY(x, z);
    const n = this.cnt(3, lod);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.2832;
      const s = this.pDust(0.32);
      s.x = x + Math.cos(a) * size * 0.3; s.y = gy + 0.4; s.z = z + Math.sin(a) * size * 0.3;
      s.vx = Math.cos(a) * (3 + rnd() * 4); s.vy = 0.5 + rnd(); s.vz = Math.sin(a) * (3 + rnd() * 4);
      s.life = 1.2 + rnd() * 0.8; s.s0 = size * 0.5; s.s1 = size * 1.5;
      this.vol.commit();
    }
  }

  private flameJet(x: number, y: number, z: number, dx: number, dz: number): void {
    const n = this.cnt(5, this.lodAt(x, z));
    for (let i = 0; i < n; i++) {
      const s = this.vol.s.reset();
      s.sheet = SHEET.FIRE; s.frame0 = 1; s.frames = 12; s.heat = 1.1; s.hdecay = 0.6; s.add = 0.55; s.a = 1;
      const sp = 14 + rnd() * 10;
      s.x = x + dx * 1.2; s.y = y; s.z = z + dz * 1.2; s.vx = dx * sp + (rnd() - 0.5) * 3; s.vy = (rnd() - 0.3) * 2; s.vz = dz * sp + (rnd() - 0.5) * 3;
      s.life = 0.45 + rnd() * 0.25; s.s0 = 0.7; s.s1 = 2.8 + rnd() * 1.2; s.drag = 1.8; s.buoy = 2; s.fadeIn = 0.03; s.fadeOut = 0.35; s.dis1 = 0.5; s.windK = 0;
      this.vol.commit();
    }
    this.pointLight(x + dx * 3, y, z + dz * 3, 1.8, 0xff9a40);
  }

  /** countermeasure flares: a fan of bright burning sparks falling away from an aircraft */
  flares(x: number, y: number, z: number): void {
    this.flashAt(x, y, z, 1.4, 0.18);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd();
      this.spark(x, y, z, Math.cos(a) * (6 + rnd() * 8), -1 - rnd() * 5, Math.sin(a) * (6 + rnd() * 8), 0.9 + rnd() * 0.9, 0.22 + rnd() * 0.1, 1.4);
    }
    const s = this.pSmoke(0.4, 0.3);
    s.x = x; s.y = y; s.z = z; s.vy = -1; s.life = 1.6; s.s0 = 0.6; s.s1 = 2.4; s.drag = 1.2; s.dis1 = 0.5; s.fadeOut = 0.8;
    this.vol.commit();
  }

  /** promotion burst: golden sparks rising from the unit */
  promoteAt(x: number, y: number, z: number, vet: number): void {
    this.flashAt(x, y + 2, z, 1.2, 0.3);
    const n = 8 + vet * 5;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, v = 2 + rnd() * 4;
      this.spark(x, y + 1, z, Math.cos(a) * v, 5 + rnd() * 7, Math.sin(a) * v, 1 + rnd() * 0.8, 0.14 + rnd() * 0.06, 1.2);
    }
  }

  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, kind: string): void {
    const heavy = kind === 'cannon';
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz) || 1;
    const seg = Math.min(l, heavy ? 16 : 10);
    const t0 = 0.12 + rnd() * 0.5;
    const sx = ax + dx * t0, sy = ay + dy * t0, sz = az + dz * t0;
    const ex = sx + (dx / l) * seg, ey = sy + (dy / l) * seg, ez = sz + (dz / l) * seg;
    this.streaks.add(sx, sy, sz, ex, ey, ez, heavy ? 0xffe6b0 : 0xffc460, heavy ? 0.2 : 0.1, heavy ? 0.12 : 0.09, heavy ? 2.4 : 1.8);
  }

  /** bullet / shell strike. Armour and structures (above the ground) spark; soil kicks up dirt. */
  hit(x: number, y: number, z: number, big = false): void {
    const lod = this.lodAt(x, z);
    if (lod < 0.12) return;
    const gy = this.groundY(x, z);
    const onGround = y - gy < 0.9;
    if (onGround) {
      const s = this.vol.s.reset();
      s.sheet = SHEET.GRIT; s.frame0 = Math.floor(rnd() * 8);
      const d = this.dustCol, v = 0.65 + rnd() * 0.2;
      s.r = d[0] * v; s.g = d[1] * v; s.b = d[2] * v;
      s.x = x; s.y = gy + 0.3; s.z = z; s.vx = (rnd() - 0.5) * 2; s.vy = 1.5 + rnd() * 2; s.vz = (rnd() - 0.5) * 2;
      s.life = 0.8 + rnd() * 0.5; s.s0 = big ? 0.9 : 0.5; s.s1 = big ? 2.6 : 1.4; s.a = 0.7; s.drag = 2.2; s.buoy = -1.5; s.fadeIn = 0.03; s.fadeOut = 0.7; s.dis1 = 0.5; s.windK = 0.5;
      this.vol.commit();
      if (rnd() < 0.5) this.debris.spawn(DEBRIS.ROCK, x, gy + 0.3, z, (rnd() - 0.5) * 7, 4 + rnd() * 6, (rnd() - 0.5) * 7, 0.07 + rnd() * 0.07, 1.4 + rnd(), this.dirt, 0, 0);
    } else {
      this.flashAt(x, y, z, big ? 1.3 : 0.7, 0.06);
      const n = this.cnt(big ? 7 : 4, lod);
      for (let i = 0; i < n; i++) this.spark(x, y, z, (rnd() - 0.5) * 16, 2 + rnd() * 9, (rnd() - 0.5) * 16, 0.3 + rnd() * 0.4, 0.09 + rnd() * 0.05, 0.9);
      if (rnd() < 0.5) {
        const s = this.pSmoke(0.35, 0.25);
        s.x = x; s.y = y; s.z = z; s.vx = (rnd() - 0.5); s.vy = 1 + rnd(); s.vz = (rnd() - 0.5); s.life = 1; s.s0 = 0.4; s.s1 = 1.3; s.drag = 1.5; s.buoy = 0.5; s.dis1 = 0.5; s.fadeOut = 0.8;
        this.vol.commit();
      }
    }
  }

  /** vehicle dust trail, called a few times per second per moving vehicle */
  dust(x: number, y: number, z: number, amt: number): void {
    const lod = this.lodAt(x, z);
    if (lod < 0.2) return;
    const gy = this.groundY(x, z);
    const water = gy > y + 1.2 || this.ground.waterY > this.ground.heightAt(x, z) + 0.1;
    const s = this.pDust(0.24 * Math.min(1.4, amt));
    if (water) { s.r = s.g = 0.8; s.b = 0.86; }
    s.x = x + (rnd() - 0.5) * 2; s.y = gy + 0.35; s.z = z + (rnd() - 0.5) * 2;
    s.vx = (rnd() - 0.5) * 1.6; s.vy = 0.7 + rnd() * 0.7; s.vz = (rnd() - 0.5) * 1.6;
    s.life = 1.5 + rnd() * 1.0; s.s0 = 1.1; s.s1 = 3.4 * Math.max(0.6, amt); s.drag = 1.3; s.buoy = 0.15;
    this.vol.commit();
  }

  // ---------------------------------------------------------------------------------- debris trails
  private debrisTrail(x: number, y: number, z: number, heat: number, size: number): void {
    if (this.vol.n > CAP_VOL * 0.6 && rnd() < 0.7) return;
    const s = this.pSmoke(0.2 + rnd() * 0.07, 0.38);
    s.x = x; s.y = y; s.z = z; s.vx = (rnd() - 0.5) * 0.6; s.vy = 0.5; s.vz = (rnd() - 0.5) * 0.6;
    s.sheet = SHEET.WISP; s.frame0 = Math.floor(rnd() * 8); s.frames = 0;
    s.life = 1.8 + rnd() * 0.9; s.s0 = 0.5 + size * 1.0; s.s1 = 2.2 + size * 2.4; s.drag = 1; s.buoy = 0.5; s.dis1 = 0.55; s.fadeOut = 0.7; s.glow0 = heat * 0.5;
    this.vol.commit();
    if (heat > 0.35 && rnd() < 0.7) this.spark(x, y, z, (rnd() - 0.5) * 4, rnd() * 3, (rnd() - 0.5) * 4, 0.35 + rnd() * 0.3, 0.07, 0.8);
  }

  // ---------------------------------------------------------------------------------- explosions
  explosion(x: number, y: number, z: number, size: number, kind: ExplosionKind): void {
    const s = Math.max(0.4, size);
    if (kind === 'emp' || kind === 'cyber') { this.energyBurst(x, y, z, s, kind); return; }
    if (kind === 'nuke') { this.nuke(x, y, z); return; }
    const lod = this.lodAt(x, z);
    if (lod < 0.1) return;
    const gy = this.groundY(x, z);
    const air = kind === 'air';
    const water = this.ground.waterY > this.ground.heightAt(x, z) + 0.1 && Math.abs(gy - this.ground.waterY) < 0.01;
    const R = 1.8 + 1.6 * s;             // fireball radius (m)
    const big = s >= 3;
    const cy = air ? y : Math.max(y, gy + R * 0.35);
    const metal = air || kind === 'big' || kind === 'gen';

    // ignition flash + light
    this.flashAt(x, cy + R * 0.2, z, R * 2.4, 0.11 + s * 0.012);
    if (big) {
      const g = this.gDisc();
      g.x = x; g.y = cy; g.z = z; g.life = 0.35; g.shape = GLOW.DISC; g.s0 = R * 3; g.s1 = R * 5.5;
      g.r0 = 2.6; g.g0 = 1.6; g.b0 = 0.7; g.r1 = 0.5; g.g1 = 0.18; g.b1 = 0.04; g.a0 = 0.9; g.a1 = 0;
      this.glow.commit();
    }
    this.pointLight(x, cy + 1, z, 3 + s * 2.6);

    // fireball: hot core + turbulent lobes
    {
      const c = this.pFire(1.18); c.add = 0.55;
      c.x = x; c.y = cy; c.z = z; c.vy = 1.2; c.life = 0.6 + Math.min(0.7, s * 0.1); c.s0 = R * 1.5; c.s1 = R * 2.6; c.frame0 = 0; c.rot = rnd() * 6.28;
      this.vol.commit();
    }
    const nf = this.cnt(2.2 + s * 1.7, lod);
    for (let i = 0; i < nf; i++) {
      const f = this.pFire(1.0 - rnd() * 0.12);
      const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * R * 0.55, up = (rnd() - 0.3) * R * 0.5;
      f.x = x + Math.cos(a) * rr; f.y = cy + up; f.z = z + Math.sin(a) * rr;
      f.vx = Math.cos(a) * (1 + rnd() * 2.2) * (0.6 + s * 0.25); f.vy = 1.5 + rnd() * (2 + s * 0.6); f.vz = Math.sin(a) * (1 + rnd() * 2.2) * (0.6 + s * 0.25);
      f.life = 0.75 + rnd() * 0.5 + Math.min(0.5, s * 0.08); f.s0 = R * (1.1 + rnd() * 0.6); f.s1 = R * (2.1 + rnd() * 1.0);
      f.frame0 = rnd() < 0.5 ? 0 : 2; f.glow0 = 0;
      this.vol.commit();
    }
    // smaller licks thrown outward
    const nl = this.cnt(2 + s * 1.5, lod);
    for (let i = 0; i < nl; i++) {
      const f = this.pFire(0.9);
      const a = rnd() * 6.2832, sp = 4 + rnd() * 8 + s;
      f.x = x; f.y = cy; f.z = z; f.vx = Math.cos(a) * sp; f.vy = 2 + rnd() * 6; f.vz = Math.sin(a) * sp;
      f.life = 0.45 + rnd() * 0.4; f.s0 = R * 0.5; f.s1 = R * (0.9 + rnd() * 0.5); f.drag = 2.4; f.buoy = -3; f.frame0 = 2 + Math.floor(rnd() * 3);
      this.vol.commit();
    }

    // smoke plume: a dense initial mass plus a short-lived emitter that builds the rising column
    const ns = this.cnt(5 + s * 3.2, lod);
    for (let i = 0; i < ns; i++) {
      const dark = i % 3 === 0 ? 0.09 + rnd() * 0.04 : 0.13 + rnd() * 0.07;
      const m = this.pSmoke(dark, 0.72);
      const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * R * 0.6;
      m.x = x + Math.cos(a) * rr; m.y = cy + rnd() * R * 0.6; m.z = z + Math.sin(a) * rr;
      m.vx = Math.cos(a) * rnd() * 3; m.vy = 5 + rnd() * 5 + s * 1.2; m.vz = Math.sin(a) * rnd() * 3;
      m.life = 8 + rnd() * 4 + s * 1.3; m.s0 = R * (0.8 + rnd() * 0.5); m.s1 = R * (2.4 + rnd() * 1.5);
      m.glow0 = 0.75; m.buoy = 0.9; m.drag = 0.7; m.frames = 2.2; m.dis0 = 0.05;
      this.vol.commit();
    }
    if (!air || s > 1.5) this.addEmitter(2, x, cy, z, 1.2 + s * 0.35, 10 + s * 4, s * 0.8, R * 0.4, false);

    // sparks
    const nsp = this.cnt(8 + s * 8, lod);
    for (let i = 0; i < nsp; i++) {
      const a = rnd() * 6.2832, sp = 4 + rnd() * 14 * (0.6 + s * 0.15);
      this.spark(x, cy, z, Math.cos(a) * sp, 4 + rnd() * 10 * (0.6 + s * 0.2), Math.sin(a) * sp, 0.45 + rnd() * 0.9, 0.09 + rnd() * 0.08);
    }

    if (!air) {
      // dust shock ring + rising dust
      const nr = this.cnt(8 + s * 5, lod);
      for (let i = 0; i < nr; i++) {
        const a = rnd() * 6.2832;
        const d = this.pDust(0.30 + rnd() * 0.16); d.add = 0; d.hug = 0.45;
        if (water) { d.r = d.g = 0.82; d.b = 0.88; }
        const sp = (3 + R * 2.0) * (0.45 + rnd() * 0.85);
        d.x = x + Math.cos(a) * R * 0.3; d.y = gy + 0.5 + rnd() * 0.6; d.z = z + Math.sin(a) * R * 0.3;
        d.vx = Math.cos(a) * sp; d.vy = 0.6 + rnd() * 1.2; d.vz = Math.sin(a) * sp;
        d.life = 1.6 + rnd() * 1.4 + s * 0.2; d.s0 = R * (0.4 + rnd() * 0.3); d.s1 = R * (1.0 + rnd() * 0.9); d.drag = 1.6 + rnd() * 0.8; d.buoy = 0.9;
        this.vol.commit();
      }
      const nu = this.cnt(2 + s * 1.5, lod);
      for (let i = 0; i < nu; i++) {
        const a = rnd() * 6.2832, rr = rnd() * R * 0.6;
        const d = this.pDust(0.4); d.hug = 0.3;
        if (water) { d.r = d.g = 0.85; d.b = 0.9; }
        d.x = x + Math.cos(a) * rr; d.y = gy + 0.8; d.z = z + Math.sin(a) * rr;
        d.vx = Math.cos(a) * 1.5; d.vy = 2.5 + rnd() * 3; d.vz = Math.sin(a) * 1.5;
        d.life = 3 + rnd() * 2.5 + s * 0.3; d.s0 = R * 0.8; d.s1 = R * (2.0 + rnd() * 1.0); d.drag = 0.7; d.buoy = 0.7;
        this.vol.commit();
      }
      if (s >= 0.8 && !water) {
        this.decals.add(x, gy, z, 2.4 + s * 2.1, rnd() * 6.28, 60 + s * 12, DECAL.SCORCH, 0.8);
        if (s >= 2.1) this.decals.add(x, gy, z, 1.8 + s * 1.2, rnd() * 6.28, 90 + s * 15, DECAL.CRATER, 0.9);
      }
      if (water) this.splash(x, gy, z, R);
    }

    // debris
    const nd = this.cnt(3.5 + s * 4.5, lod);
    for (let i = 0; i < nd; i++) {
      const a = rnd() * 6.2832, sp = 4 + rnd() * (10 + s * 2.5), up = 7 + rnd() * (14 + s * 3);
      const isMetal = metal && rnd() < 0.55;
      const kd = isMetal ? (rnd() < 0.4 ? DEBRIS.SLAB : DEBRIS.ROCK) : DEBRIS.ROCK;
      const col = isMetal ? [0x3a3c3e, 0x58504a, 0x6a4a36, 0x2c2e30][i % 4] : this.dirt;
      const hot = isMetal ? 1 : 0;
      this.debris.spawn(kd, x, cy, z, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.16 + rnd() * (0.3 + s * 0.06), 5 + rnd() * 5, col, hot, i % 6 === 0 ? 12 : 0);
    }
    if (kind === 'big' || s > 2.5) {
      const nb = this.cnt(1 + s * 0.8, lod);
      for (let i = 0; i < nb; i++) {
        const a = rnd() * 6.2832, sp = 3 + rnd() * 8;
        this.debris.spawn(rnd() < 0.5 ? DEBRIS.BEAM : DEBRIS.SLAB, x, cy, z, Math.cos(a) * sp, 10 + rnd() * 14, Math.sin(a) * sp, 0.4 + rnd() * 0.5, 6 + rnd() * 5, 0x4a4a4e, 1, 12);
      }
    }
    if (s >= 1.5) this.shakeAt(x, z, Math.min(1.8, s * 0.3));
  }

  private splash(x: number, gy: number, z: number, R: number): void {
    const n = this.cnt(6 + R, this.q);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.2832, sp = 3 + rnd() * R * 1.6;
      const g = this.gDisc();
      g.x = x; g.y = gy + 0.3; g.z = z; g.vx = Math.cos(a) * sp; g.vy = 6 + rnd() * R * 2; g.vz = Math.sin(a) * sp;
      g.life = 0.8 + rnd() * 0.6; g.shape = GLOW.DISC; g.s0 = 0.28; g.s1 = 0.1; g.grav = 20;
      g.r0 = 0.9; g.g0 = 1.0; g.b0 = 1.1; g.r1 = 0.4; g.g1 = 0.5; g.b1 = 0.6; g.a0 = 0.8; g.a1 = 0;
      this.glow.commit();
    }
  }

  private energyBurst(x: number, y: number, z: number, s: number, kind: 'emp' | 'cyber'): void {
    const gy = this.groundY(x, z);
    const col = kind === 'emp' ? 0x7ad2ff : 0x66ff9a;
    const r = ((col >> 16) & 255) / 255, g = ((col >> 8) & 255) / 255, b = (col & 255) / 255;
    this.shocks.add(x, gy + 0.5, z, 6 + s * 5, 0.9, col);
    this.domes.add(x, gy, z, 4 + s * 3.5, 0.7, col, 0.7);
    const n = this.cnt(18, this.lodAt(x, z));
    for (let i = 0; i < n; i++) {
      const gl = this.gDisc();
      gl.x = x + (rnd() - 0.5) * 3; gl.y = y + rnd() * 3; gl.z = z + (rnd() - 0.5) * 3; gl.vx = (rnd() - 0.5) * 16; gl.vy = (rnd() - 0.5) * 9; gl.vz = (rnd() - 0.5) * 16;
      gl.life = 0.4 + rnd() * 0.4; gl.shape = GLOW.STREAK; gl.s0 = 0.12; gl.s1 = 0.05; gl.r0 = r * 4; gl.g0 = g * 4; gl.b0 = b * 4; gl.r1 = r; gl.g1 = g; gl.b1 = b; gl.a0 = 1; gl.a1 = 0; gl.drag = 1; gl.stretch = 0.06;
      this.glow.commit();
    }
    const c = this.gDisc();
    c.x = x; c.y = y + 1; c.z = z; c.life = 0.45; c.shape = GLOW.DISC; c.s0 = 3 + s * 2; c.s1 = 8 + s * 4;
    c.r0 = r * 2.4; c.g0 = g * 2.4; c.b0 = b * 2.4; c.r1 = r * 0.2; c.g1 = g * 0.2; c.b1 = b * 0.2; c.a0 = 0.9; c.a1 = 0;
    this.glow.commit();
    const st = this.gDisc();
    st.x = x; st.y = y + 1; st.z = z; st.life = 0.3; st.shape = GLOW.STAR; st.s0 = 4 + s * 3; st.s1 = 6 + s * 4;
    st.r0 = r * 4; st.g0 = g * 4; st.b0 = b * 4; st.r1 = r; st.g1 = g; st.b1 = b; st.a0 = 1; st.a1 = 0;
    this.glow.commit();
    this.pointLight(x, y + 2, z, 4 + s * 2, col);
  }

  // ---------------------------------------------------------------------------------- structures & wrecks
  structureDeath(x: number, _y: number, z: number, radius: number): void {
    const lod = this.lodAt(x, z);
    if (lod < 0.08) return;
    const R = Math.max(4, radius);
    const gy = this.groundY(x, z);
    const water = this.ground.waterY > this.ground.heightAt(x, z) + 0.1;
    // staggered internal blasts as the building comes apart
    const nb = this.cnt(3 + R * 0.35, lod);
    for (let i = 0; i < nb; i++) {
      this.later(rnd() * 0.9, () => {
        const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * R * 0.65;
        const bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr, by = gy + 1.5 + rnd() * R * 0.35;
        const f = this.pFire(1.05); f.add = 0.45;
        f.x = bx; f.y = by; f.z = bz; f.vy = 3 + rnd() * 4; f.vx = (rnd() - 0.5) * 3; f.vz = (rnd() - 0.5) * 3; f.life = 0.9 + rnd() * 0.7; f.s0 = 2.5 + R * 0.25; f.s1 = 5 + R * 0.5; f.frame0 = rnd() < 0.5 ? 0 : 2;
        this.vol.commit();
        this.flashAt(bx, by, bz, 3 + R * 0.3, 0.1);
        this.pointLight(bx, by, bz, 3 + R * 0.25);
        const ns = this.cnt(2, lod);
        for (let k = 0; k < ns; k++) {
          const m = this.pSmoke(0.1 + rnd() * 0.06, 0.9);
          m.x = bx + (rnd() - 0.5) * 3; m.y = by; m.z = bz + (rnd() - 0.5) * 3; m.vx = (rnd() - 0.5) * 3; m.vy = 5 + rnd() * 6; m.vz = (rnd() - 0.5) * 3;
          m.life = 6 + rnd() * 5; m.s0 = 2.6 + R * 0.25; m.s1 = 7 + R * 0.7; m.glow0 = 0.8; m.buoy = 1.6;
          this.vol.commit();
        }
      });
    }
    this.flashAt(x, gy + R * 0.5, z, R * 1.6, 0.14);
    this.pointLight(x, gy + R * 0.5, z, 6 + R * 0.5);

    // collapse dust: a thick ring racing outward, plus a billowing dome of dust over the footprint
    const nr = this.cnt(10 + R * 1.3, lod);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * 6.2832 + rnd() * 0.4;
      const d = this.pDust(0.62); d.add = 0; d.hug = 0.5;
      if (water) { d.r = d.g = 0.8; d.b = 0.86; }
      const sp = 5 + R * 0.9 + rnd() * 5;
      d.x = x + Math.cos(a) * R * 0.45; d.y = gy + 1.0; d.z = z + Math.sin(a) * R * 0.45;
      d.vx = Math.cos(a) * sp; d.vy = 0.8 + rnd() * 1.4; d.vz = Math.sin(a) * sp;
      d.life = 3 + rnd() * 2.2; d.s0 = R * 0.35; d.s1 = R * (0.9 + rnd() * 0.7); d.drag = 1.4; d.buoy = 1.0;
      this.vol.commit();
    }
    const nu = this.cnt(8 + R * 0.9, lod);
    for (let i = 0; i < nu; i++) {
      const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * R * 0.7;
      const d = this.pDust(0.5); d.hug = 0.4;
      if (water) { d.r = d.g = 0.84; d.b = 0.9; }
      d.x = x + Math.cos(a) * rr; d.y = gy + 1 + rnd() * R * 0.4; d.z = z + Math.sin(a) * rr;
      d.vx = Math.cos(a) * (1 + rnd() * 2.5); d.vy = 2 + rnd() * 5; d.vz = Math.sin(a) * (1 + rnd() * 2.5);
      d.life = 5 + rnd() * 4; d.s0 = R * 0.5; d.s1 = R * (1.5 + rnd() * 1.1); d.drag = 0.65; d.buoy = 0.8; d.dis1 = 0.7;
      this.vol.commit();
    }
    // black smoke column from the burning ruin
    this.addEmitter(2, x, gy + 2, z, 3 + R * 0.2, 6 + R * 0.5, R * 0.45, R * 0.45, false);
    // debris: bulk chunks, plates and beams
    const nd = this.cnt(14 + R * 2.4, lod);
    const concrete = [0x77736b, 0x5e5b55, 0x8a8479, 0x4b4a47];
    for (let i = 0; i < nd; i++) {
      const a = rnd() * 6.2832, sp = 3 + rnd() * (7 + R * 0.6), up = 8 + rnd() * (10 + R * 0.9);
      const k = rnd();
      const kind = k < 0.55 ? DEBRIS.ROCK : k < 0.8 ? DEBRIS.SLAB : DEBRIS.BEAM;
      const sz = kind === DEBRIS.ROCK ? 0.25 + rnd() * (0.45 + R * 0.05) : 0.5 + rnd() * (0.6 + R * 0.05);
      this.debris.spawn(kind, x + Math.cos(a) * R * 0.3, gy + 2 + rnd() * R * 0.4, z + Math.sin(a) * R * 0.3, Math.cos(a) * sp, up, Math.sin(a) * sp, sz, 6 + rnd() * 6, kind === DEBRIS.BEAM ? 0x4a3d33 : concrete[i % 4], rnd() < 0.3 ? 1 : 0, i % 6 === 0 ? 12 : 0);
    }
    const nsp = this.cnt(14 + R * 1.2, lod);
    for (let i = 0; i < nsp; i++) {
      const a = rnd() * 6.2832, sp = 4 + rnd() * 16;
      this.spark(x, gy + 2 + rnd() * R * 0.4, z, Math.cos(a) * sp, 5 + rnd() * 14, Math.sin(a) * sp, 0.6 + rnd() * 1.1, 0.1 + rnd() * 0.08);
    }
    if (!water) {
      this.decals.add(x, gy, z, R * 2.6, rnd() * 6.28, 260, DECAL.SCORCH, 0.85);
      this.decals.add(x, gy, z, R * 1.7, rnd() * 6.28, 300, DECAL.BLOT, 0.9);
      this.decals.add(x, gy, z, R * 3.2, rnd() * 6.28, 200, DECAL.SPATTER, 0.8);
    }
    this.shakeAt(x, z, Math.min(2.2, R * 0.1));
    this.fireAt(x, gy, z, 40 + R * 2, Math.max(1, R / 9), R * 0.5);
    this.smokeAt(x, gy + 2, z, 90, Math.max(1, R / 10));
  }

  vehicleWreck(x: number, y: number, z: number): void {
    const lod = this.lodAt(x, z);
    const gy = this.groundY(x, z);
    this.fireAt(x, Math.max(y, gy), z, 18, 0.8, 1.6);
    this.smokeAt(x, Math.max(y, gy) + 1, z, 55, 0.9);
    if (lod > 0.3 && this.ground.waterY < this.ground.heightAt(x, z)) this.decals.add(x, gy, z, 5.5, rnd() * 6.28, 120, DECAL.BLOT, 0.7);
    // cook-off pops
    if (rnd() < 0.5) this.later(0.4 + rnd() * 1.4, () => {
      this.flashAt(x, y + 1.5, z, 3, 0.1);
      const f = this.pFire(1.0); f.x = x; f.y = y + 1.5; f.z = z; f.vy = 3; f.life = 0.7; f.s0 = 2.2; f.s1 = 4.4; f.frame0 = 3;
      this.vol.commit();
      for (let i = 0; i < 5; i++) this.spark(x, y + 1.5, z, (rnd() - 0.5) * 12, 4 + rnd() * 8, (rnd() - 0.5) * 12, 0.5 + rnd() * 0.6, 0.09);
      this.pointLight(x, y + 1.5, z, 3);
    });
  }

  // ---------------------------------------------------------------------------------- nuclear detonation
  private nuke(x: number, _y: number, z: number): void {
    const gy = this.groundY(x, z);
    this.flash = 1;
    this.shakeAt(x, z, 4);
    // thin shock rings racing over the ground + blinding glow
    this.shocks.add(x, gy + 0.5, z, 190, 2.6, 0xffe8c0, 1);
    this.shocks.add(x, gy + 0.5, z, 105, 1.7, 0xffb070, 1);
    for (let i = 0; i < 2; i++) {
      const g = this.gDisc();
      g.x = x; g.y = gy + 22; g.z = z; g.life = 0.9 + i * 0.5; g.shape = GLOW.DISC; g.s0 = 70 + i * 30; g.s1 = 200 + i * 80;
      g.r0 = 6 - i * 2.5; g.g0 = 5 - i * 2.2; g.b0 = 3.8 - i * 1.8; g.r1 = 1.0; g.g1 = 0.45; g.b1 = 0.12; g.a0 = 1; g.a1 = 0;
      this.glow.commit();
    }
    const st = this.gDisc();
    st.x = x; st.y = gy + 22; st.z = z; st.life = 0.5; st.shape = GLOW.STAR; st.s0 = 110; st.s1 = 190;
    st.r0 = 9; st.g0 = 7; st.b0 = 5; st.r1 = 2; st.g1 = 1; st.b1 = 0.4; st.a0 = 1; st.a1 = 0;
    this.glow.commit();
    this.pointLight(x, gy + 45, z, 40, 0xffd8a0);
    this.decals.add(x, gy, z, 110, rnd() * 6.28, 500, DECAL.SCORCH, 1);
    this.decals.add(x, gy, z, 64, rnd() * 6.28, 600, DECAL.CRATER, 1);
    this.fireAt(x, gy, z, 30, 3.4, 16);
    this.addEmitter(0, x + 20, gy, z - 14, 22, 26, 2.6, 11, false);

    // rising fireball, in two pulses so it keeps billowing
    const pulse = (n: number, delay: number): void => {
      this.later(delay, () => {
        for (let i = 0; i < n; i++) {
          const f = this.pFire(1.15); f.add = 0.35;
          const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * 14;
          f.x = x + Math.cos(a) * rr; f.y = gy + 10 + rnd() * 18; f.z = z + Math.sin(a) * rr;
          f.vx = Math.cos(a) * (3 + rnd() * 9); f.vy = 12 + rnd() * 20; f.vz = Math.sin(a) * (3 + rnd() * 9);
          f.life = 2.4 + rnd() * 1.6; f.s0 = 30 + rnd() * 16; f.s1 = 60 + rnd() * 24; f.drag = 0.6; f.buoy = 2.5; f.frame0 = rnd() < 0.5 ? 0 : 1; f.hdecay = 1.15; f.fadeOut = 0.35;
          this.vol.commit();
        }
      });
    };
    pulse(14, 0); pulse(10, 0.45);
    // ground dust skirt / base surge
    for (let i = 0; i < 44; i++) {
      const a = rnd() * 6.2832;
      const d = this.pDust(0.55); d.hug = 0.6; d.add = 0;
      const sp = 40 + rnd() * 50;
      d.x = x + Math.cos(a) * 6; d.y = gy + 2; d.z = z + Math.sin(a) * 6;
      d.vx = Math.cos(a) * sp; d.vy = 1 + rnd() * 3; d.vz = Math.sin(a) * sp;
      d.life = 6 + rnd() * 3; d.s0 = 12 + rnd() * 10; d.s1 = 34 + rnd() * 30; d.drag = 0.85 + rnd() * 0.3; d.buoy = 2.4; d.dis1 = 0.75;
      this.vol.commit();
    }
    // stem + cap
    this.nukeStem(x, gy, z, 0);
    this.later(1.7, () => this.nukeCap(x, gy, z));
    // debris storm + sparks
    for (let i = 0; i < 60; i++) {
      const a = rnd() * 6.2832, sp = 20 + rnd() * 45;
      this.debris.spawn(rnd() < 0.7 ? DEBRIS.ROCK : DEBRIS.SLAB, x, gy + 3, z, Math.cos(a) * sp, 28 + rnd() * 50, Math.sin(a) * sp, 0.5 + rnd() * 1.0, 9 + rnd() * 6, i % 3 === 0 ? 0x3a3c3e : this.dirt, 1, i % 3 === 0 ? 14 : 0);
    }
    for (let i = 0; i < 80; i++) {
      const a = rnd() * 6.2832, sp = 12 + rnd() * 55;
      this.spark(x, gy + 4, z, Math.cos(a) * sp, 15 + rnd() * 45, Math.sin(a) * sp, 1.2 + rnd() * 1.8, 0.22 + rnd() * 0.15);
    }
  }

  private nukeStem(x: number, gy: number, z: number, step: number): void {
    for (let i = 0; i < 7; i++) {
      const m = this.pSmoke(0.22 + rnd() * 0.07, 0.85);
      const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * 9;
      m.x = x + Math.cos(a) * rr; m.y = gy + 6 + rnd() * 10; m.z = z + Math.sin(a) * rr;
      m.vx = Math.cos(a) * 2.5; m.vy = 38 + rnd() * 30; m.vz = Math.sin(a) * 2.5;
      m.life = 14 + rnd() * 8; m.s0 = 15 + rnd() * 6; m.s1 = 34 + rnd() * 14; m.drag = 0.62; m.buoy = 0.6; m.glow0 = 0.95; m.turb = 3; m.windK = 0.8; m.frames = 2.2; m.dis1 = 0.7;
      this.vol.commit();
    }
    if (step < 9) this.later(0.2, () => this.nukeStem(x, gy, z, step + 1));
  }

  private nukeCap(x: number, gy: number, z: number): void {
    const H = gy + 98;
    // glowing core of the cap
    for (let i = 0; i < 12; i++) {
      const f = this.pFire(1.0); f.add = 0.3;
      const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * 18;
      f.x = x + Math.cos(a) * rr; f.y = H + rnd() * 22 - 8; f.z = z + Math.sin(a) * rr;
      f.vx = Math.cos(a) * (3 + rnd() * 7); f.vy = 6 + rnd() * 10; f.vz = Math.sin(a) * (3 + rnd() * 7);
      f.life = 3.0 + rnd() * 2.2; f.s0 = 28 + rnd() * 12; f.s1 = 52 + rnd() * 20; f.drag = 0.7; f.buoy = 1; f.frame0 = 2; f.hdecay = 1.5; f.fadeOut = 0.4;
      this.vol.commit();
    }
    // toroidal cap: puffs shoot outward from the top of the stem
    for (let i = 0; i < 56; i++) {
      const a = rnd() * 6.2832;
      const lift = rnd();
      const m = this.pSmoke(0.25 + rnd() * 0.1, 0.8);
      const sp = 14 + rnd() * 20;
      m.x = x + Math.cos(a) * 6; m.y = H + lift * 22 - 8; m.z = z + Math.sin(a) * 6;
      m.vx = Math.cos(a) * sp; m.vy = (lift - 0.4) * 22 + 6; m.vz = Math.sin(a) * sp;
      m.life = 18 + rnd() * 9; m.s0 = 22 + rnd() * 10; m.s1 = 46 + rnd() * 24; m.drag = 0.55; m.buoy = -0.9; m.glow0 = 0.7; m.turb = 2.2; m.windK = 0.9; m.frames = 2.2; m.dis1 = 0.7;
      this.vol.commit();
    }
    // dome top
    for (let i = 0; i < 26; i++) {
      const m = this.pSmoke(0.3 + rnd() * 0.1, 0.8);
      const a = rnd() * 6.2832, rr = Math.sqrt(rnd()) * 18;
      m.x = x + Math.cos(a) * rr; m.y = H + 12 + rnd() * 16; m.z = z + Math.sin(a) * rr;
      m.vx = Math.cos(a) * 8; m.vy = 6 + rnd() * 8; m.vz = Math.sin(a) * 8;
      m.life = 18 + rnd() * 9; m.s0 = 24 + rnd() * 10; m.s1 = 50 + rnd() * 20; m.drag = 0.6; m.buoy = 0.2; m.glow0 = 0.4; m.windK = 0.9; m.dis1 = 0.7;
      this.vol.commit();
    }
    this.flashAt(x, H, z, 100, 0.5, false);
  }

  /** cinematic helper */
  reset(): void {
    this.vol.clear(); this.glow.clear(); this.debris.clear();
    this.emitters.length = 0; this.timed.length = 0; this.nAnch = 0;
  }
}
