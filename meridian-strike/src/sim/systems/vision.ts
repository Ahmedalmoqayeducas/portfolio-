import type { Sim } from '../sim';

/** Per-team fog of war grid (8 m cells): 0 hidden, 1 explored, 2 visible. */
export class Vision {
  readonly cs = 8;
  readonly w: number;
  readonly half: number;
  readonly visible: Uint8Array[] = [];
  readonly explored: Uint8Array[] = [];
  reveals: { team: number; x: number; z: number; r: number; until: number }[] = [];

  constructor(size: number, readonly teams: number, readonly enabled: boolean) {
    this.half = size / 2;
    this.w = Math.ceil(size / this.cs);
    for (let t = 0; t < teams; t++) {
      this.visible.push(new Uint8Array(this.w * this.w));
      this.explored.push(new Uint8Array(this.w * this.w));
    }
  }

  private idx(x: number, z: number): number {
    const i = Math.floor((x + this.half) / this.cs), j = Math.floor((z + this.half) / this.cs);
    if (i < 0 || j < 0 || i >= this.w || j >= this.w) return -1;
    return j * this.w + i;
  }
  visibleAt(team: number, x: number, z: number): boolean {
    if (!this.enabled || team < 0) return true;
    const k = this.idx(x, z);
    return k >= 0 && this.visible[team][k] !== 0;
  }
  exploredAt(team: number, x: number, z: number): boolean {
    if (!this.enabled || team < 0) return true;
    const k = this.idx(x, z);
    return k >= 0 && this.explored[team][k] !== 0;
  }

  mark(team: number, x: number, z: number, r: number): void {
    const vis = this.visible[team];
    const w = this.w, cs = this.cs, half = this.half;
    const cj = Math.floor((z + half) / cs), ci = Math.floor((x + half) / cs);
    const rc = Math.ceil(r / cs);
    const r2 = (r / cs) * (r / cs);
    for (let dj = -rc; dj <= rc; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= w) continue;
      const span = Math.floor(Math.sqrt(Math.max(0, r2 - dj * dj)));
      const i0 = Math.max(0, ci - span), i1 = Math.min(w - 1, ci + span);
      const row = j * w;
      for (let i = i0; i <= i1; i++) vis[row + i] = 1;
    }
  }

  exportFor(team: number): Uint8Array {
    const out = new Uint8Array(this.w * this.w);
    const v = this.visible[team], e = this.explored[team];
    for (let k = 0; k < out.length; k++) out[k] = v[k] ? 2 : e[k] ? 1 : 0;
    return out;
  }
}

export function updateVision(sim: Sim): void {
  const vis = sim.vision;
  if (sim.tick % 3 !== 0) return;
  const list = sim.list;
  const all = (1 << vis.teams) - 1;
  if (!vis.enabled) {
    for (const e of list) e.visMask = all;
    return;
  }
  for (let t = 0; t < vis.teams; t++) vis.visible[t].fill(0);
  for (const e of list) {
    if (!e.alive || e.owner < 0 || e.inside) continue;
    let r = e.def.vision * e.visMul;
    if (e.def.kind === 'structure' && e.progress < 1) r *= 0.5;
    if (e.stun > 0 && e.def.kind === 'structure') r *= 0.4;
    if (e.def.layer === 'air') r *= 1.15;
    vis.mark(e.team, e.x, e.z, r);
    if (e.garrisoned.length) vis.mark(e.team, e.x, e.z, r + 15);
  }
  for (let i = vis.reveals.length - 1; i >= 0; i--) {
    const rv = vis.reveals[i];
    if (sim.tick > rv.until) { vis.reveals.splice(i, 1); continue; }
    vis.mark(rv.team, rv.x, rv.z, rv.r);
  }
  for (let t = 0; t < vis.teams; t++) {
    const v = vis.visible[t], ex = vis.explored[t];
    for (let k = 0; k < v.length; k++) if (v[k]) ex[k] = 1;
  }

  const buf = sim.tmp;
  for (const e of list) {
    if (!e.alive) continue;
    let mask = e.team >= 0 ? 1 << e.team : 0;
    const k = vis.exploredAt(0, e.x, e.z) ? 0 : 0; void k;
    const stealthed = !!e.def.stealth && (e.def.stealth.always || e.deployed) && e.reveal <= 0 && e.firing <= 0;
    let det = 0;
    if (stealthed) {
      const sx = e.def.stealth!.detect;
      sim.hash.query(list, e.x, e.z, Math.max(sx, 90), buf);
      for (const f of buf) {
        if (f.team < 0 || f.team === e.team) continue;
        const range = Math.max(sx, f.def.detector ?? 0);
        const dx = f.x - e.x, dz = f.z - e.z;
        if (dx * dx + dz * dz <= range * range) det |= 1 << f.team;
      }
    }
    const kcell = (() => { const i = Math.floor((e.x + vis.half) / vis.cs), j = Math.floor((e.z + vis.half) / vis.cs); return i < 0 || j < 0 || i >= vis.w || j >= vis.w ? -1 : j * vis.w + i; })();
    if (kcell >= 0) {
      for (let t = 0; t < vis.teams; t++) {
        if (t === e.team) continue;
        if (!vis.visible[t][kcell]) continue;
        if (stealthed && !(det & (1 << t))) continue;
        mask |= 1 << t;
      }
    }
    e.visMask = mask;
    e.seenMask |= mask;
  }
}
