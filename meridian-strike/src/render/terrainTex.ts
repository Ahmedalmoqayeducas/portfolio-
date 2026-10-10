import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Biome } from '../maps/maps';
import { GLSL_NOISE } from './noiseGl';

/**
 * Procedural PBR layer sets, generated on the GPU at load (no image assets).
 *
 *  layer: 0 ground  1 dirt  2 rock  3 gravel  4 grass  5 special (snow / dune sand)  6 asphalt  7 concrete
 *  albedo array : rgb linear albedo (stored sRGB8), a = roughness
 *  normal array : rg tangent-space normal (x,y), b = cavity ao, a = height
 */
export const LAYER_COUNT = 8;

export interface LayerStyle {
  kind: number;
  /** palette, sRGB hex */
  c: [number, number, number, number, number];
  /** kind specific parameters */
  p: [number, number, number, number];
  /** normal strength */
  bump: number;
  /** metres covered by one texture repeat */
  tile: number;
  rough: number;
}

const L = (kind: number, c: [number, number, number, number, number], p: [number, number, number, number], bump: number, tile: number, rough: number): LayerStyle => ({ kind, c, p, bump, tile, rough });

const ASPHALT = L(6, [0x39393b, 0x4a4a4d, 0x626166, 0x141415, 0], [1, 0, 0, 0], 26, 9, 0.86);
const CONCRETE = L(7, [0x8d8a84, 0xa6a29b, 0x6b655b, 0x35332f, 0], [1, 0, 0, 0], 18, 10, 0.78);

export const BIOME_LAYERS: Record<Biome, LayerStyle[]> = {
  desert: [
    L(0, [0xa5653b, 0xc78c58, 0x5e3320, 0x8c5a3a, 0], [0.6, 0.05, 1.0, 0], 30, 5.5, 0.95),
    L(1, [0x8a4a30, 0xa9653d, 0x2e170f, 0x7d6a58, 0], [1.0, 0, 0, 0], 28, 6.5, 0.93),
    L(2, [0x8a4a30, 0xb06a40, 0x34190f, 0xc99b6c, 0], [1.0, 0, 0, 0], 38, 9, 0.88),
    L(3, [0x7d6350, 0x92796a, 0x5a4638, 0x77503a, 0x4d3a2d], [0, 0, 0, 0], 34, 3.4, 0.9),
    L(4, [0x7b7332, 0x948a42, 0x6e4c2e, 0xb09c52, 0], [0, 0, 0, 0], 26, 4.5, 0.95),
    L(0, [0xd8a974, 0xe9c593, 0x8c633f, 0xa88056, 0], [1.0, 0.02, 0.8, 0], 22, 6, 0.93),
    ASPHALT, CONCRETE,
  ],
  urban: [
    L(0, [0x6c6845, 0x877b50, 0x39332a, 0x78726a, 0], [0.0, 0.08, 1.0, 0], 28, 5.5, 0.95),
    L(1, [0x66563f, 0x7d694a, 0x261e15, 0x77736b, 0], [0.5, 0, 0, 0], 26, 6.5, 0.93),
    L(2, [0x8b867a, 0xa6a094, 0x403c35, 0xb9b4a7, 0], [1.0, 0, 0, 0], 36, 9, 0.88),
    L(3, [0x6f6c66, 0x85817a, 0x55524d, 0x625a50, 0x3d3a36], [0, 0, 0, 0], 32, 3.4, 0.9),
    L(4, [0x4a6a2a, 0x6b8a38, 0x56472f, 0x8e8c4a, 0], [0, 0, 0, 0], 26, 4.5, 0.95),
    L(0, [0xcab68c, 0xdccaa2, 0x85735a, 0x9a8a6e, 0], [0.7, 0.02, 0.8, 0], 22, 6, 0.93),
    ASPHALT, CONCRETE,
  ],
  oasis: [
    L(0, [0xc79a62, 0xdeb97d, 0x6e5030, 0x967452, 0], [0.9, 0.03, 1.0, 0], 28, 5.5, 0.95),
    L(1, [0xa27346, 0xbd915c, 0x3d2a1a, 0x8a7b66, 0], [0.8, 0, 0, 0], 26, 6.5, 0.93),
    L(2, [0xa56c46, 0xc98d5c, 0x56361f, 0xd3a878, 0], [1.0, 0, 0, 0], 36, 9, 0.88),
    L(3, [0x8a7559, 0x9f8a6c, 0x65553f, 0x7e6044, 0x5f4b35], [0, 0, 0, 0], 32, 3.4, 0.9),
    L(4, [0x3d6a26, 0x5a8c33, 0x5e4a30, 0x8f9945, 0], [0, 0, 0, 0], 26, 4.5, 0.95),
    L(0, [0xe0bd88, 0xefd3a3, 0x96724a, 0xae8a60, 0], [1.0, 0.0, 0.8, 0], 22, 6, 0.93),
    ASPHALT, CONCRETE,
  ],
  highland: [
    L(0, [0x67635a, 0x7c7769, 0x37332c, 0x8a867c, 0], [0.0, 0.3, 1.0, 0], 30, 5.5, 0.94),
    L(1, [0x4a3e32, 0x5e4e3c, 0x1f170f, 0x6a665c, 0], [0.4, 0, 0, 0], 26, 6.5, 0.93),
    L(2, [0x65676c, 0x85878a, 0x2c2e33, 0x9d9c9a, 0], [1.0, 0, 0, 0], 40, 9, 0.85),
    L(3, [0x69686e, 0x7f7e86, 0x4a4a4f, 0x5e5750, 0x35322f], [0, 0, 0, 0], 34, 3.4, 0.88),
    L(4, [0x5a6a3a, 0x75803f, 0x483e31, 0x8a7d4a, 0], [0, 0, 0, 0], 26, 4.5, 0.95),
    L(5, [0xd9e3ef, 0x9fb4d2, 0x4a463f, 0, 0], [0.7, 0, 0, 0], 20, 7, 0.55),
    ASPHALT, CONCRETE,
  ],
  mixed: [
    L(0, [0x7c6e46, 0x94855a, 0x403726, 0x8a7e66, 0], [0.1, 0.06, 1.0, 0], 28, 5.5, 0.95),
    L(1, [0x775a3c, 0x8f6d4a, 0x2b2015, 0x7a7060, 0], [0.8, 0, 0, 0], 26, 6.5, 0.93),
    L(2, [0x7b6f60, 0x978a78, 0x3a332b, 0xab9d88, 0], [1.0, 0, 0, 0], 36, 9, 0.88),
    L(3, [0x766952, 0x8c7e68, 0x544837, 0x6a5742, 0x4f4131], [0, 0, 0, 0], 32, 3.4, 0.9),
    L(4, [0x51722d, 0x6e8f3a, 0x5a4930, 0x9a9448, 0], [0, 0, 0, 0], 26, 4.5, 0.95),
    L(0, [0xbfa272, 0xd2b88b, 0x866a48, 0x9d8460, 0], [0.8, 0.02, 0.8, 0], 22, 6, 0.93),
    ASPHALT, CONCRETE,
  ],
};

const VERT = /* glsl */ `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const GEN_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
layout(location = 0) out highp vec4 outA;
layout(location = 1) out highp vec4 outB;
uniform int uKind;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform vec4 uP; uniform vec2 uSeed; uniform float uRough;
${GLSL_NOISE}
float hgt; vec3 col; float rough; float cav;

void kSand(vec2 uv){
  float broad = fbm(uv * 3.0, vec2(3.0), 4);
  float mid = fbm(uv * 12.0 + 5.0, vec2(12.0), 4);
  float fine = fbm(uv * 96.0, vec2(96.0), 3);
  float grn = gnoise(uv * 512.0, vec2(512.0));
  float warp = fbm(uv * 5.0 + 11.0, vec2(5.0), 3);
  float ph = dot(uv, vec2(11.0, 5.0)) + warp * 0.45 + mid * 0.08;
  float rmask = smoothstep(-0.25, 0.3, broad + mid * 0.3) * uP.x;
  float s = fract(ph);
  float prof = s < 0.72 ? s / 0.72 : 1.0 - (s - 0.72) / 0.28;
  prof = prof * prof * (3.0 - 2.0 * prof);
  float rip = prof * rmask;
  vec3 v = voro(uv * 36.0, vec2(36.0));
  float pm = step(1.0 - uP.y, hash12(vec2(v.z * 97.0, 3.3)));
  float peb = pm * smoothstep(0.32, 0.06, v.x);
  hgt = 0.35 + rip * 0.24 + mid * 0.13 + fine * 0.07 + grn * 0.02 + peb * 0.3;
  col = mix(uC0, uC1, smoothstep(-0.5, 0.5, broad + mid * 0.5));
  col *= 1.0 + (fine * 0.22 + grn * 0.1) * uP.z;
  col *= 1.0 - 0.3 * uP.x * (1.0 - prof) * smoothstep(0.0, 0.5, rmask);
  col = mix(col, col * 1.12 + 0.015, prof * rmask * 0.55);
  float sp = hash12(floor(uv * 768.0) + 4.0);
  col = mix(col, uC2, step(0.972, sp) * 0.65);
  col = mix(col, uC3 * (0.8 + 0.5 * hash12(vec2(v.z * 31.0, 7.0))), peb);
  rough = uRough - 0.05 * prof * rmask;
  cav = 0.8 + 0.2 * smoothstep(0.2, 0.6, hgt);
}

void kDirt(vec2 uv){
  float broad = fbm(uv * 4.0, vec2(4.0), 4);
  float mid = fbm(uv * 14.0 + 3.0, vec2(14.0), 4);
  float fine = fbm(uv * 110.0, vec2(110.0), 3);
  vec3 v = voro(uv * 6.0 + mid * 0.05, vec2(6.0));
  float edge = v.y - v.x;
  float cm = smoothstep(-0.25, 0.3, broad + 0.2 * mid);
  float crack = (1.0 - smoothstep(0.0, 0.03 + 0.03 * (mid * 0.5 + 0.5), edge)) * cm * uP.x;
  vec3 v2 = voro(uv * 18.0 + 7.0, vec2(18.0));
  float crack2 = (1.0 - smoothstep(0.0, 0.045, v2.y - v2.x)) * cm * step(0.5, v.z) * 0.8 * uP.x;
  float cr = clamp(crack + crack2, 0.0, 1.0);
  float plate = smoothstep(0.0, 0.3, edge);
  hgt = 0.5 + (v.z - 0.5) * 0.12 + plate * 0.1 + mid * 0.1 + fine * 0.07 - cr * 0.55;
  col = mix(uC0, uC1, clamp(v.z * 0.7 + mid * 0.4 + 0.2, 0.0, 1.0));
  col *= 1.0 + fine * 0.25;
  col = mix(col, uC2, cr * 0.85);
  vec3 sv = voro(uv * 30.0, vec2(30.0));
  float sm = step(0.93, hash12(vec2(sv.z * 53.0, 1.0))) * smoothstep(0.3, 0.08, sv.x);
  hgt += sm * 0.28;
  col = mix(col, uC3 * (0.75 + 0.5 * sv.z), sm);
  col *= 0.88 + 0.2 * plate;
  rough = uRough;
  cav = 1.0 - cr * 0.7;
}

void kRock(vec2 uv){
  float warp = fbm(uv * vec2(2.0, 3.0) + 1.3, vec2(2.0, 3.0), 4) * 0.05;
  float y = uv.y + warp + 0.01 * fbm(uv * vec2(8.0, 20.0), vec2(8.0, 20.0), 2);
  float beds = 13.0;
  float bi = floor(y * beds), bf = fract(y * beds);
  float bid = mod(bi, beds);
  float bh = hash12(vec2(bid, 5.0));
  float hard = smoothstep(0.25, 0.8, bh);
  float edgeD = min(bf, 1.0 - bf);
  float ledge = smoothstep(0.0, 0.1, edgeD);
  // blocky vertical joints, a different spacing in every bed
  float nb = 2.0 + floor(hash12(vec2(bid, 21.0)) * 4.0);
  float bx = uv.x * nb + hash12(vec2(bid, 33.0)) + warp * 3.0 + 0.04 * fbm(uv * vec2(6.0, 24.0), vec2(6.0, 24.0), 2);
  float jd = abs(fract(bx) - 0.5);
  float jointOn = step(0.35, hash12(vec2(bid, 44.0) + floor(bx)));
  float joint = (1.0 - smoothstep(0.0, 0.035, 0.5 - jd)) * jointOn * uP.x;
  float blk = hash12(vec2(bid, floor(bx) + 77.0));
  float erosion = fbm(uv * vec2(6.0, 14.0) + 7.0, vec2(6.0, 14.0), 4);
  float fine = fbm(uv * 64.0, vec2(64.0), 3);
  float grit = gnoise(uv * 256.0, vec2(256.0));
  hgt = mix(0.34, 0.56, hard) + (bf - 0.5) * 0.12 * (1.0 - hard) + erosion * 0.1 + (ledge - 1.0) * 0.14 - joint * 0.3 + fine * 0.07 + grit * 0.02 + (blk - 0.5) * 0.06;
  col = mix(uC0, uC1, clamp(bh * 0.8 + (blk - 0.5) * 0.3, 0.0, 1.0));
  col = mix(col, uC2, smoothstep(0.78, 1.0, hash12(vec2(bid, 9.0))) * 0.6);
  col = mix(col, uC3, hard * 0.3 * (0.5 + 0.5 * erosion));
  float streak = fbm(uv * vec2(40.0, 4.0) + 2.0, vec2(40.0, 4.0), 3);
  col *= 0.82 + 0.3 * (streak * 0.5 + 0.5) + fine * 0.12 + grit * 0.05;
  col *= 1.0 - 0.4 * (1.0 - ledge);
  col = mix(col, uC2, joint * 0.75);
  rough = uRough + 0.06 * (1.0 - hard);
  cav = (0.6 + 0.4 * ledge) * (1.0 - joint * 0.7);
}

void kGravel(vec2 uv){
  vec2 w = vec2(fbm(uv * 5.0, vec2(5.0), 3), fbm(uv * 5.0 + 9.0, vec2(5.0), 3)) * 0.012;
  vec3 v = voro(uv * 22.0 + w * 22.0, vec2(22.0));
  vec3 v2 = voro(uv * 52.0 + 5.0, vec2(52.0));
  vec3 v3 = voro(uv * 110.0 + 9.0, vec2(110.0));
  float s1 = smoothstep(0.62, 0.12, v.x);
  float s2 = smoothstep(0.6, 0.15, v2.x);
  float s3 = smoothstep(0.6, 0.2, v3.x);
  float gap = 1.0 - smoothstep(0.0, 0.16, v.y - v.x);
  float h1 = s1 * (0.55 + 0.35 * v.z);
  float h2 = s2 * (0.28 + 0.2 * v2.z);
  float h3 = s3 * 0.14;
  hgt = max(h1, max(h2 * (1.0 - s1 * 0.8), h3)) - gap * 0.08;
  float t = hash12(vec2(v.z * 41.0, 2.0));
  vec3 sc = t < 0.3 ? uC0 : (t < 0.6 ? uC1 : (t < 0.8 ? uC2 : uC3));
  sc *= 0.9 + 0.22 * v.z;
  float t2 = v2.z;
  vec3 sc2 = t2 < 0.4 ? uC1 : (t2 < 0.7 ? uC0 : uC3);
  col = mix(uC4, sc2 * (0.7 + 0.5 * v3.z), clamp(s2 + s3 * 0.6, 0.0, 1.0));
  col = mix(col, sc, s1);
  col *= 0.74 + 0.36 * smoothstep(0.0, 0.5, hgt);
  rough = uRough;
  cav = 0.35 + 0.65 * smoothstep(0.0, 0.4, hgt);
}

void kGrass(vec2 uv){
  float broad = fbm(uv * 3.0, vec2(3.0), 4);
  float mid = fbm(uv * 11.0 + 4.0, vec2(11.0), 4);
  float sel = smoothstep(-0.12, 0.12, fbm(uv * 5.0 + 2.0, vec2(5.0), 3));
  float stA = gnoise(uv * vec2(160.0, 40.0), vec2(160.0, 40.0)) * 0.6 + gnoise(uv * vec2(320.0, 80.0), vec2(320.0, 80.0)) * 0.4;
  float stB = gnoise(uv * vec2(40.0, 160.0) + 3.7, vec2(40.0, 160.0)) * 0.6 + gnoise(uv * vec2(80.0, 320.0), vec2(80.0, 320.0)) * 0.4;
  float strands = mix(stA, stB, sel);
  vec3 v = voro(uv * 14.0 + mid * 0.12, vec2(14.0));
  float tuft = smoothstep(0.75, 0.2, v.x) * 0.5 + 0.5 * smoothstep(-0.2, 0.4, mid);
  float soil = 1.0 - clamp(tuft * 1.15 + (broad * 0.5 + 0.5) * 0.5 - 0.05, 0.0, 1.0);
  hgt = 0.3 + tuft * 0.3 + strands * 0.12 + mid * 0.08 - soil * 0.1;
  vec3 g = mix(uC0, uC1, clamp(broad * 0.6 + mid * 0.5 + 0.45, 0.0, 1.0));
  g *= 0.8 + strands * 0.3 + tuft * 0.15;
  g = mix(g, uC3, smoothstep(0.1, 0.6, fbm(uv * 8.0 + 9.0, vec2(8.0), 3)) * 0.4);
  col = mix(g, uC2, soil * 0.8);
  col *= mix(0.7, 1.0, tuft);
  rough = uRough;
  cav = mix(0.55, 1.0, tuft);
}

void kSnow(vec2 uv){
  float drift = fbm(uv * 3.0, vec2(3.0), 5);
  float mid = fbm(uv * 14.0 + 1.0, vec2(14.0), 4);
  float warp = fbm(uv * 4.0 + 8.0, vec2(4.0), 3);
  float ph = dot(uv, vec2(6.0, 3.0)) + warp * 0.6;
  float rip = pow(abs(sin(ph * 3.14159265)), 0.7);
  float fine = fbm(uv * 128.0, vec2(128.0), 3);
  hgt = 0.5 + drift * 0.38 + rip * 0.08 + mid * 0.12 + fine * 0.05;
  col = mix(uC0, uC1, smoothstep(0.55, -0.45, drift + mid * 0.35));
  col *= 1.0 + fine * 0.05;
  float sp = hash12(floor(uv * 1024.0));
  float spk = step(0.995, sp);
  col += uC0 * spk * 0.5;
  vec3 v = voro(uv * 40.0 + 2.0, vec2(40.0));
  float sk = step(0.88, hash12(vec2(v.z * 13.0, 4.0))) * smoothstep(0.22, 0.02, v.x) * uP.x;
  col = mix(col, uC2, sk * 0.55);
  rough = mix(uRough, 0.25, spk);
  cav = 0.7 + 0.3 * smoothstep(0.2, 0.7, hgt);
}

void kAsphalt(vec2 uv){
  float broad = fbm(uv * 3.0, vec2(3.0), 3);
  float mid = fbm(uv * 16.0, vec2(16.0), 4);
  float fine = fbm(uv * 160.0, vec2(160.0), 3);
  vec3 v = voro(uv * 90.0, vec2(90.0));
  float chip = smoothstep(0.38, 0.1, v.x) * step(0.5, v.z);
  vec3 cv = voro(uv * 4.0 + fbm(uv * 8.0, vec2(8.0), 2) * 0.08, vec2(4.0));
  float crack = (1.0 - smoothstep(0.0, 0.012, cv.y - cv.x)) * step(0.55, hash12(vec2(cv.z * 91.0, 8.0))) * smoothstep(-0.3, 0.3, broad);
  vec2 cell = floor(uv * vec2(2.0, 4.0));
  float ph = hash12(cell + 3.0);
  vec2 cf = fract(uv * vec2(2.0, 4.0));
  float pedge = min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y));
  float repair = step(0.8, ph);
  float seam = (1.0 - smoothstep(0.0, 0.014, pedge)) * repair;
  hgt = 0.5 + chip * 0.15 + fine * 0.08 + mid * 0.05 - crack * 0.5 - seam * 0.3;
  col = mix(uC0, uC1, clamp(0.5 + mid * 0.5 + fine * 0.3, 0.0, 1.0));
  col = mix(col, uC2, chip * 0.35);
  col *= mix(1.0, 0.82, repair);
  col *= 0.9 + 0.25 * (broad * 0.5 + 0.5);
  col = mix(col, uC3, crack * 0.9 + seam * 0.7);
  rough = uRough - 0.08 * chip;
  cav = 1.0 - (crack + seam) * 0.6;
}

void kConcrete(vec2 uv){
  vec2 sp = uv * 2.0;
  vec2 cell = floor(sp), cf = fract(sp);
  float jd = min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y));
  float joint = 1.0 - smoothstep(0.0, 0.009, jd);
  float tone = hash12(cell + 11.0);
  float broad = fbm(uv * 3.0, vec2(3.0), 4);
  float mid = fbm(uv * 15.0, vec2(15.0), 4);
  float fine = fbm(uv * 140.0, vec2(140.0), 3);
  vec3 v = voro(uv * 70.0, vec2(70.0));
  float pore = smoothstep(0.14, 0.04, v.x) * step(0.6, v.z);
  float stain = smoothstep(0.05, 0.7, fbm(uv * 6.0 + 5.0, vec2(6.0), 4) * 0.5 + 0.5 - 0.15);
  float cn = 1.0 - abs(gnoise(uv * vec2(7.0, 7.0) + fbm(uv * 9.0 + 1.0, vec2(9.0), 3) * 0.5, vec2(7.0, 7.0)));
  float hair = smoothstep(0.985, 0.998, cn) * smoothstep(-0.1, 0.5, broad);
  hgt = 0.6 + fine * 0.05 + mid * 0.04 - joint * 0.5 - pore * 0.2 + (tone - 0.5) * 0.06 - hair * 0.3;
  col = mix(uC0, uC1, clamp(tone * 0.6 + mid * 0.3 + 0.2, 0.0, 1.0));
  col *= 1.0 + fine * 0.14;
  col = mix(col, uC2, stain * 0.38 + pore * 0.45 + hair * 0.5);
  col = mix(col, uC3, joint * 0.85);
  rough = uRough + 0.08 * stain;
  cav = 1.0 - joint * 0.7 - pore * 0.3;
}

void main(){
  vec2 uv = vUv;
  hgt = 0.5; col = uC0; rough = 0.9; cav = 1.0;
  if (uKind == 0) kSand(uv);
  else if (uKind == 1) kDirt(uv);
  else if (uKind == 2) kRock(uv);
  else if (uKind == 3) kGravel(uv);
  else if (uKind == 4) kGrass(uv);
  else if (uKind == 5) kSnow(uv);
  else if (uKind == 6) kAsphalt(uv);
  else kConcrete(uv);
  outA = vec4(max(col, vec3(0.0)), clamp(hgt, 0.0, 1.0));
  outB = vec4(clamp(rough, 0.05, 1.0), clamp(cav, 0.0, 1.0), 0.0, 1.0);
}`;

const STORE_ALB_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out highp vec4 outC;
uniform sampler2D tA; uniform sampler2D tB;
void main(){ outC = vec4(texture(tA, vUv).rgb, texture(tB, vUv).r); }`;

const STORE_NRM_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out highp vec4 outC;
uniform sampler2D tA; uniform sampler2D tB; uniform float uBump; uniform float uSize;
float H(ivec2 p, ivec2 sz){ return texelFetch(tA, (p + sz) % sz, 0).a; }
void main(){
  ivec2 sz = ivec2(uSize);
  ivec2 p = ivec2(floor(vUv * uSize));
  float hl = H(p + ivec2(-1, 0), sz), hr = H(p + ivec2(1, 0), sz);
  float hd = H(p + ivec2(0, -1), sz), hu = H(p + ivec2(0, 1), sz);
  // soften slightly with the diagonals so single texel spikes do not alias
  float hx = (hr - hl) * 0.5, hy = (hu - hd) * 0.5;
  vec3 n = normalize(vec3(-hx * uBump, -hy * uBump, 1.0));
  float h = H(p, sz);
  outC = vec4(n.xy * 0.5 + 0.5, texelFetch(tB, p, 0).g, h);
}`;

export interface LayerSet {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  tile: number[];
  size: number;
}

const cache = new WeakMap<THREE.WebGLRenderer, Map<string, LayerSet>>();

function arrayTarget(size: number, srgb: boolean, aniso: number): THREE.WebGLArrayRenderTarget {
  const rt = new THREE.WebGLArrayRenderTarget(size, size, LAYER_COUNT, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping;
  rt.texture.anisotropy = aniso;
  if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace;
  return rt;
}

/** Generate (or fetch from cache) the 8-layer PBR set of a biome. */
export function buildLayerSet(renderer: THREE.WebGLRenderer, biome: Biome, size = 1024): LayerSet {
  let per = cache.get(renderer);
  if (!per) { per = new Map(); cache.set(renderer, per); }
  const key = `${biome}:${size}`;
  const hit = per.get(key);
  if (hit) return hit;

  const styles = BIOME_LAYERS[biome];
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const gen = new THREE.WebGLRenderTarget(size, size, {
    count: 2, type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false,
  });
  const albRT = arrayTarget(size, true, aniso);
  const nrmRT = arrayTarget(size, false, aniso);

  const col = (hex: number) => new THREE.Color().set(hex);
  const genMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: GEN_FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      uKind: { value: 0 }, uC0: { value: col(0) }, uC1: { value: col(0) }, uC2: { value: col(0) }, uC3: { value: col(0) }, uC4: { value: col(0) },
      uP: { value: new THREE.Vector4() }, uSeed: { value: new THREE.Vector2() }, uRough: { value: 0.9 },
    },
  });
  const albMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: STORE_ALB_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tA: { value: gen.textures[0] }, tB: { value: gen.textures[1] } },
  });
  const nrmMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: STORE_NRM_FRAG, depthTest: false, depthWrite: false,
    uniforms: { tA: { value: gen.textures[0] }, tB: { value: gen.textures[1] }, uBump: { value: 8 }, uSize: { value: size } },
  });
  const quad = new FullScreenQuad(genMat);

  const prevTarget = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  const u = genMat.uniforms;
  for (let i = 0; i < LAYER_COUNT; i++) {
    const s = styles[i];
    u.uKind.value = s.kind;
    u.uC0.value.set(s.c[0]); u.uC1.value.set(s.c[1]); u.uC2.value.set(s.c[2]); u.uC3.value.set(s.c[3]); u.uC4.value.set(s.c[4]);
    u.uP.value.set(s.p[0], s.p[1], s.p[2], s.p[3]);
    u.uSeed.value.set(i * 13 + 5, i * 7 + 3);
    u.uRough.value = s.rough;
    quad.material = genMat;
    renderer.setRenderTarget(gen);
    quad.render(renderer);
    quad.material = albMat;
    renderer.setRenderTarget(albRT, i);
    quad.render(renderer);
    nrmMat.uniforms.uBump.value = s.bump * (size / 1024);
    quad.material = nrmMat;
    renderer.setRenderTarget(nrmRT, i);
    quad.render(renderer);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.autoClear = prevAuto;

  // mip chains for both arrays
  const gl = renderer.getContext() as WebGL2RenderingContext;
  for (const rt of [albRT, nrmRT]) {
    const tex = renderer.properties.get(rt.texture) as { __webglTexture: WebGLTexture };
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex.__webglTexture);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
  }
  renderer.resetState();

  gen.dispose(); genMat.dispose(); albMat.dispose(); nrmMat.dispose(); quad.dispose();
  const set: LayerSet = { albedo: albRT.texture, normal: nrmRT.texture, tile: styles.map((s) => s.tile), size };
  per.set(key, set);
  return set;
}
