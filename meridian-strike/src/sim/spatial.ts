import type { Entity } from './entity';

/** Uniform grid rebuilt every tick with a counting sort. Stores indices into the entity list. */
export class SpatialHash {
  readonly cs = 16;
  readonly w: number;
  readonly half: number;
  private start: Int32Array;
  private items = new Int32Array(1024);

  constructor(size: number) {
    this.half = size / 2;
    this.w = Math.ceil(size / this.cs) + 1;
    this.start = new Int32Array(this.w * this.w + 2);
  }

  private cellOf(x: number, z: number): number {
    const i = Math.min(this.w - 1, Math.max(0, Math.floor((x + this.half) / this.cs)));
    const j = Math.min(this.w - 1, Math.max(0, Math.floor((z + this.half) / this.cs)));
    return j * this.w + i;
  }

  rebuild(list: Entity[], n: number): void {
    const s = this.start;
    s.fill(0);
    if (this.items.length < n) this.items = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) { const e = list[i]; if (e.alive && !e.inside) s[this.cellOf(e.x, e.z) + 1]++; }
    for (let c = 1; c < s.length; c++) s[c] += s[c - 1];
    const fill = new Int32Array(s.length);
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e.alive || e.inside) continue;
      const c = this.cellOf(e.x, e.z);
      this.items[s[c] + fill[c]++] = i;
    }
  }

  /** Collect entities within radius r of (x,z) into out (cleared first). */
  query(list: Entity[], x: number, z: number, r: number, out: Entity[]): Entity[] {
    out.length = 0;
    const i0 = Math.max(0, Math.floor((x - r + this.half) / this.cs)), i1 = Math.min(this.w - 1, Math.floor((x + r + this.half) / this.cs));
    const j0 = Math.max(0, Math.floor((z - r + this.half) / this.cs)), j1 = Math.min(this.w - 1, Math.floor((z + r + this.half) / this.cs));
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * this.w + i;
        for (let p = this.start[c]; p < this.start[c + 1]; p++) {
          const e = list[this.items[p]];
          if (!e || !e.alive) continue;
          const dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out;
  }
}
