import { Noise2D, mulberry32 } from '../procgen/noise';
import { generateHeights, HeightField, HeightSource, PadDef, RoadDef } from './heightfield';

export type Biome = 'desert' | 'urban' | 'oasis' | 'highland' | 'mixed';
export type Weather = 'none' | 'sandstorm' | 'snow' | 'dust';

export interface CivSpec {
  x: number;
  z: number;
  def: string;
}

export interface MapDef extends HeightSource {
  id: string;
  name: string;
  desc: string;
  minPlayers: number;
  maxPlayers: number;
  biome: Biome;
  hour: number;
  /** game-hours advanced per real minute (0 = static) */
  cycle: number;
  weather: Weather;
  spawns: [number, number][];
  spawnSets: Record<number, number[]>;
  depots: [number, number, number][];
  derricks: [number, number][];
  civ: CivSpec[];
  props: { rocks: number; trees: number; treeKind: 'palm' | 'pine' | 'tree' | 'none'; treeAt?: (x: number, z: number, n: Noise2D) => number };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ring(n: number, rx: number, rz: number, phase = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * rx, Math.sin(a) * rz]);
  }
  return out;
}

/** evenly spread subset of `max` spawns for n players (opposites first). */
function evenSets(max: number, extra: Record<number, number[]> = {}): Record<number, number[]> {
  const sets: Record<number, number[]> = {};
  for (let n = 2; n <= max; n++) {
    const idx: number[] = [];
    for (let k = 0; k < n; k++) idx.push(Math.floor((k * max) / n));
    sets[n] = idx;
  }
  return { ...sets, ...extra };
}

/** Depots near a spawn: two on the flanks facing the map centre. */
function baseDepots(spawn: [number, number], amount = 22000): [number, number, number][] {
  const [sx, sz] = spawn;
  const d = Math.hypot(sx, sz) || 1;
  const ux = -sx / d, uz = -sz / d; // towards centre
  const px = -uz, pz = ux;
  return [
    [sx + ux * 70 + px * 62, sz + uz * 70 + pz * 62, amount],
    [sx + ux * 70 - px * 62, sz + uz * 70 - pz * 62, amount],
  ];
}

function cityGrid(
  x0: number, z0: number, x1: number, z1: number, block: number, rng: () => number,
  avoid: (x: number, z: number) => boolean, density = 0.8,
): CivSpec[] {
  const out: CivSpec[] = [];
  const defs = ['civ_house', 'civ_house', 'civ_shop', 'civ_tower', 'civ_warehouse', 'civ_shop'];
  for (let x = x0; x <= x1; x += block) {
    for (let z = z0; z <= z1; z += block) {
      if (rng() > density) continue;
      const px = x + (rng() - 0.5) * 6, pz = z + (rng() - 0.5) * 6;
      if (avoid(px, pz)) continue;
      out.push({ x: px, z: pz, def: defs[Math.floor(rng() * defs.length)] });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------- 1
function redMesa(): MapDef {
  const spawns: [number, number][] = [[-360, -360], [360, 360], [360, -360], [-360, 360]];
  const pads: PadDef[] = spawns.map(([x, z]) => ({ x, z, r: 88 }));
  const depots = spawns.flatMap((s) => baseDepots(s));
  depots.push([0, 410, 30000], [0, -410, 30000], [410, 0, 30000], [-410, 0, 30000]);
  const derricks: [number, number][] = [[-38, -38], [38, 38], [38, -38], [-38, 38], [0, 300], [0, -300], [300, 0], [-300, 0]];
  for (const d of depots) pads.push({ x: d[0], z: d[1], r: 16 });
  for (const d of derricks) pads.push({ x: d[0], z: d[1], r: 12 });
  const roads: RoadDef[] = spawns.map(([x, z]) => ({
    pts: [[x, z], [x * 0.62 + z * 0.12, z * 0.62 - x * 0.12], [x * 0.25, z * 0.25], [0, 0]], width: 26,
  }));
  roads.push({ pts: [[-360, -360], [-360, 0], [-360, 360]], width: 20 }, { pts: [[360, -360], [360, 0], [360, 360]], width: 20 });
  roads.push({ pts: [[-360, -360], [0, -360], [360, -360]], width: 20 }, { pts: [[-360, 360], [0, 360], [360, 360]], width: 20 });
  return {
    id: 'red_mesa', name: 'Red Mesa', desc: 'Two-to-four player canyon duel. Terraced plateaus, graded ramps and a contested oil field in the central basin.',
    sym: 4, minPlayers: 2, maxPlayers: 4, size: 1024, res: 513, seed: 1337, biome: 'desert', hour: 15.5, cycle: 0, weather: 'none', waterLevel: null,
    spawns, spawnSets: { 2: [0, 1], 3: [0, 1, 2], 4: [0, 1, 2, 3] }, depots, derricks, civ: [], roads, pads,
    props: { rocks: 1400, trees: 0, treeKind: 'none' },
    raw: (x, z, n) => {
      const f = 1 / 260;
      const base = n.fbm(x * f, z * f, 5) * 26;
      const m = n.ridged(x * f * 0.7 + 10, z * f * 0.7 - 4, 4);
      const t = m * 5;
      const fl = Math.floor(t);
      const terr = (fl + smooth(0.72, 1.0, t - fl)) / 5;
      let h = base + terr * 62 - 20;
      const r = Math.hypot(x, z);
      const basin = 1 - smooth(70, 190, r);
      h = h * (1 - basin) + (1.5 + n.fbm(x * 0.02, z * 0.02, 3) * 1.2) * basin;
      const edge = smooth(512 * 0.72, 512, Math.max(Math.abs(x), Math.abs(z)));
      return h + edge * edge * 140;
    },
  };
}

// ------------------------------------------------------------------------------------------- 2
function harborLine(): MapDef {
  const rx = 470, rz = 230;
  const spawns = ring(6, rx, rz, Math.PI / 6);
  const rng = mulberry32(2025);
  const pads: PadDef[] = spawns.map(([x, z]) => ({ x, z, r: 88 }));
  const depots = spawns.flatMap((s) => baseDepots(s, 20000));
  depots.push([0, -330, 26000], [0, 300, 26000]);
  const derricks: [number, number][] = [[-90, 0], [90, 0], [0, -90], [0, 90], [-300, -300], [300, -300]];
  for (const d of depots) pads.push({ x: d[0], z: d[1], r: 16 });
  for (const d of derricks) pads.push({ x: d[0], z: d[1], r: 14 });
  const roads: RoadDef[] = spawns.map(([x, z]) => ({ pts: [[x, z], [x * 0.5, z * 0.5], [0, 0]], width: 22 }));
  roads.push({ pts: [[-560, 0], [0, 0], [560, 0]], width: 20 }, { pts: [[0, -300], [0, 0], [0, 290]], width: 20 });
  const coast = (x: number, n: Noise2D) => 345 + 40 * Math.sin(x * 0.011) + 28 * n.fbm(x * 0.006, 3, 3);
  const civ = cityGrid(-330, -200, 330, 210, 46, rng, (x, z) => {
    for (const [sx, sz] of spawns) if (Math.hypot(x - sx, z - sz) < 95) return true;
    for (const d of derricks) if (Math.hypot(x - d[0], z - d[1]) < 28) return true;
    for (const d of depots) if (Math.hypot(x - d[0], z - d[1]) < 30) return true;
    if (Math.abs(x) < 17 || Math.abs(z) < 17) return true; // main avenues
    return false;
  }, 0.78);
  return {
    id: 'harbor_line', name: 'Harbor Line', desc: 'Dense coastal port city for 2-6 players. Garrison rooftops, fight through the avenues and control the docks.',
    minPlayers: 2, maxPlayers: 6, size: 1280, res: 513, seed: 4242, biome: 'urban', hour: 10, cycle: 0, weather: 'none', waterLevel: 0,
    spawns, spawnSets: evenSets(6), depots, derricks, civ, roads, pads,
    props: { rocks: 220, trees: 160, treeKind: 'tree', treeAt: (x) => (Math.abs(x) > 380 ? 1 : 0.1) },
    raw: (x, z, n) => {
      const land = 3 + n.fbm(x * 0.006, z * 0.006, 4) * 9 + Math.max(0, n.fbm(x * 0.0025 + 5, z * 0.0025, 3)) * 14;
      const c = coast(x, n);
      const sea = smooth(c - 40, c + 36, z);
      const edge = smooth(640 * 0.8, 640, Math.max(Math.abs(x), z < 0 ? Math.abs(z) : 0));
      return lerp(land, -9, sea) + edge * edge * 60;
    },
  };
}

// ------------------------------------------------------------------------------------------- 3
function oasisCrown(): MapDef {
  const spawns = ring(6, 470, 470, 0);
  const pads: PadDef[] = spawns.map(([x, z]) => ({ x, z, r: 88 }));
  const depots = spawns.flatMap((s) => baseDepots(s));
  for (const [x, z] of ring(6, 235, 235, Math.PI / 6)) depots.push([x, z, 28000]);
  const derricks: [number, number][] = [...ring(6, 330, 330, Math.PI / 3)];
  for (const d of depots) pads.push({ x: d[0], z: d[1], r: 16 });
  for (const d of derricks) pads.push({ x: d[0], z: d[1], r: 12 });
  const roads: RoadDef[] = spawns.map(([x, z]) => ({ pts: [[x, z], [x * 0.55, z * 0.55], [x * 0.38, z * 0.38]], width: 22 }));
  return {
    id: 'oasis_crown', name: 'Oasis Crown', desc: 'Six-player dune sea around a central oasis. Dunes hide ambushes and sandstorms sweep the battlefield.',
    sym: 6, minPlayers: 2, maxPlayers: 6, size: 1280, res: 513, seed: 777, biome: 'oasis', hour: 13, cycle: 0, weather: 'sandstorm', waterLevel: 0,
    spawns, spawnSets: evenSets(6), depots, derricks, civ: [], roads, pads,
    props: { rocks: 700, trees: 520, treeKind: 'palm', treeAt: (x, z) => 1 - smooth(150, 300, Math.hypot(x, z)) },
    raw: (x, z, n) => {
      const r = Math.hypot(x, z);
      const dunes = n.fbm(x * 0.004, z * 0.004, 4) * 16 + Math.sin((x * 0.7 + z * 0.35) * 0.028 + n.noise(x * 0.003, z * 0.003) * 5) * 4.2 + 8;
      const lake = 1 - smooth(70, 150, r);
      const rim = 1 - smooth(140, 280, r);
      const edge = smooth(640 * 0.78, 640, Math.max(Math.abs(x), Math.abs(z)));
      return lerp(dunes, lerp(5, -7, lake), rim) + edge * edge * 80;
    },
  };
}

// ------------------------------------------------------------------------------------------- 4
function highlandPass(): MapDef {
  const R = 620;
  const spawns = ring(8, R, R, Math.PI / 8);
  const pads: PadDef[] = spawns.map(([x, z]) => ({ x, z, r: 88 }));
  const depots = spawns.flatMap((s) => baseDepots(s, 20000));
  for (const [x, z] of ring(8, 330, 330, 0)) depots.push([x, z, 24000]);
  const derricks: [number, number][] = [...ring(4, 60, 60, Math.PI / 4), ...ring(8, 450, 450, 0)];
  for (const d of depots) pads.push({ x: d[0], z: d[1], r: 16 });
  for (const d of derricks) pads.push({ x: d[0], z: d[1], r: 12 });
  const roads: RoadDef[] = spawns.map(([x, z]) => ({ pts: [[x, z], [x * 0.7, z * 0.7], [x * 0.53, z * 0.53]], width: 26 }));
  // ring road around r=330
  const ringPts = ring(24, 330, 330, 0);
  ringPts.push(ringPts[0]);
  roads.push({ pts: ringPts, width: 26 });
  for (const [x, z] of ring(4, 330, 330, 0)) roads.push({ pts: [[x, z], [0, 0]], width: 24 });
  const angs = spawns.map(([x, z]) => Math.atan2(z, x));
  return {
    id: 'highland_pass', name: 'Highland Pass', desc: 'Eight-player alpine valleys linked by narrow passes. Great for artillery and air; the snow never stops.',
    sym: 8, minPlayers: 2, maxPlayers: 8, size: 1536, res: 769, seed: 91, biome: 'highland', hour: 9.5, cycle: 0, weather: 'snow', waterLevel: null,
    spawns, spawnSets: evenSets(8), depots, derricks, civ: [], roads, pads,
    props: { rocks: 900, trees: 700, treeKind: 'pine', treeAt: (x, z, n) => smooth(-0.1, 0.3, n.fbm(x * 0.01, z * 0.01, 3)) },
    raw: (x, z, n) => {
      const r = Math.hypot(x, z);
      const a = Math.atan2(z, x);
      let da = Math.PI;
      for (const s of angs) { let d = Math.abs(a - s); if (d > Math.PI) d = Math.PI * 2 - d; da = Math.min(da, d); }
      const radial = r > 200 ? r * da : 9999;
      const ringD = Math.abs(r - 330);
      const cd = Math.min(radial, ringD, Math.max(0, r - 130) * 1.2);
      const valley = 1 - smooth(38, 105, cd);
      const mount = 62 + n.ridged(x * 0.0042, z * 0.0042, 5) * 118 + n.fbm(x * 0.02, z * 0.02, 3) * 8;
      const floor = 5 + n.fbm(x * 0.012, z * 0.012, 3) * 5;
      const edge = smooth(768 * 0.72, 768, Math.max(Math.abs(x), Math.abs(z)));
      return lerp(mount, floor, valley) + edge * edge * 160;
    },
  };
}

// ------------------------------------------------------------------------------------------- 5
function grandMeridian(): MapDef {
  const R = 790;
  const spawns = ring(10, R, R, 0);
  const rng = mulberry32(31337);
  const pads: PadDef[] = spawns.map(([x, z]) => ({ x, z, r: 88 }));
  const depots = spawns.flatMap((s) => baseDepots(s, 22000));
  for (const [x, z] of ring(10, 540, 540, Math.PI / 10)) depots.push([x, z, 28000]);
  const derricks: [number, number][] = [...ring(6, 70, 70, 0), ...ring(10, 420, 420, Math.PI / 10), ...ring(10, 880, 880, Math.PI / 10)];
  for (const d of depots) pads.push({ x: d[0], z: d[1], r: 16 });
  for (const d of derricks) pads.push({ x: d[0], z: d[1], r: 12 });
  const roads: RoadDef[] = spawns.map(([x, z]) => ({ pts: [[x, z], [x * 0.68, z * 0.68], [x * 0.38, z * 0.38], [0, 0]], width: 26 }));
  const ringPts = ring(40, 540, 540, 0);
  ringPts.push(ringPts[0]);
  roads.push({ pts: ringPts, width: 24 });
  const civ = cityGrid(-300, -300, 300, 300, 48, rng, (x, z) => {
    if (Math.hypot(x, z) > 295) return true;
    for (const d of derricks) if (Math.hypot(x - d[0], z - d[1]) < 30) return true;
    for (const s of spawns) if (Math.hypot(x - s[0], z - s[1]) < 100) return true;
    // radial avenues
    const a = Math.atan2(z, x);
    for (const s of spawns) { let d = Math.abs(a - Math.atan2(s[1], s[0])); if (d > Math.PI) d = Math.PI * 2 - d; if (d * Math.hypot(x, z) < 20) return true; }
    return false;
  }, 0.85);
  return {
    id: 'grand_meridian', name: 'Grand Meridian', desc: 'Ten-player world war. Ten radial bases around a central metropolis; desert, forest and hills, with a day that turns to night.',
    sym: 10, minPlayers: 2, maxPlayers: 10, size: 2048, res: 641, seed: 2026, biome: 'mixed', hour: 7.5, cycle: 0.6, weather: 'dust', waterLevel: null,
    spawns, spawnSets: evenSets(10), depots, derricks, civ, roads, pads,
    props: {
      rocks: 1600, trees: 1400, treeKind: 'tree',
      treeAt: (x, z, n) => smooth(0.05, 0.4, n.fbm(x * 0.005 + 7, z * 0.005, 3)) * smooth(300, 420, Math.hypot(x, z)),
    },
    raw: (x, z, n) => {
      const r = Math.hypot(x, z);
      const hills = n.fbm(x * 0.004, z * 0.004, 5) * 34 + Math.max(0, n.fbm(x * 0.0018 - 3, z * 0.0018, 3)) * 50;
      const city = 1 - smooth(260, 380, r);
      const edge = smooth(1024 * 0.78, 1024, Math.max(Math.abs(x), Math.abs(z)));
      return lerp(hills + 14, 6 + n.fbm(x * 0.02, z * 0.02, 2) * 1.5, city) + edge * edge * 140;
    },
  };
}

export const MAPS: MapDef[] = [redMesa(), harborLine(), oasisCrown(), highlandPass(), grandMeridian()];
export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));

export interface BuiltMap {
  def: MapDef;
  hf: HeightField;
  roadMask: Uint8Array;
}

const cache = new Map<string, BuiltMap>();
export function buildMap(id: string): BuiltMap {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = MAP_BY_ID[id];
  if (!def) throw new Error(`unknown map ${id}`);
  const { heights, roadMask } = generateHeights(def);
  const built = { def, hf: new HeightField(def.size, def.res, heights), roadMask };
  cache.set(id, built);
  return built;
}

/** Spawn positions for n players (indices into def.spawns). */
export function spawnsFor(def: MapDef, n: number): number[] {
  return def.spawnSets[Math.min(Math.max(n, def.minPlayers), def.maxPlayers)] ?? def.spawnSets[def.maxPlayers];
}

/** index into def.spawns for player slot i of n */
export function spawnIndex(def: MapDef, n: number, i: number): number {
  const set = spawnsFor(def, n);
  return set[i % set.length];
}
