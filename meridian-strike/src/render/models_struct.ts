import { MAT } from './kit';
import { PI, num, seedOf, TEAM } from './parts';
import type { Builder } from './models';
import {
  mkSite, frame, apron, windows, blockWindows, door, rollerDoor, hvac, tank, mast, dish, barrier, sandbags, barrel, container, crates,
  gable, barrel_roof, coolingTower, gantry, WARM, COOL,
} from './structparts';
import { structBuilders2 } from './models_struct2';
import { finish, dress } from './structparts';

// ====================================================================================== command centre
const command: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 34), d = num(spec.d, 34);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 3);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    k.box(w * 0.96, 1.0, d * 0.96, 0, 0.5, 0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.7, bevel: 0.15 });
    const Y = 1.0;
    if (style === 'usa') {
      // glass-and-concrete headquarters
      k.box(w * 0.46, 14, d * 0.46, 0, Y + 7, -d * 0.06, p.light, { camo: 0, mat: MAT.concrete, grime: 0.5, bevel: 0.22 });
      k.box(w * 0.42, 12.4, 0.36, 0, Y + 7.2, -d * 0.06 + d * 0.23 + 0.14, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.03 });
      for (let i = 0; i <= 8; i++) k.box(0.16, 12.6, 0.3, (i / 8 - 0.5) * w * 0.42, Y + 7.2, -d * 0.06 + d * 0.23 + 0.26, p.steel, { camo: 0, mat: MAT.steel, bevel: 0.01 });
      for (let j = 0; j <= 4; j++) k.box(w * 0.43, 0.2, 0.3, 0, Y + 1.2 + j * 3.1, -d * 0.06 + d * 0.23 + 0.26, p.steel, { camo: 0, mat: MAT.steel, bevel: 0.01 });
      for (let j = 0; j < 4; j++) gl.box(w * 0.4, 2.4, 0.02, 0, Y + 2.5 + j * 3.1, -d * 0.06 + d * 0.23 + 0.34, WARM, { camo: 0, grime: 0, bevel: 0, jitter: 0.25 });
      k.box(w * 0.5, 0.9, d * 0.5, 0, Y + 14.3, -d * 0.06, p.roof, { camo: 0, mat: MAT.steel, bevel: 0.1 });
      // low front wing
      k.box(w * 0.92, 7, d * 0.26, 0, Y + 3.5, d * 0.3, p.light, { camo: 0, mat: MAT.concrete, grime: 0.5, bevel: 0.2 });
      k.box(w * 0.94, 0.7, d * 0.28, 0, Y + 7.2, d * 0.3, p.roof, { camo: 0, mat: MAT.steel, bevel: 0.08 });
      windows(S, 0, Y + 1.2, d * 0.43 + 0.04, 0, 7, 1, 2.2, 2.6, w * 0.12, 0, WARM);
      windows(S, 0, Y + 4.2, d * 0.43 + 0.04, 0, 7, 1, 2.2, 2.2, w * 0.12, 0, WARM);
      for (const s of [-1, 1]) {
        k.box(w * 0.27, 9.5, d * 0.78, s * w * 0.31, Y + 4.75, -d * 0.02, p.light, { camo: 0, mat: MAT.concrete, grime: 0.55, bevel: 0.2 });
        k.box(w * 0.29, 0.7, d * 0.8, s * w * 0.31, Y + 9.8, -d * 0.02, p.roof, { camo: 0, mat: MAT.steel, bevel: 0.08 });
        blockWindows(S, s * w * 0.31, -d * 0.02, Y, w * 0.27, d * 0.78, 3, 3.0, 1.7, 1.7, WARM, true);
        hvac(S, s * w * 0.31, Y + 10.15, -d * 0.2, 0, true);
        hvac(S, s * w * 0.31, Y + 10.15, d * 0.1, PI / 2);
      }
      // rooftop: radome, dish, masts, helipad
      k.cyl(3.5, 3.9, 1.3, -w * 0.12, Y + 15.5, -d * 0.1, p.metal, { camo: 0, mat: MAT.steel, seg: 20 });
      k.sphere(3.3, -w * 0.12, Y + 16.2, -d * 0.1, p.light, { camo: 0, grime: 0.3, mat: MAT.steel, seg: 20 });
      mast(S, w * 0.14, Y + 14.7, -d * 0.2, 14);
      mast(S, w * 0.08, Y + 14.7, -d * 0.02, 8, false);
      dish(S, w * 0.31, Y + 10.9, d * 0.18, 1.9, -0.7, 0.5);
      tm.cyl(4.6, 4.6, 0.16, -w * 0.31, Y + 10.2, d * 0.2, TEAM, { camo: 0, grime: 0, seg: 28, bevel: 0.02 });
      k.cyl(3.4, 3.4, 0.2, -w * 0.31, Y + 10.25, d * 0.2, p.dark, { camo: 0, mat: MAT.asphalt, seg: 28, bevel: 0.01 });
      k.box(1.4, 0.05, 0.4, -w * 0.31, Y + 10.4, d * 0.2, p.light, { camo: 0, grime: 0.2, bevel: 0 });
      // portico
      k.box(w * 0.32, 0.7, 5.2, 0, Y + 5.6, d * 0.43 + 2.5, p.light, { camo: 0, mat: MAT.concrete, bevel: 0.1 });
      for (const cx of [-1, -0.33, 0.33, 1]) k.cyl(0.5, 0.52, 5.4, cx * w * 0.14, Y + 2.7, d * 0.43 + 4.5, p.light, { camo: 0, mat: MAT.concrete, seg: 14 });
      for (let i = 0; i < 3; i++) k.box(w * 0.34, 0.3, 1.6, 0, Y - 0.15 + i * 0.01 + (2 - i) * 0.0, d * 0.43 + 4.8 + i * 1.3, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.05 });
      door(S, 0, Y, d * 0.43 + 0.05, 0, 5.2, 4.0);
      tm.box(w * 0.34, 0.8, 0.3, 0, Y + 6.2, d * 0.43 + 5.2, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    } else if (style === 'china') {
      // hall of the central committee: stepped terrace, red columns, double hip roof
      k.box(w * 0.86, 0.8, d * 0.86, 0, Y + 0.4, 0, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.1 });
      for (let i = 0; i < 4; i++) k.box(w * 0.3, 0.25, 1.4, 0, Y + 0.12 + (3 - i) * 0.0 - i * 0.0, d * 0.43 + 0.9 + i * 0.0, p.concrete, { camo: 0, mat: MAT.concrete });
      const H = 8.5, YB = Y + 0.8;
      k.box(w * 0.5, H, d * 0.5, 0, YB + H / 2, 0, 0xc9bfa3, { camo: 0, mat: MAT.plaster, grime: 0.5, bevel: 0.15 });
      for (let i = 0; i < 8; i++) {
        const cx = (i / 7 - 0.5) * w * 0.46;
        k.cyl(0.5, 0.55, H, cx, YB + H / 2, d * 0.25 + 1.3, p.accent, { camo: 0, grime: 0.4, seg: 14, mat: MAT.paint });
        k.box(1.3, 0.5, 0.7, cx, YB + H - 0.3, d * 0.25 + 1.3, p.trim, { camo: 0, bevel: 0.05 });
      }
      k.box(w * 0.54, 0.7, 3.0, 0, YB + H + 0.1, d * 0.25 + 1.3, p.trim, { camo: 0, grime: 0.3, bevel: 0.06 });
      windows(S, 0, YB + 1.5, d * 0.25 + 0.04, 0, 5, 1, 2.2, 3.4, w * 0.085, 0, WARM, p.accent);
      door(S, 0, YB, d * 0.25 + 0.05, 0, 4.4, 5.2);
      // roofs
      k.box(w * 0.74, 0.6, d * 0.74, 0, YB + H + 0.1, 0, p.trim, { camo: 0, grime: 0.4, bevel: 0.08 });
      k.taper(w * 0.76, w * 0.3, 4.6, d * 0.76, d * 0.3, 0, YB + H + 0.4 + 2.3, 0, p.roof, { camo: 0, grime: 0.5, mat: MAT.tile, bevel: 0.15 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.sphere(0.35, sx * w * 0.37, YB + H + 0.9, sz * d * 0.37, p.trim, { camo: 0, mat: MAT.metal, seg: 8, sy: 0.7 });
      k.box(w * 0.28, 4.4, d * 0.28, 0, YB + H + 4.6 + 2.2, 0, 0xc9bfa3, { camo: 0, mat: MAT.plaster, bevel: 0.12 });
      k.box(w * 0.34, 0.5, d * 0.34, 0, YB + H + 4.6 + 0.2, 0, p.trim, { camo: 0, bevel: 0.05 });
      k.taper(w * 0.36, w * 0.06, 3.4, d * 0.36, d * 0.06, 0, YB + H + 4.6 + 4.4 + 1.9, 0, p.roof, { camo: 0, grime: 0.5, mat: MAT.tile, bevel: 0.12 });
      k.sphere(0.55, 0, YB + H + 4.6 + 4.4 + 3.9, 0, p.trim, { camo: 0, mat: MAT.metal, seg: 10 });
      k.cyl(0.08, 0.08, 1.4, 0, YB + H + 4.6 + 4.4 + 4.8, 0, p.trim, { camo: 0, mat: MAT.metal, seg: 6 });
      // wings
      for (const s of [-1, 1]) {
        k.box(w * 0.22, 6, d * 0.58, s * w * 0.37, YB + 3, 0, 0xc9bfa3, { camo: 0, mat: MAT.plaster, grime: 0.5, bevel: 0.15 });
        k.box(w * 0.28, 0.5, d * 0.66, s * w * 0.37, YB + 6.1, 0, p.trim, { camo: 0, bevel: 0.06 });
        k.taper(w * 0.3, w * 0.06, 3, d * 0.64, d * 0.06, s * w * 0.37, YB + 6.35 + 1.5, 0, p.roof, { camo: 0, grime: 0.5, mat: MAT.tile, bevel: 0.12 });
        blockWindows(S, s * w * 0.37, 0, YB, w * 0.22, d * 0.58, 1, 3, 1.5, 2.2, WARM, false);
        for (let i = 0; i < 3; i++) k.cyl(0.38, 0.4, 6, s * w * 0.37 + (i - 1) * 3, YB + 3, d * 0.29 + 0.9, p.accent, { camo: 0, seg: 12, grime: 0.4 });
      }
      tm.box(w * 0.5, 0.9, 0.25, 0, YB + H - 1.2, d * 0.25 + 3.0, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
      mast(S, w * 0.3, YB + 6.3, -d * 0.2, 12);
      dish(S, -w * 0.32, YB + 7.4, -d * 0.1, 1.8, -0.6, -0.5);
    } else {
      // fortified command bunker: sandstone mass, dome, minaret mast
      k.box(w * 0.86, 8, d * 0.62, 0, Y + 4, 0, p.concrete, { camo: 0, mat: MAT.plaster, grime: 0.7, bevel: 0.25 });
      k.taper(w * 0.9, w * 0.86, 1.4, d * 0.66, d * 0.62, 0, Y + 0.7, 0, p.concrete, { camo: 0, mat: MAT.plaster, grime: 0.8 });
      k.box(w * 0.9, 0.9, d * 0.66, 0, Y + 8.4, 0, p.light, { camo: 0, mat: MAT.plaster, grime: 0.6, bevel: 0.1 });
      for (let i = 0; i < 12; i++) k.box(1.4, 0.8, 0.8, (i / 11 - 0.5) * w * 0.86, Y + 9.2, d * 0.31, p.concrete, { camo: 0, mat: MAT.plaster, bevel: 0.05 }); // crenellations
      for (let i = 0; i < 12; i++) k.box(1.4, 0.8, 0.8, (i / 11 - 0.5) * w * 0.86, Y + 9.2, -d * 0.31, p.concrete, { camo: 0, mat: MAT.plaster, bevel: 0.05 });
      k.cyl(w * 0.2, w * 0.23, 3.4, 0, Y + 10.4, -d * 0.02, p.concrete, { camo: 0, mat: MAT.plaster, grime: 0.6, seg: 24 });
      k.torus(w * 0.2, 0.3, 0, Y + 12.1, -d * 0.02, p.trim, { camo: 0, mat: MAT.tile, seg: 24 });
      k.sphere(w * 0.2, 0, Y + 12.1, -d * 0.02, p.trim, { camo: 0, grime: 0.3, mat: MAT.tile, sy: 0.82, seg: 24 });
      k.cyl(0.12, 0.2, 2.6, 0, Y + 15.8, -d * 0.02, p.metal, { camo: 0, mat: MAT.metal, seg: 8 });
      k.sphere(0.35, 0, Y + 17.2, -d * 0.02, 0xd4af37, { camo: 0, mat: MAT.metal, seg: 8 });
      // arched windows / doorway
      for (let i = 0; i < 5; i++) {
        const x = (i / 4 - 0.5) * w * 0.7;
        k.box(2.0, 3.0, 0.4, x, Y + 4.5, d * 0.31 + 0.05, p.dark, { camo: 0, mat: MAT.glass, grime: 0.3, bevel: 0.03 });
        k.cyl(1.0, 1.0, 0.4, x, Y + 6.0, d * 0.31 + 0.05, p.dark, { camo: 0, mat: MAT.glass, grime: 0.3, rot: [PI / 2, 0, 0], seg: 12 });
        k.box(2.5, 0.25, 0.7, x, Y + 2.9, d * 0.31 + 0.2, p.light, { camo: 0, mat: MAT.plaster, bevel: 0.04 });
        gl.box(1.5, 3.4, 0.02, x, Y + 4.7, d * 0.31 + 0.27, WARM, { camo: 0, grime: 0, bevel: 0 });
      }
      door(S, 0, Y, d * 0.31 + 0.05, 0, 5, 3.8);
      // corner minarets
      for (const s of [-1, 1]) {
        k.cyl(0.8, 1.05, 15, s * (w * 0.44), Y + 7.5, d * 0.28, p.concrete, { camo: 0, mat: MAT.plaster, grime: 0.6, seg: 14 });
        k.torus(1.0, 0.25, s * (w * 0.44), Y + 12.5, d * 0.28, p.trim, { camo: 0, mat: MAT.tile, seg: 14 });
        k.sphere(0.9, s * (w * 0.44), Y + 15.4, d * 0.28, p.trim, { camo: 0, mat: MAT.tile, sy: 1.1, seg: 12 });
        k.cone(0.2, 1.6, s * (w * 0.44), Y + 17, d * 0.28, 0xd4af37, { camo: 0, mat: MAT.metal, seg: 8 });
      }
      mast(S, w * 0.28, Y + 8.9, -d * 0.18, 14);
      dish(S, -w * 0.3, Y + 9.8, -d * 0.2, 1.6, -0.7, 0.4);
      hvac(S, w * 0.2, Y + 9.0, d * 0.05, 0);
      sandbags(S, -w * 0.18, Y - 0.6, d * 0.4 + 0.5, 6, 0, 3);
      sandbags(S, w * 0.18, Y - 0.6, d * 0.4 + 0.5, 6, 0, 3);
      tm.box(w * 0.5, 0.8, 0.25, 0, Y + 7.5, d * 0.31 + 0.5, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
      tm.cyl(2.4, 2.4, 0.15, w * 0.2, Y + 9.25, -d * 0.2, TEAM, { camo: 0, grime: 0, seg: 20, bevel: 0.01 });
    }
  });
  dress(S);
  return finish(S, 22);
};

// ====================================================================================== power plant / reactor
const reactor: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 20), d = num(spec.d, 20);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 2.4);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    k.box(w * 0.98, 0.6, d * 0.98, 0, 0.3, 0, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.1 });
    if (style === 'china') {
      coolingTower(S, -w * 0.22, -d * 0.18, w * 0.2, 15, p.concrete);
      coolingTower(S, w * 0.16, -d * 0.24, w * 0.17, 12.5, p.concrete);
    } else {
      coolingTower(S, -w * 0.18, -d * 0.1, w * 0.26, style === 'usa' ? 17 : 14, p.concrete);
    }
    // containment building: dome on a drum
    const cx = w * 0.2, cz = d * 0.12;
    k.cyl(w * 0.17, w * 0.18, 5.2, cx, 3.2, cz, p.light, { camo: 0, mat: MAT.concrete, grime: 0.55, seg: 24 });
    k.sphere(w * 0.17, cx, 5.8, cz, p.light, { camo: 0, mat: MAT.concrete, grime: 0.5, sy: 0.8, seg: 24 });
    for (let i = 0; i < 3; i++) k.torus(w * 0.175, 0.09, cx, 1.5 + i * 1.6, cz, p.dark, { camo: 0, mat: MAT.concrete, seg: 24 });
    // turbine hall
    k.box(w * 0.5, 4.2, d * 0.28, w * 0.04, 2.9, d * 0.34, p.main, { camo: 0.2, mat: MAT.concrete, grime: 0.6, bevel: 0.18 });
    gable(S, w * 0.5, d * 0.28, 1.4, 5.0, p.roof, MAT.ribZ, 0.4, w * 0.04, d * 0.34);
    for (let i = 0; i < 4; i++) k.box(0.8, 0.4, d * 0.28, w * 0.04 - w * 0.19 + i * w * 0.126, 5.0, d * 0.34, p.dark, { camo: 0, bevel: 0.03, mat: MAT.dark });
    blockWindows(S, w * 0.04, d * 0.34, 0.3, w * 0.5, d * 0.28, 1, 2.6, 1.3, 1.4, COOL, false);
    // pipework + transformers
    for (let i = 0; i < 3; i++) {
      const tx = -w * 0.38, tz = d * 0.1 + i * 2.8;
      k.box(2.0, 1.8, 1.8, tx, 1.2, tz, p.light, { camo: 0, mat: MAT.steel, grime: 0.6, bevel: 0.08 });
      for (let f = 0; f < 6; f++) k.box(0.1, 1.5, 1.7, tx + 1.05 + f * 0.0, 1.2, tz, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.01 });
      for (const s of [-0.5, 0, 0.5]) k.cyl(0.14, 0.17, 0.7, tx + s * 1.1, 2.4, tz, p.light, { camo: 0, mat: MAT.concrete, seg: 8 });
    }
    k.sweep([[cx - w * 0.17, 3.6, cz], [cx - w * 0.3, 3.6, cz + 1], [-w * 0.18 + 2, 2.4, d * 0.1], [-w * 0.18 + 2, 1.5, -d * 0.1]], 0.45, p.steel, { mat: MAT.steel, camo: 0, grime: 0.5, seg: 10 });
    mast(S, w * 0.42, 0.6, d * 0.42, 10);
    gl.cyl(w * 0.04, w * 0.04, 0.2, cx, 8.8, cz, 0x6be3ff, { camo: 0, grime: 0, seg: 12 });
    gl.box(0.6, 0.6, 0.1, w * 0.04, 3.2, d * 0.49, 0x7dff9a, { camo: 0, grime: 0, bevel: 0 });
    tm.box(w * 0.4, 0.4, 0.3, w * 0.04, 4.7, d * 0.49 + 0.25, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.cyl(w * 0.1, w * 0.1, 0.1, cx, 8.8, cz, TEAM, { camo: 0, grime: 0, seg: 16 });
    door(S, w * 0.04, 0.6, d * 0.48 + 0.05, 0, 3.2, 3.4);
  });
  dress(S, true, true);
  return finish(S, 20);
};

// ====================================================================================== supply centre / depot
const depotbuilding: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 30), d = num(spec.d, 26);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 2.8);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const hw = w * 0.62, hd = d * 0.7;
    const wallCol = style === 'china' ? 0xc9bfa3 : style === 'iran' ? p.concrete : p.light;
    k.box(hw, 6.5, hd, -w * 0.12, 3.25, 0, wallCol, { camo: 0, mat: MAT.concrete, grime: 0.55, bevel: 0.2 });
    if (style === 'china') {
      gable(S, hw, hd, 3.0, 6.5, p.roof, MAT.tile, 0.8, -w * 0.12, 0);
    } else if (style === 'iran') {
      k.box(hw + 0.8, 0.8, hd + 0.8, -w * 0.12, 6.9, 0, p.concrete, { camo: 0, mat: MAT.plaster, bevel: 0.1 });
      for (let i = 0; i < 3; i++) k.sphere(2.2, -w * 0.12 + (i - 1) * hw * 0.3, 7.3, -hd * 0.1, p.concrete, { camo: 0, mat: MAT.plaster, sy: 0.8, seg: 14 });
    } else {
      barrel_roof(S, hw, hd, 3.2, 6.5, p.metal, MAT.ribX, -w * 0.12, 0);
    }
    // loading bay doors + canopy
    for (let i = 0; i < 3; i++) rollerDoor(S, -w * 0.12 + (i - 1) * hw * 0.3, 0, hd / 2 + 0.06, 0, hw * 0.24, 4.6, p.metal);
    k.box(hw * 0.96, 0.4, 3.0, -w * 0.12, 5.7, hd / 2 + 1.5, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.05 });
    for (const s of [-1, 1]) k.box(0.3, 5.5, 0.3, -w * 0.12 + s * hw * 0.47, 2.9, hd / 2 + 2.8, p.steel, { camo: 0, mat: MAT.steel, bevel: 0.03 });
    windows(S, -w * 0.12, 4.5, hd / 2 + 0.04, 0, 6, 1, 1.4, 1.1, hw * 0.16, 0, WARM);
    blockWindows(S, -w * 0.12, 0, 0.3, hw, hd, 1, 4.5, 1.4, 1.1, WARM, true);
    // yard: containers, crates, barrels, gantry
    const cc = style === 'china' ? [0x7a2f26, 0x2f4a6a, 0x4d5d3b] : style === 'iran' ? [0x2b5a7a, 0x8a4a2e, 0x4f5f3a] : [0x3b5e8a, 0x8a3b2e, 0x4a5a3a];
    for (let i = 0; i < 3; i++) container(S, w * 0.34, 0, -d * 0.25 + i * 3.0, 0, cc[i % 3]);
    container(S, w * 0.34, 2.5, -d * 0.1, 0, cc[1]);
    container(S, w * 0.34, 2.5, -d * 0.25, 0.04, cc[0]);
    crates(S, -w * 0.4, d * 0.34, 9, 3);
    for (let i = 0; i < 4; i++) barrel(S, w * 0.3 + (i % 2) * 0.8, 0, d * 0.3 + Math.floor(i / 2) * 0.8, [0x3a4f6a, 0x7a3a2e, 0x4a5a3a][i % 3]);
    gantry(S, w * 0.24, d * 0.18, 8, 7, 12);
    tank(S, -w * 0.4, 0, -d * 0.3, 2.2, 4.5);
    gl.box(0.7, 0.4, 0.1, -w * 0.12, 5.2, hd / 2 + 0.1, 0xffc86a, { camo: 0, grime: 0, bevel: 0 });
    tm.box(hw * 0.8, 0.7, 0.3, -w * 0.12, 6.0, hd / 2 + 3.1, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(0.3, 0.7, hd * 0.8, -w * 0.12 + hw / 2 + 0.25, 5.0, 0, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
  });
  dress(S);
  return finish(S, 14);
};

// ====================================================================================== barracks / armory / factory
const barracks: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 26), d = num(spec.d, 20);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 2.6);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const wallCol = style === 'china' ? 0xc9bfa3 : style === 'iran' ? p.concrete : p.main;
    // two long dormitory blocks around a covered entrance
    for (const s of [-1, 1]) {
      const bx = s * w * 0.27, bw = w * 0.44, bd = d * 0.82;
      k.box(bw, 4.6, bd, bx, 2.3, 0, wallCol, { camo: style === 'usa' ? 0.5 : 0, mat: MAT.concrete, grime: 0.6, bevel: 0.18 });
      if (style === 'china') gable(S, bw, bd, 2.6, 4.6, p.roof, MAT.tile, 0.9, bx, 0);
      else if (style === 'iran') { k.box(bw + 0.6, 0.7, bd + 0.6, bx, 4.95, 0, p.light, { camo: 0, mat: MAT.plaster, bevel: 0.08 }); for (let i = 0; i < 2; i++) k.sphere(1.6, bx, 5.3, -bd * 0.25 + i * bd * 0.5, p.concrete, { camo: 0, mat: MAT.plaster, sy: 0.8, seg: 12 }); }
      else gable(S, bw, bd, 2.0, 4.6, p.metal, MAT.ribZ, 0.6, bx, 0);
      blockWindows(S, bx, 0, 0.3, bw, bd, 1, 2.8, 1.2, 1.5, WARM, true);
      windows(S, bx, 1.4, bd / 2 + 0.04, 0, 3, 1, 1.2, 1.6, bw * 0.28, 0, WARM);
      hvac(S, bx + s * bw * 0.2, 4.6, -bd * 0.2, 0);
    }
    k.box(w * 0.18, 3.6, d * 0.7, 0, 1.8, 0.0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.15 });
    k.box(w * 0.3, 0.5, d * 0.88 + 0.2, 0, 4.2, 0, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.06 });
    door(S, 0, 0, d * 0.35 + 0.05, 0, 4.2, 3.4);
    for (let i = 0; i < 3; i++) sandbags(S, (i - 1) * 4.2, 0, d * 0.5 + 1.0, 3.2, 0, 2);
    // tents / equipment on the flank
    for (let i = 0; i < 2; i++) { k.prism([[-1.6, 0], [1.6, 0], [0, 2.0]], 3.4, w * 0.34, 0.2, -d * 0.3 + i * 4.2, p.canvas, { camo: 0.3, grime: 0.6, mat: MAT.cloth, bevel: 0.04 }); }
    crates(S, -w * 0.44, d * 0.3, 4, 7);
    tm.box(w * 0.4, 0.6, 0.3, 0, 3.5, d * 0.35 + 0.35, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(0.3, 0.6, d * 0.7, w * 0.5 + 0.2, 3.9, 0, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    gl.box(2.4, 0.3, 0.05, 0, 3.6, d * 0.35 + 0.35, 0xfff0b8, { camo: 0, grime: 0, bevel: 0 });
  });
  dress(S);
  return finish(S, 12);
};

const armory: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 28), d = num(spec.d, 22);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 2.6);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const wallCol = style === 'china' ? p.concrete : style === 'iran' ? p.concrete : p.main;
    // hardened block with sloped (battered) base
    k.taper(w * 0.9, w * 0.84, 1.6, d * 0.86, d * 0.8, 0, 0.8, 0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.8 });
    k.box(w * 0.84, 6.0, d * 0.8, 0, 4.6, 0, wallCol, { camo: style === 'usa' ? 0.5 : 0.3, mat: MAT.concrete, grime: 0.6, bevel: 0.25 });
    k.box(w * 0.9, 0.9, d * 0.86, 0, 7.8, 0, p.dark, { camo: 0, mat: MAT.concrete, grime: 0.7, bevel: 0.1 });
    if (style === 'china') for (let i = 0; i < 2; i++) { k.taper(w * 0.9, w * 0.5, 2.0, d * 0.86, d * 0.5, 0, 9.2, 0, p.roof, { camo: 0, mat: MAT.tile, grime: 0.5, bevel: 0.1 }); break; }
    // blast doors
    for (const s of [-1, 1]) rollerDoor(S, s * w * 0.2, 0, d * 0.4 + 0.1, 0, w * 0.26, 4.8, p.steel);
    k.box(w * 0.12, 3.0, 0.5, 0, 1.5, d * 0.4 + 0.1, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.05 });
    windows(S, 0, 5.4, d * 0.4 + 0.04, 0, 5, 1, 1.4, 0.9, w * 0.16, 0, WARM);
    // roof weapon pit, AA gun, radar, aerials
    k.cyl(1.9, 2.1, 0.7, w * 0.25, 8.45, -d * 0.1, p.concrete, { camo: 0, mat: MAT.concrete, seg: 14 });
    k.box(0.9, 0.7, 1.4, w * 0.25, 9.0, -d * 0.1 + 0.4, p.main, { camo: 0.5, bevel: 0.05 });
    k.pipe(0.08, 2.4, w * 0.25, 9.1, -d * 0.1 + 1.8, p.metal, { mat: MAT.metal, seg: 8 });
    k.pipe(0.08, 2.4, w * 0.25 + 0.3, 9.1, -d * 0.1 + 1.8, p.metal, { mat: MAT.metal, seg: 8 });
    mast(S, -w * 0.3, 8.3, -d * 0.25, 10);
    hvac(S, -w * 0.12, 8.3, d * 0.15, 0, true);
    hvac(S, w * 0.05, 8.3, -d * 0.2, PI / 2);
    for (let i = 0; i < 4; i++) crates(S, -w * 0.42, d * 0.1 + i * 2.5, 2, i + 3);
    sandbags(S, w * 0.4, 0, d * 0.42, 8, 0.0, 3);
    barrier(S, -w * 0.3, d * 0.5 + 0.8, 8, 0);
    tm.box(w * 0.6, 0.7, 0.3, 0, 7.0, d * 0.4 + 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(0.3, 0.7, d * 0.5, w * 0.42 + 0.2, 7.0, 0, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    gl.box(0.5, 0.3, 0.05, w * 0.3, 7.0, d * 0.4 + 0.2, 0xff6a3a, { camo: 0, grime: 0, bevel: 0 });
  });
  dress(S);
  return finish(S, 14);
};

const factory: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 36), d = num(spec.d, 30);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 3);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const wallCol = style === 'china' ? p.concrete : style === 'iran' ? p.concrete : p.light;
    const hw = w * 0.78, hd = d * 0.66;
    k.box(hw, 9.5, hd, -w * 0.06, 4.75, -d * 0.04, wallCol, { camo: 0, mat: MAT.ribZ, grime: 0.6, bevel: 0.2 });
    k.box(hw + 0.4, 0.5, hd + 0.4, -w * 0.06, 9.7, -d * 0.04, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.05 });
    // sawtooth roof
    for (let i = 0; i < 4; i++) {
      const rz = -d * 0.04 - hd / 2 + (i + 0.5) * (hd / 4);
      k.prism([[-hw / 2 - 0.3, 0], [hw / 2 + 0.3, 0], [hw / 2 + 0.3, 2.6]], hd / 4 - 0.1, -w * 0.06, 9.95, rz, style === 'china' ? p.roof : p.metal, { camo: 0, mat: MAT.ribX, grime: 0.6, bevel: 0.06, rot: [0, 0, 0] });
      k.box(0.2, 1.6, hd / 4 - 0.2, -w * 0.06 + hw / 2 + 0.3, 10.8, rz, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.01 });
    }
    // big front doors
    for (const s of [-1, 1]) rollerDoor(S, -w * 0.06 + s * hw * 0.24, 0, -d * 0.04 + hd / 2 + 0.08, 0, hw * 0.34, 7.2, p.steel);
    windows(S, -w * 0.06, 7.4, -d * 0.04 + hd / 2 + 0.04, 0, 8, 1, 1.5, 1.2, hw * 0.115, 0, 0xffb860);
    blockWindows(S, -w * 0.06, -d * 0.04, 0.3, hw, hd, 1, 7, 1.5, 1.2, 0xffb860, true);
    // chimney stack + exhaust glow
    k.cyl(1.1, 1.6, 17, w * 0.3, 8.5, -d * 0.3, p.concrete, { camo: 0, mat: MAT.brick, grime: 0.8, seg: 18 });
    k.torus(1.15, 0.12, w * 0.3, 16.6, -d * 0.3, p.dark, { camo: 0, seg: 18 });
    gl.cyl(0.95, 0.95, 0.3, w * 0.3, 17.1, -d * 0.3, 0xff7a3a, { camo: 0, grime: 0, seg: 14 });
    k.cyl(0.6, 0.6, 12, w * 0.22, 6, -d * 0.3, p.steel, { camo: 0, mat: MAT.steel, grime: 0.7, seg: 12 });
    // annex + storage tanks + pipe rack + crane
    k.box(w * 0.2, 5, d * 0.34, w * 0.36, 2.5, d * 0.14, p.main, { camo: 0.2, mat: MAT.ribZ, grime: 0.6, bevel: 0.15 });
    gable(S, w * 0.2, d * 0.34, 1.2, 5, p.metal, MAT.ribZ, 0.4, w * 0.36, d * 0.14);
    tank(S, -w * 0.4, 0, d * 0.3, 2.4, 6);
    tank(S, -w * 0.4 + 5.4, 0, d * 0.34, 2.4, 6, p.alt);
    k.sweep([[-w * 0.4, 6.8, d * 0.3], [-w * 0.4, 8, d * 0.2], [-w * 0.2, 8, d * 0.1], [-w * 0.06 + hw / 2, 8, d * 0.0]], 0.35, p.steel, { mat: MAT.steel, camo: 0, grime: 0.6, seg: 8 });
    gantry(S, -w * 0.06, d * 0.26 + 1, hw * 0.5, 7, 6);
    for (let i = 0; i < 3; i++) container(S, w * 0.4, 0, d * 0.34 - i * 2.8 - 5, 0, [0x7a2f26, 0x2f4a6a, 0x4d5d3b][i], 5, 2.4, 2.2);
    crates(S, -w * 0.18, d * 0.42, 6, 5);
    tm.box(hw * 0.7, 0.8, 0.3, -w * 0.06, 8.9, -d * 0.04 + hd / 2 + 0.35, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(0.3, 0.8, hd * 0.7, -w * 0.06 + hw / 2 + 0.35, 8.9, -d * 0.04, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
  });
  dress(S);
  return finish(S, 20);
};

export const structBuilders: Record<string, Builder> = { command, reactor, depotbuilding, barracks, armory, factory, ...structBuilders2 };
