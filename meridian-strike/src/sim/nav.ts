import { HeightField } from '../maps/heightfield';

export const INF = 1e9;

/** Coarse navigation grid + cached flow fields (Dijkstra integration fields from a goal cell). */
export class NavGrid {
  readonly cell: number;
  readonly w: number;
  readonly h: number;
  readonly half: number;
  readonly terrainBlock: Uint8Array;
  readonly blockers: Uint16Array;
  readonly nearCnt: Uint16Array;
  readonly baseCost: Uint8Array;
  version = 0;

  constructor(readonly hf: HeightField, waterLevel: number | null, cell = 4) {
    this.cell = cell;
    this.w = Math.floor(hf.size / cell);
    this.h = this.w;
    this.half = hf.size / 2;
    const n = this.w * this.h;
    this.terrainBlock = new Uint8Array(n);
    this.blockers = new Uint16Array(n);
    this.nearCnt = new Uint16Array(n);
    this.baseCost = new Uint8Array(n);
    const wl = waterLevel === null ? -1e9 : waterLevel - 0.9;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.cx(i), z = this.cz(j);
        const k = j * this.w + i;
        const margin = 14;
        if (Math.abs(x) > this.half - margin || Math.abs(z) > this.half - margin) { this.terrainBlock[k] = 1; continue; }
        const hh = hf.heightAt(x, z);
        if (hh < wl) { this.terrainBlock[k] = 1; continue; }
        const e = cell * 0.5;
        const dx = hf.heightAt(x + e, z) - hf.heightAt(x - e, z);
        const dz = hf.heightAt(x, z + e) - hf.heightAt(x, z - e);
        const slope = Math.hypot(dx, dz) / (2 * e);
        if (slope > 0.62) this.terrainBlock[k] = 1;
        else this.baseCost[k] = Math.min(20, Math.round(slope * 22));
      }
    }
    // inflate cost near blocked terrain so paths keep clearance
    for (let j = 1; j < this.h - 1; j++) {
      for (let i = 1; i < this.w - 1; i++) {
        const k = j * this.w + i;
        if (this.terrainBlock[k]) continue;
        let nb = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (this.terrainBlock[k + dj * this.w + di]) nb++;
        if (nb) this.nearCnt[k] += 1;
      }
    }
  }

  cx(i: number): number { return (i + 0.5) * this.cell - this.half; }
  cz(j: number): number { return (j + 0.5) * this.cell - this.half; }
  ci(x: number): number { return Math.floor((x + this.half) / this.cell); }

  idx(x: number, z: number): number {
    const i = this.ci(x), j = this.ci(z);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  blocked(k: number): boolean { return k < 0 || this.terrainBlock[k] !== 0 || this.blockers[k] !== 0; }
  blockedAt(x: number, z: number): boolean { return this.blocked(this.idx(x, z)); }
  terrainBlockedAt(x: number, z: number): boolean { const k = this.idx(x, z); return k < 0 || this.terrainBlock[k] !== 0; }

  /** Add (+1) / remove (-1) a structure footprint (centre x,z; width w, depth d in metres). */
  addBlock(x: number, z: number, fw: number, fd: number, delta: 1 | -1): void {
    const i0 = this.ci(x - fw / 2 + 0.01), i1 = this.ci(x + fw / 2 - 0.01);
    const j0 = this.ci(z - fd / 2 + 0.01), j1 = this.ci(z + fd / 2 - 0.01);
    for (let j = j0 - 1; j <= j1 + 1; j++) {
      for (let i = i0 - 1; i <= i1 + 1; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i;
        if (i >= i0 && i <= i1 && j >= j0 && j <= j1) this.blockers[k] += delta;
        else this.nearCnt[k] += delta;
      }
    }
    this.version++;
  }

  /** Are all cells of a rectangle terrain-walkable and free of blockers? */
  rectFree(x: number, z: number, fw: number, fd: number, pad = 0): boolean {
    const i0 = this.ci(x - fw / 2 - pad), i1 = this.ci(x + fw / 2 + pad);
    const j0 = this.ci(z - fd / 2 - pad), j1 = this.ci(z + fd / 2 + pad);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (this.blocked(j < 0 || i < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i)) return false;
    return true;
  }

  /** nearest unblocked cell centre to a world position (spiral search). */
  nearestFree(x: number, z: number, maxR = 40): [number, number] | null {
    const i0 = this.ci(x), j0 = this.ci(z);
    for (let r = 0; r <= maxR; r++) {
      let best = -1, bd = 1e18;
      for (let j = j0 - r; j <= j0 + r; j++) {
        for (let i = i0 - r; i <= i0 + r; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const k = j * this.w + i;
          if (this.blocked(k)) continue;
          const d = (this.cx(i) - x) ** 2 + (this.cz(j) - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
      if (best >= 0) return [this.cx(best % this.w), this.cz(Math.floor(best / this.w))];
    }
    return null;
  }

  /** Grid line of sight (no blocked cell between). */
  los(x0: number, z0: number, x1: number, z1: number): boolean {
    let i = this.ci(x0), j = this.ci(z0);
    const ie = this.ci(x1), je = this.ci(z1);
    const di = Math.abs(ie - i), dj = Math.abs(je - j);
    const si = i < ie ? 1 : -1, sj = j < je ? 1 : -1;
    let err = di - dj;
    for (let s = 0; s < 4000; s++) {
      if (this.blocked(i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i)) return false;
      if (i === ie && j === je) return true;
      const e2 = 2 * err;
      if (e2 > -dj) { err -= dj; i += si; }
      if (e2 < di) { err += di; j += sj; }
    }
    return true;
  }
}

// ---------------------------------------------------------------- binary heap (shared buffers)
let heapKey = new Float32Array(1 << 16);
let heapVal = new Int32Array(1 << 16);
let heapN = 0;
function heapReset(cap: number): void {
  if (heapKey.length < cap) { heapKey = new Float32Array(cap); heapVal = new Int32Array(cap); }
  heapN = 0;
}
function heapPush(k: number, v: number): void {
  if (heapN >= heapKey.length) {
    const nk = new Float32Array(heapKey.length * 2); nk.set(heapKey); heapKey = nk;
    const nv = new Int32Array(heapVal.length * 2); nv.set(heapVal); heapVal = nv;
  }
  let i = heapN++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapKey[p] <= k) break;
    heapKey[i] = heapKey[p]; heapVal[i] = heapVal[p];
    i = p;
  }
  heapKey[i] = k; heapVal[i] = v;
}
let popKey = 0;
function heapPop(): number {
  const topV = heapVal[0];
  popKey = heapKey[0];
  heapN--;
  if (heapN > 0) {
    const k = heapKey[heapN], v = heapVal[heapN];
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= heapN) break;
      if (c + 1 < heapN && heapKey[c + 1] < heapKey[c]) c++;
      if (heapKey[c] >= k) break;
      heapKey[i] = heapKey[c]; heapVal[i] = heapVal[c];
      i = c;
    }
    heapKey[i] = k; heapVal[i] = v;
  }
  return topV;
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DC = [10, 10, 10, 10, 14, 14, 14, 14];

export class FlowField {
  lastUsed = 0;
  constructor(readonly goal: number, readonly dist: Float32Array, readonly version: number, readonly stopCost: number) {}
}

export class FlowCache {
  private fields = new Map<number, FlowField>();
  computed = 0;
  constructor(private nav: NavGrid, private max = 40) {}

  /** Get (or build) a field towards goal world position. `from` helps bound the search. */
  get(gx: number, gz: number, tick: number, fromX?: number, fromZ?: number): FlowField | null {
    const nav = this.nav;
    let k = nav.idx(gx, gz);
    if (k < 0) return null;
    if (nav.blocked(k)) {
      const f = nav.nearestFree(gx, gz, 20);
      if (!f) return null;
      k = nav.idx(f[0], f[1]);
    }
    const hit = this.fields.get(k);
    const need = fromX === undefined ? 1e9 : (Math.hypot(fromX - gx, fromZ! - gz) / nav.cell) * 28 + 800;
    if (hit && nav.version - hit.version <= 8 && hit.stopCost >= Math.min(need, 1e8)) { hit.lastUsed = tick; return hit; }
    const field = this.build(k, need);
    field.lastUsed = tick;
    this.fields.set(k, field);
    if (this.fields.size > this.max) {
      let oldK = -1, oldT = 1e18;
      for (const [kk, f] of this.fields) if (f.lastUsed < oldT) { oldT = f.lastUsed; oldK = kk; }
      this.fields.delete(oldK);
    }
    return field;
  }

  private build(goal: number, stopCost: number): FlowField {
    const nav = this.nav;
    this.computed++;
    const n = nav.w * nav.h;
    const dist = new Float32Array(n).fill(INF);
    heapReset(n);
    dist[goal] = 0;
    heapPush(0, goal);
    const W = nav.w, H = nav.h;
    while (heapN > 0) {
      const c = heapPop();
      const d = popKey;
      if (d > dist[c]) continue;
      if (d > stopCost) break;
      const ci = c % W, cj = (c / W) | 0;
      for (let q = 0; q < 8; q++) {
        const ni = ci + DX[q], nj = cj + DZ[q];
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni;
        if (nav.terrainBlock[nk] || nav.blockers[nk]) continue;
        if (q >= 4) {
          // no corner cutting
          if (nav.blocked(cj * W + ni) || nav.blocked(nj * W + ci)) continue;
        }
        const nd = d + DC[q] + nav.baseCost[nk] + (nav.nearCnt[nk] ? 6 : 0);
        if (nd < dist[nk]) { dist[nk] = nd; heapPush(nd, nk); }
      }
    }
    return new FlowField(goal, dist, nav.version, stopCost);
  }

  /** Steering direction (unit vector) from world pos along the field; false when unreachable. */
  dir(f: FlowField, x: number, z: number, out: { x: number; z: number }): boolean {
    const nav = this.nav;
    const W = nav.w;
    const ci = nav.ci(x), cj = nav.ci(z);
    if (ci < 0 || cj < 0 || ci >= W || cj >= nav.h) return false;
    const k = cj * W + ci;
    const d0 = f.dist[k];
    let gx = 0, gz = 0;
    if (d0 >= INF) {
      // standing on an unreached / blocked cell: head to the best neighbour that has a value
      let best = INF, bq = -1;
      for (let q = 0; q < 8; q++) {
        const ni = ci + DX[q], nj = cj + DZ[q];
        if (ni < 0 || nj < 0 || ni >= W || nj >= nav.h) continue;
        const dd = f.dist[nj * W + ni];
        if (dd < best) { best = dd; bq = q; }
      }
      if (bq < 0) return false;
      out.x = DX[bq]; out.z = DZ[bq];
      const l = Math.hypot(out.x, out.z); out.x /= l; out.z /= l;
      return true;
    }
    for (let q = 0; q < 8; q++) {
      const ni = ci + DX[q], nj = cj + DZ[q];
      if (ni < 0 || nj < 0 || ni >= W || nj >= nav.h) continue;
      const nk = nj * W + ni;
      const dd = f.dist[nk];
      if (dd >= INF) continue;
      const gain = d0 - dd;
      if (gain <= 0) continue;
      const l = q >= 4 ? 1.414 : 1;
      gx += (DX[q] / l) * gain; gz += (DZ[q] / l) * gain;
    }
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) return false;
    out.x = gx / l; out.z = gz / l;
    return true;
  }
}
