import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers';

function report(sim: ReturnType<typeof makeSim>) {
  return sim.players.map((p) => `${p.setup.name}[${p.alive ? 'alive' : 'dead'}] cr=${Math.floor(p.credits)} u=${p.units} s=${p.structures} k=${p.kills} l=${p.losses} rank=${p.rank}`).join(' | ');
}

describe('AI soak', () => {
  it('2 AIs play red mesa for 12 minutes', () => {
    const sim = makeSim({
      players: [
        { name: 'A', ai: { difficulty: 'hard', personality: 'balanced' } },
        { name: 'B', ai: { difficulty: 'hard', personality: 'rusher' } },
      ],
      fog: true,
    });
    const t0 = performance.now();
    for (let m = 0; m < 12; m++) { run(sim, 60); console.log(`t=${m + 1}m`, report(sim), `ents=${sim.list.length} tickMs=${sim.perf.tickMs.toFixed(1)}`); if (sim.ended) break; }
    console.log('wall', ((performance.now() - t0) / 1000).toFixed(1), 's', 'winner', sim.winner);
    expect(sim.players[0].structures + sim.players[1].structures).toBeGreaterThan(3);
  }, 300000);
});
