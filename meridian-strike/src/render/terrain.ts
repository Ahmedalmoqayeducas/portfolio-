import * as THREE from 'three';
import { Noise2D } from '../procgen/noise';
import type { BuiltMap, Biome } from '../maps/maps';
import { patchFog } from './fog';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Pal { a: THREE.Color; b: THREE.Color; rock: THREE.Color; rock2: THREE.Color; scrub: THREE.Color; road: THREE.Color; wet: THREE.Color }
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

const PALETTES: Record<Biome, Pal> = {
  desert: { a: C(0.62, 0.4, 0.22), b: C(0.74, 0.52, 0.3), rock: C(0.36, 0.17, 0.1), rock2: C(0.2, 0.12, 0.09), scrub: C(0.34, 0.33, 0.15), road: C(0.26, 0.2, 0.15), wet: C(0.3, 0.2, 0.12) },
  urban: { a: C(0.3, 0.3, 0.17), b: C(0.4, 0.36, 0.2), rock: C(0.3, 0.29, 0.27), rock2: C(0.18, 0.18, 0.18), scrub: C(0.2, 0.3, 0.12), road: C(0.1, 0.1, 0.11), wet: C(0.55, 0.47, 0.32) },
  oasis: { a: C(0.7, 0.5, 0.28), b: C(0.8, 0.62, 0.38), rock: C(0.4, 0.26, 0.17), rock2: C(0.24, 0.17, 0.12), scrub: C(0.17, 0.32, 0.08), road: C(0.3, 0.22, 0.15), wet: C(0.28, 0.2, 0.12) },
  highland: { a: C(0.82, 0.86, 0.9), b: C(0.9, 0.93, 0.97), rock: C(0.32, 0.32, 0.34), rock2: C(0.2, 0.2, 0.22), scrub: C(0.16, 0.22, 0.14), road: C(0.35, 0.34, 0.33), wet: C(0.4, 0.4, 0.42) },
  mixed: { a: C(0.55, 0.42, 0.25), b: C(0.68, 0.54, 0.32), rock: C(0.34, 0.26, 0.2), rock2: C(0.2, 0.16, 0.13), scrub: C(0.2, 0.32, 0.1), road: C(0.12, 0.12, 0.13), wet: C(0.3, 0.22, 0.14) },
};

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly water: THREE.Mesh | null;
  readonly hf;
  readonly size: number;
  readonly built: BuiltMap;
  private waterNormal: THREE.Texture | null = null;

  constructor(built: BuiltMap) {
    this.built = built;
    this.hf = built.hf;
    this.size = built.hf.size;
    this.mesh = this.buildMesh();
    this.water = this.buildWater();
  }

  heightAt(x: number, z: number): number { return this.hf.heightAt(x, z); }

  private buildMesh(): THREE.Mesh {
    const { def, hf, roadMask } = this.built;
    const N = hf.res;
    const geo = new THREE.PlaneGeometry(hf.size, hf.size, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setY(k, hf.data[k]);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const pal = PALETTES[def.biome];
    const n = new Noise2D(def.seed + 9);
    const tmp = new THREE.Color();
    const wl = def.waterLevel ?? -1e9;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const slope = 1 - nrm.getY(k);
      const mottle = n.fbm(x * 0.012 + 40, z * 0.012, 4) * 0.5 + 0.5;
      tmp.copy(pal.a).lerp(pal.b, mottle);
      const r = Math.hypot(x, z);
      const green = this.greenness(def.biome, x, z, y, r, n);
      if (green > 0) tmp.lerp(pal.scrub, Math.min(1, green) * (1 - smooth(0.05, 0.22, slope)));
      const strata = Math.sin(y * 0.85 + n.noise(x * 0.01, z * 0.01) * 3) * 0.5 + 0.5;
      const rk = pal.rock.clone().lerp(pal.rock2, strata * 0.6);
      if (def.biome === 'highland') {
        // snow on flats, rock on cliffs, gravel in valley floors
        const snowy = smooth(0.04, 0.5, 1 - slope * 2.2) * smooth(3, 22, y + n.fbm(x * 0.03, z * 0.03, 2) * 14);
        tmp.copy(pal.rock2).lerp(pal.a, 0.4 + 0.6 * snowy).lerp(pal.b, mottle * snowy);
        tmp.lerp(rk, smooth(0.18, 0.5, slope));
      } else {
        tmp.lerp(rk, smooth(0.07, 0.3, slope));
      }
      // shore
      if (def.waterLevel !== null) {
        const sd = y - wl;
        tmp.lerp(pal.wet, (1 - smooth(0.2, 2.8, sd)) * 0.85);
        if (sd < 0) tmp.multiplyScalar(0.55);
      }
      const road = roadMask[k] / 255;
      if (road > 0.02) tmp.lerp(pal.road, Math.min(1, road * 1.15) * 0.92);
      tmp.multiplyScalar(0.9 + 0.2 * mottle);
      colors[k * 3] = tmp.r; colors[k * 3 + 1] = tmp.g; colors[k * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const detail = makeDetailTextures(512, 7, def.biome);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: detail.color, normalMap: detail.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, metalness: 0,
    });
    mat.onBeforeCompile = (sh) => patchFog(sh);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  private greenness(biome: Biome, x: number, z: number, y: number, r: number, n: Noise2D): number {
    switch (biome) {
      case 'urban': return 0.8 + 0.2 * n.fbm(x * 0.03, z * 0.03, 2);
      case 'oasis': return 1 - smooth(120, 300, r) + (n.fbm(x * 0.02, z * 0.02, 3) > 0.35 ? 0.15 : 0);
      case 'highland': return smooth(-0.1, 0.3, n.fbm(x * 0.01, z * 0.01, 3)) * (1 - smooth(18, 40, y)) * 0.8;
      case 'mixed': {
        const f = smooth(0.05, 0.4, n.fbm(x * 0.005 + 7, z * 0.005, 3)) * smooth(300, 420, r);
        return f * 1.1;
      }
      default: return smooth(0.55, 0.8, n.fbm(x * 0.03 - 9, z * 0.03 + 3, 3) * 0.5 + 0.5) * 0.6;
    }
  }

  private buildWater(): THREE.Mesh | null {
    const wl = this.built.def.waterLevel;
    if (wl === null || wl === undefined) return null;
    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const nt = makeWaterNormal();
    nt.repeat.set(this.size / 40, this.size / 40);
    this.waterNormal = nt;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d5a70, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.8, normalMap: nt, normalScale: new THREE.Vector2(0.55, 0.55),
    });
    mat.onBeforeCompile = (sh) => patchFog(sh);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = wl;
    m.receiveShadow = false;
    m.renderOrder = 2;
    return m;
  }

  update(time: number): void {
    if (this.waterNormal) {
      this.waterNormal.offset.set(time * 0.012, time * 0.008);
    }
  }
}

function makeWaterNormal(): THREE.DataTexture {
  const S = 256;
  const n = new Noise2D(31);
  const h = new Float32Array(S * S);
  const wrap = (x: number, y: number, s: number) => n.fbm(x / s, y / s, 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const f = (xx: number, yy: number) => wrap(xx, yy, 18) + 0.4 * wrap(xx * 2.3, yy * 2.3, 9);
    h[y * S + x] = f(x, y) * (1 - u) * (1 - v) + f(x - S, y) * u * (1 - v) + f(x, y - S) * (1 - u) * v + f(x - S, y - S) * u * v;
  }
  const d = new Uint8Array(new ArrayBuffer(S * S * 4));
  const at = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 7, dy = (at(x, y + 1) - at(x, y - 1)) * 7;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * S + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

function makeDetailTextures(size: number, seed: number, biome: Biome): { color: THREE.Texture; normal: THREE.Texture } {
  const n = new Noise2D(seed);
  const hgt = new Float32Array(size * size);
  const s = size;
  const fine = biome === 'highland' ? 10 : 20;
  const sample = (x: number, y: number) => n.fbm(x / fine, y / fine, 5) * 0.7 + n.fbm(x / 5, y / 5, 3) * 0.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / s, v = y / s;
      hgt[y * size + x] = sample(x, y) * (1 - u) * (1 - v) + sample(x - s, y) * u * (1 - v) + sample(x, y - s) * (1 - u) * v + sample(x - s, y - s) * u * v;
    }
  }
  const cData = new Uint8Array(new ArrayBuffer(size * size * 4));
  const nData = new Uint8Array(new ArrayBuffer(size * size * 4));
  const at = (x: number, y: number) => hgt[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const h = at(x, y);
      const g = Math.max(0, Math.min(255, 205 + h * 90));
      cData[i] = cData[i + 1] = cData[i + 2] = g; cData[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 6;
      const l = Math.hypot(dx, dy, 1);
      nData[i] = (-dx / l * 0.5 + 0.5) * 255; nData[i + 1] = (dy / l * 0.5 + 0.5) * 255; nData[i + 2] = (1 / l * 0.5 + 0.5) * 255; nData[i + 3] = 255;
    }
  }
  const mk = (data: Uint8Array<ArrayBuffer>, srgb: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(110, 110);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 16;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { color: mk(cData, true), normal: mk(nData, false) };
}
