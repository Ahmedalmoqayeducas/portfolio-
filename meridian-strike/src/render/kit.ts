import * as THREE from 'three';
import { mulberry32 } from '../procgen/noise';

/**
 * Hard-surface modelling kit. Everything is generated procedurally into one indexed, vertex-attributed geometry:
 *   position, normal, color (linear), uv = (camo, grime), aMat = (roughness, metalness, emissive, ao), aEx = (edgeWear, kind, limbX, limbZ)
 * Primitives: bevelled hexahedra (box / slab / taper with filleted-looking edges), lathe (revolved profiles), loft
 * (superellipse cross-sections along Z: fuselages, hulls, cabs), prism (extruded polygons with chamfers), sweep (pipes),
 * rods. Ambient occlusion is baked per vertex through a voxel grid (see bakeAO), and part material kinds drive the
 * unit shader (tracks, tyres, glass, concrete, walker limbs ...).
 */

export interface MatPreset { rough: number; metal: number; kind: number; emit?: number }

/** material kinds understood by the unit shader */
export const KIND = { generic: 0, track: 1, tyre: 2, glass: 3, concrete: 5, cloth: 6, emit: 7, legL: 8, legR: 9, armL: 10, armR: 11, skin: 12, asphalt: 13, sand: 14, foliage: 15, ribZ: 16, ribX: 17, tile: 18, brick: 19 } as const;

export const MAT = {
  paint: { rough: 0.52, metal: 0.05, kind: 0 } as MatPreset,
  metal: { rough: 0.36, metal: 0.88, kind: 0 } as MatPreset,
  steel: { rough: 0.5, metal: 0.8, kind: 0 } as MatPreset,
  dark: { rough: 0.62, metal: 0.45, kind: 0 } as MatPreset,
  rubber: { rough: 0.93, metal: 0, kind: 2 } as MatPreset,
  track: { rough: 0.66, metal: 0.5, kind: 1 } as MatPreset,
  glass: { rough: 0.06, metal: 0.0, kind: 3 } as MatPreset,
  concrete: { rough: 0.95, metal: 0, kind: 5 } as MatPreset,
  plaster: { rough: 0.92, metal: 0, kind: 5 } as MatPreset,
  cloth: { rough: 1, metal: 0, kind: 6 } as MatPreset,
  skin: { rough: 0.8, metal: 0, kind: 12 } as MatPreset,
  emit: { rough: 0.8, metal: 0, kind: 7, emit: 1 } as MatPreset,
  sand: { rough: 1, metal: 0, kind: 14 } as MatPreset,
  asphalt: { rough: 0.95, metal: 0, kind: 13 } as MatPreset,
  ribZ: { rough: 0.5, metal: 0.55, kind: 16 } as MatPreset,
  ribX: { rough: 0.5, metal: 0.55, kind: 17 } as MatPreset,
  tile: { rough: 0.75, metal: 0.0, kind: 18 } as MatPreset,
  brick: { rough: 0.95, metal: 0.0, kind: 19 } as MatPreset,
};

export interface PartOpts {
  rot?: [number, number, number];
  quat?: THREE.Quaternion;
  sx?: number; sy?: number; sz?: number;
  camo?: number;
  grime?: number;
  jitter?: number;
  /** fillet width for hexahedra / prisms (0 = hard edges) */
  bevel?: number;
  seg?: number;
  mat?: MatPreset;
  rough?: number; metal?: number; kind?: number; emit?: number;
  /** walker limb animation: kind (8..11) pivots around (x, hip/shoulder height, z) */
  limb?: { kind: number; x: number; z: number };
}

type V3 = [number, number, number];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mul(a: V3, s: number): V3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a: V3, b: V3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len(a: V3): number { return Math.hypot(a[0], a[1], a[2]); }
function norm(a: V3): V3 { const l = len(a); return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l]; }

const HEX_FACES = [[1, 3, 7, 5], [0, 2, 6, 4], [2, 3, 7, 6], [0, 1, 5, 4], [4, 5, 7, 6], [0, 1, 3, 2]];

export interface Station {
  z: number; x?: number; y?: number;
  w?: number; h?: number; wt?: number; wb?: number; ht?: number; hb?: number;
  /** superellipse exponent (2 = ellipse, 4+ = boxy) */
  n?: number;
  /** crease: duplicate this ring so normals do not blend across it */
  hard?: boolean;
}

export interface BuildOpts {
  /** other kits whose triangles occlude this one (offset = where their origin sits in this kit's space) */
  occluders?: { kit: Kit; x?: number; y?: number; z?: number }[];
  ao?: boolean;
  aoDist?: number;
}

export class Kit {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  mat: number[] = [];
  ex: number[] = [];
  idx: number[] = [];
  private rnd: () => number;
  private M = new THREE.Matrix4();
  private N = new THREE.Matrix3();
  private base = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private cr = 1; private cg = 1; private cb = 1;
  private pCamo = 0; private pGrime = 0.3; private pRough = 0.5; private pMetal = 0.05; private pEmit = 0; private pKind = 0;
  private pLx = 0; private pLz = 0;
  readonly camo: number; readonly grime: number; readonly bevelMax: number; readonly ground: boolean;
  /** max edge length of flat quads (0 = off); long faces are tessellated so per-vertex AO stays local */
  readonly tess: number;

  constructor(opt: { camo?: number; grime?: number; seed?: number; bevelMax?: number; ground?: boolean; tess?: number } = {}) {
    this.tess = opt.tess ?? 0;
    this.camo = opt.camo ?? 0;
    this.grime = opt.grime ?? 0.35;
    this.bevelMax = opt.bevelMax ?? 0.1;
    this.ground = opt.ground ?? true;
    this.rnd = mulberry32(((opt.seed ?? 1) * 7919 + 13) >>> 0);
  }

  // ------------------------------------------------------------------ transform groups
  /** Everything added inside `fn` is placed relative to (x,y,z) with optional YXZ euler rotation. */
  group(x: number, y: number, z: number, rot: V3 | null, fn: () => void, scale = 1): this {
    this.stack.push(this.base.clone());
    tmpE.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(scale, scale, scale));
    this.base.multiply(tmpM);
    fn();
    this.base.copy(this.stack.pop()!);
    return this;
  }

  /** mirror helper: calls fn(+1) and fn(-1) */
  mirror(fn: (s: number) => void): this { fn(1); fn(-1); return this; }

  // ------------------------------------------------------------------ part state
  private begin(x: number, y: number, z: number, color: number, o: PartOpts): void {
    if (o.quat) tmpQ.copy(o.quat);
    else { const r = o.rot; tmpE.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, 'YXZ'); tmpQ.setFromEuler(tmpE); }
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    this.M.multiplyMatrices(this.base, tmpM);
    this.N.getNormalMatrix(this.M);
    tmpC.setHex(color);
    const j = 1 + (this.rnd() - 0.5) * 2 * (o.jitter ?? 0.06);
    this.cr = tmpC.r * j; this.cg = tmpC.g * j; this.cb = tmpC.b * j;
    const m = o.mat;
    this.pCamo = o.camo ?? this.camo;
    this.pGrime = o.grime ?? this.grime;
    this.pRough = o.rough ?? m?.rough ?? 0.52;
    this.pMetal = o.metal ?? m?.metal ?? 0.05;
    this.pKind = o.kind ?? m?.kind ?? 0;
    this.pEmit = o.emit ?? m?.emit ?? 0;
    this.pLx = o.limb?.x ?? 0; this.pLz = o.limb?.z ?? 0;
    if (o.limb) this.pKind = o.limb.kind;
  }

  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, edge = 0): number {
    const e = this.M.elements;
    this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    const n = this.N.elements;
    const X = n[0] * nx + n[3] * ny + n[6] * nz, Y = n[1] * nx + n[4] * ny + n[7] * nz, Z = n[2] * nx + n[5] * ny + n[8] * nz;
    const l = Math.hypot(X, Y, Z) || 1;
    this.nor.push(X / l, Y / l, Z / l);
    this.col.push(this.cr, this.cg, this.cb);
    this.uv.push(this.pCamo, this.pGrime);
    this.mat.push(this.pRough, this.pMetal, this.pEmit, 1);
    this.ex.push(edge, this.pKind, this.pLx, this.pLz);
    return this.pos.length / 3 - 1;
  }

  /** triangle with winding auto-corrected to agree with the vertex normals */
  private tri(a: number, b: number, c: number): void {
    const p = this.pos, n = this.nor;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const ux = p[b * 3] - ax, uy = p[b * 3 + 1] - ay, uz = p[b * 3 + 2] - az;
    const vx = p[c * 3] - ax, vy = p[c * 3 + 1] - ay, vz = p[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz < 1e-14) return;
    const nx = n[a * 3] + n[b * 3] + n[c * 3], ny = n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1], nz = n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2];
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }

  private quad(a: number, b: number, c: number, d: number): void { this.tri(a, b, c); this.tri(a, c, d); }

  /** quad p0-p1-p2-p3 (cycle) with per-corner normals, optionally tessellated into a grid */
  private gridQuad(p0: V3, p1: V3, p2: V3, p3: V3, n0: V3, n1: V3, n2: V3, n3: V3, edge = 0): void {
    const t = this.tess;
    const nu = t > 0 ? Math.max(1, Math.ceil(Math.max(len(sub(p1, p0)), len(sub(p2, p3))) / t)) : 1;
    const nv = t > 0 ? Math.max(1, Math.ceil(Math.max(len(sub(p3, p0)), len(sub(p2, p1))) / t)) : 1;
    if (nu === 1 && nv === 1) {
      this.quad(this.v(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], edge), this.v(p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], edge), this.v(p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], edge), this.v(p3[0], p3[1], p3[2], n3[0], n3[1], n3[2], edge));
      return;
    }
    const lerp = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const ids: number[][] = [];
    for (let j = 0; j <= nv; j++) {
      const row: number[] = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, w = j / nv;
        const P = lerp(lerp(p0, p1, u), lerp(p3, p2, u), w);
        const N = norm(lerp(lerp(n0, n1, u), lerp(n3, n2, u), w));
        row.push(this.v(P[0], P[1], P[2], N[0], N[1], N[2], edge));
      }
      ids.push(row);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) this.quad(ids[j][i], ids[j][i + 1], ids[j + 1][i + 1], ids[j + 1][i]);
  }

  // ------------------------------------------------------------------ hexahedra
  /** generic 8-corner solid; corner i = (x?1:0) | (y?2:0) | (z?4:0). Bevel gives filleted-looking edges. */
  hex(c: V3[], color: number, o: PartOpts = {}, bevelReq = this.bevelMax): this {
    this.begin(0, 0, 0, color, o);
    const ctr: V3 = [0, 0, 0];
    for (const p of c) { ctr[0] += p[0] / 8; ctr[1] += p[1] / 8; ctr[2] += p[2] / 8; }
    const faces: { ids: number[]; p: V3[]; n: V3 }[] = [];
    for (const f of HEX_FACES) {
      let ids = f.slice();
      let p = ids.map((i) => c[i]);
      let n = cross(sub(p[1], p[0]), sub(p[3], p[0]));
      if (len(n) < 1e-9) n = cross(sub(p[1], p[0]), sub(p[2], p[0]));
      if (len(n) < 1e-9) { n = cross(sub(p[2], p[1]), sub(p[3], p[1])); }
      if (len(n) < 1e-9) continue;
      const fc = mul(add(add(p[0], p[1]), add(p[2], p[3])), 0.25);
      if (dot(n, sub(fc, ctr)) < 0) { ids = ids.reverse(); p = p.reverse(); n = mul(n, -1); }
      faces.push({ ids, p, n: norm(n) });
    }
    let minEdge = Infinity;
    for (const f of faces) for (let k = 0; k < 4; k++) minEdge = Math.min(minEdge, len(sub(f.p[(k + 1) % 4], f.p[k])));
    let b = o.bevel ?? bevelReq;
    b = Math.min(b, minEdge * 0.4);
    if (!(b > 0.004)) {
      for (const f of faces) this.gridQuad(f.p[0], f.p[1], f.p[2], f.p[3], f.n, f.n, f.n, f.n);
      return this;
    }
    // inset face vertices
    const inset = faces.map((f) => f.p.map((p, k) => {
      const e1 = norm(sub(f.p[(k + 3) % 4], p)), e2 = norm(sub(f.p[(k + 1) % 4], p));
      return add(p, mul(add(e1, e2), b));
    }));
    faces.forEach((f, fi) => {
      const q = inset[fi];
      this.gridQuad(q[0], q[1], q[2], q[3], f.n, f.n, f.n, f.n, 0);
    });
    // edge fillets
    for (let i = 0; i < faces.length; i++) for (let k = 0; k < 4; k++) {
      const ca = faces[i].ids[k], cb = faces[i].ids[(k + 1) % 4];
      for (let j = i + 1; j < faces.length; j++) {
        const ja = faces[j].ids.indexOf(ca), jb = faces[j].ids.indexOf(cb);
        if (ja < 0 || jb < 0) continue;
        const nA = faces[i].n, nB = faces[j].n;
        const A0 = inset[i][k], A1 = inset[i][(k + 1) % 4], B0 = inset[j][ja], B1 = inset[j][jb];
        const a0 = this.v(A0[0], A0[1], A0[2], nA[0], nA[1], nA[2], 1), a1 = this.v(A1[0], A1[1], A1[2], nA[0], nA[1], nA[2], 1);
        const b1 = this.v(B1[0], B1[1], B1[2], nB[0], nB[1], nB[2], 1), b0 = this.v(B0[0], B0[1], B0[2], nB[0], nB[1], nB[2], 1);
        this.quad(a0, a1, b1, b0);
      }
    }
    // corner patches
    for (let ci = 0; ci < 8; ci++) {
      const vs: number[] = [];
      for (let fi = 0; fi < faces.length; fi++) {
        const k = faces[fi].ids.indexOf(ci);
        if (k < 0) continue;
        const p = inset[fi][k], n = faces[fi].n;
        vs.push(this.v(p[0], p[1], p[2], n[0], n[1], n[2], 1));
      }
      if (vs.length === 3) this.tri(vs[0], vs[1], vs[2]);
    }
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const c: V3[] = [];
    for (let i = 0; i < 8; i++) c.push([(i & 1 ? hw : -hw), (i & 2 ? hh : -hh), (i & 4 ? hd : -hd)]);
    return this.placed(x, y, z, o, () => this.hex(c, color, { ...o, rot: undefined, quat: undefined, sx: undefined, sy: undefined, sz: undefined }, Math.min(this.bevelMax, Math.max(0.012, Math.min(w, h, d) * 0.14))));
  }

  /** box whose top front (+z) edge is dropped by `drop` (glacis plates, noses) */
  slab(w: number, h: number, d: number, drop: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const c: V3[] = [];
    for (let i = 0; i < 8; i++) c.push([(i & 1 ? hw : -hw), (i & 2 ? hh : -hh) - ((i & 2) && (i & 4) ? drop : 0), (i & 4 ? hd : -hd)]);
    return this.placed(x, y, z, o, () => this.hex(c, color, this.stripXf(o), Math.min(this.bevelMax, Math.max(0.012, Math.min(w, h, d) * 0.14))));
  }

  /** frustum-like box: width/depth at bottom (wb,db) and top (wt,dt); offz shifts the top along z (sloped sides) */
  taper(wb: number, wt: number, h: number, db: number, dt: number, x: number, y: number, z: number, color: number, o: PartOpts = {}, offz = 0): this {
    const hh = h / 2;
    const c: V3[] = [];
    for (let i = 0; i < 8; i++) {
      const top = (i & 2) !== 0;
      const w = top ? wt : wb, d = top ? dt : db;
      c.push([(i & 1 ? w : -w) / 2, top ? hh : -hh, (i & 4 ? d : -d) / 2 + (top ? offz : 0)]);
    }
    return this.placed(x, y, z, o, () => this.hex(c, color, this.stripXf(o), Math.min(this.bevelMax, Math.max(0.012, Math.min(wb, wt, h, db, dt) * 0.14))));
  }

  /** wedge / ramp: rectangular base w×d, height h at the back (-z) falling to hFront at the front (+z) */
  wedge(w: number, h: number, d: number, hFront: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    const hw = w / 2, hd = d / 2;
    const c: V3[] = [];
    for (let i = 0; i < 8; i++) c.push([(i & 1 ? hw : -hw), (i & 2) ? ((i & 4) ? hFront : h) : 0, (i & 4 ? hd : -hd)]);
    return this.placed(x, y, z, o, () => this.hex(c, color, this.stripXf(o), Math.min(this.bevelMax, Math.max(0.012, Math.min(w, h, d) * 0.12))));
  }

  /** arbitrary placed callback helper: applies pos + rot + scale as a nested group */
  private placed(x: number, y: number, z: number, o: PartOpts, fn: () => void): this {
    this.stack.push(this.base.clone());
    if (o.quat) tmpQ.copy(o.quat); else { const r = o.rot; tmpE.set(r?.[0] ?? 0, r?.[1] ?? 0, r?.[2] ?? 0, 'YXZ'); tmpQ.setFromEuler(tmpE); }
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    this.base.multiply(tmpM);
    fn();
    this.base.copy(this.stack.pop()!);
    return this;
  }

  private stripXf(o: PartOpts): PartOpts { return { ...o, rot: undefined, quat: undefined, sx: undefined, sy: undefined, sz: undefined }; }

  // ------------------------------------------------------------------ lathe
  /** Surface of revolution around Y. profile = [radius, y] from bottom to top. */
  lathe(profile: [number, number][], x: number, y: number, z: number, color: number, o: PartOpts = {}, creaseDeg = 58): this {
    this.begin(x, y, z, color, o);
    const seg = Math.max(5, o.seg ?? 16);
    const np = profile.length;
    const sn: [number, number][] = [];
    for (let i = 0; i < np - 1; i++) {
      const dr = profile[i + 1][0] - profile[i][0], dy = profile[i + 1][1] - profile[i][1];
      const l = Math.hypot(dr, dy) || 1;
      sn.push([dy / l, -dr / l]);
    }
    const cosC = Math.cos((creaseDeg * Math.PI) / 180);
    const ptN = (seg_: number, endIdx: number): [number, number] => {
      // normal at profile point endIdx for segment seg_
      const cur = sn[seg_];
      const other = endIdx === seg_ ? sn[seg_ - 1] : sn[seg_ + 1];
      if (!other) return cur;
      if (cur[0] * other[0] + cur[1] * other[1] < cosC) return cur;
      const nr = cur[0] + other[0], ny = cur[1] + other[1], l = Math.hypot(nr, ny) || 1;
      return [nr / l, ny / l];
    };
    for (let i = 0; i < np - 1; i++) {
      const a: number[] = [], b: number[] = [];
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      const n0 = ptN(i, i), n1 = ptN(i, i + 1);
      const isEdge = Math.abs(sn[i][1]) > 0.35 && Math.abs(sn[i][0]) > 0.35 ? 1 : 0;
      for (let j = 0; j <= seg; j++) {
        const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
        a.push(this.v(r0 * c, y0, r0 * s, n0[0] * c, n0[1], n0[0] * s, isEdge));
        b.push(this.v(r1 * c, y1, r1 * s, n1[0] * c, n1[1], n1[0] * s, isEdge));
      }
      for (let j = 0; j < seg; j++) {
        if (r0 > 1e-6) this.tri(a[j], a[j + 1], b[j + 1]);
        if (r1 > 1e-6) this.tri(a[j], b[j + 1], b[j]);
        else if (r0 > 1e-6) { /* pole at top: single triangle already added */ }
      }
    }
    return this;
  }

  /** cylinder along Y with optional rim chamfer */
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, o: PartOpts & { cap?: boolean } = {}): this {
    const hh = h / 2;
    const b = Math.min(o.bevel ?? Math.min(0.05, Math.min(rt, rb) * 0.12, h * 0.15), Math.min(rt, rb) * 0.5, hh * 0.9);
    const prof: [number, number][] = b > 0.004
      ? [[0, -hh], [Math.max(0, rb - b), -hh], [rb, -hh + b], [rt, hh - b], [Math.max(0, rt - b), hh], [0, hh]]
      : [[0, -hh], [rb, -hh], [rt, hh], [0, hh]];
    return this.lathe(prof, x, y, z, color, { ...o, seg: o.seg ?? (Math.max(rt, rb) > 1 ? 24 : 14) });
  }

  /** cylinder lying along Z (barrels, pipes); length along +z centred on (x,y,z) */
  pipe(r: number, length: number, x: number, y: number, z: number, color: number, o: PartOpts & { rb?: number } = {}): this {
    return this.cyl(r, o.rb ?? r, length, x, y, z, color, { ...o, rot: [Math.PI / 2, 0, 0] });
  }

  /** cylinder lying along X (axles, drums) */
  drum(r: number, length: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    return this.cyl(r, r, length, x, y, z, color, { ...o, rot: [0, 0, Math.PI / 2] });
  }

  sphere(r: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    const prof: [number, number][] = [];
    const n = o.seg ? Math.max(6, o.seg) : r > 1 ? 14 : 8;
    for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI; prof.push([Math.cos(a) * r, Math.sin(a) * r]); }
    prof[0][0] = 0; prof[n][0] = 0;
    return this.lathe(prof, x, y, z, color, { ...o, seg: (o.seg ?? (r > 1 ? 24 : 12)) }, 120);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    return this.lathe([[0, -h / 2], [r, -h / 2], [0, h / 2]], x, y, z, color, { ...o, seg: o.seg ?? 14 });
  }

  /** torus-like ring (tyre side-wall, collars): major radius R, minor r, axis Y */
  torus(R: number, r: number, x: number, y: number, z: number, color: number, o: PartOpts = {}): this {
    const prof: [number, number][] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; prof.push([R + Math.cos(a) * r, Math.sin(a) * r]); }
    return this.lathe(prof, x, y, z, color, { ...o, seg: o.seg ?? 20 }, 100);
  }

  /** cylinder between two points */
  rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, color: number, o: PartOpts & { rb?: number } = {}): this {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) return this;
    tmpQ.setFromUnitVectors(UP, new THREE.Vector3(dx / l, dy / l, dz / l));
    const q = tmpQ.clone();
    return this.cyl(r, o.rb ?? r, l, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, color, { ...o, quat: q, bevel: o.bevel ?? 0 });
  }

  // ------------------------------------------------------------------ loft
  /** Smooth skin through superellipse cross-sections along +Z. */
  loft(st: Station[], x: number, y: number, z: number, color: number, o: PartOpts & { capStart?: boolean; capEnd?: boolean } = {}): this {
    this.begin(x, y, z, color, o);
    const S = st.length;
    const seg = Math.max(8, o.seg ?? 20);
    const P: V3[][] = [];
    const C: V3[] = [];
    for (const s of st) {
      const n = s.n ?? 2.6;
      const ex = 2 / n;
      const wt = s.wt ?? s.w ?? 1, wb = s.wb ?? s.w ?? 1, ht = s.ht ?? s.h ?? 1, hb = s.hb ?? s.h ?? 1;
      const cx = s.x ?? 0, cy = s.y ?? 0;
      const ring: V3[] = [];
      for (let j = 0; j < seg; j++) {
        const th = (j / seg) * Math.PI * 2;
        const c = Math.cos(th), sn = Math.sin(th);
        const w = sn >= 0 ? wt : wb, h = sn >= 0 ? ht : hb;
        ring.push([cx + Math.sign(c) * Math.pow(Math.abs(c), ex) * w, cy + Math.sign(sn) * Math.pow(Math.abs(sn), ex) * h, s.z]);
      }
      P.push(ring);
      C.push([cx, cy, s.z]);
    }
    const ringNormals = (s: number, mode: 'smooth' | 'before' | 'after'): V3[] => {
      const out: V3[] = [];
      for (let j = 0; j < seg; j++) {
        const p = P[s][j];
        const tu = sub(P[s][(j + 1) % seg], P[s][(j + seg - 1) % seg]);
        let tv: V3;
        if (mode === 'before') tv = sub(P[s][j], P[s - 1][j]);
        else if (mode === 'after') tv = sub(P[s + 1][j], P[s][j]);
        else tv = sub(P[Math.min(S - 1, s + 1)][j], P[Math.max(0, s - 1)][j]);
        let n = cross(tu, tv);
        const out_ = sub(p, C[s]);
        if (len(n) < 1e-9) n = [0, 0, s < S / 2 ? -1 : 1];
        n = norm(n);
        if (dot(n, out_) < 0) n = mul(n, -1);
        if (len(out_) < 1e-7) n = [0, 0, s < S / 2 ? -1 : 1];
        out.push(n);
      }
      return out;
    };
    const rings: { before: number[]; after: number[] }[] = [];
    for (let s = 0; s < S; s++) {
      const hard = st[s].hard === true && s > 0 && s < S - 1;
      const mk = (mode: 'smooth' | 'before' | 'after'): number[] => {
        const nn = ringNormals(s, mode);
        const ids: number[] = [];
        for (let j = 0; j <= seg; j++) { const jj = j % seg; const p = P[s][jj]; ids.push(this.v(p[0], p[1], p[2], nn[jj][0], nn[jj][1], nn[jj][2], hard ? 1 : 0)); }
        return ids;
      };
      if (hard) rings.push({ before: mk('before'), after: mk('after') });
      else { const r = mk('smooth'); rings.push({ before: r, after: r }); }
    }
    for (let s = 0; s < S - 1; s++) {
      const a = rings[s].after, b = rings[s + 1].before;
      for (let j = 0; j < seg; j++) this.quad(a[j], a[j + 1], b[j + 1], b[j]);
    }
    const cap = (s: number, dir: number): void => {
      const c = C[s];
      const ids: number[] = [];
      for (let j = 0; j <= seg; j++) { const p = P[s][j % seg]; ids.push(this.v(p[0], p[1], p[2], 0, 0, dir, 1)); }
      const ci = this.v(c[0], c[1], c[2], 0, 0, dir, 0);
      for (let j = 0; j < seg; j++) this.tri(ci, ids[j], ids[j + 1]);
    };
    if (o.capStart) cap(0, -1);
    if (o.capEnd) cap(S - 1, 1);
    return this;
  }

  // ------------------------------------------------------------------ prism
  /** Extrude a polygon (XY plane) along Z centred on z; chamfered rim; vertex normals smoothed across gentle corners. */
  prism(poly: [number, number][], depth: number, x: number, y: number, z: number, color: number, o: PartOpts & { smooth?: number } = {}): this {
    this.begin(x, y, z, color, o);
    let pts = poly.map((p) => [p[0], p[1]] as [number, number]);
    let area = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) pts = pts.reverse();
    const n = pts.length;
    let minEdge = Infinity;
    const en: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      minEdge = Math.min(minEdge, l);
      en.push([dy / l, -dx / l]);
    }
    let bv = o.bevel ?? Math.min(this.bevelMax, depth * 0.15);
    bv = Math.min(bv, minEdge * 0.35, depth * 0.35);
    if (!(bv > 0.004)) bv = 0;
    const hd = depth / 2;
    const smoothCos = Math.cos(((o.smooth ?? 32) * Math.PI) / 180);
    // inset polygon
    const ins: [number, number][] = pts.map((p, i) => {
      if (bv === 0) return p;
      const n0 = en[(i + n - 1) % n], n1 = en[i];
      const k = bv / Math.max(0.35, 1 + n0[0] * n1[0] + n0[1] * n1[1]);
      return [p[0] - (n0[0] + n1[0]) * k, p[1] - (n0[1] + n1[1]) * k] as [number, number];
    });
    // caps
    const tris = THREE.ShapeUtils.triangulateShape(ins.map((p) => new THREE.Vector2(p[0], p[1])), []);
    const capF = ins.map((p) => this.v(p[0], p[1], hd, 0, 0, 1, 0));
    const capB = ins.map((p) => this.v(p[0], p[1], -hd, 0, 0, -1, 0));
    for (const t of tris) { this.tri(capF[t[0]], capF[t[1]], capF[t[2]]); this.tri(capB[t[0]], capB[t[1]], capB[t[2]]); }
    // sides
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const nPrev = en[(i + n - 1) % n], nCur = en[i], nNext = en[j];
      const sm0 = nPrev[0] * nCur[0] + nPrev[1] * nCur[1] > smoothCos;
      const sm1 = nNext[0] * nCur[0] + nNext[1] * nCur[1] > smoothCos;
      const m0: [number, number] = sm0 ? (() => { const a = nPrev[0] + nCur[0], b = nPrev[1] + nCur[1], l = Math.hypot(a, b) || 1; return [a / l, b / l] as [number, number]; })() : nCur;
      const m1: [number, number] = sm1 ? (() => { const a = nNext[0] + nCur[0], b = nNext[1] + nCur[1], l = Math.hypot(a, b) || 1; return [a / l, b / l] as [number, number]; })() : nCur;
      const zf = hd - bv, zb = -hd + bv;
      this.gridQuad([pts[i][0], pts[i][1], zf], [pts[j][0], pts[j][1], zf], [pts[j][0], pts[j][1], zb], [pts[i][0], pts[i][1], zb], [m0[0], m0[1], 0], [m1[0], m1[1], 0], [m1[0], m1[1], 0], [m0[0], m0[1], 0]);
      if (bv > 0) {
        // fillet strips cap -> side (front and back)
        const sf0 = this.v(pts[i][0], pts[i][1], zf, m0[0], m0[1], 0, 1), sf1 = this.v(pts[j][0], pts[j][1], zf, m1[0], m1[1], 0, 1);
        const cf0 = this.v(ins[i][0], ins[i][1], hd, 0, 0, 1, 1), cf1 = this.v(ins[j][0], ins[j][1], hd, 0, 0, 1, 1);
        this.quad(cf0, cf1, sf1, sf0);
        const sb0 = this.v(pts[i][0], pts[i][1], zb, m0[0], m0[1], 0, 1), sb1 = this.v(pts[j][0], pts[j][1], zb, m1[0], m1[1], 0, 1);
        const cb0 = this.v(ins[i][0], ins[i][1], -hd, 0, 0, -1, 1), cb1 = this.v(ins[j][0], ins[j][1], -hd, 0, 0, -1, 1);
        this.quad(cb0, cb1, sb1, sb0);
      }
    }
    return this;
  }

  /** prism whose polygon lies in the XZ plane (thin along Y): wings, decks, plates. Polygon given as [x,z]. */
  plate(poly: [number, number][], thick: number, x: number, y: number, z: number, color: number, o: PartOpts & { smooth?: number } = {}): this {
    return this.placed(x, y, z, o, () => this.prism(poly, thick, 0, 0, 0, color, { ...this.stripXf(o), rot: [Math.PI / 2, 0, 0], smooth: o.smooth, bevel: o.bevel ?? Math.min(thick * 0.4, this.bevelMax) }));
  }

  // ------------------------------------------------------------------ sweep (pipes, hoses, cables)
  sweep(path: V3[], r: number, color: number, o: PartOpts & { rEnd?: number; caps?: boolean } = {}): this {
    this.begin(0, 0, 0, color, o);
    const seg = Math.max(5, o.seg ?? 8);
    const n = path.length;
    if (n < 2) return this;
    const rings: number[][] = [];
    let prevN: V3 | null = null;
    for (let i = 0; i < n; i++) {
      const tg = norm(i === 0 ? sub(path[1], path[0]) : i === n - 1 ? sub(path[n - 1], path[n - 2]) : add(norm(sub(path[i], path[i - 1])), norm(sub(path[i + 1], path[i]))));
      let u: V3;
      if (prevN) { u = sub(prevN, mul(tg, dot(prevN, tg))); if (len(u) < 1e-6) u = cross(tg, [0, 1, 0]); }
      else { u = Math.abs(tg[1]) > 0.9 ? cross(tg, [1, 0, 0]) : cross(tg, [0, 1, 0]); }
      u = norm(u);
      const w = norm(cross(tg, u));
      prevN = u;
      const rr = r + ((o.rEnd ?? r) - r) * (i / (n - 1));
      const ids: number[] = [];
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const nn: V3 = [u[0] * c + w[0] * s, u[1] * c + w[1] * s, u[2] * c + w[2] * s];
        ids.push(this.v(path[i][0] + nn[0] * rr, path[i][1] + nn[1] * rr, path[i][2] + nn[2] * rr, nn[0], nn[1], nn[2], 0));
      }
      rings.push(ids);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) this.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]);
    if (o.caps !== false) {
      for (const [ri, dir] of [[0, -1], [n - 1, 1]] as [number, number][]) {
        const tg = norm(ri === 0 ? sub(path[1], path[0]) : sub(path[n - 1], path[n - 2]));
        const c = this.v(path[ri][0], path[ri][1], path[ri][2], tg[0] * dir * (ri === 0 ? -1 : 1), tg[1] * dir * (ri === 0 ? -1 : 1), tg[2] * dir * (ri === 0 ? -1 : 1) * 1);
        for (let j = 0; j < seg; j++) this.tri(c, rings[ri][j], rings[ri][j + 1]);
      }
    }
    return this;
  }

  // ------------------------------------------------------------------ build
  get vertexCount(): number { return this.pos.length / 3; }

  build(bo: BuildOpts = {}): THREE.BufferGeometry {
    if (!this.pos.length) this.box(0.01, 0.01, 0.01, 0, 0, 0, 0);
    const nv = this.pos.length / 3;
    if (bo.ao !== false) bakeAO(this, bo);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(this.mat), 4));
    g.setAttribute('aEx', new THREE.BufferAttribute(new Float32Array(this.ex), 4));
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------------- ambient occlusion bake
const AO_DIRS: V3[] = (() => {
  const out: V3[] = [];
  const N = 14, golden = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < N; k++) {
    const s2 = (k + 0.5) / N * 0.88;
    const sinT = Math.sqrt(s2), cosT = Math.sqrt(1 - s2);
    const ph = k * golden;
    out.push([Math.cos(ph) * sinT, cosT, Math.sin(ph) * sinT]); // y = along normal
  }
  return out;
})();

function bakeAO(kit: Kit, bo: BuildOpts): void {
  const nv = kit.pos.length / 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const own = kit.pos;
  const occ = (bo.occluders ?? []).map((o) => ({ kit: o.kit, ox: o.x ?? 0, oy: o.y ?? 0, oz: o.z ?? 0 }));
  const grow = (p: number[], ox: number, oy: number, oz: number) => {
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] + ox, y = p[i + 1] + oy, z = p[i + 2] + oz;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  };
  grow(own, 0, 0, 0);
  for (const o of occ) grow(o.kit.pos, o.ox, o.oy, o.oz);
  const dim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.5);
  const maxD = bo.aoDist ?? Math.min(4.2, Math.max(0.8, dim * 0.13));
  let cell = Math.min(0.5, Math.max(0.07, dim / 130));
  const pad = maxD + cell * 2;
  const ex = (a: number, b: number) => b - a + pad * 2;
  for (;;) {
    const cells = Math.ceil(ex(minX, maxX) / cell) * Math.ceil(ex(minY, maxY) / cell) * Math.ceil(ex(minZ, maxZ) / cell);
    if (cells <= 4_000_000) break;
    cell *= 1.25;
  }
  const gx = Math.ceil(ex(minX, maxX) / cell), gy = Math.ceil(ex(minY, maxY) / cell), gz = Math.ceil(ex(minZ, maxZ) / cell);
  const grid = new Uint8Array(gx * gy * gz);
  const ox0 = minX - pad, oy0 = minY - pad, oz0 = minZ - pad;
  const inv = 1 / cell;
  const mark = (x: number, y: number, z: number) => {
    const ix = ((x - ox0) * inv) | 0, iy = ((y - oy0) * inv) | 0, iz = ((z - oz0) * inv) | 0;
    if (ix >= 0 && iy >= 0 && iz >= 0 && ix < gx && iy < gy && iz < gz) grid[ix + gx * (iy + gy * iz)] = 1;
  };
  const raster = (p: number[], idx: number[], ox: number, oy: number, oz: number) => {
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ax = p[a] + ox, ay = p[a + 1] + oy, az = p[a + 2] + oz;
      const bx = p[b] + ox, by = p[b + 1] + oy, bz = p[b + 2] + oz;
      const cx = p[c] + ox, cy = p[c + 1] + oy, cz = p[c + 2] + oz;
      const lab = Math.hypot(bx - ax, by - ay, bz - az), lac = Math.hypot(cx - ax, cy - ay, cz - az), lbc = Math.hypot(cx - bx, cy - by, cz - bz);
      const nu = Math.min(400, Math.max(1, Math.ceil(Math.max(lab, lac, lbc) / (cell * 0.7))));
      for (let u = 0; u <= nu; u++) for (let v = 0; v <= nu - u; v++) {
        const fu = u / nu, fv = v / nu;
        mark(ax + (bx - ax) * fu + (cx - ax) * fv, ay + (by - ay) * fu + (cy - ay) * fv, az + (bz - az) * fu + (cz - az) * fv);
      }
    }
  };
  raster(kit.pos, kit.idx, 0, 0, 0);
  for (const o of occ) raster(o.kit.pos, o.kit.idx, o.ox, o.oy, o.oz);

  const step = cell * 0.85;
  const start = cell * 1.25;
  const steps = Math.max(2, Math.floor((maxD - start) / step));
  const nor = kit.nor;
  for (let i = 0; i < nv; i++) {
    const px = own[i * 3], py = own[i * 3 + 1], pz = own[i * 3 + 2];
    const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
    // tangent frame
    let tx: number, ty: number, tz: number;
    if (Math.abs(ny) < 0.9) { tx = -nz; ty = 0; tz = nx; } else { tx = 0; ty = nz; tz = -ny; }
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    let occl = 0;
    for (const d of AO_DIRS) {
      const dx = tx * d[0] + nx * d[1] + bx * d[2], dy = ty * d[0] + ny * d[1] + by * d[2], dz = tz * d[0] + nz * d[1] + bz * d[2];
      let hit = 0;
      for (let s = 0; s < steps; s++) {
        const t = start + s * step;
        const x = px + nx * cell * 0.4 + dx * t, y = py + ny * cell * 0.4 + dy * t, z = pz + nz * cell * 0.4 + dz * t;
        const ix = ((x - ox0) * inv) | 0, iy = ((y - oy0) * inv) | 0, iz = ((z - oz0) * inv) | 0;
        if (ix < 0 || iy < 0 || iz < 0 || ix >= gx || iy >= gy || iz >= gz) break;
        if (grid[ix + gx * (iy + gy * iz)]) { hit = 1 - (t / maxD) * 0.65; break; }
      }
      occl += hit;
    }
    let ao = 1 - (occl / AO_DIRS.length) * 1.05;
    ao = Math.max(0.18, Math.min(1, ao));
    ao = Math.pow(ao, 1.15);
    if (kit.ground) {
      const gh = Math.max(0, Math.min(1, py / 0.75));
      ao *= 0.5 + 0.5 * gh * gh * (3 - 2 * gh);
    }
    kit.mat[i * 4 + 3] = ao;
  }
}
