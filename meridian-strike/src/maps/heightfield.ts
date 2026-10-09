import { Noise2D } from '../procgen/noise';

export interface RoadDef {
  pts: [number, number][];
  width: number;
}
export interface PadDef {
  x: number;
  z: number;
  r: number;
}

export interface HeightSource {
  size: number;
  res: number;
  seed: number;
  raw: (x: number, z: number, n: Noise2D) => number;
  roads: RoadDef[];
  pads: PadDef[];
  waterLevel?: number | null;
  /** n-fold rotational symmetry of the raw terrain (fair spawns) */
  sym?: number;
}

/** Pure heightfield: shared by sim (nav, LOS, placement) and renderer. */
export class HeightField {
  readonly step: number;
  constructor(readonly size: number, readonly res: number, readonly data: Float32Array) {
    this.step = size / (res - 1);
  }

  heightAt(x: number, z: number): number {
    const N = this.res;
    const gx = Math.min(N - 1.001, Math.max(0, (x + this.size / 2) / this.step));
    const gz = Math.min(N - 1.001, Math.max(0, (z + this.size / 2) / this.step));
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = this.data;
    const a = h[j * N + i], b = h[j * N + i + 1], c = h[(j + 1) * N + i], d = h[(j + 1) * N + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  /** rise over run (0 flat, 1 = 45 degrees) */
  slopeAt(x: number, z: number, e = 2): number {
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Build the heightfield from a map's raw function, then stamp roads (gentle graded ramps that
 * guarantee connectivity) and flat pads (bases, depots) over it. Deterministic for a given source.
 */
export function generateHeights(src: HeightSource): { heights: Float32Array; roadMask: Uint8Array } {
  const N = src.res;
  const step = src.size / (N - 1);
  const half = src.size / 2;
  const noise = new Noise2D(src.seed);
  const raw = new Float32Array(N * N);
  const symN = src.sym ?? 1;
  const rawAt = (x: number, z: number): number => {
    if (symN <= 1) return src.raw(x, z, noise);
    const r = Math.hypot(x, z), ang = Math.atan2(z, x);
    let sw = 0, sh = 0;
    for (let k = 0; k < symN; k++) {
      const a = ang + (k * Math.PI * 2) / symN;
      const w = Math.max(1e-3, Math.cos(a)) ** 3;
      if (w < 2e-3 && sw > 0) continue;
      sh += w * src.raw(r * Math.cos(a), r * Math.sin(a), noise);
      sw += w;
    }
    return sh / sw;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) raw[j * N + i] = rawAt(i * step - half, j * step - half);

  const sampleRaw = (x: number, z: number) => {
    const gx = Math.min(N - 1.001, Math.max(0, (x + half) / step));
    const gz = Math.min(N - 1.001, Math.max(0, (z + half) / step));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    return (raw[j * N + i] * (1 - fx) + raw[j * N + i + 1] * fx) * (1 - fz) + (raw[(j + 1) * N + i] * (1 - fx) + raw[(j + 1) * N + i + 1] * fx) * fz;
  };

  const wsum = new Float32Array(N * N);
  const hsum = new Float32Array(N * N);
  const wmax = new Float32Array(N * N);
  const roadW = new Float32Array(N * N);

  const stamp = (cx: number, cz: number, core: number, fall: number, h: number, mask = false) => {
    const R = core + fall;
    const i0 = Math.max(0, Math.floor((cx - R + half) / step)), i1 = Math.min(N - 1, Math.ceil((cx + R + half) / step));
    const j0 = Math.max(0, Math.floor((cz - R + half) / step)), j1 = Math.min(N - 1, Math.ceil((cz + R + half) / step));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * step - half - cx, j * step - half - cz);
        if (d > R) continue;
        const w = d <= core ? 1 : 1 - smooth(core, R, d);
        const k = j * N + i;
        wsum[k] += w;
        hsum[k] += w * h;
        if (w > wmax[k]) wmax[k] = w;
        if (mask && w > roadW[k]) roadW[k] = w;
      }
    }
  };

  for (const road of src.roads) {
    // resample polyline every ~6 m
    const pts: [number, number][] = [];
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [x0, z0] = road.pts[s], [x1, z1] = road.pts[s + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.ceil(len / 6));
      for (let q = 0; q < n; q++) pts.push([x0 + ((x1 - x0) * q) / n, z0 + ((z1 - z0) * q) / n]);
    }
    pts.push(road.pts[road.pts.length - 1]);
    const base = pts.map(([x, z]) => sampleRaw(x, z));
    // low-pass the profile so the road is a smooth graded ramp, then clamp the gradient
    const win = 25;
    const prof = base.map((_, i) => {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - win); k <= Math.min(base.length - 1, i + win); k++) { s += base[k]; c++; }
      return s / c;
    });
    prof[0] = base[0];
    prof[prof.length - 1] = base[base.length - 1];
    const maxGrade = 0.28 * 6; // rise per 6 m sample
    for (let i = 1; i < prof.length; i++) prof[i] = Math.max(prof[i - 1] - maxGrade, Math.min(prof[i - 1] + maxGrade, prof[i]));
    for (let i = prof.length - 2; i >= 0; i--) prof[i] = Math.max(prof[i + 1] - maxGrade, Math.min(prof[i + 1] + maxGrade, prof[i]));
    for (let i = 0; i < pts.length; i++) stamp(pts[i][0], pts[i][1], road.width / 2, road.width, prof[i], true);
  }

  for (const pad of src.pads) {
    let s = 0;
    for (let a = 0; a < 8; a++) s += sampleRaw(pad.x + Math.cos(a) * pad.r * 0.5, pad.z + Math.sin(a) * pad.r * 0.5);
    s = (s + sampleRaw(pad.x, pad.z)) / 9;
    stamp(pad.x, pad.z, pad.r, pad.r * 0.8, s);
  }

  const out = new Float32Array(N * N);
  for (let k = 0; k < out.length; k++) {
    if (wsum[k] > 0) {
      const target = hsum[k] / wsum[k];
      const w = Math.min(1, wmax[k]);
      out[k] = raw[k] * (1 - w) + target * w;
    } else out[k] = raw[k];
  }
  const roadMask = new Uint8Array(N * N);
  for (let k = 0; k < roadMask.length; k++) roadMask[k] = Math.min(255, Math.round(roadW[k] * 255));
  return { heights: out, roadMask };
}
