import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers';
import { MAPS, buildMap } from '../../src/maps/maps';
import { DEFS } from '../../src/sim/defs';

describe('maps', () => {
  for (const m of MAPS) {
    it(`${m.id} generates and spawns are walkable`, () => {
      const t0 = performance.now();
      const b = buildMap(m.id);
      const dt = performance.now() - t0;
      expect(dt).toBeLessThan(8000);
      for (const [x, z] of m.spawns) {
        const h = b.hf.heightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
        if (m.waterLevel !== null) expect(h).toBeGreaterThan((m.waterLevel ?? 0) + 0.5);
        expect(b.hf.slopeAt(x, z)).toBeLessThan(0.3);
      }
    });
  }
});

describe('defs', () => {
  it('all references resolve', () => {
    for (const d of DEFS.values()) {
      for (const t of d.tech ?? []) expect(DEFS.has(t), `${d.id} tech ${t}`).toBe(true);
      for (const p of d.produces ?? []) expect(DEFS.has(p) || p.startsWith('up_'), `${d.id} produces ${p}`).toBe(true);
      for (const b of d.builds ?? []) expect(DEFS.has(b), `${d.id} builds ${b}`).toBe(true);
    }
  });
});

describe('movement', () => {
  it('units path to a goal', () => {
    const sim = makeSim();
    const p = sim.players[0];
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) ids.push(sim.spawn('usa_abrams', 0, p.spawn[0] + 40 + (i % 4) * 8, p.spawn[1] + 60 + Math.floor(i / 4) * 8).id);
    sim.queueCommand(0, { t: 'move', ids, x: 0, z: 0 });
    run(sim, 120);
    let arrived = 0;
    for (const id of ids) { const e = sim.byId.get(id)!; if (Math.hypot(e.x, e.z) < 40) arrived++; }
    expect(arrived).toBeGreaterThanOrEqual(10);
  });
});
