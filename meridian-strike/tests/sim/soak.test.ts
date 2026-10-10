import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers';
import { AI_PERSONALITIES } from '../../src/sim/ai/ai';
import { factionGenerals } from '../../src/sim/defs';
import type { FactionId } from '../../src/sim/types';

function report(sim: ReturnType<typeof makeSim>) {
  return sim.players.map((p) => `${p.setup.faction.slice(0, 2)}:${p.setup.ai?.personality.slice(0, 3)}[${p.alive ? 'A' : 'x'}] $${Math.floor(p.credits)} u${p.units} s${p.structures} k${p.kills}/${p.losses} r${p.rank}`).join(' | ');
}

function game(map: string, facs: FactionId[], minutes: number, opts: { teams?: number[]; diff?: 'easy' | 'medium' | 'hard' | 'brutal'; seed?: number; fog?: boolean } = {}) {
  const sim = makeSim({
    map, seed: opts.seed ?? 3, fog: opts.fog ?? true,
    players: facs.map((f, i) => ({
      name: `P${i}`, faction: f, general: factionGenerals(f)[i % 3].id, teamLabel: opts.teams?.[i] ?? 0,
      ai: { difficulty: opts.diff ?? 'hard', personality: AI_PERSONALITIES[i % AI_PERSONALITIES.length].id },
    })),
  });
  const t0 = performance.now();
  let maxTick = 0;
  for (let m = 0; m < minutes; m++) {
    for (let k = 0; k < 60 * 30; k++) { sim.step(); if (sim.perf.tickMs > maxTick) maxTick = sim.perf.tickMs; }
    if (m % 3 === 2) console.log(`${map} t=${m + 1}m`, report(sim), `ents=${sim.list.length} proj=${sim.projectiles.length}`);
    if (sim.ended) break;
  }
  console.log(`${map} done wall=${((performance.now() - t0) / 1000).toFixed(1)}s maxTick=${maxTick.toFixed(1)}ms winner=${JSON.stringify(sim.winner)}`, report(sim));
  return sim;
}

describe('AI soak', () => {
  it('three factions free-for-all on red mesa', () => {
    const sim = game('red_mesa', ['usa', 'china', 'iran'], 14);
    expect(sim.players.reduce((n, p) => n + p.kills, 0)).toBeGreaterThan(0);
  }, 600000);
  it('four players, 2v2 on harbor line', () => {
    const sim = game('harbor_line', ['usa', 'iran', 'china', 'usa'], 12, { teams: [1, 2, 1, 2] });
    expect(sim.players.reduce((n, p) => n + p.kills, 0)).toBeGreaterThan(0);
  }, 600000);
});

describe('big maps', () => {
  it('ten players on grand meridian', () => {
    const facs: FactionId[] = ['usa', 'china', 'iran', 'usa', 'china', 'iran', 'usa', 'china', 'iran', 'usa'];
    const sim = game('grand_meridian', facs, 10, { diff: 'medium' });
    expect(sim.players.filter((p) => p.alive).length).toBeGreaterThan(0);
  }, 900000);
  it('eight players on highland pass in teams', () => {
    const facs: FactionId[] = ['usa', 'china', 'iran', 'usa', 'china', 'iran', 'usa', 'china'];
    const sim = game('highland_pass', facs, 10, { diff: 'hard', teams: [1, 1, 1, 1, 2, 2, 2, 2] });
    expect(sim.players.filter((p) => p.alive).length).toBeGreaterThan(0);
  }, 900000);
  it('six players oasis crown', () => {
    const facs: FactionId[] = ['iran', 'usa', 'china', 'iran', 'usa', 'china'];
    const sim = game('oasis_crown', facs, 10, { diff: 'hard' });
    expect(sim.players.filter((p) => p.alive).length).toBeGreaterThan(0);
  }, 900000);
});
