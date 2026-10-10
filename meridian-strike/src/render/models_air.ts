import { Kit, MAT, Station } from './kit';
import { Palette, TEAM, PI, num, seedOf } from './parts';
import type { Builder, ModelData } from './models';

/** fin / rudder: polygon in the (z,y) plane, thin along x; placed with optional cant around the z axis */
function fin(k: Kit, x: number, y: number, z: number, poly: [number, number][], thick: number, cant: number, color: number, o: { camo?: number } = {}): void {
  k.group(x, y, z, [0, 0, cant], () => {
    k.group(0, 0, 0, [0, -PI / 2, 0], () => {
      k.prism(poly, thick, 0, 0, 0, color, { camo: o.camo ?? 0, bevel: Math.min(0.06, thick * 0.4), smooth: 25, grime: 0.25 });
    });
  });
}

function missile(k: Kit, x: number, y: number, z: number, len: number, r: number, p: Palette, body = 0xbfc3c4): void {
  k.group(x, y, z, null, () => {
    k.lathe([[0, -len / 2], [r * 0.8, -len / 2], [r, -len / 2 + r], [r, len / 2 - r * 2.2], [r * 0.3, len / 2], [0, len / 2 + r * 0.2]], 0, 0, 0, body, { camo: 0, seg: 10, rot: [PI / 2, 0, 0], grime: 0.2, mat: MAT.paint });
    for (let i = 0; i < 4; i++) k.box(0.02, r * 2.4, len * 0.14, 0, 0, -len / 2 + len * 0.08, p.dark, { camo: 0, bevel: 0, rot: [0, 0, (i * PI) / 2 + PI / 4] });
  });
}

// ====================================================================================== jets
const jet: Builder = ({ spec, pal: p, style, id }) => {
  const L = num(spec.len, 15), S = num(spec.span, 10);
  const stealth = !!spec.stealth;
  const k = new Kit({ camo: stealth ? 0.1 : 0.7, grime: 0.3, seed: seedOf(id), bevelMax: 0.07, ground: false });
  const tm = new Kit({ ground: false });
  const f35 = stealth && style === 'usa';
  const j20 = stealth && style === 'china';
  const col = stealth ? 0x5a6168 : p.main;
  const col2 = stealth ? 0x4a5056 : p.alt;
  const mp = stealth ? { rough: 0.55, metal: 0.25, kind: 0 } : MAT.paint;
  // fuselage
  const st: Station[] = f35 ? [
    { z: L * 0.5, w: 0.02, h: 0.02, n: 2 },
    { z: L * 0.44, w: 0.26, ht: 0.26, hb: 0.2, n: 2.4 },
    { z: L * 0.34, w: 0.58, ht: 0.55, hb: 0.42, y: 0.02, n: 2.6 },
    { z: L * 0.14, w: 0.98, ht: 0.64, hb: 0.5, y: 0.0, n: 3.2 },
    { z: -L * 0.12, w: 1.18, ht: 0.58, hb: 0.52, n: 3.6 },
    { z: -L * 0.34, w: 0.8, ht: 0.46, hb: 0.42, n: 3.2 },
    { z: -L * 0.5, w: 0.52, ht: 0.34, hb: 0.34, n: 2.6 },
  ] : j20 ? [
    { z: L * 0.5, w: 0.02, h: 0.02, n: 2 },
    { z: L * 0.42, w: 0.3, ht: 0.3, hb: 0.2, n: 2.4 },
    { z: L * 0.3, w: 0.62, ht: 0.6, hb: 0.42, n: 2.8 },
    { z: L * 0.08, w: 1.05, ht: 0.62, hb: 0.5, n: 3.4 },
    { z: -L * 0.2, w: 1.35, ht: 0.58, hb: 0.5, n: 3.8 },
    { z: -L * 0.42, w: 1.0, ht: 0.46, hb: 0.42, n: 3.4 },
    { z: -L * 0.5, w: 0.8, ht: 0.4, hb: 0.38, n: 3 },
  ] : [
    { z: L * 0.5, w: 0.03, h: 0.03, n: 2 },
    { z: L * 0.42, w: 0.3, ht: 0.3, hb: 0.22, y: -0.05, n: 2.2 },
    { z: L * 0.3, w: 0.6, ht: 0.55, hb: 0.42, n: 2.5 },
    { z: L * 0.1, w: 1.15, ht: 0.55, hb: 0.5, n: 3.4 },
    { z: -L * 0.2, w: 1.5, ht: 0.5, hb: 0.5, n: 3.8 },
    { z: -L * 0.45, w: 1.4, ht: 0.45, hb: 0.45, n: 3.4 },
  ];
  k.loft(st, 0, 0, 0, col, { seg: 22, camo: stealth ? 0.1 : 0.7, mat: mp });
  // canopy
  k.loft([{ z: L * 0.33, w: 0.05, h: 0.05, n: 2 }, { z: L * 0.28, w: 0.34, ht: 0.34, hb: 0, n: 2.2, hard: false }, { z: L * 0.18, w: 0.4, ht: 0.4, hb: 0, n: 2.4 }, { z: L * 0.08, w: 0.3, ht: 0.18, hb: 0, n: 2.4 }, { z: L * 0.04, w: 0.05, ht: 0.03, hb: 0, n: 2 }], 0, 0.5, 0, 0x172733, { seg: 16, camo: 0, mat: MAT.glass, grime: 0 });
  // intakes
  for (const s of [-1, 1]) {
    if (f35 || j20) k.box(0.56, 0.62, L * 0.16, s * (f35 ? 0.95 : 1.05), -0.12, L * 0.12, col2, { camo: 0.1, bevel: 0.08, rot: [0, -s * 0.06, 0], mat: mp });
    else k.box(0.8, 0.8, L * 0.2, s * 0.95, -0.15, L * 0.1, col2, { camo: 0.4, bevel: 0.1 });
    k.box(0.4, 0.46, 0.06, s * (f35 ? 0.95 : 1.05), -0.12, L * 0.12 + L * 0.08 + 0.01, 0x101214, { camo: 0, mat: MAT.dark, bevel: 0.01 });
  }
  // wings: swept/delta planforms
  const wing = (rootZ: number, tipLE: number, tipTE: number, rootTE: number, span: number, thick: number, y: number, rootX: number): void => {
    for (const s of [-1, 1]) {
      k.plate([[s * rootX, rootZ], [s * span / 2, tipLE], [s * span / 2, tipTE], [s * rootX, rootTE]], thick, 0, y, 0, col, { camo: stealth ? 0.1 : 0.7, bevel: thick * 0.45, mat: mp });
    }
  };
  if (f35) wing(L * 0.1, -L * 0.14, -L * 0.22, -L * 0.36, S, 0.2, -0.12, 0.7);
  else if (j20) { wing(L * 0.08, -L * 0.2, -L * 0.3, -L * 0.42, S, 0.2, -0.1, 1.0); }
  else wing(L * 0.12, -L * 0.1, -L * 0.2, -L * 0.36, S, 0.22, -0.1, 1.0);
  // leading-edge root extension (LERX) for the flanker
  if (!stealth) for (const s of [-1, 1]) k.plate([[s * 0.9, L * 0.32], [s * 2.2, L * 0.08], [s * 1.4, L * 0.08]], 0.14, 0, -0.05, 0, col, { camo: 0.7, mat: mp });
  // canards
  if (j20 || !stealth && style === 'china' && false) for (const s of [-1, 1]) k.plate([[s * 0.8, L * 0.2], [s * 3.0, L * 0.12], [s * 3.0, L * 0.06], [s * 0.8, L * 0.1]], 0.1, 0, 0.25, 0, col, { camo: 0.1, mat: mp });
  // tailplanes
  for (const s of [-1, 1]) k.plate([[s * 0.9, -L * 0.3], [s * (S * 0.34), -L * 0.4], [s * (S * 0.34), -L * 0.46], [s * 0.9, -L * 0.5]], 0.14, 0, 0.0, 0, col, { camo: stealth ? 0.1 : 0.7, mat: mp });
  // vertical fins
  const finPoly: [number, number][] = [[-L * 0.3, 0], [-L * 0.5, 0], [-L * 0.46, 2.4], [-L * 0.34, 2.2]];
  if (f35) { for (const s of [-1, 1]) fin(k, s * 0.7, 0.4, 0, finPoly.map((q) => [q[0], q[1] * 0.85] as [number, number]), 0.1, -s * 0.4, col, { camo: 0.1 }); }
  else if (j20) { for (const s of [-1, 1]) fin(k, s * 0.9, 0.4, -L * 0.04, finPoly.map((q) => [q[0], q[1] * 0.8] as [number, number]), 0.1, -s * 0.18, col, { camo: 0.1 }); for (const s of [-1, 1]) fin(k, s * 0.9, -0.5, -L * 0.04, finPoly.map((q) => [q[0], -q[1] * 0.3] as [number, number]), 0.08, s * 0.5, col, { camo: 0.1 }); }
  else { for (const s of [-1, 1]) fin(k, s * 1.55, 0.35, 0, finPoly.map((q) => [q[0], q[1] * 1.1] as [number, number]), 0.12, -s * 0.06, col); }
  // engine nozzles
  const nozzles = (!stealth || j20) ? [-1, 1] : [0];
  for (const s of nozzles) {
    const nx = s * (j20 ? 0.55 : stealth ? 0 : 0.78);
    k.lathe([[0.4, -0.4], [0.5, 0], [0.42, 0.5], [0.32, 0.8]], nx, 0, -L * 0.5 - 0.1, 0x2a2623, { camo: 0, seg: 16, mat: MAT.metal, rot: [-PI / 2, 0, 0], grime: 0.7 });
    k.cyl(0.26, 0.26, 0.05, nx, 0, -L * 0.5 - 0.45, 0xff7a3a, { camo: 0, rot: [PI / 2, 0, 0], mat: MAT.emit, seg: 12 });
  }
  // weapons: wingtip + underwing AAMs for non-stealth, internal bay lines for stealth
  if (!stealth) {
    for (const s of [-1, 1]) {
      missile(k, s * (S / 2), -0.1, -L * 0.14, 3.0, 0.1, p);
      missile(k, s * (S * 0.3), -0.35, -L * 0.1, 3.6, 0.12, p, 0xdad6c9);
      k.box(0.08, 0.3, 1.2, s * (S * 0.3), -0.2, -L * 0.1, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
    }
  } else {
    k.box(0.9, 0.04, L * 0.18, 0, -0.62, L * 0.0, 0x35393e, { camo: 0, bevel: 0.01, mat: MAT.dark });
  }
  // team markings: wingtips + tail
  for (const s of [-1, 1]) {
    tm.box(0.35, 0.04, 1.3, s * (S * 0.34), 0.13, -L * 0.14, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    tm.box(0.04, 0.5, 0.9, s * (f35 ? 1.25 : 1.6), 1.0, -L * 0.42, TEAM, { camo: 0, grime: 0, bevel: 0.01, rot: [0, 0, -s * 0.2] });
  }
  return { body: k.build(), team: tm.build({ ao: false }), height: 3, flier: true };
};

const bomber: Builder = ({ spec, pal: p, style, id }) => {
  const L = num(spec.len, 21), S = num(spec.span, 40);
  const k = new Kit({ camo: 0.08, grime: 0.25, seed: seedOf(id), bevelMax: 0.1, ground: false });
  const tm = new Kit({ ground: false });
  if (style === 'usa') {
    // B-21 flying wing
    const col = 0x3d4349;
    const mp = { rough: 0.6, metal: 0.2, kind: 0 };
    const half = S / 2;
    k.plate([[0, L * 0.5], [half, -L * 0.12], [half * 0.98, -L * 0.2], [half * 0.66, -L * 0.3], [half * 0.5, -L * 0.2], [half * 0.34, -L * 0.34], [0, -L * 0.26], [-half * 0.34, -L * 0.34], [-half * 0.5, -L * 0.2], [-half * 0.66, -L * 0.3], [-half * 0.98, -L * 0.2], [-half, -L * 0.12]], 0.9, 0, 0, 0, col, { camo: 0, bevel: 0.35, mat: mp, smooth: 20 });
    k.loft([
      { z: L * 0.46, w: 0.02, h: 0.02, n: 2 },
      { z: L * 0.34, w: 1.3, ht: 0.55, hb: 0.35, y: 0.08, n: 2.6 },
      { z: L * 0.1, w: 2.8, ht: 0.78, hb: 0.5, y: 0.1, n: 3 },
      { z: -L * 0.14, w: 3.4, ht: 0.7, hb: 0.5, y: 0.08, n: 3 },
      { z: -L * 0.3, w: 2.6, ht: 0.4, hb: 0.4, n: 3 },
    ], 0, 0, 0, col, { seg: 22, camo: 0, mat: mp });
    // cockpit glass slits + engine intakes on the leading edge
    for (const s of [-1, 1]) {
      k.box(0.7, 0.1, 0.9, s * 0.55, 0.75, L * 0.3, 0x0f1820, { camo: 0, mat: MAT.glass, bevel: 0.02, rot: [0.35, s * 0.2, 0] });
      k.box(1.5, 0.35, 0.7, s * (half * 0.2), 0.52, L * 0.04, 0x15181b, { camo: 0, mat: MAT.dark, bevel: 0.05, rot: [0, -s * 0.14, 0] });
      k.box(1.2, 0.28, 0.1, s * (half * 0.34), 0.0, -L * 0.33, 0x15181b, { camo: 0, mat: MAT.dark, bevel: 0.02 });
    }
    for (const s of [-1, 1]) {
      tm.box(1.8, 0.05, 3.2, s * half * 0.62, 0.48, -L * 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
      tm.box(1.0, 0.05, 1.6, s * half * 0.28, 0.82, -L * 0.1, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    }
    return { body: k.build(), team: tm.build({ ao: false }), height: 3, flier: true };
  }
  // conventional swept-wing bomber (H-6N): glass nose, twin turbofans, tall fin
  k.loft([
    { z: L * 0.5, w: 0.05, h: 0.05, n: 2 },
    { z: L * 0.44, w: 0.55, ht: 0.55, hb: 0.5, n: 2.2 },
    { z: L * 0.34, w: 1.2, ht: 1.2, hb: 1.0, n: 2.2 },
    { z: L * 0.0, w: 1.7, ht: 1.5, hb: 1.2, n: 2.4 },
    { z: -L * 0.3, w: 1.3, ht: 1.1, hb: 0.9, n: 2.4 },
    { z: -L * 0.5, w: 0.3, ht: 0.35, hb: 0.3, n: 2.2 },
  ], 0, 0.3, 0, p.light, { seg: 24, camo: 0.2 });
  k.sphere(0.9, 0, 0.55, L * 0.42, p.glass, { camo: 0, mat: MAT.glass, sy: 0.7, sz: 1.6, seg: 14 });
  const half = S / 2;
  for (const s of [-1, 1]) {
    k.plate([[s * 1.3, L * 0.14], [s * half, -L * 0.14], [s * half, -L * 0.2], [s * 1.3, -L * 0.18]], 0.55, 0, -0.1, 0, p.light, { camo: 0.2, bevel: 0.18 });
    k.plate([[s * 1.0, -L * 0.4], [s * half * 0.38, -L * 0.48], [s * half * 0.38, -L * 0.52], [s * 0.7, -L * 0.5]], 0.2, 0, 0.4, 0, p.light, { camo: 0.2 });
    // turbofan nacelles
    const nx = s * half * 0.32;
    k.lathe([[0, -3], [0.9, -3], [1.0, -2.6], [1.0, 1.2], [0.8, 2.6], [0.5, 3.0], [0, 3.0]], nx, -0.9, 0, p.concrete, { camo: 0.1, seg: 20, rot: [PI / 2, 0, 0], mat: MAT.paint });
    k.cyl(0.7, 0.7, 0.1, nx, -0.9, L * 0.0 + 3.0 + 0.05, 0x25272a, { camo: 0, mat: MAT.dark, rot: [PI / 2, 0, 0], seg: 14 });
    k.box(0.3, 1.0, 1.8, nx, -0.5, -0.1, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.04 }); // pylon
    tm.box(1.4, 0.05, 3.0, s * half * 0.72, 0.28, -L * 0.1, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  }
  fin(k, 0, 0.9, 0, [[-L * 0.28, 0], [-L * 0.5, 0], [-L * 0.47, 6.0], [-L * 0.38, 6.0]], 0.35, 0, p.light, { camo: 0.2 });
  tm.box(0.05, 1.2, 2.4, 0.2, 5.0, -L * 0.43, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.05, 1.2, 2.4, -0.2, 5.0, -L * 0.43, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  return { body: k.build(), team: tm.build({ ao: false }), height: 3, flier: true };
};

// ====================================================================================== helicopters
const heli: Builder = ({ spec, pal: p, style, id }) => {
  const L = num(spec.len, 15), R = num(spec.rotor, 14);
  const k = new Kit({ camo: 0.8, grime: 0.35, seed: seedOf(id), bevelMax: 0.06, ground: false });
  const rk = new Kit({ camo: 0, grime: 0.15, seed: 3, ground: false });
  const r2k = new Kit({ camo: 0, grime: 0.15, seed: 4, ground: false });
  const tm = new Kit({ ground: false });
  const col = p.main;
  const china = style === 'china';
  // fuselage
  k.loft([
    { z: L * 0.46, w: 0.12, h: 0.12, n: 2 },
    { z: L * 0.41, w: 0.46, ht: 0.4, hb: 0.42, n: 2.4 },
    { z: L * 0.33, w: 0.7, ht: 0.6, hb: 0.52, n: 2.5 },
    { z: L * 0.14, w: 0.86, ht: 0.95, hb: 0.6, y: 0.1, n: 2.6 },
    { z: -L * 0.08, w: 0.98, ht: 0.95, hb: 0.62, y: 0.1, n: 2.6 },
    { z: -L * 0.22, w: 0.7, ht: 0.62, hb: 0.5, y: 0.14, n: 2.6 },
    { z: -L * 0.34, w: 0.32, ht: 0.34, hb: 0.3, y: 0.3, n: 2.4 },
    { z: -L * 0.5, w: 0.2, ht: 0.3, hb: 0.2, y: 0.55, n: 2.4 },
  ], 0, 0, 0, col, { seg: 18, camo: 0.8 });
  // canopies (tandem)
  k.loft([{ z: L * 0.36, w: 0.05, h: 0.03, n: 2 }, { z: L * 0.31, w: 0.44, ht: 0.46, hb: 0, n: 2.2 }, { z: L * 0.22, w: 0.5, ht: 0.55, hb: 0, n: 2.4 }, { z: L * 0.16, w: 0.2, ht: 0.12, hb: 0, n: 2 }], 0, 0.28, 0, 0x142630, { seg: 14, camo: 0, mat: MAT.glass, grime: 0 });
  k.loft([{ z: L * 0.14, w: 0.05, h: 0.03, n: 2 }, { z: L * 0.1, w: 0.5, ht: 0.55, hb: 0, n: 2.2 }, { z: -L * 0.0, w: 0.55, ht: 0.7, hb: 0, n: 2.4 }, { z: -L * 0.06, w: 0.2, ht: 0.2, hb: 0, n: 2 }], 0, 0.56, 0, 0x142630, { seg: 14, camo: 0, mat: MAT.glass, grime: 0 });
  // nose sensor turret + chin gun
  k.sphere(0.34, 0, -0.3, L * 0.4, p.dark, { camo: 0, mat: MAT.dark, seg: 10 });
  k.sphere(0.12, 0, -0.3, L * 0.4 + 0.3, 0x3a8bff, { camo: 0, mat: MAT.emit, seg: 6 });
  k.pipe(0.05, 1.5, 0, -0.62, L * 0.36, p.metal, { camo: 0, mat: MAT.metal, seg: 8 });
  k.box(0.4, 0.3, 0.6, 0, -0.55, L * 0.28, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.04 });
  // engine nacelles + exhausts
  for (const s of [-1, 1]) {
    k.loft([{ z: L * 0.06, w: 0.2, h: 0.2, n: 2 }, { z: L * 0.0, w: 0.5, ht: 0.5, hb: 0.45, n: 2.4 }, { z: -L * 0.2, w: 0.5, ht: 0.46, hb: 0.42, n: 2.4 }, { z: -L * 0.3, w: 0.28, ht: 0.3, hb: 0.28, n: 2.2 }], s * 0.88, 0.98, 0, col, { seg: 14, camo: 0.8 });
    k.cyl(0.24, 0.3, 0.3, s * 0.88, 0.96, -L * 0.3 - 0.1, p.dark, { camo: 0, mat: MAT.metal, rot: [PI / 2, 0, 0], seg: 12 });
    // stub wings + pylons + missiles
    k.plate([[s * 0.8, L * 0.1], [s * 3.2, L * 0.04], [s * 3.2, -L * 0.04], [s * 0.8, -L * 0.12]], 0.16, 0, 0.1, 0, col, { camo: 0.8, bevel: 0.05 });
    for (const dx of [1.7, 2.9]) {
      k.box(0.14, 0.4, 0.8, s * dx, -0.12, 0, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
      if (dx > 2) { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) missile(k, s * dx + (i - 0.5) * 0.26, -0.45 - j * 0.26, 0.3, 1.8, 0.08, p, p.alt); }
      else k.pipe(0.28, 1.5, s * dx, -0.45, 0.3, p.dark, { camo: 0, mat: MAT.dark, seg: 12 });
    }
    // landing gear
    k.rod(s * 0.6, -0.5, L * 0.28, s * 0.6, -1.3, L * 0.28, 0.06, p.dark, { camo: 0, mat: MAT.metal, seg: 6 });
    k.drum(0.22, 0.14, s * 0.62, -1.3, L * 0.28, p.rubber, { camo: 0, mat: MAT.rubber, seg: 10 });
  }
  k.rod(0, -0.5, -L * 0.3, 0, -1.2, -L * 0.34, 0.05, p.dark, { camo: 0, mat: MAT.metal, seg: 6 });
  k.drum(0.2, 0.12, 0, -1.2, -L * 0.34, p.rubber, { camo: 0, mat: MAT.rubber, seg: 10 });
  // tail: fin + stabilisers
  fin(k, 0, 0.5, 0, [[-L * 0.4, 0], [-L * 0.5, 0], [-L * 0.5, 2.5], [-L * 0.44, 2.7]], 0.12, 0, col, { camo: 0.8 });
  for (const s of [-1, 1]) k.plate([[s * 0.2, -L * 0.45], [s * 1.8, -L * 0.48], [s * 1.8, -L * 0.52], [s * 0.2, -L * 0.52]], 0.1, 0, 0.7, 0, col, { camo: 0.8 });
  // rotor mast + hub + antennas
  k.cyl(0.22, 0.28, 0.9, 0, 1.55, L * 0.0, p.dark, { camo: 0, mat: MAT.metal, seg: 12 });
  k.cyl(0.3, 0.3, 0.2, 0, 2.05, L * 0.0, p.dark, { camo: 0, mat: MAT.metal, seg: 12 });
  k.rod(0, 1.7, -L * 0.18, 0, 2.3, -L * 0.2, 0.025, p.dark, { camo: 0, mat: MAT.metal, seg: 5 });
  k.box(0.3, 0.12, 0.5, 0, 1.6, L * 0.1, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
  if (china) k.box(0.4, 0.3, 0.6, 0, 1.78, L * 0.14, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 }); // mast-mounted sight
  else k.sphere(0.35, 0, 2.5, 0.0, p.dark, { camo: 0, mat: MAT.metal, sy: 0.7, seg: 10 }); // longbow radome
  // main rotor: 4 blades
  for (let i = 0; i < 4; i++) {
    rk.group(0, 0, 0, [0, (i * PI) / 2, 0], () => {
      rk.plate([[0.3, -0.28], [R * 0.5, -0.24], [R * 0.5, 0.24], [0.3, 0.28]], 0.06, 0, 0, 0, 0x2b2d2f, { camo: 0, bevel: 0.015, grime: 0.2, mat: MAT.dark });
      rk.box(0.6, 0.04, 0.12, R * 0.5 - 0.3, 0.03, 0, 0xd9a31a, { camo: 0, bevel: 0, grime: 0 });
    });
  }
  // tail rotor
  for (let i = 0; i < 2; i++) r2k.plate([[0.1, -0.12], [1.5, -0.1], [1.5, 0.1], [0.1, 0.12]], 0.04, 0, 0, 0, 0x2b2d2f, { camo: 0, bevel: 0.01, rot: [0, 0, i * PI / 2] });
  tm.box(0.04, 0.5, 1.4, 0.25, 0.55 + 1.5, -L * 0.47, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  tm.box(0.5, 0.04, 2.2, 0, 1.0 + 0.12, -L * 0.14, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  return {
    body: k.build(), team: tm.build({ ao: false }), rotor: rk.build({ ao: false }), rotorPivot: [0, 2.2, L * 0.0], rotorAxis: 'y', rotorSpeed: 28,
    rotor2: r2k.build({ ao: false }), rotor2Pivot: [0.2, 0.55 + 1.3, -L * 0.5], rotor2Axis: 'x', rotor2Speed: 38, height: 4, flier: true,
  };
};

// ====================================================================================== drones
const drone: Builder = ({ spec, pal: p, style, id }) => {
  const L = num(spec.len, 11), S = num(spec.span, 20);
  const k = new Kit({ camo: 0.1, grime: 0.3, seed: seedOf(id), bevelMax: 0.05, ground: false });
  const rk = new Kit({ camo: 0, grime: 0.1, seed: 3, ground: false });
  const tm = new Kit({ ground: false });
  const col = style === 'usa' ? 0x777c80 : style === 'china' ? 0x8b9096 : 0x9a9a92;
  const mp = { rough: 0.5, metal: 0.2, kind: 0 };
  // fuselage with bulbous nose
  k.loft([
    { z: L * 0.5, w: 0.05, h: 0.05, n: 2 },
    { z: L * 0.44, w: 0.4, ht: 0.38, hb: 0.3, n: 2.2 },
    { z: L * 0.3, w: 0.62, ht: 0.58, hb: 0.42, n: 2.3 },
    { z: L * 0.0, w: 0.52, ht: 0.46, hb: 0.36, n: 2.4 },
    { z: -L * 0.3, w: 0.32, ht: 0.3, hb: 0.26, n: 2.4 },
    { z: -L * 0.5, w: 0.2, ht: 0.2, hb: 0.2, n: 2.2 },
  ], 0, 0, 0, col, { seg: 16, camo: 0.1, mat: mp });
  // sensor ball + antenna bulge
  k.sphere(0.3, 0, -0.55, L * 0.34, 0x1a1c1e, { camo: 0, mat: MAT.dark, seg: 10 });
  k.sphere(0.4, 0, 0.55, L * 0.2, p.light, { camo: 0, mat: mp, sy: 0.55, sz: 1.5, seg: 10 });
  // long straight wings
  for (const s of [-1, 1]) {
    k.plate([[s * 0.4, L * 0.12], [s * S / 2, L * 0.02], [s * S / 2, -L * 0.07], [s * 0.4, -L * 0.14]], 0.14, 0, 0.18, 0, col, { camo: 0.1, bevel: 0.05, mat: mp });
    for (const dx of [S * 0.18, S * 0.3]) { k.box(0.1, 0.34, 0.7, s * dx, -0.05, -L * 0.02, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 }); missile(k, s * dx, -0.35, -L * 0.02, 1.9, 0.07, p, 0xaeb0ab); }
    // inverted-V tail
    k.plate([[s * 0.15, -L * 0.42], [s * 2.2, -L * 0.5], [s * 2.2, -L * 0.56], [s * 0.15, -L * 0.56]], 0.1, 0, -0.1, 0, col, { camo: 0.1, mat: mp, rot: [0, 0, s * 0.55] });
    tm.box(0.4, 0.04, 1.0, s * S * 0.38, 0.26, -L * 0.03, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  }
  // landing gear
  k.rod(0, -0.2, L * 0.32, 0, -0.8, L * 0.32, 0.04, p.dark, { camo: 0, mat: MAT.metal, seg: 5 });
  k.drum(0.14, 0.08, 0, -0.8, L * 0.32, p.rubber, { camo: 0, mat: MAT.rubber, seg: 8 });
  // pusher propeller (spins around z)
  k.cone(0.14, 0.4, 0, 0, -L * 0.5 - 0.2, p.dark, { camo: 0, mat: MAT.metal, rot: [-PI / 2, 0, 0], seg: 8 });
  for (let i = 0; i < 3; i++) rk.plate([[-0.06, 0.1], [0.06, 0.1], [0.05, 1.3], [-0.05, 1.3]], 0.025, 0, 0, 0, 0x202224, { camo: 0, bevel: 0.005, rot: [0, 0, (i * PI * 2) / 3] });
  tm.box(0.04, 0.4, 0.9, 0, 0.4, -L * 0.5, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  return { body: k.build(), team: tm.build({ ao: false }), rotor: rk.build({ ao: false }), rotorPivot: [0, 0, -L * 0.5 - 0.35], rotorAxis: 'z', rotorSpeed: 60, height: 2, flier: true };
};

const loiter: Builder = ({ spec, pal: p, id }) => {
  // delta-wing loitering munitions (Shahed-136 style swarm)
  const n = num(spec.n, 5);
  const k = new Kit({ camo: 0.1, grime: 0.3, seed: seedOf(id), bevelMax: 0.04, ground: false });
  const tm = new Kit({ ground: false });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const ox = Math.sin(a) * 3.4, oz = Math.cos(a) * 2.4, oy = (i % 2) * 1.3;
    k.group(ox, oy, oz, [0, Math.sin(i * 2.3) * 0.15, 0], () => {
      k.loft([{ z: 1.7, w: 0.02, h: 0.02, n: 2 }, { z: 1.4, w: 0.2, h: 0.2, n: 2.2 }, { z: 0.2, w: 0.24, h: 0.24, n: 2.2 }, { z: -1.5, w: 0.18, h: 0.18, n: 2.2 }], 0, 0, 0, p.light, { seg: 12, camo: 0, mat: MAT.paint });
      k.plate([[0, 0.7], [1.5, -1.5], [-1.5, -1.5]], 0.07, 0, 0.02, 0, p.light, { camo: 0, bevel: 0.025 });
      k.box(0.05, 0.7, 0.55, 0, 0.35, -1.3, p.light, { camo: 0, bevel: 0.01 });
      k.box(0.05, 0.4, 0.4, 0.5, 0.15, -1.25, p.light, { camo: 0, bevel: 0.01, rot: [0, 0, -0.9] });
      k.box(0.05, 0.4, 0.4, -0.5, 0.15, -1.25, p.light, { camo: 0, bevel: 0.01, rot: [0, 0, 0.9] });
      k.cyl(0.1, 0.12, 0.3, 0, 0, -1.7, p.dark, { camo: 0, mat: MAT.metal, rot: [PI / 2, 0, 0], seg: 8 });
      tm.box(0.3, 0.03, 0.6, 0.6, 0.05, -0.9, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
    });
  }
  return { body: k.build(), team: tm.build({ ao: false }), height: 2, flier: true };
};

export const airBuilders: Record<string, Builder> = { jet, bomber, heli, drone, loiter };
export type { ModelData };
