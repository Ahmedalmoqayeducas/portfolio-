import { describe, it, expect } from 'vitest';
import { DEF_LIST } from '../../src/sim/defs';
import { getModel } from '../../src/render/models';

describe('models', () => {
  it('builds every def model with finite geometry and reports cost', () => {
    const rows: string[] = [];
    let totalMs = 0, totalTris = 0;
    for (const def of DEF_LIST) {
      const t0 = performance.now();
      const m = getModel(def);
      const dt = performance.now() - t0;
      totalMs += dt;
      const geos = [m.body, m.turret, m.team, m.teamTurret, m.glow, m.rotor, m.rotor2].filter(Boolean) as import('three').BufferGeometry[];
      let tris = 0;
      for (const g of geos) {
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        for (const v of g.getAttribute('position').array as Float32Array) if (!Number.isFinite(v)) throw new Error(`NaN in ${def.id}`);
      }
      totalTris += tris;
      rows.push(`${def.id.padEnd(22)} ${dt.toFixed(0).padStart(5)} ms ${String(Math.round(tris)).padStart(7)} tris`);
      expect(tris).toBeGreaterThan(0);
    }
    console.log(rows.join('\n'));
    console.log(`total ${totalMs.toFixed(0)} ms, ${Math.round(totalTris)} tris over ${DEF_LIST.length} defs`);
  });
});
