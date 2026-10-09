import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { makeSim } from './helpers';
import { AI_PERSONALITIES } from '../../src/sim/ai/ai';
import { factionGenerals } from '../../src/sim/defs';
import type { FactionId } from '../../src/sim/types';

it('grand meridian perf trace', () => {
  const facs: FactionId[] = ['usa', 'china', 'iran', 'usa', 'china', 'iran', 'usa', 'china', 'iran', 'usa'];
  writeFileSync('/tmp/perf.log', '');
  const t0 = performance.now();
  const sim = makeSim({ map: 'grand_meridian', fog: true, players: facs.map((f, i) => ({ faction: f, general: factionGenerals(f)[0].id, ai: { difficulty: 'medium', personality: AI_PERSONALITIES[i % 6].id } })) });
  appendFileSync('/tmp/perf.log', `built in ${(performance.now() - t0).toFixed(0)}ms ents=${sim.list.length}\n`);
  let worst = 0, sum = 0, n = 0;
  for (let k = 1; k <= 30 * 60 * 6; k++) {
    sim.step();
    sum += sim.perf.tickMs; n++;
    if (sim.perf.tickMs > worst) worst = sim.perf.tickMs;
    if (k % 300 === 0) { appendFileSync('/tmp/perf.log', `t=${(k / 30).toFixed(0)}s ents=${sim.list.length} avg=${(sum / n).toFixed(2)} worst=${worst.toFixed(1)} paths=${sim.flow.computed}\n`); sum = n = 0; worst = 0; }
  }
}, 900000);
