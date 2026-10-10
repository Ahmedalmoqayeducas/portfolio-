import * as THREE from 'three';
import { GLSL_COMMON, type Ground, type VfxUniforms } from './vfxCore';

const ST = 28;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, ROT = 10, ROTV = 11;
const C0R = 12, C0G = 13, C0B = 14, C1R = 15, C1G = 16, C1B = 17, A0 = 18, A1 = 19, DRAG = 20, GRAV = 21, SHAPE = 22, STRETCH = 23, BOUNCE = 24, FLICK = 25;

export const GLOW = { DISC: 0, STREAK: 1, STAR: 2, RING: 3 } as const;

export class GlowSpawn {
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0;
  life = 1; s0 = 1; s1 = 1;
  r0 = 1; g0 = 1; b0 = 1; r1 = 1; g1 = 1; b1 = 1;
  a0 = 1; a1 = 0; drag = 0; grav = 0; shape = 0; stretch = 0.03; rot = -1; rotv = 0; bounce = 0; flicker = 0;
  reset(): this {
    this.x = this.y = this.z = this.vx = this.vy = this.vz = 0;
    this.life = 1; this.s0 = this.s1 = 1; this.r0 = this.g0 = this.b0 = this.r1 = this.g1 = this.b1 = 1;
    this.a0 = 1; this.a1 = 0; this.drag = 0; this.grav = 0; this.shape = 0; this.stretch = 0.03; this.rot = -1; this.rotv = 0; this.bounce = 0; this.flicker = 0;
    return this;
  }
}

const VERT = /* glsl */ `
attribute vec4 aP; attribute vec4 aV; attribute vec4 aC; attribute vec4 aS;
varying vec2 vUv; varying vec4 vC; varying float vShape; varying vec2 vS; varying vec3 vWorld;
void main(){
  float shape = aV.w;
  vec4 mv = viewMatrix * vec4(aP.xyz, 1.0);
  vec2 off;
  if (shape > 0.5 && shape < 1.5) {
    vec4 mt = viewMatrix * vec4(aP.xyz - aV.xyz * aS.y, 1.0);
    vec2 dir = mt.xy - mv.xy;
    float len = length(dir);
    vec2 dn = len > 1e-4 ? dir / len : vec2(0.0, -1.0);
    float L = max(len, aP.w * 1.3);
    vec2 nrm = vec2(-dn.y, dn.x);
    float along = position.y + 0.5;
    off = dn * (along * L) + nrm * position.x * aP.w;
    vUv = vec2(position.x + 0.5, 1.0 - along);
  } else {
    float c = cos(aS.x), s = sin(aS.x);
    off = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aP.w;
    vUv = uv;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vC = aC; vShape = shape; vS = vec2(aS.x, aP.w); vWorld = aP.xyz + right * off.x + up * off.y;
}`;

const FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
varying vec2 vUv; varying vec4 vC; varying float vShape; varying vec2 vS; varying vec3 vWorld;
void main(){
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float g;
  if (vShape < 0.5) {
    g = exp(-r * r * 4.2) * smoothstep(1.0, 0.75, r);
    g += 0.35 * smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.25, r) * 0.5;
  } else if (vShape < 1.5) {
    float ax = abs(vUv.x - 0.5) * 2.0;
    float prof = exp(-ax * ax * 7.0);
    float head = vUv.y;
    g = prof * (0.10 + 0.90 * pow(head, 2.4)) * smoothstep(1.0, 0.9, head);
  } else if (vShape < 2.5) {
    float ang = atan(c.y, c.x);
    float core = exp(-r * r * 9.0);
    float halo = 0.55 / (1.0 + r * r * 26.0) * smoothstep(1.0, 0.5, r);
    float spikes = pow(abs(cos(3.0 * ang + vS.x)), 22.0) * exp(-r * 2.6) * smoothstep(1.0, 0.2, r);
    float spikes2 = pow(abs(cos(2.0 * ang + vS.x * 1.7 + 1.0)), 40.0) * exp(-r * 3.6) * 0.55;
    g = core + halo + spikes * 0.9 + spikes2;
  } else {
    float ring = exp(-pow((r - 0.78) * 7.0, 2.0));
    g = ring * smoothstep(1.0, 0.85, r);
  }
  float fv = fogVis(vWorld.xz);
  float gap = vWorld.y - groundH(vWorld.xz);
  fv *= smoothstep(-0.4, 0.3 + vS.y * 0.22, gap);
  vec3 col = vC.rgb * (g * vC.a * fv);
  if (col.r + col.g + col.b < 0.0015) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

/** Additive HDR layer: sparks (velocity stretched), flashes, glows, embers. */
export class GlowLayer {
  readonly mesh: THREE.Mesh;
  readonly s = new GlowSpawn();
  n = 0;
  private readonly d: Float32Array;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly aP: THREE.InstancedBufferAttribute;
  private readonly aV: THREE.InstancedBufferAttribute;
  private readonly aC: THREE.InstancedBufferAttribute;
  private readonly aS: THREE.InstancedBufferAttribute;
  private drawn = 0;

  constructor(readonly cap: number, uniforms: VfxUniforms, private readonly ground: Ground) {
    this.d = new Float32Array(cap * ST);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    const mk = () => new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aP = mk(); this.aV = mk(); this.aC = mk(); this.aS = mk();
    this.geo.setAttribute('aP', this.aP); this.geo.setAttribute('aV', this.aV); this.geo.setAttribute('aC', this.aC); this.geo.setAttribute('aS', this.aS);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.name = 'vfx-glow';
  }

  setPassVisibility(override: boolean): void { this.geo.instanceCount = override ? 0 : this.drawn; }

  commit(): void {
    if (this.n >= this.cap) return;
    const s = this.s, d = this.d, o = this.n++ * ST;
    d[o + PX] = s.x; d[o + PY] = s.y; d[o + PZ] = s.z; d[o + VX] = s.vx; d[o + VY] = s.vy; d[o + VZ] = s.vz;
    d[o + AGE] = 0; d[o + LIFE] = s.life; d[o + S0] = s.s0; d[o + S1] = s.s1;
    d[o + ROT] = s.rot < 0 ? Math.random() * 6.2832 : s.rot; d[o + ROTV] = s.rotv;
    d[o + C0R] = s.r0; d[o + C0G] = s.g0; d[o + C0B] = s.b0; d[o + C1R] = s.r1; d[o + C1G] = s.g1; d[o + C1B] = s.b1;
    d[o + A0] = s.a0; d[o + A1] = s.a1; d[o + DRAG] = s.drag; d[o + GRAV] = s.grav; d[o + SHAPE] = s.shape; d[o + STRETCH] = s.stretch; d[o + BOUNCE] = s.bounce; d[o + FLICK] = s.flicker;
  }

  clear(): void { this.n = 0; this.drawn = 0; this.geo.instanceCount = 0; }

  update(dt: number, time: number): void {
    const d = this.d, ground = this.ground;
    const P = this.aP.array as Float32Array, V = this.aV.array as Float32Array, C = this.aC.array as Float32Array, S = this.aS.array as Float32Array;
    let i = 0;
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
      let vx = d[o + VX] * f, vy = d[o + VY] * f - d[o + GRAV] * dt, vz = d[o + VZ] * f;
      const px = (d[o + PX] += vx * dt);
      let py = (d[o + PY] += vy * dt);
      const pz = (d[o + PZ] += vz * dt);
      if (d[o + BOUNCE] > 0) {
        const gy = Math.max(ground.heightAt(px, pz), ground.waterY) + 0.1;
        if (py < gy && vy < 0) { py = d[o + PY] = gy; vy = -vy * 0.35; vx *= 0.6; vz *= 0.6; }
      }
      d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
      const rot = (d[o + ROT] += d[o + ROTV] * dt);
      const size = d[o + S0] + (d[o + S1] - d[o + S0]) * Math.sqrt(t);
      let a = d[o + A0] + (d[o + A1] - d[o + A0]) * t;
      const fl = d[o + FLICK];
      if (fl > 0) a *= 1 - fl + fl * (0.5 + 0.5 * Math.sin(time * 40 + d[o + PX] * 7.1 + age * 53));
      const w = i * 4;
      P[w] = px; P[w + 1] = py; P[w + 2] = pz; P[w + 3] = size;
      V[w] = vx; V[w + 1] = vy; V[w + 2] = vz; V[w + 3] = d[o + SHAPE];
      C[w] = d[o + C0R] + (d[o + C1R] - d[o + C0R]) * t;
      C[w + 1] = d[o + C0G] + (d[o + C1G] - d[o + C0G]) * t;
      C[w + 2] = d[o + C0B] + (d[o + C1B] - d[o + C0B]) * t;
      C[w + 3] = a;
      S[w] = rot; S[w + 1] = d[o + STRETCH]; S[w + 2] = t; S[w + 3] = 0;
      i++;
    }
    const n = this.n;
    this.drawn = n;
    this.geo.instanceCount = n;
    if (n > 0) {
      this.aP.clearUpdateRanges(); this.aP.addUpdateRange(0, n * 4); this.aP.needsUpdate = true;
      this.aV.clearUpdateRanges(); this.aV.addUpdateRange(0, n * 4); this.aV.needsUpdate = true;
      this.aC.clearUpdateRanges(); this.aC.addUpdateRange(0, n * 4); this.aC.needsUpdate = true;
      this.aS.clearUpdateRanges(); this.aS.addUpdateRange(0, n * 4); this.aS.needsUpdate = true;
    }
  }
}
