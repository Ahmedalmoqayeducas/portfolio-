import * as THREE from 'three';
import { GLSL_COMMON, type VfxUniforms } from './vfxCore';

// ------------------------------------------------------------------------------ tracers / streaks
export class StreakLayer {
  readonly mesh: THREE.Mesh;
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private wid: THREE.InstancedBufferAttribute;
  private life: Float32Array;
  private maxLife: Float32Array;
  private geo = new THREE.InstancedBufferGeometry();
  n = 0;
  private drawn = 0;

  constructor(readonly cap: number) {
    this.life = new Float32Array(cap); this.maxLife = new Float32Array(cap);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.wid = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aA', this.a); this.geo.setAttribute('aB', this.b); this.geo.setAttribute('aCol', this.col); this.geo.setAttribute('aW', this.wid);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 aA; attribute vec3 aB; attribute vec4 aCol; attribute float aW;
        varying vec2 vUv; varying vec4 vCol;
        void main(){
          vec4 a = modelViewMatrix * vec4(aA, 1.0);
          vec4 b = modelViewMatrix * vec4(aB, 1.0);
          vec2 d2 = normalize(b.xy - a.xy + vec2(1e-5));
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
          float ax = abs(vUv.x - 0.5) * 2.0;
          float core = exp(-ax * ax * 11.0);
          float glow = exp(-ax * ax * 2.6) * 0.38;
          float along = 0.2 + 0.8 * pow(vUv.y, 1.6);
          vec3 col = mix(vCol.rgb, vec3(1.0, 0.95, 0.85), core * 0.55) * (core * 2.4 + glow) * along * vCol.a;
          gl_FragColor = vec4(col, 1.0);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.name = 'vfx-streaks';
  }

  setPassVisibility(override: boolean): void { this.geo.instanceCount = override ? 0 : this.drawn; }

  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, width: number, life: number, intensity = 1.6): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const A = this.a.array as Float32Array, B = this.b.array as Float32Array, C = this.col.array as Float32Array;
    A[i * 3] = ax; A[i * 3 + 1] = ay; A[i * 3 + 2] = az; B[i * 3] = bx; B[i * 3 + 1] = by; B[i * 3 + 2] = bz;
    C[i * 4] = (((color >> 16) & 255) / 255) * intensity; C[i * 4 + 1] = (((color >> 8) & 255) / 255) * intensity; C[i * 4 + 2] = ((color & 255) / 255) * intensity; C[i * 4 + 3] = 1;
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
    this.drawn = this.n;
    this.geo.instanceCount = this.n;
    if (this.n > 0) {
      this.a.clearUpdateRanges(); this.a.addUpdateRange(0, this.n * 3); this.a.needsUpdate = true;
      this.b.clearUpdateRanges(); this.b.addUpdateRange(0, this.n * 3); this.b.needsUpdate = true;
      this.col.clearUpdateRanges(); this.col.addUpdateRange(0, this.n * 4); this.col.needsUpdate = true;
      this.wid.clearUpdateRanges(); this.wid.addUpdateRange(0, this.n); this.wid.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------------------ decals (drape over terrain via the height texture)
export const DECAL = { SCORCH: 0, CRATER: 1, BLOT: 2, SPATTER: 3 } as const;

export class DecalLayer {
  readonly mesh: THREE.InstancedMesh;
  private ages: Float32Array;
  private lives: Float32Array;
  private strengths: Float32Array;
  private alpha: THREE.InstancedBufferAttribute;
  private kind: THREE.InstancedBufferAttribute;
  private next = 0;
  private m = new THREE.Matrix4();
  private count = 0;
  private qy = new THREE.Quaternion();
  private ax = new THREE.Vector3(0, 1, 0);
  private sc = new THREE.Vector3();
  private ps = new THREE.Vector3();

  constructor(readonly cap: number, uniforms: VfxUniforms, decalTex: THREE.Texture) {
    const geo = new THREE.PlaneGeometry(1, 1, 14, 14);
    geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.kind = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    geo.setAttribute('aKind', this.kind);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uDecal: { value: decalTex } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; attribute float aKind;
        uniform sampler2D uHeightTex; uniform vec4 uWorld;
        varying vec2 vUv; varying float vA; varying float vKind; varying vec2 vXZ;
        void main(){
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          float gh = texture2D(uHeightTex, (wp.xz + uWorld.y) * uWorld.z).r;
          wp.y = gh + 0.09;
          vUv = uv; vA = aAlpha; vKind = aKind; vXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uDecal; uniform vec3 uSunCol; uniform vec3 uSkyCol;
        ${GLSL_COMMON}
        varying vec2 vUv; varying float vA; varying float vKind; varying vec2 vXZ;
        void main(){
          vec2 cuv = (vec2(mod(vKind, 2.0), floor(vKind / 2.0)) + vUv) * 0.5;
          vec4 t = texture2D(uDecal, cuv);
          float dark = t.r, lite = t.g;
          float a = clamp(dark * 0.95 + lite * 0.55, 0.0, 1.0) * vA * fogVis(vXZ);
          if (a < 0.01) discard;
          float lm = clamp(dot(uSunCol, vec3(0.2, 0.55, 0.25)) * 0.62 + dot(uSkyCol, vec3(0.3, 0.5, 0.2)) * 0.5, 0.05, 1.1);
          vec3 col = mix(vec3(0.040, 0.032, 0.026), vec3(0.50, 0.40, 0.29), clamp(lite / (dark + lite + 0.001), 0.0, 1.0)) * lm;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'vfx-decals';
    this.ages = new Float32Array(cap);
    this.lives = new Float32Array(cap);
    this.strengths = new Float32Array(cap);
    this.mesh.count = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, zero);
  }

  add(x: number, y: number, z: number, size: number, rot: number, life: number, kind: number = DECAL.SCORCH, strength = 1): void {
    const i = this.next++ % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
    this.qy.setFromAxisAngle(this.ax, rot);
    this.m.compose(this.ps.set(x, y, z), this.qy, this.sc.set(size, 1, size));
    this.mesh.setMatrixAt(i, this.m);
    this.ages[i] = 0; this.lives[i] = life;
    (this.alpha.array as Float32Array)[i] = strength;
    (this.kind.array as Float32Array)[i] = kind;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true; this.kind.needsUpdate = true;
    this.strengths[i] = strength;
  }

  update(dt: number): void {
    const a = this.alpha.array as Float32Array;
    let dirty = false;
    for (let i = 0; i < this.count; i++) {
      if (this.lives[i] <= 0) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.lives[i];
      const v = (t < 0.8 ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2)) * this.strengths[i];
      if (a[i] !== v) { a[i] = v; dirty = true; }
      if (t >= 1) this.lives[i] = 0;
    }
    if (dirty) this.alpha.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------ shockwave rings (ground plane)
export class ShockLayer {
  readonly mesh: THREE.InstancedMesh;
  private ages: Float32Array;
  private maxAge: Float32Array;
  private radius: Float32Array;
  private pos: Float32Array;
  private alpha: THREE.InstancedBufferAttribute;
  private tint: THREE.InstancedBufferAttribute;
  private thin: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private next = 0;
  constructor(readonly cap: number, uniforms: VfxUniforms) {
    const geo = new THREE.RingGeometry(0.80, 1, 160, 3);
    geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.thin = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    geo.setAttribute('aTint', this.tint);
    geo.setAttribute('aThin', this.thin);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uHeightTex: uniforms.uHeightTex, uWorld: uniforms.uWorld },
      vertexShader: /* glsl */ `attribute float aAlpha; attribute vec3 aTint; attribute float aThin; varying float vA; varying vec3 vT; varying float vR; varying float vTh;
        uniform sampler2D uHeightTex; uniform vec4 uWorld;
        void main(){
          vA = aAlpha; vT = aTint; vTh = aThin; vR = (length(position.xz) - 0.80) / 0.20;
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          float gh = texture2D(uHeightTex, (wp.xz + uWorld.y) * uWorld.z).r;
          wp.y = max(gh, uWorld.w) + 0.45;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vT; varying float vR; varying float vTh;
        void main(){ float p = pow(sin(clamp(vR, 0.0, 1.0) * 3.14159), mix(1.6, 6.0, vTh)); gl_FragColor = vec4(vT * p * vA * mix(1.5, 1.0, vTh), 1.0); }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'vfx-shocks';
    this.ages = new Float32Array(cap).fill(99); this.maxAge = new Float32Array(cap).fill(1); this.radius = new Float32Array(cap); this.pos = new Float32Array(cap * 3);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, z);
  }

  add(x: number, y: number, z: number, r: number, life: number, color: number, thin = 0): void {
    const i = this.next++ % this.cap;
    this.ages[i] = 0; this.maxAge[i] = life; this.radius[i] = r;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    (this.thin.array as Float32Array)[i] = thin;
    const t = this.tint.array as Float32Array;
    t[i * 3] = ((color >> 16) & 255) / 255; t[i * 3 + 1] = ((color >> 8) & 255) / 255; t[i * 3 + 2] = (color & 255) / 255;
  }

  update(dt: number): void {
    const a = this.alpha.array as Float32Array;
    let dirty = false;
    for (let i = 0; i < this.cap; i++) {
      if (this.ages[i] > this.maxAge[i]) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.maxAge[i];
      dirty = true;
      if (t >= 1) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); a[i] = 0; continue; }
      const r = this.radius[i] * (0.12 + 0.88 * (1 - Math.pow(1 - t, 3)));
      this.m.makeScale(r, 1, r);
      this.m.elements[12] = this.pos[i * 3]; this.m.elements[13] = this.pos[i * 3 + 1]; this.m.elements[14] = this.pos[i * 3 + 2];
      this.mesh.setMatrixAt(i, this.m);
      a[i] = (1 - t) * 0.42;
    }
    if (dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true; this.tint.needsUpdate = true; this.thin.needsUpdate = true; }
  }
}

// ------------------------------------------------------------------------------ blast domes (fresnel shells)
export class DomeLayer {
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
    const geo = new THREE.SphereGeometry(1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    geo.setAttribute('aTint', this.tint);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `attribute float aAlpha; attribute vec3 aTint; varying float vA; varying vec3 vT; varying vec3 vN; varying vec3 vV;
        void main(){
          vA = aAlpha; vT = aTint;
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * position);
          vec4 w = modelMatrix * wp;
          vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `varying float vA; varying vec3 vT; varying vec3 vN; varying vec3 vV;
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float horizon = pow(1.0 - clamp(vN.y, 0.0, 1.0), 3.0);
          gl_FragColor = vec4(vT * vA * (f * 0.8 + horizon * 0.6), 1.0);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'vfx-domes';
    this.ages = new Float32Array(cap).fill(99); this.maxAge = new Float32Array(cap).fill(1); this.radius = new Float32Array(cap); this.pos = new Float32Array(cap * 3);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) this.mesh.setMatrixAt(i, z);
  }
  add(x: number, y: number, z: number, r: number, life: number, color: number, intensity = 1): void {
    const i = this.next++ % this.cap;
    this.ages[i] = 0; this.maxAge[i] = life; this.radius[i] = r;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    const t = this.tint.array as Float32Array;
    t[i * 3] = (((color >> 16) & 255) / 255) * intensity; t[i * 3 + 1] = (((color >> 8) & 255) / 255) * intensity; t[i * 3 + 2] = ((color & 255) / 255) * intensity;
  }
  update(dt: number): void {
    const a = this.alpha.array as Float32Array;
    let dirty = false;
    for (let i = 0; i < this.cap; i++) {
      if (this.ages[i] > this.maxAge[i]) continue;
      this.ages[i] += dt;
      const t = this.ages[i] / this.maxAge[i];
      dirty = true;
      if (t >= 1) { this.m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, this.m); a[i] = 0; continue; }
      const r = this.radius[i] * (0.05 + 0.95 * (1 - Math.pow(1 - t, 2.6)));
      this.m.makeScale(r, r * 0.78, r);
      this.m.elements[12] = this.pos[i * 3]; this.m.elements[13] = this.pos[i * 3 + 1]; this.m.elements[14] = this.pos[i * 3 + 2];
      this.mesh.setMatrixAt(i, this.m);
      a[i] = Math.pow(1 - t, 1.6) * 0.55;
    }
    if (dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true; this.tint.needsUpdate = true; }
  }
}
