/** Shared sim types. Pure data - no DOM / three imports so this runs in a Worker and in Node tests. */

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export type FactionId = 'usa' | 'china' | 'iran';
export type Layer = 'ground' | 'air';

export type DamageType =
  | 'smallarms' | 'ap' | 'explosive' | 'artillery' | 'missile'
  | 'aa' | 'flame' | 'emp' | 'cyber' | 'hyper';

export type ArmorClass = 'infantry' | 'light' | 'heavy' | 'structure' | 'hardened' | 'air' | 'drone';

export const DAMAGE_TYPES: DamageType[] = ['smallarms', 'ap', 'explosive', 'artillery', 'missile', 'aa', 'flame', 'emp', 'cyber', 'hyper'];
export const ARMOR_CLASSES: ArmorClass[] = ['infantry', 'light', 'heavy', 'structure', 'hardened', 'air', 'drone'];

/** Damage multiplier [damageType][armorClass]. EMP / cyber deal no HP damage; they stun (see stunTime). */
export const DAMAGE_MATRIX: Record<DamageType, Record<ArmorClass, number>> = {
  //              inf   light heavy struct hard  air   drone
  smallarms: { infantry: 1.0, light: 0.45, heavy: 0.1, structure: 0.12, hardened: 0.04, air: 0.3, drone: 0.8 },
  ap:        { infantry: 0.3, light: 1.0, heavy: 0.8, structure: 0.3, hardened: 0.15, air: 0.5, drone: 1.0 },
  explosive: { infantry: 1.0, light: 0.9, heavy: 0.6, structure: 1.2, hardened: 0.5, air: 0.2, drone: 0.8 },
  artillery: { infantry: 1.0, light: 1.0, heavy: 0.75, structure: 1.4, hardened: 0.7, air: 0, drone: 0.4 },
  missile:   { infantry: 0.5, light: 1.2, heavy: 1.3, structure: 0.9, hardened: 0.4, air: 1.0, drone: 1.2 },
  aa:        { infantry: 0.15, light: 0.3, heavy: 0.2, structure: 0.1, hardened: 0.05, air: 1.6, drone: 1.6 },
  flame:     { infantry: 1.4, light: 0.6, heavy: 0.3, structure: 1.0, hardened: 0.25, air: 0, drone: 0 },
  emp:       { infantry: 0, light: 1, heavy: 1, structure: 1, hardened: 0.5, air: 1, drone: 1 },
  cyber:     { infantry: 0, light: 1, heavy: 1, structure: 1, hardened: 0.5, air: 0.6, drone: 1 },
  hyper:     { infantry: 1.0, light: 1.0, heavy: 1.0, structure: 1.5, hardened: 1.2, air: 0, drone: 0 },
};

export type MoveStyle = 'foot' | 'wheel' | 'track' | 'heli' | 'plane' | 'drone' | 'none';
export type ProjVfx = 'bullet' | 'cannon' | 'missile' | 'rocket' | 'shell' | 'bomb' | 'flame' | 'cyber' | 'emp' | 'swarm';
export type Stance = 'aggressive' | 'guard' | 'hold' | 'holdfire';

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  dtype: DamageType;
  range: number;
  minRange?: number;
  /** seconds between shots (or salvos) */
  reload: number;
  /** shots per salvo (default 1) and gap between them */
  salvo?: number;
  salvoGap?: number;
  /** projectile speed m/s, 0 = hitscan */
  speed: number;
  /** ballistic arc height as fraction of distance (0 flat) */
  arc?: number;
  aoe?: number;
  targets: Layer[];
  guided?: boolean;
  spread?: number;
  vfx: ProjVfx;
  /** aircraft: shots available per sortie; rearm at airfield */
  ammo?: number;
  stunTime?: number;
  suicide?: boolean;
  /** only auto-targets structures (bunker busters, bombers) */
  structOnly?: boolean;
  /** muzzle offset relative to the turret (x right, y up, z fwd) */
  mount?: [number, number, number];
  /** shoots from the hull (does not need turret alignment) */
  fixed?: boolean;
  /** pierces to additional targets in a line (flame) - unused for now */
  incendiary?: boolean;
}

export type PowerKind =
  | 'airstrike' | 'barrage' | 'carpet' | 'salvo' | 'emp' | 'drones' | 'reveal' | 'repair'
  | 'paradrop' | 'blackout' | 'minefield' | 'swarm' | 'rush' | 'decoys' | 'strike' | 'cap' | 'ambush';

export interface PowerEffect {
  kind: PowerKind;
  radius?: number;
  /** damage per hit / number of hits etc. */
  damage?: number;
  dtype?: DamageType;
  count?: number;
  delay?: number;
  duration?: number;
  unit?: string;
  spread?: number;
  mult?: number;
}

export interface PowerDef {
  id: string;
  name: string;
  desc: string;
  faction: FactionId;
  tier: 1 | 2 | 3;
  /** command points to unlock */
  cost: number;
  cooldown: number;
  /** requires clicking a target location */
  targeted: boolean;
  effect: PowerEffect;
  /** which general may unlock it (undefined = any) */
  general?: string;
}

export interface GeneralDef {
  id: string;
  name: string;
  faction: FactionId;
  title: string;
  desc: string;
  /** cost multiplier for entities with a given role */
  costMul?: Record<string, number>;
  /** hp / damage multiplier by role */
  hpMul?: Record<string, number>;
  dmgMul?: Record<string, number>;
  speedMul?: Record<string, number>;
  /** starting extras */
  startUnits?: string[];
  powers: string[];
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  faction: FactionId;
  cost: number;
  time: number;
  tech?: string[];
  /** applies to entities with any of these roles ('all' for every unit) */
  roles: string[];
  hpMul?: number;
  dmgMul?: number;
  speedMul?: number;
  visionMul?: number;
  rangeMul?: number;
  unique?: boolean;
}

/** Procedural model spec: template + params, resolved by the renderer. */
export interface ModelSpec {
  tpl: string;
  [k: string]: unknown;
}

export type Role =
  | 'worker' | 'truck' | 'infantry' | 'antitank' | 'tank' | 'ifv' | 'scout' | 'artillery' | 'mlrs' | 'aa'
  | 'heli' | 'fighter' | 'bomber' | 'drone' | 'support' | 'missile' | 'decoy' | 'militia' | 'swarm'
  | 'structure' | 'defense' | 'production' | 'economy' | 'tech' | 'superweapon' | 'civilian' | 'resource' | 'wall'
  | 'special';

export interface EntityDef {
  id: string;
  name: string;
  faction: FactionId | 'neutral';
  kind: 'unit' | 'structure';
  roles: Role[];
  cost: number;
  /** build time in seconds */
  time: number;
  hp: number;
  armor: ArmorClass;
  radius: number;
  vision: number;
  /** generic role slot used by AI / UI ('cc', 'power', 'supply', 'barracks', 'factory', ...) */
  slot?: string;
  /** structures required (complete) before this can be built/produced */
  tech?: string[];
  /** where this is produced (def id of structure) - for units */
  producedBy?: string;

  // ---- units
  layer?: Layer;
  move?: MoveStyle;
  speed?: number;
  turn?: number;
  accel?: number;
  /** flight altitude above ground (aircraft) */
  fly?: number;
  weapons?: WeaponDef[];
  /** hull-independent turret slew rate rad/s */
  turret?: number;
  /** supply truck capacity */
  cap?: number;
  /** structures this unit can build */
  builds?: string[];
  captures?: boolean;
  /** passengers carried */
  transport?: number;
  /** can enter garrisonable structures */
  canGarrison?: boolean;
  /** active protection cooldown seconds */
  aps?: number;
  /** jams guided missiles within radius */
  jammer?: number;
  /** reveals stealth units within radius (all entities have a small default) */
  detector?: number;
  stealth?: { detect: number; reveal: number; always?: boolean };
  /** can toggle stealth / dig-in */
  deploy?: 'stealth' | 'dig';
  /** shoot-and-scoot: relocate after firing */
  scoot?: boolean;
  /** swarm bonus: +armour/+dmg when this many allies are nearby */
  swarm?: number;
  /** Battle Network (USA): +damage / +rate of fire while within range of a friendly network node */
  network?: boolean;
  /** this entity is a network node: radius in metres */
  netNode?: number;
  /** is an air unit that needs an airfield to rearm */
  rearm?: boolean;
  /** batch size when produced (China mass production, Shahed swarms) */
  batch?: number;
  /** is a decoy: reads as another def to the enemy until it's attacked */
  decoyOf?: string;
  /** suicide unit */
  oneShot?: boolean;
  /** heals nearby infantry/units per second */
  healAura?: number;
  /** disable ability target type */
  cyber?: boolean;

  // ---- structures
  footprint?: [number, number];
  /** +power produced / -power consumed */
  power?: number;
  /** def ids this structure can produce (units + upgrades) */
  produces?: string[];
  dropoff?: boolean;
  garrison?: number;
  unique?: boolean;
  radar?: boolean;
  /** superweapon structure */
  superweapon?: { power: string; charge: number };
  /** passive income per second (derricks) */
  income?: number;
  /** depots */
  supply?: number;
  /** can be built only near water etc. (unused) */
  buildRadius?: number;
  /** passive armor class/aura: jams, ... */
  airfield?: number;
  /** structures that look like terrain props only */
  prop?: boolean;
  /** does not need power to function */
  noPower?: boolean;
  /** tunnel network id */
  tunnel?: boolean;
  /** AA / defence structures auto-fire (has weapons) */
  model: ModelSpec;
}

// ------------------------------------------------------------------ commands

export type Command =
  | { t: 'move'; ids: number[]; x: number; z: number; queue?: boolean; attack?: boolean }
  | { t: 'attack'; ids: number[]; target: number; queue?: boolean }
  | { t: 'stop'; ids: number[] }
  | { t: 'stance'; ids: number[]; stance: Stance }
  | { t: 'build'; ids: number[]; def: string; x: number; z: number; queue?: boolean }
  | { t: 'produce'; structure: number; def: string; count?: number }
  | { t: 'cancel'; structure: number; index: number }
  | { t: 'rally'; structures: number[]; x: number; z: number }
  | { t: 'capture'; ids: number[]; target: number }
  | { t: 'garrison'; ids: number[]; target: number }
  | { t: 'unload'; id: number }
  | { t: 'repair'; ids: number[]; target: number }
  | { t: 'deploy'; ids: number[] }
  | { t: 'power'; power: string; x: number; z: number }
  | { t: 'unlock'; power: string }
  | { t: 'sell'; id: number }
  | { t: 'scatter'; ids: number[] }
  | { t: 'harvest'; ids: number[]; target: number }
  | { t: 'cyber'; ids: number[]; target: number }
  | { t: 'patrol'; ids: number[]; x: number; z: number }
  | { t: 'cancelBuild'; id: number };

// ------------------------------------------------------------------ snapshot

export const ENT_STRIDE = 16;
export const PROJ_STRIDE = 8;

export const F_MOVING = 1;
export const F_FIRING = 2;
export const F_BUILDING = 4;
export const F_STEALTH = 8;
export const F_STUNNED = 16;
export const F_GARRISON = 32;
export const F_GHOST = 64;
export const F_DEPLOYED = 128;
export const F_AIRBORNE = 256;
export const F_UNPOWERED = 512;
export const F_CAPTURING = 1024;
export const F_NEUTRAL = 2048;
export const F_HARVESTING = 4096;
export const F_DAMAGED = 8192;

export type SimEvent =
  | { k: 'shot'; vfx: ProjVfx; x: number; y: number; z: number; tx: number; ty: number; tz: number; owner: number; big?: boolean; p?: boolean; /** shooter def index */ src?: number; dmg?: number }
  | { k: 'boom'; x: number; y: number; z: number; size: number; kind: 'gen' | 'big' | 'air' | 'nuke' | 'emp' | 'fire' | 'ground' | 'cyber' }
  | { k: 'death'; id: number; def: string; x: number; y: number; z: number; owner: number; heading: number; structure: boolean }
  | { k: 'alert'; type: 'attack' | 'built' | 'ready' | 'lost' | 'capture' | 'super' | 'power' | 'low'; x: number; z: number; owner: number; text?: string }
  | { k: 'msg'; text: string; owner: number }
  | { k: 'end'; winners: number[]; team: number }
  | { k: 'defeat'; player: number }
  | { k: 'strikeWarn'; x: number; z: number; r: number; t: number; owner: number }
  | { k: 'ping'; x: number; z: number; owner: number }
  | { k: 'flare'; x: number; y: number; z: number; owner: number; /** aircraft that dodged */ id: number }
  | { k: 'promote'; id: number; def: string; vet: number; x: number; y: number; z: number; owner: number };

export interface PlayerInfo {
  id: number;
  name: string;
  faction: FactionId;
  general: string;
  color: number;
  team: number;
  teamLabel: number;
  isAI: boolean;
  alive: boolean;
  credits: number;
  powerProd: number;
  powerUse: number;
  cp: number;
  rank: number;
  xp: number;
  nextXp: number;
  unlocked: string[];
  powerCd: Record<string, number>;
  upgrades: string[];
  units: number;
  structures: number;
  kills: number;
  losses: number;
  spent: number;
  income: number;
}

export interface QueueInfo {
  id: number;
  items: { def: string; p: number; count: number }[];
  rally: [number, number] | null;
}

export interface SuperInfo {
  id: number;
  power: string;
  charge: number;
  ready: boolean;
}

export interface Snapshot {
  tick: number;
  time: number;
  n: number;
  ents: Float32Array;
  nProj: number;
  proj: Float32Array;
  players: PlayerInfo[];
  queues: QueueInfo[];
  supers: SuperInfo[];
  events: SimEvent[];
  /** fog grid for the view team: 0 hidden, 1 explored, 2 visible; present every few ticks */
  fog?: Uint8Array;
  /** debug / perf */
  perf: { tickMs: number; ents: number; paths: number };
  winner?: number[] | null;
  /** extra info for selected-entity UI: per-entity order summary (sparse) */
  orders: Record<number, string>;
}

// ------------------------------------------------------------------ setup

export interface PlayerSetup {
  slot: number;
  name: string;
  faction: FactionId;
  general: string;
  color: number;
  /** 0 = no team (free for all) */
  teamLabel: number;
  ai: null | { difficulty: 'easy' | 'medium' | 'hard' | 'brutal'; personality: string };
  spawn?: number;
}

export interface GameOptions {
  startCredits: number;
  fog: boolean;
  superweapons: boolean;
  techStart: boolean;
  unitCap: number;
  speed: number;
  /** what the local viewer sees: player slot, or -1 = spectator (sees everything) */
  viewer: number;
}

export interface CommandLogEntry { t: number; pid: number; cmd: Command }

export interface InitMsg {
  map: string;
  heights: Float32Array;
  seed: number;
  players: PlayerSetup[];
  options: GameOptions;
  /** replay playback: commands to feed at their recorded ticks */
  replay?: CommandLogEntry[];
}

export const DEFAULT_OPTIONS: GameOptions = {
  startCredits: 10000, fog: true, superweapons: true, techStart: false, unitCap: 0, speed: 1, viewer: 0,
};

export const TEAM_COLORS = [0x3d7bff, 0xe23b3b, 0x34c759, 0xffc933, 0xb05cff, 0xff8a2b, 0x2ed3d3, 0xff5ca8, 0xa8d94a, 0xffffff];
