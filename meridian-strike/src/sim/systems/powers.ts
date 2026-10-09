import type { Sim, Player, Projectile } from '../sim';
import { Entity, order } from '../entity';
import { DT, PowerDef, TICK_RATE, WeaponDef } from '../types';
import { DEFS, GENERALS, POWERS, SLOTS } from '../defs';
import { explode, stun, VFX_NAMES } from './combat';

export class PowerState {
  /** reserved for persistent area effects */
  zones: { team: number; x: number; z: number; r: number; until: number; kind: string }[] = [];
}

export function unlockPower(sim: Sim, p: Player, id: string): void {
  const pd = POWERS.get(id);
  if (!pd || p.unlocked.has(id)) return;
  const g = GENERALS.get(p.setup.general);
  if (!g || !g.powers.includes(id)) return;
  if (p.cp < pd.cost) { sim.emit({ k: 'msg', text: 'Not enough command points', owner: p.id }); return; }
  p.cp -= pd.cost;
  p.unlocked.add(id);
}

function hasTechStructure(_sim: Sim, p: Player): boolean {
  const slot = SLOTS.get(p.faction)?.get('tech');
  if (!slot) return true;
  return (p.have.get(slot) ?? 0) > 0;
}

function adHocWeapon(name: string, damage: number, dtype: PowerDef['effect']['dtype'], aoe: number, vfx: WeaponDef['vfx'], speed: number): WeaponDef {
  return { id: 'power_' + name, name, damage, dtype: dtype ?? 'explosive', range: 9999, reload: 1, speed, aoe, targets: ['ground', 'air'], vfx };
}

function spawnProjectile(sim: Sim, owner: number, w: WeaponDef, sx: number, sy: number, sz: number, tx: number, tz: number, T: number, arcH: number, kind: 0 | 2): void {
  const ty = sim.groundY(tx, tz);
  const p: Projectile = {
    id: sim.nextProjId++, w, vfx: VFX_NAMES.indexOf(w.vfx), owner, team: sim.players[owner].team, src: 0, target: 0, kind,
    x: sx, y: sy, z: sz, sx, sy, sz, tx, ty, tz, t: 0, T, arcH, dmg: w.damage, jam: false, dx: 0, dy: -1, dz: 0, alive: true,
  };
  sim.projectiles.push(p);
  sim.emitAt({ k: 'shot', vfx: w.vfx, x: sx, y: sy, z: sz, tx, ty, tz, owner, big: true }, tx, tz);
}

function later(sim: Sim, seconds: number, fn: () => void): void {
  sim.pending.push({ t: sim.tick + Math.max(1, Math.round(seconds * TICK_RATE)), fn });
}

export function usePower(sim: Sim, p: Player, id: string, x: number, z: number): void {
  const pd = POWERS.get(id);
  if (!pd || pd.faction !== p.faction) return;
  const lim = sim.map.size / 2 - 10;
  x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
  const isSuper = pd.cost === 0;
  let sw: Entity | undefined;
  if (isSuper) {
    sw = sim.list.find((e) => e.alive && e.owner === p.id && e.def.superweapon?.power === id && e.superReady);
    if (!sw || !sim.options.superweapons) return;
  } else {
    if (!p.unlocked.has(id)) return;
    if (pd.tier === 3 && !hasTechStructure(sim, p)) { sim.emit({ k: 'msg', text: 'Requires Strategic Command', owner: p.id }); return; }
    if ((p.powerCd.get(id) ?? 0) > sim.tick) return;
  }
  const fx = pd.effect;
  const owner = p.id;
  const delay = fx.delay ?? 3;
  if (sw) { sw.superReady = false; sw.superCharge = 0; }
  else p.powerCd.set(id, sim.tick + pd.cooldown * TICK_RATE);
  sim.emit({ k: 'strikeWarn', x, z, r: fx.radius ?? 40, t: delay, owner });
  if (isSuper) for (const o of sim.players) sim.emit({ k: 'alert', type: 'super', x, z, owner: o.id, text: `${pd.name} launched` });

  switch (fx.kind) {
    case 'reveal': {
      sim.vision.reveals.push({ team: p.team, x, z, r: fx.radius ?? 120, until: sim.tick + (fx.duration ?? 20) * TICK_RATE });
      break;
    }
    case 'repair': {
      for (const e of sim.hash.query(sim.list, x, z, fx.radius ?? 80, []) ) {
        if (e.team === p.team && e.def.kind !== 'structure' || (e.team === p.team && e.def.kind === 'structure')) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (fx.mult ?? 0.5));
      }
      sim.emitAt({ k: 'boom', x, y: sim.groundY(x, z) + 2, z, size: 3, kind: 'emp' }, x, z);
      break;
    }
    case 'emp': case 'blackout': {
      later(sim, delay, () => {
        const list = sim.hash.query(sim.list, x, z, fx.radius ?? 60, []);
        for (const e of list) {
          if (e.team === p.team) continue;
          if (fx.kind === 'blackout' && e.def.kind !== 'structure') continue;
          stun(sim, e, fx.duration ?? 15, fx.kind === 'emp' ? 'emp' : 'cyber');
        }
        sim.emitAt({ k: 'boom', x, y: sim.groundY(x, z) + 3, z, size: (fx.radius ?? 60) / 12, kind: fx.kind === 'emp' ? 'emp' : 'cyber' }, x, z);
      });
      break;
    }
    case 'strike': {
      // single huge hit (superweapon)
      const w = adHocWeapon('super', fx.damage ?? 2000, fx.dtype ?? 'hyper', fx.radius ?? 60, 'missile', 420);
      const T = 2.4;
      later(sim, Math.max(0.1, delay - T), () => {
        const ang = sim.rng() * Math.PI * 2;
        spawnProjectile(sim, owner, w, x + Math.sin(ang) * 520, 620, z + Math.cos(ang) * 520, x, z, T, 0, 2);
      });
      break;
    }
    case 'airstrike': case 'carpet': {
      const n = fx.count ?? 8;
      const r = fx.radius ?? 40;
      const w = adHocWeapon('bomb', fx.damage ?? 200, fx.dtype ?? 'explosive', fx.kind === 'carpet' ? 16 : 11, 'bomb', 0);
      const dir = sim.rng() * Math.PI * 2;
      const dur = fx.duration ?? 4;
      for (let i = 0; i < n; i++) {
        const f = n > 1 ? i / (n - 1) : 0.5;
        let bx: number, bz: number;
        if (fx.kind === 'carpet') {
          const along = (f - 0.5) * 2 * r;
          bx = x + Math.sin(dir) * along + (sim.rng() - 0.5) * 12; bz = z + Math.cos(dir) * along + (sim.rng() - 0.5) * 12;
        } else {
          const a = sim.rng() * Math.PI * 2, rr = Math.sqrt(sim.rng()) * r;
          bx = x + Math.sin(a) * rr; bz = z + Math.cos(a) * rr;
        }
        later(sim, delay + f * dur, () => spawnProjectile(sim, owner, w, bx - Math.sin(dir) * 40, sim.groundY(bx, bz) + 260, bz - Math.cos(dir) * 40, bx, bz, 0, 0, 2));
      }
      break;
    }
    case 'barrage': case 'salvo': {
      const n = fx.count ?? 12;
      const r = fx.radius ?? 40;
      const missile = fx.kind === 'salvo';
      const w = adHocWeapon(missile ? 'salvo' : 'barrage', fx.damage ?? 150, fx.dtype ?? 'artillery', missile ? 14 : 10, missile ? 'missile' : 'shell', 200);
      const dur = fx.duration ?? 8;
      for (let i = 0; i < n; i++) {
        const a = sim.rng() * Math.PI * 2, rr = Math.sqrt(sim.rng()) * r;
        const bx = x + Math.sin(a) * rr, bz = z + Math.cos(a) * rr;
        const t0 = delay + (i / n) * dur;
        later(sim, t0, () => {
          const sa = sim.rng() * Math.PI * 2;
          spawnProjectile(sim, owner, w, bx + Math.sin(sa) * 320, 160, bz + Math.cos(sa) * 320, bx, bz, missile ? 1.2 : 2.2, missile ? 40 : 160, 0);
        });
      }
      break;
    }
    case 'paradrop': case 'rush': case 'decoys': case 'drones': case 'swarm': case 'ambush': {
      const uid = fx.unit!;
      const d = DEFS.get(uid);
      if (!d) break;
      const n = fx.count ?? 4;
      later(sim, delay, () => {
        const air = d.layer === 'air';
        const edge = (() => {
          const [bx, bz] = p.spawn;
          const l = Math.hypot(bx, bz) || 1;
          return [bx / l * (sim.map.size / 2 - 30), bz / l * (sim.map.size / 2 - 30)];
        })();
        for (let i = 0; i < n; i++) {
          const a = sim.rng() * Math.PI * 2, rr = Math.sqrt(sim.rng()) * 18;
          let sx = x + Math.sin(a) * rr, sz = z + Math.cos(a) * rr;
          if (fx.kind === 'rush') { sx = p.spawn[0] + (sim.rng() - 0.5) * 60; sz = p.spawn[1] + 60 + (sim.rng() - 0.5) * 20; }
          if (fx.kind === 'drones' || fx.kind === 'swarm') { sx = edge[0] + (sim.rng() - 0.5) * 80; sz = edge[1] + (sim.rng() - 0.5) * 80; }
          const f = sim.nav.nearestFree(sx, sz, 14);
          if (!air && f) { sx = f[0]; sz = f[1]; }
          const u = sim.spawn(uid, owner, sx, sz, { heading: sim.rng() * 6.28 });
          if (air) { u.astate = 2; u.y = sim.groundY(sx, sz) + (d.fly ?? 40); }
          if (fx.duration) u.ttl = sim.tick + fx.duration * TICK_RATE;
          if (fx.kind === 'rush' || fx.kind === 'drones' || fx.kind === 'swarm') {
            const o = order('move', x + (sim.rng() - 0.5) * 20, z + (sim.rng() - 0.5) * 20); o.amove = true; o.x2 = x; o.z2 = z;
            u.orders.push(o);
            if (air) u.orders[0].amove = true;
          }
        }
        sim.emitAt({ k: 'boom', x, y: sim.groundY(x, z) + 2, z, size: 2, kind: 'gen' }, x, z);
      });
      break;
    }
    default: break;
  }
}

export function stepPowers(sim: Sim): void {
  void sim; void DT; void explode; void SLOTS;
}
