import type { EntityDef } from './types';

/**
 * Veterancy skills. Every unit class gets its own skill ladder: as a unit earns experience (rookie -> veteran -> elite -> heroic)
 * these multipliers improve, so a veteran pilot dodges missiles, a veteran gunner is more accurate, and so on.
 * Pure data + helpers shared by the simulation and the UI.
 */
export type SkillClass = 'infantry' | 'armor' | 'artillery' | 'fighter' | 'bomber' | 'heli' | 'drone' | 'aa' | 'support';

export interface SkillSet {
  /** chance to defeat an incoming guided missile (aircraft only: flares / evasive manoeuvres) */
  evade: number;
  /** multiplier on the hit chance of unguided fire against this unit (aircraft only) */
  flak: number;
  /** multiplier on own weapon spread / miss chance (lower = more accurate) */
  aim: number;
  /** multiplier on damage taken */
  armor: number;
  /** hit points regained per second as a fraction of max hit points */
  regen: number;
  speed: number;
  range: number;
}

type Ladder = { [K in keyof SkillSet]: [number, number, number, number] };

const BASE: Ladder = {
  evade: [0, 0, 0, 0], flak: [1, 1, 1, 1], aim: [1, 1, 1, 1], armor: [1, 1, 1, 1], regen: [0, 0, 0, 0], speed: [1, 1, 1, 1], range: [1, 1, 1, 1],
};

const LADDERS: Record<SkillClass, Partial<Ladder>> = {
  infantry: { aim: [1, 0.88, 0.74, 0.6], armor: [1, 0.95, 0.88, 0.8], regen: [0, 0, 0.004, 0.009], speed: [1, 1, 1.04, 1.1], range: [1, 1, 1.05, 1.1] },
  armor: { aim: [1, 0.88, 0.75, 0.62], armor: [1, 0.95, 0.88, 0.8], regen: [0, 0, 0.01, 0.02], speed: [1, 1, 1.03, 1.06], range: [1, 1, 1.04, 1.08] },
  artillery: { aim: [1, 0.8, 0.62, 0.45], armor: [1, 1, 0.95, 0.9], speed: [1, 1, 1, 1.05], range: [1, 1, 1.05, 1.12] },
  fighter: { evade: [0, 0.15, 0.3, 0.5], flak: [1, 0.9, 0.78, 0.65], aim: [1, 0.9, 0.78, 0.65], armor: [1, 0.97, 0.92, 0.85], speed: [1, 1.03, 1.06, 1.1] },
  bomber: { evade: [0, 0.1, 0.22, 0.38], flak: [1, 0.92, 0.82, 0.7], aim: [1, 0.85, 0.7, 0.55], armor: [1, 0.95, 0.9, 0.85] },
  heli: { evade: [0, 0.12, 0.26, 0.42], flak: [1, 0.92, 0.82, 0.72], aim: [1, 0.9, 0.78, 0.65], armor: [1, 0.95, 0.88, 0.8], regen: [0, 0, 0.005, 0.01] },
  drone: { evade: [0, 0.1, 0.2, 0.32], flak: [1, 0.92, 0.84, 0.76], aim: [1, 0.9, 0.8, 0.7] },
  aa: { aim: [1, 0.88, 0.74, 0.6], range: [1, 1, 1.05, 1.1], armor: [1, 0.97, 0.92, 0.88] },
  support: { armor: [1, 0.95, 0.9, 0.85], speed: [1, 1.03, 1.06, 1.1] },
};

export const VET_NAMES = ['Rookie', 'Veteran', 'Elite', 'Heroic'] as const;

export function skillClass(d: EntityDef): SkillClass {
  if (d.layer === 'air') {
    switch (d.model.tpl) {
      case 'heli': return 'heli';
      case 'bomber': return 'bomber';
      case 'jet': return 'fighter';
      default: return 'drone';
    }
  }
  const r = d.roles;
  if (r.includes('infantry')) return 'infantry';
  if (r.includes('artillery') || r.includes('mlrs') || r.includes('missile')) return 'artillery';
  if (r.includes('aa')) return 'aa';
  if (r.includes('tank') || r.includes('ifv') || r.includes('scout') || r.includes('decoy')) return 'armor';
  return 'support';
}

export function skillsAt(cls: SkillClass, vet: number): SkillSet {
  const l = LADDERS[cls];
  const v = Math.max(0, Math.min(3, vet | 0));
  const g = (k: keyof SkillSet): number => (l[k] ?? BASE[k])[v];
  return { evade: g('evade'), flak: g('flak'), aim: g('aim'), armor: g('armor'), regen: g('regen'), speed: g('speed'), range: g('range') };
}

/** one line per level for the UI: what this class gains when it ranks up */
export function skillLines(cls: SkillClass): [string, string, string] {
  const pct = (x: number): string => Math.round(x * 100) + '%';
  const less = (x: number): string => Math.round((1 - x) * 100) + '%';
  const out: string[] = [];
  for (let v = 1; v <= 3; v++) {
    const a = skillsAt(cls, v), b = skillsAt(cls, v - 1);
    const parts: string[] = [];
    if (a.evade > b.evade) parts.push(`${v === 1 ? 'flares: ' : v === 2 ? 'evasive manoeuvres: ' : 'ace evasion: '}${pct(a.evade)} missile dodge`);
    if (a.flak < b.flak) parts.push(`${less(a.flak)} fewer flak hits`);
    if (a.aim < b.aim) parts.push(`${less(a.aim)} tighter aim`);
    if (a.armor < b.armor) parts.push(`${less(a.armor)} less damage taken`);
    if (a.regen > b.regen) parts.push(`self-repair ${(a.regen * 100).toFixed(1)}%/s`);
    if (a.speed > b.speed) parts.push(`+${Math.round((a.speed - 1) * 100)}% speed`);
    if (a.range > b.range) parts.push(`+${Math.round((a.range - 1) * 100)}% range`);
    out.push(parts.join(', ') || 'bonus damage and durability');
  }
  return [out[0], out[1], out[2]];
}
