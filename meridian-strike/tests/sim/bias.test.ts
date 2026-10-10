import { it } from 'vitest';
import { makeSim } from './helpers';
import { factionGenerals } from '../../src/sim/defs';

const run = process.env.BIAS ? it : it.skip;
run('spawn / order bias in usa mirror', () => {
  for (const sp of [[0, 1], [1, 0], [0, 2], [2, 0]]) {
    let w0 = 0;
    const N = 4;
    for (let s = 1; s <= N; s++) {
      const sim = makeSim({ map: 'red_mesa', seed: s * 31, players: [0, 1].map((i) => ({ faction: 'usa', general: factionGenerals('usa')[0].id, spawn: sp[i], ai: { difficulty: 'hard', personality: 'balanced' } })) as never });
      for (let k = 0; k < 14 * 60 * 30 && !sim.ended; k++) sim.step();
      const val = sim.players.map((p) => sim.list.filter((e) => e.alive && e.owner === p.id).reduce((n, e) => n + e.def.cost, 0));
      if (sim.winner ? sim.winner[0] === 0 : val[0] > val[1]) w0++;
    }
    console.log(`spawns p0=${sp[0]} p1=${sp[1]}: p0 wins ${w0}/${N}`);
  }
}, 3600000);
