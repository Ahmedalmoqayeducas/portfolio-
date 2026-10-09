import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { makeSim } from './helpers';
import { factionGenerals } from '../../src/sim/defs';
import type { FactionId } from '../../src/sim/types';

// BALANCE=1 npx vitest run tests/sim/balance.test.ts   -> /tmp/balance.log
const run = process.env.BALANCE ? it : it.skip;

run('faction win rates (AI vs AI, 1v1, balanced personality, hard)', () => {
  const facs: FactionId[] = ['usa', 'china', 'iran'];
  const seeds = Number(process.env.SEEDS ?? 4);
  const minutes = Number(process.env.MINUTES ?? 16);
  writeFileSync('/tmp/balance.log', '');
  const score: Record<string, number> = { usa: 0, china: 0, iran: 0 };
  const played: Record<string, number> = { usa: 0, china: 0, iran: 0 };
  const note = (s: string) => appendFileSync('/tmp/balance.log', s + '\n');
  for (const a of facs) for (const b of facs) {
    if (a === b) continue;
    for (let s = 1; s <= seeds; s++) {
      const sim = makeSim({
        map: 'red_mesa', seed: s * 17, fog: true,
        players: [a, b].map((f, i) => ({ faction: f, general: factionGenerals(f)[(s + i) % 3].id, ai: { difficulty: 'hard', personality: 'balanced' } })),
      });
      for (let k = 0; k < minutes * 60 * 30 && !sim.ended; k++) sim.step();
      let winner = -1;
      if (sim.winner) winner = sim.winner[0];
      else {
        const val = sim.players.map((p) => sim.list.filter((e) => e.alive && e.owner === p.id).reduce((n, e) => n + e.def.cost, 0));
        winner = val[0] > val[1] * 1.15 ? 0 : val[1] > val[0] * 1.15 ? 1 : -1;
      }
      played[a]++; played[b]++;
      if (winner === 0) score[a] += 1; else if (winner === 1) score[b] += 1; else { score[a] += 0.5; score[b] += 0.5; }
      note(`${a}-vs-${b} seed${s}: ${winner < 0 ? 'draw' : [a, b][winner]} wins (t=${(sim.time / 60).toFixed(1)}m)`);
    }
  }
  note(`SUMMARY score/games  ${facs.map((f) => `${f}: ${score[f]}/${played[f]}`).join('   ')}`);
}, 3600000);
