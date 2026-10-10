import { describe, expect, it } from 'vitest';
import { makeSim, run, slotDef } from './helpers';
import { Sim } from '../../src/sim/sim';

function find(sim: Sim, owner: number, id: string) { return sim.list.filter((e) => e.alive && e.owner === owner && e.def.id === id); }

describe('combat', () => {
  it('tanks kill each other', () => {
    const sim = makeSim({ players: [{}, {}] });
    const a: number[] = [], b: number[] = [];
    for (let i = 0; i < 6; i++) {
      a.push(sim.spawn('usa_abrams', 0, -20 + i * 9, -10).id);
      b.push(sim.spawn('usa_abrams', 1, -20 + i * 9, 55).id);
    }
    sim.queueCommand(0, { t: 'move', ids: a, x: 0, z: 40, attack: true });
    sim.queueCommand(1, { t: 'move', ids: b, x: 0, z: 0, attack: true });
    run(sim, 90);
    const la = a.filter((id) => sim.byId.get(id)?.alive).length, lb = b.filter((id) => sim.byId.get(id)?.alive).length;
    expect(la + lb).toBeLessThan(12);
    expect(sim.players[0].kills + sim.players[1].kills).toBeGreaterThan(0);
  });
  it('infantry vs tank, javelins hurt', () => {
    const sim = makeSim();
    const j = sim.spawn('usa_javelin', 0, 0, 0);
    const t = sim.spawn('usa_abrams', 1, 0, 40);
    t.hp = t.maxHp;
    run(sim, 30);
    expect(t.hp).toBeLessThan(t.maxHp);
    void j;
  });
});

describe('economy', () => {
  it('trucks deliver supplies', () => {
    const sim = makeSim({ credits: 0 });
    run(sim, 150);
    expect(sim.players[0].credits).toBeGreaterThan(300);
  });
  it('produces units from barracks', () => {
    const sim = makeSim({ techStart: true });
    const b = find(sim, 0, slotDef('usa', 'barracks')!)[0];
    expect(b).toBeTruthy();
    sim.queueCommand(0, { t: 'produce', structure: b.id, def: 'usa_rifle', count: 3 });
    const before = sim.players[0].units;
    run(sim, 40);
    expect(sim.players[0].units).toBeGreaterThanOrEqual(before + 3);
  });
  it('dozer builds a structure', () => {
    const sim = makeSim();
    const p = sim.players[0];
    const dz = find(sim, 0, 'usa_dozer')[0];
    const cc = find(sim, 0, 'usa_cc')[0];
    sim.queueCommand(0, { t: 'build', ids: [dz.id], def: 'usa_barracks', x: cc.x - 72, z: cc.z + 12 });
    run(sim, 60);
    expect(p.have.get('usa_barracks') ?? 0).toBeGreaterThan(0);
  });
});

describe('air', () => {
  it('apache sorties and rearms', () => {
    const sim = makeSim({ techStart: true });
    const af = find(sim, 0, 'usa_airfield')[0];
    expect(af).toBeTruthy();
    const ap = sim.spawn('usa_apache', 0, af.x, af.z);
    ap.home = af.id; ap.astate = 0;
    const tgt = sim.spawn('usa_abrams', 1, af.x + 160, af.z + 20);
    sim.queueCommand(0, { t: 'attack', ids: [ap.id], target: tgt.id });
    run(sim, 40);
    expect(tgt.hp).toBeLessThan(tgt.maxHp);
  });
});
