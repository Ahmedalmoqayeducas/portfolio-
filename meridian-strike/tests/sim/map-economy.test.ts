import { describe, it, expect } from 'vitest';
import { makeSim, run } from './helpers';
import { MAPS } from '../../src/maps/maps';

/** every player of every map must have a supply pile and a drop-off they can walk between, and idle trucks must earn money without orders */
describe('economy works on every map', () => {
  for (const m of MAPS) {
    it(`idle trucks earn money on ${m.id}`, () => {
      const sim = makeSim({ map: m.id, credits: 0 });
      run(sim, 240);
      expect(sim.players[0].credits).toBeGreaterThan(300);
    });
    it(`every spawn on ${m.id} can walk to at least one supply pile`, () => {
      const sim = makeSim({ map: m.id, credits: 0, players: Array.from({ length: m.maxPlayers }, () => ({})) });
      for (const p of sim.players) {
        const piles = sim.list.filter((e) => e.def.supply && Math.hypot(e.x - p.spawn[0], e.z - p.spawn[1]) < 160);
        expect(piles.some((d) => sim.nav.connected(p.spawn[0], p.spawn[1], d.x, d.z)), `player ${p.id} spawn ${p.spawn}`).toBe(true);
      }
    });
    it(`every supply pile and oil derrick on ${m.id} is reachable from some spawn`, () => {
      const sim = makeSim({ map: m.id, credits: 0 });
      const bad = sim.list.filter((e) => (e.def.supply || e.def.income) && !sim.players.some((p) => sim.nav.connected(p.spawn[0], p.spawn[1], e.x, e.z))).map((e) => `${e.def.id}@${e.x.toFixed(0)},${e.z.toFixed(0)}`);
      expect(bad).toEqual([]);
    });
  }
});
