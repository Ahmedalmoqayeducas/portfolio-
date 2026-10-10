import * as THREE from 'three';
import { fog } from './fog';
import type { VfxTextures } from './particleTex';

/** Minimal terrain surface the VFX depend on (kept behind this adapter so terrain.ts can change freely). */
export interface Ground {
  size: number;
  heightAt(x: number, z: number): number;
  /** water surface height (or -1e9 when the map has no water) */
  waterY: number;
  biome: string;
}

export function groundFrom(terrain: unknown): Ground {
  const t = terrain as { size?: number; heightAt: (x: number, z: number) => number; water?: { position?: { y: number } } | null; built?: { def?: { biome?: string; waterLevel?: number | null } } };
  const wl = t.built?.def?.waterLevel;
  return {
    size: t.size ?? 1024,
    heightAt: (x, z) => t.heightAt(x, z),
    waterY: typeof wl === 'number' ? wl : t.water?.position?.y ?? -1e9,
    biome: t.built?.def?.biome ?? 'desert',
  };
}

/** Samples the ground once into a half-float height texture (soft particle fade + decal draping). */
export function buildHeightTexture(g: Ground, res = 512): THREE.DataTexture {
  const data = new Uint16Array(res * res);
  const half = g.size / 2;
  for (let j = 0; j < res; j++) {
    const z = ((j + 0.5) / res) * g.size - half;
    for (let i = 0; i < res; i++) {
      const x = ((i + 0.5) / res) * g.size - half;
      data[j * res + i] = THREE.DataUtils.toHalfFloat(g.heightAt(x, z));
    }
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Uniform objects shared by every VFX material so a single write updates them all. */
export interface VfxUniforms {
  [k: string]: THREE.IUniform;
  uSunDir: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Vector3 };
  uSkyCol: { value: THREE.Vector3 };
  uGndCol: { value: THREE.Vector3 };
  uWorld: { value: THREE.Vector4 };
  uHeightTex: { value: THREE.Texture };
  uBig: { value: THREE.Texture };
  uSmall: { value: THREE.Texture };
  uNoise: { value: THREE.Texture };
  uDetail: { value: number };
  uTime: { value: number };
  uFogTex: typeof fog.map;
  uFogSize: typeof fog.size;
  uFogOn: typeof fog.on;
}

export function makeUniforms(tex: VfxTextures, heightTex: THREE.Texture, g: Ground): VfxUniforms {
  return {
    uSunDir: { value: new THREE.Vector3(-0.45, 0.75, 0.48).normalize() },
    uSunCol: { value: new THREE.Vector3(1, 0.96, 0.9) },
    uSkyCol: { value: new THREE.Vector3(0.42, 0.5, 0.64) },
    uGndCol: { value: new THREE.Vector3(0.3, 0.25, 0.19) },
    uWorld: { value: new THREE.Vector4(g.size, g.size / 2, 1 / g.size, Math.max(-1000, g.waterY)) },
    uHeightTex: { value: heightTex },
    uBig: { value: tex.big }, uSmall: { value: tex.small }, uNoise: { value: tex.noise },
    uDetail: { value: 1 }, uTime: { value: 0 },
    uFogTex: fog.map, uFogSize: fog.size, uFogOn: fog.on,
  };
}

// ------------------------------------------------------------------------------------ turbulence field
const TN = 16;
const TURB = new Float32Array(TN * TN * TN * 3);
{
  let s = 1234567;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < TURB.length; i++) TURB[i] = rnd() * 2 - 1;
}
/** smooth periodic vector noise, written into out[0..2] (components in about -1..1) */
export function turbSample(x: number, y: number, z: number, out: Float32Array): void {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  let u = x - fx, v = y - fy, w = z - fz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const x0 = fx & 15, y0 = fy & 15, z0 = fz & 15, x1 = (x0 + 1) & 15, y1 = (y0 + 1) & 15, z1 = (z0 + 1) & 15;
  const i000 = ((z0 * TN + y0) * TN + x0) * 3, i100 = ((z0 * TN + y0) * TN + x1) * 3, i010 = ((z0 * TN + y1) * TN + x0) * 3, i110 = ((z0 * TN + y1) * TN + x1) * 3;
  const i001 = ((z1 * TN + y0) * TN + x0) * 3, i101 = ((z1 * TN + y0) * TN + x1) * 3, i011 = ((z1 * TN + y1) * TN + x0) * 3, i111 = ((z1 * TN + y1) * TN + x1) * 3;
  for (let k = 0; k < 3; k++) {
    const a = TURB[i000 + k] + (TURB[i100 + k] - TURB[i000 + k]) * u, b = TURB[i010 + k] + (TURB[i110 + k] - TURB[i010 + k]) * u;
    const c = TURB[i001 + k] + (TURB[i101 + k] - TURB[i001 + k]) * u, d = TURB[i011 + k] + (TURB[i111 + k] - TURB[i011 + k]) * u;
    const e = a + (b - a) * v, f = c + (d - c) * v;
    out[k] = e + (f - e) * w;
  }
}

// ------------------------------------------------------------------------------------ shared GLSL
export const GLSL_COMMON = /* glsl */ `
uniform vec4 uWorld; uniform sampler2D uHeightTex;
uniform sampler2D uFogTex; uniform float uFogSize; uniform float uFogOn;
float groundH(vec2 xz){ return texture2D(uHeightTex, (xz + uWorld.y) * uWorld.z).r; }
float fogVis(vec2 xz){
  if (uFogOn < 0.5) return 1.0;
  float fv = texture2D(uFogTex, (xz + uFogSize * 0.5) / uFogSize).r;
  return smoothstep(0.35, 0.6, fv);
}
`;

export function hex3(c: number, out: { r: number; g: number; b: number }): void {
  out.r = ((c >> 16) & 255) / 255; out.g = ((c >> 8) & 255) / 255; out.b = (c & 255) / 255;
}
