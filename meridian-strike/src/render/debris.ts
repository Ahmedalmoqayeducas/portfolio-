import * as THREE from 'three';
import { patchFog } from './fog';
import type { Ground } from './vfxCore';

export const DEBRIS = { ROCK: 0, SLAB: 1, BEAM: 2 } as const;

const ST = 30;
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, SX = 8, SY = 9, SZ = 10, RX = 11, RY = 12, RZ = 13, WX = 14, WY = 15, WZ = 16;
const HOT = 17, REST = 18, TRAIL = 19, TACC = 20, BOUNCES = 21, CR = 22, CG = 23, CB = 24, FLOOR = 25;

function jitteredGeometry(base: THREE.BufferGeometry, amt: number, seed: number): THREE.BufferGeometry {
  const g = base.index ? base.toNonIndexed() : base;
  const pos = g.attributes.position as THREE.BufferAttribute;
  let s = seed;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  // jitter shared vertices consistently via a position hash
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let j = map.get(k);
    if (!j) { j = [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt]; map.set(k, j); }
    pos.setXYZ(i, pos.getX(i) + j[0], pos.getY(i) + j[1], pos.getZ(i) + j[2]);
  }
  g.computeVertexNormals();
  return g;
}

class DebrisMesh {
  readonly mesh: THREE.InstancedMesh;
  readonly d: Float32Array;
  n = 0;
  private hot: THREE.InstancedBufferAttribute;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number) {
    this.d = new Float32Array(cap * ST);
    this.hot = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aHot', this.hot);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }
  get hotArray(): Float32Array { return this.hot.array as Float32Array; }
  get hotAttr(): THREE.InstancedBufferAttribute { return this.hot; }
}

/** Ballistic debris chunks: instanced lit meshes with spin, gravity, ground bounce, glowing-hot cool-down and shrink-away. */
export class DebrisField {
  readonly group = new THREE.Group();
  private readonly parts: DebrisMesh[] = [];
  /** called for chunks that leave a trail: (x, y, z, heat 0..1) */
  onTrail: ((x: number, y: number, z: number, heat: number, size: number) => void) | null = null;
  gravity = 24;
  private tmpN = new THREE.Vector3();

  constructor(private readonly ground: Ground, caps: [number, number, number] = [1400, 500, 400]) {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.18, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      patchFog(sh);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aHot; varying float vHot;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHot = aHot;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHot;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.34, 0.05) * vHot * vHot * 1.5;');
    };
    const rock = jitteredGeometry(new THREE.IcosahedronGeometry(0.5, 0), 0.28, 11);
    const slab = jitteredGeometry(new THREE.BoxGeometry(1, 0.14, 0.72), 0.09, 23);
    const beam = jitteredGeometry(new THREE.BoxGeometry(0.16, 0.2, 1.7), 0.05, 37);
    this.parts.push(new DebrisMesh(rock, mat, caps[0]), new DebrisMesh(slab, mat, caps[1]), new DebrisMesh(beam, mat, caps[2]));
    for (const p of this.parts) { p.mesh.renderOrder = 4; this.group.add(p.mesh); }
  }

  get count(): number { let c = 0; for (const p of this.parts) c += p.n; return c; }

  setPassVisibility(): void { /* debris are solid geometry: they stay in override passes */ }

  clear(): void { for (const p of this.parts) { p.n = 0; p.mesh.count = 0; } }

  spawn(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: number, hot: number, trailRate: number): void {
    const p = this.parts[kind];
    if (p.n >= p.cap) return;
    const d = p.d, o = p.n++ * ST, r = Math.random;
    d[o + PX] = x; d[o + PY] = y; d[o + PZ] = z; d[o + VX] = vx; d[o + VY] = vy; d[o + VZ] = vz;
    d[o + AGE] = 0; d[o + LIFE] = life;
    if (kind === DEBRIS.ROCK) { d[o + SX] = size * (0.7 + r() * 0.7); d[o + SY] = size * (0.5 + r() * 0.6); d[o + SZ] = size * (0.7 + r() * 0.7); }
    else if (kind === DEBRIS.SLAB) { const s = size * (0.8 + r() * 0.7); d[o + SX] = s; d[o + SY] = s * (0.8 + r() * 1.2); d[o + SZ] = s * (0.7 + r() * 0.6); }
    else { const s = size * (0.7 + r() * 0.8); d[o + SX] = s; d[o + SY] = s; d[o + SZ] = s * (0.8 + r() * 0.9); }
    d[o + RX] = r() * 6.28; d[o + RY] = r() * 6.28; d[o + RZ] = r() * 6.28;
    const sp = 6 + 10 / (0.5 + size);
    d[o + WX] = (r() - 0.5) * sp; d[o + WY] = (r() - 0.5) * sp; d[o + WZ] = (r() - 0.5) * sp;
    d[o + HOT] = hot; d[o + REST] = 0; d[o + TRAIL] = trailRate; d[o + TACC] = r(); d[o + BOUNCES] = 0;
    const v = 0.78 + r() * 0.44;
    d[o + CR] = (((color >> 16) & 255) / 255) * v; d[o + CG] = (((color >> 8) & 255) / 255) * v; d[o + CB] = ((color & 255) / 255) * v;
    d[o + FLOOR] = 0;
  }

  update(dt: number): void {
    const g = this.gravity, ground = this.ground, nrm = this.tmpN;
    for (let kind = 0; kind < 3; kind++) {
      const part = this.parts[kind], d = part.d;
      const M = part.mesh.instanceMatrix.array as Float32Array, C = (part.mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array, H = part.hotArray;
      let i = 0;
      while (i < part.n) {
        const o = i * ST;
        const age = (d[o + AGE] += dt), life = d[o + LIFE];
        if (age >= life) {
          const l = part.n - 1;
          if (i !== l) {
            const lo = l * ST;
            for (let k = 0; k < ST; k++) d[o + k] = d[lo + k];
          }
          part.n--;
          continue;
        }
        if (d[o + REST] < 0.5) {
          let vy = d[o + VY] - g * dt;
          const drag = Math.exp(-0.08 * dt);
          const vx = d[o + VX] * drag, vz = d[o + VZ] * drag;
          const px = (d[o + PX] += vx * dt), pz = (d[o + PZ] += vz * dt);
          let py = (d[o + PY] += vy * dt);
          d[o + VX] = vx; d[o + VZ] = vz;
          d[o + RX] += d[o + WX] * dt; d[o + RY] += d[o + WY] * dt; d[o + RZ] += d[o + WZ] * dt;
          const sz = Math.max(d[o + SX], d[o + SY], d[o + SZ]);
          const gy = Math.max(ground.heightAt(px, pz), ground.waterY) + sz * 0.22;
          if (py < gy && vy < 0) {
            // slope-aware bounce
            const dx = ground.heightAt(px + 1, pz) - ground.heightAt(px - 1, pz), dz = ground.heightAt(px, pz + 1) - ground.heightAt(px, pz - 1);
            nrm.set(-dx * 0.5, 1, -dz * 0.5).normalize();
            const vn = vx * nrm.x + vy * nrm.y + vz * nrm.z;
            const e = 0.38 * (d[o + BOUNCES] === 0 ? 1 : 0.7);
            let nvx = vx - (1 + e) * vn * nrm.x, nvy = vy - (1 + e) * vn * nrm.y, nvz = vz - (1 + e) * vn * nrm.z;
            nvx *= 0.72; nvz *= 0.72;
            py = d[o + PY] = gy;
            d[o + BOUNCES]++;
            d[o + WX] *= 0.5; d[o + WY] *= 0.5; d[o + WZ] *= 0.5;
            if (nvx * nvx + nvy * nvy + nvz * nvz < 6 || d[o + BOUNCES] > 4) {
              d[o + REST] = 1; d[o + VX] = d[o + VY] = d[o + VZ] = 0;
              d[o + FLOOR] = gy - sz * 0.05;
              d[o + PY] = d[o + FLOOR];
            } else { d[o + VX] = nvx; d[o + VZ] = nvz; vy = nvy; }
          }
          d[o + VY] = vy;
          if (d[o + TRAIL] > 0 && this.onTrail) {
            d[o + TACC] += dt * d[o + TRAIL];
            if (d[o + TACC] >= 1) { d[o + TACC] -= 1; this.onTrail(px, d[o + PY], pz, d[o + HOT], sz); }
          }
        }
        const rest = d[o + REST] > 0.5;
        const left = life - age;
        const k = left < 1.4 ? left / 1.4 : 1;
        const hot = d[o + HOT] * Math.exp(-age * 0.55);
        H[i] = hot;
        // compose matrix (XYZ euler, non-uniform scale, shrink at end of life)
        const rx = d[o + RX], ry = d[o + RY], rz = d[o + RZ];
        const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz2 = Math.sin(rz);
        const a = i * 16;
        const sX = d[o + SX] * k, sY = d[o + SY] * k, sZ = d[o + SZ] * k;
        M[a] = cy * cz * sX; M[a + 1] = (cx * sz2 + sx * sy * cz) * sX; M[a + 2] = (sx * sz2 - cx * sy * cz) * sX; M[a + 3] = 0;
        M[a + 4] = -cy * sz2 * sY; M[a + 5] = (cx * cz - sx * sy * sz2) * sY; M[a + 6] = (sx * cz + cx * sy * sz2) * sY; M[a + 7] = 0;
        M[a + 8] = sy * sZ; M[a + 9] = -sx * cy * sZ; M[a + 10] = cx * cy * sZ; M[a + 11] = 0;
        M[a + 12] = d[o + PX]; M[a + 13] = d[o + PY] - (rest ? 0 : 0); M[a + 14] = d[o + PZ]; M[a + 15] = 1;
        C[i * 3] = d[o + CR]; C[i * 3 + 1] = d[o + CG]; C[i * 3 + 2] = d[o + CB];
        i++;
      }
      part.mesh.count = part.n;
      part.mesh.instanceMatrix.needsUpdate = true;
      (part.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      part.hotAttr.needsUpdate = true;
    }
  }
}
