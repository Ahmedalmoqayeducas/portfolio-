import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise2D, mulberry32 } from '../procgen/noise';

/**
 * Procedural vegetation / rock geometry factories. Every geometry carries
 *   position, normal, color (vertex colour, linear) and aSway (0 = rigid .. 1 = full wind sway)
 * and is authored with its origin at the ground and +Y up.
 */

type RGB = [number, number, number];
const V3 = THREE.Vector3;

export class Mesher {
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];
  s: number[] = [];
  i: number[] = [];

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: RGB, sway = 0): number {
    const k = this.p.length / 3;
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.s.push(sway);
    return k;
  }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.i.push(a, b, c, a, c, d); }

  /** tapered tube along a polyline; colour(t, k) with t along the path, k around [0,1) */
  tube(pts: THREE.Vector3[], radii: number[], sides: number, color: (t: number, k: number) => RGB, sway: (t: number) => number = () => 0, cap = false, ridge = 0): void {
    const rings: number[][] = [];
    const up = new V3(0, 1, 0);
    for (let r = 0; r < pts.length; r++) {
      const t = r / (pts.length - 1);
      const tan = new V3().subVectors(pts[Math.min(pts.length - 1, r + 1)], pts[Math.max(0, r - 1)]).normalize();
      let u = new V3().crossVectors(tan, Math.abs(tan.y) > 0.95 ? new V3(1, 0, 0) : up);
      u.normalize();
      const v = new V3().crossVectors(tan, u).normalize();
      u = new V3().crossVectors(v, tan).normalize();
      const ring: number[] = [];
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const cx = Math.cos(a), cz = Math.sin(a);
        const rr = radii[r] * (1 + ridge * Math.cos(a * 8));
        const nx = u.x * cx + v.x * cz, ny = u.y * cx + v.y * cz, nz = u.z * cx + v.z * cz;
        ring.push(this.vert(pts[r].x + nx * rr, pts[r].y + ny * rr, pts[r].z + nz * rr, nx, ny, nz, color(t, s / sides), sway(t)));
      }
      rings.push(ring);
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let s = 0; s < sides; s++) this.quad(rings[r][s], rings[r][s + 1], rings[r + 1][s + 1], rings[r + 1][s]);
    }
    if (cap) {
      const last = pts[pts.length - 1];
      const ctr = this.vert(last.x, last.y, last.z, 0, 1, 0, color(1, 0), sway(1));
      const ring = rings[rings.length - 1];
      for (let s = 0; s < sides; s++) this.tri(ring[s + 1], ring[s], ctr);
    }
  }

  /** displaced, anisotropic icosphere (smooth normals). colour(p, n, noise) per vertex. */
  blob(center: THREE.Vector3, radii: THREE.Vector3, detail: number, amp: number, seed: number, color: (p: THREE.Vector3, n: THREE.Vector3, k: number) => RGB, sway = 1, freq = 1.7): void {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    const nz = new Noise2D(seed);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const d = 1 + amp * (nz.noise(x * freq + y * 0.7 + 3, z * freq - y * 0.9) * 0.7 + nz.noise(x * freq * 2.3 + 9, z * freq * 2.3 + y * 2.1) * 0.3);
      pos.setXYZ(v, center.x + x * d * radii.x, center.y + y * d * radii.y, center.z + z * d * radii.z);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const base = this.p.length / 3;
    const p = new V3(), n = new V3();
    for (let v = 0; v < pos.count; v++) {
      p.set(pos.getX(v), pos.getY(v), pos.getZ(v));
      n.set(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
      const k = nz.noise(p.x * 3.1 + 17, p.z * 3.1 + p.y * 2.0);
      this.vert(p.x, p.y, p.z, n.x, n.y, n.z, color(p, n, k), sway);
    }
    const idx = g.index!;
    for (let k = 0; k < idx.count; k++) this.i.push(base + idx.getX(k));
    g.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const lin = (hex: number): RGB => { const c = new THREE.Color().set(hex); return [c.r, c.g, c.b]; };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ------------------------------------------------------------------------------------------------ trees

/** layered conifer, ~12 m. snow: 0..1 amount of snow on the boughs */
export function makeConifer(seed: number, lod: 0 | 1, snow = 0): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  const H = 11 + rnd() * 3;
  const trunkPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 5; i++) trunkPts.push(new V3((rnd() - 0.5) * 0.12 * i, (i / 5) * H * 0.92, (rnd() - 0.5) * 0.12 * i));
  m.tube(trunkPts, [0.5, 0.42, 0.34, 0.26, 0.17, 0.06], lod ? 5 : 7, (t, k) => mul(lin(0x4a3524), 0.8 + 0.4 * Math.sin(k * 40 + t * 9) * 0.5 + 0.2));
  const tiers = lod ? 4 : 8;
  const segs = lod ? 8 : 13;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y0 = 1.8 + f * (H - 3.6);
    const R = (2.7 * Math.pow(1 - f, 0.85) + 0.45) * (0.9 + rnd() * 0.2);
    const h = 2.6 - f * 0.9;
    const droop = 0.9 * (1 - f * 0.4);
    const apex = m.vert(0, y0 + h, 0, 0, 1, 0, mix(lin(0x16341c), lin(0x3d6a35), f * 0.8), 0.35 + f * 0.35);
    const ringTop: number[] = [], ringLow: number[] = [];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2 + rnd() * 0.25;
      const rr = R * (s % 2 ? 0.62 : 1.0) * (0.85 + rnd() * 0.3);
      const nx = Math.cos(a), nz = Math.sin(a);
      const sn = snow * clamp01(0.4 + 0.6 * f);
      const topCol = mix(mix(lin(0x1a3a20), lin(0x2f5a2c), rnd()), lin(0xe6eef6), sn * (0.55 + 0.4 * rnd()));
      ringTop.push(m.vert(nx * rr, y0 - droop * (s % 2 ? 0.5 : 1), nz * rr, nx * 0.55, 0.8, nz * 0.55, topCol, 0.5 + f * 0.5));
      ringLow.push(m.vert(nx * rr * 0.97, y0 - droop * (s % 2 ? 0.5 : 1) - 0.12, nz * rr * 0.97, nx * 0.5, -0.8, nz * 0.5, mul(lin(0x10261a), 0.7 + 0.5 * rnd()), 0.5 + f * 0.5));
    }
    const hub = m.vert(0, y0 - 0.15, 0, 0, -1, 0, lin(0x0d1f14), 0.2);
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      m.tri(apex, ringTop[s2], ringTop[s]);          // upper skirt
      m.tri(hub, ringLow[s], ringLow[s2]);           // underside
    }
  }
  return m.build();
}

/** broadleaf tree with clumped canopy, ~9 m */
export function makeBroadleaf(seed: number, lod: 0 | 1, tone = 0): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  const trunkH = 3.4 + rnd() * 1.2;
  const lean = (rnd() - 0.5) * 0.7;
  const pts = [0, 1, 2, 3, 4].map((i) => new V3(lean * (i / 4) ** 2 * 1.2, (i / 4) * trunkH, 0));
  m.tube(pts, [0.46, 0.38, 0.3, 0.24, 0.18], lod ? 5 : 8, (t, k) => mul(lin(0x5a4331), 0.75 + 0.5 * Math.abs(Math.sin(k * 25 + t * 6))));
  const palette: RGB[] = [lin(0x2f5a22), lin(0x3c6e2a), lin(0x4b8032), lin(0x5b8f3a), lin(0x6a8a30)];
  if (tone > 0.5) { palette[0] = lin(0x5a6a22); palette[1] = lin(0x6f7a2a); palette[2] = lin(0x8a8a30); palette[3] = lin(0x9a8a2e); palette[4] = lin(0x7a6a28); }
  const clumps = lod ? 3 : 7;
  const cy = trunkH + 1.7;
  for (let c = 0; c < clumps; c++) {
    const a = rnd() * Math.PI * 2, rr = c === 0 ? 0 : 1.2 + rnd() * 1.7;
    const center = new V3(lean * 1.2 + Math.cos(a) * rr, cy + (c === 0 ? 1.0 : (rnd() - 0.2) * 1.8), Math.sin(a) * rr);
    const rad = new V3(1.9 + rnd() * 1.0, 1.5 + rnd() * 0.7, 1.9 + rnd() * 1.0);
    const tint = palette[Math.floor(rnd() * palette.length)];
    m.blob(center, rad, lod ? 1 : 2, 0.34, seed * 13 + c, (p, n, k) => {
      const hgt = clamp01((p.y - (cy - 1.8)) / 4.6);
      const sun = clamp01(n.y * 0.5 + 0.55);
      const ao = clamp01(0.45 + 0.55 * hgt + 0.25 * n.y);
      const base = mix(mul(tint, 0.6), mul(tint, 1.35), sun * 0.7 + k * 0.15);
      return mul(base, ao * (0.92 + 0.16 * Math.sin(p.x * 5 + p.z * 7 + k * 6)));
    }, 1);
  }
  return m.build();
}

/** palm tree with a curved ringed trunk and drooping fronds, ~9 m */
export function makePalm(seed: number, lod: 0 | 1): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  const H = 8 + rnd() * 2.5;
  const bendA = rnd() * Math.PI * 2, bend = 0.9 + rnd() * 1.4;
  const nPts = 9;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < nPts; i++) {
    const t = i / (nPts - 1);
    pts.push(new V3(Math.cos(bendA) * bend * t * t, t * H, Math.sin(bendA) * bend * t * t));
  }
  const radii = pts.map((_, i) => 0.34 - 0.13 * (i / (nPts - 1)) + (i === 0 ? 0.12 : 0));
  m.tube(pts, radii, lod ? 5 : 8, (t, k) => mul(lin(0x7d6a4c), 0.7 + 0.35 * (0.5 + 0.5 * Math.sin(t * 80)) + 0.1 * Math.sin(k * 20)), (t) => t * 0.15, true, lod ? 0 : 0.04);
  const top = pts[nPts - 1];
  const fr = lod ? 7 : 11;
  const leafCol = (t: number, k: number): RGB => mix(mix(lin(0x1f4a14), lin(0x3f7a22), t), lin(0x9aa844), t * t * 0.3 * k);
  for (let f = 0; f < fr; f++) {
    const a = (f / fr) * Math.PI * 2 + rnd() * 0.3;
    const len = 3.4 + rnd() * 1.0;
    const pitch = 0.75 - rnd() * 0.35 - (f % 3 === 0 ? 0.5 : 0);
    const dirx = Math.cos(a), dirz = Math.sin(a);
    const seg = lod ? 5 : 9;
    const ribIdx: number[] = [];
    const ribPos: THREE.Vector3[] = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const out = len * t;
      const y = Math.sin(pitch) * len * t * 1.0 - 2.4 * t * t * len * 0.38;
      const p = new V3(top.x + dirx * out * Math.cos(pitch), top.y + 0.1 + y, top.z + dirz * out * Math.cos(pitch));
      ribPos.push(p);
      ribIdx.push(m.vert(p.x, p.y, p.z, 0, 1, 0, mix(lin(0x3a5a1a), lin(0x6a8a3a), t), 0.4 + t * 0.6));
    }
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = (s + 1) / seg;
      const p = ribPos[s], q = ribPos[s + 1];
      const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
      const sx = -dirz, sz = dirx; // sideways
      const w1 = (0.2 + 1.15 * Math.sin(Math.min(1, t * 1.15 + 0.1) * Math.PI * 0.85)) * (lod ? 1.0 : 1);
      const w2 = (0.2 + 1.15 * Math.sin(Math.min(1, t2 * 1.15 + 0.1) * Math.PI * 0.85)) * (t2 > 0.97 ? 0.15 : 1);
      const droopL = 0.55;
      for (const side of [-1, 1]) {
        const a1 = m.vert(p.x + sx * side * w1, p.y - droopL * w1 * 0.55, p.z + sz * side * w1, -sx * side * 0.35, 0.9, -sz * side * 0.35, leafCol(t, 0.5), 0.5 + t * 0.5);
        const a2 = m.vert(q.x + sx * side * w2, q.y - droopL * w2 * 0.55, q.z + sz * side * w2, -sx * side * 0.35, 0.9, -sz * side * 0.35, leafCol(t2, 0.8), 0.5 + t2 * 0.5);
        if (side > 0) { m.tri(ribIdx[s], ribIdx[s + 1], a2); m.tri(ribIdx[s], a2, a1); }
        else { m.tri(ribIdx[s], a2, ribIdx[s + 1]); m.tri(ribIdx[s], a1, a2); }
      }
      void dx; void dz; void dy;
    }
  }
  if (!lod) {
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2;
      m.blob(new V3(top.x + Math.cos(a) * 0.35, top.y - 0.3, top.z + Math.sin(a) * 0.35), new V3(0.2, 0.22, 0.2), 1, 0.1, seed + k, () => lin(0x6a4a24), 0.3);
    }
  }
  return m.build();
}

/** saguaro-style cactus */
export function makeCactus(seed: number, lod: 0 | 1): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  const H = 3.8 + rnd() * 2.2;
  const col = (t: number, k: number): RGB => mul(mix(lin(0x2b4a2a), lin(0x4a6a3a), 0.5 + 0.5 * Math.sin(k * Math.PI * 16)), 0.8 + 0.3 * t);
  const sides = lod ? 8 : 16;
  const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => new V3(0, (i / 6) * H, 0));
  m.tube(pts, [0.4, 0.45, 0.46, 0.44, 0.4, 0.3, 0.12], sides, col, (t) => t * 0.08, true, lod ? 0 : 0.08);
  const arms = 1 + Math.floor(rnd() * 3);
  for (let a = 0; a < arms; a++) {
    const ang = rnd() * Math.PI * 2;
    const y0 = H * (0.35 + rnd() * 0.3), reach = 0.9 + rnd() * 0.5, rise = 1.2 + rnd() * 1.5;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const ap = [
      new V3(dx * 0.3, y0, dz * 0.3), new V3(dx * (0.3 + reach * 0.6), y0 + 0.05, dz * (0.3 + reach * 0.6)),
      new V3(dx * (0.3 + reach), y0 + 0.4, dz * (0.3 + reach)), new V3(dx * (0.3 + reach), y0 + 0.4 + rise * 0.6, dz * (0.3 + reach)),
      new V3(dx * (0.3 + reach), y0 + 0.4 + rise, dz * (0.3 + reach)),
    ];
    m.tube(ap, [0.22, 0.22, 0.22, 0.2, 0.1], lod ? 6 : 12, col, (t) => 0.1 + t * 0.1, true, lod ? 0 : 0.08);
  }
  return m.build();
}

/** low dry bush / sage scrub, ~1.2 m */
export function makeShrub(seed: number, lod: 0 | 1, tone: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  const palettes: RGB[][] = [
    [lin(0x6a6a2c), lin(0x8a8a3a), lin(0x4f5a26)],
    [lin(0x7a6a34), lin(0x9a8a46), lin(0x6a5a2c)],
    [lin(0x3f5a28), lin(0x56773a), lin(0x2f4a22)],
  ];
  const pal = palettes[Math.min(2, Math.floor(tone * 3))];
  const n = lod ? 2 : 4;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = i === 0 ? 0 : 0.5 + rnd() * 0.4;
    m.blob(new V3(Math.cos(a) * r, 0.45 + rnd() * 0.3, Math.sin(a) * r), new V3(0.75 + rnd() * 0.4, 0.55 + rnd() * 0.3, 0.75 + rnd() * 0.4), lod ? 1 : 1, 0.45, seed * 7 + i, (p, nn, k) => {
      const base = mix(pal[1], pal[0], clamp01(0.5 + k));
      return mul(base, 0.55 + 0.6 * clamp01(nn.y * 0.5 + 0.55) + 0.2 * (p.y > 0.8 ? 1 : 0));
    }, 0.8, 2.4);
  }
  return m.build();
}

/** a tuft of grass blades (double sided, wind sway through aSway) */
export function makeGrass(seed: number, blades: number, height: number, tone: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const m = new Mesher();
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.28;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const lean = 0.12 + rnd() * 0.55, la = a + (rnd() - 0.5) * 1.2;
    const h = height * (0.55 + rnd() * 0.6);
    const w = 0.045 + rnd() * 0.05;
    const fa = rnd() * Math.PI * 2; // facing
    const fx = Math.cos(fa), fz = Math.sin(fa);
    const segs = 3;
    const left: number[] = [], right: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const off = lean * t * t * h;
      const px = bx + Math.cos(la) * off, pz = bz + Math.sin(la) * off, py = h * t * (1 - 0.15 * t);
      const ww = w * (1 - t * 0.92);
      const c = mix(mix(lin(0x2a3a14), lin(0x6a8a2a), t), lin(0x9aa040), tone * t * 0.7);
      const nx = -fz, nz = fx;
      left.push(m.vert(px - fx * ww, py, pz - fz * ww, nx * 0.4, 0.9, nz * 0.4, c, t));
      right.push(m.vert(px + fx * ww, py, pz + fz * ww, nx * 0.4, 0.9, nz * 0.4, c, t));
    }
    for (let s = 0; s < segs; s++) {
      m.quad(left[s], right[s], right[s + 1], left[s + 1]);
      m.quad(right[s], left[s], left[s + 1], right[s + 1]);
    }
  }
  return m.build();
}

// ------------------------------------------------------------------------------------------------ rocks

export interface RockPalette { a: number; b: number; c: number; dust: number }

/**
 * Noise displaced boulder: ridged noise gives crisp edges, normals are a blend of smooth and facet normals
 * ("faceted + smooth mix"), vertex colours follow strata bands with dusty tops and dark crevices.
 */
export function makeRock(seed: number, lod: 0 | 1, pal: RockPalette, kind: 'boulder' | 'slab' | 'shard' = 'boulder'): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const nz = new Noise2D(seed + 11);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, lod ? 1 : 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const sx = kind === 'slab' ? 1.5 : kind === 'shard' ? 0.7 : 1, sy = kind === 'slab' ? 0.55 : kind === 'shard' ? 1.5 : 0.8, sz = kind === 'slab' ? 1.1 : kind === 'shard' ? 0.8 : 0.95;
  const ca = new THREE.Color().set(pal.a), cb = new THREE.Color().set(pal.b), cc = new THREE.Color().set(pal.c), cd = new THREE.Color().set(pal.dust);
  const strata = 3 + rnd() * 4, tilt = (rnd() - 0.5) * 0.5;
  const colors = new Float32Array(pos.count * 3);
  const p = new V3();
  for (let v = 0; v < pos.count; v++) {
    p.set(pos.getX(v), pos.getY(v), pos.getZ(v));
    const big = nz.noise(p.x * 1.3 + 2, p.z * 1.3 + p.y * 0.8);
    const ridge = 1 - Math.abs(nz.noise(p.x * 2.6 + 7, p.z * 2.6 - p.y * 1.4));
    const fine = nz.noise(p.x * 6 + 1, p.z * 6 + p.y * 4);
    let d = 1 + big * 0.28 + (ridge * ridge - 0.5) * 0.3 + fine * 0.05;
    if (kind === 'shard') d *= 1 - 0.35 * Math.max(0, p.y);
    pos.setXYZ(v, p.x * d * sx, p.y * d * sy, p.z * d * sz);
    // strata colour
    const band = Math.sin((p.y + tilt * p.x) * strata * 2 + big * 3) * 0.5 + 0.5;
    const col = ca.clone().lerp(cb, band).lerp(cc, clamp01(0.5 - ridge * 0.9 + 0.5 * Math.max(0, -fine)));
    col.multiplyScalar(0.8 + 0.35 * (ridge - 0.3));
    col.lerp(cd, clamp01(p.y * 0.6 - 0.15) * 0.5 * (0.5 + 0.5 * Math.max(0, big)));
    colors[v * 3] = col.r; colors[v * 3 + 1] = col.g; colors[v * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  // blend smooth and facet normals
  const ng = g.toNonIndexed();
  const sm = ng.attributes.normal as THREE.BufferAttribute;
  const ps = ng.attributes.position as THREE.BufferAttribute;
  const a = new V3(), b = new V3(), c = new V3(), fn = new V3(), sn = new V3();
  for (let t = 0; t < ps.count; t += 3) {
    a.fromBufferAttribute(ps, t); b.fromBufferAttribute(ps, t + 1); c.fromBufferAttribute(ps, t + 2);
    fn.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    for (let k = 0; k < 3; k++) {
      sn.fromBufferAttribute(sm, t + k);
      sn.lerp(fn, 0.55).normalize();
      sm.setXYZ(t + k, sn.x, sn.y, sn.z);
    }
  }
  const sw = new Float32Array(ps.count);
  ng.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  g.dispose();
  // flat bottom: sink below ground a bit
  ng.translate(0, 0.1, 0);
  ng.computeBoundingSphere(); ng.computeBoundingBox();
  return ng;
}
