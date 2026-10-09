import { buildMap, MapDef, MAP_BY_ID, spawnIndex } from '../maps/maps';
import { HeightField } from '../maps/heightfield';
import { mulberry32 } from '../procgen/noise';
import { Entity, Order, order } from './entity';
import { FlowCache, NavGrid } from './nav';
import { SpatialHash } from './spatial';
import { DEF_INDEX, DEF_LIST, GENERALS, UPGRADES, POWERS, def as getDef, slotDef } from './defs';
import {
  Command, DT, ENT_STRIDE, F_AIRBORNE, F_BUILDING, F_CAPTURING, F_DAMAGED, F_DEPLOYED, F_FIRING, F_GARRISON, F_GHOST, F_HARVESTING,
  F_MOVING, F_NEUTRAL, F_STEALTH, F_STUNNED, F_UNPOWERED, GameOptions, GeneralDef, InitMsg, PlayerInfo, PlayerSetup, PROJ_STRIDE,
  QueueInfo, SimEvent, Snapshot, SuperInfo, WeaponDef, EntityDef, TICK_RATE, Role,
} from './types';
import { Vision, updateVision } from './systems/vision';
import { applyCommand, stepUnit, separate } from './systems/orders';
import { combatTick, stepProjectiles, addXp } from './systems/combat';
import { updateEconomy } from './systems/economy';
import { stepAir } from './systems/air';
import { stepPowers, PowerState } from './systems/powers';
import { AIPlayer } from './ai/ai';

export interface Projectile {
  id: number;
  w: WeaponDef;
  vfx: number;
  owner: number;
  team: number;
  src: number;
  target: number;
  kind: 0 | 1 | 2;
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  tx: number; ty: number; tz: number;
  t: number;
  T: number;
  arcH: number;
  dmg: number;
  jam: boolean;
  dx: number; dy: number; dz: number;
  alive: boolean;
}

export const RANK_XP = [0, 300, 800, 1500, 2500, 3800, 5400, 7500, 10000];

export class Player {
  team = 0;
  ai: AIPlayer | null = null;
  credits = 0;
  powerProd = 0;
  powerUse = 0;
  powerRatio = 1;
  cp = 0;
  rank = 0;
  xp = 0;
  unlocked = new Set<string>();
  powerCd = new Map<string, number>();
  upgrades = new Set<string>();
  have = new Map<string, number>();
  alive = true;
  kills = 0;
  losses = 0;
  spent = 0;
  units = 0;
  structures = 0;
  incomeMul = 1;
  incomeWindow: number[] = [];
  incomeHist: number[] = [];
  incomeLast = 0;
  incomePerSec = 0;
  general: GeneralDef;
  spawn: [number, number] = [0, 0];
  defeatedAt = 0;
  lastAlertTick = -9999;

  constructor(readonly id: number, readonly setup: PlayerSetup) {
    this.general = GENERALS.get(setup.general) ?? [...GENERALS.values()].find((g) => g.faction === setup.faction)!;
  }
  get faction() { return this.setup.faction; }
}

export class Sim {
  readonly map: MapDef;
  readonly hf: HeightField;
  readonly nav: NavGrid;
  readonly flow: FlowCache;
  readonly hash: SpatialHash;
  readonly rng: () => number;
  list: Entity[] = [];
  byId = new Map<number, Entity>();
  nextId = 1;
  tick = 0;
  players: Player[] = [];
  teamCount = 0;
  projectiles: Projectile[] = [];
  events: SimEvent[] = [];
  vision: Vision;
  ais: AIPlayer[] = [];
  winner: number[] | null = null;
  ended = false;
  viewTeam = 0;
  cmdQueue: { pid: number; cmd: Command }[] = [];
  powerState = new PowerState();
  emitEvents = true;
  tmp: Entity[] = [];
  tmp2: Entity[] = [];
  nextProjId = 1;
  perf = { tickMs: 0, ents: 0, paths: 0 };
  options: GameOptions;
  pending: { t: number; fn: () => void }[] = [];
  orderSummary: Record<number, string> = {};

  constructor(init: InitMsg, hfOverride?: HeightField) {
    this.map = MAP_BY_ID[init.map];
    this.hf = hfOverride ?? buildMap(init.map).hf;
    this.options = init.options;
    this.rng = mulberry32(init.seed);
    this.nav = new NavGrid(this.hf, this.map.waterLevel ?? null, 4);
    this.flow = new FlowCache(this.nav, 36);
    this.hash = new SpatialHash(this.map.size);

    // players & teams
    const labels = new Map<number, number>();
    init.players.forEach((s, i) => {
      const p = new Player(i, s);
      if (s.teamLabel > 0) {
        if (!labels.has(s.teamLabel)) labels.set(s.teamLabel, labels.size);
        p.team = labels.get(s.teamLabel)!;
      } else {
        p.team = -1;
      }
      this.players.push(p);
    });
    // FFA players get their own team index after labelled teams
    let next = labels.size;
    for (const p of this.players) if (p.team === -1) p.team = next++;
    this.teamCount = next;
    this.vision = new Vision(this.map.size, this.teamCount, this.options.fog);
    this.viewTeam = this.options.viewer >= 0 ? this.players[this.options.viewer]?.team ?? 0 : -1;

    for (const p of this.players) {
      p.credits = this.options.startCredits;
      p.incomeMul = p.setup.ai?.difficulty === 'brutal' ? 1.5 : p.setup.ai?.difficulty === 'easy' ? 0.85 : 1;
    }

    this.placeNeutrals();
    this.placeBases();
    for (const p of this.players) if (p.setup.ai) { p.ai = new AIPlayer(this, p); this.ais.push(p.ai); }
  }

  // ------------------------------------------------------------------ helpers
  ent(id: number): Entity | undefined { return this.byId.get(id); }
  player(owner: number): Player | undefined { return owner >= 0 ? this.players[owner] : undefined; }
  def(id: string): EntityDef { return getDef(id); }
  groundY(x: number, z: number): number { return this.hf.heightAt(x, z); }
  get time(): number { return this.tick * DT; }

  emit(ev: SimEvent): void {
    if (!this.emitEvents) return;
    this.events.push(ev);
  }
  /** emit only if the position is visible to the view team (cheap fog filter) */
  emitAt(ev: SimEvent, x: number, z: number): void {
    if (!this.emitEvents) return;
    if (this.viewTeam < 0 || this.vision.visibleAt(this.viewTeam, x, z)) this.events.push(ev);
  }

  isEnemy(a: Entity, b: Entity): boolean {
    return a.team !== b.team && a.owner >= 0 && b.owner >= 0;
  }
  teamsAllied(a: number, b: number): boolean { return this.players[a]?.team === this.players[b]?.team; }

  /** cost with general discounts */
  costOf(p: Player, d: EntityDef): number {
    let m = 1;
    const gm = p.general.costMul;
    if (gm) for (const r of d.roles) if (gm[r] !== undefined) m = Math.min(m, gm[r]);
    return Math.round(d.cost * m);
  }

  // ------------------------------------------------------------------ spawning
  spawn(defId: string, owner: number, x: number, z: number, opts: { heading?: number; complete?: boolean; free?: boolean } = {}): Entity {
    const d = getDef(defId);
    const e = new Entity(d);
    e.id = this.nextId++;
    e.owner = owner;
    e.team = owner >= 0 ? this.players[owner].team : -1;
    e.x = x; e.z = z;
    e.heading = opts.heading ?? this.rng() * Math.PI * 2;
    e.turret = e.heading;
    e.born = this.tick;
    e.progress = d.kind === 'structure' && opts.complete === false ? 0.02 : 1;
    e.stance = 'aggressive';
    if (d.weapons) {
      for (const w of d.weapons) { e.wcd.push(0); e.wburst.push(0); e.wammo.push(w.ammo ?? -1); e.wtarget.push(0); }
    }
    if (d.supply) e.supplyLeft = d.supply;
    const fly = d.layer === 'air' ? 0 : 0;
    e.y = this.hf.heightAt(x, z) + fly;
    e.astate = 0;
    this.recomputeStats(e, true);
    if (d.kind === 'structure') {
      this.nav.addBlock(x, z, d.footprint![0], d.footprint![1], 1);
      if (e.progress < 1) e.hp = Math.max(1, e.maxHp * e.progress);
    }
    e.lastX = x; e.lastZ = z;
    this.list.push(e);
    this.byId.set(e.id, e);
    const p = this.player(owner);
    if (p) {
      if (d.kind === 'unit') p.units++;
      else if (!d.prop) { p.structures++; if (e.progress >= 1) p.have.set(d.id, (p.have.get(d.id) ?? 0) + 1); }
    }
    if (d.layer === 'air') { e.y = e.y; }
    if (d.superweapon) e.superCharge = 0;
    return e;
  }

  recomputeStats(e: Entity, fresh = false): void {
    const d = e.def;
    const p = this.player(e.owner);
    let hpMul = 1, dmgMul = 1, spd = 1, vis = 1, rng = 1, rof = 1;
    if (p) {
      const g = p.general;
      for (const r of d.roles) {
        if (g.hpMul?.[r]) hpMul *= g.hpMul[r];
        if (g.dmgMul?.[r]) dmgMul *= g.dmgMul[r];
        if (g.speedMul?.[r]) spd *= g.speedMul[r];
      }
      for (const uid of p.upgrades) {
        const u = UPGRADES.get(uid);
        if (!u) continue;
        const hit = u.roles.includes('all') || d.roles.some((r) => u.roles.includes(r));
        if (!hit) continue;
        if (u.hpMul) hpMul *= u.hpMul;
        if (u.dmgMul) dmgMul *= u.dmgMul;
        if (u.speedMul) spd *= u.speedMul;
        if (u.visionMul) vis *= u.visionMul;
        if (u.rangeMul) rng *= u.rangeMul;
      }
    }
    const v = e.vet;
    hpMul *= [1, 1.15, 1.3, 1.5][v];
    dmgMul *= [1, 1.1, 1.25, 1.4][v];
    rof *= [1, 1, 1.1, 1.2][v];
    vis *= [1, 1.1, 1.2, 1.3][v];
    const old = e.maxHp;
    e.maxHp = d.hp * hpMul;
    if (fresh) e.hp = e.maxHp;
    else e.hp = Math.min(e.maxHp, e.hp * (e.maxHp / old));
    e.dmgMul = dmgMul; e.spdMul = spd; e.visMul = vis; e.rngMul = rng; e.rofMul = rof;
  }

  /** Remove an entity: (silent=true skips explosions / rewards) */
  remove(e: Entity): void {
    if (!e.alive) return;
    e.alive = false;
    const d = e.def;
    const p = this.player(e.owner);
    if (d.kind === 'structure') {
      this.nav.addBlock(e.x, e.z, d.footprint![0], d.footprint![1], -1);
      if (p && !d.prop) {
        p.structures--;
        if (e.progress >= 1) p.have.set(d.id, Math.max(0, (p.have.get(d.id) ?? 1) - 1));
      }
    } else if (p) p.units--;
    if (e.garrisoned.length) {
      for (const id of e.garrisoned) {
        const g = this.byId.get(id);
        if (!g) continue;
        g.inside = 0;
        g.x = e.x + (this.rng() - 0.5) * 16; g.z = e.z + (this.rng() - 0.5) * 16;
        g.y = this.groundY(g.x, g.z);
      }
      e.garrisoned = [];
    }
    if (e.inside) {
      const host = this.byId.get(e.inside);
      if (host) host.garrisoned = host.garrisoned.filter((i) => i !== e.id);
      e.inside = 0;
    }
  }

  queueCommand(pid: number, cmd: Command): void { this.cmdQueue.push({ pid, cmd }); }

  // ------------------------------------------------------------------ world setup
  private placeNeutrals(): void {
    for (const [x, z, amt] of this.map.depots) {
      const e = this.spawn('n_depot', -1, x, z, { heading: 0 });
      e.supplyLeft = amt;
    }
    for (const [x, z] of this.map.derricks) this.spawn('n_derrick', -1, x, z, { heading: 0 });
    for (const c of this.map.civ) this.spawn(c.def, -1, c.x, c.z, { heading: Math.round(this.rng() * 4) * (Math.PI / 2) });
  }

  private placeBases(): void {
    const n = this.players.length;
    this.players.forEach((p, i) => {
      const si = p.setup.spawn ?? spawnIndex(this.map, n, i);
      const [sx, sz] = this.map.spawns[si];
      p.spawn = [sx, sz];
      const f = p.faction;
      const cc = slotDef(f, 'cc')!, supply = slotDef(f, 'supply')!, power = slotDef(f, 'power')!;
      const toward = Math.atan2(-sx, -sz);
      this.spawn(cc, i, sx, sz, { heading: toward });
      this.spawn(supply, i, sx + 46, sz + 14, { heading: toward });
      this.spawn(power, i, sx - 44, sz + 6, { heading: toward });
      if (this.options.techStart) {
        const extra: [string, number, number][] = [['barracks', 0, 46], ['factory', -14, -54], ['radar', 52, -40], ['airfield', -84, -40]];
        for (const [slot, ox, oz] of extra) { const id = slotDef(f, slot); if (id) this.spawn(id, i, sx + ox, sz + oz, { heading: toward }); }
      }
      const dozer = [...getDefsFor(f)].find((d) => d.builds && d.kind === 'unit')!;
      const truck = [...getDefsFor(f)].find((d) => d.cap)!;
      this.spawn(dozer.id, i, sx + 24, sz - 30, { heading: toward });
      for (let k = 0; k < 2; k++) this.spawn(truck.id, i, sx + 62 + k * 8, sz - 6, { heading: toward });
      for (const sid of p.general.startUnits ?? []) this.spawn(sid, i, sx + 30, sz + 40, { heading: toward });
    });
  }

  // ------------------------------------------------------------------ queries used by systems
  structuresOf(owner: number, defId?: string): Entity[] {
    const out: Entity[] = [];
    for (const e of this.list) if (e.alive && e.owner === owner && e.def.kind === 'structure' && (!defId || e.def.id === defId)) out.push(e);
    return out;
  }
  hasTech(p: Player, d: EntityDef): boolean {
    if (this.options.techStart && false) return true;
    if (!d.tech) return true;
    for (const t of d.tech) if (!(p.have.get(t) ?? 0)) return false;
    return true;
  }

  // ------------------------------------------------------------------ main tick
  step(): void {
    const t0 = performance.now();
    this.tick++;
    this.events.length = 0;
    this.orderSummary = {};
    if (this.ended) { this.perf.tickMs = 0; return; }

    while (this.cmdQueue.length) { const c = this.cmdQueue.shift()!; applyCommand(this, c.pid, c.cmd); }
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.tick >= this.pending[i].t) { const p = this.pending[i]; this.pending.splice(i, 1); p.fn(); }

    const list = this.list;
    this.hash.rebuild(list, list.length);

    for (const ai of this.ais) ai.think();
    updateEconomy(this);

    const n = list.length;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e.alive || e.def.kind !== 'unit' || e.inside) continue;
      if (e.ttl && this.tick >= e.ttl) { this.remove(e); this.emitAt({ k: 'boom', x: e.x, y: e.y, z: e.z, size: 1, kind: 'gen' }, e.x, e.z); continue; }
      if (e.def.layer === 'air') stepAir(this, e); else stepUnit(this, e);
    }
    separate(this);
    combatTick(this);
    stepProjectiles(this);
    stepPowers(this);
    updateVision(this);

    // compact the list
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.alive) list[w++] = e;
      else this.byId.delete(e.id);
    }
    list.length = w;

    if (this.tick % TICK_RATE === 0) this.checkVictory();
    this.perf.tickMs = performance.now() - t0;
    this.perf.ents = list.length;
    this.perf.paths = this.flow.computed;
  }

  // ------------------------------------------------------------------ victory
  private checkVictory(): void {
    for (const p of this.players) {
      if (!p.alive) continue;
      let live = false;
      for (const e of this.list) {
        if (!e.alive || e.owner !== p.id) continue;
        if (e.def.kind === 'structure' && !e.def.prop && !e.def.income && !e.def.roles.includes('wall') && !e.def.garrison) { live = true; break; }
        if (e.def.kind === 'structure' && e.def.garrison && e.def.faction !== 'neutral') { /* defensive bunker alone doesn't keep you alive */ }
        if (e.def.builds) { live = true; break; }
      }
      if (!live) this.defeat(p);
    }
    const aliveTeams = new Set<number>();
    for (const p of this.players) if (p.alive) aliveTeams.add(p.team);
    if (aliveTeams.size <= 1 && this.players.length > 1) {
      const t = [...aliveTeams][0] ?? -1;
      this.winner = this.players.filter((p) => p.team === t).map((p) => p.id);
      this.ended = true;
      this.emit({ k: 'end', winners: this.winner, team: t });
    }
  }

  defeat(p: Player): void {
    p.alive = false;
    p.defeatedAt = this.tick;
    for (const e of this.list) {
      if (e.alive && e.owner === p.id) {
        if (e.def.kind === 'unit') this.remove(e);
        else { e.owner = -1; e.team = -1; }
      }
    }
    this.emit({ k: 'defeat', player: p.id });
  }

  // ------------------------------------------------------------------ snapshot
  snapshot(fogEvery = 4): Snapshot {
    const viewTeam = this.viewTeam;
    const spectator = viewTeam < 0;
    const list = this.list;
    const ents = new Float32Array(list.length * ENT_STRIDE);
    let n = 0;
    const bit = viewTeam >= 0 ? 1 << viewTeam : 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e.inside) continue;
      let ghost = false;
      if (!spectator && this.vision.enabled) {
        const own = e.team === viewTeam;
        if (!own && !(e.visMask & bit)) {
          if (e.def.kind === 'structure' && !e.def.prop && (e.seenMask & bit)) ghost = true;
          else if (e.def.prop && (this.vision.exploredAt(viewTeam, e.x, e.z))) ghost = false;
          else continue;
        }
      }
      const d = e.def;
      let flags = 0;
      if (e.moving) flags |= F_MOVING;
      if (e.firing > 0) flags |= F_FIRING;
      if (e.progress < 1 && d.kind === 'structure') flags |= F_BUILDING;
      if (d.stealth && (e.reveal <= 0 || e.deployed)) flags |= F_STEALTH;
      if (e.deployed) flags |= F_DEPLOYED;
      if (e.stun > 0) flags |= F_STUNNED;
      if (e.garrisoned.length) flags |= F_GARRISON;
      if (ghost) flags |= F_GHOST;
      if (d.layer === 'air' && e.astate !== 0) flags |= F_AIRBORNE;
      if (!e.powered) flags |= F_UNPOWERED;
      if (e.capProg > 0) flags |= F_CAPTURING;
      if (e.owner < 0) flags |= F_NEUTRAL;
      if (e.cargo > 0) flags |= F_HARVESTING;
      if (e.hp < e.maxHp * 0.45) flags |= F_DAMAGED;
      const o = n * ENT_STRIDE;
      ents[o] = e.id;
      ents[o + 1] = DEF_INDEX.get(d.id)!;
      ents[o + 2] = e.owner;
      ents[o + 3] = e.x; ents[o + 4] = e.y; ents[o + 5] = e.z;
      ents[o + 6] = e.heading; ents[o + 7] = e.turret;
      ents[o + 8] = e.hp / e.maxHp;
      ents[o + 9] = flags;
      ents[o + 10] = e.progress < 1 ? e.progress : e.capProg;
      ents[o + 11] = e.vet;
      let ammo = 1;
      if (d.weapons) for (let k = 0; k < d.weapons.length; k++) if (d.weapons[k].ammo) ammo = Math.min(ammo, e.wammo[k] / d.weapons[k].ammo!);
      ents[o + 12] = ammo;
      ents[o + 13] = d.cap ? e.cargo / d.cap : e.garrisoned.length;
      ents[o + 14] = e.speed;
      ents[o + 15] = e.supplyLeft > 0 && d.supply ? e.supplyLeft / d.supply : e.superCharge;
      n++;
    }
    // projectiles
    const proj = new Float32Array(this.projectiles.length * PROJ_STRIDE);
    let np = 0;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (!spectator && this.vision.enabled && !this.vision.visibleAt(viewTeam, p.x, p.z)) continue;
      const o = np * PROJ_STRIDE;
      proj[o] = p.id; proj[o + 1] = p.vfx; proj[o + 2] = p.x; proj[o + 3] = p.y; proj[o + 4] = p.z;
      proj[o + 5] = p.dx; proj[o + 6] = p.dy; proj[o + 7] = p.dz;
      np++;
    }

    const players: PlayerInfo[] = this.players.map((p) => this.playerInfo(p));
    const queues: QueueInfo[] = [];
    const supers: SuperInfo[] = [];
    const me = this.options.viewer >= 0 ? this.options.viewer : -2;
    for (const e of this.list) {
      if (!e.alive || e.owner !== me || e.def.kind !== 'structure') continue;
      if (e.def.produces) {
        queues.push({ id: e.id, items: e.queue.map((q) => ({ def: q.def, p: Math.min(1, q.done / q.total), count: q.count })), rally: e.rally });
      }
      if (e.def.superweapon) supers.push({ id: e.id, power: e.def.superweapon.power, charge: Math.min(1, e.superCharge / e.def.superweapon.charge), ready: e.superReady });
    }
    const snap: Snapshot = {
      tick: this.tick, time: this.time, n, ents: ents.subarray(0, n * ENT_STRIDE), nProj: np, proj: proj.subarray(0, np * PROJ_STRIDE),
      players, queues, supers, events: this.events.slice(), perf: { ...this.perf }, winner: this.winner, orders: this.orderSummary,
    };
    if (this.tick % fogEvery === 0 && !spectator) snap.fog = this.vision.exportFor(viewTeam);
    return snap;
  }

  playerInfo(p: Player): PlayerInfo {
    const pwr = RANK_XP;
    return {
      id: p.id, name: p.setup.name, faction: p.faction, general: p.setup.general, color: p.setup.color, team: p.team, teamLabel: p.setup.teamLabel,
      isAI: !!p.setup.ai, alive: p.alive, credits: Math.floor(p.credits), powerProd: p.powerProd, powerUse: p.powerUse, cp: p.cp, rank: p.rank,
      xp: Math.floor(p.xp), nextXp: pwr[Math.min(p.rank + 1, pwr.length - 1)], unlocked: [...p.unlocked],
      powerCd: Object.fromEntries([...p.powerCd].map(([k, v]) => [k, Math.max(0, v - this.tick) / TICK_RATE])), upgrades: [...p.upgrades],
      units: p.units, structures: p.structures, kills: p.kills, losses: p.losses, spent: Math.floor(p.spent), income: Math.round(p.incomePerSec * 10) / 10,
    };
  }
}

function getDefsFor(f: string): EntityDef[] {
  return DEF_LIST.filter((d) => d.faction === f);
}

export { order, POWERS, addXp };
export type { Role, Order };
