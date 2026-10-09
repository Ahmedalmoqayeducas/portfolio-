import * as THREE from 'three';
import type { EntityDef, ModelSpec } from '../sim/types';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';

export interface ModelData {
  body: THREE.BufferGeometry;
  turret?: THREE.BufferGeometry;
  turretPivot?: [number, number, number];
  team?: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  rotor?: THREE.BufferGeometry;
  rotorPivot?: [number, number, number];
  rotorAxis?: 'x' | 'y' | 'z';
  rotorSpeed?: number;
  rotorRock?: boolean;
  height: number;
  walker?: boolean;
  flier?: boolean;
  /** extra uniform scale for display */
  scale?: number;
}

export interface Palette {
  main: number; alt: number; dark: number; metal: number; glass: number; light: number; accent: number; concrete: number; roof: number; skin: number;
}

export const PALETTES: Record<string, Palette> = {
  usa: { main: 0x6b6c4c, alt: 0x8d7e5a, dark: 0x25282b, metal: 0x474b50, glass: 0x1b2b36, light: 0xb7b5a8, accent: 0x3b4636, concrete: 0x98968c, roof: 0x5e6670, skin: 0xc9a07a },
  china: { main: 0x4d5d3b, alt: 0x6f7e50, dark: 0x212523, metal: 0x3f444a, glass: 0x1d2c30, light: 0xaaa89c, accent: 0x9a2b22, concrete: 0x8d8c82, roof: 0x7a2f26, skin: 0xc7a07a },
  iran: { main: 0x8d805d, alt: 0x6c6e4c, dark: 0x282520, metal: 0x4b4a46, glass: 0x1f2a2d, light: 0xbdb59e, accent: 0x2e6a3d, concrete: 0xa59c82, roof: 0x7d6a52, skin: 0xb98f6c },
  neutral: { main: 0xa89f8c, alt: 0x8e8574, dark: 0x2a2825, metal: 0x55575a, glass: 0x22333b, light: 0xd8d4c8, accent: 0xa5412f, concrete: 0xaaa79d, roof: 0x8a4a3a, skin: 0xc9a07a },
};

const TEAM_COL = 0xffffff;
const PI = Math.PI;

type Ctx = { spec: ModelSpec; pal: Palette; style: string };
type Builder = (c: Ctx) => ModelData;

function num(v: unknown, d: number): number { return typeof v === 'number' ? v : d; }

function seedOf(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 1000 + 1; }

// ------------------------------------------------------------------------------ shared pieces
function tracks(b: GeoBuilder, len: number, wid: number, p: Palette, h = 1.0, y = 0.55): void {
  for (const s of [-1, 1]) {
    const x = s * (wid / 2 - 0.5);
    b.box(0.9, h, len, x, y, 0, p.dark, { grime: 0.7, camo: 0 });
    const n = Math.max(4, Math.round(len / 1.3));
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + 0.7 + (i * (len - 1.4)) / (n - 1);
      b.cyl(0.42, 0.42, 0.28, x + s * 0.5, y - 0.1, z, p.metal, { rot: [0, 0, PI / 2], camo: 0, grime: 0.5 });
    }
    b.cyl(0.5, 0.5, 0.3, x + s * 0.5, y + 0.15, len / 2 - 0.4, p.metal, { rot: [0, 0, PI / 2], camo: 0 });
    b.cyl(0.5, 0.5, 0.3, x + s * 0.5, y + 0.15, -len / 2 + 0.4, p.metal, { rot: [0, 0, PI / 2], camo: 0 });
  }
}

function wheels(b: GeoBuilder, len: number, wid: number, count: number, r: number, p: Palette): void {
  const axles = Math.max(2, count / 2);
  for (let i = 0; i < axles; i++) {
    const z = -len / 2 + r + 0.3 + (i * (len - 2 * r - 0.6)) / Math.max(1, axles - 1);
    for (const s of [-1, 1]) {
      b.cyl(r, r, 0.55, s * (wid / 2 - 0.1), r, z, p.dark, { rot: [0, 0, PI / 2], grime: 0.5, camo: 0 });
      b.cyl(r * 0.5, r * 0.5, 0.58, s * (wid / 2 - 0.1), r, z, p.metal, { rot: [0, 0, PI / 2], camo: 0 });
    }
  }
}

function antenna(b: GeoBuilder, x: number, y: number, z: number, h: number, p: Palette, t?: GeoBuilder): void {
  b.cyl(0.03, 0.05, h, x, y + h / 2, z, p.dark, { camo: 0 });
  if (t) t.box(0.04, 0.35, 0.55, x, y + h - 0.2, z - 0.28, TEAM_COL, { camo: 0, grime: 0 });
}

// ------------------------------------------------------------------------------ infantry
function soldier(b: GeoBuilder, t: GeoBuilder, x: number, z: number, p: Palette, kit: string, face: number, dark: boolean, militia: boolean): void {
  const cloth = dark ? 0x2b2f2c : militia ? [0x5a5546, 0x3d4a3a, 0x6a5d49][(Math.abs(Math.round(x * 7 + z * 3)) % 3)] : p.main;
  const gear = dark ? 0x1e211f : p.alt;
  // legs
  b.box(0.22, 0.85, 0.3, x - 0.16, 0.43, z, cloth, { camo: 0.5, jitter: 0.1 });
  b.box(0.22, 0.85, 0.3, x + 0.16, 0.43, z, cloth, { camo: 0.5, jitter: 0.1 });
  // torso & vest
  b.box(0.62, 0.7, 0.36, x, 1.18, z, cloth, { camo: 0.6, jitter: 0.1 });
  b.box(0.66, 0.4, 0.4, x, 1.2, z, gear, { camo: 0.2 });
  // arms
  b.box(0.16, 0.6, 0.16, x - 0.4, 1.15, z + 0.15, cloth, { camo: 0.4 });
  b.box(0.16, 0.6, 0.16, x + 0.4, 1.15, z + 0.15, cloth, { camo: 0.4 });
  // head + helmet
  b.sphere(0.2, x, 1.68, z, p.skin, { camo: 0 });
  b.sphere(0.24, x, 1.74, z, militia ? 0x3a3b36 : gear, { camo: 0.3, sy: 0.7 });
  // team marker (backpack stripe)
  t.box(0.5, 0.12, 0.1, x, 1.44, z - 0.24, TEAM_COL, { camo: 0, grime: 0 });
  switch (kit) {
    case 'launcher':
      b.cyl(0.1, 0.1, 1.5, x + 0.28, 1.65, z + 0.1, p.dark, { rot: [PI / 2 - 0.2, 0, 0], camo: 0 });
      b.cyl(0.14, 0.1, 0.25, x + 0.28, 1.5, z + 0.9, p.metal, { rot: [PI / 2 - 0.2, 0, 0], camo: 0 });
      break;
    case 'laptop':
      b.box(0.5, 0.05, 0.36, x, 1.0, z + 0.35, p.dark, { camo: 0 });
      b.box(0.5, 0.34, 0.04, x, 1.18, z + 0.5, p.glass, { camo: 0 });
      break;
    case 'mg':
      b.box(0.1, 0.12, 1.2, x + 0.22, 1.2, z + 0.7, p.dark, { camo: 0 });
      break;
    case 'rpg':
      b.cyl(0.07, 0.07, 1.1, x + 0.25, 1.5, z + 0.2, p.dark, { rot: [PI / 2, 0, 0], camo: 0 });
      b.cone(0.16, 0.3, x + 0.25, 1.5, z + 0.9, p.metal, { rot: [PI / 2, 0, 0], camo: 0 });
      break;
    default:
      b.box(0.08, 0.1, 1.0, x + 0.18, 1.2, z + 0.55, p.dark, { camo: 0 });
      b.box(0.06, 0.14, 0.2, x + 0.18, 1.1, z + 0.45, p.dark, { camo: 0 });
  }
  void face;
}

const infantry: Builder = ({ spec, pal }) => {
  const n = num(spec.n, 3);
  const kit = String(spec.kit ?? 'rifle');
  const b = new GeoBuilder(0.4, 0.3, seedOf(kit));
  const t = new GeoBuilder(0, 0);
  const R = n <= 1 ? 0 : 0.9 + n * 0.2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + 0.4;
    soldier(b, t, Math.sin(a) * R, Math.cos(a) * R * 0.9, pal, i === 0 && kit === 'launcher' ? 'launcher' : kit, 0, !!spec.dark, !!spec.militia);
  }
  return { body: b.build(), team: t.build(), height: 2, walker: true, scale: 1.7 };
};

// ------------------------------------------------------------------------------ ground vehicles
const tank: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 9), wid = num(spec.wid, 3.6);
  const tl = num(spec.turretLen, 3.4), gun = num(spec.gun, 5);
  const ifv = !!spec.ifv, era = !!spec.era, decoy = !!spec.decoy;
  const b = new GeoBuilder(0.6, 0.45, seedOf(style + len));
  const t = new GeoBuilder(0.6, 0.35, 5);
  const tm = new GeoBuilder(0, 0);
  tracks(b, len, wid, pal, ifv ? 1.1 : 1.0);
  const hullH = ifv ? 1.5 : 1.0;
  const hullW = wid - 1.5;
  b.box(hullW, hullH, len * 0.88, 0, 0.55 + hullH / 2 + 0.2, -len * 0.02, pal.main);
  b.slab(hullW, hullH * 0.9, len * 0.22, hullH * 0.7, 0, 0.55 + hullH / 2 + 0.2, len * 0.43, pal.main);
  // skirts
  for (const s of [-1, 1]) {
    b.box(0.14, 0.9, len * 0.74, s * (wid / 2 + 0.05), 1.15, -len * 0.04, pal.alt, { camo: 0.7 });
    if (era || style === 'china') for (let i = 0; i < 5; i++) b.box(0.18, 0.5, 0.6, s * (wid / 2 + 0.12), 1.35, -len * 0.3 + i * (len * 0.14), pal.dark, { camo: 0 });
  }
  // engine deck
  b.box(hullW * 0.8, 0.18, len * 0.2, 0, 0.55 + hullH + 0.3, -len * 0.38, pal.dark, { camo: 0 });
  for (let i = 0; i < 5; i++) b.box(hullW * 0.74, 0.04, 0.12, 0, 0.55 + hullH + 0.42, -len * 0.45 + i * 0.35, pal.metal, { camo: 0 });
  // exhausts
  b.cyl(0.14, 0.14, 0.6, hullW * 0.35, 1.1, -len / 2 - 0.1, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 });
  // turret
  const ty = 0.55 + hullH + 0.35;
  const tz = ifv ? -len * 0.08 : -len * 0.04;
  const tw = ifv ? wid * 0.52 : wid * 0.62;
  const th = ifv ? 0.8 : 0.95;
  t.box(tw, th, tl, 0, th / 2, 0, pal.main);
  t.slab(tw * 0.95, th * 0.9, tl * 0.4, th * 0.55, 0, th * 0.45, tl * 0.55, pal.main);
  t.box(tw * 1.02, 0.18, tl * 0.5, 0, th * 0.1, -tl * 0.25, pal.alt, { camo: 0.8 });
  // gun mantlet + barrel
  t.box(0.9, 0.7, 0.5, 0, th * 0.5, tl * 0.5 + 0.35, pal.main);
  if (ifv) {
    t.cyl(0.08, 0.09, gun, 0, th * 0.6, tl * 0.5 + gun / 2, pal.metal, { rot: [PI / 2, 0, 0], camo: 0 });
    t.box(0.5, 0.4, 0.9, tw * 0.55, th * 0.55, 0.2, pal.dark, { camo: 0 }); // missile launcher box
  } else {
    t.cyl(0.13, 0.15, gun, 0, th * 0.55, tl * 0.5 + gun / 2, pal.metal, { rot: [PI / 2, 0, 0], camo: 0 });
    t.cyl(0.19, 0.19, 0.5, 0, th * 0.55, tl * 0.5 + gun - 0.15, pal.metal, { rot: [PI / 2, 0, 0], camo: 0 });
    if (decoy) t.cyl(0.13, 0.13, 0.6, 0, th * 0.55, tl * 0.5 + gun + 0.3, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 });
  }
  if (era) for (let i = 0; i < 4; i++) t.box(0.12, 0.45, 0.55, (i < 2 ? -1 : 1) * (tw / 2 + 0.07), th * 0.55, tl * 0.1 + (i % 2) * 0.8, pal.dark, { camo: 0 });
  // hatches, sights
  t.cyl(0.32, 0.32, 0.14, -tw * 0.22, th + 0.05, -tl * 0.1, pal.dark, { camo: 0 });
  t.box(0.36, 0.3, 0.36, tw * 0.22, th + 0.12, -tl * 0.05, pal.glass, { camo: 0, grime: 0 });
  t.cyl(0.04, 0.04, 1.1, -tw * 0.35, th + 0.6, -tl * 0.4, pal.dark, { camo: 0 });
  for (let i = 0; i < 4; i++) t.cyl(0.06, 0.06, 0.2, -tw * 0.5 + 0.1, th * 0.7, tl * 0.1 + i * 0.22, pal.dark, { rot: [0, 0, PI / 2], camo: 0 });
  // team marking on the turret roof + rear
  tm.box(tw * 0.6, 0.06, 0.5, 0, 0.55 + hullH + 0.36 + th + 0.02, tz - tl * 0.25, TEAM_COL, { camo: 0, grime: 0 });
  tm.box(0.9, 0.5, 0.06, 0, ty + 0.5, tz - tl * 0.51, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), turret: t.build(), turretPivot: [0, ty, tz], team: tm.build(), height: 3.6 };
};

const wheeled: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 6), wid = num(spec.wid, 2.6), n = num(spec.wheels, 4);
  const tk = String(spec.turret ?? 'mg');
  const bed = !!spec.bed;
  const b = new GeoBuilder(0.55, 0.45, seedOf(style + len));
  const t = new GeoBuilder(0.5, 0.35, 3);
  const tm = new GeoBuilder(0, 0);
  const r = len > 6.5 ? 0.72 : 0.58;
  wheels(b, len, wid, n * 2, r, pal);
  const hy = r + 0.55;
  if (bed) {
    b.slab(wid - 0.4, 1.0, len * 0.38, 0.5, 0, hy + 0.2, len * 0.28, pal.main);
    b.box(wid - 0.5, 0.2, len * 0.5, 0, hy + 0.05, -len * 0.2, pal.dark);
    for (const s of [-1, 1]) b.box(0.1, 0.55, len * 0.5, s * (wid / 2 - 0.3), hy + 0.38, -len * 0.2, pal.main);
    b.box(wid - 0.2, 0.55, 0.1, 0, hy + 0.38, -len * 0.45, pal.main);
    b.cyl(0.06, 0.06, 1.2, 0, hy + 1.3, -len * 0.25, pal.dark, { rot: [0, 0, PI / 2], camo: 0 });
  } else {
    b.box(wid, 1.15, len * 0.86, 0, hy + 0.3, -len * 0.04, pal.main);
    b.slab(wid * 0.96, 0.95, len * 0.24, 0.55, 0, hy + 0.3, len * 0.38, pal.main);
    b.box(wid * 0.92, 0.12, len * 0.5, 0, hy + 0.95, -len * 0.12, pal.alt, { camo: 0.8 });
    for (const s of [-1, 1]) b.box(0.08, 0.55, 0.9, s * (wid / 2 + 0.03), hy + 0.35, len * 0.1, pal.glass, { camo: 0, grime: 0 });
  }
  b.box(wid + 0.1, 0.3, 0.3, 0, hy - 0.15, len / 2 - 0.1, pal.dark, { camo: 0 });
  antenna(b, wid * 0.4, hy + 0.9, -len * 0.38, 1.4, pal, tm);
  let pivot: [number, number, number] | undefined;
  if (tk === 'mg') {
    pivot = [0, hy + 1.0, bed ? -len * 0.18 : 0.1];
    t.cyl(0.4, 0.4, 0.2, 0, 0.1, 0, pal.metal, { camo: 0 });
    t.box(0.55, 0.5, 0.7, 0, 0.5, 0, pal.main);
    t.box(0.1, 0.12, 1.3, 0, 0.55, 0.9, pal.dark, { camo: 0 });
    t.box(0.5, 0.08, 0.5, 0, 0.78, 0.05, pal.dark, { camo: 0 });
  } else if (tk === 'cannon') {
    pivot = [0, hy + 1.0, -len * 0.04];
    t.box(1.7, 0.85, 2.1, 0, 0.42, 0, pal.main);
    t.slab(1.6, 0.7, 1.0, 0.4, 0, 0.4, 1.0, pal.main);
    t.cyl(0.07, 0.08, 3.0, 0, 0.55, 2.4, pal.metal, { rot: [PI / 2, 0, 0], camo: 0 });
    t.box(0.35, 0.3, 0.6, 0.5, 0.95, 0.3, pal.glass, { camo: 0, grime: 0 });
  }
  const tmg = tm.build();
  return { body: b.build(), turret: pivot ? t.build() : undefined, turretPivot: pivot, team: tmg, height: 3 };
};

const truck: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 7);
  const b = new GeoBuilder(0.3, 0.5, seedOf(style + 'truck'));
  const tm = new GeoBuilder(0, 0);
  const wid = 2.8;
  wheels(b, len, wid, 6, 0.65, pal);
  b.box(wid - 0.2, 0.35, len, 0, 1.15, 0, pal.dark, { camo: 0 });
  b.box(wid - 0.4, 1.7, 1.8, 0, 2.1, len * 0.36, pal.main);
  b.slab(wid - 0.5, 0.9, 0.7, 0.4, 0, 1.75, len * 0.5 + 0.1, pal.main);
  b.box(wid - 0.5, 0.65, 0.1, 0, 2.5, len * 0.5 + 0.6, pal.glass, { camo: 0, grime: 0 });
  // cargo: stacked crates / container
  b.box(wid - 0.2, 2.0, len * 0.58, 0, 2.3, -len * 0.14, pal.alt, { camo: 0.5 });
  for (let i = 0; i < 4; i++) b.box(wid - 0.5, 0.1, 0.12, 0, 2.3, -len * 0.4 + i * 1.3, pal.dark, { camo: 0 });
  b.box(0.5, 1.6, 0.06, 0, 2.3, -len * 0.44, pal.accent, { camo: 0 });
  tm.box(1.0, 0.6, 0.06, 0, 2.7, len * 0.11, TEAM_COL, { camo: 0, grime: 0 });
  tm.box(0.06, 0.6, 1.0, wid / 2 - 0.1, 2.7, -len * 0.14, TEAM_COL, { camo: 0, grime: 0 });
  tm.box(0.06, 0.6, 1.0, -wid / 2 + 0.1, 2.7, -len * 0.14, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), height: 3.4 };
};

const dozer: Builder = ({ pal }) => {
  const b = new GeoBuilder(0.2, 0.7, 11);
  const tm = new GeoBuilder(0, 0);
  const yel = 0xd9a62a;
  tracks(b, 5.4, 3.4, pal, 0.9);
  b.box(2.0, 0.8, 4.2, 0, 1.2, -0.2, yel, { camo: 0, grime: 0.6 });
  b.box(1.7, 1.6, 1.6, 0, 2.2, -0.4, yel, { camo: 0, grime: 0.5 });
  b.box(1.5, 0.8, 0.08, 0, 2.45, 0.42, pal.glass, { camo: 0, grime: 0 });
  b.box(1.6, 0.14, 1.7, 0, 3.05, -0.4, pal.dark, { camo: 0 });
  b.cyl(0.08, 0.08, 1.4, 0.6, 3.6, -1.0, pal.dark, { camo: 0 });
  // blade
  b.box(3.6, 1.1, 0.3, 0, 0.9, 3.5, pal.metal, { camo: 0, grime: 0.8 });
  for (const s of [-1, 1]) b.box(0.2, 0.2, 2.2, s * 1.2, 0.8, 2.4, yel, { camo: 0 });
  tm.box(0.5, 0.2, 0.4, 0, 3.15, -0.4, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), height: 3.6 };
};

const artillery: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 9), wid = num(spec.wid, 3.4), gun = num(spec.gun, 6.5);
  const b = new GeoBuilder(0.6, 0.45, seedOf(style + 'arty'));
  const t = new GeoBuilder(0.6, 0.35, 9);
  const tm = new GeoBuilder(0, 0);
  tracks(b, len, wid, pal, 1.0);
  b.box(wid - 1.4, 0.9, len * 0.9, 0, 1.2, 0, pal.main);
  b.slab(wid - 1.5, 0.8, len * 0.2, 0.55, 0, 1.2, len * 0.4, pal.main);
  b.box(wid - 1.6, 0.6, 1.2, 0, 1.0, len * 0.2, pal.glass, { camo: 0, grime: 0 });
  // spades
  b.box(wid - 0.6, 1.2, 0.2, 0, 0.9, -len / 2 - 0.1, pal.dark, { camo: 0 });
  const ty = 1.75, tz = -0.8;
  t.box(wid - 0.7, 1.5, 4.2, 0, 0.75, 0, pal.main);
  t.slab(wid - 0.8, 1.3, 1.3, 0.8, 0, 0.7, 2.2, pal.main);
  t.cyl(0.22, 0.26, gun, 0, 1.0, 2.6 + gun / 2 - 0.5, pal.metal, { rot: [PI / 2 - 0.12, 0, 0], camo: 0 });
  t.cyl(0.35, 0.35, 0.45, 0, 1.0 + gun * 0.06 - 0.1, 2.6 + gun - 0.5, pal.metal, { rot: [PI / 2 - 0.12, 0, 0], camo: 0 });
  t.box(0.5, 0.4, 0.7, 0.8, 1.7, 0.4, pal.dark, { camo: 0 });
  tm.box(wid * 0.5, 0.06, 0.6, 0, ty + 1.52, tz, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), turret: t.build(), turretPivot: [0, ty, tz], team: tm.build(), height: 3.4 };
};

const mlrs: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 8), wid = num(spec.wid, 2.9), tubes = num(spec.tubes, 6);
  const b = new GeoBuilder(0.5, 0.5, seedOf(style + 'mlrs'));
  const tm = new GeoBuilder(0, 0);
  wheels(b, len, wid, 8, 0.7, pal);
  b.box(wid - 0.2, 0.4, len, 0, 1.2, 0, pal.dark, { camo: 0 });
  b.box(wid - 0.4, 1.8, 2.2, 0, 2.2, len * 0.34, pal.main);
  b.slab(wid - 0.5, 1.0, 0.8, 0.5, 0, 1.8, len * 0.46 + 0.3, pal.main);
  b.box(wid - 0.5, 0.7, 0.1, 0, 2.7, len * 0.46 + 0.9, pal.glass, { camo: 0, grime: 0 });
  // launcher pod, elevated
  const cols = tubes >= 8 ? 4 : 3, rows = Math.ceil(tubes / cols);
  b.box(wid - 0.5, 0.35, 4.2, 0, 1.75, -len * 0.14, pal.metal, { camo: 0 });
  const podW = cols * 0.55, podH = rows * 0.55;
  b.box(podW + 0.2, podH + 0.2, 3.4, 0, 2.5 + podH / 2, -len * 0.14, pal.main, { rot: [-0.32, 0, 0], camo: 0.5 });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (r * cols + c >= tubes) continue;
    b.cyl(0.22, 0.22, 0.2, (c - (cols - 1) / 2) * 0.55, 2.5 + podH / 2 + (r - (rows - 1) / 2) * 0.55 + 0.7, -len * 0.14 + 1.8 + 0.2, pal.dark, { rot: [PI / 2 - 0.32, 0, 0], camo: 0 });
  }
  tm.box(0.8, 0.5, 0.06, 0, 3.0, len * 0.24, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), height: 4.2 };
};

const tel: Builder = ({ spec, pal, style }) => {
  // transporter-erector-launcher: ballistic missile on a truck
  const len = num(spec.len, 10), wid = num(spec.wid, 3);
  const b = new GeoBuilder(0.45, 0.5, seedOf(style + 'tel'));
  const tm = new GeoBuilder(0, 0);
  wheels(b, len, wid, 8, 0.75, pal);
  b.box(wid - 0.2, 0.45, len, 0, 1.25, 0, pal.dark, { camo: 0 });
  b.box(wid - 0.5, 1.9, 2.2, 0, 2.3, len * 0.36, pal.main);
  b.box(wid - 0.5, 0.8, 0.1, 0, 2.8, len * 0.36 + 1.15, pal.glass, { camo: 0, grime: 0 });
  b.box(1.9, 0.6, len * 0.62, 0, 1.75, -len * 0.14, pal.metal, { camo: 0 });
  // missile lying along the bed, tilted
  b.cyl(0.55, 0.55, len * 0.55, 0, 2.7, -len * 0.14, pal.alt, { rot: [PI / 2 - 0.1, 0, 0], camo: 0.4 });
  b.cone(0.55, 1.6, 0, 2.7 + len * 0.025, len * 0.14 + 0.9, pal.main, { rot: [PI / 2 - 0.1, 0, 0], camo: 0.3 });
  for (let i = 0; i < 3; i++) b.box(1.4, 0.12, 0.7, 0, 2.7, -len * 0.38 + i * 0.1, pal.dark, { camo: 0 });
  tm.box(0.9, 0.5, 0.06, 0, 3.2, len * 0.37, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), height: 4.2 };
};

const sam: Builder = ({ spec, pal, style }) => {
  const mobile = !!spec.mobile;
  const tubes = num(spec.tubes, 4);
  const b = new GeoBuilder(0.45, 0.45, seedOf(style + 'sam'));
  const t = new GeoBuilder(0.45, 0.35, 2);
  const tm = new GeoBuilder(0, 0);
  if (mobile) {
    const len = num(spec.len, 9), wid = num(spec.wid, 3);
    wheels(b, len, wid, 8, 0.7, pal);
    b.box(wid - 0.2, 0.4, len, 0, 1.2, 0, pal.dark, { camo: 0 });
    b.box(wid - 0.4, 1.8, 2.2, 0, 2.2, len * 0.34, pal.main);
    b.box(wid - 0.5, 0.7, 0.1, 0, 2.6, len * 0.34 + 1.15, pal.glass, { camo: 0, grime: 0 });
    // radar mast
    b.cyl(0.12, 0.12, 2.2, -0.8, 3.6, -len * 0.05, pal.metal, { camo: 0 });
    b.box(1.6, 0.9, 0.1, -0.8, 5.0, -len * 0.05, pal.dark, { camo: 0 });
    // erected tubes
    for (let i = 0; i < tubes; i++) {
      const cx = ((i % 2) - 0.5) * 1.0, cy = Math.floor(i / 2) * 0.9;
      b.cyl(0.38, 0.38, 4.2, cx, 3.0 + cy, -len * 0.18, pal.main, { rot: [PI / 2 - 0.9, 0, 0], camo: 0.4 });
      b.cone(0.38, 0.9, cx, 3.0 + cy + 2.0, -len * 0.18 + 1.7, pal.light, { rot: [PI / 2 - 0.9, 0, 0], camo: 0 });
    }
    tm.box(0.8, 0.5, 0.06, 0, 3.0, len * 0.34, TEAM_COL, { camo: 0, grime: 0 });
    return { body: b.build(), team: tm.build(), height: 5 };
  }
  const w = num(spec.w, 14);
  b.box(w, 0.6, w, 0, 0.3, 0, pal.concrete, { camo: 0, grime: 0.5 });
  b.cyl(2.2, 2.6, 1.4, 0, 1.3, 0, pal.metal, { camo: 0 });
  t.box(2.8, 0.7, 3.4, 0, 0.35, 0, pal.main);
  for (let i = 0; i < tubes; i++) {
    const cx = ((i % 2) - 0.5) * 1.3, cy = Math.floor(i / 2) * 1.1;
    t.cyl(0.46, 0.46, 5.0, cx, 1.4 + cy, 0.6, pal.main, { rot: [PI / 2 - 0.85, 0, 0], camo: 0.3 });
    t.cone(0.46, 1.0, cx, 1.4 + cy + 2.3, 0.6 + 2.3, pal.light, { rot: [PI / 2 - 0.85, 0, 0], camo: 0 });
  }
  tm.box(w * 0.5, 0.1, 0.5, 0, 0.65, w / 2 - 1.2, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), turret: t.build(), turretPivot: [0, 2.0, 0], team: tm.build(), height: 5 };
};

const gunturret: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 10), barrels = num(spec.barrels, 1);
  const b = new GeoBuilder(0.4, 0.4, seedOf(style + 'gt'));
  const t = new GeoBuilder(0.4, 0.3, 4);
  const tm = new GeoBuilder(0, 0);
  b.box(w, 0.6, w, 0, 0.3, 0, pal.concrete, { camo: 0, grime: 0.6 });
  b.cyl(2.2, 2.6, 1.6, 0, 1.4, 0, pal.main);
  b.cyl(2.0, 2.0, 0.2, 0, 2.3, 0, pal.metal, { camo: 0 });
  t.cyl(1.7, 1.9, 1.3, 0, 0.65, 0, pal.main);
  t.sphere(1.0, 0, 1.6, -0.3, pal.light, { camo: 0, sy: 0.8 });
  for (let i = 0; i < barrels; i++) t.cyl(0.14, 0.17, 3.2, (i - (barrels - 1) / 2) * 0.7, 0.9, 2.0, pal.metal, { rot: [PI / 2, 0, 0], camo: 0 });
  t.box(0.9, 0.7, 1.4, 0, 0.9, 0.7, pal.dark, { camo: 0 });
  tm.box(w * 0.5, 0.1, 0.5, 0, 0.65, w / 2 - 1.0, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), turret: t.build(), turretPivot: [0, 2.4, 0], team: tm.build(), height: 5 };
};

// ------------------------------------------------------------------------------ aircraft
const jet: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 15), span = num(spec.span, 10);
  const stealth = !!spec.stealth;
  const b = new GeoBuilder(stealth ? 0.15 : 0.5, 0.3, seedOf(style + 'jet'));
  const tm = new GeoBuilder(0, 0);
  const col = stealth ? 0x4d5257 : pal.main;
  b.cyl(0.9, 0.55, len * 0.75, 0, 0, len * 0.08, col, { rot: [PI / 2, 0, 0], camo: stealth ? 0 : 0.7 });
  b.cone(0.62, len * 0.3, 0, 0, len * 0.5, col, { rot: [PI / 2, 0, 0], camo: 0 });
  b.cyl(0.45, 0.6, 1.5, 0, 0, -len * 0.43, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 });
  b.sphere(0.65, 0, 0.55, len * 0.18, pal.glass, { camo: 0, grime: 0, sz: 2.2, sy: 0.7 });
  // wings
  b.tri(span, len * 0.5, 0.22, 0, 0, -len * 0.06, col, { camo: stealth ? 0 : 0.6 });
  // tail fins
  for (const s of [-1, 1]) {
    b.box(0.2, 1.8, 1.6, s * 0.9, 1.0, -len * 0.4, col, { rot: [0, 0, s * 0.35], camo: 0 });
    b.box(1.5, 0.15, 1.2, s * 1.4, 0, -len * 0.45, col, { camo: 0 });
  }
  // intakes
  for (const s of [-1, 1]) b.box(0.55, 0.65, 2.0, s * 0.85, -0.2, len * 0.2, pal.dark, { camo: 0 });
  tm.box(0.4, 0.05, 1.4, span * 0.34, 0.14, -len * 0.08, TEAM_COL, { camo: 0, grime: 0 });
  tm.box(0.4, 0.05, 1.4, -span * 0.34, 0.14, -len * 0.08, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), height: 3, flier: true };
};

const bomber: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 21), span = num(spec.span, 40);
  const b = new GeoBuilder(0.1, 0.25, seedOf(style + 'bmb'));
  const tm = new GeoBuilder(0, 0);
  const col = 0x3b4046;
  b.tri(span, len, 0.9, 0, 0, 0, col, { camo: 0, rot: [0, 0, 0] });
  b.tri(span * 0.55, len * 1.0, 0.5, 0, 0.7, -len * 0.18, col, { camo: 0 });
  b.sphere(1.5, 0, 0.9, len * 0.22, pal.glass, { camo: 0, grime: 0, sy: 0.6, sz: 1.6 });
  for (const s of [-1, 1]) b.box(1.6, 0.8, 3.0, s * 4.0, 0.1, -len * 0.3, pal.dark, { camo: 0 });
  tm.box(1.4, 0.06, 3.0, span * 0.3, 0.5, -len * 0.05, TEAM_COL, { camo: 0, grime: 0 });
  tm.box(1.4, 0.06, 3.0, -span * 0.3, 0.5, -len * 0.05, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), height: 3, flier: true };
};

const heli: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 15), rotor = num(spec.rotor, 14);
  const b = new GeoBuilder(0.55, 0.4, seedOf(style + 'heli'));
  const r = new GeoBuilder(0, 0.1, 3);
  const tm = new GeoBuilder(0, 0);
  const col = pal.main;
  b.box(2.0, 2.0, len * 0.42, 0, 0, len * 0.12, col, { camo: 0.7 });
  b.sphere(1.1, 0, 0.1, len * 0.33, col, { camo: 0.7, sz: 1.5 });
  b.sphere(0.9, 0, 0.55, len * 0.38, pal.glass, { camo: 0, grime: 0, sz: 1.2, sy: 0.8 });
  b.box(0.8, 0.8, len * 0.5, 0, 0.3, -len * 0.3, col, { camo: 0.6 });
  b.box(0.15, 2.0, 1.2, 0, 1.0, -len * 0.52, col, { camo: 0 });
  // stub wings + pods
  for (const s of [-1, 1]) {
    b.box(2.2, 0.15, 1.2, s * 1.9, -0.1, len * 0.1, col, { camo: 0.5 });
    b.cyl(0.28, 0.28, 1.6, s * 2.8, -0.45, len * 0.1, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 });
    // skids
    b.box(0.12, 0.12, len * 0.38, s * 1.2, -1.4, len * 0.1, pal.dark, { camo: 0 });
    b.box(0.12, 1.0, 0.12, s * 1.2, -0.9, len * 0.22, pal.dark, { camo: 0 });
    b.box(0.12, 1.0, 0.12, s * 1.2, -0.9, -len * 0.02, pal.dark, { camo: 0 });
  }
  b.cyl(0.35, 0.35, 0.8, 0, 1.4, len * 0.1, pal.dark, { camo: 0 });
  b.cyl(0.05, 0.05, 1.6, 0, 1.0, len * 0.4 + 0.8, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 }); // chin gun
  // main rotor blades (separate rotating mesh)
  for (let i = 0; i < 4; i++) r.box(rotor * 0.5, 0.06, 0.55, (rotor * 0.25), 0, 0, pal.dark, { rot: [0, (i * PI) / 2, 0], camo: 0 });
  tm.box(1.0, 0.5, 0.06, 0, 0.7, -len * 0.5 - 0.05, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), rotor: rotorMerge(r), rotorPivot: [0, 1.95, len * 0.1], rotorAxis: 'y', rotorSpeed: 28, height: 4, flier: true };
};

function rotorMerge(r: GeoBuilder): THREE.BufferGeometry { return r.build(); }

const drone: Builder = ({ spec, pal, style }) => {
  const len = num(spec.len, 11), span = num(spec.span, 20);
  const b = new GeoBuilder(0.2, 0.3, seedOf(style + 'drn'));
  const r = new GeoBuilder(0, 0.1, 3);
  const tm = new GeoBuilder(0, 0);
  const col = 0x6e7276;
  b.cyl(0.7, 0.35, len * 0.9, 0, 0, 0, col, { rot: [PI / 2, 0, 0], camo: 0 });
  b.sphere(0.72, 0, 0.05, len * 0.42, col, { camo: 0, sz: 1.5 });
  b.box(span, 0.12, 1.5, 0, 0.35, -0.5, col, { camo: 0 });
  for (const s of [-1, 1]) b.box(0.12, 1.4, 1.3, s * 0.6, 0.6, -len * 0.45, col, { rot: [0, 0, s * 0.7], camo: 0 });
  for (const s of [-1, 1]) b.cyl(0.18, 0.18, 1.4, s * 3, -0.2, -0.5, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 });
  r.box(1.9, 0.04, 0.16, 0, 0, 0, pal.dark, { camo: 0 });
  r.box(0.16, 0.04, 1.9, 0, 0, 0, pal.dark, { camo: 0 });
  tm.box(0.5, 0.05, 1.0, span * 0.3, 0.42, -0.4, TEAM_COL, { camo: 0, grime: 0 });
  tm.box(0.5, 0.05, 1.0, -span * 0.3, 0.42, -0.4, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: tm.build(), rotor: r.build(), rotorPivot: [0, 0, -len * 0.46], rotorAxis: 'z', rotorSpeed: 60, height: 2, flier: true };
};

const loiter: Builder = ({ spec, pal, style }) => {
  // delta-wing loitering munitions (shahed-style swarm)
  const n = num(spec.n, 5);
  const b = new GeoBuilder(0.2, 0.3, seedOf(style + 'loi'));
  const tm = new GeoBuilder(0, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2, ox = Math.sin(a) * 3.2, oz = Math.cos(a) * 2.2, oy = (i % 2) * 1.2;
    b.cyl(0.22, 0.2, 3.4, ox, oy, oz, pal.light, { rot: [PI / 2, 0, 0], camo: 0 });
    b.cone(0.22, 0.8, ox, oy, oz + 2.0, pal.light, { rot: [PI / 2, 0, 0], camo: 0 });
    b.tri(2.6, 2.0, 0.08, ox, oy, oz - 0.3, pal.light, { camo: 0 });
    b.box(0.05, 0.6, 0.6, ox, oy + 0.3, oz - 1.5, pal.light, { camo: 0 });
    tm.box(0.2, 0.04, 0.5, ox + 0.7, oy + 0.06, oz - 0.5, TEAM_COL, { camo: 0, grime: 0 });
  }
  return { body: b.build(), team: tm.build(), height: 2, flier: true };
};

// ------------------------------------------------------------------------------ structures
function windows(g: GeoBuilder, w: number, h: number, d: number, y0: number, rows: number, cols: number, face: 'z' | 'x' | 'both', color = 0xffe7a0): void {
  const dy = h / (rows + 0.5);
  if (face === 'z' || face === 'both') for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = ((c + 0.5) / cols - 0.5) * (w - 1.4);
    g.box(0.8, 0.55, 0.06, x, y0 + (r + 0.6) * dy, d / 2 + 0.02, color, { camo: 0, grime: 0, jitter: 0.3 });
  }
  if (face === 'x' || face === 'both') for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const z = ((c + 0.5) / cols - 0.5) * (d - 1.4);
    g.box(0.06, 0.55, 0.8, w / 2 + 0.02, y0 + (r + 0.6) * dy, z, color, { camo: 0, grime: 0, jitter: 0.3 });
  }
}

function flag(t: GeoBuilder, x: number, y: number, z: number, h: number, p: Palette, b: GeoBuilder): void {
  b.cyl(0.08, 0.1, h, x, y + h / 2, z, p.light, { camo: 0, grime: 0.1 });
  t.box(0.06, 1.3, 2.0, x, y + h - 0.8, z + 1.1, TEAM_COL, { camo: 0, grime: 0 });
}

function foundation(b: GeoBuilder, w: number, d: number, p: Palette): void {
  b.box(w + 1.2, 3.0, d + 1.2, 0, -1.0, 0, p.concrete, { camo: 0, grime: 0.7 });
}

const command: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 34), d = num(spec.d, 34);
  const b = new GeoBuilder(0.0, 0.5, seedOf(style + 'cc'));
  const t = new GeoBuilder(0, 0);
  const gl = new GeoBuilder(0, 0);
  const r = new GeoBuilder(0, 0.2, 4);
  foundation(b, w, d, pal);
  const wall = style === 'china' ? pal.concrete : style === 'iran' ? pal.concrete : pal.light;
  // main block + wings
  b.box(w * 0.5, 11, d * 0.5, 0, 5.5, 0, wall);
  b.box(w * 0.92, 6.5, d * 0.3, 0, 3.2, d * 0.28, wall);
  b.box(w * 0.3, 7.5, d * 0.85, -w * 0.3, 3.7, -d * 0.04, wall);
  b.box(w * 0.3, 7.5, d * 0.85, w * 0.3, 3.7, -d * 0.04, wall);
  if (style === 'china') { b.roof(w * 0.6, 4.5, d * 0.62, 0, 11, 0, pal.roof, { camo: 0 }); for (const s of [-1, 1]) b.roof(w * 0.34, 3, d * 0.9, s * w * 0.3, 7.5, -d * 0.04, pal.roof, { camo: 0 }); }
  else if (style === 'iran') { b.cyl(w * 0.2, w * 0.2, 2.2, 0, 12, 0, pal.alt, { camo: 0 }); b.sphere(w * 0.2, 0, 13, 0, pal.accent, { camo: 0, sy: 0.7 }); }
  else { b.box(w * 0.54, 1.2, d * 0.54, 0, 11.6, 0, pal.roof, { camo: 0 }); b.cyl(3.2, 3.2, 1.0, 0, 12.8, 0, pal.metal, { camo: 0 }); }
  // entrance
  b.box(8, 5, 2, 0, 2.5, d * 0.44 + 1, pal.dark, { camo: 0 });
  b.box(10, 0.6, 3.4, 0, 5.4, d * 0.44 + 1.4, pal.alt, { camo: 0 });
  // mast + dish
  b.cyl(0.25, 0.35, 12, w * 0.3, 15, -d * 0.2, pal.metal, { camo: 0 });
  b.cyl(2.2, 0.4, 0.7, -w * 0.3, 12.2, -d * 0.2, pal.light, { camo: 0, rot: [-0.5, 0, 0] });
  windows(gl, w * 0.5, 11, d * 0.5, 0, 3, 4, 'both');
  windows(gl, w * 0.92, 6.5, d * 0.3, 0, 2, 7, 'z');
  flag(t, -w * 0.45, 0, d * 0.5, 18, pal, b);
  t.box(w * 0.5, 0.5, 0.3, 0, 6.8, d * 0.44 + 3.0, TEAM_COL, { camo: 0, grime: 0 });
  r.box(1.6, 0.2, 5.0, 0, 0, 0, pal.light, { camo: 0 });
  for (let i = 0; i < 3; i++) r.box(1.0, 0.2, 0.4, 0, 0.3, -1.5 + i * 1.5, pal.dark, { camo: 0 });
  return { body: b.build(), team: t.build(), glow: gl.build(), rotor: r.build(), rotorPivot: [w * 0.3, 12.4, -d * 0.2], rotorAxis: 'y', rotorSpeed: 1.2, height: 18 };
};

const reactor: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 20), d = num(spec.d, 20);
  const b = new GeoBuilder(0, 0.5, seedOf(style + 'rx'));
  const gl = new GeoBuilder(0, 0);
  const t = new GeoBuilder(0, 0);
  foundation(b, w, d, pal);
  b.cyl(w * 0.28, w * 0.34, 12, -w * 0.18, 6, 0, pal.concrete, { camo: 0 });
  b.cyl(w * 0.22, w * 0.28, 4, -w * 0.18, 13.5, 0, pal.concrete, { camo: 0 });
  b.sphere(w * 0.26, w * 0.28, 4.5, -d * 0.1, pal.light, { camo: 0, sy: 0.95 });
  b.box(w * 0.5, 3, d * 0.45, w * 0.18, 1.5, d * 0.25, pal.alt, { camo: 0.2 });
  for (let i = 0; i < 4; i++) b.cyl(0.4, 0.4, d * 0.7, -w * 0.45 + i * 0.001, 1.5 + (i % 2) * 0.8, 0, pal.metal, { rot: [PI / 2, 0, 0], camo: 0, grime: 0.5 });
  gl.cyl(w * 0.285, w * 0.285, 0.5, -w * 0.18, 12.2, 0, 0x6be3ff, { camo: 0, grime: 0 });
  gl.cyl(w * 0.226, w * 0.226, 0.4, -w * 0.18, 15.8, 0, 0x6be3ff, { camo: 0, grime: 0 });
  gl.box(0.6, 0.6, 0.12, w * 0.18, 3.1, d * 0.48, 0x7dff9a, { camo: 0, grime: 0 });
  t.box(w * 0.4, 0.3, 0.3, w * 0.18, 3.2, d * 0.5, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), glow: gl.build(), height: 18 };
};

const hallBuilding = (opts: { roof: 'flat' | 'pitched' | 'saw' | 'arch'; h: number; chimney?: boolean; doors?: number; wallKey?: 'light' | 'concrete' | 'main'; windowsRows?: number }): Builder => ({ spec, pal, style }) => {
  const w = num(spec.w, 26), d = num(spec.d, 20);
  const b = new GeoBuilder(0.0, 0.55, seedOf(style + opts.roof + w));
  const t = new GeoBuilder(0, 0);
  const gl = new GeoBuilder(0, 0);
  foundation(b, w, d, pal);
  const wallCol = opts.wallKey === 'main' ? pal.main : opts.wallKey === 'concrete' ? pal.concrete : pal.light;
  const h = opts.h;
  b.box(w, h, d, 0, h / 2, 0, wallCol, { camo: opts.wallKey === 'main' ? 0.6 : 0 });
  const roofCol = style === 'china' ? pal.roof : pal.metal;
  if (opts.roof === 'pitched') b.roof(w + 1, h * 0.38, d + 1, 0, h, 0, roofCol, { camo: 0, rot: [0, PI / 2, 0] });
  else if (opts.roof === 'saw') for (let i = 0; i < 4; i++) b.roof(w + 0.5, h * 0.4, d / 4.2, 0, h, -d * 0.375 + i * (d / 4), roofCol, { camo: 0, rot: [0, PI / 2, 0], sx: 1 });
  else if (opts.roof === 'arch') { b.cyl(d * 0.5, d * 0.5, w, 0, h, 0, roofCol, { rot: [0, 0, PI / 2], camo: 0, seg: 18, sy: 0.55 }); }
  else b.box(w + 0.8, 0.7, d + 0.8, 0, h + 0.35, 0, roofCol, { camo: 0 });
  const doors = opts.doors ?? 1;
  for (let i = 0; i < doors; i++) {
    const x = doors === 1 ? 0 : ((i + 0.5) / doors - 0.5) * w * 0.8;
    b.box(Math.min(9, (w * 0.7) / doors), h * 0.75, 0.5, x, h * 0.375, d / 2 + 0.2, pal.dark, { camo: 0, grime: 0.4 });
  }
  if (opts.chimney) { b.cyl(0.9, 1.2, h * 1.5, w * 0.35, h * 1.1, -d * 0.3, pal.concrete, { camo: 0 }); gl.cyl(0.8, 0.8, 0.3, w * 0.35, h * 1.85, -d * 0.3, 0xff7a3a, { camo: 0, grime: 0 }); }
  windows(gl, w, h, d, 0.5, opts.windowsRows ?? 1, Math.max(2, Math.round(w / 6)), 'both');
  t.box(w * 0.85, 0.6, 0.3, 0, h - 0.8, d / 2 + 0.3, TEAM_COL, { camo: 0, grime: 0 });
  t.box(0.3, 0.6, d * 0.85, w / 2 + 0.3, h - 0.8, 0, TEAM_COL, { camo: 0, grime: 0 });
  flag(t, -w / 2 + 1.5, h, d / 2 - 1.5, 7, pal, b);
  return { body: b.build(), team: t.build(), glow: gl.build(), height: h + 6 };
};

const barracks = hallBuilding({ roof: 'pitched', h: 5, doors: 2, wallKey: 'main' });
const factory = hallBuilding({ roof: 'saw', h: 9, chimney: true, doors: 2, wallKey: 'concrete', windowsRows: 1 });
const armory = hallBuilding({ roof: 'flat', h: 6, doors: 1, wallKey: 'main' });
const depotbuilding: Builder = (c) => {
  const base = hallBuilding({ roof: 'arch', h: 6, doors: 2, wallKey: 'concrete' })(c);
  const w = num(c.spec.w, 30), d = num(c.spec.d, 26);
  const b = new GeoBuilder(0.2, 0.6, 21);
  const pal = c.pal;
  // crates and a gantry crane outside
  for (let i = 0; i < 5; i++) b.box(2.2, 2.0, 2.2, w / 2 + 2.6, 1.0 + (i % 2) * 2, -d * 0.3 + i * 2.4, [0x8a6a3a, 0x5d6a4a, 0x7a5a30][i % 3], { camo: 0, grime: 0.6 });
  b.box(0.5, 8, 0.5, w / 2 + 6, 4, d * 0.2, pal.metal, { camo: 0 });
  b.box(0.5, 8, 0.5, w / 2 + 6, 4, -d * 0.2, pal.metal, { camo: 0 });
  b.box(0.7, 0.7, d * 0.5, w / 2 + 6, 8.2, 0, pal.accent, { camo: 0 });
  const extra = b.build();
  return { ...base, body: mergeTwo(base.body, extra) };
};

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const strip = (g: THREE.BufferGeometry) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
  const m = mergeGeometries([strip(a), strip(b)], false)!;
  m.computeBoundingSphere();
  return m;
}

const airfield: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 60), d = num(spec.d, 40);
  const b = new GeoBuilder(0.0, 0.4, seedOf(style + 'af'));
  const gl = new GeoBuilder(0, 0);
  const t = new GeoBuilder(0, 0);
  b.box(w, 0.4, d, 0, 0.2, 0, 0x45484a, { camo: 0, grime: 0.6 });
  for (let i = 0; i < 8; i++) b.box(3.5, 0.05, 0.5, -w * 0.4 + i * (w * 0.8) / 7, 0.45, d * 0.1, pal.light, { camo: 0, grime: 0.1 });
  // hangar
  b.box(w * 0.4, 6, d * 0.34, -w * 0.28, 3, -d * 0.32, pal.concrete, { camo: 0 });
  b.cyl(d * 0.17, d * 0.17, w * 0.4, -w * 0.28, 6, -d * 0.32, pal.metal, { rot: [0, 0, PI / 2], camo: 0, seg: 16, sy: 0.55 });
  b.box(w * 0.3, 4.5, 0.4, -w * 0.28, 2.25, -d * 0.15, pal.dark, { camo: 0 });
  // tower
  b.box(3, 9, 3, w * 0.36, 4.5, -d * 0.3, pal.concrete, { camo: 0 });
  b.box(4.4, 2.4, 4.4, w * 0.36, 10, -d * 0.3, pal.glass, { camo: 0, grime: 0 });
  b.box(5, 0.5, 5, w * 0.36, 11.4, -d * 0.3, pal.dark, { camo: 0 });
  gl.box(4.6, 0.4, 4.6, w * 0.36, 10.4, -d * 0.3, 0xa0e4ff, { camo: 0, grime: 0 });
  for (let i = 0; i < 6; i++) gl.box(0.4, 0.2, 0.4, -w * 0.45 + i * (w * 0.9) / 5, 0.5, d * 0.46, 0xff7a3a, { camo: 0, grime: 0 });
  flag(t, w * 0.46, 0, d * 0.4, 9, pal, b);
  t.box(w * 0.3, 0.4, 0.4, -w * 0.28, 7.2, -d * 0.15, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), glow: gl.build(), height: 12 };
};

const radar: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 20), d = num(spec.d, 20);
  const b = new GeoBuilder(0, 0.5, seedOf(style + 'rd'));
  const r = new GeoBuilder(0, 0.2, 2);
  const t = new GeoBuilder(0, 0);
  const gl = new GeoBuilder(0, 0);
  foundation(b, w, d, pal);
  b.box(w * 0.7, 4, d * 0.7, 0, 2, 0, pal.light);
  b.cyl(w * 0.1, w * 0.14, 8, 0, 8, 0, pal.metal, { camo: 0 });
  b.cyl(w * 0.2, w * 0.2, 0.8, 0, 12.2, 0, pal.metal, { camo: 0 });
  r.cyl(w * 0.45, w * 0.1, 1.8, 0, 0.9, 0, pal.light, { camo: 0, seg: 20 });
  r.cyl(0.18, 0.18, 3.5, 0, 2.4, w * 0.12, pal.dark, { rot: [PI / 2, 0, 0], camo: 0 });
  gl.box(0.7, 0.4, 0.1, 0, 2.5, d * 0.36, 0x7dff9a, { camo: 0, grime: 0 });
  t.box(w * 0.5, 0.4, 0.3, 0, 3.7, d * 0.36, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), glow: gl.build(), rotor: r.build(), rotorPivot: [0, 12.6, 0], rotorAxis: 'y', rotorSpeed: 1.6, height: 16 };
};

const techcenter: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 32), d = num(spec.d, 28);
  const b = new GeoBuilder(0, 0.4, seedOf(style + 'tc'));
  const gl = new GeoBuilder(0, 0);
  const t = new GeoBuilder(0, 0);
  foundation(b, w, d, pal);
  b.box(w * 0.8, 9, d * 0.7, 0, 4.5, 0, pal.light);
  b.box(w * 0.5, 6, d * 0.5, 0, 12, 0, pal.glass, { camo: 0, grime: 0.1 });
  b.cyl(w * 0.16, w * 0.16, 1.2, 0, 15.6, 0, pal.metal, { camo: 0 });
  b.sphere(w * 0.14, 0, 16.6, 0, pal.light, { camo: 0, sy: 0.8 });
  for (let i = 0; i < 4; i++) b.cyl(0.15, 0.2, 10, (i % 2 ? 1 : -1) * w * 0.4, 14, (i < 2 ? 1 : -1) * d * 0.3, pal.metal, { camo: 0 });
  windows(gl, w * 0.8, 9, d * 0.7, 0, 2, 6, 'both', 0xa8e6ff);
  windows(gl, w * 0.5, 6, d * 0.5, 9, 2, 4, 'both', 0xa8e6ff);
  t.box(w * 0.7, 0.5, 0.3, 0, 8.8, d * 0.36, TEAM_COL, { camo: 0, grime: 0 });
  flag(t, -w * 0.45, 0, d * 0.4, 14, pal, b);
  return { body: b.build(), team: t.build(), glow: gl.build(), height: 20 };
};

const cyber: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 24), d = num(spec.d, 22);
  const b = new GeoBuilder(0, 0.35, seedOf(style + 'cy'));
  const gl = new GeoBuilder(0, 0);
  const t = new GeoBuilder(0, 0);
  foundation(b, w, d, pal);
  b.box(w, 7, d, 0, 3.5, 0, pal.dark, { camo: 0 });
  b.box(w + 0.6, 0.6, d + 0.6, 0, 7.2, 0, pal.metal, { camo: 0 });
  for (let i = 0; i < 6; i++) b.cyl(0.08, 0.1, 5 + (i % 3) * 2, -w * 0.4 + i * (w * 0.8) / 5, 7.5 + (5 + (i % 3) * 2) / 2, -d * 0.2, pal.metal, { camo: 0 });
  b.cyl(2.2, 0.3, 0.8, w * 0.3, 8.5, d * 0.2, pal.light, { camo: 0, rot: [-0.7, 0, 0] });
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) gl.box(1.4, 0.35, 0.06, -w * 0.38 + i * (w * 0.76) / 4, 1.5 + j * 1.6, d / 2 + 0.03, i % 2 ? 0x59f0b4 : 0x6aa8ff, { camo: 0, grime: 0 });
  t.box(w * 0.7, 0.4, 0.3, 0, 6.6, d / 2 + 0.3, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), glow: gl.build(), height: 16 };
};

const bunker: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 14);
  const b = new GeoBuilder(0.3, 0.6, seedOf(style + 'bk'));
  const t = new GeoBuilder(0, 0);
  b.box(w, 0.8, w, 0, 0.0, 0, pal.concrete, { camo: 0, grime: 0.7 });
  b.cyl(w * 0.42, w * 0.46, 2.8, 0, 1.6, 0, pal.concrete, { camo: 0.2, seg: 10 });
  b.cyl(w * 0.28, w * 0.42, 1.2, 0, 3.6, 0, pal.concrete, { camo: 0.2, seg: 10 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; b.box(w * 0.28, 0.5, 0.5, Math.sin(a) * w * 0.46, 1.9, Math.cos(a) * w * 0.46, pal.dark, { camo: 0, rot: [0, a, 0] }); }
  for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2; b.cyl(0.5, 0.5, 1.4, Math.sin(a) * w * 0.62, 0.7, Math.cos(a) * w * 0.62, 0xb59a6a, { rot: [0, 0, PI / 2], camo: 0, grime: 0.6 }); }
  t.box(w * 0.5, 0.3, 0.3, 0, 4.4, w * 0.2, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), height: 6 };
};

const silo: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 28), d = num(spec.d, 28);
  const b = new GeoBuilder(0, 0.5, seedOf(style + 'sl'));
  const gl = new GeoBuilder(0, 0);
  const t = new GeoBuilder(0, 0);
  foundation(b, w, d, pal);
  b.box(w * 0.9, 1.0, d * 0.9, 0, 0.5, 0, pal.concrete, { camo: 0 });
  b.cyl(w * 0.34, w * 0.34, 1.4, 0, 1.4, 0, pal.metal, { camo: 0, seg: 20 });
  b.cyl(w * 0.22, w * 0.22, 0.4, 0, 2.2, 0, pal.dark, { camo: 0, seg: 20 });
  // partially raised missile
  b.cyl(2.0, 2.0, 16, 0, 9, 0, pal.light, { camo: 0 });
  b.cone(2.0, 6, 0, 20, 0, pal.main, { camo: 0.4 });
  for (let i = 0; i < 4; i++) b.box(0.3, 3.5, 2.6, Math.sin(i * PI / 2) * 2.0, 2.2, Math.cos(i * PI / 2) * 2.0, pal.metal, { camo: 0, rot: [0, i * PI / 2, 0] });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    b.box(1.4, 12, 1.4, sx * w * 0.38, 6, sz * d * 0.38, pal.metal, { camo: 0 });
    gl.box(0.8, 0.8, 0.8, sx * w * 0.38, 12.4, sz * d * 0.38, 0xff3a2a, { camo: 0, grime: 0 });
  }
  t.box(w * 0.6, 0.3, 0.3, 0, 1.2, d * 0.46, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), glow: gl.build(), height: 26 };
};

const supplypile: Builder = ({ pal }) => {
  const b = new GeoBuilder(0, 0.7, 77);
  const cols = [0x8a6a3a, 0x5d6a4a, 0x7a5a30, 0x6a6258];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 1.2 + (i % 5) * 1.0;
    const h = 1.2 + (i % 3) * 0.6;
    b.box(1.6 + (i % 2) * 0.6, h, 1.6, Math.sin(a) * r, h / 2, Math.cos(a) * r, cols[i % 4], { camo: 0, grime: 0.8, rot: [0, a, 0] });
  }
  b.cyl(0.8, 0.8, 1.6, 3.2, 0.8, -3.0, 0x395a8a, { camo: 0, grime: 0.8 });
  b.cyl(0.8, 0.8, 1.6, 4.4, 0.8, -2.4, 0x8a3a30, { camo: 0, grime: 0.8 });
  const gl = new GeoBuilder(0, 0);
  gl.cyl(0.14, 0.14, 0.1, 0, 3.2, 0, 0xffd34a, { camo: 0, grime: 0 });
  void pal;
  return { body: b.build(), height: 3 };
};

const derrick: Builder = ({ spec, pal }) => {
  const w = num(spec.w, 10);
  const b = new GeoBuilder(0, 0.6, 88);
  const r = new GeoBuilder(0, 0.5, 9);
  const t = new GeoBuilder(0, 0);
  b.box(w, 0.6, w, 0, 0.2, 0, pal.concrete, { camo: 0, grime: 0.8 });
  b.box(1.6, 1.2, 3, 0, 1.0, -w * 0.25, 0x394a5a, { camo: 0 });
  for (const s of [-1, 1]) { b.box(0.3, 6.5, 0.3, s * 1.0, 3.4, w * 0.15, 0x4a4f54, { camo: 0, rot: [0.18, 0, -s * 0.12] }); }
  b.cyl(0.45, 0.45, 2.4, 0, 0.8, w * 0.3, 0x6a5a40, { camo: 0, grime: 0.9 });
  b.cyl(0.25, 0.25, 4.5, 0, 2.5, w * 0.34, 0x333638, { camo: 0 });
  r.box(0.45, 0.6, 7.5, 0, 0, 0, 0x3a6a4a, { camo: 0, grime: 0.6 });
  r.box(0.7, 1.4, 1.5, 0, -0.1, 3.5, 0x3a6a4a, { camo: 0 });
  r.box(0.7, 0.9, 1.3, 0, 0, -3.5, 0x4a4a4a, { camo: 0 });
  t.box(0.4, 0.3, 0.4, 0, 6.8, w * 0.15, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), rotor: r.build(), rotorPivot: [0, 6.8, w * 0.15], rotorAxis: 'x', rotorSpeed: 1.6, rotorRock: true, height: 8 };
};

const civ: Builder = ({ spec, pal }) => {
  const kind = String(spec.kind ?? 'house');
  const w = num(spec.w, 14), d = num(spec.d, 12);
  const b = new GeoBuilder(0, 0.6, seedOf(kind + w));
  const gl = new GeoBuilder(0, 0);
  const wall = [0xcbbfa4, 0xb8b2a0, 0xd0c7b0, 0xa99f88][seedOf(kind + w) % 4];
  const h = kind === 'tower' ? 26 : kind === 'warehouse' ? 8 : kind === 'shop' ? 6 : 6.5;
  b.box(w + 0.6, 1.0, d + 0.6, 0, -0.2, 0, pal.concrete, { camo: 0 });
  b.box(w, h, d, 0, h / 2, 0, wall, { camo: 0 });
  if (kind === 'house') b.roof(w + 1, 3, d + 1, 0, h, 0, pal.roof, { camo: 0, rot: [0, PI / 2, 0] });
  else if (kind === 'warehouse') b.roof(w + 1, 2, d + 1, 0, h, 0, pal.metal, { camo: 0, rot: [0, PI / 2, 0] });
  else { b.box(w + 0.8, 0.6, d + 0.8, 0, h + 0.3, 0, pal.metal, { camo: 0 }); if (kind === 'tower') b.cyl(0.2, 0.3, 8, 0, h + 4.5, 0, pal.metal, { camo: 0 }); }
  if (kind === 'shop') b.box(w * 0.8, 0.3, 2.4, 0, 4.2, d / 2 + 1.1, pal.accent, { camo: 0 });
  b.box(2.2, 3.2, 0.3, w * 0.2, 1.6, d / 2 + 0.1, pal.dark, { camo: 0 });
  const rows = kind === 'tower' ? 7 : 2;
  windows(gl, w, h, d, 1.2, rows, Math.max(2, Math.round(w / 5)), 'both', kind === 'tower' ? 0xbfe6ff : 0xffe2a0);
  return { body: b.build(), glow: gl.build(), height: h + 4 };
};

const tunnel: Builder = ({ spec, pal, style }) => {
  const w = num(spec.w, 16);
  const b = new GeoBuilder(0.4, 0.7, seedOf(style + 'tn'));
  const t = new GeoBuilder(0, 0);
  b.cyl(w * 0.5, w * 0.55, 2.5, 0, 0.6, 0, pal.concrete, { camo: 0.2 });
  b.box(w * 0.5, 2.8, w * 0.3, 0, 1.4, w * 0.3, pal.dark, { camo: 0 });
  b.sphere(w * 0.45, 0, 1.2, -w * 0.1, pal.alt, { camo: 0.5, sy: 0.5 });
  for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; b.cyl(0.55, 0.55, 1.5, Math.sin(a) * w * 0.62, 0.6, Math.cos(a) * w * 0.62, 0xb59a6a, { rot: [0, 0, PI / 2], camo: 0, grime: 0.6 }); }
  t.box(w * 0.4, 0.3, 0.3, 0, 3.0, w * 0.46, TEAM_COL, { camo: 0, grime: 0 });
  return { body: b.build(), team: t.build(), height: 5 };
};

const compound: Builder = (c) => hallBuilding({ roof: 'flat', h: 7, doors: 1, wallKey: 'concrete', windowsRows: 1 })(c);

const BUILDERS: Record<string, Builder> = {
  infantry, tank, wheeled, truck, dozer, artillery, mlrs, tel, sam, gunturret, jet, bomber, heli, drone, loiter,
  command, reactor, depotbuilding, barracks, factory, armory, airfield, radar, techcenter, cyber, bunker, silo, supplypile, derrick, civ, tunnel, compound,
};

const cache = new Map<string, ModelData>();

export function getModel(def: EntityDef): ModelData {
  let m = cache.get(def.id);
  if (m) return m;
  const spec = def.model;
  const style = String(spec.style ?? (def.faction === 'neutral' ? 'neutral' : def.faction));
  const pal = PALETTES[style] ?? PALETTES.neutral;
  const build = BUILDERS[spec.tpl];
  if (build) m = build({ spec, pal, style });
  else {
    const b = new GeoBuilder(0.3, 0.4, 5);
    const r = def.radius;
    b.box(r * 1.4, r * 0.8, r * 1.8, 0, r * 0.4, 0, pal.main);
    m = { body: b.build(), height: r };
  }
  cache.set(def.id, m);
  return m;
}

export function registerModelBuilder(name: string, b: Builder): void { BUILDERS[name] = b; }
export type { Builder, Ctx };
