import type { Sim, Player } from '../sim';
import { Entity, order } from '../entity';
import { DT, EntityDef, TICK_RATE } from '../types';
import { DEFS, UPGRADES } from '../defs';

// ------------------------------------------------------------------------------ placement
export function canPlace(sim: Sim, pid: number, d: EntityDef, x: number, z: number): string | null {
  const [fw, fd] = d.footprint!;
  const p = sim.players[pid];
  const nav = sim.nav;
  if (!nav.rectFree(x, z, fw, fd, 0.5)) return 'Blocked';
  // flatness
  let lo = 1e9, hi = -1e9;
  for (const [ox, oz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const h = sim.groundY(x + (ox * fw) / 2, z + (oz * fd) / 2);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  if (hi - lo > 2.4) return 'Terrain too steep';
  if (sim.vision.enabled && !sim.vision.exploredAt(p.team, x, z)) return 'Unexplored';
  // within build range of one of our complete structures
  let near = false;
  const range = d.buildRadius ?? 260;
  for (const s of sim.list) {
    if (!s.alive || s.owner !== pid || s.def.kind !== 'structure' || s.progress < 1 || s.def.prop) continue;
    if ((s.x - x) ** 2 + (s.z - z) ** 2 <= range * range) { near = true; break; }
  }
  if (!near) return 'Too far from base';
  // overlap with other structures (margin)
  for (const s of sim.list) {
    if (!s.alive || s.def.kind !== 'structure') continue;
    const [sw, sd] = s.def.footprint!;
    if (Math.abs(s.x - x) < (sw + fw) / 2 + 3 && Math.abs(s.z - z) < (sd + fd) / 2 + 3) return 'Blocked';
  }
  return null;
}

export function startConstruction(sim: Sim, p: Player, d: EntityDef, x: number, z: number, cost: number): Entity {
  p.credits -= cost;
  p.spent += cost;
  const st = sim.spawn(d.id, p.id, x, z, { complete: false, heading: 0 });
  evictUnits(sim, st);
  return st;
}

function evictUnits(sim: Sim, st: Entity): void {
  const [fw, fd] = st.def.footprint!;
  for (const u of sim.list) {
    if (!u.alive || u.def.kind !== 'unit' || u.def.layer === 'air' || u.inside) continue;
    const dx = u.x - st.x, dz = u.z - st.z;
    const hx = fw / 2 + u.def.radius, hz = fd / 2 + u.def.radius;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) u.x = st.x + Math.sign(dx || 1) * (hx + 1);
      else u.z = st.z + Math.sign(dz || 1) * (hz + 1);
      u.y = sim.groundY(u.x, u.z);
    }
  }
}

export function completeStructure(sim: Sim, st: Entity): void {
  const p = sim.player(st.owner);
  st.progress = 1;
  st.hp = st.maxHp;
  if (p) {
    p.have.set(st.def.id, (p.have.get(st.def.id) ?? 0) + 1);
    sim.emit({ k: 'alert', type: 'built', x: st.x, z: st.z, owner: st.owner, text: st.def.name });
  }
}

export function sellStructure(sim: Sim, p: Player, s: Entity): void {
  const refund = Math.round(sim.costOf(p, s.def) * 0.5 * (s.progress >= 1 ? 1 : s.progress));
  p.credits += refund;
  sim.emitAt({ k: 'death', id: s.id, def: s.def.id, x: s.x, y: s.y, z: s.z, owner: s.owner, heading: s.heading, structure: true }, s.x, s.z);
  sim.remove(s);
}

// ------------------------------------------------------------------------------ production
export function enqueue(sim: Sim, p: Player, s: Entity, defId: string): boolean {
  if (!s.alive || s.progress < 1 || !s.def.produces?.includes(defId)) return false;
  if (s.queue.length >= 9) return false;
  const up = UPGRADES.get(defId);
  if (up) {
    if (p.upgrades.has(up.id)) return false;
    for (const q of p.have) void q;
    for (const st of sim.list) if (st.alive && st.owner === p.id && st.queue.some((q) => q.def === up.id)) return false;
    if (up.tech && !up.tech.every((t) => (p.have.get(t) ?? 0) > 0)) return false;
    if (p.credits < up.cost) { sim.emit({ k: 'msg', text: 'Not enough funds', owner: p.id }); return false; }
    p.credits -= up.cost; p.spent += up.cost;
    s.queue.push({ def: up.id, done: 0, total: up.time, count: 1, upgrade: true, paid: up.cost });
    return true;
  }
  const d = DEFS.get(defId);
  if (!d || d.faction !== p.faction) return false;
  if (!sim.hasTech(p, d)) { sim.emit({ k: 'msg', text: 'Requires tech structures', owner: p.id }); return false; }
  if (sim.options.unitCap > 0 && p.units >= sim.options.unitCap) { sim.emit({ k: 'msg', text: 'Unit cap reached', owner: p.id }); return false; }
  const count = d.batch ?? 1;
  let cost = sim.costOf(p, d) * count;
  if (count > 1) cost = Math.round(cost * 0.85);
  if (p.credits < cost) { sim.emit({ k: 'msg', text: 'Not enough funds', owner: p.id }); return false; }
  if (d.roles.includes('worker')) {
    let c = 0;
    for (const e of sim.list) if (e.alive && e.owner === p.id && e.def.id === d.id) c++;
    for (const st of sim.list) if (st.alive && st.owner === p.id) for (const q of st.queue) if (q.def === d.id) c++;
    if (c >= 5) { sim.emit({ k: 'msg', text: 'Limit reached', owner: p.id }); return false; }
  }
  p.credits -= cost; p.spent += cost;
  const total = count > 1 ? d.time * count * 0.55 : d.time;
  s.queue.push({ def: d.id, done: 0, total, count, upgrade: false, paid: cost });
  return true;
}

export function cancelItem(sim: Sim, p: Player, s: Entity, index: number): void {
  const q = s.queue[index];
  if (!q) return;
  p.credits += q.paid;
  p.spent -= q.paid;
  s.queue.splice(index, 1);
  void sim;
}

function finishItem(sim: Sim, p: Player, s: Entity): void {
  const q = s.queue[0];
  if (q.upgrade) {
    p.upgrades.add(q.def);
    for (const e of sim.list) if (e.alive && e.owner === p.id) sim.recomputeStats(e);
    sim.emit({ k: 'alert', type: 'ready', x: s.x, z: s.z, owner: p.id, text: UPGRADES.get(q.def)?.name });
    s.queue.shift();
    return;
  }
  const d = DEFS.get(q.def)!;
  const air = d.layer === 'air';
  if (sim.options.unitCap > 0 && p.units + q.count > sim.options.unitCap + (q.count - 1)) return;
  const fd = s.def.footprint![1];
  for (let i = 0; i < q.count; i++) {
    let sx: number, sz: number;
    if (air) {
      const k = (s.garrisoned.length + i + sim.rng() * 6) % 6;
      sx = s.x + ((k % 3) - 1) * 16;
      sz = s.z + (Math.floor(k / 3) - 0.5) * 14;
    } else {
      const base = nearestFreeExit(sim, s.x + (i - (q.count - 1) / 2) * 6, s.z + fd / 2 + 8, d.radius);
      sx = base[0]; sz = base[1];
    }
    const e = sim.spawn(d.id, p.id, sx, sz, { heading: Math.PI * 0.0 });
    e.ax = sx; e.az = sz;
    if (air) { e.home = s.id; e.astate = 0; e.y = sim.groundY(sx, sz); }
    else if (s.rally) {
      const o = order('move', s.rally[0] + (sim.rng() - 0.5) * 8, s.rally[1] + (sim.rng() - 0.5) * 8);
      o.x2 = s.rally[0]; o.z2 = s.rally[1];
      e.orders.push(o);
    }
    if (d.deploy === 'stealth' && false) e.deployed = true;
  }
  if (p.id === sim.options.viewer || sim.options.viewer < 0) sim.emit({ k: 'alert', type: 'ready', x: s.x, z: s.z, owner: p.id, text: d.name });
  s.queue.shift();
}

function nearestFreeExit(sim: Sim, x: number, z: number, r: number): [number, number] {
  const f = sim.nav.nearestFree(x, z, 12);
  void r;
  return f ?? [x, z];
}

// ------------------------------------------------------------------------------ per-tick
export function updateEconomy(sim: Sim): void {
  const tick = sim.tick;
  if (tick % 15 === 1) calcPower(sim);
  for (const s of sim.list) {
    if (!s.alive || s.def.kind !== 'structure') continue;
    if (s.stun > 0) s.stun--;
    if (s.capProg > 0 && tick - s.buffT > 45) { s.capProg = Math.max(0, s.capProg - DT * 0.15); if (s.capProg === 0) s.capOwner = -1; }
    if (s.owner < 0) continue;
    const p = sim.players[s.owner];
    const d = s.def;
    s.powered = s.stun <= 0 && (d.noPower || (d.power ?? 0) > 0 || p.powerRatio >= 0.55);
    if (s.progress < 1) continue;
    if (d.income) p.credits += d.income * DT * p.incomeMul, p.incomeWindow.push(d.income * DT * p.incomeMul);
    if (s.queue.length) {
      const q = s.queue[0];
      if (q.done < q.total) {
        const rate = !s.powered ? 0 : p.powerRatio < 1 ? Math.max(0.35, p.powerRatio) : 1;
        q.done += DT * rate;
      }
      if (q.done >= q.total) finishItem(sim, p, s);
    }
    if (d.superweapon && sim.options.superweapons && s.powered && !s.superReady) {
      s.superCharge += DT;
      if (s.superCharge >= d.superweapon.charge) {
        s.superReady = true;
        sim.emit({ k: 'alert', type: 'super', x: s.x, z: s.z, owner: s.owner, text: d.name });
      }
    }
  }
  if (tick % TICK_RATE === 0) {
    for (const p of sim.players) {
      // income over the last ~10 s
      const w = p.incomeWindow;
      let sum = 0;
      for (const v of w) sum += v;
      w.length = 0;
      p.incomeHist.push(sum);
      if (p.incomeHist.length > 15) p.incomeHist.shift();
      p.incomeLast = sum;
      p.incomePerSec = p.incomeHist.reduce((a, b) => a + b, 0) / p.incomeHist.length;
    }
  }
}

function calcPower(sim: Sim): void {
  for (const p of sim.players) { p.powerProd = 0; p.powerUse = 0; }
  for (const s of sim.list) {
    if (!s.alive || s.owner < 0 || s.def.kind !== 'structure' || s.progress < 1) continue;
    const pw = s.def.power ?? 0;
    const p = sim.players[s.owner];
    if (pw > 0) { if (s.stun <= 0) p.powerProd += pw; } else p.powerUse += -pw;
  }
  for (const p of sim.players) p.powerRatio = p.powerUse <= 0 ? 1 : Math.min(1, p.powerProd / p.powerUse);
}
