import * as THREE from 'three';
import type { BuiltMap } from '../maps/maps';
import type { Preset } from './post';
import { buildLayerSet, LayerSet } from './terrainTex';
import { buildTerrainMaps, TerrainMaps } from './terrainData';
import { makeTerrainMaterial } from './terrainShader';
import { buildRingGeometry } from './ring';
import { makeWater } from './water';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Heightfield terrain: tiled mesh (per-tile frustum / shadow culling) with a procedural PBR splat material,
 * a distant mountain ring that fades into the haze, and the water surface.
 *
 * `mesh` is the first tile (kept for API compatibility, all tiles share its material); add `group` to the scene.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly group = new THREE.Group();
  readonly water: THREE.Mesh | null;
  readonly hf;
  readonly size: number;
  readonly built: BuiltMap;
  readonly maps: TerrainMaps;
  readonly layers: LayerSet;
  readonly material: THREE.MeshStandardMaterial;
  readonly ring: THREE.Mesh;
  private readonly tiles: THREE.Mesh[] = [];

  constructor(built: BuiltMap, renderer: THREE.WebGLRenderer, quality: Preset = 'ultra') {
    this.built = built;
    this.hf = built.hf;
    this.size = built.hf.size;
    const { def, hf } = built;

    const texSize = quality === 'ultra' || quality === 'high' ? 1024 : 512;
    this.layers = buildLayerSet(renderer, def.biome, texSize);
    this.maps = buildTerrainMaps(renderer, built, quality);
    this.material = makeTerrainMaterial({
      layers: this.layers, maps: this.maps, macro: this.maps.macro, biome: def.biome, size: hf.size, waterLevel: def.waterLevel ?? null,
    });

    // ---- mesh: shared vertex buffers, one index buffer per tile
    const N = hf.res;
    const half = hf.size / 2;
    const step = hf.step;
    const rh = this.renderHeights();
    const pos = new Float32Array(N * N * 3);
    const nrm = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        pos[k * 3] = i * step - half; pos[k * 3 + 1] = rh[k]; pos[k * 3 + 2] = j * step - half;
        const il = Math.max(0, i - 1), ir = Math.min(N - 1, i + 1), jd = Math.max(0, j - 1), ju = Math.min(N - 1, j + 1);
        const dx = (rh[j * N + ir] - rh[j * N + il]) / ((ir - il) * step);
        const dz = (rh[ju * N + i] - rh[jd * N + i]) / ((ju - jd) * step);
        const l = Math.hypot(dx, 1, dz);
        nrm[k * 3] = -dx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -dz / l;
      }
    }
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const nrmAttr = new THREE.BufferAttribute(nrm, 3);
    const per = 64;
    const nt = Math.ceil((N - 1) / per);
    const raw = hf.data;
    for (let tz = 0; tz < nt; tz++) {
      for (let tx = 0; tx < nt; tx++) {
        const i0 = tx * per, i1 = Math.min(N - 1, i0 + per), j0 = tz * per, j1 = Math.min(N - 1, j0 + per);
        const w = i1 - i0, h = j1 - j0;
        const idx = new Uint32Array(w * h * 6);
        let o = 0;
        let ymin = 1e9, ymax = -1e9;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const y = rh[j * N + i]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; }
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
            if (Math.abs(raw[a] - raw[d]) < Math.abs(raw[b] - raw[c])) { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; }
            else { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', posAttr);
        geo.setAttribute('normal', nrmAttr);
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        const box = new THREE.Box3(new THREE.Vector3(i0 * step - half, ymin, j0 * step - half), new THREE.Vector3(i1 * step - half, ymax, j1 * step - half));
        geo.boundingBox = box;
        geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        const m = new THREE.Mesh(geo, this.material);
        m.castShadow = true; m.receiveShadow = true;
        m.name = `terrain-${tx}-${tz}`;
        this.tiles.push(m);
        this.group.add(m);
      }
    }
    this.mesh = this.tiles[0];

    // ---- distant ring
    const ringMat = makeTerrainMaterial({
      layers: this.layers, macro: this.maps.macro, biome: def.biome, size: hf.size, waterLevel: def.waterLevel ?? null, ring: true,
    });
    this.ring = new THREE.Mesh(buildRingGeometry(built), ringMat);
    this.ring.castShadow = false; this.ring.receiveShadow = false;
    this.ring.name = 'terrain-ring';
    this.ring.userData.noAO = true;
    this.group.add(this.ring);

    // ---- water
    const wl = def.waterLevel;
    if (wl === null || wl === undefined) this.water = null;
    else {
      const oasis = def.biome === 'oasis';
      this.water = makeWater({
        size: hf.size, level: wl, heights: this.maps.height, res: N, step,
        shallow: oasis ? 0x3fb09a : 0x3f9690, deep: oasis ? 0x0b4e55 : 0x0a3d58,
      });
    }
    this.setQuality(quality);
  }

  heightAt(x: number, z: number): number { return this.hf.heightAt(x, z); }

  /** vegetation density 0..1 at a point (from the control map) */
  vegAt(x: number, z: number): number { return this.ctl(x, z, 0); }
  /** channel of the CPU control map: 0 veg, 1 dirt, 2 pad, 3 concrete */
  ctl(x: number, z: number, ch: number): number {
    const N = this.maps.res;
    const gx = Math.min(N - 1, Math.max(0, Math.round((x + this.size / 2) / this.hf.step)));
    const gz = Math.min(N - 1, Math.max(0, Math.round((z + this.size / 2) / this.hf.step)));
    return this.maps.ctlData[(gz * N + gx) * 4 + ch] / 255;
  }

  private qListeners: ((q: Preset) => void)[] = [];
  private curQuality: Preset = 'high';
  /** subscribe to quality changes (props thin out on low presets); fires immediately */
  onQuality(fn: (q: Preset) => void): void { this.qListeners.push(fn); fn(this.curQuality); }

  setQuality(p: Preset): void {
    this.curQuality = p;
    for (const fn of this.qListeners) fn(p);
    const u = this.material.userData.uniforms as Record<string, THREE.IUniform>;
    const v = u.uQ.value as THREE.Vector4;
    v.x = p === 'low' ? 0 : 1;
    v.y = p === 'low' ? 0 : 1;
    const ru = this.ring.material as THREE.MeshStandardMaterial;
    const uq = (ru.userData.uniforms as Record<string, THREE.IUniform>).uQ.value as THREE.Vector4;
    uq.x = p === 'low' || p === 'medium' ? 0 : 1; uq.y = v.y;
    for (const t of this.tiles) t.castShadow = true;
  }

  /** hook kept for API compatibility (water / clouds animate from the shared atmosphere clock) */
  update(_time: number): void { /* animated by shared uniforms */ }

  /** render-only heights: steep faces get a light low-pass so cliffs do not show grid sawtooth */
  private renderHeights(): Float32Array {
    const { hf } = this;
    const N = hf.res, step = hf.step;
    let src = hf.data;
    for (let pass = 0; pass < 2; pass++) {
      const dst = new Float32Array(src);
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const k = j * N + i;
          const dx = (src[k + 1] - src[k - 1]) / (2 * step), dz = (src[k + N] - src[k - N]) / (2 * step);
          const w = smooth(0.55, 1.4, Math.hypot(dx, dz)) * 0.8;
          if (w < 0.01) continue;
          const avg = (src[k - N - 1] + src[k - N] + src[k - N + 1] + src[k - 1] + src[k] + src[k + 1] + src[k + N - 1] + src[k + N] + src[k + N + 1]) / 9;
          dst[k] = src[k] * (1 - w) + avg * w;
        }
      }
      src = dst;
    }
    return src;
  }
}
