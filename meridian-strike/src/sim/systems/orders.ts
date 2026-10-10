import type { Sim } from '../sim';
import { Entity, Order, order } from '../entity';
import { Command, DT, EntityDef, TICK_RATE, UpgradeDef } from '../types';
import { DEFS, POWERS, UPGRADES } from '../defs';
import { enqueue, cancelItem, completeStructure, sellStructure, canPlace, startConstruction } from './economy';
import { bestWeapon, engageRange } from './combat';
import { usePower, unlockPower } from './powers';
import { airOrderPush } from './air';

const TWO_PI = Math.PI * 2;
export function angDiff(a: number, b: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

// -------------------------------------------------------------------------------- commands
function ownedUnits(sim: Sim, pid: number, ids: number[]): Entity[] {
  const out: Entity[] = [];
  for (const id of ids) {
    const e = sim.byId.get(id);
    if (e && e.alive && e.owner === pid && e.def.kind === 'unit' && !e.inside) out.push(e);
  }
  return out;
}

export function formationSlots(cx: number, cz: number, n: number, spacing: number): [number, number][] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.3)));
  const slots: [number, number][] = [];
  const rows = Math.ceil(n / cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) slots.push([cx + (c - (cols - 1) / 2) * spacing, cz + (r - (rows - 1) / 2) * spacing]);
  }
  slots.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cz) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cz) ** 2));
  return slots.slice(0, n);
}

function issueMove(sim: Sim, units: Entity[], x: number, z: number, queue: boolean, amove: boolean): void {
  const ground = units.filter((u) => u.def.layer !== 'air');
  const air = units.filter((u) => u.def.layer === 'air');
  for (const a of air) airOrderPush(sim, a, queue, amove ? 'amove' : 'move', x, z, 0);
  if (!ground.length) return;
  let maxR = 0;
  for (const u of ground) maxR = Math.max(maxR, u.def.radius);
  const slots = formationSlots(x, z, ground.length, Math.max(4, maxR * 2.1 + 1));
  const sorted = [...ground].sort((a, b) => (a.x - x) ** 2 + (a.z - z) ** 2 - ((b.x - x) ** 2 + (b.z - z) ** 2));
  sorted.forEach((u, i) => {
    const o = order('move', slots[i][0], slots[i][1]);
    o.x2 = x; o.z2 = z; o.amove = amove;
    if (!queue) u.orders.length = 0;
    u.orders.push(o);
    if (u.def.deploy && u.deployed) u.deployed = false;
  });
}

export function applyCommand(sim: Sim, pid: number, cmd: Command): void {
  const player = sim.players[pid];
  if (!player || !player.alive) return;
  switch (cmd.t) {
    case 'move': {
      const units = ownedUnits(sim, pid, cmd.ids);
      issueMove(sim, units, cmd.x, cmd.z, !!cmd.queue, !!cmd.attack);
      break;
    }
    case 'patrol': {
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (u.def.layer === 'air') continue;
        const o = order('patrol', cmd.x, cmd.z); o.x2 = u.x; o.z2 = u.z; o.amove = true;
        u.orders.length = 0; u.orders.push(o);
      }
      break;
    }
    case 'attack': {
      const t = sim.byId.get(cmd.target);
      if (!t || !t.alive) return;
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.weapons?.length) continue;
        if (u.def.layer === 'air') { airOrderPush(sim, u, !!cmd.queue, 'attack', t.x, t.z, t.id); continue; }
        if (!cmd.queue) u.orders.length = 0;
        const o = order('attack', t.x, t.z, t.id);
        u.orders.push(o);
      }
      break;
    }
    case 'stop': {
      for (const u of ownedUnits(sim, pid, cmd.ids)) { u.orders.length = 0; u.target = 0; u.ax = u.x; u.az = u.z; if (u.def.layer === 'air') airOrderPush(sim, u, false, 'stop', u.x, u.z, 0); }
      break;
    }
    case 'scatter': {
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (u.def.layer === 'air') continue;
        const a = sim.rng() * TWO_PI;
        const o = order('move', u.x + Math.sin(a) * 18, u.z + Math.cos(a) * 18); o.x2 = o.x; o.z2 = o.z;
        u.orders.length = 0; u.orders.push(o);
      }
      break;
    }
    case 'stance': { for (const u of ownedUnits(sim, pid, cmd.ids)) u.stance = cmd.stance; break; }
    case 'deploy': {
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.deploy) continue;
        u.deployed = !u.deployed;
        if (u.deployed) u.orders.length = 0;
      }
      break;
    }
    case 'build': {
      const d = DEFS.get(cmd.def);
      if (!d || d.kind !== 'structure' || d.faction !== player.faction) return;
      const builders = ownedUnits(sim, pid, cmd.ids).filter((u) => u.def.builds?.includes(d.id));
      if (!builders.length) return;
      const why = canPlace(sim, pid, d, cmd.x, cmd.z);
      if (why) { sim.emit({ k: 'msg', text: why, owner: pid }); return; }
      const cost = sim.costOf(player, d);
      if (player.credits < cost) { sim.emit({ k: 'msg', text: 'Not enough funds', owner: pid }); return; }
      if (!sim.hasTech(player, d)) { sim.emit({ k: 'msg', text: 'Requires tech structures', owner: pid }); return; }
      if (d.unique && (player.have.get(d.id) ?? 0) + sim.structuresOf(pid, d.id).filter((s) => s.progress < 1).length >= 1) { sim.emit({ k: 'msg', text: 'Limit reached', owner: pid }); return; }
      const st = startConstruction(sim, player, d, cmd.x, cmd.z, cost);
      for (const b of builders) {
        if (!cmd.queue) b.orders.length = 0;
        b.orders.push(order('build', st.x, st.z, st.id));
      }
      break;
    }
    case 'produce': {
      const s = sim.byId.get(cmd.structure);
      if (!s || s.owner !== pid) return;
      for (let i = 0; i < (cmd.count ?? 1); i++) enqueue(sim, player, s, cmd.def);
      break;
    }
    case 'cancel': { const s = sim.byId.get(cmd.structure); if (s && s.owner === pid) cancelItem(sim, player, s, cmd.index); break; }
    case 'cancelBuild': {
      const s = sim.byId.get(cmd.id);
      if (s && s.owner === pid && s.progress < 1) { player.credits += Math.round(sim.costOf(player, s.def) * (1 - s.progress * 0.2)); sim.remove(s); }
      break;
    }
    case 'rally': {
      for (const id of cmd.structures) { const s = sim.byId.get(id); if (s && s.owner === pid && s.def.produces) s.rally = [cmd.x, cmd.z]; }
      break;
    }
    case 'capture': {
      const t = sim.byId.get(cmd.target);
      if (!t || !t.alive || t.def.kind !== 'structure' || t.team === player.team) return;
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.captures) continue;
        u.orders.length = 0; u.orders.push(order('capture', t.x, t.z, t.id));
      }
      break;
    }
    case 'garrison': {
      const t = sim.byId.get(cmd.target);
      if (!t || !t.alive || !t.def.garrison || (t.owner >= 0 && t.team !== player.team)) return;
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.canGarrison) continue;
        u.orders.length = 0; u.orders.push(order('garrison', t.x, t.z, t.id));
      }
      break;
    }
    case 'unload': {
      const s = sim.byId.get(cmd.id);
      if (!s || s.owner !== pid) return;
      if (s.def.tunnel) {
        // tunnel network: everything garrisoned in any of our tunnels emerges here
        for (const o of sim.list) if (o.alive && o !== s && o.owner === pid && o.def.tunnel) { s.garrisoned.push(...o.garrisoned); o.garrisoned = []; }
      }
      for (const gid of [...s.garrisoned]) {
        const g = sim.byId.get(gid);
        if (!g) continue;
        g.inside = 0;
        const a = sim.rng() * TWO_PI, r = s.def.radius + 6;
        g.x = s.x + Math.sin(a) * r; g.z = s.z + Math.cos(a) * r; g.y = sim.groundY(g.x, g.z);
      }
      s.garrisoned = [];
      break;
    }
    case 'repair': {
      const t = sim.byId.get(cmd.target);
      if (!t || !t.alive || t.team !== player.team || t.def.kind !== 'structure') return;
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.builds) continue;
        u.orders.length = 0;
        u.orders.push(order(t.progress < 1 ? 'build' : 'repair', t.x, t.z, t.id));
      }
      break;
    }
    case 'harvest': {
      const dep = sim.byId.get(cmd.target);
      if (!dep || !dep.def.supply) return;
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.cap) continue;
        u.orders.length = 0; const o = order('harvest', dep.x, dep.z, dep.id); u.orders.push(o);
      }
      break;
    }
    case 'cyber': {
      const t = sim.byId.get(cmd.target);
      if (!t || !t.alive) return;
      for (const u of ownedUnits(sim, pid, cmd.ids)) {
        if (!u.def.cyber) continue;
        u.orders.length = 0; u.orders.push(order('attack', t.x, t.z, t.id));
      }
      break;
    }
    case 'power': usePower(sim, player, cmd.power, cmd.x, cmd.z); break;
    case 'unlock': unlockPower(sim, player, cmd.power); break;
    case 'sell': { const s = sim.byId.get(cmd.id); if (s && s.owner === pid && s.def.kind === 'structure') sellStructure(sim, player, s); break; }
  }
}

// -------------------------------------------------------------------------------- movement
const dir = { x: 0, z: 0 };

export function terrainSpeedFactor(sim: Sim, e: Entity, hx: number, hz: number): number {
  const ahead = 6;
  const h1 = sim.groundY(e.x + hx * ahead, e.z + hz * ahead);
  const rise = (h1 - e.y) / ahead;
  return Math.max(0.5, Math.min(1.2, 1 - rise * 0.9));
}

/** Steers a ground unit toward (gx,gz). `fx,fz` is the flowfield goal (group target). Returns true when within stopR. */
export function moveToward(sim: Sim, e: Entity, gx: number, gz: number, stopR: number, fx = gx, fz = gz, quant = 24): boolean {
  const d = e.def;
  const dx = gx - e.x, dz = gz - e.z;
  const dist = Math.hypot(dx, dz);
  if (e.deployed && d.deploy === 'stealth' && dist > stopR) e.deployed = false;
  e.idleT = 0;
  if (dist <= stopR) { e.moving = false; e.speed *= 0.6; if (e.speed < 0.2) e.speed = 0; return true; }
  let tx = dx / dist, tz = dz / dist;
  const nav = sim.nav;
  const direct = dist < 90 && nav.los(e.x, e.z, gx, gz);
  if (!direct) {
    // snap the field goal to a coarse grid so many units heading to nearby goals share one field
    const qx = Math.round(fx / quant) * quant, qz = Math.round(fz / quant) * quant;
    let f = sim.flow.get(qx, qz, sim.tick, e.x, e.z);
    let ok = f ? sim.flow.dir(f, e.x, e.z, dir) : false;
    if (!ok && f) {
      f = sim.flow.get(qx, qz, sim.tick);
      ok = f ? sim.flow.dir(f, e.x, e.z, dir) : false;
    }
    if (ok) { tx = dir.x; tz = dir.z; }
  }
  const maxSpd = (d.speed ?? 4) * e.spdMul;
  let target = maxSpd * terrainSpeedFactor(sim, e, tx, tz);
  if (dist < stopR + 8) target *= 0.55;
  const des = Math.atan2(tx, tz);
  if (d.move === 'foot') {
    const diff = angDiff(e.heading, des);
    e.heading += Math.max(-10 * DT, Math.min(10 * DT, diff));
    // keep turret aligned with body when moving without a target
  } else {
    const diff = angDiff(e.heading, des);
    const turn = (d.turn ?? 2) * DT;
    e.heading += Math.max(-turn, Math.min(turn, diff));
    const a = Math.abs(diff);
    if (a > 1.1) target *= 0.12;
    else if (a > 0.5) target *= 0.55;
  }
  const accel = (d.accel ?? maxSpd * 1.6) * DT;
  e.speed += Math.max(-accel * 2, Math.min(accel, target - e.speed));
  const step = e.speed * DT;
  const mvx = d.move === 'foot' ? tx : Math.sin(e.heading);
  const mvz = d.move === 'foot' ? tz : Math.cos(e.heading);
  tryMove(sim, e, e.x + mvx * step, e.z + mvz * step);
  e.moving = true;
  // stuck detection
  if (sim.tick % 15 === 0) {
    const moved = Math.hypot(e.x - e.lastX, e.z - e.lastZ);
    if (moved < maxSpd * 0.25) e.stuck++; else e.stuck = 0;
    e.lastX = e.x; e.lastZ = e.z;
    if (e.stuck > 5 && dist < 40) { e.moving = false; return true; }
    if (e.stuck > 9) {
      const a = sim.rng() * TWO_PI;
      tryMove(sim, e, e.x + Math.sin(a) * 6, e.z + Math.cos(a) * 6);
      e.stuck = 3;
    }
  }
  return false;
}

export function tryMove(sim: Sim, e: Entity, nx: number, nz: number): boolean {
  const nav = sim.nav;
  const inside = nav.blockedAt(e.x, e.z);
  if (inside || !nav.blockedAt(nx, nz)) { e.x = nx; e.z = nz; e.y = sim.groundY(nx, nz); return true; }
  if (!nav.blockedAt(nx, e.z)) { e.x = nx; e.y = sim.groundY(e.x, e.z); e.speed *= 0.8; return true; }
  if (!nav.blockedAt(e.x, nz)) { e.z = nz; e.y = sim.groundY(e.x, e.z); e.speed *= 0.8; return true; }
  e.speed *= 0.3;
  return false;
}

/** Rotate hull toward a world point; returns true when aligned. */
export function faceTarget(e: Entity, tx: number, tz: number, tol = 0.14): boolean {
  const des = Math.atan2(tx - e.x, tz - e.z);
  const diff = angDiff(e.heading, des);
  if (e.def.move === 'foot') { e.heading += Math.max(-12 * DT, Math.min(12 * DT, diff)); return true; }
  const turn = (e.def.turn ?? 2) * DT;
  e.heading += Math.max(-turn, Math.min(turn, diff));
  return Math.abs(diff) < tol;
}

/** distance from point to a structure's footprint rectangle (0 inside) */
export function rectDist(st: Entity, x: number, z: number): number {
  const [fw, fd] = st.def.footprint ?? [st.def.radius * 2, st.def.radius * 2];
  const dx = Math.max(Math.abs(x - st.x) - fw / 2, 0), dz = Math.max(Math.abs(z - st.z) - fd / 2, 0);
  return Math.hypot(dx, dz);
}

/** walk toward a structure until within `reach` of its edge; returns true when there */
function approach(sim: Sim, e: Entity, st: Entity, reach: number): boolean {
  if (rectDist(st, e.x, e.z) <= reach + e.def.radius * 0.5) return true;
  moveToward(sim, e, st.x, st.z, 0.1, st.x, st.z, 16);
  return false;
}

function setHome(e: Entity): void { e.ax = e.x; e.az = e.z; }
function shift(e: Entity): void { e.orders.shift(); if (!e.orders.length) setHome(e); e.target = 0; }

export function stepUnit(sim: Sim, e: Entity): void {
  const d = e.def;
  if (e.firing > 0) e.firing--;
  if (e.reveal > 0) e.reveal--;
  if (e.apsCd > 0) e.apsCd--;
  if (e.stun > 0) { e.stun--; e.moving = false; e.speed = 0; return; }
  if (d.healAura && sim.tick % 30 === 0) healAura(sim, e);
  if (e.deployed && d.deploy === 'dig') { e.moving = false; e.speed = 0; return; }

  const o = e.orders[0];
  if (!o) { idle(sim, e); return; }
  switch (o.k) {
    case 'move': case 'patrol': {
      if (o.amove && e.target) {
        const t = sim.byId.get(e.target);
        if (t && t.alive) {
          const w = bestWeapon(e, t);
          if (w) {
            const r = engageRange(e, w);
            const dist = Math.hypot(t.x - e.x, t.z - e.z) - t.def.radius * 0.5;
            if (dist <= r) { e.moving = false; e.speed *= 0.7; if (d.weapons!.some((ww) => ww.fixed) && d.move !== 'foot') faceTarget(e, t.x, t.z); return; }
            if (d.speed && dist < r + 50) { moveToward(sim, e, t.x, t.z, r * 0.8); return; }
          }
        }
      }
      const arrive = Math.max(2.2, d.radius * 0.9);
      if (moveToward(sim, e, o.x, o.z, arrive, o.x2, o.z2)) {
        if (o.def === 'scoot' && d.deploy === 'stealth') e.deployed = true;
        if (o.k === 'patrol') { const nx = o.x2, nz = o.z2; o.x2 = o.x; o.z2 = o.z; o.x = nx; o.z = nz; } else shift(e);
      }
      break;
    }
    case 'attack': {
      const t = sim.byId.get(o.target);
      if (!t || !t.alive || t.inside) { shift(e); break; }
      const visible = t.team === e.team || e.team < 0 || (t.visMask & (1 << e.team)) !== 0 || !sim.vision.enabled;
      if (visible) { o.x = t.x; o.z = t.z; e.target = t.id; }
      else {
        if (moveToward(sim, e, o.x, o.z, 6)) shift(e);
        break;
      }
      const w = bestWeapon(e, t);
      if (!w) { shift(e); break; }
      const r = engageRange(e, w);
      const dist = Math.hypot(t.x - e.x, t.z - e.z) - t.def.radius * 0.5;
      if (dist <= r * 0.97 && dist >= (w.minRange ?? 0)) {
        e.moving = false; e.speed *= 0.6;
        if (d.move !== 'foot') { if (d.weapons!.some((ww) => ww.fixed) || !d.turret) faceTarget(e, t.x, t.z); }
        else e.heading = Math.atan2(t.x - e.x, t.z - e.z);
      } else if (dist < (w.minRange ?? 0)) {
        // too close for artillery: back off
        moveToward(sim, e, e.x + (e.x - t.x), e.z + (e.z - t.z), 2);
      } else moveToward(sim, e, t.x, t.z, Math.max(r * 0.8, 3));
      break;
    }
    case 'build': stepBuild(sim, e, o); break;
    case 'repair': {
      const t = sim.byId.get(o.target);
      if (!t || !t.alive || t.hp >= t.maxHp) { shift(e); break; }
      if (!approach(sim, e, t, 9)) break;
      e.moving = false; e.speed = 0; t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.03 * DT);
      break;
    }
    case 'harvest': stepHarvest(sim, e, o); break;
    case 'capture': {
      const t = sim.byId.get(o.target);
      if (!t || !t.alive || t.team === e.team) { shift(e); break; }
      if (t.garrisoned.length && t.owner !== -1) { shift(e); break; }
      if (!approach(sim, e, t, 6)) break;
      e.moving = false; e.speed = 0;
      if (t.capOwner !== e.owner) { t.capOwner = e.owner; t.capProg = 0; }
      t.capProg += DT / (t.def.income ? 7 : 12);
      t.buffT = sim.tick;
      if (t.capProg >= 1) {
        const old = sim.player(t.owner);
        if (old && !t.def.prop) { old.structures--; if (t.progress >= 1) old.have.set(t.def.id, Math.max(0, (old.have.get(t.def.id) ?? 1) - 1)); }
        t.owner = e.owner; t.team = e.team; t.capProg = 0; t.capOwner = -1;
        t.queue.length = 0;
        const np = sim.player(e.owner)!;
        np.structures++;
        if (t.progress >= 1) np.have.set(t.def.id, (np.have.get(t.def.id) ?? 0) + 1);
        sim.emit({ k: 'alert', type: 'capture', x: t.x, z: t.z, owner: e.owner, text: t.def.name });
        sim.recomputeStats(t);
        shift(e);
      }
      break;
    }
    case 'garrison': {
      const t = sim.byId.get(o.target);
      if (!t || !t.alive || !t.def.garrison || (t.owner >= 0 && t.team !== e.team) || t.garrisoned.length >= t.def.garrison) { shift(e); break; }
      if (!approach(sim, e, t, 6)) break;
      e.inside = t.id; t.garrisoned.push(e.id); e.moving = false; e.speed = 0;
      if (t.owner === -1) {
        t.owner = e.owner; t.team = e.team;
        const np = sim.player(e.owner)!;
        np.structures++;
        sim.recomputeStats(t);
      }
      shift(e);
      break;
    }
    default: shift(e);
  }
}

function idle(sim: Sim, e: Entity): void {
  const d = e.def;
  e.moving = false;
  e.speed *= 0.7;
  if (e.scootT && sim.tick >= e.scootT) {
    e.scootT = 0;
    const t = e.target ? sim.byId.get(e.target) : undefined;
    let ax = e.x - (t ? t.x : e.x + sim.rng() - 0.5), az = e.z - (t ? t.z : e.z + sim.rng() - 0.5);
    const l = Math.hypot(ax, az) || 1;
    ax /= l; az /= l;
    const dist = 55 + sim.rng() * 30;
    const f = sim.nav.nearestFree(e.x + ax * dist + (sim.rng() - 0.5) * 20, e.z + az * dist + (sim.rng() - 0.5) * 20, 8);
    if (f) { const o = order('move', f[0], f[1]); o.x2 = f[0]; o.z2 = f[1]; o.def = 'scoot'; e.orders.push(o); e.deployed = false; return; }
  }
  if (d.scoot && d.deploy === 'stealth' && !e.deployed && !e.target) { if (++e.idleT > 120) e.deployed = true; }
  if (d.cap && sim.tick % 20 === (e.id % 20)) { autoHarvest(sim, e); if (e.orders.length) return; }
  if (e.target) {
    const t = sim.byId.get(e.target);
    if (t && t.alive && !t.inside && d.speed && e.stance !== 'hold' && e.stance !== 'holdfire') {
      const w = bestWeapon(e, t);
      if (w) {
        const r = engageRange(e, w);
        const dist = Math.hypot(t.x - e.x, t.z - e.z) - t.def.radius * 0.5;
        const homeD = Math.hypot(e.x - e.ax, e.z - e.az);
        if (dist > r * 0.95) {
          const leash = e.stance === 'aggressive' ? 85 : 0;
          if (dist < r + (e.stance === 'aggressive' ? 40 : 6) && homeD < leash + 20) moveToward(sim, e, t.x, t.z, r * 0.85);
        } else if (dist < (w.minRange ?? 0)) {
          moveToward(sim, e, e.x + (e.x - t.x), e.z + (e.z - t.z), 2);
        } else if (d.move !== 'foot' && (d.weapons!.some((ww) => ww.fixed) || !d.turret)) {
          faceTarget(e, t.x, t.z);
        } else if (d.move === 'foot') e.heading = Math.atan2(t.x - e.x, t.z - e.z);
        return;
      }
    }
  }
  // return to post after chasing
  if (e.stance !== 'hold' && d.speed && !e.target && !e.deployed) {
    const homeD = Math.hypot(e.x - e.ax, e.z - e.az);
    if (homeD > 14 && homeD < 130) moveToward(sim, e, e.ax, e.az, 4);
  }
}

function healAura(sim: Sim, e: Entity): void {
  const list = sim.hash.query(sim.list, e.x, e.z, 30, sim.tmp2);
  for (const f of list) if (f.team === e.team && f.hp < f.maxHp && f.def.kind === 'unit') f.hp = Math.min(f.maxHp, f.hp + e.def.healAura!);
}

// -------------------------------------------------------------------------------- building
function stepBuild(sim: Sim, e: Entity, o: Order): void {
  const st = sim.byId.get(o.target);
  if (!st || !st.alive || st.progress >= 1) { shift(e); return; }
  if (!approach(sim, e, st, 9)) return;
  e.moving = false; e.speed = 0;
  const player = sim.players[e.owner];
  const lowPower = player.powerRatio < 1 ? 0.8 : 1;
  const inc = (DT / Math.max(1, st.def.time)) * lowPower;
  st.progress = Math.min(1, st.progress + inc);
  st.hp = Math.min(st.maxHp, st.hp + inc * st.maxHp);
  st.buffT = sim.tick;
  if (st.progress >= 1) { completeStructure(sim, st); shift(e); }
}

// -------------------------------------------------------------------------------- harvesting
function nearestDropoff(sim: Sim, e: Entity): Entity | null {
  let best: Entity | null = null, bd = 1e18;
  for (const s of sim.list) {
    if (!s.alive || s.owner !== e.owner || !s.def.dropoff || s.progress < 1) continue;
    const d2 = (s.x - e.x) ** 2 + (s.z - e.z) ** 2;
    if (d2 < bd) { bd = d2; best = s; }
  }
  return best;
}

function nearestDepot(sim: Sim, x: number, z: number, maxR = 1100): Entity | null {
  let best: Entity | null = null, bd = maxR * maxR;
  for (const s of sim.list) {
    if (!s.alive || !s.def.supply || s.supplyLeft <= 1) continue;
    const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d2 < bd) { bd = d2; best = s; }
  }
  return best;
}

function autoHarvest(sim: Sim, e: Entity): void {
  const drop = nearestDropoff(sim, e);
  if (!drop) return;
  const dep = nearestDepot(sim, drop.x, drop.z);
  if (!dep) return;
  e.orders.push(order('harvest', dep.x, dep.z, dep.id));
}

function stepHarvest(sim: Sim, e: Entity, o: Order): void {
  const cap = e.def.cap!;
  const player = sim.players[e.owner];
  if (o.state === 0) {
    let dep = sim.byId.get(o.target);
    if (!dep || !dep.alive || dep.supplyLeft <= 1) {
      const drop = nearestDropoff(sim, e);
      dep = drop ? nearestDepot(sim, drop.x, drop.z) ?? undefined : undefined;
      if (!dep) { if (e.cargo > 0) o.state = 2; else shift(e); return; }
      o.target = dep.id; o.x = dep.x; o.z = dep.z;
    }
    if (approach(sim, e, dep, 7)) { o.state = 1; o.t = 0; }
  } else if (o.state === 1) {
    const dep = sim.byId.get(o.target);
    e.moving = false; e.speed = 0;
    if (!dep || !dep.alive || dep.supplyLeft <= 1) { o.state = e.cargo > 0 ? 2 : 0; return; }
    const rate = cap / 5;
    const take = Math.min(rate * DT, dep.supplyLeft, cap - e.cargo);
    e.cargo += take; dep.supplyLeft -= take;
    if (e.cargo >= cap - 0.01) o.state = 2;
  } else if (o.state === 2) {
    const drop = nearestDropoff(sim, e);
    if (!drop) { e.moving = false; return; }
    if (approach(sim, e, drop, 7)) { o.state = 3; o.t = 0; }
  } else {
    e.moving = false; e.speed = 0;
    o.t += DT;
    if (o.t >= 1.2) {
      player.credits += e.cargo * player.incomeMul;
      player.incomeWindow.push(e.cargo * player.incomeMul);
      e.cargo = 0;
      o.state = 0;
    }
  }
}

// -------------------------------------------------------------------------------- separation
export function separate(sim: Sim): void {
  const list = sim.list;
  const buf = sim.tmp2;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (!e.alive || e.def.kind !== 'unit' || e.def.layer === 'air' || e.inside) continue;
    sim.hash.query(list, e.x, e.z, e.def.radius + 7, buf);
    for (const f of buf) {
      if (f === e || f.id < e.id) continue;
      if (f.def.kind !== 'unit' || f.def.layer === 'air' || f.inside) continue;
      const dx = f.x - e.x, dz = f.z - e.z;
      const minD = (e.def.radius + f.def.radius) * 0.82;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD) continue;
      const dist = Math.sqrt(d2) || 0.01;
      const nx = dx / dist, nz = dz / dist;
      const overlap = (minD - dist) * 0.5;
      let we = 0.5, wf = 0.5;
      if (e.moving && !f.moving) { we = 0.15; wf = 0.85; }
      else if (!e.moving && f.moving) { we = 0.85; wf = 0.15; }
      if (e.def.layer === 'ground' && f.deployed) { we = 1; wf = 0; }
      if (e.deployed) { we = 0; wf = 1; }
      tryShift(sim, e, -nx * overlap * we * 2, -nz * overlap * we * 2);
      tryShift(sim, f, nx * overlap * wf * 2, nz * overlap * wf * 2);
    }
  }
}

function tryShift(sim: Sim, e: Entity, dx: number, dz: number): void {
  const nx = e.x + dx, nz = e.z + dz;
  if (sim.nav.blockedAt(nx, nz) && !sim.nav.blockedAt(e.x, e.z)) return;
  e.x = nx; e.z = nz; e.y = sim.groundY(nx, nz);
}

export type { UpgradeDef, EntityDef };
export { POWERS, UPGRADES, TICK_RATE };
