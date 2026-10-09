import type { EntityDef, Stance } from './types';

export type OrderKind =
  | 'move' | 'attack' | 'build' | 'harvest' | 'capture' | 'garrison' | 'repair' | 'patrol' | 'cyber' | 'scoot' | 'guardpos';

/** Monomorphic order record (fields reused per kind). */
export interface Order {
  k: OrderKind;
  x: number;
  z: number;
  /** target entity id (attack / capture / garrison / repair / harvest depot / build struct) */
  target: number;
  /** attack-move: engage anything seen on the way */
  amove: boolean;
  def: string;
  /** harvest: 0 go to depot, 1 loading, 2 go to dropoff, 3 unloading; patrol: 0 to B, 1 to A */
  state: number;
  t: number;
  x2: number;
  z2: number;
}

export function order(k: OrderKind, x = 0, z = 0, target = 0): Order {
  return { k, x, z, target, amove: false, def: '', state: 0, t: 0, x2: 0, z2: 0 };
}

export interface QueueItem {
  def: string;
  /** seconds of work done */
  done: number;
  total: number;
  /** units produced in a batch for this item */
  count: number;
  upgrade: boolean;
  /** paid price (refund on cancel) */
  paid: number;
}

export class Entity {
  id = 0;
  alive = true;
  owner = -1;
  team = -1;
  x = 0; y = 0; z = 0;
  heading = 0;
  turret = 0;
  hp = 1;
  maxHp = 1;
  speed = 0;
  orders: Order[] = [];
  stance: Stance = 'aggressive';
  target = 0;
  acq = 0;
  wcd: number[] = [];
  wburst: number[] = [];
  wammo: number[] = [];
  wtarget: number[] = [];
  xp = 0;
  vet = 0;
  kills = 0;
  stun = 0;
  reveal = 0;
  deployed = false;
  apsCd = 0;
  lastHit = -9999;
  lastAttackerId = 0;
  lastFired = -9999;
  /** 0..1 construction progress (structures) */
  progress = 1;
  /** a dozer is working on this structure */
  builders = 0;
  queue: QueueItem[] = [];
  rally: [number, number] | null = null;
  cargo = 0;
  garrisoned: number[] = [];
  /** id of the structure this unit sits inside (0 = none) */
  inside = 0;
  visMask = 0;
  seenMask = 0;
  /** structure mem for ghosts: ticks since last seen */
  capProg = 0;
  capOwner = -1;
  supplyLeft = 0;
  superCharge = 0;
  superReady = false;
  powered = true;
  moving = false;
  firing = 0;
  // air
  astate = 0;
  home = 0;
  ax = 0;
  az = 0;
  atimer = 0;
  runDir = 0;
  // pathing
  stuck = 0;
  lastX = 0;
  lastZ = 0;
  fieldGoal = -1;
  jitter = 0;
  // economy accumulators
  incomeAcc = 0;
  // tunnel
  tunnelId = 0;
  decoy = false;
  scootT = 0;
  buffT = 0;
  /** squad id assigned by AI (0 none) */
  squad = 0;
  born = 0;
  dmgMul = 1;
  rofMul = 1;
  visMul = 1;
  spdMul = 1;
  rngMul = 1;
  /** timed-life units (summoned drones etc.), in ticks; 0 = permanent */
  ttl = 0;
  /** swarm-buff active (China) */
  swarmed = false;
  /** next tick at which the entity may re-scan for swarm / heal etc. */
  nextScan = 0;

  constructor(public def: EntityDef) {}

  get isStructure(): boolean { return this.def.kind === 'structure'; }
  get isAir(): boolean { return this.def.layer === 'air'; }
}
