import * as THREE from 'three';
import type { EntityDef, ModelSpec } from '../sim/types';
import { Kit, KIND, MAT } from './kit';
import {
  Palette, PALETTES, TEAM, PI, clamp, num, seedOf, trackSide, wheel, hatch, whip, smokeLaunchers, eraTiles, jerrycan, crate, bedroll, tarpBundle, grille, headlight, pennant,
} from './parts';
import { legacyBuilders } from './models_legacy';
import { airBuilders } from './models_air';
import { structBuilders } from './models_struct';

export interface ModelData {
  body: THREE.BufferGeometry;
  turret?: THREE.BufferGeometry;
  turretPivot?: [number, number, number];
  team?: THREE.BufferGeometry;
  /** team-coloured parts that rotate with the turret */
  teamTurret?: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
  rotor?: THREE.BufferGeometry;
  rotorPivot?: [number, number, number];
  rotorAxis?: 'x' | 'y' | 'z';
  rotorSpeed?: number;
  rotorRock?: boolean;
  /** secondary rotor (tail rotor etc.) */
  rotor2?: THREE.BufferGeometry;
  rotor2Pivot?: [number, number, number];
  rotor2Axis?: 'x' | 'y' | 'z';
  rotor2Speed?: number;
  height: number;
  walker?: boolean;
  flier?: boolean;
  /** vertex-shader animation applies (walk cycle amount / track scroll) */
  animated?: 'walker' | 'tracked' | 'wheeled';
  /** extra uniform scale for display */
  scale?: number;
}

export type { Palette };
export { PALETTES };

export interface Ctx { spec: ModelSpec; pal: Palette; style: string; id: string }
export type Builder = (c: Ctx) => ModelData;


// ====================================================================================== infantry
interface SoldierOpts { kit: string; dark: boolean; militia: boolean; idx: number; style: string }

const MILITIA_CLOTH = [0x5b5646, 0x3e4a3b, 0x6b5e48, 0x4a4a52, 0x73684f];

function soldier(k: Kit, tk: Kit, x: number, z: number, yaw: number, p: Palette, o: SoldierOpts): void {
  const dark = o.dark, mil = o.militia;
  const cloth = dark ? 0x2a2e2b : mil ? MILITIA_CLOTH[o.idx % MILITIA_CLOTH.length] : p.cloth;
  const trouser = dark ? 0x25292a : mil ? [0x44443c, 0x3a3f4a, 0x575040][o.idx % 3] : p.cloth;
  const gear = dark ? 0x1c1f1e : mil ? 0x3a3a33 : p.alt;
  const gear2 = dark ? 0x151817 : mil ? 0x2c2d28 : p.canvas;
  const camo = dark ? 0.0 : mil ? 0.1 : 0.85;
  const limb = (kind: number) => ({ kind, x, z });
  k.group(x, 0, z, [0, yaw, 0], () => {
    for (const s of [-1, 1]) {
      const kind = s < 0 ? KIND.legL : KIND.legR;
      k.box(0.2, 0.46, 0.23, s * 0.12, 0.73, 0, trouser, { camo, limb: limb(kind), bevel: 0.025, grime: 0.4 });
      k.box(0.16, 0.44, 0.19, s * 0.12, 0.3, 0.01, trouser, { camo, limb: limb(kind), bevel: 0.025, grime: 0.5 });
      k.box(0.17, 0.12, 0.06, s * 0.12, 0.52, 0.12, gear, { camo: 0, limb: limb(kind), bevel: 0.02, mat: MAT.cloth });
      k.box(0.17, 0.12, 0.33, s * 0.12, 0.07, 0.05, mil ? 0x2b2622 : 0x3a3328, { camo: 0, limb: limb(kind), bevel: 0.03, mat: MAT.rubber, grime: 0.6 });
    }
    k.box(0.42, 0.2, 0.26, 0, 0.99, 0, trouser, { camo, bevel: 0.03, grime: 0.4 });
    k.box(0.44, 0.52, 0.27, 0, 1.27, 0, cloth, { camo, bevel: 0.04, grime: 0.35 });
    if (!mil) {
      k.box(0.5, 0.42, 0.33, 0, 1.29, 0.02, gear, { camo: 0.2, bevel: 0.04, mat: MAT.cloth });
      for (let i = 0; i < 3; i++) k.box(0.1, 0.13, 0.07, (i - 1) * 0.14, 1.18, 0.2, gear2, { camo: 0, bevel: 0.015, mat: MAT.cloth });
      k.box(0.34, 0.3, 0.16, 0, 1.18, -0.22, gear2, { camo: 0.2, bevel: 0.03, mat: MAT.cloth });
    } else {
      k.box(0.46, 0.14, 0.3, 0, 1.3, 0.02, gear, { camo: 0, bevel: 0.03, mat: MAT.cloth });
      k.box(0.3, 0.34, 0.14, 0, 1.22, -0.2, gear2, { camo: 0, bevel: 0.04, mat: MAT.cloth });
    }
    // team patch on the pack + shoulders
    tk.group(x, 0, z, [0, yaw, 0], () => {
      tk.box(0.3, 0.05, 0.16, 0, 1.43, -0.22, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
      tk.box(0.1, 0.07, 0.1, -0.26, 1.5, 0, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
      tk.box(0.1, 0.07, 0.1, 0.26, 1.5, 0, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    });
    // arms (hands on the weapon)
    k.rod(0.27, 1.45, 0, 0.3, 1.19, 0.1, 0.055, cloth, { camo, seg: 6, bevel: 0 });
    k.rod(0.3, 1.19, 0.1, 0.1, 1.25, 0.28, 0.048, cloth, { camo, seg: 6, bevel: 0 });
    k.rod(-0.27, 1.45, 0, -0.28, 1.22, 0.22, 0.055, cloth, { camo, seg: 6, bevel: 0 });
    k.rod(-0.28, 1.22, 0.22, -0.03, 1.27, 0.5, 0.048, cloth, { camo, seg: 6, bevel: 0 });
    k.sphere(0.04, 0.1, 1.25, 0.28, 0x2a2622, { mat: MAT.cloth, seg: 6 });
    k.sphere(0.04, -0.03, 1.27, 0.5, 0x2a2622, { mat: MAT.cloth, seg: 6 });
    // head
    k.cyl(0.05, 0.06, 0.1, 0, 1.55, 0, p.skin, { mat: MAT.skin, seg: 7, bevel: 0 });
    k.sphere(0.105, 0, 1.65, 0.01, p.skin, { mat: MAT.skin, sy: 1.1, seg: 10 });
    if (mil) {
      k.lathe([[0, 0], [0.13, 0], [0.135, 0.04], [0.11, 0.1], [0, 0.13]], 0, 1.67, 0, o.idx % 2 ? 0x2d3a30 : 0x6a6048, { mat: MAT.cloth, seg: 10, camo: 0 });
      k.box(0.24, 0.12, 0.1, 0, 1.6, -0.1, o.idx % 2 ? 0x2d3a30 : 0x6a6048, { mat: MAT.cloth, camo: 0, bevel: 0.03 });
    } else {
      k.lathe([[0, 0], [0.145, 0], [0.155, 0.03], [0.145, 0.09], [0.1, 0.15], [0, 0.175]], 0, 1.66, 0.0, dark ? 0x1d201f : p.alt, { camo: dark ? 0 : 0.6, seg: 12, mat: MAT.paint });
      k.box(0.1, 0.07, 0.07, 0, 1.78, 0.14, p.dark, { camo: 0, bevel: 0.015, mat: MAT.metal });
      tk.group(x, 0, z, [0, yaw, 0], () => { tk.box(0.14, 0.03, 0.2, 0, 1.845, 0.0, TEAM, { camo: 0, grime: 0, bevel: 0.01 }); });
    }
    // weapon
    const kit = o.kit;
    const rifle = (len = 1, sup = false): void => {
      k.box(0.07, 0.1, 0.34 * len, 0.08, 1.28, 0.32, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.015 });
      k.pipe(0.014, 0.4 * len, 0.08, 1.3, 0.68, p.metal, { camo: 0, mat: MAT.metal, seg: 6, bevel: 0 });
      k.box(0.06, 0.07, 0.26, 0.08, 1.28, 0.55, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.015 });
      k.box(0.05, 0.1, 0.22, 0.08, 1.26, 0.08, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.015 });
      k.box(0.04, 0.17, 0.07, 0.08, 1.14, 0.34, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01, rot: [0.2, 0, 0] });
      k.box(0.05, 0.06, 0.14, 0.08, 1.36, 0.36, p.metal, { camo: 0, mat: MAT.metal, bevel: 0.01 });
      if (sup) k.pipe(0.028, 0.22, 0.08, 1.3, 0.85, p.dark, { camo: 0, mat: MAT.metal, seg: 7, bevel: 0 });
    };
    switch (kit) {
      case 'launcher':
        k.pipe(0.075, 1.05, 0.2, 1.52, 0.18, p.alt, { camo: 0.3, seg: 10, rot: [PI / 2 + 0.08, 0.04, 0] });
        k.box(0.16, 0.2, 0.3, 0.2, 1.65, 0.5, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 });
        k.cyl(0.09, 0.09, 0.05, 0.2, 1.52, 0.72, p.dark, { camo: 0, mat: MAT.dark, rot: [PI / 2, 0, 0], seg: 8 });
        break;
      case 'rpg':
        k.pipe(0.038, 0.95, 0.2, 1.5, 0.2, p.dark, { camo: 0, mat: MAT.dark, seg: 8, rot: [PI / 2 + 0.05, 0.03, 0] });
        k.lathe([[0, -0.2], [0.1, -0.1], [0.07, 0.1], [0, 0.3]], 0.2, 1.52, 0.9, p.alt, { camo: 0.3, seg: 8, rot: [PI / 2, 0, 0] });
        break;
      case 'laptop':
        k.box(0.34, 0.025, 0.24, 0.0, 1.12, 0.38, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
        k.box(0.34, 0.22, 0.02, 0.0, 1.24, 0.5, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.005, rot: [-0.25, 0, 0] });
        k.box(0.33, 0.2, 0.012, 0.0, 1.24, 0.495, 0x4fd0ff, { camo: 0, mat: MAT.emit, bevel: 0, rot: [-0.25, 0, 0] });
        k.rod(0.0, 1.45, -0.28, 0.0, 2.0, -0.3, 0.012, p.dark, { camo: 0, mat: MAT.metal, seg: 5 });
        k.box(0.12, 0.08, 0.06, 0.0, 1.42, -0.3, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
        break;
      case 'mg':
        k.box(0.08, 0.13, 0.52, 0.08, 1.28, 0.36, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.015 });
        k.pipe(0.02, 0.6, 0.08, 1.31, 0.9, p.metal, { camo: 0, mat: MAT.metal, seg: 6, bevel: 0 });
        k.rod(0.08, 1.2, 0.8, 0.0, 0.55, 1.0, 0.012, p.metal, { camo: 0, mat: MAT.metal, seg: 4 });
        k.rod(0.08, 1.2, 0.8, 0.18, 0.55, 1.0, 0.012, p.metal, { camo: 0, mat: MAT.metal, seg: 4 });
        k.box(0.12, 0.14, 0.2, -0.1, 1.15, 0.38, p.alt, { camo: 0.3, bevel: 0.02 });
        break;
      default:
        rifle(1, dark);
        if (o.idx === 0 && !dark && kit === 'rifle') k.pipe(0.03, 0.2, 0.08, 1.22, 0.72, p.dark, { camo: 0, mat: MAT.dark, seg: 7, bevel: 0 }); // underbarrel
    }
  });
}

const infantry: Builder = ({ spec, pal, style, id }) => {
  const n = num(spec.n, 3);
  const kit = String(spec.kit ?? 'rifle');
  const k = new Kit({ camo: 0.4, grime: 0.3, seed: seedOf(id), bevelMax: 0.03, ground: false });
  const tk = new Kit({ seed: 4, ground: false });
  const R = n <= 1 ? 0 : 0.85 + n * 0.2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + 0.5;
    const yaw = Math.sin(a * 3.1 + i) * 0.35;
    const skit = kit === 'launcher' ? (i === 0 ? 'launcher' : 'rifle') : kit === 'laptop' ? 'laptop' : kit;
    soldier(k, tk, Math.sin(a) * R, Math.cos(a) * R * 0.9, yaw, pal, { kit: skit, dark: !!spec.dark, militia: !!spec.militia, idx: i, style });
  }
  return { body: k.build(), team: tk.build({ ao: false }), height: 2, walker: true, animated: 'walker', scale: 1.7 };
};

// ====================================================================================== ground vehicles
function tankHullProfile(L: number, deckY: number, ifv: boolean): [number, number][] {
  const n = L / 2;
  return ifv
    ? [[-n, 0.55], [-n, deckY - 0.1], [-n + 0.2, deckY], [n - 1.7, deckY], [n - 0.15, 1.3], [n, 1.05], [n - 0.2, 0.55]]
    : [[-n, 0.55], [-n, deckY - 0.18], [-n + 0.3, deckY], [n - 2.4, deckY], [n - 0.45, 1.12], [n, 0.98], [n - 0.2, 0.55]];
}

const tank: Builder = ({ spec, pal: p, style, id }) => {
  const Ls = num(spec.len, 9), W = num(spec.wid, 3.6);
  const L = Ls * 0.86;
  const tl = num(spec.turretLen, 3.4), gun = num(spec.gun, 5);
  const ifv = !!spec.ifv, era = !!spec.era, decoy = !!spec.decoy;
  const seed = seedOf(id);
  const k = new Kit({ camo: 0.9, grime: 0.55, seed, bevelMax: 0.09, tess: 1.8 });
  const tk = new Kit({ camo: 0.9, grime: 0.5, seed: seed + 3, bevelMax: 0.07, ground: false, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const tmT = new Kit({ ground: false });
  const tw = clamp(W * 0.2, 0.62, 0.86);
  const trackX = W / 2 - tw / 2;
  const deckY = ifv ? 2.0 : 1.62;
  const nWheels = Math.max(5, Math.round(L / 1.25));
  // running gear
  for (const s of [-1, 1]) trackSide(k, s, L, tw, s * trackX, 0.5, ifv ? 0.5 : 0.46, nWheels, p);
  // hull: side-profile prism across the width
  const hullW = W - 0.12;
  k.group(0, 0, 0, [0, -PI / 2, 0], () => {
    k.prism(tankHullProfile(L, deckY, ifv), hullW, 0, 0, 0, p.main, { camo: 0.9, bevel: 0.08, smooth: 18 });
  });
  // belly between tracks + sponsons over tracks
  k.box(W - tw * 2 + 0.4, 0.7, L * 0.92, 0, 0.7, 0, p.dark, { camo: 0, mat: MAT.dark, grime: 0.8 });
  for (const s of [-1, 1]) {
    k.box(tw + 0.12, 0.09, L * 0.78, s * trackX, 1.18, -L * 0.02, p.main, { camo: 0.85, bevel: 0.03 });
    // side skirts, split into panels
    const np = 7;
    for (let i = 0; i < np; i++) {
      const z = -L * 0.42 + i * (L * 0.62 / (np - 1)) + 0.1;
      k.box(0.12, 0.66 - (i === np - 1 ? 0.2 : 0), L * 0.62 / np - 0.05, s * (W / 2 + 0.01), 1.0 + (i === np - 1 ? 0.1 : 0), z, p.main, { camo: 0.85, bevel: 0.02, grime: 0.6 });
      if (i % 2 === 0) k.box(0.05, 0.06, 0.3, s * (W / 2 + 0.07), 1.0, z, p.dark, { camo: 0, bevel: 0.01, mat: MAT.metal });
    }
    // fenders / mudguards
    k.box(0.5, 0.06, 0.9, s * (W / 2 - 0.3), 1.04, L * 0.48, p.main, { camo: 0.8, bevel: 0.02, rot: [0.25, 0, 0] });
    // headlights
    headlight(k, s * (hullW / 2 - 0.35), 1.1, L / 2 + 0.02, p, 0.15);
    if ((era || style === 'china') && !ifv) eraTiles(k, s * (W / 2 + 0.09), 1.0, -L * 0.06, 5, 2, 0.5, 0.3, [0, s * PI / 2, 0], p, 0.1);
  }
  // deck details
  const ey = deckY;
  grille(k, 0, ey + 0.02, -L / 2 + 1.5, hullW * 0.62, 1.9, 7, p);
  for (const s of [-1, 1]) {
    k.pipe(0.13, 0.5, s * hullW * 0.34, ey - 0.28, -L / 2 - 0.15, p.dark, { camo: 0, mat: MAT.metal, seg: 10, bevel: 0.02 });
    jerrycan(k, s * (hullW / 2 - 0.35), ey, -L / 2 + 0.55, p, s * 0.2);
    tarpBundle(k, s * (hullW / 2 - 0.45), ey + 0.1, -L * 0.1 + s * 0.2, 0.55, 1.2, p.canvas);
    bedroll(k, s * (hullW / 2 - 0.5), ey + 0.14, L * 0.12, 0.8, 0.12, p.canvas);
  }
  // front: driver hatch + periscopes + tow hooks + spare tracks
  if (!ifv) {
    hatch(k, 0, ey - 0.55, L / 2 - 1.4, 0.3, p);
    for (let i = -1; i <= 1; i++) k.box(0.18, 0.1, 0.09, i * 0.28, ey - 0.5, L / 2 - 1.2, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01, rot: [-0.3, 0, 0] });
    k.box(hullW * 0.5, 0.22, 0.1, 0, 0.78, L / 2 + 0.01, p.dark, { camo: 0.2, mat: MAT.dark, bevel: 0.02 });
    for (const s of [-1, 1]) k.rod(s * 0.9, 0.8, L / 2 + 0.05, s * 0.9, 0.82, L / 2 + 0.3, 0.05, p.steel, { mat: MAT.metal, seg: 6, camo: 0 });
  } else {
    hatch(k, -0.7, ey - 0.35, L / 2 - 1.6, 0.28, p);
    k.box(W - 0.9, 0.16, 0.12, 0, ey - 0.62, L / 2 - 0.35, p.dark, { camo: 0, mat: MAT.dark });
    // rear ramp / door seams
    k.box(W * 0.7, 1.0, 0.07, 0, 1.2, -L / 2 - 0.02, p.dark, { camo: 0.3, bevel: 0.02, mat: MAT.dark });
    for (const s of [-1, 1]) hatch(k, s * 0.8, ey, -L * 0.28, 0.3, p);
  }
  // team marker deck panel (hull rear) + rear plate
  tm.box(hullW * 0.5, 0.05, 0.5, 0, ey + 0.05, -L / 2 + 0.55, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.5, 0.4, 0.04, 0, ey - 0.35, -L / 2 - 0.03, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  whip(k, tm, hullW / 2 - 0.4, ey, -L / 2 + 0.3, 3.3, p, 0.15);
  whip(k, null, -hullW / 2 + 0.4, ey, -L / 2 + 0.3, 2.4, p, -0.12);

  // ---------------- turret (origin at the turret ring)
  const ty = ey - 0.12;
  const tz = ifv ? -L * 0.1 : L * 0.04;
  const tW = ifv ? W * 0.6 : W * 0.95;
  if (!ifv) buildTankTurret(tk, tmT, style, tl, tW, gun, era, decoy, p);
  else buildIfvTurret(tk, tmT, style, tl, tW, gun, p);
  const hullGeo = k.build();
  const turretGeo = tk.build({ occluders: [{ kit: k, x: 0, y: -ty, z: -tz }] });
  return { body: hullGeo, turret: turretGeo, turretPivot: [0, ty, tz], team: tm.build({ ao: false }), teamTurret: tmT.build({ ao: false }), height: 3.4, animated: 'tracked' };
};

function buildTankTurret(tk: Kit, tm: Kit, style: string, tl: number, tw: number, gun: number, era: boolean, decoy: boolean, p: Palette): void {
  const th = style === 'china' ? 0.82 : style === 'iran' ? 0.95 : 1.0;
  const front = tl * 0.5;
  if (style === 'iran') {
    // cast, rounded T-72/Karrar style dome
    tk.loft([
      { z: -tl * 0.5, w: tw * 0.28, ht: th * 0.55, hb: 0.05, y: 0.05, n: 2.6, hard: true },
      { z: -tl * 0.38, w: tw * 0.44, ht: th * 0.78, hb: 0.05, y: 0.05, n: 2.5 },
      { z: -tl * 0.1, w: tw * 0.52, ht: th, hb: 0.05, y: 0.05, n: 2.5 },
      { z: tl * 0.18, w: tw * 0.5, ht: th * 0.92, hb: 0.05, y: 0.05, n: 2.6 },
      { z: tl * 0.42, w: tw * 0.34, ht: th * 0.7, hb: 0.05, y: 0.05, n: 2.8 },
      { z: front, w: tw * 0.16, ht: th * 0.42, hb: 0.05, y: 0.05, n: 3 },
    ], 0, 0, 0, p.main, { camo: 0.9, seg: 24, capStart: true, capEnd: true });
    tk.torus(tw * 0.5, 0.06, 0, 0.03, -tl * 0.04, p.dark, { mat: MAT.metal, camo: 0, seg: 28 });
    if (era) for (const s of [-1, 1]) eraTiles(tk, s * tw * 0.38, th * 0.55, front * 0.5, 4, 2, 0.34, 0.3, [0, s * 0.6, 0], p, 0.1);
    // searchlight, DShK on the commander cupola, rear stowage
    tk.box(0.34, 0.3, 0.3, -tw * 0.5, th * 0.7, -0.1, p.dark, { camo: 0.2, bevel: 0.03 });
    tk.box(0.22, 0.2, 0.05, -tw * 0.5, th * 0.7, 0.07, 0xfff0c0, { camo: 0, mat: MAT.emit, bevel: 0 });
    tk.cyl(0.3, 0.3, 0.2, tw * 0.18, th + 0.05, -0.2, p.main, { camo: 0.8, seg: 14 });
    tk.pipe(0.035, 0.9, tw * 0.18, th + 0.34, 0.15, p.dark, { camo: 0, mat: MAT.dark, seg: 7 });
    tk.box(0.14, 0.14, 0.3, tw * 0.18, th + 0.28, -0.1, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
    hatch(tk, -tw * 0.2, th - 0.02, -0.35, 0.3, p);
    tk.box(tw * 0.8, 0.32, 0.46, 0, 0.45, -tl * 0.5 - 0.15, p.main, { camo: 0.8, bevel: 0.05 });
    jerrycan(tk, tw * 0.28, 0.1, -tl * 0.5 - 0.35, p, 0.1);
    bedroll(tk, -tw * 0.18, 0.62, -tl * 0.5 - 0.4, 1.0, 0.14, p.canvas);
    smokeLaunchers(tk, tw * 0.46, th * 0.55, front * 0.55, 3, 1, p, 0.5);
    smokeLaunchers(tk, -tw * 0.46, th * 0.55, front * 0.55, 3, -1, p, -0.5);
  } else {
    const china = style === 'china';
    // side profile prism for the central body
    const poly: [number, number][] = china
      ? [[-tl * 0.5, 0.05], [-tl * 0.5, th], [tl * 0.02, th], [front * 0.98, th * 0.52], [front, 0.1], [tl * 0.35, 0]]
      : [[-tl * 0.5, 0.05], [-tl * 0.5, th - 0.12], [-tl * 0.5 + 0.18, th], [tl * 0.16, th], [front, th * 0.7], [front, 0.12], [tl * 0.4, 0]];
    tk.group(0, 0, 0, [0, -PI / 2, 0], () => { tk.prism(poly, tw * (china ? 0.8 : 0.72), 0, 0, 0, p.main, { camo: 0.9, bevel: 0.07, smooth: 20 }); });
    // angled cheek / composite armour wedges
    for (const s of [-1, 1]) {
      tk.group(s * tw * 0.36, 0, front * 0.42, [0, -s * (china ? 0.42 : 0.3), 0], () => {
        tk.box(tw * 0.28, th * (china ? 0.62 : 0.8), tl * 0.5, 0, th * (china ? 0.31 : 0.4), 0, p.main, { camo: 0.9, bevel: 0.05 });
        if (china) {
          eraTiles(tk, s * 0.0, th * 0.34, tl * 0.25 + 0.05, 1, 2, 0.5, 0.3, [0, 0, 0], p, 0.1);
          for (let i = 0; i < 4; i++) tk.box(tw * 0.26, 0.28, 0.2, 0, th * 0.34, -0.5 + i * 0.4, p.dark, { camo: 0, bevel: 0.01, jitter: 0.12 });
        }
      });
      tk.group(s * (tw * 0.5), th * 0.55, -tl * 0.05, [0, 0, 0], () => {
        tk.box(0.28, 0.5, 1.2, 0, 0, 0, p.main, { camo: 0.9, bevel: 0.04 }); // side storage / armour box
      });
    }
    if (era || china) {
      eraTiles(tk, 0, th * 0.55, front + 0.04, 6, 2, 0.34, 0.3, [0, 0, 0], p, 0.1);
      for (const s of [-1, 1]) eraTiles(tk, s * tw * 0.64, th * 0.62, tl * 0.1, 3, 2, 0.34, 0.3, [0, s * PI / 2, 0], p, 0.1);
    }
    // bustle with rack
    tk.box(tw * 0.88, 0.62, 0.95, 0, 0.5, -tl * 0.5 - 0.35, p.main, { camo: 0.9, bevel: 0.06 });
    for (let i = 0; i < 6; i++) tk.box(tw * 0.9, 0.04, 0.05, 0, 0.82, -tl * 0.5 - 0.7 + i * 0.12, p.dark, { camo: 0, bevel: 0.005, mat: MAT.metal });
    tk.box(0.05, 0.4, 0.9, tw * 0.46, 0.55, -tl * 0.5 - 0.35, p.dark, { camo: 0, bevel: 0.01, mat: MAT.metal });
    tk.box(0.05, 0.4, 0.9, -tw * 0.46, 0.55, -tl * 0.5 - 0.35, p.dark, { camo: 0, bevel: 0.01, mat: MAT.metal });
    bedroll(tk, 0, 0.98, -tl * 0.5 - 0.35, 1.4, 0.15, p.canvas);
    jerrycan(tk, tw * 0.28, 0.82, -tl * 0.5 - 0.4, p, 0.2);
    // roof furniture
    tk.cyl(0.34, 0.36, 0.22, -tw * 0.2, th + 0.1, -tl * 0.12, p.main, { camo: 0.8, seg: 16 });
    tk.box(0.16, 0.22, 0.3, -tw * 0.2, th + 0.3, -tl * 0.12 + 0.05, p.dark, { camo: 0, bevel: 0.02, mat: MAT.dark });
    tk.pipe(0.025, 0.55, -tw * 0.2, th + 0.33, -tl * 0.12 + 0.5, p.metal, { camo: 0, mat: MAT.metal, seg: 6 });
    hatch(tk, tw * 0.2, th - 0.02, -tl * 0.24, 0.3, p);
    tk.box(0.4, 0.3, 0.38, tw * 0.22, th + 0.12, tl * 0.1, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.03 });
    tk.box(0.46, 0.06, 0.44, tw * 0.22, th + 0.28, tl * 0.1, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
    tk.rod(-tw * 0.35, th, -tl * 0.4, -tw * 0.35, th + 0.9, -tl * 0.4, 0.02, p.dark, { camo: 0, mat: MAT.metal, seg: 5 });
    smokeLaunchers(tk, tw * 0.48, th * 0.62, front * 0.45, china ? 6 : 4, 1, p, 0.4);
    smokeLaunchers(tk, -tw * 0.48, th * 0.62, front * 0.45, china ? 6 : 4, -1, p, -0.4);
    if (china) {
      for (const s of [-1, 1]) tk.sphere(0.2, s * tw * 0.3, th * 0.8, front * 0.7, p.dark, { mat: MAT.metal, camo: 0, seg: 10 });
    }
  }
  // mantlet + gun
  const gy = th * 0.5;
  tk.box(0.92, 0.7, 0.5, 0, gy, front + 0.1, p.main, { camo: 0.9, bevel: 0.06 });
  tk.box(0.5, 0.45, 0.12, 0, gy, front + 0.4, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 }); // gun shield / dust cover
  const g0 = front + 0.42;
  tk.pipe(0.118, gun, 0, gy, g0 + gun / 2, p.steel, { mat: MAT.metal, seg: 14, rb: 0.125, camo: 0, bevel: 0 });
  tk.pipe(0.145, gun * 0.55, 0, gy, g0 + gun * 0.42, p.dark, { mat: MAT.dark, seg: 14, camo: 0, bevel: 0.01 }); // thermal sleeve
  tk.pipe(0.17, 0.55, 0, gy, g0 + gun * 0.72, p.steel, { mat: MAT.metal, seg: 14, camo: 0, bevel: 0.03 }); // bore evacuator
  tk.pipe(0.13, 0.16, 0, gy, g0 + gun - 0.02, p.dark, { mat: MAT.metal, seg: 12, camo: 0, bevel: 0.02 }); // muzzle
  if (decoy) tk.pipe(0.12, 0.7, 0, gy, g0 + gun + 0.3, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
  // coaxial MG + sight
  tk.pipe(0.025, 0.7, 0.38, gy - 0.12, front + 0.5, p.dark, { camo: 0, mat: MAT.metal, seg: 6, bevel: 0 });
  // team markings on the roof
  tm.box(tw * 0.5, 0.05, 0.55, 0, th + 0.03, -tl * 0.32, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.5, 0.35, 0.05, 0, 0.5, -tl * 0.5 - 0.84, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.05, 0.3, 0.6, tw * 0.6, th * 0.55, -tl * 0.1, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.05, 0.3, 0.6, -tw * 0.6, th * 0.55, -tl * 0.1, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
}

function buildIfvTurret(tk: Kit, tm: Kit, style: string, tl: number, tw: number, gun: number, p: Palette): void {
  const th = 0.85;
  const china = style === 'china';
  tk.loft([
    { z: -tl * 0.5, w: tw * 0.4, ht: th * 0.8, hb: 0.05, y: 0.05, n: 4, hard: true },
    { z: -tl * 0.3, w: tw * 0.5, ht: th, hb: 0.05, y: 0.05, n: 4 },
    { z: tl * 0.3, w: tw * 0.46, ht: th * 0.92, hb: 0.05, y: 0.05, n: 4 },
    { z: tl * 0.5, w: tw * 0.36, ht: th * 0.7, hb: 0.05, y: 0.05, n: 4 },
  ], 0, 0, 0, p.main, { camo: 0.9, seg: 20, capStart: true, capEnd: true });
  const gy = th * 0.45;
  const f = tl * 0.5;
  if (china) {
    tk.pipe(0.07, gun, 0.28, gy + 0.05, f + gun / 2, p.steel, { mat: MAT.metal, seg: 10, camo: 0 });
    tk.pipe(0.05, gun * 0.7, -0.22, gy, f + gun * 0.35, p.steel, { mat: MAT.metal, seg: 8, camo: 0 });
    tk.pipe(0.11, 0.5, 0.28, gy + 0.05, f + gun * 0.5, p.dark, { mat: MAT.dark, seg: 10, camo: 0 });
  } else {
    tk.pipe(0.055, gun, 0, gy, f + gun / 2, p.steel, { mat: MAT.metal, seg: 10, camo: 0 });
    tk.pipe(0.09, 0.8, 0, gy, f + 0.55, p.dark, { mat: MAT.dark, seg: 10, camo: 0 });
    // TOW / ATGM box
    tk.box(0.5, 0.4, 0.95, -tw * 0.58, th * 0.6, 0.1, p.main, { camo: 0.8, bevel: 0.04, rot: [-0.12, 0, 0] });
    tk.drum(0.09, 0.4, -tw * 0.58, th * 0.6 + 0.05, 0.62, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
  }
  for (const s of [-1, 1]) smokeLaunchers(tk, s * tw * 0.52, th * 0.6, f * 0.3, 4, s, p, s * 0.2);
  hatch(tk, tw * 0.2, th - 0.02, -0.35, 0.28, p);
  tk.box(0.34, 0.24, 0.34, -tw * 0.2, th + 0.1, 0.0, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.03 });
  tk.box(0.5, 0.2, 0.3, 0, th * 0.9, -tl * 0.5 - 0.1, p.main, { camo: 0.8, bevel: 0.03 });
  tk.rod(tw * 0.4, th, -tl * 0.3, tw * 0.4, th + 0.7, -tl * 0.3, 0.018, p.dark, { camo: 0, mat: MAT.metal, seg: 5 });
  tm.box(tw * 0.5, 0.05, 0.5, 0, th + 0.05, -tl * 0.12, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.04, 0.3, 0.5, tw * 0.52, th * 0.6, -tl * 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.04, 0.3, 0.5, -tw * 0.52, th * 0.6, -tl * 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
}

// ------------------------------------------------------------------------------------ wheeled
const wheeled: Builder = ({ spec, pal: p, id }) => {
  const Ls = num(spec.len, 6), W = num(spec.wid, 2.6), n = num(spec.wheels, 4);
  const tkind = String(spec.turret ?? 'mg');
  const bed = !!spec.bed;
  const L = Ls * 0.92;
  const seed = seedOf(id);
  const k = new Kit({ camo: 0.8, grime: 0.55, seed, bevelMax: 0.08, tess: 1.8 });
  const tk = new Kit({ camo: 0.8, grime: 0.5, seed: seed + 5, bevelMax: 0.06, ground: false, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const tmT = new Kit({ ground: false });
  const apc = tkind === 'cannon';
  const r = apc ? 0.66 : 0.58;
  const axles = n / 2;
  const wx = W / 2 - 0.18;
  for (let i = 0; i < axles; i++) {
    const z = -L / 2 + 1.0 + (i * (L - 2.0 - (apc ? 0.3 : 0))) / Math.max(1, axles - 1);
    const zz = apc && axles === 4 ? (i < 2 ? z + 0.1 * (i === 1 ? 1 : 0) : z) : z;
    for (const s of [-1, 1]) {
      wheel(k, s * wx, r + 0.04, zz, r, apc ? 0.5 : 0.42, p, s);
      if (apc || bed) k.box(0.62, 0.05, r * 2.1, s * wx, r * 2 + 0.2, zz, p.main, { camo: 0.8, bevel: 0.015, rot: [0, 0, 0] }); // fender
    }
    k.drum(0.08, W - 0.3, 0, r + 0.04, zz, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
  }
  const hy = r * 2 + 0.2; // chassis top
  k.box(W - 0.35, 0.5, L * 0.9, 0, hy - 0.05, -0.05, p.dark, { camo: 0, mat: MAT.dark, grime: 0.8 });
  let pivot: [number, number, number] | undefined;
  if (apc) {
    // 8x8 armoured personnel carrier (Stryker / Boragh style): slab hull
    const H = 1.35;
    k.group(0, 0, 0, [0, -PI / 2, 0], () => {
      k.prism([[-L / 2, hy - 0.1], [-L / 2, hy + H], [-L / 2 + 0.2, hy + H + 0.12], [L * 0.1, hy + H + 0.12], [L * 0.4, hy + H - 0.2], [L / 2, hy + 0.55], [L / 2, hy - 0.1]], W - 0.1, 0, 0, 0, p.main, { camo: 0.9, bevel: 0.06, smooth: 15 });
    });
    for (const s of [-1, 1]) {
      // slat / cage armour
      for (let i = 0; i < 14; i++) k.box(0.04, H * 0.9, 0.05, s * (W / 2 + 0.16), hy + H * 0.5, -L * 0.42 + i * (L * 0.84 / 13), p.dark, { camo: 0, mat: MAT.metal, bevel: 0.008 });
      k.box(0.05, 0.05, L * 0.86, s * (W / 2 + 0.16), hy + H * 0.95, 0, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.008 });
      k.box(0.05, 0.05, L * 0.86, s * (W / 2 + 0.16), hy + H * 0.1, 0, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.008 });
      headlight(k, s * (W / 2 - 0.35), hy + 0.35, L / 2 + 0.01, p, 0.15);
    }
    k.box(W * 0.5, 0.35, 0.08, 0, hy + 0.35, L / 2 - 0.04, p.dark, { camo: 0, mat: MAT.dark });
    hatch(k, -0.5, hy + H + 0.1, L * 0.27, 0.28, p);
    hatch(k, 0.5, hy + H + 0.1, -L * 0.28, 0.28, p);
    grille(k, 0, hy + H + 0.13, -L * 0.1, W * 0.5, 1.2, 5, p);
    for (const s of [-1, 1]) k.box(0.1, 0.34, 0.9, s * (W / 2 - 0.05), hy + H * 0.55, L * 0.22, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
    whip(k, tm, W / 2 - 0.4, hy + H + 0.1, -L * 0.42, 2.8, p, 0.1);
    tm.box(W * 0.5, 0.04, 0.6, 0, hy + H + 0.15, -L * 0.34, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    tm.box(0.4, 0.3, 0.04, 0, hy + 0.55, -L / 2 - 0.02, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    pivot = [0, hy + H + 0.08, L * 0.06];
    // turret: low RWS with autocannon
    tk.loft([{ z: -0.8, w: 0.75, ht: 0.38, hb: 0.05, y: 0.05, n: 3.5, hard: true }, { z: 0.2, w: 0.85, ht: 0.5, hb: 0.05, y: 0.05, n: 3.5 }, { z: 1.0, w: 0.6, ht: 0.34, hb: 0.05, y: 0.05, n: 3.5 }], 0, 0, 0, p.main, { camo: 0.9, seg: 18, capStart: true, capEnd: true });
    tk.pipe(0.06, 2.4, 0, 0.18, 2.1, p.steel, { mat: MAT.metal, seg: 9, camo: 0 });
    tk.pipe(0.09, 0.7, 0, 0.18, 1.2, p.dark, { mat: MAT.dark, seg: 9, camo: 0 });
    tk.box(0.34, 0.26, 0.3, 0.55, 0.62, 0.15, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.03 });
    for (const s of [-1, 1]) smokeLaunchers(tk, s * 0.82, 0.3, 0.1, 3, s, p, s * 0.2);
    tmT.box(0.5, 0.04, 0.5, 0, 0.55, -0.35, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  } else {
    // light utility vehicle (JLTV) or technical (bed)
    const cabL = bed ? L * 0.34 : L * 0.5;
    const cz = L / 2 - cabL / 2 - (bed ? 0.1 : 0.9);
    // hood
    k.box(W - 0.35, 0.7, L * 0.22, 0, hy + 0.3, L / 2 - L * 0.11, p.main, { camo: 0.85, bevel: 0.07, rot: [0.08, 0, 0] });
    // cabin
    k.taper(W - 0.25, W - 0.45, 1.05, cabL, cabL * 0.85, 0, hy + 0.55 + 0.4, cz, p.main, { camo: 0.85 }, -0.1);
    for (const s of [-1, 1]) {
      k.box(0.06, 0.52, cabL * 0.38, s * (W / 2 - 0.2), hy + 1.1, cz + cabL * 0.2, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
      k.box(0.06, 0.52, cabL * 0.3, s * (W / 2 - 0.2), hy + 1.1, cz - cabL * 0.22, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
      headlight(k, s * (W / 2 - 0.4), hy + 0.42, L / 2 + 0.01, p, 0.16);
      k.box(0.22, 0.16, 0.3, s * (W / 2 - 0.1), hy - 0.1, -L / 2 + 0.6, p.dark, { camo: 0, mat: MAT.dark }); // rear lights/step
      k.rod(s * (W / 2 - 0.15), hy + 0.9, cz + cabL * 0.45, s * (W / 2 + 0.2), hy + 1.0, cz + cabL * 0.46, 0.015, p.dark, { camo: 0, seg: 4 }); // mirrors
    }
    k.box(W - 0.5, 0.5, 0.1, 0, hy + 1.4, cz + cabL * 0.45, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.015, rot: [-0.45, 0, 0] });
    k.box(W * 0.55, 0.22, 0.1, 0, hy + 0.1, L / 2 + 0.03, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 }); // bumper
    // bed / rear cargo
    const bl = L - cabL - L * 0.22;
    const bz = -L / 2 + bl / 2 + 0.05;
    k.box(W - 0.3, 0.12, bl, 0, hy + 0.12, bz, p.dark, { camo: 0, mat: MAT.dark });
    for (const s of [-1, 1]) k.box(0.1, 0.5, bl, s * (W / 2 - 0.2), hy + 0.42, bz, p.main, { camo: 0.8, bevel: 0.02 });
    k.box(W - 0.3, 0.5, 0.1, 0, hy + 0.42, -L / 2 + 0.05, p.main, { camo: 0.8, bevel: 0.02 });
    // spare wheel
    wheel(k, 0, hy + 0.75, -L / 2 - 0.08, 0.5, 0.3, p, 1);
    k.rod(0, hy + 0.75, -L / 2 - 0.08 + 0.001, 0, hy + 0.75, -L / 2 + 0.06, 0.4, p.rubber, { mat: MAT.rubber, camo: 0, seg: 14 });
    if (bed) {
      crate(k, -0.5, hy + 0.18, bz - 0.3, 0.7, 0.5, 0.8, p.alt, 0.2);
      jerrycan(k, 0.6, hy + 0.18, bz - 0.5, p, 0.3);
      // roll bar
      k.box(0.06, 1.0, 0.06, -W / 2 + 0.35, hy + 0.7, cz - cabL * 0.5, p.dark, { camo: 0, mat: MAT.metal });
      k.box(0.06, 1.0, 0.06, W / 2 - 0.35, hy + 0.7, cz - cabL * 0.5, p.dark, { camo: 0, mat: MAT.metal });
    }
    whip(k, tm, W / 2 - 0.3, hy + 1.3, -L * 0.25, 2.2, p, 0.1);
    tm.box(0.9, 0.04, 0.8, 0, hy + 1.62, cz - 0.1, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    tm.box(W * 0.5, 0.35, 0.03, 0, hy + 0.55, -L / 2 - 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    if (tkind === 'mg' || bed) {
      pivot = bed ? [0, hy + 0.45, bz + 0.2] : [0, hy + 1.66, cz - cabL * 0.18];
      // gun shield + MG (CROWS or DShK pintle)
      tk.cyl(0.38, 0.4, 0.14, 0, 0.07, 0, p.dark, { camo: 0, mat: MAT.metal, seg: 14 });
      if (bed) {
        tk.rod(0, 0.1, 0, 0, 0.9, 0.1, 0.05, p.dark, { camo: 0, mat: MAT.metal, seg: 6 });
        tk.box(0.55, 0.45, 0.06, 0, 1.15, 0.5, p.main, { camo: 0.5, bevel: 0.01 });
        tk.pipe(0.045, 1.5, 0, 1.0, 1.0, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
        tk.pipe(0.075, 0.5, 0, 1.0, 0.5, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
        tk.box(0.2, 0.3, 0.3, 0.28, 0.85, 0.35, p.alt, { camo: 0.3, bevel: 0.02 });
      } else {
        tk.box(0.7, 0.42, 0.9, 0, 0.35, 0, p.main, { camo: 0.8, bevel: 0.05 });
        tk.pipe(0.04, 1.0, 0, 0.42, 0.95, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
        tk.box(0.26, 0.22, 0.26, 0.3, 0.5, 0.15, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.02 });
      }
      tmT.box(0.4, 0.04, 0.5, 0, bed ? 0.1 : 0.6, -0.25, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    }
  }
  const body = k.build();
  const turret = pivot ? tk.build({ occluders: [{ kit: k, x: -pivot[0], y: -pivot[1], z: -pivot[2] }] }) : undefined;
  return { body, turret, turretPivot: pivot, team: tm.build({ ao: false }), teamTurret: pivot ? tmT.build({ ao: false }) : undefined, height: 3.2, animated: 'wheeled' };
};

const truck: Builder = ({ spec, pal: p, id }) => {
  const Ls = num(spec.len, 7);
  const L = Ls * 0.95;
  const W = 2.8;
  const k = new Kit({ camo: 0.5, grime: 0.6, seed: seedOf(id + 'truck'), bevelMax: 0.08, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const r = 0.62;
  for (const z of [-L * 0.34, -L * 0.1, L * 0.34]) for (const s of [-1, 1]) wheel(k, s * (W / 2 - 0.15), r + 0.04, z, r, 0.5, p, s);
  k.box(W - 0.4, 0.34, L, 0, 1.22, 0, p.dark, { camo: 0, mat: MAT.dark, grime: 0.8 });
  for (const s of [-1, 1]) k.box(0.7, 0.07, 1.5, s * (W / 2 - 0.2), 1.45, L * 0.34, p.dark, { camo: 0, bevel: 0.02, mat: MAT.dark });
  // cab
  const cz = L * 0.34;
  k.box(W - 0.3, 0.9, 1.35, 0, 1.75, cz + 0.9, p.main, { camo: 0.4, bevel: 0.07, rot: [0.04, 0, 0] }); // hood
  k.taper(W - 0.35, W - 0.5, 1.55, 1.8, 1.55, 0, 2.55, cz - 0.15, p.main, { camo: 0.4 }, 0.1);
  k.box(W - 0.7, 0.5, 0.1, 0, 3.0, cz + 0.7, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.015, rot: [-0.4, 0, 0] });
  for (const s of [-1, 1]) {
    k.box(0.06, 0.55, 1.1, s * (W / 2 - 0.15), 3.0, cz - 0.2, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
    headlight(k, s * (W / 2 - 0.45), 1.7, cz + 1.57, p, 0.17);
    k.rod(s * (W / 2 - 0.1), 3.2, cz + 0.5, s * (W / 2 + 0.3), 3.3, cz + 0.55, 0.02, p.dark, { camo: 0, seg: 4 });
    k.pipe(0.1, 1.2, s * (W / 2 - 0.1), 3.3, cz - 0.9, p.steel, { mat: MAT.metal, seg: 8 }); // exhaust stack
  }
  k.box(W - 0.4, 0.3, 0.15, 0, 1.4, cz + 1.62, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
  // cargo bed + crates / container
  const bz = -L * 0.12;
  k.box(W - 0.2, 0.18, L * 0.62, 0, 1.52, bz, p.dark, { camo: 0, mat: MAT.dark });
  k.box(W - 0.3, 1.75, L * 0.55, 0, 2.5, bz, p.alt, { camo: 0.6, bevel: 0.06, grime: 0.7 });
  for (let i = 0; i < 9; i++) k.box(W - 0.2, 1.75, 0.05, 0, 2.5, bz - L * 0.26 + i * (L * 0.52 / 8), p.dark, { camo: 0, bevel: 0.01, mat: MAT.dark }); // container ribs
  k.box(0.6, 1.4, 0.07, 0, 2.4, bz - L * 0.28, p.accent, { camo: 0, bevel: 0.01 });
  for (const s of [-1, 1]) k.box(0.06, 0.2, L * 0.4, s * (W / 2 - 0.08), 1.9, bz, p.steel, { camo: 0, mat: MAT.metal });
  tm.box(1.2, 0.5, 0.04, 0, 2.8, bz + L * 0.275, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.04, 0.55, 1.6, W / 2 - 0.12, 2.9, bz, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.04, 0.55, 1.6, -W / 2 + 0.12, 2.9, bz, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(1.0, 0.04, 0.7, 0, 3.4, cz - 0.1, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  whip(k, tm, -W / 2 + 0.2, 3.3, cz - 0.4, 2.0, p, 0.1);
  return { body: k.build(), team: tm.build({ ao: false }), height: 4, animated: 'wheeled' };
};

const dozer: Builder = ({ pal: p, id }) => {
  const k = new Kit({ camo: 0, grime: 0.7, seed: seedOf(id), bevelMax: 0.07 });
  const tm = new Kit({ ground: false });
  const yel = 0xd0a02a;
  const L = 5.2, tw = 0.8, W = 3.3;
  for (const s of [-1, 1]) trackSide(k, s, L, tw, s * (W / 2 - tw / 2), 0.55, 0.5, 5, p);
  k.box(W - tw * 2 + 0.2, 0.7, L * 0.8, 0, 0.9, 0, p.dark, { camo: 0, mat: MAT.dark });
  k.box(2.1, 0.9, 3.2, 0, 1.55, -0.3, yel, { camo: 0, bevel: 0.06 });
  k.box(1.8, 0.14, 1.6, 0, 2.05, -1.3, yel, { camo: 0, bevel: 0.03 });
  grille(k, 0, 2.08, -1.4, 1.5, 1.3, 6, p);
  // cab
  k.taper(1.8, 1.7, 1.7, 1.7, 1.5, 0, 2.5, 0.2, yel, { camo: 0 }, -0.05);
  k.box(1.5, 0.9, 0.06, 0, 2.7, 1.05, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01, rot: [-0.1, 0, 0] });
  for (const s of [-1, 1]) k.box(0.05, 0.9, 1.2, s * 0.9, 2.7, 0.2, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
  k.box(2.0, 0.14, 2.0, 0, 3.4, 0.2, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
  k.pipe(0.08, 1.2, 0.7, 3.1, -0.8, p.steel, { mat: MAT.metal, seg: 8, rot: [0, 0, 0] });
  k.rod(0.7, 2.6, -0.8, 0.7, 3.8, -0.8, 0.08, p.steel, { mat: MAT.metal, seg: 8 });
  k.box(0.2, 0.14, 0.1, -0.6, 3.5, 1.1, 0xffe5a0, { camo: 0, mat: MAT.emit, bevel: 0 });
  // blade + arms + ripper
  k.box(W + 0.5, 1.15, 0.3, 0, 0.95, 3.5, p.steel, { camo: 0, mat: MAT.metal, bevel: 0.05, rot: [-0.1, 0, 0], grime: 0.8 });
  k.box(W + 0.6, 0.12, 0.5, 0, 0.35, 3.62, p.dark, { camo: 0, mat: MAT.metal });
  for (const s of [-1, 1]) {
    k.box(0.22, 0.26, 2.4, s * 1.35, 0.85, 2.3, yel, { camo: 0, bevel: 0.03 });
    k.pipe(0.1, 1.3, s * 0.9, 1.1, 2.0, p.steel, { mat: MAT.metal, seg: 8, rot: [PI / 2 + 0.4, 0, 0] });
  }
  k.box(0.3, 1.0, 0.3, 0, 0.8, -2.8, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.03 });
  tm.box(1.0, 0.05, 0.8, 0, 3.5, 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.8, 0.05, 0.4, 0, 2.1, -1.0, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  return { body: k.build(), team: tm.build({ ao: false }), height: 3.8, animated: 'tracked' };
};

// ------------------------------------------------------------------------------------ artillery & rocket vehicles
const artillery: Builder = ({ spec, pal: p, style, id }) => {
  const Ls = num(spec.len, 9), W = num(spec.wid, 3.4), gun = num(spec.gun, 6.5);
  const L = Ls * 0.82;
  const seed = seedOf(id);
  const k = new Kit({ camo: 0.9, grime: 0.55, seed, bevelMax: 0.09, tess: 1.8 });
  const tk = new Kit({ camo: 0.9, grime: 0.5, seed: seed + 2, bevelMax: 0.08, ground: false, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const tmT = new Kit({ ground: false });
  const tw = clamp(W * 0.2, 0.62, 0.86);
  const trackX = W / 2 - tw / 2;
  for (const s of [-1, 1]) trackSide(k, s, L, tw, s * trackX, 0.5, 0.46, Math.round(L / 1.25), p);
  const deckY = 1.55;
  k.group(0, 0, 0, [0, -PI / 2, 0], () => {
    k.prism([[-L / 2, 0.55], [-L / 2, deckY], [L / 2 - 2.2, deckY], [L / 2 - 0.4, 1.15], [L / 2, 1.0], [L / 2 - 0.2, 0.55]], W - 0.15, 0, 0, 0, p.main, { camo: 0.9, bevel: 0.07, smooth: 18 });
  });
  k.box(W - tw * 2 + 0.4, 0.7, L * 0.9, 0, 0.7, 0, p.dark, { camo: 0, mat: MAT.dark, grime: 0.8 });
  for (const s of [-1, 1]) {
    k.box(tw + 0.12, 0.09, L * 0.78, s * trackX, 1.18, -L * 0.02, p.main, { camo: 0.85, bevel: 0.03 });
    for (let i = 0; i < 6; i++) k.box(0.1, 0.55, L * 0.7 / 6 - 0.05, s * (W / 2 + 0.01), 0.96, -L * 0.4 + i * L * 0.7 / 6 + 0.2, p.main, { camo: 0.85, bevel: 0.02 });
    headlight(k, s * (W / 2 - 0.5), 1.1, L / 2 + 0.01, p, 0.15);
  }
  // driver position front-left, spade rear
  k.box(1.1, 0.42, 1.0, -0.7, deckY + 0.2, L / 2 - 1.8, p.main, { camo: 0.85, bevel: 0.05 });
  k.box(0.9, 0.18, 0.06, -0.7, deckY + 0.3, L / 2 - 1.28, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
  hatch(k, -0.7, deckY + 0.4, L / 2 - 2.0, 0.28, p);
  k.box(W - 0.5, 1.1, 0.25, 0, 0.95, -L / 2 - 0.2, p.dark, { camo: 0.2, mat: MAT.dark, bevel: 0.04, rot: [0.3, 0, 0] }); // spade
  grille(k, 0.0, deckY + 0.02, -L / 2 + 1.6, W * 0.5, 1.6, 6, p);
  tm.box(W * 0.4, 0.05, 0.5, 0, deckY + 0.06, -L / 2 + 0.55, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  whip(k, tm, W / 2 - 0.4, deckY, -L / 2 + 0.3, 3.0, p, 0.15);
  // turret: big armoured box with long barrel, muzzle brake & recoil sleeve
  const ty = deckY, tz = -L * 0.1;
  const tw2 = W - 0.6;
  tk.box(tw2, 1.35, 3.4, 0, 0.68, -0.2, p.main, { camo: 0.9, bevel: 0.1 });
  tk.slab(tw2 - 0.15, 1.1, 1.6, 0.8, 0, 0.62, 2.1, p.main, { camo: 0.9 });
  tk.box(tw2 * 0.9, 0.3, 1.2, 0, 1.45, -1.1, p.main, { camo: 0.9, bevel: 0.04 });
  grille(tk, 0, 1.4, -1.5, tw2 * 0.6, 0.9, 4, p);
  for (const s of [-1, 1]) {
    tk.box(0.1, 0.6, 1.4, s * (tw2 / 2 + 0.05), 0.75, -0.5, p.dark, { camo: 0.3, bevel: 0.02, mat: MAT.dark }); // access panels
    smokeLaunchers(tk, s * (tw2 / 2 - 0.1), 1.05, 1.0, 4, s, p, s * 0.3);
  }
  const elev = 0.17;
  const gz = 2.6, gy = 0.9;
  const gl = gun;
  tk.group(0, gy, gz, [-elev, 0, 0], () => {
    tk.box(0.7, 0.62, 0.7, 0, 0, 0.1, p.main, { camo: 0.9, bevel: 0.05 }); // mantlet
    tk.pipe(0.2, 1.8, 0, 0, 1.3, p.steel, { mat: MAT.metal, seg: 16, camo: 0, bevel: 0.02 }); // recoil sleeve
    tk.pipe(0.135, gl, 0, 0, 0.8 + gl / 2, p.steel, { mat: MAT.metal, seg: 14, camo: 0, rb: 0.15, bevel: 0 });
    tk.pipe(0.26, 0.55, 0, 0, 0.8 + gl, p.dark, { mat: MAT.dark, seg: 16, camo: 0, bevel: 0.04 }); // muzzle brake
    tk.box(0.5, 0.06, 0.34, 0, 0, 0.8 + gl, p.steel, { mat: MAT.metal, camo: 0, bevel: 0.01 });
  });
  tk.cyl(0.32, 0.34, 0.2, 0.7, 1.55, 0.5, p.main, { camo: 0.8, seg: 14 });
  tk.pipe(0.03, 0.8, 0.7, 1.9, 0.9, p.dark, { camo: 0, mat: MAT.dark, seg: 6 });
  hatch(tk, -0.6, 1.33, -0.4, 0.3, p);
  tk.rod(-0.9, 1.4, -1.3, -0.9, 3.0, -1.3, 0.018, p.dark, { camo: 0, mat: MAT.metal, seg: 5 });
  tmT.box(1.4, 0.05, 0.7, 0, 1.38, 0.5, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tmT.box(0.05, 0.4, 0.8, tw2 / 2 + 0.1, 0.9, 0.9, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tmT.box(0.05, 0.4, 0.8, -tw2 / 2 - 0.1, 0.9, 0.9, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  void style;
  const body = k.build();
  return { body, turret: tk.build({ occluders: [{ kit: k, x: 0, y: -ty, z: -tz }] }), turretPivot: [0, ty, tz], team: tm.build({ ao: false }), teamTurret: tmT.build({ ao: false }), height: 3.8, animated: 'tracked' };
};

/** shared 6x6 / 8x8 heavy-truck chassis: cab forward, returns the z of the cab centre and chassis top */
function heavyChassis(k: Kit, tm: Kit, p: Palette, L: number, W: number, axles: number, r: number, cabStyle: 'us' | 'cn' | 'ir'): { cabZ: number; top: number } {
  const wx = W / 2 - 0.15;
  for (let i = 0; i < axles; i++) {
    const z = -L / 2 + 1.2 + (i * (L - 2.4)) / (axles - 1);
    const zz = i >= axles - 2 ? z : z; // spaced evenly
    for (const s of [-1, 1]) wheel(k, s * wx, r + 0.04, zz, r, 0.52, p, s);
    k.drum(0.1, W - 0.3, 0, r + 0.04, zz, p.dark, { camo: 0, mat: MAT.dark, seg: 8 });
  }
  const top = r * 2 + 0.4;
  k.box(W - 0.4, 0.45, L, 0, top - 0.2, 0, p.dark, { camo: 0, mat: MAT.dark, grime: 0.8 });
  const cz = L / 2 - 1.5;
  k.box(W - 0.3, 0.8, 1.2, 0, top + 0.25, cz + 1.0, p.main, { camo: 0.8, bevel: 0.07 });
  const ch = cabStyle === 'cn' ? 1.75 : 1.65;
  k.taper(W - 0.3, W - 0.5, ch, 2.0, 1.8, 0, top + 0.1 + ch / 2, cz - 0.4, p.main, { camo: 0.8 }, 0.1);
  k.box(W - 0.7, 0.55, 0.1, 0, top + ch - 0.1, cz + 0.55, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.015, rot: [-0.35, 0, 0] });
  for (const s of [-1, 1]) {
    k.box(0.06, 0.6, 1.2, s * (W / 2 - 0.15), top + ch - 0.1, cz - 0.4, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
    headlight(k, s * (W / 2 - 0.45), top + 0.25, cz + 1.62, p, 0.17);
    k.rod(s * (W / 2 - 0.1), top + ch, cz + 0.45, s * (W / 2 + 0.3), top + ch + 0.1, cz + 0.55, 0.02, p.dark, { camo: 0, seg: 4 });
  }
  k.box(W - 0.4, 0.3, 0.15, 0, top - 0.05, cz + 1.65, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
  tm.box(1.0, 0.04, 0.8, 0, top + ch + 0.15, cz - 0.4, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  void cabStyle;
  return { cabZ: cz, top };
}

const mlrs: Builder = ({ spec, pal: p, id }) => {
  const Ls = num(spec.len, 8), W = num(spec.wid, 2.9), tubes = num(spec.tubes, 6);
  const L = Ls * 0.95;
  const k = new Kit({ camo: 0.7, grime: 0.55, seed: seedOf(id), bevelMax: 0.08, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const axles = Ls > 8 ? 4 : 3;
  const { top } = heavyChassis(k, tm, p, L, W, axles, 0.68, 'us');
  const pz = -L * 0.12;
  k.box(W - 0.5, 0.35, 4.4, 0, top + 0.1, pz, p.metal, { camo: 0, mat: MAT.metal, bevel: 0.04 });
  for (const s of [-1, 1]) k.box(0.14, 0.7, 0.9, s * (W / 2 - 0.4), top + 0.45, pz - 1.5, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 }); // stabiliser jacks
  k.box(W * 0.45, 0.2, 1.0, 0, top - 0.1, -L / 2 - 0.1, p.dark, { camo: 0, mat: MAT.dark });
  // launcher pod, statically elevated
  const cols = tubes >= 8 ? 4 : tubes >= 6 ? 3 : 2, rows = Math.ceil(tubes / cols);
  const podW = cols * 0.58 + 0.2, podH = rows * 0.58 + 0.2;
  k.group(0, top + 0.3, pz + 0.1, [-0.3, 0, 0], () => {
    k.box(podW, podH, 3.9, 0, podH / 2, 0.0, p.main, { camo: 0.8, bevel: 0.06 });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (r * cols + c >= tubes) continue;
      const tx = (c - (cols - 1) / 2) * 0.58, ty2 = 0.1 + 0.29 + r * 0.58;
      k.cyl(0.255, 0.255, 0.14, tx, ty2, 2.0, p.dark, { camo: 0, mat: MAT.dark, seg: 12, rot: [PI / 2, 0, 0] });
      k.cyl(0.2, 0.2, 0.06, tx, ty2, 2.05, 0x151515, { camo: 0, mat: MAT.dark, seg: 12, rot: [PI / 2, 0, 0] });
    }
    k.box(podW + 0.1, 0.1, 0.5, 0, podH + 0.05, -1.2, p.dark, { camo: 0, mat: MAT.dark });
    for (const z of [-1.4, 0.2, 1.5]) k.box(podW + 0.06, podH + 0.06, 0.12, 0, podH / 2, z, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
  });
  tm.box(podW * 0.6, 0.04, 0.6, 0, top + 0.36, pz - 1.7, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  return { body: k.build(), team: tm.build({ ao: false }), height: 4.6, animated: 'wheeled' };
};

const tel: Builder = ({ spec, pal: p, style, id }) => {
  const Ls = num(spec.len, 10), W = num(spec.wid, 3);
  const L = Ls * 0.95;
  const k = new Kit({ camo: 0.6, grime: 0.55, seed: seedOf(id), bevelMax: 0.08, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const { top } = heavyChassis(k, tm, p, L, W, 4, 0.74, 'ir');
  const pz = -L * 0.1;
  // erector cradle + missile
  k.box(W - 0.6, 0.35, L * 0.62, 0, top + 0.05, pz, p.metal, { camo: 0, mat: MAT.metal, bevel: 0.04 });
  for (const s of [-1, 1]) k.box(0.14, 0.8, 0.9, s * (W / 2 - 0.4), top + 0.4, -L * 0.45, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 });
  const mlen = L * 0.58;
  const R = 0.5;
  k.group(0, top + 0.95, pz, [-0.1, 0, 0], () => {
    k.lathe([[0, -mlen / 2], [R * 0.7, -mlen / 2], [R, -mlen / 2 + 0.3], [R, mlen / 2 - 1.6], [R * 0.75, mlen / 2 - 0.5], [R * 0.3, mlen / 2 + 0.3], [0, mlen / 2 + 0.55]], 0, 0, 0, p.alt, { camo: 0.5, seg: 20, rot: [PI / 2, 0, 0] });
    for (let i = 0; i < 4; i++) k.box(0.08, 0.7, 0.9, 0, 0, -mlen / 2 + 0.5, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.01, rot: [0, 0, i * PI / 2 + PI / 4] }); // tail fins
    k.drum(0.0, 0.0, 0, 0, 0, 0, { camo: 0 });
    for (let i = 0; i < 3; i++) k.cyl(R + 0.04, R + 0.04, 0.12, 0, 0, -mlen * 0.3 + i * mlen * 0.3, p.dark, { camo: 0, mat: MAT.dark, seg: 16, rot: [PI / 2, 0, 0] }); // cradle bands
    k.cyl(R * 0.55, R * 0.55, 0.2, 0, 0, mlen / 2 - 0.9, p.dark, { camo: 0, mat: MAT.dark, seg: 12, rot: [PI / 2, 0, 0] }); // band marking
    k.cyl(R + 0.01, R + 0.01, 0.4, 0, 0, mlen * 0.1, 0xb23a2a, { camo: 0, seg: 16, rot: [PI / 2, 0, 0] });
  });
  tm.box(0.9, 0.04, 0.7, 0, top + 0.28, -L * 0.45, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  void style;
  return { body: k.build(), team: tm.build({ ao: false }), height: 4.8, animated: 'wheeled' };
};

const sam: Builder = ({ spec, pal: p, id }) => {
  const mobile = !!spec.mobile;
  const tubes = num(spec.tubes, 4);
  const k = new Kit({ camo: 0.6, grime: 0.55, seed: seedOf(id), bevelMax: 0.08, tess: 1.8 });
  const tk = new Kit({ camo: 0.6, grime: 0.5, seed: seedOf(id) + 3, bevelMax: 0.06, ground: false, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const tmT = new Kit({ ground: false });
  if (mobile) {
    const Ls = num(spec.len, 9), W = num(spec.wid, 3);
    const L = Ls * 0.95;
    const { top } = heavyChassis(k, tm, p, L, W, 4, 0.72, 'us');
    const pz = -L * 0.14;
    k.box(W - 0.5, 0.35, 4.6, 0, top + 0.1, pz, p.metal, { camo: 0, mat: MAT.metal, bevel: 0.04 });
    // elevated canisters (static pose)
    k.group(0, top + 0.5, pz, [-0.95, 0, 0], () => {
      for (let i = 0; i < tubes; i++) {
        const cx = ((i % 2) - 0.5) * 1.05, cy = Math.floor(i / 2) * 0.85;
        k.box(0.82, 0.76, 4.8, cx, cy + 0.4, 0, p.main, { camo: 0.5, bevel: 0.07 });
        k.box(0.7, 0.62, 0.1, cx, cy + 0.4, 2.42, p.light, { camo: 0, bevel: 0.02 });
        k.cyl(0.18, 0.2, 0.14, cx, cy + 0.4, 2.46, p.dark, { camo: 0, mat: MAT.dark, seg: 10, rot: [PI / 2, 0, 0] });
        for (let b = 0; b < 3; b++) k.box(0.86, 0.08, 0.12, cx, cy + 0.4, -1.5 + b * 1.4, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
      }
    });
    // radar mast + antenna on the cab roof
    k.rod(-W / 2 + 0.5, top + 1.8, L * 0.2, -W / 2 + 0.5, top + 3.4, L * 0.2, 0.08, p.steel, { mat: MAT.metal, seg: 8 });
    k.box(0.9, 0.7, 0.14, -W / 2 + 0.5, top + 3.7, L * 0.2, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 });
    tm.box(0.8, 0.04, 0.5, 0, top + 0.28, -L / 2 + 0.7, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    return { body: k.build(), team: tm.build({ ao: false }), height: 5.4, animated: 'wheeled' };
  }
  // static battery: concrete pad + traversing launcher
  const w = num(spec.w, 14);
  k.box(w, 0.6, w, 0, 0.3, 0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.08 });
  k.box(w * 0.8, 0.08, w * 0.8, 0, 0.62, 0, p.dark, { camo: 0, mat: MAT.asphalt, bevel: 0.02 });
  k.cyl(2.3, 2.6, 1.3, 0, 1.25, 0, p.metal, { camo: 0, mat: MAT.metal, seg: 20 });
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; k.box(0.5, 0.5, 1.3, Math.sin(a) * w * 0.4, 0.85, Math.cos(a) * w * 0.4, p.dark, { camo: 0, mat: MAT.concrete, rot: [0, a, 0] }); }
  // power unit + control van to the side
  k.box(2.8, 1.8, 4.0, -w * 0.32, 1.5, -w * 0.3, p.main, { camo: 0.6, bevel: 0.06 });
  grille(k, -w * 0.32, 2.45, -w * 0.3, 2.0, 2.0, 5, p);
  k.drum(0.4, 0.5, -w * 0.32 + 1.5, 1.0, -w * 0.3, p.dark, { camo: 0, mat: MAT.dark, seg: 10 });
  for (const s of [-1, 1]) sandbagWall(k, s * w * 0.3, 0.6, w * 0.46, 3.4, s * 0.0, p);
  // launcher on a turntable
  tk.box(3.2, 0.75, 3.6, 0, 0.38, 0, p.main, { camo: 0.6, bevel: 0.07 });
  tk.group(0, 0.9, -0.1, [-0.88, 0, 0], () => {
    for (let i = 0; i < tubes; i++) {
      const cx = ((i % 2) - 0.5) * 1.35, cy = Math.floor(i / 2) * 1.1;
      tk.box(1.0, 0.95, 6.0, cx, cy + 0.5, 0.9, p.main, { camo: 0.5, bevel: 0.08 });
      tk.box(0.86, 0.8, 0.12, cx, cy + 0.5, 3.92, p.light, { camo: 0, bevel: 0.02 });
      tk.cyl(0.2, 0.22, 0.12, cx, cy + 0.5, 3.98, p.dark, { camo: 0, mat: MAT.dark, seg: 10, rot: [PI / 2, 0, 0] });
      for (let b = 0; b < 4; b++) tk.box(1.04, 0.1, 0.14, cx, cy + 0.5, -1.4 + b * 1.6, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
    }
  });
  tmT.box(w * 0.4, 0.06, 0.6, 0, 0.78, 1.5, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(w * 0.4, 0.06, 0.4, 0, 0.7, w / 2 - 0.5, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  const body = k.build();
  return { body, turret: tk.build({ occluders: [{ kit: k, y: -1.9 }] }), turretPivot: [0, 1.9, 0], team: tm.build({ ao: false }), teamTurret: tmT.build({ ao: false }), height: 5.5 };
};

export function sandbagWall(k: Kit, x: number, y: number, z: number, len: number, rotY: number, p: Palette): void {
  k.group(x, y, z, [0, rotY, 0], () => {
    const n = Math.max(2, Math.round(len / 0.55));
    for (let row = 0; row < 3; row++) for (let i = 0; i < n; i++) {
      const off = row % 2 ? 0.27 : 0;
      k.box(0.54, 0.22, 0.34, -len / 2 + i * (len / n) + off, 0.11 + row * 0.2, 0, p.canvas, { camo: 0.2, grime: 0.7, bevel: 0.09, mat: MAT.cloth, jitter: 0.1 });
    }
  });
}

const gunturret: Builder = ({ spec, pal: p, id }) => {
  const w = num(spec.w, 10), barrels = num(spec.barrels, 1);
  const k = new Kit({ camo: 0.5, grime: 0.55, seed: seedOf(id), bevelMax: 0.08, tess: 1.8 });
  const tk = new Kit({ camo: 0.5, grime: 0.5, seed: seedOf(id) + 3, bevelMax: 0.06, ground: false, tess: 1.8 });
  const tm = new Kit({ ground: false });
  const tmT = new Kit({ ground: false });
  k.box(w, 0.6, w, 0, 0.3, 0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.08 });
  k.cyl(2.5, 2.9, 1.5, 0, 1.35, 0, p.main, { camo: 0.5, seg: 22, bevel: 0.1 });
  k.cyl(2.2, 2.2, 0.25, 0, 2.2, 0, p.metal, { camo: 0, mat: MAT.metal, seg: 22 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; crate(k, Math.sin(a) * (w * 0.42), 0.6, Math.cos(a) * (w * 0.42), 0.9, 0.7, 0.9, p.alt, a); }
  sandbagWall(k, 0, 0.6, w * 0.47, w * 0.9, 0, p);
  // turret
  tk.cyl(1.9, 2.0, 1.1, 0, 0.55, 0, p.main, { camo: 0.6, seg: 22, bevel: 0.08 });
  tk.sphere(1.05, 0, 1.3, -0.4, p.light, { camo: 0.1, sy: 0.7, seg: 16 });
  tk.box(1.3, 0.95, 1.8, 0, 0.85, 0.8, p.main, { camo: 0.6, bevel: 0.06 });
  for (let i = 0; i < barrels; i++) {
    const bx = (i - (barrels - 1) / 2) * 0.62;
    tk.pipe(0.12, 3.6, bx, 0.95, 2.6, p.steel, { mat: MAT.metal, seg: 12, camo: 0, rb: 0.14 });
    tk.pipe(0.18, 0.9, bx, 0.95, 1.9, p.dark, { mat: MAT.dark, seg: 12, camo: 0 });
    tk.pipe(0.15, 0.3, bx, 0.95, 4.35, p.dark, { mat: MAT.metal, seg: 10, camo: 0 });
  }
  tk.box(0.5, 0.5, 0.9, 1.0, 1.3, -0.6, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.04 });
  tk.sphere(0.34, -0.9, 1.9, 0.4, p.dark, { mat: MAT.metal, camo: 0, seg: 10 });
  tmT.box(1.4, 0.06, 0.6, 0, 1.55, -0.8, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(w * 0.5, 0.1, 0.5, 0, 0.66, w / 2 - 1.0, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  const body = k.build();
  return { body, turret: tk.build({ occluders: [{ kit: k, y: -2.3 }] }), turretPivot: [0, 2.3, 0], team: tm.build({ ao: false }), teamTurret: tmT.build({ ao: false }), height: 5.5 };
};

// ====================================================================================== registry
const BUILDERS: Record<string, Builder> = {
  ...legacyBuilders,
  ...structBuilders,
  ...airBuilders,
  infantry, tank, wheeled, truck, dozer, artillery, mlrs, tel, sam, gunturret,
};

const cache = new Map<string, ModelData>();

export function getModel(def: EntityDef): ModelData {
  let m = cache.get(def.id);
  if (m) return m;
  const spec = def.model;
  const style = String(spec.style ?? (def.faction === 'neutral' ? 'neutral' : def.faction));
  const pal = PALETTES[style] ?? PALETTES.neutral;
  const build = BUILDERS[spec.tpl];
  if (build) m = build({ spec, pal, style, id: def.id });
  else {
    const k = new Kit({ camo: 0.3, grime: 0.4, seed: 5 });
    const r = def.radius;
    k.box(r * 1.4, r * 0.8, r * 1.8, 0, r * 0.4, 0, pal.main);
    m = { body: k.build(), height: r };
  }
  cache.set(def.id, m);
  return m;
}

/** build (and bake AO for) every model of the given factions up front so first-sight hitches never happen mid-game */
export async function prebuildModels(defs: EntityDef[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let n = 0;
  for (const d of defs) {
    getModel(d);
    n++;
    onProgress?.(n, defs.length);
    if (n % 3 === 0) await new Promise((r) => setTimeout(r, 0));
  }
}

export function registerModelBuilder(name: string, b: Builder): void { BUILDERS[name] = b; }
export { Kit, MAT, KIND, TEAM, PI, clamp, whip, hatch, grille, headlight, pennant, crate, jerrycan, bedroll, tarpBundle, eraTiles, smokeLaunchers, wheel, trackSide };
