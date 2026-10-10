import type { Sim, Player } from '../sim';
import type { Entity } from '../entity';
import { DEF_LIST, DEFS, GENERALS, POWERS, SLOTS, UPGRADES } from '../defs';
import { EntityDef, TICK_RATE } from '../types';
import { applyCommand } from '../systems/orders';
import { canPlace } from '../systems/economy';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'brutal';

export const AI_PERSONALITIES: { id: string; name: string; desc: string }[] = [
  { id: 'balanced', name: 'Balanced', desc: 'Well-rounded combined arms.' },
  { id: 'rusher', name: 'Rusher', desc: 'Early aggression with cheap units.' },
  { id: 'turtle', name: 'Turtle', desc: 'Heavy defences, late big pushes.' },
  { id: 'boomer', name: 'Booster', desc: 'Expands fast, floods the map late.' },
  { id: 'air', name: 'Air Raider', desc: 'Prioritises aircraft and drones.' },
  { id: 'artillery', name: 'Artillery', desc: 'Long-range fire support behind a wall of armour.' },
];

interface Personality {
  weights: Record<string, number>;
  firstAttack: number; // seconds
  threshold: number; // army cost needed for a wave
  build: [string, number][];
  expand: number;
  defense: number;
}

const BASE_BUILD: [string, number][] = [
  ['supply', 1], ['barracks', 1], ['factory', 1], ['power', 2], ['supply', 2], ['radar', 1], ['power', 3], ['airfield', 1],
  ['aa', 1], ['armory', 1], ['defense', 1], ['power', 4], ['factory', 2], ['tech', 1], ['power', 5], ['barracks', 2],
  ['defense', 2], ['aa', 2], ['cyber', 1], ['drone', 1], ['super', 1], ['airfield', 2], ['power', 6], ['supply', 3],
];

const PERS: Record<string, Personality> = {
  balanced: {
    weights: { infantry: 2, antitank: 1.5, tank: 4, ifv: 2, artillery: 1.4, mlrs: 1, aa: 1, heli: 1.4, fighter: 1, bomber: 0.9, drone: 0.8, scout: 0.25, support: 0.3, militia: 3, swarm: 1.4, missile: 1.4, special: 0.3, decoy: 0.1 },
    firstAttack: 420, threshold: 9000, build: BASE_BUILD, expand: 1, defense: 2,
  },
  rusher: {
    weights: { infantry: 5, antitank: 1.5, tank: 2.5, ifv: 3, scout: 2, militia: 5, swarm: 2, heli: 1, artillery: 0.3, aa: 0.6, missile: 1 },
    firstAttack: 200, threshold: 3200, build: [['barracks', 1], ['supply', 1], ['factory', 1], ['power', 2], ['barracks', 2], ['supply', 2], ['radar', 1], ['power', 3], ['factory', 2], ['airfield', 1], ['aa', 1], ['armory', 1], ['power', 4], ['tech', 1], ['super', 1]],
    expand: 0, defense: 0,
  },
  turtle: {
    weights: { infantry: 2, antitank: 2, tank: 3, ifv: 1.5, artillery: 3, mlrs: 2, aa: 1.6, heli: 0.8, fighter: 0.8, bomber: 1, missile: 2, militia: 2 },
    firstAttack: 720, threshold: 16000,
    build: [['supply', 1], ['barracks', 1], ['defense', 1], ['factory', 1], ['power', 2], ['aa', 1], ['defense', 2], ['radar', 1], ['supply', 2], ['power', 3], ['armory', 1], ['defense', 3], ['aa', 2], ['factory', 2], ['tech', 1], ['power', 4], ['defense', 4], ['airfield', 1], ['super', 1], ['power', 5], ['defense', 5]],
    expand: 1, defense: 5,
  },
  boomer: {
    weights: { infantry: 1.6, antitank: 1.4, tank: 4.5, ifv: 2, artillery: 1.4, mlrs: 1, aa: 1, heli: 1.2, fighter: 1, bomber: 1, militia: 3, swarm: 1.4, missile: 1.4 },
    firstAttack: 600, threshold: 13000,
    build: [['supply', 1], ['supply', 2], ['power', 2], ['barracks', 1], ['supply', 3], ['factory', 1], ['power', 3], ['radar', 1], ['factory', 2], ['supply', 4], ['power', 4], ['airfield', 1], ['aa', 1], ['armory', 1], ['tech', 1], ['factory', 3], ['power', 5], ['super', 1], ['defense', 1]],
    expand: 3, defense: 1,
  },
  air: {
    weights: { heli: 4, fighter: 4, bomber: 3, drone: 3, aa: 1.2, infantry: 1, tank: 1.2, antitank: 0.8, ifv: 0.8, missile: 1, swarm: 2 },
    firstAttack: 480, threshold: 8000,
    build: [['supply', 1], ['power', 2], ['barracks', 1], ['factory', 1], ['airfield', 1], ['radar', 1], ['power', 3], ['supply', 2], ['airfield', 2], ['aa', 1], ['drone', 1], ['power', 4], ['tech', 1], ['airfield', 3], ['armory', 1], ['power', 5], ['super', 1], ['aa', 2]],
    expand: 1, defense: 1,
  },
  artillery: {
    weights: { artillery: 4, mlrs: 3, tank: 2.4, infantry: 2, antitank: 1.4, aa: 1.2, ifv: 1.4, missile: 3, heli: 0.8, bomber: 0.8 },
    firstAttack: 540, threshold: 11000,
    build: [['supply', 1], ['barracks', 1], ['factory', 1], ['power', 2], ['radar', 1], ['supply', 2], ['factory', 2], ['power', 3], ['defense', 1], ['aa', 1], ['armory', 1], ['tech', 1], ['power', 4], ['defense', 2], ['super', 1], ['airfield', 1]],
    expand: 1, defense: 2,
  },
};

const DIFF = {
  easy: { think: 3.0, thresh: 1.6, army: 38, delay: 1.5, powers: false, expand: 0, bully: false },
  medium: { think: 2.0, thresh: 1.15, army: 85, delay: 1.0, powers: true, expand: 1, bully: false },
  hard: { think: 1.3, thresh: 0.9, army: 150, delay: 0.85, powers: true, expand: 2, bully: true },
  brutal: { think: 1.0, thresh: 0.75, army: 240, delay: 0.7, powers: true, expand: 3, bully: true },
};

export class AIPlayer {
  readonly pers: Personality;
  readonly diff: (typeof DIFF)['easy'];
  private slotDefs: Map<string, string>;
  private nextThink: number;
  private attackWave: Set<number> = new Set();
  private waveStart = 0;
  private waveSize = 0;
  private attacks = 0;
  private lastAttack = { x: 0, z: 0, tick: -99999 };
  private staging: [number, number];
  private target: { x: number; z: number; owner: number } | null = null;
  private lastPowerTick = 0;
  private goalCursor = 0;
  private lastReport = 0;

  constructor(readonly sim: Sim, readonly player: Player) {
    const setup = player.setup.ai!;
    this.pers = PERS[setup.personality] ?? PERS.balanced;
    this.diff = DIFF[setup.difficulty];
    this.slotDefs = new Map();
    const m = SLOTS.get(player.faction);
    if (m) for (const [k, v] of m) this.slotDefs.set(k, v);
    this.nextThink = player.id * 3;
    const [sx, sz] = player.spawn;
    const l = Math.hypot(sx, sz) || 1;
    this.staging = [sx - (sx / l) * -130, sz - (sz / l) * -130];
    // toward centre
    this.staging = [sx - (sx / l) * 130, sz - (sz / l) * 130];
  }

  noteAttack(x: number, z: number, attacker: Entity | null): void {
    if (this.sim.tick - this.lastAttack.tick > 60 || attacker) this.lastAttack = { x, z, tick: this.sim.tick };
  }

  think(): void {
    const sim = this.sim;
    if (!this.player.alive) return;
    if (sim.tick < this.nextThink) return;
    this.nextThink = sim.tick + Math.round(this.diff.think * TICK_RATE);

    const p = this.player;
    const own = { structures: [] as Entity[], dozers: [] as Entity[], trucks: [] as Entity[], army: [] as Entity[], air: [] as Entity[] };
    const enemies: Entity[] = [];
    const bit = 1 << p.team;
    for (const e of sim.list) {
      if (!e.alive) continue;
      if (e.owner === p.id) {
        const d = e.def;
        if (d.kind === 'structure') own.structures.push(e);
        else if (d.builds) own.dozers.push(e);
        else if (d.cap) own.trucks.push(e);
        else if (d.layer === 'air') own.air.push(e);
        else own.army.push(e);
      } else if (e.owner >= 0 && e.team !== p.team && !e.inside) {
        if (!sim.vision.enabled || (e.visMask & bit) || (e.def.kind === 'structure' && (e.seenMask & bit))) enemies.push(e);
      }
    }
    this.economy(own, enemies);
    this.production(own, enemies);
    this.army(own, enemies);
    if (this.diff.powers) this.powers(own, enemies);
  }

  // ---------------------------------------------------------------- economy / building
  private defFor(slot: string): EntityDef | undefined {
    const id = this.slotDefs.get(slot);
    return id ? DEFS.get(id) : undefined;
  }

  private countStruct(own: { structures: Entity[] }, id: string, includeBuilding = true): number {
    let n = 0;
    for (const s of own.structures) if (s.def.id === id && (includeBuilding || s.progress >= 1)) n++;
    return n;
  }

  private economy(own: { structures: Entity[]; dozers: Entity[]; trucks: Entity[] }, enemies: Entity[]): void {
    const sim = this.sim, p = this.player;
    const cc = own.structures.find((s) => s.def.slot === 'cc' && s.progress >= 1);
    // workers
    if (cc) {
      const dozerDef = [...DEFS.values()].find((d) => d.faction === p.faction && d.builds && d.producedBy === cc.def.id);
      const queuedDozers = own.structures.reduce((n, s) => n + s.queue.filter((q) => q.def === dozerDef?.id).length, 0);
      const want = this.diff.expand >= 2 ? 3 : 2;
      if (dozerDef && own.dozers.length + queuedDozers < want && p.credits > dozerDef.cost + 300) {
        applyCommand(sim, p.id, { t: 'produce', structure: cc.id, def: dozerDef.id });
      }
    }
    const supplies = own.structures.filter((s) => s.def.dropoff && s.progress >= 1);
    if (supplies.length) {
      const truckDef = [...DEFS.values()].find((d) => d.faction === p.faction && d.cap);
      if (truckDef) {
        const queued = own.structures.reduce((n, s) => n + s.queue.filter((q) => q.def === truckDef.id).length, 0);
        const want = Math.min(14, 3 + supplies.length * 2 + (this.pers === PERS.boomer ? 2 : 0));
        if (own.trucks.length + queued < want && p.credits > truckDef.cost + 250) {
          const sup = supplies.find((s) => s.def.produces?.includes(truckDef.id) && s.queue.length < 2);
          if (sup) applyCommand(sim, p.id, { t: 'produce', structure: sup.id, def: truckDef.id });
        }
      }
    }
    // dozer idle -> repair
    for (const dz of own.dozers) {
      if (dz.orders.length) continue;
      const hurt = own.structures.find((s) => s.progress >= 1 && s.hp < s.maxHp * 0.6 && Math.hypot(s.x - dz.x, s.z - dz.z) < 220);
      if (hurt) applyCommand(sim, p.id, { t: 'repair', ids: [dz.id], target: hurt.id });
    }
    // build order
    const idle = own.dozers.filter((d) => !d.orders.length);
    if (!idle.length || !cc) return;
    let spendLimit = p.credits;
    const build = this.pers.build;
    const inProgress = new Set(own.structures.filter((s) => s.progress < 1).map((s) => s.def.id));
    let assigned = 0;
    // power first when needed
    const powerDef = this.defFor('power');
    const needPower = p.powerUse + 6 > p.powerProd && !!powerDef && !inProgress.has(powerDef.id);
    const goals: [string, number][] = needPower ? [['power', this.countStruct(own, powerDef!.id) + 1], ...build] : build;
    for (const [slot, target] of goals) {
      if (assigned >= idle.length) break;
      const d = this.defFor(slot);
      if (!d) continue;
      if (slot === 'super' && !sim.options.superweapons) continue;
      if (slot === 'defense' && this.pers.defense === 0 && this.diff.expand < 3) continue;
      if (this.countStruct(own, d.id) >= target) continue;
      if (d.unique && this.countStruct(own, d.id) >= 1) continue;
      if (!sim.hasTech(p, d)) {
        // missing prerequisite: try to build it instead
        const miss = d.tech?.find((t) => !(p.have.get(t) ?? 0));
        if (miss && !inProgress.has(miss)) { const slotOf = DEFS.get(miss)?.slot; if (slotOf) this.tryBuild(slotOf, idle[assigned], own) && assigned++; }
        break; // follow build order strictly
      }
      if (inProgress.has(d.id) && slot !== 'power') break;
      const cost = sim.costOf(p, d);
      if (spendLimit < cost) break;
      if (slot === 'supply' && this.countStruct(own, d.id) >= 1 + this.diff.expand + (this.pers.expand ?? 0) && this.countStruct(own, d.id) >= 2) continue;
      if (this.tryBuild(slot, idle[assigned], own)) { assigned++; spendLimit -= cost; inProgress.add(d.id); }
      else if (slot === 'supply') continue;
      else break;
    }
    void enemies;
  }

  private tryBuild(slot: string, dozer: Entity, own: { structures: Entity[] }): boolean {
    const sim = this.sim, p = this.player;
    const d = this.defFor(slot);
    if (!d || !dozer.def.builds?.includes(d.id)) return false;
    const site = this.findSite(d, slot, own);
    if (!site) return false;
    const before = p.credits;
    applyCommand(sim, p.id, { t: 'build', ids: [dozer.id], def: d.id, x: site[0], z: site[1] });
    return p.credits < before;
  }

  private findSite(d: EntityDef, slot: string, own: { structures: Entity[] }): [number, number] | null {
    const sim = this.sim, p = this.player;
    const [sx, sz] = p.spawn;
    const center = own.structures.find((s) => s.def.slot === 'cc') ?? null;
    const cx = center ? center.x : sx, cz = center ? center.z : sz;
    const toC = Math.atan2(-sz, -sx); // direction toward map centre
    const rng = sim.rng;
    const valid = (x: number, z: number) => {
      if (canPlace(sim, p.id, d, x, z)) return false;
      for (const s of sim.list) {
        if (!s.alive || !s.def.prop && !s.def.income) continue;
        if (Math.hypot(s.x - x, s.z - z) < 24) return false;
      }
      for (const s of own.structures) if (s.def.dropoff && Math.hypot(s.x - x, s.z - z) < 40 && slot !== 'supply') return false;
      // keep a corridor open in front of production buildings
      return true;
    };
    if (slot === 'supply') {
      // expansion: nearest depot not covered by one of our drop-offs
      let best: Entity | null = null, bd = 1e18;
      const drops = own.structures.filter((s) => s.def.dropoff);
      for (const dep of sim.list) {
        if (!dep.alive || !dep.def.supply || dep.supplyLeft < 2000) continue;
        if (!sim.nav.connected(sx, sz, dep.x, dep.z)) continue; // piles inside cliff pockets are useless
        if (drops.some((s) => Math.hypot(s.x - dep.x, s.z - dep.z) < 110)) continue;
        // not in enemy territory: closer to us than to any enemy spawn
        let mine = Math.hypot(dep.x - sx, dep.z - sz);
        let enemyD = 1e9;
        for (const q of sim.players) if (q.id !== p.id && q.team !== p.team) enemyD = Math.min(enemyD, Math.hypot(dep.x - q.spawn[0], dep.z - q.spawn[1]));
        if (mine > enemyD * 0.95 || mine > 520) continue;
        mine = mine;
        const dd = Math.hypot(dep.x - cx, dep.z - cz);
        if (dd < bd) { bd = dd; best = dep; }
      }
      if (!best) {
        if (own.structures.filter((s) => s.def.dropoff).length >= 1) return null;
        best = sim.list.find((e) => e.def.supply && Math.hypot(e.x - sx, e.z - sz) < 160 && sim.nav.connected(sx, sz, e.x, e.z)) ?? null;
        if (!best) return null;
      }
      for (let k = 0; k < 40; k++) {
        const a = rng() * Math.PI * 2, r = 24 + rng() * 26;
        const x = best.x + Math.sin(a) * r, z = best.z + Math.cos(a) * r;
        if (valid(x, z)) return [x, z];
      }
      return null;
    }
    const defensive = slot === 'defense' || slot === 'aa' || slot === 'bunker';
    for (let k = 0; k < 80; k++) {
      let x: number, z: number;
      if (defensive) {
        const a = toC + (rng() - 0.5) * 2.2, r = 60 + rng() * 60;
        x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
      } else {
        const a = rng() * Math.PI * 2, r = 42 + rng() * (60 + Math.min(60, k * 1.5));
        x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
      }
      if (valid(x, z)) return [x, z];
    }
    return null;
  }

  // ---------------------------------------------------------------- production
  private production(own: { structures: Entity[]; army: Entity[]; air: Entity[] }, enemies: Entity[]): void {
    const sim = this.sim, p = this.player;
    const armySize = own.army.length + own.air.length;
    if (armySize >= this.diff.army) return;
    let enemyAir = 0, enemyArmor = 0;
    for (const e of enemies) {
      if (e.def.layer === 'air') enemyAir++;
      else if (e.def.armor === 'heavy') enemyArmor++;
    }
    const w = this.pers.weights;
    // most expensive production first, so money is saved for the units we actually want
    const prods = own.structures
      .filter((s) => s.progress >= 1 && s.def.produces && s.def.slot !== 'cc' && !s.def.dropoff && s.queue.length < (this.diff.expand >= 2 ? 3 : 2))
      .sort((a, b) => (b.def.slot === 'factory' || b.def.slot === 'airfield' || b.def.slot === 'tech' ? 1 : 0) - (a.def.slot === 'factory' || a.def.slot === 'airfield' || a.def.slot === 'tech' ? 1 : 0));
    let budget = p.credits - (own.army.length > 10 ? 150 : 0);
    for (const s of prods) {
      // research first
      for (const id of s.def.produces!) {
        const up = UPGRADES.get(id);
        if (up && !p.upgrades.has(id) && !s.queue.length && budget > up.cost + 2500 && own.army.length > 8) { applyCommand(sim, p.id, { t: 'produce', structure: s.id, def: id }); budget -= up.cost; break; }
      }
      const options: { d: EntityDef; w: number; cost: number }[] = [];
      for (const id of s.def.produces!) {
        const d = DEFS.get(id);
        if (!d || !sim.hasTech(p, d)) continue;
        if (d.builds || d.cap) continue;
        const cost = sim.costOf(p, d) * (d.batch ?? 1);
        let weight = 0;
        for (const r of d.roles) weight = Math.max(weight, w[r] ?? 0.2);
        if (d.roles.includes('aa')) weight *= enemyAir > 2 ? 3 : enemyAir > 0 ? 1.4 : 0.35;
        if (d.roles.includes('antitank')) weight *= enemyArmor > 3 ? 1.8 : 1;
        if (d.roles.includes('fighter') && enemyAir > 2) weight *= 1.8;
        if (d.roles.includes('support') || d.roles.includes('special')) weight *= 0.5;
        if (d.roles.includes('decoy')) weight *= 0.4;
        if (weight > 0) options.push({ d, w: weight, cost });
      }
      if (!options.length) continue;
      let sum = 0;
      for (const o of options) sum += o.w;
      let r = sim.rng() * sum;
      let pick = options[0];
      for (const o of options) { r -= o.w; if (r <= 0) { pick = o; break; } }
      if (budget >= pick.cost) {
        applyCommand(sim, p.id, { t: 'produce', structure: s.id, def: pick.d.id });
        budget -= pick.cost;
      } else if (own.army.length < 8 && budget >= 150) {
        // tiny army: take the cheapest useful unit instead of waiting
        const cheap = options.filter((o) => o.cost <= budget).sort((a, b) => b.w - a.w)[0];
        if (cheap) { applyCommand(sim, p.id, { t: 'produce', structure: s.id, def: cheap.d.id }); budget -= cheap.cost; }
      } else budget = 0; // save up for the unit we want
      if (!s.rally) s.rally = [...this.staging] as [number, number];
    }
  }

  // ---------------------------------------------------------------- army
  private army(own: { structures: Entity[]; army: Entity[]; air: Entity[]; trucks: Entity[] }, enemies: Entity[]): void {
    const sim = this.sim, p = this.player;
    const army = own.army.filter((e) => !e.def.roles.includes('support') || e.def.weapons);
    const mobile = army.filter((e) => e.def.speed && e.def.weapons?.length);
    const now = sim.tick;
    const time = sim.time;

    // ---- defend
    const underAttack = now - this.lastAttack.tick < 20 * TICK_RATE;
    if (underAttack) {
      const [bx, bz] = p.spawn;
      const near = Math.hypot(this.lastAttack.x - bx, this.lastAttack.z - bz) < 260 || own.structures.some((s) => Math.hypot(s.x - this.lastAttack.x, s.z - this.lastAttack.z) < 120);
      if (near) {
        const ids = mobile.filter((e) => !this.attackWave.has(e.id) || Math.hypot(e.x - this.lastAttack.x, e.z - this.lastAttack.z) < 400).filter((e) => !e.orders.length || e.orders[0].k === 'move' && !e.orders[0].amove).map((e) => e.id);
        if (ids.length) applyCommand(sim, p.id, { t: 'move', ids, x: this.lastAttack.x, z: this.lastAttack.z, attack: true });
        const air = own.air.filter((a) => !a.orders.length).map((a) => a.id);
        const tgt = enemies.find((e) => Math.hypot(e.x - this.lastAttack.x, e.z - this.lastAttack.z) < 90);
        if (air.length && tgt) applyCommand(sim, p.id, { t: 'attack', ids: air, target: tgt.id });
      }
    }

    // ---- grab free oil derricks near home with an idle capture-capable squad
    if (this.diff.expand >= 1 || this.pers === PERS.boomer) {
      const [bx, bz] = p.spawn;
      let best: Entity | null = null, bd = 430 * 430;
      for (const d of sim.list) {
        if (!d.alive || d.owner !== -1 || !d.def.income) continue;
        const dd = (d.x - bx) ** 2 + (d.z - bz) ** 2;
        if (dd < bd && !mobile.some((u) => u.orders.some((o) => o.k === 'capture' && o.target === d.id))) { bd = dd; best = d; }
      }
      if (best) {
        const squad = mobile.find((u) => u.def.captures && !u.orders.length && !u.target && !this.attackWave.has(u.id));
        if (squad) applyCommand(sim, p.id, { t: 'capture', ids: [squad.id], target: best.id });
      }
    }

    // ---- reserve units gather at staging
    const reserve = mobile.filter((e) => !this.attackWave.has(e.id));
    for (const e of reserve) {
      if (e.orders.length || e.target) continue;
      if (Math.hypot(e.x - this.staging[0], e.z - this.staging[1]) > 60) {
        // spread via the shared command below
      }
    }
    const lazy = reserve.filter((e) => !e.orders.length && !e.target && Math.hypot(e.x - this.staging[0], e.z - this.staging[1]) > 70);
    if (lazy.length) applyCommand(sim, p.id, { t: 'move', ids: lazy.map((e) => e.id), x: this.staging[0], z: this.staging[1] });

    // ---- wave management
    for (const id of [...this.attackWave]) { const e = sim.byId.get(id); if (!e || !e.alive) this.attackWave.delete(id); }
    if (this.attackWave.size) {
      const alive = this.attackWave.size;
      const timeout = time - this.waveStart > 420;
      if (alive < this.waveSize * 0.25 || timeout) {
        // retreat and regroup
        const ids = [...this.attackWave];
        applyCommand(sim, p.id, { t: 'move', ids, x: this.staging[0], z: this.staging[1] });
        this.attackWave.clear();
        this.target = null;
      } else {
        // retarget idle wave units
        const idleIds = [...this.attackWave].filter((id) => { const e = sim.byId.get(id)!; return !e.orders.length && !e.target; });
        if (idleIds.length) {
          const first = sim.byId.get(idleIds[0])!;
          const tgt = this.nearestEnemy(enemies, first.x, first.z, true);
          if (tgt) applyCommand(sim, p.id, { t: 'move', ids: idleIds, x: tgt.x, z: tgt.z, attack: true });
          else if (this.target) applyCommand(sim, p.id, { t: 'move', ids: idleIds, x: this.target.x, z: this.target.z, attack: true });
        }
      }
    } else {
      let strength = 0;
      for (const e of reserve) strength += e.def.cost;
      const need = this.pers.threshold * this.diff.thresh * (1 + this.attacks * 0.12) * (this.attacks === 0 ? 1 : 1);
      const ready = time >= this.pers.firstAttack * this.diff.delay;
      if (ready && strength >= need && reserve.length >= 6) this.launchWave(reserve, enemies);
    }

    // ---- aircraft hunt individually
    for (const a of own.air) {
      if (a.orders.length || a.astate === 5 || a.astate === 6) continue;
      if (a.def.rearm && a.astate === 0 && a.wammo.some((w, i) => a.def.weapons![i].ammo && w < Math.min(3, a.def.weapons![i].ammo!))) continue;
      let best: Entity | null = null, bd = 1e18;
      const bomber = a.def.roles.includes('bomber') && !a.def.roles.includes('fighter');
      for (const e of enemies) {
        if (e.inside) continue;
        if (bomber && e.def.kind !== 'structure') continue;
        const d2 = (e.x - a.x) ** 2 + (e.z - a.z) ** 2;
        let sc = d2;
        if (e.def.kind === 'structure' && !a.def.weapons!.some((w) => w.structOnly)) sc *= 1.5;
        if (e.def.weapons?.some((w) => w.targets.includes('air'))) sc *= 1.6;
        if (sc < bd) {
          // check a weapon can hit
          let ok = false;
          for (const w of a.def.weapons!) { const lay = e.def.layer === 'air' && e.astate !== 0 ? 'air' : 'ground'; if (w.targets.includes(lay)) ok = true; }
          if (ok) { bd = sc; best = e; }
        }
      }
      if (best) applyCommand(sim, p.id, { t: 'attack', ids: [a.id], target: best.id });
    }
  }

  private nearestEnemy(enemies: Entity[], x: number, z: number, structuresFirst = false): Entity | null {
    let best: Entity | null = null, bd = 1e18;
    for (const e of enemies) {
      if (e.def.prop) continue;
      const d2 = (e.x - x) ** 2 + (e.z - z) ** 2;
      const sc = d2 * (structuresFirst && e.def.kind === 'structure' && e.def.roles.includes('economy') && !e.def.income ? 0.8 : 1) * (e.def.kind === 'unit' ? 0.7 : 1);
      if (sc < bd) { bd = sc; best = e; }
    }
    return best;
  }

  private launchWave(reserve: Entity[], enemies: Entity[]): void {
    const sim = this.sim, p = this.player;
    // pick victim: nearest enemy player (or strongest for hard AIs)
    const foes = sim.players.filter((q) => q.alive && q.team !== p.team);
    if (!foes.length) return;
    let victim = foes[0];
    let bd = 1e18;
    for (const q of foes) {
      let sc = Math.hypot(q.spawn[0] - p.spawn[0], q.spawn[1] - p.spawn[1]);
      if (this.diff.bully) sc -= q.structures * 18 + q.units * 6;
      if (sc < bd) { bd = sc; victim = q; }
    }
    let tx = victim.spawn[0], tz = victim.spawn[1];
    const known = enemies.filter((e) => e.owner === victim.id && e.def.kind === 'structure');
    if (known.length) {
      const k = this.nearestEnemy(known, p.spawn[0], p.spawn[1]);
      if (k) { tx = k.x; tz = k.z; }
    }
    this.target = { x: tx, z: tz, owner: victim.id };
    this.attackWave = new Set(reserve.map((e) => e.id));
    this.waveSize = reserve.length;
    this.waveStart = sim.time;
    this.attacks++;
    applyCommand(sim, p.id, { t: 'move', ids: reserve.map((e) => e.id), x: tx, z: tz, attack: true });
  }

  // ---------------------------------------------------------------- powers
  private powers(own: { structures: Entity[]; army: Entity[] }, enemies: Entity[]): void {
    const sim = this.sim, p = this.player;
    const g = GENERALS.get(p.setup.general);
    if (!g) return;
    // unlock in tier order
    for (const id of g.powers) {
      const pd = POWERS.get(id);
      if (pd && !p.unlocked.has(id) && p.cp >= pd.cost) { applyCommand(sim, p.id, { t: 'unlock', power: id }); }
    }
    if (sim.tick - this.lastPowerTick < 5 * TICK_RATE) return;
    // best enemy cluster
    let cluster: { x: number; z: number; n: number } | null = null;
    const cell = new Map<string, { x: number; z: number; n: number }>();
    for (const e of enemies) {
      if (e.def.prop) continue;
      const k = `${Math.floor(e.x / 70)}_${Math.floor(e.z / 70)}`;
      const c = cell.get(k) ?? { x: 0, z: 0, n: 0 };
      const wgt = e.def.kind === 'structure' ? 3 : 1;
      c.x += e.x * wgt; c.z += e.z * wgt; c.n += wgt;
      cell.set(k, c);
    }
    for (const c of cell.values()) if (!cluster || c.n > cluster.n) cluster = c;
    const ct = cluster && cluster.n >= 4 ? { x: cluster.x / cluster.n, z: cluster.z / cluster.n } : null;
    for (const id of p.unlocked) {
      const pd = POWERS.get(id)!;
      if ((p.powerCd.get(id) ?? 0) > sim.tick) continue;
      const k = pd.effect.kind;
      if (k === 'repair') {
        const hurt = own.army.filter((e) => e.hp < e.maxHp * 0.55);
        if (hurt.length >= 5) { applyCommand(sim, p.id, { t: 'power', power: id, x: hurt[0].x, z: hurt[0].z }); this.lastPowerTick = sim.tick; return; }
      } else if (k === 'reveal') {
        if (p.alive && sim.time > 300 && this.target) { applyCommand(sim, p.id, { t: 'power', power: id, x: this.target.x, z: this.target.z }); this.lastPowerTick = sim.tick; return; }
      } else if (ct) {
        applyCommand(sim, p.id, { t: 'power', power: id, x: ct.x, z: ct.z });
        this.lastPowerTick = sim.tick;
        return;
      }
    }
    // superweapon
    for (const s of own.structures) {
      if (s.def.superweapon && s.superReady) {
        const foes = enemies.filter((e) => e.def.kind === 'structure' && !e.def.prop);
        const t = foes.length ? foes.reduce((a, b) => (b.def.cost > a.def.cost ? b : a)) : null;
        const tgt = ct ?? (t ? { x: t.x, z: t.z } : null);
        if (tgt) { applyCommand(sim, p.id, { t: 'power', power: s.def.superweapon.power, x: tgt.x, z: tgt.z }); this.lastPowerTick = sim.tick; return; }
      }
    }
    void DEF_LIST; void this.goalCursor; void this.lastReport;
  }
}
