import * as THREE from 'three';
import type { Biome } from '../maps/maps';

/**
 * Shared atmosphere state: one set of uniform objects referenced by the sky dome, every patched material
 * (aerial perspective, cloud shadows, wind), water, weather and the colour grade. The Environment writes
 * them, everything else only reads.
 */

export interface AtmoStyle {
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  /** height-fog density per metre at the base height */
  fogDensity: number;
  /** height-fog falloff (1/m) */
  fogK: number;
  fogBase: number;
  /** uniform haze per metre */
  haze: number;
  /** multiplies the fog colour (dust / marine tint) */
  hazeTint: [number, number, number];
  /** ground bounce colour in linear light (used by the IBL bake) */
  ground: [number, number, number];
  sunPower: number;
  skyFill: number;
  /** smoothstep thresholds of the cloud density (higher = fewer clouds) */
  cloudCover: [number, number];
  exposure: number;
  /** colour grade */
  sat: number;
  contrast: number;
  warm: number;
}

export const ATMO_STYLES: Record<Biome, AtmoStyle> = {
  desert: {
    turbidity: 5.5, rayleigh: 1.25, mie: 0.0045, mieG: 0.8, fogDensity: 0.0005, fogK: 0.0042, fogBase: 0, haze: 0.00006,
    hazeTint: [1.0, 0.9, 0.78], ground: [0.38, 0.2, 0.1], sunPower: 1.0, skyFill: 1.0, cloudCover: [0.58, 0.86], exposure: 0.66, sat: 1.24, contrast: 1.17, warm: 1.0,
  },
  urban: {
    turbidity: 4.0, rayleigh: 1.5, mie: 0.004, mieG: 0.78, fogDensity: 0.0005, fogK: 0.0048, fogBase: 0, haze: 0.00005,
    hazeTint: [0.92, 0.97, 1.02], ground: [0.22, 0.2, 0.15], sunPower: 1.0, skyFill: 1.0, cloudCover: [0.5, 0.82], exposure: 0.66, sat: 1.22, contrast: 1.15, warm: 0.6,
  },
  oasis: {
    turbidity: 6.5, rayleigh: 1.1, mie: 0.0055, mieG: 0.8, fogDensity: 0.0005, fogK: 0.0042, fogBase: 0, haze: 0.00007,
    hazeTint: [1.0, 0.92, 0.78], ground: [0.4, 0.26, 0.13], sunPower: 1.05, skyFill: 1.0, cloudCover: [0.66, 0.9], exposure: 0.66, sat: 1.22, contrast: 1.16, warm: 1.0,
  },
  highland: {
    turbidity: 2.6, rayleigh: 1.9, mie: 0.003, mieG: 0.76, fogDensity: 0.0006, fogK: 0.0052, fogBase: 0, haze: 0.00005,
    hazeTint: [0.9, 0.96, 1.05], ground: [0.36, 0.38, 0.42], sunPower: 0.95, skyFill: 1.1, cloudCover: [0.46, 0.8], exposure: 0.64, sat: 1.12, contrast: 1.16, warm: 0.4,
  },
  mixed: {
    turbidity: 4.8, rayleigh: 1.4, mie: 0.004, mieG: 0.8, fogDensity: 0.0005, fogK: 0.0045, fogBase: 0, haze: 0.00006,
    hazeTint: [1.0, 0.94, 0.86], ground: [0.26, 0.2, 0.12], sunPower: 1.0, skyFill: 1.0, cloudCover: [0.54, 0.84], exposure: 0.66, sat: 1.22, contrast: 1.16, warm: 0.8,
  },
};

export const CLOUD_ALT = 2600;
export const CLOUD_SCALE = 1 / 15000;

export const atmo = {
  time: { value: 0 },
  /** 0 night .. 1 day */
  day: { value: 1 },
  sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3) },
  /** x density, y falloff, z base height, w uniform haze */
  fogP: { value: new THREE.Vector4(0.001, 0.005, 0, 0.00005) },
  fogCol: { value: new THREE.Color(0.6, 0.65, 0.75) },
  fogSunCol: { value: new THREE.Color(0.9, 0.8, 0.6) },
  /** weather multiplier of the fog density */
  fogMul: { value: 1 },
  /** x uv/metre, yz scroll, w altitude */
  cloud: { value: new THREE.Vector4(CLOUD_SCALE, 0, 0, CLOUD_ALT) },
  /** x lo, y hi, z shadow strength */
  cloudCov: { value: new THREE.Vector3(0.55, 0.85, 0.5) },
  cloudMap: { value: null as THREE.Texture | null },
  /** sky model uniforms shared by the dome, the IBL bake and the water */
  sky: {
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    betaR: { value: new THREE.Vector3() },
    betaM: { value: new THREE.Vector3() },
    sunE: { value: 0 },
    mieG: { value: 0.8 },
    night: { value: 0 },
    moonDir: { value: new THREE.Vector3(0, 1, 0) },
  },
  /** key light (sun or moon): direction towards the light and colour * intensity */
  key: { dir: { value: new THREE.Vector3(0, 1, 0) }, col: { value: new THREE.Color(1, 1, 1) } },
  /** wind direction (xz) and strength used by vegetation */
  wind: { value: new THREE.Vector3(1, 0, 0.35) },
  /** colour grade, written by the Environment, read by the grade pass */
  grade: {
    sat: { value: 1.1 },
    contrast: { value: 1.1 },
    lift: { value: new THREE.Color(0.0, 0.0, 0.0) },
    shadowTint: { value: new THREE.Color(0.92, 0.98, 1.08) },
    highTint: { value: new THREE.Color(1.06, 1.0, 0.92) },
    exposure: { value: 1 },
  },
};

// ---------------------------------------------------------------------------------------------- GLSL snippets

export const GLSL_HASH = /* glsl */ `
float msHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float msHash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`;

/** cloud density (shared by the sky dome and the cloud shadows on every lit material) */
export const GLSL_CLOUD = /* glsl */ `
uniform sampler2D uCloudMap;
uniform vec4 uCloud;
uniform vec3 uCloudCov;
float msCloudDens(vec2 q){
  vec2 uv = q * uCloud.x + uCloud.yz;
  float b = texture2D(uCloudMap, uv).r;
  float d = texture2D(uCloudMap, uv * 4.3 + vec2(0.17, 0.53)).g;
  float v = b * 0.8 + d * 0.28;
  return smoothstep(uCloudCov.x, uCloudCov.y, v);
}
`;

/** Preetham sky radiance (GLSL), shared by the dome and the water reflections. Needs the uniforms below. */
export const GLSL_SKY = /* glsl */ `
uniform vec3 uSkySun; uniform vec3 uBetaR; uniform vec3 uBetaM; uniform float uSunE; uniform float uMieG; uniform float uSunDisk;
vec3 skyRad(vec3 dir){
  float zen = acos(max(0.0, dir.y));
  float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - (zen * 180.0 / 3.141592653589793), -1.253));
  float sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  vec3 Fex = exp(-(uBetaR * sR + uBetaM * sM));
  float cosT = dot(dir, uSkySun);
  float rPh = 0.05968310365946075 * (1.0 + pow(cosT * 0.5 + 0.5, 2.0));
  float g2 = uMieG * uMieG;
  float hg = 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * uMieG * cosT + g2, 1.5));
  vec3 ratio = (uBetaR * rPh + uBetaM * hg) / (uBetaR + uBetaM);
  vec3 Lin = pow(uSunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(uSunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - uSkySun.y, 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float disk = smoothstep(0.99995667, 0.99995669 + 0.00002, cosT);
  L0 += (uSunE * 19000.0 * Fex) * disk * uSunDisk;
  vec3 tex = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  return pow(tex, vec3(1.0 / 2.4));
}
`;

// ---------------------------------------------------------------------------------------------- sky model (JS twin of the dome shader)

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];

export interface SkyModel { betaR: THREE.Vector3; betaM: THREE.Vector3; sunE: number; g: number; sun: THREE.Vector3 }

function sunIntensity(zc: number): number {
  zc = Math.max(-1, Math.min(1, zc));
  return 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(zc)) / 1.5)));
}

export function makeSkyModel(sun: THREE.Vector3, st: AtmoStyle, out: SkyModel = { betaR: new THREE.Vector3(), betaM: new THREE.Vector3(), sunE: 0, g: 0.8, sun: new THREE.Vector3() }): SkyModel {
  out.sun.copy(sun).normalize();
  out.sunE = sunIntensity(out.sun.y);
  const sunfade = 1 - Math.min(1, Math.max(0, 1 - Math.exp(out.sun.y / 450000)));
  const rc = st.rayleigh - (1 - sunfade);
  out.betaR.set(TOTAL_RAYLEIGH[0] * rc, TOTAL_RAYLEIGH[1] * rc, TOTAL_RAYLEIGH[2] * rc);
  const c = 0.2 * st.turbidity * 10e-18;
  out.betaM.set(0.434 * c * MIE_CONST[0] * st.mie, 0.434 * c * MIE_CONST[1] * st.mie, 0.434 * c * MIE_CONST[2] * st.mie);
  out.g = st.mieG;
  return out;
}

const _tmp = new THREE.Vector3();
/** Sky radiance (no clouds, no sun disc) for a direction. Mirrors the dome fragment shader. */
export function skyAt(dir: THREE.Vector3, m: SkyModel, out: THREE.Color): THREE.Color {
  const dy = Math.max(0, dir.y);
  const zen = Math.acos(dy);
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = _tmp.copy(dir).dot(m.sun);
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g2 = m.g * m.g;
  const hg = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * m.g * cosT + g2, 1.5));
  const mixf = Math.min(1, Math.max(0, Math.pow(1 - m.sun.y, 5)));
  const bR = [m.betaR.x, m.betaR.y, m.betaR.z], bM = [m.betaM.x, m.betaM.y, m.betaM.z];
  const res = [0, 0, 0];
  const add = [0, 0.0003, 0.00075];
  for (let i = 0; i < 3; i++) {
    const fex = Math.exp(-(bR[i] * sR + bM[i] * sM));
    const ratio = (bR[i] * rPhase + bM[i] * hg) / (bR[i] + bM[i]);
    let lin = Math.pow(m.sunE * ratio * (1 - fex), 1.5);
    lin *= 1 + (Math.pow(m.sunE * ratio * fex, 0.5) - 1) * mixf;
    const l0 = 0.1 * fex;
    const tex = (lin + l0) * 0.04 + add[i];
    res[i] = Math.pow(Math.max(tex, 1e-9), 1 / 2.4);
  }
  return out.setRGB(res[0], res[1], res[2]);
}

// ---------------------------------------------------------------------------------------------- cloud map

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** periodic gradient-noise fBm, values roughly in [0,1] */
export function periodicFbm(S: number, baseCells: number, oct: number, seed: number): Float32Array {
  const rnd = mulberry(seed);
  const out = new Float32Array(S * S);
  let amp = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    const P = baseCells << o;
    const gx = new Float32Array(P * P), gy = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * P, y0 = Math.floor(fy), ty = fy - y0, vy = fade(ty);
      const ya = y0 % P, yb = (y0 + 1) % P;
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * P, x0 = Math.floor(fx), tx = fx - x0, vx = fade(tx);
        const xa = x0 % P, xb = (x0 + 1) % P;
        const n00 = gx[ya * P + xa] * tx + gy[ya * P + xa] * ty;
        const n10 = gx[ya * P + xb] * (tx - 1) + gy[ya * P + xb] * ty;
        const n01 = gx[yb * P + xa] * tx + gy[yb * P + xa] * (ty - 1);
        const n11 = gx[yb * P + xb] * (tx - 1) + gy[yb * P + xb] * (ty - 1);
        const n = (n00 * (1 - vx) + n10 * vx) * (1 - vy) + (n01 * (1 - vx) + n11 * vx) * vy;
        out[y * S + x] += n * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] / norm) * 1.5 + 0.5));
  return out;
}

let cloudTex: THREE.DataTexture | null = null;
export function getCloudMap(): THREE.DataTexture {
  if (cloudTex) return cloudTex;
  const S = 256;
  const a = periodicFbm(S, 3, 5, 11), b = periodicFbm(S, 9, 4, 29);
  const d = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    d[i * 4] = Math.round(a[i] * 255); d[i * 4 + 1] = Math.round(b[i] * 255); d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
  }
  cloudTex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  cloudTex.minFilter = THREE.LinearMipmapLinearFilter; cloudTex.magFilter = THREE.LinearFilter;
  cloudTex.generateMipmaps = true; cloudTex.needsUpdate = true;
  atmo.cloudMap.value = cloudTex;
  return cloudTex;
}
