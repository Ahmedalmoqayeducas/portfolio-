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
  const wins: Record<string, number> = {}, games: Record<string, number> = {};
  const note = (s: string) => appendFileSync('/tmp/balance.log', s + '\n');
  for (const a of facs) for (const b of facs) {
    for (let s = 1; s <= seeds; s++) {
      const sim = makeSim({
        map: 'red_mesa', seed: s * 17, fog: true,
        players: [a, b].map((f, i) => ({ faction: f, general: factionGenerals(f)[(s + i) % 3].id, ai: { difficulty: 'hard', personality: 'balanced' } })),
      });
      for (let k = 0; k < minutes * 60 * 30 && !sim.ended; k++) sim.step();
      let winner = -1;
      if (sim.winner) winner = sim.winner[0];
      else { // time cap: compare value (structures + units cost)
        const val = sim.players.map((p) => sim.list.filter((e) => e.alive && e.owner === p.id).reduce((n, e) => n + e.def.cost, 0));
        winner = val[0] > val[1] * 1.15 ? 0 : val[1] > val[0] * 1.15 ? 1 : -1;
      }
      const key = `${a}-vs-${b}`;
      games[key] = (games[key] ?? 0) + 1;
      if (winner === 0) wins[key] = (wins[key] ?? 0) + 1;
      note(`${key} seed${s}: winner=${winner < 0 ? 'draw' : [a, b][winner]} t=${(sim.time / 60).toFixed(1)}m`);
    }
  }
  const rate = (f: FactionId) => {
    let w = 0, g = 0;
    for (const o of facs) {
      if (o === f) continue;
      w += wins[`${f}-vs-${o}`] ?? 0; g += games[`${f}-vs-${o}`] ?? 0;
      const rev = games[`${o}-vs-${f}`] ?? 0;
      g += rev; w += rev - (wins[`${o}-vs-${f}`] ?? 0);
    }
    return `${f}: ${w}/${g}`;
  };
  note(`SUMMARY (excluding draws counted as losses for the... first side) ${facs.map(rate).join('  ')}`);
}, 3600000);
