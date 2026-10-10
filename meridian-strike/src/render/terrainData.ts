import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { Noise2D, mulberry32 } from '../procgen/noise';
import type { BuiltMap, Biome } from '../maps/maps';
import { periodicFbm } from './atmo';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface TerrainMaps {
  /** rg: world normal x,z (hi-res, bicubic), b: cavity, a: horizon visibility */
  nrm: THREE.Texture;
  nrmRes: number;
  /** r veg, g dirt, b packed pad, a concrete */
  ctl: THREE.DataTexture;
  /** r road shoulder (soft mask), g special layer (snow / dune sand), b macro wetness */
  ctl2: THREE.DataTexture;
  /** r asphalt, g markings, b wear */
  road: THREE.Texture;
  /** raw heights (R32F, nearest) for water depth */
  height: THREE.DataTexture;
  macro: THREE.DataTexture;
  /** CPU copy of ctl (res x res x 4) */
  ctlData: Uint8Array<ArrayBuffer>;
  res: number;
  dispose(): void;
}

// ------------------------------------------------------------------------------------------------ normal / AO map (GPU)

const NRM_FRAG = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
layout(location = 0) out highp vec4 outC;
uniform sampler2D uH;
uniform float uN;
uniform float uStep;
float H(ivec2 p){ p = clamp(p, ivec2(0), ivec2(int(uN) - 1)); return texelFetch(uH, p, 0).r; }
float HW(vec2 g){ // bilinear height at fractional grid coords
  vec2 f = floor(g); vec2 t = g - f; ivec2 i = ivec2(f);
  return mix(mix(H(i), H(i + ivec2(1, 0)), t.x), mix(H(i + ivec2(0, 1)), H(i + ivec2(1, 1)), t.x), t.y);
}
void main(){
  vec2 g = vUv * (uN - 1.0);
  ivec2 gi = ivec2(floor(g));
  vec2 t = g - vec2(gi);
  float h[16];
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) h[j * 4 + i] = H(gi + ivec2(i - 1, j - 1));
  float t2 = t.x * t.x, t3 = t2 * t.x, s2 = t.y * t.y, s3 = s2 * t.y;
  // Catmull-Rom weights + derivatives
  vec4 wx = vec4(-0.5 * t3 + t2 - 0.5 * t.x, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t.x, 0.5 * t3 - 0.5 * t2);
  vec4 dx = vec4(-1.5 * t2 + 2.0 * t.x - 0.5, 4.5 * t2 - 5.0 * t.x, -4.5 * t2 + 4.0 * t.x + 0.5, 1.5 * t2 - t.x);
  vec4 wz = vec4(-0.5 * s3 + s2 - 0.5 * t.y, 1.5 * s3 - 2.5 * s2 + 1.0, -1.5 * s3 + 2.0 * s2 + 0.5 * t.y, 0.5 * s3 - 0.5 * s2);
  vec4 dz = vec4(-1.5 * s2 + 2.0 * t.y - 0.5, 4.5 * s2 - 5.0 * t.y, -4.5 * s2 + 4.0 * t.y + 0.5, 1.5 * s2 - t.y);
  // cubic B-spline (smoothing) weights + derivatives
  float u = 1.0 - t.x, v = 1.0 - t.y;
  vec4 bx = vec4(u * u * u / 6.0, (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0, (-3.0 * t3 + 3.0 * t2 + 3.0 * t.x + 1.0) / 6.0, t3 / 6.0);
  vec4 bdx = vec4(-0.5 * u * u, 1.5 * t2 - 2.0 * t.x, -1.5 * t2 + t.x + 0.5, 0.5 * t2);
  vec4 bz = vec4(v * v * v / 6.0, (3.0 * s3 - 6.0 * s2 + 4.0) / 6.0, (-3.0 * s3 + 3.0 * s2 + 3.0 * t.y + 1.0) / 6.0, s3 / 6.0);
  vec4 bdz = vec4(-0.5 * v * v, 1.5 * s2 - 2.0 * t.y, -1.5 * s2 + t.y + 0.5, 0.5 * s2);
  float gxC = 0.0, gzC = 0.0, gxB = 0.0, gzB = 0.0, hC = 0.0;
  for (int j = 0; j < 4; j++) {
    float rowW = 0.0, rowD = 0.0, rowB = 0.0, rowBD = 0.0;
    for (int i = 0; i < 4; i++) {
      float hh = h[j * 4 + i];
      rowW += wx[i] * hh; rowD += dx[i] * hh; rowB += bx[i] * hh; rowBD += bdx[i] * hh;
    }
    hC += wz[j] * rowW;
    gxC += wz[j] * rowD; gzC += dz[j] * rowW;
    gxB += bz[j] * rowBD; gzB += bdz[j] * rowB;
  }
  vec2 gradC = vec2(gxC, gzC) / uStep, gradB = vec2(gxB, gzB) / uStep;
  float steep = length(gradC);
  vec2 grad = mix(gradC, gradB, smoothstep(0.9, 2.2, steep));
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  // cavity: concave = positive
  float r = 2.5;
  float lap = (HW(g + vec2(r, 0.0)) + HW(g - vec2(r, 0.0)) + HW(g + vec2(0.0, r)) + HW(g - vec2(0.0, r))) * 0.25 - hC;
  float cav = clamp(lap * 0.5, -1.0, 1.0);
  // horizon visibility (valley / cliff-foot darkening), tilt removed
  float occ = 0.0;
  for (int k = 0; k < 8; k++) {
    float a = (float(k) + 0.5) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a));
    float best = 0.0;
    for (int m = 0; m < 4; m++) {
      float dist = m == 0 ? 3.0 : (m == 1 ? 8.0 : (m == 2 ? 18.0 : 40.0));
      float hs = HW(g + d * dist);
      float plane = dot(grad, d * dist * uStep);
      float sl = (hs - hC - plane) / (dist * uStep);
      best = max(best, sl);
    }
    occ += best * inversesqrt(1.0 + best * best);
  }
  float vis = 1.0 - occ / 8.0 * 1.15;
  outC = vec4(n.x, n.z, cav * 0.5 + 0.5, clamp(vis, 0.0, 1.0));
}`;

const NRM_VERT = /* glsl */ `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function buildNormalMap(renderer: THREE.WebGLRenderer, hTex: THREE.DataTexture, N: number, step: number, out: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(out, out, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: true, depthBuffer: false,
  });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: NRM_VERT, fragmentShader: NRM_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uH: { value: hTex }, uN: { value: N }, uStep: { value: step } },
  });
  const quad = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  const auto = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(prev);
  renderer.autoClear = auto;
  quad.dispose(); mat.dispose();
  return rt;
}

// ------------------------------------------------------------------------------------------------ control maps (CPU)

/** vegetation density (0..1) by biome */
function vegetation(biome: Biome, x: number, z: number, y: number, r: number, n: Noise2D): number {
  switch (biome) {
    case 'urban': return smooth(0.0, 0.5, n.fbm(x * 0.012 + 3, z * 0.012, 3)) * 0.85;
    case 'oasis': {
      const lush = 1 - smooth(110, 290, r);
      const tuft = smooth(0.25, 0.5, n.fbm(x * 0.02, z * 0.02, 3));
      return Math.min(1, lush * (0.7 + 0.3 * tuft) + tuft * 0.18);
    }
    case 'highland': return smooth(-0.15, 0.25, n.fbm(x * 0.01, z * 0.01, 3)) * (1 - smooth(16, 38, y));
    case 'mixed': {
      const f = smooth(0.0, 0.35, n.fbm(x * 0.005 + 7, z * 0.005, 3)) * smooth(280, 400, r);
      return Math.min(1, f * 1.15 + smooth(0.45, 0.7, n.fbm(x * 0.03, z * 0.03, 2)) * 0.2 * smooth(260, 360, r));
    }
    default: return smooth(0.5, 0.78, n.fbm(x * 0.03 - 9, z * 0.03 + 3, 3) * 0.5 + 0.5) * 0.55;
  }
}

/** infer the street grid of a generated city from its building lattice */
function cityStreets(civ: { x: number; z: number }[]): { xs: number[]; zs: number[]; x0: number; x1: number; z0: number; z1: number } | null {
  if (civ.length < 24) return null;
  const clusters = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const out: number[] = [];
    let sum = s[0], cnt = 1;
    for (let i = 1; i < s.length; i++) {
      if (s[i] - s[i - 1] > 14) { out.push(sum / cnt); sum = s[i]; cnt = 1; } else { sum += s[i]; cnt++; }
    }
    out.push(sum / cnt);
    return out;
  };
  const cx = clusters(civ.map((c) => c.x)), cz = clusters(civ.map((c) => c.z));
  const mid = (a: number[]) => a.slice(0, -1).map((v, i) => (v + a[i + 1]) / 2).filter((_v, i) => a[i + 1] - a[i] > 30 && a[i + 1] - a[i] < 70);
  return {
    xs: mid(cx), zs: mid(cz),
    x0: cx[0] - 26, x1: cx[cx.length - 1] + 26, z0: cz[0] - 26, z1: cz[cz.length - 1] + 26,
  };
}

function drawRoadCanvas(built: BuiltMap, ppm: number): HTMLCanvasElement {
  const { def } = built;
  const size = def.size, half = size / 2;
  const S = Math.min(4096, Math.max(512, Math.round((size * ppm) / 64) * 64));
  const sc = S / size;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: false })!;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  g.lineJoin = 'round'; g.lineCap = 'butt';
  const rnd = mulberry32(def.seed + 404);
  const P = (x: number, z: number): [number, number] => [(x + half) * sc, (z + half) * sc];

  const strokeSeg = (x0: number, z0: number, x1: number, z1: number, width: number, style: string, off = 0, dash: number[] = []) => {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const [ax, ay] = P(x0 + nx * off, z0 + nz * off), [bx, by] = P(x1 + nx * off, z1 + nz * off);
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by);
    g.lineWidth = Math.max(1, width * sc); g.strokeStyle = style;
    g.setLineDash(dash.map((d) => d * sc));
    g.stroke();
  };

  const drawRoad = (pts: [number, number][], width: number, withMarks: boolean) => {
    const path = () => { g.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); };
    // clear the footprint (later / wider roads win at junctions), then lay the asphalt
    g.globalCompositeOperation = 'source-over';
    path(); g.lineWidth = (width + 1.2) * sc; g.strokeStyle = '#000'; g.setLineDash([]); g.stroke();
    g.globalCompositeOperation = 'lighter';
    path(); g.lineWidth = width * sc; g.strokeStyle = '#ff0000'; g.stroke();
    if (!withMarks) return;
    const lanes = Math.max(2, Math.round(width / 3.7));
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      // edge lines
      strokeSeg(x0, z0, x1, z1, 0.32, 'rgba(0,255,0,0.75)', width / 2 - 0.7);
      strokeSeg(x0, z0, x1, z1, 0.32, 'rgba(0,255,0,0.75)', -(width / 2 - 0.7));
      // lane dividers (dashed); the median is a solid line
      for (let k = 1; k < lanes; k++) {
        const o = -width / 2 + (k * width) / lanes;
        if (Math.abs(o) < 0.2) { strokeSeg(x0, z0, x1, z1, 0.3, 'rgba(0,255,0,0.8)', 0.22); strokeSeg(x0, z0, x1, z1, 0.3, 'rgba(0,255,0,0.8)', -0.22); }
        else strokeSeg(x0, z0, x1, z1, 0.26, 'rgba(0,255,0,0.6)', o, [3.2, 6.4]);
      }
      // tyre wear in each lane
      for (let k = 0; k < lanes; k++) {
        const o = -width / 2 + ((k + 0.5) * width) / lanes;
        strokeSeg(x0, z0, x1, z1, 0.9, 'rgba(0,0,255,0.45)', o - 0.95);
        strokeSeg(x0, z0, x1, z1, 0.9, 'rgba(0,0,255,0.45)', o + 0.95);
      }
      // oil / patch stains
      const len = Math.hypot(x1 - x0, z1 - z0);
      const nst = Math.floor(len / 28);
      for (let s = 0; s < nst; s++) {
        const t = rnd(), o = (rnd() - 0.5) * (width - 3);
        const dx = x1 - x0, dz = z1 - z0, l = len || 1;
        const px = x0 + dx * t + (-dz / l) * o, pz = z0 + dz * t + (dx / l) * o;
        const [qx, qy] = P(px, pz);
        const rr = (0.6 + rnd() * 1.6) * sc;
        const gr = g.createRadialGradient(qx, qy, 0, qx, qy, rr);
        gr.addColorStop(0, 'rgba(0,0,255,0.6)'); gr.addColorStop(1, 'rgba(0,0,255,0)');
        g.fillStyle = gr; g.setLineDash([]);
        g.beginPath(); g.arc(qx, qy, rr, 0, Math.PI * 2); g.fill();
      }
    }
  };

  const streets = cityStreets(def.civ);
  if (streets) {
    for (const x of streets.xs) drawRoad([[x, streets.z0], [x, streets.z1]], 10, false);
    for (const z of streets.zs) drawRoad([[streets.x0, z], [streets.x1, z]], 10, false);
    // faint centre lines on the streets
    for (const x of streets.xs) strokeSeg(x, streets.z0, x, streets.z1, 0.26, 'rgba(0,255,0,0.5)', 0, [3, 6]);
    for (const z of streets.zs) strokeSeg(streets.x0, z, streets.x1, z, 0.26, 'rgba(0,255,0,0.5)', 0, [3, 6]);
  }
  for (const r of [...def.roads].sort((a, b) => a.width - b.width)) drawRoad(r.pts, r.width, true);
  return c;
}

function buildCtl(built: BuiltMap): { ctl: Uint8Array<ArrayBuffer>; ctl2: Uint8Array<ArrayBuffer> } {
  const { def, hf, roadMask } = built;
  const N = hf.res;
  const half = hf.size / 2, step = hf.step;
  const ctl = new Uint8Array(N * N * 4);
  const ctl2 = new Uint8Array(N * N * 4);
  const n = new Noise2D(def.seed + 9);
  const n2 = new Noise2D(def.seed + 31);
  const wl = def.waterLevel ?? -1e9;
  const h = hf.data;
  for (let j = 0; j < N; j++) {
    const z = j * step - half;
    for (let i = 0; i < N; i++) {
      const x = i * step - half;
      const k = j * N + i;
      const y = h[k];
      const il = Math.max(0, i - 1), ir = Math.min(N - 1, i + 1), jd = Math.max(0, j - 1), ju = Math.min(N - 1, j + 1);
      const sx = (h[j * N + ir] - h[j * N + il]) / ((ir - il) * step);
      const sz = (h[ju * N + i] - h[jd * N + i]) / ((ju - jd) * step);
      const slope = Math.hypot(sx, sz);
      const r = Math.hypot(x, z);
      let veg = vegetation(def.biome, x, z, y, r, n) * (1 - smooth(0.14, 0.45, slope));
      // shore: damp near the waterline, lush belt for oases
      if (def.waterLevel !== null && def.waterLevel !== undefined) {
        const sd = y - wl;
        veg *= smooth(1.2, 3.8, sd);
        if (def.biome === 'oasis') veg = Math.max(veg, (1 - smooth(3.5, 9, sd)) * smooth(0.8, 2.5, sd) * 0.9);
      }
      const dirt = smooth(0.42, 0.82, n2.fbm(x * 0.017 + 5, z * 0.017, 3) * 0.5 + 0.5);
      // special layer: snow (highland) or wind-blown / beach sand elsewhere
      let spec = 0;
      if (def.biome === 'highland') {
        const hn = y + 12 * n2.fbm(x * 0.03, z * 0.03, 2);
        spec = smooth(-2, 12, hn) * (0.45 + 0.55 * smooth(10, 34, hn));
      } else if (def.biome === 'desert') {
        spec = smooth(0.18, 0.55, n2.fbm(x * 0.008 - 3, z * 0.008, 3)) * 0.85;
      } else if (def.biome === 'oasis') {
        spec = (smooth(0.0, 0.4, n2.fbm(x * 0.007, z * 0.007, 3)) * 0.8 + 0.2) * (1 - veg);
      } else {
        spec = smooth(0.2, 0.6, n2.fbm(x * 0.01 - 3, z * 0.01, 3)) * 0.55;
      }
      if (def.waterLevel !== null && def.waterLevel !== undefined) {
        const sd = y - wl;
        spec = Math.max(spec * 0.5, 1 - smooth(0.8, 3.0 + 1.6 * n2.fbm(x * 0.05, z * 0.05, 2), sd));
      }
      const wet = smooth(0.2, 0.8, n.fbm(x * 0.02 + 19, z * 0.02 - 4, 3) * 0.5 + 0.5);
      ctl[k * 4] = Math.round(clamp01(veg) * 255);
      ctl[k * 4 + 1] = Math.round(dirt * 255);
      ctl2[k * 4] = roadMask[k];
      ctl2[k * 4 + 1] = Math.round(clamp01(spec) * 255);
      ctl2[k * 4 + 2] = Math.round(wet * 255);
      ctl2[k * 4 + 3] = 255;
    }
  }

  // pads: base compounds -> packed earth, depots -> hard pan, derricks / civ lots -> concrete
  const stampDisc = (cx: number, cz: number, r0: number, r1: number, ch: number, v: number) => {
    const R = r1 * 1.15;
    const i0 = Math.max(0, Math.floor((cx - R + half) / step)), i1 = Math.min(N - 1, Math.ceil((cx + R + half) / step));
    const j0 = Math.max(0, Math.floor((cz - R + half) / step)), j1 = Math.min(N - 1, Math.ceil((cz + R + half) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * step - half, z = j * step - half;
      const d = Math.hypot(x - cx, z - cz) * (1 + 0.1 * n.noise(x * 0.09, z * 0.09));
      const w = 1 - smooth(r0, r1, d);
      if (w <= 0) continue;
      const o = (j * N + i) * 4 + ch;
      ctl[o] = Math.max(ctl[o], Math.round(w * v * 255));
    }
  };
  for (const p of def.pads) if (p.r >= 60) stampDisc(p.x, p.z, p.r * 0.45, p.r * 0.92, 2, 1);
  for (const d of def.depots) stampDisc(d[0], d[1], 9, 17, 2, 0.9);
  for (const d of def.derricks) stampDisc(d[0], d[1], 5.5, 10, 3, 1);
  for (const c of def.civ) {
    // paved lot (square-ish)
    const R = 17;
    const i0 = Math.max(0, Math.floor((c.x - R + half) / step)), i1 = Math.min(N - 1, Math.ceil((c.x + R + half) / step));
    const j0 = Math.max(0, Math.floor((c.z - R + half) / step)), j1 = Math.min(N - 1, Math.ceil((c.z + R + half) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * step - half, z = j * step - half;
      const d = Math.max(Math.abs(x - c.x), Math.abs(z - c.z));
      const w = 1 - smooth(11, 16, d + 1.5 * n.noise(x * 0.2, z * 0.2));
      if (w <= 0) continue;
      const o = (j * N + i) * 4 + 3;
      ctl[o] = Math.max(ctl[o], Math.round(w * 0.85 * 255));
    }
  }
  return { ctl, ctl2 };
}

function makeMacro(): THREE.DataTexture {
  const S = 256;
  const a = periodicFbm(S, 3, 4, 101), b = periodicFbm(S, 7, 4, 202), c = periodicFbm(S, 17, 4, 303), d = periodicFbm(S, 41, 3, 404);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = Math.round(a[i] * 255); data[i * 4 + 1] = Math.round(b[i] * 255);
    data[i * 4 + 2] = Math.round(c[i] * 255); data[i * 4 + 3] = Math.round(d[i] * 255);
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export type MapQuality = 'low' | 'medium' | 'high' | 'ultra';

export function buildTerrainMaps(renderer: THREE.WebGLRenderer, built: BuiltMap, quality: MapQuality): TerrainMaps {
  const { hf } = built;
  const N = hf.res;
  // heights
  const hTex = new THREE.DataTexture(new Float32Array(hf.data), N, N, THREE.RedFormat, THREE.FloatType);
  hTex.minFilter = hTex.magFilter = THREE.NearestFilter;
  hTex.wrapS = hTex.wrapT = THREE.ClampToEdgeWrapping;
  hTex.generateMipmaps = false;
  hTex.needsUpdate = true;
  // hi-res normal / AO map
  const mult = quality === 'low' ? 1 : 2;
  const nrmRes = Math.min(renderer.capabilities.maxTextureSize, 2048, (N - 1) * mult + 1);
  const nrmRT = buildNormalMap(renderer, hTex, N, hf.step, nrmRes);
  // control maps
  const { ctl, ctl2 } = buildCtl(built);
  const mk = (data: Uint8Array<ArrayBuffer>) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  const ctlTex = mk(ctl), ctl2Tex = mk(ctl2);
  // roads
  const ppm = quality === 'ultra' ? 2 : quality === 'high' ? 1.5 : 1;
  const canvas = drawRoadCanvas(built, ppm);
  const roadTex = new THREE.CanvasTexture(canvas);
  roadTex.wrapS = roadTex.wrapT = THREE.ClampToEdgeWrapping;
  roadTex.magFilter = THREE.LinearFilter; roadTex.minFilter = THREE.LinearMipmapLinearFilter; roadTex.generateMipmaps = true;
  roadTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  roadTex.colorSpace = THREE.NoColorSpace;
  roadTex.needsUpdate = true;
  const macro = makeMacro();
  return {
    nrm: nrmRT.texture, nrmRes, ctl: ctlTex, ctl2: ctl2Tex, road: roadTex, height: hTex, macro, ctlData: ctl, res: N,
    dispose() { nrmRT.dispose(); ctlTex.dispose(); ctl2Tex.dispose(); roadTex.dispose(); hTex.dispose(); macro.dispose(); },
  };
}
