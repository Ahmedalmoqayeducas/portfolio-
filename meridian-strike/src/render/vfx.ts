import * as THREE from 'three';
import { makeParticleAtlas } from './materials';
import { mulberry32 } from '../procgen/noise';
import type { Terrain } from './terrain';

const STRIDE = 24;
// field offsets
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, ROT = 10, ROTV = 11;
const C0R = 12, C0G = 13, C0B = 14, C1R = 15, C1G = 16, C1B = 17, A0 = 18, A1 = 19, DRAG = 20, GRAV = 21, CELL = 22, FADEIN = 23;

class ParticleLayer {
  readonly mesh: THREE.Mesh;
  readonly data: Float32Array;
  n = 0;
  private aPos: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aRot: THREE.InstancedBufferAttribute;
  private aCell: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(readonly cap: number, atlas: THREE.Texture, additive: boolean, readonly light: THREE.Vector3) {
    this.data = new Float32Array(cap * STRIDE);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCell = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aSize', this.aSize);
    this.geo.setAttribute('aColor', this.aColor);
    this.geo.setAttribute('aRot', this.aRot);
    this.geo.setAttribute('aCell', this.aCell);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas }, uLight: { value: light }, uAdd: { value: additive ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 aPos; attribute float aSize; attribute vec4 aColor; attribute float aRot; attribute float aCell;
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
          float c = cos(aRot), s = sin(aRot);
          vec2 p = vec2(position.x*c - position.y*s, position.x*s + position.y*c) * aSize;
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
          vec2 off = vec2(mod(aCell, 2.0), floor(aCell / 2.0));
          vUv = (uv + off) * 0.5;
          vCol = aColor;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 uLight; uniform float uAdd;
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 t = texture2D(map, vUv);
          float a = t.a * vCol.a;
          if (a < 0.003) discard;
          vec3 col = vCol.rgb * mix(t.rgb, vec3(1.0), uAdd);
          if (uAdd < 0.5) col *= uLight;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 11 : 10;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number,
    c0: number, c1: number, a0: number, a1: number, drag: number, grav: number, cell: number, rotv: number, fadeIn = 8): void {
    if (this.n >= this.cap) return;
    const d = this.data, o = this.n++ * STRIDE;
    d[o + PX] = x; d[o + PY] = y; d[o + PZ] = z; d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
    d[o + AGE] = 0; d[o + LIFE] = life; d[o + S0] = s0; d[o + S1] = s1;
    d[o + ROT] = Math.random() * 6.28; d[o + ROTV] = rotv;
    d[o + C0R] = ((c0 >> 16) & 255) / 255; d[o + C0G] = ((c0 >> 8) & 255) / 255; d[o + C0B] = (c0 & 255) / 255;
    d[o + C1R] = ((c1 >> 16) & 255) / 255; d[o + C1G] = ((c1 >> 8) & 255) / 255; d[o + C1B] = (c1 & 255) / 255;
    d[o + A0] = a0; d[o + A1] = a1; d[o + DRAG] = drag; d[o + GRAV] = grav; d[o + CELL] = cell; d[o + FADEIN] = fadeIn;
  }

  update(dt: number): void {
    const d = this.data;
    let i = 0;
    const pos = this.aPos.array as Float32Array, size = this.aSize.array as Float32Array, col = this.aColor.array as Float32Array;
    const rot = this.aRot.array as Float32Array, cell = this.aCell.array as Float32Array;
    while (i < this.n) {
      const o = i * STRIDE;
      d[o + AGE] += dt;
      const age = d[o + AGE], life = d[o + LIFE];
      if (age >= life) {
        const last = (this.n - 1) * STRIDE;
        if (o !== last) for (let k = 0; k < STRIDE; k++) d[o + k] = d[last + k];
        this.n--;
        continue;
      }
      const t = age / life;
      const drag = Math.exp(-d[o + DRAG] * dt);
      d[o + VX] *= drag; d[o + VY] = d[o + VY] * drag - d[o + GRAV] * dt; d[o + VZ] *= drag;
      d[o + PX] += d[o + VX] * dt; d[o + PY] += d[o + VY] * dt; d[o + PZ] += d[o + VZ] * dt;
      d[o + ROT] += d[o + ROTV] * dt;
      pos[i * 3] = d[o + PX]; pos[i * 3 + 1] = d[o + PY]; pos[i * 3 + 2] = d[o + PZ];
      size[i] = d[o + S0] + (d[o + S1] - d[o + S0]) * Math.sqrt(t);
      col[i * 4] = d[o + C0R] + (d[o + C1R] - d[o + C0R]) * t;
      col[i * 4 + 1] = d[o + C0G] + (d[o + C1G] - d[o + C0G]) * t;
      col[i * 4 + 2] = d[o + C0B] + (d[o + C1B] - d[o + C0B]) * t;
      col[i * 4 + 3] = (d[o + A0] + (d[o + A1] - d[o + A0]) * t) * Math.min(1, age * d[o + FADEIN]);
      rot[i] = d[o + ROT];
      cell[i] = d[o + CELL];
      i++;
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aColor.needsUpdate = this.aRot.needsUpdate = this.aCell.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------ tracers / streaks
class StreakLayer {
  readonly mesh: THREE.Mesh;
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private wid: THREE.InstancedBufferAttribute;
  private life = new Float32Array(0);
  private maxLife = new Float32Array(0);
  private geo: THREE.InstancedBufferGeometry;
  n = 0;
  constructor(readonly cap: number) {
    this.life = new Float32Array(cap); this.maxLife = new Float32Array(cap);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.wid = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aA', this.a); this.geo.setAttribute('aB', this.b); this.geo.setAttribute('aCol', this.col); this.geo.setAttribute('aW', this.wid);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 aA; attribute vec3 aB; attribute vec4 aCol; attribute float aW;
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 a = modelViewMatrix * vec4(aA, 1.0);
          vec4 b = modelViewMatrix * vec4(aB, 1.0);
          vec3 dir = b.xyz - a.xyz;
          vec2 d2 = normalize(dir.xy + vec2(1e-5));
          vec2 nrm = vec2(-d2.y, d2.x);
          float along = position.y + 0.5;
          vec4 p = mix(a, b, along);
          p.xy += nrm * position.x * aW;
          gl_Position = projectionMatrix * p;
          vUv = uv; vCol = aCol;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = pow(edge, 0.6) * vCol.a * (0.45 + 0.55*vUv.y);
          gl_FragColor = vec4(vCol.rgb, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, width: number, life: number): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const A = this.a.array as Float32Array, B = this.b.array as Float32Array, C = this.col.array as Float32Array;
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az; B[i * 3] = bx; B[i * 3 + 1] = by; B[i * 3 + 2] = bz;
    C[i * 4] = ((color >> 16) & 255) / 255; C[i * 4 + 1] = ((color >> 8) & 255) / 255; C[i * 4 + 2] = (color & 255) / 255; C[i * 4 + 3] = 1;
    (this.wid.array as Float32Array)[i] = width;
    this.life[i] = life; this.maxLife[i] = life;
  }
  update(dt: number): void {
    const A = this.a.array as Float32Array, B = this.b.array as Float32Array, C = this.col.array as Float32Array, W = this.wid.array as Float32Array;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = this.n - 1;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { A[i * 3 + k] = A[l * 3 + k]; B[i * 3 + k] = B[l * 3 + k]; }
          for (let k = 0; k < 4; k++) C[i * 4 + k] = C[l * 4 + k];
          W[i] = W[l]; this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l];
        }
        this.n--;
        continue;
      }
      C[i * 4 + 3] = this.life[i] / this.maxLife[i];
      i++;
    }
    this.geo.instanceCount = this.n;
    this.a.needsUpdate = this.b.needsUpdate = this.col.needsUpdate = this.wid.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------ decals
class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  private ages: Float32Array;
  private lives: Float32Array;
  private alpha: THREE.InstancedBufferAttribute;
  private next = 0;
  private m = new THREE.Matrix4();
  private count = 0;
  constructor(readonly cap: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const tex = makeDecalTexture();
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: /* glsl */ `attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; varying vec2 vUv; varying float vA; void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(t.rgb * 0.6, a); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.ages = new Float32Array(cap);
    this.lives = new Float32Array(cap).fill(0);
    this.mesh.count = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, zero);
  }
  add(x: number, y: number, z: number, size: number, rot: number, life: number): void {
    const i = this.next++ % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
    this.m.makeRotationY(rot).scale(new THREE.Vector3(size, 1, size)).setPosition(x, y + 0.08, z);
    this.m.elements[12] = x; this.m.elements[13] = y + 0.08; this.m.elements[14] = z;
    this.mesh.setMatrixAt(i, this.m);
    this.ages[i] = 0; this.lives[i] = life;
    (this.alpha.array as Float32Array)[i] = 1;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt: number): void {
    const a = this.alpha.array as Float32Array;
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      if (this.lives[i] <= 0) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.lives[i];
      const v = t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
      if (a[i] !== v) { a[i] = v; dirty = true; }
      if (t >= 1) this.lives[i] = 0;
    }
    if (dirty) this.alpha.needsUpdate = true;
  }
}

function makeDecalTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(5);
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(10,8,6,0.95)'); grad.addColorStop(0.55, 'rgba(18,14,10,0.7)'); grad.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * S * 0.45;
    const rr = 4 + rnd() * 18;
    const gr = g.createRadialGradient(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 0, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rr);
    gr.addColorStop(0, `rgba(12,10,8,${0.2 + rnd() * 0.3})`); gr.addColorStop(1, 'rgba(12,10,8,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------------------ shockwaves
class ShockLayer {
  readonly mesh: THREE.InstancedMesh;
  private ages: Float32Array;
  private maxAge: Float32Array;
  private radius: Float32Array;
  private pos: Float32Array;
  private alpha: THREE.InstancedBufferAttribute;
  private tint: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private next = 0;
  constructor(readonly cap: number) {
    const geo = new THREE.RingGeometry(0.82, 1, 48, 1);
    geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    geo.setAttribute('aTint', this.tint);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `attribute float aAlpha; attribute vec3 aTint; varying float vA; varying vec3 vT; void main(){ vA = aAlpha; vT = aTint; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vT; void main(){ gl_FragColor = vec4(vT, vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.ages = new Float32Array(cap).fill(99); this.maxAge = new Float32Array(cap).fill(1); this.radius = new Float32Array(cap); this.pos = new Float32Array(cap * 3);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, z);
  }
  add(x: number, y: number, z: number, r: number, life: number, color: number): void {
    const i = this.next++ % this.cap;
    this.ages[i] = 0; this.maxAge[i] = life; this.radius[i] = r;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    const t = this.tint.array as Float32Array;
    t[i * 3] = ((color >> 16) & 255) / 255; t[i * 3 + 1] = ((color >> 8) & 255) / 255; t[i * 3 + 2] = (color & 255) / 255;
  }
  update(dt: number): void {
    const a = this.alpha.array as Float32Array;
    for (let i = 0; i < this.cap; i++) {
      if (this.ages[i] > this.maxAge[i]) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.maxAge[i];
      if (t >= 1) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); a[i] = 0; continue; }
      const r = this.radius[i] * (0.12 + 0.88 * (1 - Math.pow(1 - t, 3)));
      this.m.makeScale(r, 1, r).setPosition(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      this.m.elements[12] = this.pos[i * 3]; this.m.elements[13] = this.pos[i * 3 + 1]; this.m.elements[14] = this.pos[i * 3 + 2];
      this.mesh.setMatrixAt(i, this.m);
      a[i] = (1 - t) * 0.55;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
    this.tint.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------ main facade
export type ExplosionKind = 'gen' | 'big' | 'air' | 'nuke' | 'emp' | 'fire' | 'ground' | 'cyber';

export class Vfx {
  readonly group = new THREE.Group();
  readonly smoke: ParticleLayer;
  readonly glow: ParticleLayer;
  readonly streaks: StreakLayer;
  readonly decals: DecalLayer;
  readonly shocks: ShockLayer;
  private lights: { l: THREE.PointLight; t: number; peak: number }[] = [];
  private emitters: { x: number; y: number; z: number; until: number; rate: number; acc: number; kind: number }[] = [];
  private shakes: { x: number; z: number; amt: number; t: number }[] = [];
  readonly light = new THREE.Vector3(1, 1, 1);
  private now = 0;
  flash = 0;

  constructor(private terrain: Terrain, scene: THREE.Scene) {
    const atlas = makeParticleAtlas();
    this.smoke = new ParticleLayer(14000, atlas, false, this.light);
    this.glow = new ParticleLayer(14000, atlas, true, this.light);
    this.streaks = new StreakLayer(3000);
    this.decals = new DecalLayer(1500);
    this.shocks = new ShockLayer(32);
    this.group.add(this.decals.mesh, this.shocks.mesh, this.smoke.mesh, this.glow.mesh, this.streaks.mesh);
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 90, 1.6);
      l.castShadow = false;
      this.group.add(l);
      this.lights.push({ l, t: 0, peak: 0 });
    }
    scene.add(this.group);
  }

  setDaylight(k: number): void {
    const v = 0.18 + 0.82 * k;
    this.light.set(v, v * 0.98, v * 0.95 + (1 - k) * 0.08);
  }

  update(dt: number): void {
    this.now += dt;
    this.smoke.update(dt);
    this.glow.update(dt);
    this.streaks.update(dt);
    this.decals.update(dt);
    this.shocks.update(dt);
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.peak * (L.t / 0.45)); if (L.t <= 0) L.l.intensity = 0; }
    }
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      if (this.now > e.until) { this.emitters.splice(i, 1); continue; }
      e.acc += dt * e.rate;
      while (e.acc >= 1) { e.acc -= 1; this.burnPuff(e.x, e.y, e.z, e.kind); }
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

  private pointLight(x: number, y: number, z: number, intensity: number, color = 0xffa860): void {
    let best = this.lights[0];
    for (const L of this.lights) if (L.t < best.t) best = L;
    best.l.position.set(x, y + 3, z);
    best.l.color.setHex(color);
    best.peak = intensity; best.t = 0.45;
    best.l.intensity = intensity;
  }

  // ---- primitives
  private burnPuff(x: number, y: number, z: number, kind: number): void {
    const r = Math.random;
    if (kind === 0) {
      // fire + smoke column
      this.glow.spawn(x + (r() - 0.5) * 2, y + 0.3, z + (r() - 0.5) * 2, (r() - 0.5) * 0.8, 3 + r() * 2, (r() - 0.5) * 0.8, 0.7 + r() * 0.4, 1.8, 0.5, 0xffa040, 0xff3010, 0.8, 0, 0.5, -1, 0, 1, 10);
      this.smoke.spawn(x + (r() - 0.5) * 2, y + 2, z + (r() - 0.5) * 2, 1.2 + (r() - 0.5), 4 + r() * 2, (r() - 0.5), 3.5 + r() * 2, 2.5, 8, 0x3a3836, 0x1a1918, 0.5, 0, 0.4, -0.5, 1, (r() - 0.5) * 0.5, 4);
    } else {
      this.smoke.spawn(x, y + 1, z, 1 + r(), 3 + r() * 2, r() - 0.5, 3 + r() * 2, 1.5, 6, 0x555250, 0x2a2928, 0.35, 0, 0.5, -0.3, 1, 0.2, 4);
    }
  }

  fireAt(x: number, y: number, z: number, seconds: number, size = 1): void {
    this.emitters.push({ x, y, z, until: this.now + seconds, rate: 7 * size, acc: 0, kind: 0 });
  }
  smokeAt(x: number, y: number, z: number, seconds: number): void {
    this.emitters.push({ x, y, z, until: this.now + seconds, rate: 3, acc: 0, kind: 1 });
  }

  trail(x: number, y: number, z: number, kind: 'missile' | 'rocket' | 'shell' | 'bomb' | 'bullet'): void {
    const r = Math.random;
    if (kind === 'missile' || kind === 'rocket') {
      this.glow.spawn(x, y, z, 0, 0, 0, 0.12, 1.1, 0.2, 0xffcc88, 0xff6a20, 0.9, 0, 3, 0, 0, 0, 40);
      this.smoke.spawn(x + (r() - 0.5) * 0.3, y, z + (r() - 0.5) * 0.3, 0, 0.4, 0, 1.6 + r() * 0.8, 0.8, 3.2, 0xe8e6e0, 0xb0aea8, 0.38, 0, 1, 0, 1, 0.3, 20);
    } else if (kind === 'shell') {
      this.smoke.spawn(x, y, z, 0, 0.2, 0, 0.9, 0.5, 1.8, 0xd8d6d0, 0xa8a6a0, 0.18, 0, 1.5, 0, 1, 0.2, 20);
    } else if (kind === 'bomb') {
      this.smoke.spawn(x, y, z, 0, 0, 0, 0.8, 0.5, 1.3, 0xd8d6d0, 0xa8a6a0, 0.12, 0, 1.5, 0, 1, 0.2, 20);
    }
  }

  muzzle(x: number, y: number, z: number, dx: number, dz: number, kind: string, big: boolean): void {
    const r = Math.random;
    const s = kind === 'cannon' || big ? 3.6 : kind === 'missile' || kind === 'rocket' ? 2.8 : kind === 'shell' ? 5.5 : 1.3;
    this.glow.spawn(x + dx, y, z + dz, 0, 0, 0, 0.09, s, s * 0.35, 0xfff0c0, 0xff8a30, 1, 0, 2, 0, 3, 0, 80);
    if (s > 2) {
      const n = kind === 'shell' ? 7 : 4;
      for (let i = 0; i < n; i++) this.smoke.spawn(x + dx * 1.5, y, z + dz * 1.5, dx * (2 + r() * 5) + (r() - 0.5) * 2, 0.6 + r() * 1.5, dz * (2 + r() * 5) + (r() - 0.5) * 2, 0.9 + r() * 0.9, 0.9, 3.2 + s * 0.4, 0xc8c4bc, 0x8a8782, 0.4, 0, 1.5, -0.2, 1, (r() - 0.5), 12);
      this.pointLight(x, y, z, kind === 'shell' ? 4 : 2.2);
    }
    void kind;
  }

  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, kind: string): void {
    const heavy = kind === 'cannon';
    // visible portion: a short bright streak travelling from muzzle towards the target
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz) || 1;
    const seg = Math.min(l, heavy ? 14 : 9);
    const t0 = 0.12 + Math.random() * 0.5;
    const sx = ax + dx * t0, sy = ay + dy * t0, sz = az + dz * t0;
    const ex = sx + (dx / l) * seg, ey = sy + (dy / l) * seg, ez = sz + (dz / l) * seg;
    this.streaks.add(sx, sy, sz, ex, ey, ez, heavy ? 0xfff2c8 : 0xffd27a, heavy ? 0.22 : 0.11, heavy ? 0.12 : 0.09);
  }

  hit(x: number, y: number, z: number, big = false): void {
    const r = Math.random;
    this.glow.spawn(x, y, z, 0, 0, 0, 0.09, big ? 2.2 : 1.1, 0.3, 0xffe0a0, 0xff7a20, 0.9, 0, 2, 0, 2, 0, 80);
    for (let i = 0; i < (big ? 6 : 3); i++) this.glow.spawn(x, y, z, (r() - 0.5) * 12, 3 + r() * 8, (r() - 0.5) * 12, 0.35 + r() * 0.3, 0.35, 0.05, 0xffd890, 0xff5a10, 1, 0, 0.8, 22, 2, 0, 40);
    this.smoke.spawn(x, y, z, (r() - 0.5), 1 + r(), (r() - 0.5), 0.9, 0.8, 2.2, 0x6a625a, 0x3a3733, 0.4, 0, 1, -0.2, 1, 0.3, 14);
  }

  dust(x: number, y: number, z: number, amt: number): void {
    const r = Math.random;
    this.smoke.spawn(x + (r() - 0.5) * 2, y + 0.4, z + (r() - 0.5) * 2, (r() - 0.5) * 1.5, 0.8 + r(), (r() - 0.5) * 1.5, 1.4 + r() * 0.8, 1.2, 3.5 * amt, 0xb59a74, 0x9a8666, 0.2 * amt, 0, 1.2, -0.15, 1, (r() - 0.5) * 0.5, 6);
  }

  explosion(x: number, y: number, z: number, size: number, kind: ExplosionKind): void {
    const r = Math.random;
    const gy = this.terrain.hf.heightAt(x, z);
    const air = kind === 'air';
    const s = Math.max(0.4, size);
    if (kind === 'emp' || kind === 'cyber') {
      const col = kind === 'emp' ? 0x7ad2ff : 0x66ff9a;
      this.shocks.add(x, gy + 0.5, z, 6 + s * 5, 0.9, col);
      for (let i = 0; i < 18; i++) this.glow.spawn(x + (r() - 0.5) * 3, y + r() * 3, z + (r() - 0.5) * 3, (r() - 0.5) * 14, (r() - 0.5) * 8, (r() - 0.5) * 14, 0.5 + r() * 0.4, 0.7, 0.1, col, col, 1, 0, 1, 0, 2, 0, 30);
      this.glow.spawn(x, y + 1, z, 0, 0, 0, 0.4, 3 + s * 2, 8 + s * 4, col, col, 0.8, 0, 2, 0, 3, 0, 40);
      return;
    }
    // core flash
    this.glow.spawn(x, y + 0.5, z, 0, 0.5, 0, 0.18 + s * 0.04, 2.5 + s * 4, 4 + s * 8, 0xfff0c0, 0xff8a30, 1, 0, 2, 0, 3, 0, 60);
    // fireball
    const nf = Math.floor(4 + s * 4);
    for (let i = 0; i < nf; i++) {
      const a = r() * 6.28, sp = (1 + r() * 3) * (0.6 + s * 0.35);
      this.glow.spawn(x + Math.cos(a) * s * 0.4, y + 0.4 + r() * s * 0.5, z + Math.sin(a) * s * 0.4, Math.cos(a) * sp, 1 + r() * 3 * s * 0.4, Math.sin(a) * sp, 0.45 + r() * 0.5 + s * 0.07, 1.6 + s * 1.3, 2.6 + s * 2.6, 0xffc060, 0xc02808, 0.95, 0, 1.2, -0.5, 0, (r() - 0.5) * 2, 20);
    }
    // smoke column
    const ns = Math.floor(3 + s * 3.2);
    for (let i = 0; i < ns; i++) {
      const a = r() * 6.28, sp = r() * 2.2 * (0.5 + s * 0.3);
      this.smoke.spawn(x + Math.cos(a) * s * 0.5, y + 0.8 + r() * s, z + Math.sin(a) * s * 0.5, Math.cos(a) * sp, 2.5 + r() * 2.5 + s * 0.5, Math.sin(a) * sp, 2.2 + r() * 2.5 + s * 0.6, 1.4 + s * 0.8, 4.5 + s * 3.2, i % 3 === 0 ? 0x2a2826 : 0x4a4744, 0x181716, 0.62, 0, 0.5, -0.45, 1, (r() - 0.5) * 0.6, 6);
    }
    // sparks
    const nsp = Math.floor(5 + s * 6);
    for (let i = 0; i < nsp; i++) {
      const a = r() * 6.28, up = 4 + r() * 9 * (0.6 + s * 0.2), sp = 4 + r() * 12;
      this.glow.spawn(x, y + 0.5, z, Math.cos(a) * sp, up, Math.sin(a) * sp, 0.5 + r() * 0.9, 0.22 + r() * 0.2, 0.05, 0xffe2a0, 0xff5014, 1, 0, 0.3, 24, 2, 0, 40);
    }
    if (!air) {
      // debris chunks + dust ring
      const nd = Math.floor(3 + s * 3);
      for (let i = 0; i < nd; i++) {
        const a = r() * 6.28, sp = 3 + r() * 9;
        this.smoke.spawn(x, y + 0.5, z, Math.cos(a) * sp, 6 + r() * 10, Math.sin(a) * sp, 1.0 + r() * 1.2, 0.5 + r() * 0.6, 0.45, 0x4a443c, 0x2a2824, 0.95, 0, 0.1, 28, 0, (r() - 0.5) * 8, 40);
      }
      const nr = Math.floor(5 + s * 3);
      for (let i = 0; i < nr; i++) {
        const a = (i / nr) * 6.28 + r(), sp = 6 + s * 2.2;
        this.smoke.spawn(x + Math.cos(a) * 1.5, gy + 0.6, z + Math.sin(a) * 1.5, Math.cos(a) * sp, 0.4, Math.sin(a) * sp, 1.2 + r() * 0.8, 1.4 + s * 0.6, 3.6 + s * 1.8, 0xb59a74, 0x8a7a60, 0.34, 0, 2.6, 0, 1, (r() - 0.5), 10);
      }
      if (s >= 1.2) this.shocks.add(x, gy + 0.4, z, 5 + s * 5.5, 0.55 + s * 0.05, 0xffd8a0);
      if (s >= 0.8) this.decals.add(x, gy, z, 3 + s * 3.6, r() * 6.28, 70 + s * 15);
    }
    this.pointLight(x, y, z, 3 + s * 2.4);
    if (s >= 1.5) this.shakeAt(x, z, Math.min(1.8, s * 0.3));
    if (kind === 'nuke') {
      this.flash = 1;
      this.shocks.add(x, gy + 0.5, z, 160, 2.4, 0xffe8c0);
      this.shocks.add(x, gy + 0.5, z, 90, 1.7, 0xffb070);
      for (let i = 0; i < 70; i++) {
        const a = r() * 6.28, rr = r() * 22;
        this.glow.spawn(x + Math.cos(a) * rr, y + r() * 10, z + Math.sin(a) * rr, Math.cos(a) * (3 + r() * 10), 10 + r() * 38, Math.sin(a) * (3 + r() * 10), 1.8 + r() * 2.5, 12 + r() * 14, 28 + r() * 26, 0xffd080, 0xb02808, 0.9, 0, 0.8, -1.5, 0, 0.4, 20);
        this.smoke.spawn(x + Math.cos(a) * rr, y + r() * 12, z + Math.sin(a) * rr, Math.cos(a) * (2 + r() * 6), 14 + r() * 30, Math.sin(a) * (2 + r() * 6), 5 + r() * 5, 10 + r() * 12, 30 + r() * 30, 0x4a4540, 0x201e1c, 0.7, 0, 0.5, -2, 1, 0.2, 5);
      }
      this.shakeAt(x, z, 4);
      this.fireAt(x, gy, z, 25, 3);
      this.decals.add(x, gy, z, 90, 0, 400);
      this.pointLight(x, y + 30, z, 40, 0xffd8a0);
    }
  }

  structureDeath(x: number, y: number, z: number, radius: number): void {
    this.fireAt(x, y, z, 40 + radius * 2, Math.max(1, radius / 10));
    this.smokeAt(x, y + 2, z, 90);
    this.decals.add(x, y, z, radius * 2.2, Math.random() * 6.28, 240);
  }

  vehicleWreck(x: number, y: number, z: number): void {
    this.fireAt(x, y, z, 14, 0.8);
    this.smokeAt(x, y + 1, z, 50);
  }
}
