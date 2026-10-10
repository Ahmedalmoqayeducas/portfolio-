import * as THREE from 'three';
import { GLSL_COMMON, turbSample, type Ground, type VfxUniforms } from './vfxCore';

// per-particle simulation state (AoS, Float32Array)
const ST = 36;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, ROT = 10, ROTV = 11;
const CR = 12, CG = 13, CB = 14, HEAT = 15, ALPHA = 16, DRAG = 17, BUOY = 18, TURB = 19, WINDK = 20, SHEET = 21, FRAME0 = 22, FRAMES = 23;
const SEED = 24, FADEIN = 25, FADEOUT = 26, DIS0 = 27, DIS1 = 28, GLOW0 = 29, ADD = 30, HDECAY = 31, HUG = 32;
// instance output
const OS = 16;

/** Reusable spawn descriptor (one instance per layer, reset() before use: no per-spawn allocation). */
export class Spawn {
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0;
  life = 1; s0 = 1; s1 = 1;
  r = 1; g = 1; b = 1;
  a = 1; heat = 0; drag = 0; buoy = 0; turb = 0; windK = 1;
  sheet = 0; frame0 = 0; frames = 0;
  rot = -1; rotv = 0;
  fadeIn = 0.15; fadeOut = 0.4;
  dis0 = 0; dis1 = 0;
  glow0 = 0; add = 0; hug = 0; hdecay = 1;
  reset(): this {
    this.x = this.y = this.z = this.vx = this.vy = this.vz = 0;
    this.life = 1; this.s0 = this.s1 = 1; this.r = this.g = this.b = 1;
    this.a = 1; this.heat = 0; this.drag = 0; this.buoy = 0; this.turb = 0; this.windK = 1;
    this.sheet = 0; this.frame0 = 0; this.frames = 0; this.rot = -1; this.rotv = 0;
    this.fadeIn = 0.15; this.fadeOut = 0.4; this.dis0 = 0; this.dis1 = 0; this.glow0 = 0; this.add = 0; this.hug = 0; this.hdecay = 1;
    return this;
  }
}

export interface CamInfo { x: number; y: number; z: number; fx: number; fy: number; fz: number }

const VERT = /* glsl */ `
attribute vec4 aPos; attribute vec4 aA; attribute vec4 aTint; attribute vec4 aB;
uniform vec3 uSunDir;
varying vec2 vUv; varying vec4 vA; varying vec4 vTint; varying vec4 vB; varying vec3 vWorld; varying vec3 vRot; varying vec3 vL; varying vec3 vUp; varying float vViewZ;
void main(){
  float rot = aPos.w, c = cos(rot), s = sin(rot);
  float flip = fract(aB.x * 13.7) < 0.5 ? 1.0 : -1.0;
  vec2 cr = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aA.x;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = aPos.xyz + right * cr.x + up * cr.y;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = vec2(flip > 0.0 ? uv.x : 1.0 - uv.x, uv.y);
  vA = aA; vTint = aTint; vB = aB; vWorld = wp; vRot = vec3(c, s, flip);
  vL = mat3(viewMatrix) * uSunDir;
  vUp = up;
  vViewZ = -mv.z;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uBig; uniform sampler2DArray uSmall; uniform sampler2D uNoise;
uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uGndCol; uniform float uDetail;
${GLSL_COMMON}
varying vec2 vUv; varying vec4 vA; varying vec4 vTint; varying vec4 vB; varying vec3 vWorld; varying vec3 vRot; varying vec3 vL; varying vec3 vUp; varying float vViewZ;

vec3 fireRamp(float T){
  T = clamp(T, 0.0, 1.25);
  vec3 c0 = vec3(0.035, 0.004, 0.002);
  vec3 c1 = vec3(0.55, 0.055, 0.008);
  vec3 c2 = vec3(1.35, 0.40, 0.045);
  vec3 c3 = vec3(2.30, 1.20, 0.30);
  vec3 c4 = vec3(3.40, 2.70, 1.70);
  vec3 c5 = vec3(4.2, 3.9, 3.4);
  vec3 c = mix(c0, c1, smoothstep(0.0, 0.22, T));
  c = mix(c, c2, smoothstep(0.18, 0.50, T));
  c = mix(c, c3, smoothstep(0.45, 0.76, T));
  c = mix(c, c4, smoothstep(0.72, 1.0, T));
  c = mix(c, c5, smoothstep(1.0, 1.25, T));
  return c;
}

vec4 sampleSheet(float sheet, float f, vec2 uv){
  float base = 0.0, count = 4.0; bool big = true;
  if (sheet < 3.5) { base = floor(sheet + 0.5) * 4.0; }
  else if (sheet < 4.5) { base = 16.0; count = 16.0; }
  else if (sheet < 5.5) { base = 0.0; count = 8.0; big = false; }
  else if (sheet < 6.5) { base = 8.0; count = 8.0; big = false; }
  else if (sheet < 7.5) { base = 16.0; count = 8.0; big = false; }
  else { base = 24.0; count = 8.0; big = false; }
  float f0 = floor(f), fb = f - f0;
  float l0 = base + clamp(f0, 0.0, count - 1.0), l1 = base + clamp(f0 + 1.0, 0.0, count - 1.0);
  vec4 a, b;
  if (big) { a = texture(uBig, vec3(uv, l0)); b = fb > 0.002 ? texture(uBig, vec3(uv, l1)) : a; }
  else { a = texture(uSmall, vec3(uv, l0)); b = fb > 0.002 ? texture(uSmall, vec3(uv, l1)) : a; }
  return mix(a, b, fb);
}

void main(){
  float sheet = vA.w;
  float alphaIn = vA.y;
  vec4 ts = sampleSheet(sheet, vA.z, vUv);
  float seed = vB.x, dissolve = vB.y;
  bool isFire = (sheet > 3.5 && sheet < 4.5) || (sheet > 6.5 && sheet < 7.5);

  vec4 nz = vec4(0.5);
  vec2 nuv = vUv * 1.6 + vec2(seed * 7.3, seed * 3.1);
  if (uDetail > 0.5) nz = texture2D(uNoise, nuv);
  float det = nz.r * 0.6 + nz.g * 0.4;
  float d = ts.r + (det - 0.5) * (0.30 + 0.9 * dissolve) * uDetail;
  float a = ts.r * smoothstep(dissolve, dissolve + 0.42, d);
  a *= alphaIn;

  // soft fade against the ground, near-camera fade, fog of war
  float sf = clamp(vA.x * 0.2, 0.5, 4.0);
  float gap = vWorld.y - groundH(vWorld.xz);
  a *= smoothstep(-0.3, sf, gap);
  a *= smoothstep(1.5, 5.0 + vA.x * 0.25, vViewZ);
  a *= fogVis(vWorld.xz);
  if (a < 0.002) discard;

  vec3 L = normalize(vL);
  vec3 up = normalize(vUp);
  vec3 col;
  float outA = a;
  if (isFire) {
    float T = ts.g * vTint.a * (0.82 + 0.36 * det);
    vec3 fc = fireRamp(T) * vTint.rgb;
    float soot = ts.b * (1.0 - clamp(vTint.a, 0.0, 1.0) * 0.55);
    vec3 sootCol = vec3(0.028, 0.022, 0.018) * (uSkyCol + uSunCol * 0.35 + 0.3);
    col = mix(fc, sootCol, clamp(soot, 0.0, 1.0));
    outA = a * (1.0 - vB.w * (1.0 - soot));
  } else {
    vec2 ns = vec2(ts.g * 2.0 - 1.0, ts.b * 2.0 - 1.0);
    ns.x *= vRot.z;
    ns += (nz.ba - 0.5) * 0.14 * uDetail * smoothstep(0.0, 0.3, ts.r);
    vec2 nv = vec2(vRot.x * ns.x - vRot.y * ns.y, vRot.y * ns.x + vRot.x * ns.y);
    nv *= min(1.0, 0.92 / max(0.001, length(nv)));
    vec3 N = vec3(nv, sqrt(max(0.05, 1.0 - dot(nv, nv))));
    float thick = ts.a;
    float ndl = dot(N, L);
    float wrap = clamp((ndl + 0.75) / 1.75, 0.0, 1.0);
    float shade = 1.0 - thick * 0.5;
    vec3 sun = uSunCol * wrap * shade;
    float back = clamp(-L.z, 0.0, 1.0);
    float rim = pow(1.0 - clamp(N.z, 0.0, 1.0), 1.5);
    sun += uSunCol * back * rim * (1.0 - thick * 0.55) * 0.85;
    float hemi = dot(N, up) * 0.5 + 0.5;
    vec3 amb = mix(uGndCol, uSkyCol, hemi) * (0.9 + 0.2 * (1.0 - thick));
    col = vTint.rgb * (sun + amb);
    col += vec3(1.0, 0.42, 0.10) * vB.z * (0.45 + 0.55 * max(0.0, -dot(N, up))) * (1.0 - thick * 0.45) * 1.1;
    // hot smoke cools into its tint
    col += vec3(1.0, 0.35, 0.08) * vTint.a * 0.6 * (1.0 - thick * 0.3);
  }
  gl_FragColor = vec4(col * a, outA);
}`;

/**
 * Soft, sorted, premultiplied-alpha billboard layer for smoke, dust, fire and flames.
 * Appearance is entirely shader driven (flipbook blend, relighting, erosion, soft ground fade).
 */
export class VolLayer {
  readonly mesh: THREE.Mesh;
  readonly s = new Spawn();
  n = 0;
  private readonly d: Float32Array;
  private readonly out: Float32Array;
  private readonly keys: Float64Array;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aA: THREE.InstancedBufferAttribute;
  private readonly aTint: THREE.InstancedBufferAttribute;
  private readonly aB: THREE.InstancedBufferAttribute;
  private readonly tmp = new Float32Array(3);
  sortEnabled = true;

  constructor(readonly cap: number, uniforms: VfxUniforms, private readonly ground: Ground) {
    this.d = new Float32Array(cap * ST);
    this.out = new Float32Array(cap * OS);
    this.keys = new Float64Array(cap);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(); this.aA = mk(); this.aTint = mk(); this.aB = mk();
    this.geo.setAttribute('aPos', this.aPos); this.geo.setAttribute('aA', this.aA);
    this.geo.setAttribute('aTint', this.aTint); this.geo.setAttribute('aB', this.aB);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'vfx-vol';
  }

  /** instances currently queued for drawing */
  private drawn = 0;
  /** hide from override-material passes (GTAO normal pre-pass would otherwise treat billboards as solid geometry) */
  setPassVisibility(override: boolean): void { this.geo.instanceCount = override ? 0 : this.drawn; }

  commit(): void {
    if (this.n >= this.cap) return;
    const s = this.s, d = this.d, o = this.n++ * ST;
    d[o + PX] = s.x; d[o + PY] = s.y; d[o + PZ] = s.z; d[o + VX] = s.vx; d[o + VY] = s.vy; d[o + VZ] = s.vz;
    d[o + AGE] = 0; d[o + LIFE] = s.life; d[o + S0] = s.s0; d[o + S1] = s.s1;
    d[o + ROT] = s.rot < 0 ? Math.random() * 6.2832 : s.rot; d[o + ROTV] = s.rotv;
    d[o + CR] = s.r; d[o + CG] = s.g; d[o + CB] = s.b; d[o + HEAT] = s.heat; d[o + ALPHA] = s.a;
    d[o + DRAG] = s.drag; d[o + BUOY] = s.buoy; d[o + TURB] = s.turb; d[o + WINDK] = s.windK;
    d[o + SHEET] = s.sheet; d[o + FRAME0] = s.frame0; d[o + FRAMES] = s.frames; d[o + SEED] = Math.random();
    d[o + FADEIN] = Math.max(0.001, s.fadeIn); d[o + FADEOUT] = s.fadeOut; d[o + DIS0] = s.dis0; d[o + DIS1] = s.dis1;
    d[o + GLOW0] = s.glow0; d[o + ADD] = s.add; d[o + HDECAY] = s.hdecay; d[o + HUG] = s.hug;
  }

  clear(): void { this.n = 0; this.drawn = 0; this.geo.instanceCount = 0; }

  update(dt: number, time: number, cam: CamInfo, windX: number, windZ: number): void {
    const d = this.d, out = this.out, keys = this.keys, tmp = this.tmp;
    const ground = this.ground;
    let i = 0;
    const sort = this.sortEnabled;
    while (i < this.n) {
      const o = i * ST;
      const age = (d[o + AGE] += dt);
      const life = d[o + LIFE];
      if (age >= life) {
        const last = (this.n - 1) * ST;
        if (o !== last) for (let k = 0; k < ST; k++) d[o + k] = d[last + k];
        this.n--;
        continue;
      }
      const t = age / life;
      const f = Math.exp(-d[o + DRAG] * dt);
      const wk = d[o + WINDK];
      const wx = windX * wk, wz = windZ * wk;
      let vx = wx + (d[o + VX] - wx) * f, vy = d[o + VY] * f + d[o + BUOY] * dt, vz = wz + (d[o + VZ] - wz) * f;
      const tb = d[o + TURB];
      if (tb > 0) {
        turbSample(d[o + PX] * 0.11 + time * 0.25, d[o + PY] * 0.11, d[o + PZ] * 0.11 - time * 0.2, tmp);
        const k = tb * dt;
        vx += tmp[0] * k; vy += tmp[1] * k * 0.6; vz += tmp[2] * k;
      }
      d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
      const px = (d[o + PX] += vx * dt);
      let py = (d[o + PY] += vy * dt);
      const pz = (d[o + PZ] += vz * dt);
      if (d[o + HUG] > 0) {
        const gy = Math.max(ground.heightAt(px, pz), ground.waterY) + d[o + HUG];
        if (py < gy) { py = d[o + PY] = gy; if (d[o + VY] < 0) d[o + VY] = 0; }
      }
      const rot = (d[o + ROT] += d[o + ROTV] * dt);
      const e = 1 - (1 - t) * (1 - t);
      const size = d[o + S0] + (d[o + S1] - d[o + S0]) * e;
      const fin = Math.min(1, age / d[o + FADEIN]);
      const fo = d[o + FADEOUT];
      let fade = 1;
      if (fo > 0) { const u = Math.min(1, Math.max(0, (t - (1 - fo)) / fo)); fade = 1 - u * u * (3 - 2 * u); }
      const q = o / ST * OS;
      out[q] = px; out[q + 1] = py; out[q + 2] = pz; out[q + 3] = rot;
      out[q + 4] = size; out[q + 5] = d[o + ALPHA] * fin * fade; out[q + 6] = d[o + FRAME0] + d[o + FRAMES] * t; out[q + 7] = d[o + SHEET];
      out[q + 8] = d[o + CR]; out[q + 9] = d[o + CG]; out[q + 10] = d[o + CB];
      const om = 1 - t;
      out[q + 11] = d[o + HEAT] * Math.pow(om, d[o + HDECAY]);
      out[q + 12] = d[o + SEED];
      const tt = t * t;
      out[q + 13] = d[o + DIS0] + (d[o + DIS1] - d[o + DIS0]) * tt;
      out[q + 14] = d[o + GLOW0] * Math.exp(-age * 1.6);
      out[q + 15] = d[o + ADD];
      if (sort) {
        const dep = (px - cam.x) * cam.fx + (py - cam.y) * cam.fy + (pz - cam.z) * cam.fz;
        keys[i] = Math.floor((4095 - Math.min(4095, Math.max(0, dep))) * 1024) * 2097152 + i;
      }
      i++;
    }
    const n = this.n;
    const pa = this.aPos.array as Float32Array, aa = this.aA.array as Float32Array, ta = this.aTint.array as Float32Array, ba = this.aB.array as Float32Array;
    if (sort && n > 1) {
      keys.subarray(0, n).sort();
      for (let k = 0; k < n; k++) {
        const idx = keys[k] % 2097152;
        const q = idx * OS, w = k * 4;
        pa[w] = out[q]; pa[w + 1] = out[q + 1]; pa[w + 2] = out[q + 2]; pa[w + 3] = out[q + 3];
        aa[w] = out[q + 4]; aa[w + 1] = out[q + 5]; aa[w + 2] = out[q + 6]; aa[w + 3] = out[q + 7];
        ta[w] = out[q + 8]; ta[w + 1] = out[q + 9]; ta[w + 2] = out[q + 10]; ta[w + 3] = out[q + 11];
        ba[w] = out[q + 12]; ba[w + 1] = out[q + 13]; ba[w + 2] = out[q + 14]; ba[w + 3] = out[q + 15];
      }
    } else {
      for (let k = 0; k < n; k++) {
        const q = k * OS, w = k * 4;
        pa[w] = out[q]; pa[w + 1] = out[q + 1]; pa[w + 2] = out[q + 2]; pa[w + 3] = out[q + 3];
        aa[w] = out[q + 4]; aa[w + 1] = out[q + 5]; aa[w + 2] = out[q + 6]; aa[w + 3] = out[q + 7];
        ta[w] = out[q + 8]; ta[w + 1] = out[q + 9]; ta[w + 2] = out[q + 10]; ta[w + 3] = out[q + 11];
        ba[w] = out[q + 12]; ba[w + 1] = out[q + 13]; ba[w + 2] = out[q + 14]; ba[w + 3] = out[q + 15];
      }
    }
    this.drawn = n;
    this.geo.instanceCount = n;
    if (n > 0) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n * 4); this.aPos.needsUpdate = true;
      this.aA.clearUpdateRanges(); this.aA.addUpdateRange(0, n * 4); this.aA.needsUpdate = true;
      this.aTint.clearUpdateRanges(); this.aTint.addUpdateRange(0, n * 4); this.aTint.needsUpdate = true;
      this.aB.clearUpdateRanges(); this.aB.addUpdateRange(0, n * 4); this.aB.needsUpdate = true;
    }
  }
}
