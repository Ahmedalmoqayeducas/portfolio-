import { it } from 'vitest';
import { makeSim } from './helpers';
import { factionGenerals } from '../../src/sim/defs';
import type { FactionId } from '../../src/sim/types';

const run = process.env.TRACE ? it : it.skip;
run('trace a matchup', () => {
  const [a, b] = (process.env.TRACE as string).split('-') as FactionId[];
  const sim = makeSim({ map: 'red_mesa', seed: 17, fog: true, players: [a, b].map((f, i) => ({ faction: f, general: factionGenerals(f)[i].id, ai: { difficulty: 'hard', personality: 'balanced' } })) });
  for (let m = 1; m <= 11; m++) {
    for (let k = 0; k < 60 * 30; k++) sim.step();
    const line = sim.players.map((p) => {
      const comp: Record<string, number> = {};
      for (const e of sim.list) if (e.alive && e.owner === p.id && e.def.kind === 'unit') comp[e.def.id.replace(/^[a-z]+_/, '')] = (comp[e.def.id.replace(/^[a-z]+_/, '')] ?? 0) + 1;
      return `${p.faction}: $${Math.floor(p.credits)} spent=${Math.floor(p.spent)} inc=${p.incomePerSec.toFixed(0)}/s s=${p.structures} k=${p.kills}/${p.losses} ${JSON.stringify(comp)}`;
    });
    console.log(`m${m}\n  ${line.join('\n  ')}`);
    if (sim.ended) break;
  }
});
