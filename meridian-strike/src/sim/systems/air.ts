import type { Sim } from '../sim';
import { Entity, order } from '../entity';
import { DT, TICK_RATE } from '../types';
import { angDiff } from './orders';
import { autoAcquire, bestWeapon, canHit, shoot, engageRange } from './combat';

// astate: 0 parked, 1 takeoff, 2 idle/airborne, 3 attacking, 4 egress, 5 returning, 6 landing
export function airOrderPush(sim: Sim, e: Entity, queue: boolean, kind: 'move' | 'amove' | 'attack' | 'stop', x: number, z: number, target: number): void {
  if (kind === 'stop') {
    e.orders.length = 0; e.target = 0;
    if (e.astate !== 0 && e.def.rearm) e.astate = 5;
    return;
  }
  if (!queue) e.orders.length = 0;
  if (kind === 'attack') e.orders.push(order('attack', x, z, target));
  else { const o = order('move', x, z); o.amove = kind === 'amove'; e.orders.push(o); }
  void sim;
}

function hasAmmo(e: Entity): boolean {
  const ws = e.def.weapons;
  if (!ws) return false;
  for (let i = 0; i < ws.length; i++) if (e.wammo[i] !== 0) return true;
  return false;
}

function findHome(sim: Sim, e: Entity): Entity | null {
  const h = sim.byId.get(e.home);
  if (h && h.alive && h.def.airfield && h.progress >= 1) return h;
  let best: Entity | null = null, bd = 1e18;
  for (const s of sim.list) {
    if (!s.alive || s.owner !== e.owner || !s.def.airfield || s.progress < 1) continue;
    const d = (s.x - e.x) ** 2 + (s.z - e.z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  if (best) e.home = best.id;
  return best;
}

function flyPlane(sim: Sim, e: Entity, gx: number, gz: number, speedMul = 1): void {
  const d = e.def;
  const des = Math.atan2(gx - e.x, gz - e.z);
  const diff = angDiff(e.heading, des);
  const turn = (d.turn ?? 1.5) * DT;
  e.heading += Math.max(-turn, Math.min(turn, diff));
  const target = d.speed! * e.spdMul * speedMul;
  e.speed += Math.max(-30 * DT, Math.min(30 * DT, target - e.speed));
  e.x += Math.sin(e.heading) * e.speed * DT;
  e.z += Math.cos(e.heading) * e.speed * DT;
  const lim = sim.map.size / 2 - 20;
  e.x = Math.max(-lim, Math.min(lim, e.x)); e.z = Math.max(-lim, Math.min(lim, e.z));
  e.moving = true;
}

function hover(sim: Sim, e: Entity, gx: number, gz: number, stopR: number, faceX?: number, faceZ?: number): boolean {
  const d = e.def;
  const dx = gx - e.x, dz = gz - e.z;
  const dist = Math.hypot(dx, dz);
  const maxSpd = d.speed! * e.spdMul;
  let tgtSpd = 0;
  if (dist > stopR) tgtSpd = Math.min(maxSpd, Math.max(2, (dist - stopR) * 1.2));
  const acc = (d.accel ?? 20) * DT;
  e.speed += Math.max(-acc * 1.5, Math.min(acc, tgtSpd - e.speed));
  if (dist > 0.5 && e.speed > 0.1) {
    e.x += (dx / dist) * e.speed * DT;
    e.z += (dz / dist) * e.speed * DT;
  }
  const fx = faceX ?? gx, fz = faceZ ?? gz;
  if (Math.hypot(fx - e.x, fz - e.z) > 2) {
    const des = Math.atan2(fx - e.x, fz - e.z);
    const diff = angDiff(e.heading, des);
    const turn = 2.6 * DT;
    e.heading += Math.max(-turn, Math.min(turn, diff));
  }
  e.moving = e.speed > 0.5;
  const lim = sim.map.size / 2 - 20;
  e.x = Math.max(-lim, Math.min(lim, e.x)); e.z = Math.max(-lim, Math.min(lim, e.z));
  return dist <= stopR + 1;
}

function altitude(sim: Sim, e: Entity, k = 1): void {
  const ty = sim.groundY(e.x, e.z) + (e.def.fly ?? 30);
  const rate = (e.def.move === 'plane' ? 14 : 10) * DT * k;
  e.y += Math.max(-rate, Math.min(rate, ty - e.y));
}

export function stepAir(sim: Sim, e: Entity): void {
  const d = e.def;
  if (e.firing > 0) e.firing--;
  if (e.reveal > 0) e.reveal--;
  if (e.stun > 0) { e.stun--; e.moving = false; return; }
  const ws = d.weapons ?? [];
  for (let i = 0; i < ws.length; i++) e.wcd[i] -= DT;
  const plane = d.move === 'plane';
  const tick = sim.tick;

  // ---------------------------------------------------------------- parked: rearm / wait for orders
  if (e.astate === 0) {
    e.moving = false; e.speed = 0;
    e.y = sim.groundY(e.x, e.z) + 0.5;
    if (tick % 18 === 0) {
      for (let i = 0; i < ws.length; i++) if (ws[i].ammo && e.wammo[i] >= 0 && e.wammo[i] < ws[i].ammo!) e.wammo[i]++;
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03);
    }
    findHome(sim, e);
    const o = e.orders[0];
    const full = ws.every((w, i) => !w.ammo || e.wammo[i] >= Math.min(w.ammo, 3) || e.wammo[i] < 0);
    if (o && (full || !d.rearm)) { e.astate = 1; e.atimer = 0; }
    else if (!o && !d.rearm) { /* stay */ }
    else if (!o && e.target === 0 && tick % 12 === e.id % 12) {
      // fighters scramble against air targets even without orders
      autoAcquire(sim, e);
      const t = e.target ? sim.byId.get(e.target) : undefined;
      if (t && t.alive && full) e.orders.push(order('attack', t.x, t.z, t.id));
    }
    return;
  }

  // ---------------------------------------------------------------- takeoff
  if (e.astate === 1) {
    e.atimer++;
    if (plane) {
      e.speed += 25 * DT;
      e.x += Math.sin(e.heading) * e.speed * DT; e.z += Math.cos(e.heading) * e.speed * DT;
      e.y += 9 * DT;
      if (e.speed > d.speed! * 0.8) { e.astate = 2; }
    } else {
      e.y += 7 * DT;
      if (e.y > sim.groundY(e.x, e.z) + (d.fly ?? 20) * 0.8) e.astate = 2;
    }
    e.moving = true;
    return;
  }

  altitude(sim, e);
  const o = e.orders[0];
  // no airfield: planes burn fuel
  if (plane && d.rearm && e.astate !== 0) {
    e.atimer++;
    if (!findHome(sim, e) && e.atimer > TICK_RATE * 80) { sim.remove(e); sim.emitAt({ k: 'boom', x: e.x, y: e.y, z: e.z, size: 2, kind: 'air' }, e.x, e.z); return; }
  }

  // ---------------------------------------------------------------- returning / landing
  if (e.astate === 5 || e.astate === 6) {
    const home = findHome(sim, e);
    if (!home) { loiter(sim, e); return; }
    const slotX = home.x + (((e.id % 3) - 1) * 14), slotZ = home.z + (((e.id >> 1) % 2) - 0.5) * 12;
    const dist = Math.hypot(slotX - e.x, slotZ - e.z);
    if (plane) {
      if (dist > 60 || e.astate === 5) {
        flyPlane(sim, e, slotX, slotZ);
        if (dist < 70) { e.astate = 6; e.atimer = 0; }
      } else {
        e.astate = 6;
      }
      if (e.astate === 6) {
        // straight final approach
        flyPlane(sim, e, slotX, slotZ, 0.55);
        const k = Math.max(0, Math.min(1, dist / 160));
        const ty = sim.groundY(e.x, e.z) + 0.5 + k * (d.fly ?? 60) * 0.5;
        e.y += Math.max(-20 * DT, Math.min(20 * DT, ty - e.y));
        if (dist < 14) { e.astate = 0; e.speed = 0; e.x = slotX; e.z = slotZ; e.heading = home.heading; e.orders.length = 0; e.target = 0; }
      }
    } else {
      const arrived = hover(sim, e, slotX, slotZ, 3);
      if (arrived) {
        const g = sim.groundY(e.x, e.z) + 0.5;
        e.y += Math.max(-6 * DT, Math.min(6 * DT, g - e.y));
        if (e.y <= g + 0.2) { e.astate = 0; e.speed = 0; e.target = 0; }
      }
    }
    return;
  }

  // ---------------------------------------------------------------- orders
  if (!o) {
    // idle: look for targets, otherwise loiter / hover
    if (tick % 12 === e.id % 12 && e.stance !== 'hold') {
      autoAcquire(sim, e);
      const t = e.target ? sim.byId.get(e.target) : undefined;
      if (t && t.alive && bestWeapon(e, t) && hasAmmo(e) && !d.oneShot) { e.orders.push(order('attack', t.x, t.z, t.id)); return; }
      if (d.oneShot && t && t.alive) { e.orders.push(order('attack', t.x, t.z, t.id)); return; }
    }
    if (plane) loiter(sim, e);
    else { hover(sim, e, e.ax || e.x, e.az || e.z, 3); if (d.rearm && !hasAmmo(e)) e.astate = 5; }
    if (e.astate === 3 || e.astate === 4) e.astate = 2;
    return;
  }

  if (o.k === 'move' || o.k === 'patrol') {
    if (plane) {
      flyPlane(sim, e, o.x, o.z);
      if (Math.hypot(o.x - e.x, o.z - e.z) < 70) { e.ax = o.x; e.az = o.z; e.orders.shift(); }
    } else {
      if (hover(sim, e, o.x, o.z, 4)) { e.ax = o.x; e.az = o.z; e.orders.shift(); }
    }
    if (o.amove && tick % 12 === e.id % 12) {
      autoAcquire(sim, e);
      const t = e.target ? sim.byId.get(e.target) : undefined;
      if (t && t.alive && bestWeapon(e, t) && hasAmmo(e)) e.orders.unshift(order('attack', t.x, t.z, t.id));
    }
    return;
  }

  if (o.k === 'attack') {
    const t = sim.byId.get(o.target);
    const visible = t && t.alive && (!sim.vision.enabled || t.team === e.team || (t.visMask & (1 << e.team)) !== 0);
    if (!t || !t.alive || !visible) { e.orders.shift(); e.target = 0; e.astate = e.astate === 3 || e.astate === 4 ? 2 : e.astate; return; }
    if (!hasAmmo(e)) {
      if (d.rearm) { e.astate = 5; return; }
    }
    const w = bestWeapon(e, t);
    if (!w) { e.orders.shift(); e.target = 0; return; }
    e.target = t.id;
    const range = engageRange(e, w);
    const dist = Math.hypot(t.x - e.x, t.z - e.z);
    if (plane) {
      if (e.astate === 4) {
        // egress: keep flying straight, then re-attack
        flyPlane(sim, e, e.x + Math.sin(e.heading) * 200, e.z + Math.cos(e.heading) * 200);
        e.atimer++;
        if (e.atimer > TICK_RATE * 3.2) { e.astate = 3; }
        return;
      }
      e.astate = 3;
      flyPlane(sim, e, t.x, t.z);
      const bearing = Math.atan2(t.x - e.x, t.z - e.z);
      const aligned = Math.abs(angDiff(e.heading, bearing)) < 0.3;
      if (aligned && dist < range) fireAt(sim, e, t);
      const ahead = Math.sin(e.heading) * (t.x - e.x) + Math.cos(e.heading) * (t.z - e.z);
      if (ahead < 0 && dist > 25 || (d.oneShot === false && dist < 18)) { e.astate = 4; e.atimer = 0; }
      if (d.oneShot && dist < 6) fireAt(sim, e, t);
    } else {
      e.astate = 3;
      const stop = d.oneShot ? 2 : range * 0.78;
      hover(sim, e, t.x, t.z, stop, t.x, t.z);
      const bearing = Math.atan2(t.x - e.x, t.z - e.z);
      const aligned = Math.abs(angDiff(e.heading, bearing)) < 0.3;
      if (aligned && dist < range) fireAt(sim, e, t);
    }
  }
}

function loiter(sim: Sim, e: Entity): void {
  const ax = e.ax || e.x, az = e.az || e.z;
  const dist = Math.hypot(ax - e.x, az - e.z);
  if (dist > 260) flyPlane(sim, e, ax, az);
  else {
    e.heading += (e.def.turn ?? 1.5) * 0.4 * DT;
    const target = e.def.speed! * 0.8;
    e.speed += Math.max(-20 * DT, Math.min(20 * DT, target - e.speed));
    e.x += Math.sin(e.heading) * e.speed * DT; e.z += Math.cos(e.heading) * e.speed * DT;
  }
  e.moving = true;
}

function fireAt(sim: Sim, e: Entity, t: Entity): void {
  const ws = e.def.weapons!;
  for (let wi = 0; wi < ws.length; wi++) {
    const w = ws[wi];
    if (e.wammo[wi] === 0 || e.wcd[wi] > 0 || !canHit(w, t)) continue;
    const dist = Math.hypot(t.x - e.x, t.z - e.z);
    if (dist > engageRange(e, w) + 4) continue;
    if (w.structOnly && t.def.kind !== 'structure') continue;
    shoot(sim, e, wi, t, e.x, e.y - 1, e.z);
    if (!e.alive) return;
  }
}
