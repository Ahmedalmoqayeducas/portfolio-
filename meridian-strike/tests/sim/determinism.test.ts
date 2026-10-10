import { expect, it } from 'vitest';
import { makeSim } from './helpers';
import { factionGenerals } from '../../src/sim/defs';
import type { Command, CommandLogEntry, FactionId } from '../../src/sim/types';
import type { Sim } from '../../src/sim/sim';

function hash(sim: Sim): string {
  let h = 0;
  for (const e of sim.list) h = (h * 31 + Math.round(e.x * 100) * 7 + Math.round(e.z * 100) * 13 + Math.round(e.hp) * 3 + e.id) | 0;
  return `${sim.list.length}:${h}:${sim.players.map((p) => Math.floor(p.credits)).join(',')}`;
}

function make(): Sim {
  const facs: FactionId[] = ['usa', 'china', 'iran'];
  return makeSim({ map: 'red_mesa', seed: 99, fog: true, players: facs.map((f, i) => ({ faction: f, general: factionGenerals(f)[0].id, ai: i === 0 ? null : { difficulty: 'hard', personality: 'balanced' } })) });
}

it('same seed + same command log = identical simulation (replays)', () => {
  const a = make();
  const log: CommandLogEntry[] = [];
  const cc = a.list.find((e) => e.owner === 0 && e.def.slot === 'cc')!;
  const dz = a.list.find((e) => e.owner === 0 && e.def.builds)!;
  const script: [number, Command][] = [
    [30, { t: 'build', ids: [dz.id], def: 'usa_barracks', x: cc.x - 72, z: cc.z + 12 }],
    [900, { t: 'produce', structure: cc.id, def: 'usa_dozer' }],
  ];
  for (let k = 1; k <= 30 * 60 * 5; k++) {
    for (const [t, cmd] of script) if (t === k) { log.push({ t: a.tick + 1, pid: 0, cmd }); a.queueCommand(0, cmd); }
    a.step();
  }
  const ha = hash(a);
  const b = make();
  let idx = 0;
  for (let k = 1; k <= 30 * 60 * 5; k++) {
    while (idx < log.length && log[idx].t <= b.tick + 1) { b.queueCommand(log[idx].pid, log[idx].cmd); idx++; }
    b.step();
  }
  expect(hash(b)).toBe(ha);
});
