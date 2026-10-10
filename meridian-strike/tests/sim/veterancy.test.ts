import { describe, expect, it } from 'vitest';
import { makeSim, run } from './helpers';
import { skillClass, skillsAt, skillLines } from '../../src/sim/skills';
import { DEF_LIST } from '../../src/sim/defs';
import type { Sim } from '../../src/sim/sim';

/** Patriot launchers fire at a stationary fighter for a while; return the fraction of the fighter's HP that was lost. */
function aaDuel(vet: number, seed: number): { lost: number; dodged: number } {
  const sim: Sim = makeSim({ players: [{ faction: 'usa', general: 'usa_hale' }, { faction: 'china', general: 'china_wu' }], fog: false, seed });
  let dodged = 0;
  sim.emitEvents = true;
  for (let i = 0; i < 3; i++) sim.spawn('usa_patriot_l', 0, -10 + i * 8, 0);
  const jet = sim.spawn('china_j16', 1, 0, 90);
  jet.vet = vet;
  sim.recomputeStats(jet);
  const hp0 = jet.hp;
  for (let i = 0; i < 30 * 14 && jet.alive; i++) {
    jet.astate = 2; // hold it airborne on station (no flight logic needed)
    jet.x = 0; jet.z = 90; jet.y = 60;
    sim.step();
    for (const ev of sim.events) if (ev.k === 'flare') dodged++;
    sim.events.length = 0;
  }
  return { lost: jet.alive ? (hp0 - jet.hp) / hp0 : 1, dodged };
}

describe('veterancy skills', () => {
  it('every unit def maps to a skill class with monotonic ladders', () => {
    for (const d of DEF_LIST) {
      if (d.kind !== 'unit') continue;
      const cls = skillClass(d);
      let prev = skillsAt(cls, 0);
      for (let v = 1; v <= 3; v++) {
        const s = skillsAt(cls, v);
        expect(s.evade).toBeGreaterThanOrEqual(prev.evade);
        expect(s.aim).toBeLessThanOrEqual(prev.aim);
        expect(s.armor).toBeLessThanOrEqual(prev.armor);
        expect(s.flak).toBeLessThanOrEqual(prev.flak);
        prev = s;
      }
      expect(skillLines(cls)).toHaveLength(3);
    }
  });

  it('aircraft classes get missile evasion, ground classes do not', () => {
    const j16 = DEF_LIST.find((d) => d.id === 'china_j16')!;
    const abrams = DEF_LIST.find((d) => d.id === 'usa_abrams')!;
    expect(skillsAt(skillClass(j16), 3).evade).toBeGreaterThan(0.3);
    expect(skillsAt(skillClass(abrams), 3).evade).toBe(0);
  });

  it('a heroic pilot survives SAM fire much better than a rookie', () => {
    let rookie = 0, hero = 0, flares = 0;
    for (let s = 1; s <= 4; s++) {
      rookie += aaDuel(0, s).lost;
      const h = aaDuel(3, s);
      hero += h.lost; flares += h.dodged;
    }
    expect(flares).toBeGreaterThan(0);
    expect(hero).toBeLessThan(rookie);
  });

  it('promotion raises stats and emits an event', () => {
    const sim = makeSim({ fog: false });
    sim.emitEvents = true;
    const t = sim.spawn('usa_abrams', 0, 0, 0);
    const hp0 = t.maxHp;
    t.vet = 2;
    sim.recomputeStats(t);
    expect(t.maxHp).toBeGreaterThan(hp0);
    expect(t.aim).toBeLessThan(1);
    expect(t.regen).toBeGreaterThan(0);
    t.hp = t.maxHp * 0.5;
    run(sim, 5);
    expect(t.hp).toBeGreaterThan(t.maxHp * 0.5);
  });
});
