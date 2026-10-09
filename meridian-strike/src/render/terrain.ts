import * as THREE from 'three';
import { Noise2D } from '../procgen/noise';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface TerrainOptions {
  /** World size in metres (square). */
  size: number;
  /** Vertices per side. */
  resolution: number;
  seed: number;
}

/**
 * Heightfield terrain. `heightAt` is renderer-independent so the sim can reuse the same data later.
 */
export class Terrain {
  readonly size: number;
  readonly resolution: number;
  readonly heights: Float32Array;
  readonly mesh: THREE.Mesh;
  private readonly noise: Noise2D;

  constructor(opts: TerrainOptions) {
    this.size = opts.size;
    this.resolution = opts.resolution;
    this.noise = new Noise2D(opts.seed);
    this.heights = new Float32Array(this.resolution * this.resolution);
    this.generate();
    this.mesh = this.buildMesh();
  }

  /** Procedural "red mesa" preview terrain: terraced plateaus, a flat central basin, mountain rim. */
  private rawHeight(x: number, z: number): number {
    const n = this.noise;
    const f = 1 / 260;
    const half = this.size / 2;
    const base = n.fbm(x * f, z * f, 5) * 26;
    const m = n.ridged(x * f * 0.7 + 10, z * f * 0.7 - 4, 4);
    const t = m * 5;
    const fl = Math.floor(t);
    const terr = (fl + smooth(0.72, 1.0, t - fl)) / 5;
    let h = base + terr * 62 - 20;
    const r = Math.hypot(x, z);
    const basin = 1 - smooth(70, 190, r);
    h = h * (1 - basin) + (1.5 + n.fbm(x * 0.02, z * 0.02, 3) * 1.2) * basin;
    const edge = smooth(half * 0.72, half, Math.max(Math.abs(x), Math.abs(z)));
    h += edge * edge * 140;
    return h;
  }

  private generate(): void {
    const N = this.resolution;
    const step = this.size / (N - 1);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.heights[j * N + i] = this.rawHeight(i * step - this.size / 2, j * step - this.size / 2);
      }
    }
  }

  /** Bilinear height in world coordinates (x, z). */
  heightAt(x: number, z: number): number {
    const N = this.resolution;
    const step = this.size / (N - 1);
    const gx = Math.min(N - 1.001, Math.max(0, (x + this.size / 2) / step));
    const gz = Math.min(N - 1.001, Math.max(0, (z + this.size / 2) / step));
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = this.heights;
    const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  slopeAt(x: number, z: number): number {
    const e = 2;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  private buildMesh(): THREE.Mesh {
    const N = this.resolution;
    const geo = new THREE.PlaneGeometry(this.size, this.size, N - 1, N - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setY(k, this.heights[k]);
    geo.computeVertexNormals();

    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0.62, 0.4, 0.22);
    const dust = new THREE.Color(0.74, 0.52, 0.3);
    const rock = new THREE.Color(0.36, 0.17, 0.1);
    const darkRock = new THREE.Color(0.2, 0.12, 0.09);
    const scrub = new THREE.Color(0.34, 0.33, 0.15);
    const tmp = new THREE.Color();
    const n = this.noise;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const slope = 1 - nrm.getY(k);
      const mottle = n.fbm(x * 0.012 + 40, z * 0.012, 4) * 0.5 + 0.5;
      tmp.copy(sand).lerp(dust, mottle);
      tmp.lerp(scrub, smooth(0.55, 0.8, n.fbm(x * 0.03 - 9, z * 0.03 + 3, 3) * 0.5 + 0.5) * (1 - smooth(0.05, 0.2, slope)) * 0.7);
      const strata = Math.sin(y * 0.85 + n.noise(x * 0.01, z * 0.01) * 3) * 0.5 + 0.5;
      const rockCol = tmp.clone().copy(rock).lerp(darkRock, strata * 0.6);
      tmp.lerp(rockCol, smooth(0.07, 0.3, slope));
      tmp.multiplyScalar(0.88 + 0.24 * mottle);
      colors[k * 3] = tmp.r; colors[k * 3 + 1] = tmp.g; colors[k * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const detail = makeDetailTextures(512, 7);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detail.color,
      normalMap: detail.normal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.96,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}

/** Tileable procedural grit: albedo multiplier + matching normal map. */
function makeDetailTextures(size: number, seed: number): { color: THREE.Texture; normal: THREE.Texture } {
  const n = new Noise2D(seed);
  const hgt = new Float32Array(size * size);
  const s = size;
  const sample = (x: number, y: number) => n.fbm(x / 20, y / 20, 5) * 0.7 + n.fbm(x / 5, y / 5, 3) * 0.3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // cross-fade four shifted samples to make the noise wrap seamlessly
      const u = x / s, v = y / s;
      hgt[y * size + x] =
        sample(x, y) * (1 - u) * (1 - v) + sample(x - s, y) * u * (1 - v) +
        sample(x, y - s) * (1 - u) * v + sample(x - s, y - s) * u * v;
    }
  }
  const cData = new Uint8ClampedArray(size * size * 4);
  const nData = new Uint8ClampedArray(size * size * 4);
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
      nData[i] = (-dx / l * 0.5 + 0.5) * 255;
      nData[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      nData[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      nData[i + 3] = 255;
    }
  }
  const mk = (data: Uint8ClampedArray, srgb: boolean) => {
    const t = new THREE.DataTexture(new Uint8Array(data.buffer as ArrayBuffer), size, size, THREE.RGBAFormat);
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
