import { describe, expect, it } from 'vitest';
import { makeSim, run, slotDef } from './helpers';
import { DEF_INDEX, DEF_LIST } from '../../src/sim/defs';
import type { Sim } from '../../src/sim/sim';

const by = (sim: Sim, owner: number, id: string) => sim.list.filter((e) => e.alive && e.owner === owner && e.def.id === id);

describe('iran mechanics', () => {
  it('decoys are reported as the real unit to the enemy', () => {
    const sim = makeSim({ players: [{ faction: 'usa', general: 'usa_hale' }, { faction: 'iran', general: 'iran_rahimi' }], fog: false });
    const d = sim.spawn('iran_decoy_tank', 1, 0, 0);
    sim.step();
    const snap = sim.snapshot(1);
    const idx = DEF_INDEX.get('iran_karrar')!;
    let found = -1;
    for (let i = 0; i < snap.n; i++) if (snap.ents[i * 16] === d.id) found = snap.ents[i * 16 + 1];
    expect(found).toBe(idx);
  });

  it('TELs shoot and scoot, then hide', () => {
    const sim = makeSim({ players: [{ faction: 'iran', general: 'iran_rahimi' }, { faction: 'usa', general: 'usa_hale' }], fog: false });
    const tel = sim.spawn('iran_fajr', 0, 0, 0);
    sim.spawn('usa_abrams', 1, 0, 100);
    const x0 = tel.z;
    run(sim, 12);
    expect(Math.abs(tel.z - x0)).toBeGreaterThan(10);
  });

  it('minefield hurts vehicles', () => {
    const sim = makeSim({ players: [{ faction: 'iran', general: 'iran_sadeghi' }, { faction: 'usa', general: 'usa_hale' }], fog: false });
    const p = sim.players[0];
    p.cp = 5;
    sim.queueCommand(0, { t: 'unlock', power: 'iran_minefield' });
    sim.step();
    sim.queueCommand(0, { t: 'power', power: 'iran_minefield', x: 0, z: 0 });
    run(sim, 4);
    expect(sim.powerState.mines.length).toBeGreaterThan(5);
    const tank = sim.spawn('usa_abrams', 1, 0, 0);
    const hp = tank.hp;
    run(sim, 10);
    // the tank is stationary inside the field; move it around to trigger mines
    sim.queueCommand(1, { t: 'move', ids: [tank.id], x: 30, z: 30 });
    run(sim, 20);
    expect(tank.hp).toBeLessThan(hp);
  });

  it('tunnel network evacuates from any entrance', () => {
    const sim = makeSim({ players: [{ faction: 'iran', general: 'iran_rahimi' }, { faction: 'usa', general: 'usa_hale' }], fog: false });
    const a = sim.spawn('iran_tunnel', 0, 20, 0), b = sim.spawn('iran_tunnel', 0, -60, 0);
    const u = sim.spawn('iran_basij', 0, 10, 20);
    sim.queueCommand(0, { t: 'garrison', ids: [u.id], target: a.id });
    run(sim, 10);
    expect(u.inside).toBe(a.id);
    sim.queueCommand(0, { t: 'unload', id: b.id });
    run(sim, 1);
    expect(u.inside).toBe(0);
    expect(Math.hypot(u.x - b.x, u.z - b.z)).toBeLessThan(30);
  });

  it('Shahed swarm kamikazes a target', () => {
    const sim = makeSim({ players: [{ faction: 'iran', general: 'iran_karimi' }, { faction: 'usa', general: 'usa_hale' }], fog: false, techStart: false });
    const sh = sim.spawn('iran_shahed', 0, 0, 0);
    sh.astate = 2; sh.y = sim.groundY(0, 0) + 38;
    const t = sim.spawn('usa_stryker', 1, 100, 100);
    const hp = t.hp;
    sim.queueCommand(0, { t: 'attack', ids: [sh.id], target: t.id });
    run(sim, 20);
    expect(t.hp).toBeLessThan(hp);
    expect(sh.alive).toBe(false);
  });
});

describe('china mechanics', () => {
  it('mass production queues a batch', () => {
    const sim = makeSim({ players: [{ faction: 'china', general: 'china_lin' }, { faction: 'usa', general: 'usa_hale' }], fog: false, techStart: true });
    const b = by(sim, 0, 'china_barracks')[0];
    const before = sim.players[0].units;
    sim.queueCommand(0, { t: 'produce', structure: b.id, def: 'china_militia' });
    run(sim, 30);
    expect(sim.players[0].units - before).toBe(2);
  });
  it('swarm bonus activates with six units', () => {
    const sim = makeSim({ players: [{ faction: 'china', general: 'china_lin' }, { faction: 'usa', general: 'usa_hale' }], fog: false });
    const us: ReturnType<Sim['spawn']>[] = [];
    for (let i = 0; i < 8; i++) us.push(sim.spawn('china_ztz96', 0, i * 6, 0));
    run(sim, 2);
    expect(us.filter((u) => u.swarmed).length).toBeGreaterThan(5);
  });
  it('rush power spawns free tanks', () => {
    const sim = makeSim({ players: [{ faction: 'china', general: 'china_lin' }, { faction: 'usa', general: 'usa_hale' }], fog: false });
    sim.players[0].cp = 3;
    sim.queueCommand(0, { t: 'unlock', power: 'china_humanwave' });
    sim.step();
    const before = sim.players[0].units;
    sim.queueCommand(0, { t: 'power', power: 'china_humanwave', x: 0, z: 0 });
    run(sim, 6);
    expect(sim.players[0].units).toBeGreaterThanOrEqual(before + 12);
  });
});

describe('usa mechanics', () => {
  it('superweapon fires and wrecks the target area', () => {
    const sim = makeSim({ players: [{ faction: 'usa', general: 'usa_hale' }, { faction: 'china', general: 'china_lin' }], fog: false, techStart: true });
    const cc = by(sim, 1, 'china_cc')[0];
    const sw = sim.spawn('usa_darkeagle', 0, sim.players[0].spawn[0] - 90, sim.players[0].spawn[1] + 60);
    sw.superReady = true;
    sim.queueCommand(0, { t: 'power', power: 'usa_dark_eagle', x: cc.x, z: cc.z });
    const hp = cc.hp;
    run(sim, 14);
    expect(cc.alive ? cc.hp : 0).toBeLessThan(hp * 0.5);
  });
  it('captures a derrick and gets income', () => {
    const sim = makeSim({ credits: 0 });
    const d = sim.list.find((e) => e.def.id === 'n_derrick' && Math.hypot(e.x - sim.players[0].spawn[0], e.z - sim.players[0].spawn[1]) < 700)!;
    const u = sim.spawn('usa_rifle', 0, d.x + 10, d.z + 10);
    sim.queueCommand(0, { t: 'capture', ids: [u.id], target: d.id });
    run(sim, 14);
    expect(d.owner).toBe(0);
  });
  it('garrisoned infantry defend a civilian building', () => {
    const sim = makeSim({ map: 'harbor_line' });
    const c = sim.list.find((e) => e.def.id === 'civ_house')!;
    const u = sim.spawn('usa_rifle', 0, c.x + 12, c.z + 12);
    sim.queueCommand(0, { t: 'garrison', ids: [u.id], target: c.id });
    run(sim, 8);
    expect(u.inside).toBe(c.id);
    expect(c.owner).toBe(0);
    const enemy = sim.spawn('usa_rifle', 1, c.x + 24, c.z);
    const hp = enemy.hp;
    run(sim, 8);
    expect(enemy.hp).toBeLessThan(hp);
  });
  it('production respects tech and unique limits', () => {
    const sim = makeSim({ techStart: true });
    const dz = by(sim, 0, 'usa_dozer')[0];
    const cc = by(sim, 0, 'usa_cc')[0];
    sim.players[0].credits = 99999;
    sim.queueCommand(0, { t: 'build', ids: [dz.id], def: 'usa_darkeagle', x: cc.x - 70, z: cc.z + 10 });
    run(sim, 2);
    expect(by(sim, 0, 'usa_darkeagle').length).toBe(0); // needs strategic command
    void DEF_LIST;
  });
});

describe('structure helpers', () => {
  it('every faction has the standard slots', () => {
    for (const f of ['usa', 'china', 'iran'] as const) for (const s of ['cc', 'power', 'supply', 'barracks', 'factory', 'airfield', 'radar', 'tech', 'armory', 'aa', 'defense', 'bunker', 'super']) expect(slotDef(f, s), `${f}:${s}`).toBeTruthy();
  });
});
