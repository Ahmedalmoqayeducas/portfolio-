import { Sim } from '../../src/sim/sim';
import { DEFAULT_OPTIONS, PlayerSetup, TEAM_COLORS } from '../../src/sim/types';
import { buildMap } from '../../src/maps/maps';
import { slotDef } from '../../src/sim/defs';

export function makeSim(opts: { map?: string; players?: Partial<PlayerSetup>[]; seed?: number; fog?: boolean; credits?: number; techStart?: boolean } = {}): Sim {
  const map = opts.map ?? 'red_mesa';
  const built = buildMap(map);
  const players: PlayerSetup[] = (opts.players ?? [{}, {}]).map((p, i) => ({
    slot: i, name: `P${i}`, faction: 'usa', general: 'usa_hale', color: TEAM_COLORS[i], teamLabel: 0, ai: null, ...p,
  }));
  const sim = new Sim({
    map, heights: built.hf.data, seed: opts.seed ?? 1, players,
    options: { ...DEFAULT_OPTIONS, fog: opts.fog ?? false, startCredits: opts.credits ?? 10000, techStart: opts.techStart ?? false, viewer: 0 },
  });
  sim.emitEvents = false;
  return sim;
}

export function run(sim: Sim, seconds: number): void {
  const n = Math.round(seconds * 30);
  for (let i = 0; i < n; i++) sim.step();
}

export { slotDef };
