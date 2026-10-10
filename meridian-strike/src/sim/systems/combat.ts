import type { Sim, Projectile } from '../sim';
import { RANK_XP } from '../sim';
import type { Entity } from '../entity';
import { DAMAGE_MATRIX, DT, DamageType, ProjVfx, TICK_RATE, WeaponDef } from '../types';
import { angDiff, faceTarget } from './orders';
import { DEF_INDEX } from '../defs';

export const VFX_NAMES: ProjVfx[] = ['bullet', 'cannon', 'missile', 'rocket', 'shell', 'bomb', 'flame', 'cyber', 'emp', 'swarm'];
const VFX_INDEX = new Map(VFX_NAMES.map((n, i) => [n, i]));

// -------------------------------------------------------------------------------- helpers
export function isAirborne(e: Entity): boolean {
  return e.def.layer === 'air' && e.astate !== 0;
}

export function canHit(w: WeaponDef, t: Entity): boolean {
  const layer = isAirborne(t) ? 'air' : 'ground';
  if (!w.targets.includes(layer)) return false;
  if (DAMAGE_MATRIX[w.dtype][t.def.armor] <= 0) return false;
  if (w.dtype === 'cyber' && !(t.def.kind === 'structure' || t.def.move === 'wheel' || t.def.move === 'track' || t.def.layer === 'air')) return false;
  return true;
}

/** First usable weapon able to hurt target t. */
export function bestWeapon(e: Entity, t: Entity): WeaponDef | null {
  const ws = e.def.weapons;
  if (!ws) return null;
  let best: WeaponDef | null = null;
  let bestDps = -1;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (e.wammo[i] === 0) continue;
    if (!canHit(w, t)) continue;
    const dps = (Math.max(1, w.damage) * (w.salvo ?? 1) * DAMAGE_MATRIX[w.dtype][t.def.armor]) / w.reload + (w.stunTime ? 50 : 0);
    if (dps > bestDps) { bestDps = dps; best = w; }
  }
  return best;
}

export function autoAcquire(sim: Sim, e: Entity): void {
  acquire(sim, e, e.x, e.z, 0);
}

export function engageRange(e: Entity, w: WeaponDef): number {
  return w.range * e.rngMul;
}

function validTarget(sim: Sim, e: Entity, t: Entity | undefined): t is Entity {
  if (!t || !t.alive || t.inside) return false;
  if (t.team === e.team && e.team >= 0) return false;
  if (sim.vision.enabled && e.team >= 0 && !(t.visMask & (1 << e.team))) return false;
  return true;
}

// -------------------------------------------------------------------------------- targeting
function acquire(sim: Sim, e: Entity, ox: number, oz: number, rangeBonus: number): void {
  const d = e.def;
  const ws = d.weapons!;
  let maxR = 0;
  for (const w of ws) maxR = Math.max(maxR, w.range * e.rngMul);
  const aggressive = e.stance === 'aggressive' && !!d.speed;
  const R = aggressive ? Math.min(Math.max(maxR, d.vision * e.visMul * 0.85), maxR + 55) : maxR + rangeBonus;
  const buf = sim.hash.query(sim.list, ox, oz, R + 8, sim.tmp);
  let best: Entity | null = null;
  let bestScore = 1e18;
  const prev = e.target;
  const recent = sim.tick - e.lastHit < 90;
  for (const f of buf) {
    if (f === e || f.owner < 0 || f.team === e.team || f.inside || f.def.prop) continue;
    if (sim.vision.enabled && e.team >= 0 && !(f.visMask & (1 << e.team))) continue;
    const w = bestWeapon(e, f);
    if (!w) continue;
    if (w.structOnly && f.def.kind !== 'structure') continue;
    const dx = f.x - ox, dz = f.z - oz;
    const dist = Math.hypot(dx, dz) - f.def.radius * 0.5;
    if (dist > w.range * e.rngMul + (aggressive ? 55 : rangeBonus)) continue;
    if (w.minRange && dist < w.minRange) continue;
    let score = dist * dist;
    const armed = !!f.def.weapons?.length;
    if (f.def.kind === 'structure') score *= armed ? 1.2 : 2.4;
    else if (armed) score *= 0.55;
    if (f.id === prev) score *= 0.7;
    if (recent && f.id === e.lastAttackerId) score *= 0.4;
    if (f.def.layer === 'air' && w.targets.includes('air') && !w.targets.includes('ground')) score *= 0.5;
    if (score < bestScore) { bestScore = score; best = f; }
  }
  e.target = best ? best.id : 0;
}

// -------------------------------------------------------------------------------- firing
export function weaponReady(e: Entity, wi: number): boolean {
  return e.wcd[wi] <= 0 && e.wammo[wi] !== 0;
}

export function jammedAt(sim: Sim, victim: Entity): boolean {
  const buf = sim.hash.query(sim.list, victim.x, victim.z, 90, sim.tmp2);
  for (const j of buf) {
    if (!j.def.jammer || j.team !== victim.team) continue;
    const d = Math.hypot(j.x - victim.x, j.z - victim.z);
    if (d <= j.def.jammer) return true;
  }
  return false;
}

export function fireWeapon(sim: Sim, e: Entity, wi: number, t: Entity, sx?: number, sy?: number, sz?: number): void {
  const d = e.def;
  const w = d.weapons![wi];
  const host = e.inside ? sim.byId.get(e.inside) : undefined;
  const ex = host ? host.x : e.x, ez = host ? host.z : e.z, ey = host ? host.y + 3 : e.y;
  const ang = d.turret && !w.fixed ? e.turret : e.heading;
  const m = w.mount ?? [0, 2, 2];
  const sa = Math.sin(ang), ca = Math.cos(ang);
  const mx = sx ?? ex + sa * m[2] + ca * m[0];
  const mz = sz ?? ez + ca * m[2] - sa * m[0];
  const my = sy ?? ey + m[1];
  const tAir = isAirborne(t);
  let ax = t.x, ay = t.y + (tAir ? 0 : Math.min(1.4, t.def.radius * 0.4)), az = t.z;
  const dist = Math.hypot(ax - mx, az - mz);
  const spd = w.speed;
  if (spd > 0 && t.speed > 0.5 && !w.guided) {
    const T = dist / spd;
    ax += Math.sin(t.heading) * t.speed * T * 0.85;
    az += Math.cos(t.heading) * t.speed * T * 0.85;
  }
  if (w.spread) {
    const s = w.spread * e.aim * Math.min(1, dist / Math.max(1, w.range));
    ax += (sim.rng() - 0.5) * 2 * s; az += (sim.rng() - 0.5) * 2 * s;
  }
  const swarm = (e.swarmed ? 1.08 : 1) * (e.netted ? 1.18 : 1);
  const dmg = w.damage * e.dmgMul * swarm;
  const vfxIdx = VFX_INDEX.get(w.vfx) ?? 0;
  if (e.def.stealth) e.reveal = Math.max(e.reveal, (e.def.stealth.reveal ?? 3) * TICK_RATE);
  e.firing = 6;
  e.lastFired = sim.tick;
  if (w.ammo && e.wammo[wi] > 0) e.wammo[wi]--;

  if (w.suicide) {
    // loitering munition: detonates on the target
    sim.emitAt({ k: 'shot', vfx: w.vfx, x: mx, y: my, z: mz, tx: ax, ty: ay, tz: az, owner: e.owner, src: DEF_INDEX.get(d.id), dmg }, mx, mz);
    explode(sim, t.x, t.y, t.z, w.aoe ?? 6, dmg, w.dtype, e.owner, e, true, true);
    sim.emitAt({ k: 'boom', x: t.x, y: t.y + 1, z: t.z, size: Math.max(1.6, (w.aoe ?? 6) * 0.35), kind: tAir ? 'air' : 'gen' }, t.x, t.z);
    sim.remove(e);
    return;
  }

  if (spd <= 0) {
    let pHit = 1 - Math.min(0.5, (dist / Math.max(1, w.range)) * 0.38);
    if (t.speed > 2) pHit *= 0.9;
    if (tAir) pHit *= 0.72 * t.flak;
    pHit = 1 - (1 - pHit) * e.aim;
    if (t.def.kind === 'structure') pHit = 1;
    const hit = sim.rng() < pHit;
    sim.emitAt({ k: 'shot', vfx: w.vfx, x: mx, y: my, z: mz, tx: hit ? t.x : ax + (sim.rng() - 0.5) * 6, ty: hit ? ay : ay + (sim.rng() - 0.5) * 3, tz: hit ? t.z : az + (sim.rng() - 0.5) * 6, owner: e.owner, src: DEF_INDEX.get(d.id), dmg }, mx, mz);
    if (hit) {
      if (w.stunTime) stun(sim, t, w.stunTime, w.dtype);
      else if (w.aoe) explode(sim, t.x, t.y, t.z, w.aoe, dmg, w.dtype, e.owner, e, tAir, !tAir);
      else damage(sim, t, dmg, w.dtype, e);
    }
    return;
  }

  // projectile
  const kind: 0 | 1 | 2 = w.vfx === 'bomb' ? 2 : w.guided ? 1 : 0;
  const dx = ax - mx, dy = ay - my, dz = az - mz;
  const d3 = Math.hypot(dx, dy, dz) || 1;
  const T = kind === 2 ? Math.sqrt(Math.max(0.2, (2 * Math.max(2, my - ay)) / 22)) : Math.max(0.05, d3 / spd);
  const p: Projectile = {
    id: sim.nextProjId++, w, vfx: vfxIdx, owner: e.owner, team: e.team, src: e.id, target: t.id, kind,
    x: mx, y: my, z: mz, sx: mx, sy: my, sz: mz, tx: ax, ty: ay, tz: az, t: 0, T,
    arcH: (w.arc ?? 0) * dist, dmg, jam: false, dx: dx / d3, dy: dy / d3, dz: dz / d3, alive: true,
  };
  if (w.guided && t.def.kind !== 'structure') p.jam = jammedAt(sim, t);
  sim.projectiles.push(p);
  sim.emitAt({ k: 'shot', vfx: w.vfx, x: mx, y: my, z: mz, tx: ax, ty: ay, tz: az, owner: e.owner, big: dmg > 100, p: true, src: DEF_INDEX.get(d.id), dmg }, mx, mz);
}

function startCooldown(e: Entity, wi: number): void {
  const w = e.def.weapons![wi];
  if (w.salvo && w.salvo > 1 && e.wburst[wi] === 0) {
    e.wburst[wi] = w.salvo - 1;
    e.wcd[wi] = w.salvoGap ?? 0.15;
  } else if (e.wburst[wi] > 0) {
    e.wburst[wi]--;
    e.wcd[wi] = e.wburst[wi] > 0 ? (w.salvoGap ?? 0.15) : w.reload / e.rofMul;
  } else e.wcd[wi] = w.reload / e.rofMul;
}

/** Called by air.ts / combat for any shot; handles cooldown bookkeeping. */
export function shoot(sim: Sim, e: Entity, wi: number, t: Entity, sx?: number, sy?: number, sz?: number): void {
  fireWeapon(sim, e, wi, t, sx, sy, sz);
  if (!e.alive) return;
  startCooldown(e, wi);
  const w = e.def.weapons![wi];
  if (e.def.scoot && w.minRange) e.scootT = sim.tick + Math.round(((w.salvo ?? 1) * (w.salvoGap ?? 0.15) + 0.6) * TICK_RATE);
}

export function combatTick(sim: Sim): void {
  const list = sim.list;
  const tick = sim.tick;
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    if (!e.alive) continue;
    const d = e.def;
    if (e.regen > 0 && e.hp < e.maxHp && (tick + e.id) % 30 === 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen);
    if (d.network && (tick + e.id) % 20 === 0) {
      const near = sim.hash.query(list, e.x, e.z, 330, sim.tmp2);
      let on = false;
      for (const f of near) {
        if (f.team !== e.team || !f.def.netNode || f.progress < 1 || !f.powered) continue;
        if ((f.x - e.x) ** 2 + (f.z - e.z) ** 2 <= f.def.netNode * f.def.netNode) { on = true; break; }
      }
      e.netted = on;
    }
    if (d.swarm && (tick + e.id) % 15 === 0) {
      const near = sim.hash.query(list, e.x, e.z, 40, sim.tmp2);
      let c = 0;
      for (const f of near) if (f.team === e.team && f.def.swarm && f.def.kind === 'unit') c++;
      e.swarmed = c >= d.swarm;
    }
    if (!d.weapons || d.layer === 'air') continue;
    if (d.kind === 'structure' && (e.progress < 1 || !e.powered || e.owner < 0)) continue;
    if (e.stun > 0) continue;
    let ox = e.x, oz = e.z, rangeBonus = 0;
    if (e.inside) {
      const host = sim.byId.get(e.inside);
      if (!host || !host.alive || host.stun > 0) continue;
      ox = host.x; oz = host.z; rangeBonus = 12;
    }
    if (e.stance === 'holdfire') { e.target = 0; continue; }
    // plain move orders do not stop to shoot but still fire opportunistically
    const t0 = e.target ? sim.byId.get(e.target) : undefined;
    const good = validTarget(sim, e, t0);
    if (!good && e.target) e.target = 0;
    if ((tick + e.id) % 6 === 0 || (!good && (tick + e.id) % 3 === 0)) acquire(sim, e, ox, oz, rangeBonus);
    let t = e.target ? sim.byId.get(e.target) : undefined;
    if (!validTarget(sim, e, t)) { t = undefined; e.target = 0; }

    // turret tracking
    if (d.turret) {
      let want = e.heading;
      let tracking = false;
      if (t) {
        want = Math.atan2(t.x - ox, t.z - oz);
        tracking = true;
      }
      const diff = angDiff(e.turret, want);
      const rate = d.turret * DT * (tracking ? 1 : 0.6);
      e.turret += Math.max(-rate, Math.min(rate, diff));
    } else e.turret = e.heading;

    for (let wi = 0; wi < d.weapons.length; wi++) {
      const w = d.weapons[wi];
      e.wcd[wi] -= DT;
      if (e.wammo[wi] === 0) continue;
      // salvo continuation uses the same target
      let tgt = t;
      if (!tgt || !canHit(w, tgt)) {
        const wt = e.wtarget[wi] ? sim.byId.get(e.wtarget[wi]) : undefined;
        if (validTarget(sim, e, wt) && canHit(w, wt)) tgt = wt;
        else {
          tgt = undefined;
          e.wtarget[wi] = 0;
          if ((tick + e.id + wi) % 9 === 0) {
            const near = sim.hash.query(list, ox, oz, w.range * e.rngMul + 4, sim.tmp2);
            let bd = 1e18;
            for (const f of near) {
              if (f.team === e.team || f.owner < 0 || f.inside || f.def.prop) continue;
              if (sim.vision.enabled && e.team >= 0 && !(f.visMask & (1 << e.team))) continue;
              if (!canHit(w, f) || (w.structOnly && f.def.kind !== 'structure')) continue;
              const dd = (f.x - ox) ** 2 + (f.z - oz) ** 2;
              if (dd < bd) { bd = dd; tgt = f; }
            }
            e.wtarget[wi] = tgt ? tgt.id : 0;
          }
        }
      }
      if (e.wcd[wi] > 0 || !tgt) continue;
      const dist = Math.hypot(tgt.x - ox, tgt.z - oz) - tgt.def.radius * 0.5;
      if (dist > w.range * e.rngMul + rangeBonus * 0.5 || (w.minRange && dist < w.minRange)) continue;
      // alignment
      const want = Math.atan2(tgt.x - ox, tgt.z - oz);
      if (d.turret && !w.fixed) {
        if (Math.abs(angDiff(e.turret, want)) > 0.1) continue;
      } else if (d.kind === 'unit' && d.move !== 'foot') {
        if (Math.abs(angDiff(e.heading, want)) > 0.22) {
          if (!e.moving) faceTarget(e, tgt.x, tgt.z);
          continue;
        }
      } else if (d.move === 'foot' && !e.inside) {
        if (!e.moving) e.heading = want;
      }
      shoot(sim, e, wi, tgt);
      if (!e.alive) break;
    }
  }
}

// -------------------------------------------------------------------------------- damage
export function stun(sim: Sim, t: Entity, seconds: number, dtype: DamageType): void {
  if (DAMAGE_MATRIX[dtype][t.def.armor] <= 0) return;
  const s = seconds * (t.def.armor === 'hardened' ? 0.5 : 1);
  t.stun = Math.max(t.stun, Math.round(s * TICK_RATE));
  sim.emitAt({ k: 'boom', x: t.x, y: t.y + 2, z: t.z, size: 1.2, kind: dtype === 'cyber' ? 'cyber' : 'emp' }, t.x, t.z);
}

export function damage(sim: Sim, victim: Entity, amount: number, dtype: DamageType, attacker: Entity | null): void {
  if (!victim.alive || victim.def.prop) return;
  const mult = DAMAGE_MATRIX[dtype][victim.def.armor];
  if (mult <= 0 || amount <= 0) return;
  let dmg = amount * mult * victim.armorMul;
  if (victim.swarmed) dmg *= 0.9;
  if (victim.inside) return;
  victim.hp -= dmg;
  victim.lastHit = sim.tick;
  if (attacker) victim.lastAttackerId = attacker.id;
  if (victim.def.stealth) victim.reveal = Math.max(victim.reveal, 45);
  if (victim.owner >= 0) {
    const p = sim.players[victim.owner];
    if (sim.tick - p.lastAlertTick > 240 && (victim.owner === sim.options.viewer || sim.options.viewer < 0)) {
      p.lastAlertTick = sim.tick;
      sim.emit({ k: 'alert', type: 'attack', x: victim.x, z: victim.z, owner: victim.owner });
    }
    if (p.ai) p.ai.noteAttack(victim.x, victim.z, attacker);
  }
  if (victim.hp <= 0) killEntity(sim, victim, attacker);
}

export function killEntity(sim: Sim, e: Entity, killer: Entity | null): void {
  if (!e.alive) return;
  const d = e.def;
  const owner = e.owner;
  const heading = e.heading;
  sim.remove(e);
  if (killer && owner >= 0 && killer.owner >= 0 && killer.team !== e.team) {
    const kp = sim.players[killer.owner];
    kp.kills++;
    killer.kills++;
    addXp(killer, d.cost);
    awardRank(sim, kp, d.cost * 0.4);
  }
  if (owner >= 0) sim.players[owner].losses++;
  const big = d.kind === 'structure' || d.hp > 900;
  sim.emitAt({ k: 'death', id: e.id, def: d.id, x: e.x, y: e.y, z: e.z, owner, heading, structure: d.kind === 'structure' }, e.x, e.z);
  sim.emitAt({ k: 'boom', x: e.x, y: e.y + 1, z: e.z, size: d.kind === 'structure' ? Math.min(6, d.radius * 0.35) : Math.min(3, 0.8 + d.radius * 0.25), kind: d.layer === 'air' ? 'air' : big ? 'big' : 'gen' }, e.x, e.z);
  if (d.kind === 'structure' && owner >= 0) sim.emit({ k: 'alert', type: 'lost', x: e.x, z: e.z, owner, text: d.name });
  // splash from destroyed structures / heavy vehicles
  if (d.kind === 'structure' && !d.prop) explode(sim, e.x, e.y, e.z, d.radius * 0.9, d.hp * 0.04, 'explosive', -1, null, false, true);
}

export function awardRank(sim: Sim, p: { xp: number; rank: number; cp: number; id: number }, amount: number): void {
  p.xp += amount;
  while (p.rank < RANK_XP.length - 1 && p.xp >= RANK_XP[p.rank + 1]) {
    p.rank++;
    p.cp++;
    sim.emit({ k: 'alert', type: 'power', x: 0, z: 0, owner: p.id, text: `Rank ${p.rank}` });
  }
}

export function addXp(e: Entity, amount: number): void {
  if (e.def.kind === 'structure' || e.def.cost <= 0) return;
  e.xp += amount;
  const c = e.def.cost;
  const lvl = e.xp >= c * 10 ? 3 : e.xp >= c * 5.5 ? 2 : e.xp >= c * 2.2 ? 1 : 0;
  if (lvl > e.vet) {
    e.vet = lvl;
    pendingVet.push(e);
  }
}
export const pendingVet: Entity[] = [];

export function explode(
  sim: Sim, x: number, y: number, z: number, r: number, dmg: number, dtype: DamageType, owner: number,
  attacker: Entity | null, hitsAir: boolean, hitsGround: boolean, stunSec = 0,
): void {
  const team = owner >= 0 ? sim.players[owner].team : -99;
  const buf = sim.hash.query(sim.list, x, z, r + 8, sim.tmp2);
  const hits: Entity[] = [];
  for (const f of buf) hits.push(f);
  for (const f of hits) {
    if (!f.alive || f.inside || f.def.prop) continue;
    if (f.team === team) continue;
    const air = isAirborne(f);
    if (air ? !hitsAir : !hitsGround) continue;
    const dd = Math.max(0, Math.hypot(f.x - x, f.z - z) - f.def.radius * 0.7);
    if (dd > r) continue;
    const fall = 1 - 0.65 * (dd / Math.max(0.1, r));
    if (stunSec > 0) { stun(sim, f, stunSec, dtype); continue; }
    damage(sim, f, dmg * fall, dtype, attacker);
  }
  void y;
}

// -------------------------------------------------------------------------------- projectiles
export function stepProjectiles(sim: Sim): void {
  const ps = sim.projectiles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (!p.alive) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    const target = sim.byId.get(p.target);
    if (p.kind === 1) {
      // guided missile: home on the target
      let gx = p.tx, gy = p.ty, gz = p.tz;
      if (target && target.alive && !target.inside) { gx = target.x; gy = target.y + (isAirborne(target) ? 0 : 1.2); gz = target.z; }
      const dx = gx - p.x, dy = gy - p.y, dz = gz - p.z;
      const dist = Math.hypot(dx, dy, dz);
      const step = p.w.speed * DT;
      p.t += DT;
      if (dist <= step * 1.1 || p.t > 14) {
        p.x = gx; p.y = gy; p.z = gz;
        impact(sim, p, target);
        p.alive = false;
      } else {
        // slight launch loft for the first 0.5 s
        const loft = p.t < 0.5 ? 0.35 : 0;
        const nx = dx / dist, ny = dy / dist + loft, nz = dz / dist;
        const nl = Math.hypot(nx, ny, nz);
        p.dx = nx / nl; p.dy = ny / nl; p.dz = nz / nl;
        p.x += p.dx * step; p.y += p.dy * step; p.z += p.dz * step;
        if (p.jam && p.t > 0.8 && sim.rng() < 0.02) { p.alive = false; sim.emitAt({ k: 'boom', x: p.x, y: p.y, z: p.z, size: 0.7, kind: 'gen' }, p.x, p.z); }
      }
    } else {
      p.t += DT;
      const f = Math.min(1, p.t / p.T);
      const px = p.x, py = p.y, pz = p.z;
      p.x = p.sx + (p.tx - p.sx) * f;
      p.z = p.sz + (p.tz - p.sz) * f;
      if (p.kind === 2) p.y = p.sy + (p.ty - p.sy) * f * f;
      else p.y = p.sy + (p.ty - p.sy) * f + Math.sin(Math.PI * f) * p.arcH;
      const dx = p.x - px, dy = p.y - py, dz = p.z - pz;
      const l = Math.hypot(dx, dy, dz) || 1;
      p.dx = dx / l; p.dy = dy / l; p.dz = dz / l;
      if (f >= 1) { impact(sim, p, target); p.alive = false; }
    }
  }
  for (const e of pendingVet) {
    sim.recomputeStats(e);
    if (e.alive && e.owner >= 0) sim.emitAt({ k: 'promote', id: e.id, def: e.def.id, vet: e.vet, x: e.x, y: e.y, z: e.z, owner: e.owner }, e.x, e.z);
  }
  pendingVet.length = 0;
}

function impact(sim: Sim, p: Projectile, target: Entity | undefined): void {
  const w = p.w;
  const src = sim.byId.get(p.src) ?? null;
  const air = target ? isAirborne(target) : false;
  let ix = p.x, iz = p.z, iy = p.y;
  if (p.kind === 1 && target && target.alive) {
    // veteran pilots: flares / evasive manoeuvres defeat the missile
    if (air && target.evade > 0 && sim.rng() < target.evade) {
      sim.emitAt({ k: 'flare', x: target.x, y: target.y, z: target.z, owner: target.owner, id: target.id }, target.x, target.z);
      sim.emitAt({ k: 'boom', x: ix + (sim.rng() - 0.5) * 24, y: iy + 4, z: iz + (sim.rng() - 0.5) * 24, size: 0.7, kind: 'air' }, ix, iz);
      return;
    }
    // active protection
    if (target.def.aps && target.apsCd <= 0 && target.def.armor !== 'structure') {
      target.apsCd = target.def.aps * TICK_RATE;
      sim.emitAt({ k: 'boom', x: ix, y: iy, z: iz, size: 0.9, kind: 'air' }, ix, iz);
      return;
    }
    if (p.jam && sim.rng() < 0.55) {
      sim.emitAt({ k: 'boom', x: ix + (sim.rng() - 0.5) * 20, y: iy, z: iz + (sim.rng() - 0.5) * 20, size: 0.8, kind: 'gen' }, ix, iz);
      return;
    }
    ix = target.x; iz = target.z; iy = target.y;
  }
  const ground = sim.groundY(ix, iz);
  if (!air && p.kind !== 1) iy = Math.max(ground, ground);
  const r = w.aoe ?? 2;
  const hitsAir = w.targets.includes('air');
  const hitsGround = w.targets.includes('ground');
  if (w.stunTime) explode(sim, ix, iy, iz, Math.max(r, 4), 0, w.dtype, p.owner, src, hitsAir, hitsGround, w.stunTime);
  else explode(sim, ix, iy, iz, r, p.dmg, w.dtype, p.owner, src, hitsAir, hitsGround);
  const size = Math.max(0.5, Math.min(7, r * 0.32 + p.dmg / 260));
  sim.emitAt({ k: 'boom', x: ix, y: iy + (air ? 0 : 0.5), z: iz, size, kind: air ? 'air' : r >= 45 ? 'nuke' : r >= 12 ? 'big' : 'ground' }, ix, iz);
}
