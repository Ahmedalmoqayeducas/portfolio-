import { Kit, MAT } from './kit';
import { PI, num, seedOf, TEAM, hull2 } from './parts';
import type { Builder } from './models';
import {
  mkSite, frame, apron, windows, blockWindows, door, rollerDoor, hvac, tank, mast, dish, flagpole, lamp, barrier, sandbags, barrel, container, crates,
  gable, barrel_roof, WARM, COOL, Site, finish, dress,
} from './structparts';
import { mulberry32 } from '../procgen/noise';

// ====================================================================================== airfield
const airfield: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 60), d = num(spec.d, 40);
  const S = mkSite(p, style, seedOf(id), w, d, 0.5);
  const asph = 0x3c3e40;
  apron(S, w, d, 1.2, asph);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    // runway markings
    for (let i = 0; i < 9; i++) k.box(4.5, 0.05, 0.55, -w * 0.4 + i * (w * 0.8) / 8, 0.03, d * 0.12, p.light, { camo: 0, grime: 0.25, mat: MAT.asphalt, bevel: 0.005 });
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) k.box(0.7, 0.05, 3.2, s * (w * 0.46), 0.03, d * 0.12 + (i - 3) * 1.1, p.light, { camo: 0, grime: 0.3, mat: MAT.asphalt, bevel: 0.005 });
      k.box(w * 0.92, 0.05, 0.3, 0, 0.03, d * 0.12 + s * (d * 0.2), p.light, { camo: 0, grime: 0.3, mat: MAT.asphalt, bevel: 0.005 });
    }
    for (let i = 0; i < 14; i++) for (const s of [-1, 1]) gl.box(0.4, 0.2, 0.4, -w * 0.45 + i * (w * 0.9) / 13, 0.15, d * 0.12 + s * d * 0.28, 0xff9a3a, { camo: 0, grime: 0, bevel: 0 });
    // hangar
    const hx = -w * 0.27, hz = -d * 0.28, hw = w * 0.36, hd = d * 0.32;
    k.box(hw, 6.2, hd, hx, 3.1, hz, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.2 });
    barrel_roof(S, hw + 0.8, hd + 0.8, 3.4, 6.2, p.metal, MAT.ribX, hx, hz);
    k.box(hw * 0.84, 5.2, 0.5, hx, 2.6, hz + hd / 2 + 0.1, p.dark, { camo: 0, mat: MAT.dark, grime: 0.6, bevel: 0.08 });
    for (let i = 0; i < 4; i++) k.box(0.15, 5.0, 0.2, hx - hw * 0.34 + i * hw * 0.226, 2.6, hz + hd / 2 + 0.4, p.steel, { camo: 0, mat: MAT.metal, bevel: 0.02 });
    for (const s of [-1, 1]) k.box(1.4, 6.0, 0.3, hx + s * (hw * 0.5 + 0.05), 3.0, hz + hd / 2, p.trim, { camo: 0, bevel: 0.05 });
    gl.box(hw * 0.6, 0.25, 0.06, hx, 5.4, hz + hd / 2 + 0.4, 0xfff0c0, { camo: 0, grime: 0, bevel: 0 });
    tm.box(hw * 0.8, 0.8, 0.3, hx, 7.0, hz + hd / 2 + 0.4, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    // control tower
    const tx = w * 0.36, tz = -d * 0.3;
    k.cyl(1.8, 2.2, 11, tx, 5.5, tz, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, seg: 10 });
    k.box(5.4, 0.5, 5.4, tx, 11.2, tz, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.05 });
    k.box(5.0, 2.4, 5.0, tx, 12.6, tz, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.05 });
    gl.box(4.6, 2.0, 4.6, tx, 12.6, tz, 0xa0e4ff, { camo: 0, grime: 0, bevel: 0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.2, 2.4, 0.2, tx + sx * 2.5, 12.6, tz + sz * 2.5, p.steel, { camo: 0, mat: MAT.steel, bevel: 0.02 });
    k.box(5.8, 0.4, 5.8, tx, 14.0, tz, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.05 });
    dish(S, tx - 1.4, 14.5, tz, 1.1, -0.9, 0.5);
    mast(S, tx + 1.8, 14.2, tz + 1.4, 6);
    // fuel farm + windsock
    tank(S, w * 0.4, 0, d * 0.3, 2.3, 5.2, p.light);
    tank(S, w * 0.4 - 5.6, 0, d * 0.32, 2.3, 5.2, p.light);
    k.cyl(0.1, 0.12, 6, w * 0.46, 3, -d * 0.1, p.light, { camo: 0, mat: MAT.steel, seg: 6 });
    k.cone(0.45, 1.8, w * 0.46 + 0.9, 5.7, -d * 0.1, 0xe8571c, { camo: 0, mat: MAT.cloth, seg: 8, rot: [0, 0, -PI / 2 + 0.1] });
    // parking pads
    for (let i = 0; i < 2; i++) { k.cyl(3.4, 3.4, 0.05, w * 0.1 + i * 9, 0.04, -d * 0.28, 0x2f3133, { camo: 0, mat: MAT.asphalt, seg: 20, bevel: 0 }); k.torus(3.3, 0.07, w * 0.1 + i * 9, 0.08, -d * 0.28, 0xd9d4a0, { camo: 0, seg: 20 }); }
    for (let i = 0; i < 5; i++) barrier(S, -w * 0.45 + i * 3, d * 0.48, 2.6, 0);
    tm.box(w * 0.3, 0.12, 2.6, 0, 0.12, d * 0.46, TEAM, { camo: 0, grime: 0, bevel: 0 });
  });
  flagpole(S, w * 0.45, 0.36, d * 0.46, 10);
  return finish(S, 16);
};

// ====================================================================================== radar
const radar: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 20), d = num(spec.d, 20);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 2.4);
  const rk = new Kit({ camo: 0, grime: 0.35, seed: 4, bevelMax: 0.08, ground: false });
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const wallCol = style === 'china' ? 0xc9bfa3 : style === 'iran' ? p.concrete : p.light;
    k.box(w * 0.7, 4.4, d * 0.6, 0, 2.2, d * 0.1, wallCol, { camo: 0, mat: MAT.concrete, grime: 0.55, bevel: 0.18 });
    k.box(w * 0.74, 0.5, d * 0.64, 0, 4.6, d * 0.1, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.05 });
    blockWindows(S, 0, d * 0.1, 0.3, w * 0.7, d * 0.6, 1, 3.0, 1.2, 1.4, COOL, false);
    door(S, 0, 0, d * 0.4 + 0.05, 0, 3, 3.2);
    // tower shaft
    k.taper(w * 0.26, w * 0.16, 9, w * 0.26, w * 0.16, 0, 9.1, -d * 0.12, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.14 });
    for (let i = 0; i < 4; i++) k.box(w * 0.2, 0.2, w * 0.2, 0, 3.0 + i * 2.2, -d * 0.12, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
    k.cyl(w * 0.2, w * 0.2, 0.9, 0, 13.9, -d * 0.12, p.metal, { camo: 0, mat: MAT.steel, seg: 18 });
    // equipment
    hvac(S, w * 0.18, 4.9, d * 0.2, 0, true);
    hvac(S, -w * 0.2, 4.9, d * 0.2, PI / 2);
    for (let i = 0; i < 3; i++) dish(S, -w * 0.3 + i * 0.01, 5.0 + 0.0, d * 0.05 - i * 2.4, 0.9, -0.6, -PI / 2 + 0.3 * i);
    mast(S, w * 0.34, 4.9, -d * 0.25, 9);
    gl.box(0.7, 0.4, 0.1, 0, 2.5, d * 0.4 + 0.1, 0x7dff9a, { camo: 0, grime: 0, bevel: 0 });
    gl.box(0.3, 0.3, 0.3, 0, 14.6, -d * 0.12, 0xff3b2a, { camo: 0, grime: 0, bevel: 0 });
    tm.box(w * 0.5, 0.4, 0.3, 0, 3.9, d * 0.4 + 0.35, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    sandbags(S, w * 0.3, 0, d * 0.42, 5, 0, 2);
    crates(S, -w * 0.32, d * 0.38, 3, 5);
  });
  // rotating antenna (separate geometry): dish / phased array
  if (style === 'china') {
    for (const s of [-1, 1]) rk.box(w * 0.5, w * 0.34, 0.5, 0, w * 0.18, s * 0.6, p.light, { camo: 0, grime: 0.3, mat: MAT.steel, bevel: 0.05 });
    rk.box(w * 0.46, 0.4, 0.4, 0, w * 0.02, 0, p.dark, { camo: 0, mat: MAT.dark });
    for (let i = 0; i < 5; i++) rk.box(0.1, w * 0.3, 0.1, (i - 2) * w * 0.1, w * 0.18, 0.95, p.dark, { camo: 0, mat: MAT.dark, bevel: 0 });
  } else {
    const r = w * 0.4;
    const prof: [number, number][] = [[0, 0.02]];
    for (let i = 1; i <= 10; i++) { const t = i / 10; prof.push([r * t, r * 0.18 * t * t]); }
    rk.lathe(prof, 0, w * 0.22, 0.6, p.light, { camo: 0, grime: 0.3, seg: 28, rot: [PI / 2 - 0.2, 0, 0], mat: MAT.steel });
    rk.rod(0, w * 0.22, 0.6, 0, w * 0.22 + 0.2, 0.6 + r * 0.55, 0.07, p.dark, { camo: 0, mat: MAT.metal, seg: 6 });
    rk.box(0.4, 0.4, 0.5, 0, w * 0.22 + 0.2, 0.6 + r * 0.6, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
    rk.box(0.6, w * 0.22, 0.6, 0, w * 0.1, 0, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.05 });
    rk.box(1.6, 1.2, 1.2, 0, w * 0.2, -r * 0.5, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.1 });
  }
  dress(S);
  const out = finish(S, 20);
  return { ...out, rotor: rk.build({ ao: false }), rotorPivot: [0, 0.36 + 14.4, -d * 0.12], rotorAxis: 'y', rotorSpeed: 1.6 };
};

// ====================================================================================== tech centre
const techcenter: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 32), d = num(spec.d, 28);
  const S = mkSite(p, style, seedOf(id), w, d);
  apron(S, w, d, 2.8);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const wall = style === 'china' ? 0xc9bfa3 : p.light;
    k.box(w * 0.92, 1.0, d * 0.9, 0, 0.5, 0, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.1 });
    // tiers of glass
    const tiers: [number, number, number, number][] = [[0.78, 0.7, 8, 1.0], [0.56, 0.52, 6, 9.0], [0.34, 0.34, 5, 15.0]];
    tiers.forEach(([fw, fd, h, y0], ti) => {
      k.box(w * fw, h, d * fd, 0, y0 + h / 2, ti === 0 ? 0 : -d * 0.02, wall, { camo: 0, mat: MAT.concrete, grime: 0.45, bevel: 0.2 });
      const gz = (ti === 0 ? 0 : -d * 0.02) + d * fd / 2;
      k.box(w * fw * 0.9, h * 0.8, 0.3, 0, y0 + h / 2, gz + 0.1, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.02 });
      for (let i = 0; i <= 8; i++) k.box(0.14, h * 0.82, 0.24, (i / 8 - 0.5) * w * fw * 0.9, y0 + h / 2, gz + 0.22, p.steel, { camo: 0, mat: MAT.steel, bevel: 0.01 });
      for (let j = 0; j <= 3; j++) k.box(w * fw * 0.92, 0.16, 0.24, 0, y0 + 0.8 + j * (h * 0.8 / 3), gz + 0.22, p.steel, { camo: 0, mat: MAT.steel, bevel: 0.01 });
      gl.box(w * fw * 0.88, h * 0.74, 0.02, 0, y0 + h / 2, gz + 0.3, COOL, { camo: 0, grime: 0, bevel: 0, jitter: 0.2 });
      k.box(w * fw + 0.8, 0.5, d * fd + 0.8, 0, y0 + h + 0.25, ti === 0 ? 0 : -d * 0.02, p.roof, { camo: 0, mat: MAT.steel, bevel: 0.06 });
      blockWindows(S, 0, ti === 0 ? 0 : -d * 0.02, y0, w * fw, d * fd, 1, 3, 1.4, 2.2, COOL, true);
    });
    // observatory dome + antennas
    k.cyl(w * 0.14, w * 0.15, 1.4, 0, 21.3, -d * 0.02, p.metal, { camo: 0, mat: MAT.steel, seg: 20 });
    k.sphere(w * 0.14, 0, 22.0, -d * 0.02, p.light, { camo: 0, grime: 0.3, mat: MAT.steel, sy: 0.85, seg: 24 });
    k.box(0.6, w * 0.13, 0.5, 0, 22.2, -d * 0.02 + w * 0.0, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 });
    mast(S, w * 0.3, 9.6, -d * 0.2, 11);
    mast(S, -w * 0.3, 9.6, -d * 0.2, 8, false);
    dish(S, -w * 0.3, 15.8, d * 0.1, 1.8, -0.7, -0.5);
    hvac(S, w * 0.25, 9.8, d * 0.05, 0, true);
    // entrance canopy + plaza
    k.box(w * 0.3, 0.5, 4.5, 0, 5.0, d * 0.45 + 2.2, p.light, { camo: 0, mat: MAT.concrete, bevel: 0.08 });
    for (const s of [-1, 1]) k.cyl(0.35, 0.38, 4.2, s * w * 0.13, 3.0, d * 0.45 + 3.8, p.light, { camo: 0, mat: MAT.concrete, seg: 12 });
    door(S, 0, 1.0, d * 0.45 + 0.05, 0, 5, 3.8);
    for (let i = 0; i < 4; i++) k.cyl(0.9, 1.0, 0.7, (i - 1.5) * 4.5, 0.35, d * 0.46 + 6, p.concrete, { camo: 0, mat: MAT.concrete, seg: 12 });
    tm.box(w * 0.4, 0.8, 0.3, 0, 5.8, d * 0.45 + 4.4, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(w * 0.2, 0.12, d * 0.18, 0, 9.55, -d * 0.02, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  });
  dress(S);
  return finish(S, 26);
};

// ====================================================================================== cyber centre
const cyber: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 24), d = num(spec.d, 22);
  const S = mkSite(p, style, seedOf(id), w, d, 0.45);
  apron(S, w, d, 2.6, 0x2c2f31);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const dark = 0x1e2225;
    k.box(w * 0.92, 8, d * 0.88, 0, 4, 0, dark, { camo: 0, mat: MAT.dark, grime: 0.4, bevel: 0.25 });
    k.box(w * 0.98, 0.8, d * 0.94, 0, 8.2, 0, p.metal, { camo: 0, mat: MAT.steel, bevel: 0.1 });
    // server-rack glow panels on the front
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const x = (i - 2.5) * (w * 0.14), y = 1.6 + j * 1.6, z = d * 0.44 + 0.04;
      k.box(w * 0.11, 1.2, 0.08, x, y, z, 0x0b0f12, { camo: 0, mat: MAT.glass, bevel: 0.01 });
      gl.box(w * 0.095, 0.1, 0.02, x, y + 0.3, z + 0.06, (i + j) % 3 === 0 ? 0x59f0b4 : (i + j) % 3 === 1 ? 0x6aa8ff : 0xff7a5a, { camo: 0, grime: 0, bevel: 0 });
      gl.box(w * 0.095, 0.06, 0.02, x, y - 0.1, z + 0.06, 0x59f0b4, { camo: 0, grime: 0, bevel: 0 });
    }
    for (const s of [-1, 1]) for (let j = 0; j < 4; j++) gl.box(0.02, 0.1, d * 0.6, s * (w * 0.46 + 0.04), 1.8 + j * 1.6, 0, 0x6aa8ff, { camo: 0, grime: 0, bevel: 0 });
    door(S, 0, 0, d * 0.44 + 0.04, 0, 3.2, 3.2);
    // antenna forest, dishes, cooling
    for (let i = 0; i < 6; i++) mast(S, -w * 0.38 + i * (w * 0.15), 8.6, -d * 0.24 + (i % 2) * 3, 6 + (i % 3) * 3.4, true);
    dish(S, w * 0.28, 9.1, d * 0.18, 2.3, -0.75, 0.6);
    dish(S, -w * 0.18, 9.1, d * 0.2, 1.6, -0.9, -0.5);
    for (let i = 0; i < 4; i++) hvac(S, -w * 0.3 + i * 3.4, 8.6, d * 0.02, 0, true);
    // razor-wire fence line
    for (let i = 0; i <= 8; i++) k.cyl(0.07, 0.07, 2.6, -w * 0.5 + i * (w / 8), 1.3, d * 0.5 + 1.8, p.steel, { camo: 0, mat: MAT.metal, seg: 6 });
    k.box(w, 0.06, 0.06, 0, 2.5, d * 0.5 + 1.8, p.steel, { camo: 0, mat: MAT.metal, bevel: 0 });
    k.box(w, 0.06, 0.06, 0, 1.2, d * 0.5 + 1.8, p.steel, { camo: 0, mat: MAT.metal, bevel: 0 });
    tm.box(w * 0.6, 0.5, 0.3, 0, 7.5, d * 0.44 + 0.3, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(0.3, 0.5, d * 0.6, w * 0.46 + 0.2, 7.5, 0, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
  });
  dress(S);
  return finish(S, 16);
};

// ====================================================================================== bunker
const bunker: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 14);
  const S = mkSite(p, style, seedOf(id), w, w, 0.7);
  apron(S, w, w, 1.8, 0x4d4f4e);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, tm } = S;
    const rnd = mulberry32(seedOf(id));
    // squat hardened pillbox: sloped walls, deep roof overhang, embrasure slits
    k.box(w * 0.9, 0.9, w * 0.9, 0, 0.45, 0, p.concrete, { camo: 0.1, mat: MAT.concrete, grime: 0.85, bevel: 0.12 });
    k.taper(w * 0.84, w * 0.7, 2.6, w * 0.84, w * 0.7, 0, 2.2, 0, p.concrete, { camo: 0.15, mat: MAT.concrete, grime: 0.8, bevel: 0.14 });
    k.box(w * 0.8, 0.7, w * 0.8, 0, 3.85, 0, p.concrete, { camo: 0.15, mat: MAT.concrete, grime: 0.85, bevel: 0.1 });
    k.box(w * 0.5, 0.5, w * 0.5, 0, 4.45, -w * 0.05, p.concrete, { camo: 0.15, mat: MAT.concrete, grime: 0.85, bevel: 0.1 });
    for (let a = 0; a < 3; a++) {
      frame(S, 0, 0, 0, a * PI / 2, () => {
        for (const sx of [-1, 1]) k.box(w * 0.2, 0.42, 0.6, sx * w * 0.2, 2.5, w * 0.37, 0x0b0c0d, { camo: 0, mat: MAT.dark, bevel: 0.03 });
        k.box(w * 0.56, 0.3, 0.9, 0, 2.95, w * 0.39, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.8, bevel: 0.04 });
      });
    }
    // rear entrance behind a blast wall
    door(S, 0, 0.9, -w * 0.4, PI, 1.8, 1.9);
    k.box(w * 0.5, 2.0, 0.6, 0, 1.0, -w * 0.55, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.8, bevel: 0.08 });
    // roof MG pit + antenna
    k.box(0.55, 0.45, 1.0, 0.0, 5.0, w * 0.0 + 0.4, p.main, { camo: 0.5, bevel: 0.04 });
    k.pipe(0.055, 1.6, 0, 5.05, 1.2, p.metal, { mat: MAT.metal, seg: 8 });
    k.rod(w * 0.18, 4.7, -w * 0.18, w * 0.18, 7.2, -w * 0.18, 0.03, p.dark, { mat: MAT.metal, seg: 5 });
    // sandbag arcs in front, czech hedgehogs and wire posts further out
    sandbags(S, -w * 0.22, 0.0, w * 0.5, w * 0.34, 0, 3);
    sandbags(S, w * 0.22, 0.0, w * 0.5, w * 0.34, 0, 3);
    for (let i = 0; i < 5; i++) {
      const hx = (i - 2) * w * 0.26, hz = w * 0.72 + (i % 2) * 0.8;
      for (let r = 0; r < 3; r++) k.rod(hx - 0.7, 0.9 + 0.0, hz, hx + 0.7, 0.9, hz, 0.07, p.steel, { mat: MAT.metal, seg: 5, camo: 0, rot: [0, 0, 0] });
      k.rod(hx, 0.1, hz - 0.7, hx, 1.7, hz + 0.7, 0.07, p.steel, { mat: MAT.metal, seg: 5, camo: 0 });
      k.rod(hx, 0.1, hz + 0.7, hx, 1.7, hz - 0.7, 0.07, p.steel, { mat: MAT.metal, seg: 5, camo: 0 });
    }
    for (let i = 0; i < 4; i++) k.rod(-w * 0.55 + i * w * 0.37, 0.0, w * 0.82, -w * 0.55 + i * w * 0.37, 1.4, w * 0.82, 0.05, p.steel, { mat: MAT.metal, seg: 5, camo: 0 });
    k.rod(-w * 0.55, 1.1, w * 0.82, w * 0.55 - 0.1, 1.1, w * 0.82, 0.02, p.dark, { mat: MAT.metal, seg: 4, camo: 0 });
    k.rod(-w * 0.55, 0.5, w * 0.82, w * 0.55 - 0.1, 0.5, w * 0.82, 0.02, p.dark, { mat: MAT.metal, seg: 4, camo: 0 });
    for (let i = 0; i < 5; i++) k.sphere(0.35 + rnd() * 0.2, (rnd() - 0.5) * w * 0.9, 0.3, w * 0.62 + rnd() * 0.6, 0x7a6e56, { camo: 0, mat: MAT.sand, seg: 6, sy: 0.6 });
    tm.box(w * 0.4, 0.35, 0.3, 0, 3.7, w * 0.42, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.box(w * 0.34, 0.1, w * 0.34, 0, 4.72, -w * 0.05, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  });
  return finish(S, 8);
};

// ====================================================================================== missile silo (superweapon)
const silo: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 28), d = num(spec.d, 28);
  const S = mkSite(p, style, seedOf(id), w, d, 0.5);
  apron(S, w, d, 2.8);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    k.box(w * 0.92, 1.0, d * 0.92, 0, 0.5, 0, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.15 });
    // sliding blast doors around a launch pit
    k.cyl(w * 0.34, w * 0.36, 1.6, 0, 1.4, 0, p.metal, { camo: 0, mat: MAT.steel, grime: 0.6, seg: 28 });
    k.cyl(w * 0.27, w * 0.27, 1.7, 0, 1.45, 0, 0x0d0f10, { camo: 0, mat: MAT.dark, seg: 28 });
    for (const s of [-1, 1]) k.box(w * 0.26, 0.6, w * 0.58, s * w * 0.3, 2.3, 0, p.steel, { camo: 0, mat: MAT.ribX, grime: 0.6, bevel: 0.1 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; gl.box(0.5, 0.15, 0.5, Math.sin(a) * w * 0.345, 2.25, Math.cos(a) * w * 0.345, i % 2 ? 0xff3a2a : 0xffb030, { camo: 0, grime: 0, bevel: 0 }); }
    // raised missile in its erector
    const mh = 17, R = 1.6;
    k.lathe([[0, 0], [R * 0.9, 0], [R, 0.5], [R, mh - 5], [R * 0.7, mh - 2], [R * 0.3, mh - 0.6], [0, mh]], 0, 2.2, 0, style === 'iran' ? p.alt : p.light, { camo: 0.3, grime: 0.35, seg: 24, mat: MAT.paint });
    k.cyl(R + 0.02, R + 0.02, 0.5, 0, 2.2 + mh * 0.62, 0, 0xb23a2a, { camo: 0, seg: 24, grime: 0.2 });
    k.cyl(R + 0.02, R + 0.02, 0.3, 0, 2.2 + mh * 0.5, 0, 0xe8e2cc, { camo: 0, seg: 24, grime: 0.2 });
    for (let i = 0; i < 4; i++) k.box(0.1, 3.4, 2.4, Math.sin(i * PI / 2 + PI / 4) * 1.8, 4.0, Math.cos(i * PI / 2 + PI / 4) * 1.8, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.01, rot: [0, i * PI / 2 + PI / 4 + PI / 2, 0] });
    // service gantry towers with beacons
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * w * 0.42, z = sz * d * 0.42;
      for (const [ox, oz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.rod(x + ox * 0.7, 1, z + oz * 0.7, x + ox * 0.35, 13, z + oz * 0.35, 0.09, p.steel, { mat: MAT.metal, seg: 5, camo: 0 });
      for (let j = 1; j < 6; j++) { const hh = 1 + j * 2; k.box(1.5, 0.08, 0.08, x, hh, z - 0.6 + 0.0, p.steel, { mat: MAT.metal, camo: 0, bevel: 0 }); k.box(0.08, 0.08, 1.5, x, hh, z, p.steel, { mat: MAT.metal, camo: 0, bevel: 0 }); }
      gl.sphere(0.4, x, 13.5, z, 0xff3a2a, { camo: 0, grime: 0, seg: 6 });
    }
    // control bunker, fuel tanks, radar
    k.box(w * 0.28, 3.4, d * 0.2, w * 0.0, 2.7, d * 0.4, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.2 });
    windows(S, 0, 1.8, d * 0.5 + 0.04, 0, 3, 1, 1.6, 1.0, w * 0.08, 0, WARM);
    door(S, w * 0.1, 1.0, d * 0.5 + 0.05, 0, 2.2, 2.4);
    tank(S, -w * 0.3, 0.6, d * 0.4, 1.8, 4.2, p.light);
    tank(S, -w * 0.3 - 4, 0.6, d * 0.42, 1.8, 4.2, p.light);
    dish(S, w * 0.3, 4.4, d * 0.4, 1.5, -0.8, 0.4);
    tm.box(w * 0.3, 0.5, 0.3, 0, 4.2, d * 0.5 + 0.2, TEAM, { camo: 0, grime: 0, bevel: 0.02 });
    tm.cyl(w * 0.3, w * 0.3, 0.1, 0, 1.0, 0, TEAM, { camo: 0, grime: 0, seg: 28 });
  });
  dress(S);
  return finish(S, 32);
};

// ====================================================================================== neutral props
const supplypile: Builder = ({ pal: p }) => {
  const S = mkSite(p, 'neutral', 77, 12, 12, 0.8);
  const { k, tm } = S;
  k.box(11, 0.3, 11, 0, 0.0, 0, 0x6b5f4a, { camo: 0, mat: MAT.sand, grime: 0.8, bevel: 0.1 });
  const cols = [0x8a6a3a, 0x5d6a4a, 0x7a5a30, 0x6a6258, 0x4a5a3a];
  const rnd = mulberry32(5);
  for (let i = 0; i < 22; i++) {
    const a = i * 2.4, r = 0.6 + (i % 6) * 0.85;
    const h = 1.0 + (i % 3) * 0.55;
    const lvl = i > 14 ? 1 : 0;
    k.group(Math.sin(a) * r, 0.3 + lvl * 1.3, Math.cos(a) * r, [0, a + rnd() * 0.3, 0], () => {
      k.box(1.5 + (i % 2) * 0.6, h, 1.5, 0, h / 2, 0, cols[i % 5], { camo: 0, grime: 0.8, bevel: 0.05, jitter: 0.12 });
      k.box(1.6, 0.07, 1.56, 0, h * 0.25, 0, 0x2b2b29, { camo: 0, bevel: 0.01 });
      k.box(1.6, 0.07, 1.56, 0, h * 0.78, 0, 0x2b2b29, { camo: 0, bevel: 0.01 });
    });
  }
  for (let i = 0; i < 4; i++) barrel(S, 3.2 + (i % 2) * 0.8, 0.3, -3.0 + Math.floor(i / 2) * 0.9, [0x395a8a, 0x8a3a30, 0x4a5a3a, 0x7a6a2e][i]);
  k.box(5, 0.04, 3, 0, 2.6, -1, p.canvas, { camo: 0.4, mat: MAT.cloth, grime: 0.7, bevel: 0.01, rot: [0.12, 0.2, 0.08] });
  // tall marker flag so the supply cache reads from afar
  k.cyl(0.07, 0.09, 6, -4.5, 3.3, 4.2, p.light, { camo: 0, mat: MAT.steel, seg: 6 });
  tm.box(0.04, 0.9, 1.4, -4.5, 5.5, 4.9, 0xffffff, { camo: 0, grime: 0, bevel: 0 });
  return { body: k.build(), team: tm.build({ ao: false }), height: 4 };
};

const derrick: Builder = ({ spec, pal: p, id }) => {
  const w = num(spec.w, 10);
  const S = mkSite(p, 'neutral', seedOf(id), w, w, 0.8);
  const { k, tm } = S;
  const rk = new Kit({ camo: 0, grime: 0.6, seed: 9, bevelMax: 0.06, ground: false });
  const ink = 0x2f4a5a;
  k.box(w, 0.7, w, 0, 0.1, 0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.8, bevel: 0.1 });
  k.box(2.0, 1.4, 3.2, 0, 1.2, -w * 0.28, ink, { camo: 0, grime: 0.7, mat: MAT.ribX, bevel: 0.06 });
  k.cyl(0.5, 0.5, 1.4, 0.6, 2.2, -w * 0.28, p.dark, { camo: 0, mat: MAT.metal, seg: 10 });
  // samson post (A-frame)
  for (const s of [-1, 1]) { k.rod(s * 0.9, 0.5, w * 0.1, s * 0.1, 7.0, w * 0.16, 0.12, 0x4a4f54, { camo: 0, mat: MAT.metal, seg: 6 }); k.rod(s * 0.9, 0.5, w * 0.24, s * 0.1, 7.0, w * 0.16, 0.12, 0x4a4f54, { camo: 0, mat: MAT.metal, seg: 6 }); }
  k.box(1.6, 0.25, 0.4, 0, 3.0, w * 0.16, 0x4a4f54, { camo: 0, mat: MAT.metal, bevel: 0.02 });
  // wellhead, pipes, tank
  k.cyl(0.45, 0.55, 2.2, 0, 1.6, w * 0.34, 0x6a5a40, { camo: 0, grime: 0.9, mat: MAT.metal, seg: 10 });
  k.cyl(0.22, 0.22, 4.5, 0, 3.3, w * 0.34, 0x333638, { camo: 0, mat: MAT.metal, seg: 8 });
  k.sweep([[0.4, 1.0, w * 0.34], [2.0, 0.8, w * 0.34], [3.5, 0.8, w * 0.1], [3.5, 0.9, -w * 0.3]], 0.2, 0x4a4f54, { mat: MAT.metal, camo: 0, seg: 8 });
  tank(S, w * 0.34, 0.4, -w * 0.2, 1.5, 3.2, 0x6a7a80);
  // walking beam + horsehead + counterweight (rocks about the samson post)
  rk.box(0.5, 0.6, 7.6, 0, 0, 0, 0x3a6a4a, { camo: 0, grime: 0.6, mat: MAT.paint, bevel: 0.05 });
  rk.prism([[0, 0], [1.1, 0.0], [1.1, -1.3], [0.5, -2.6], [0, -2.6]], 0.55, 0, 0.3, 3.6, 0x3a6a4a, { camo: 0, grime: 0.6, bevel: 0.05, rot: [0, -PI / 2, 0] });
  rk.box(0.8, 1.6, 1.5, 0, -0.2, -3.5, 0x4a4a4a, { camo: 0, grime: 0.7, mat: MAT.metal, bevel: 0.06 });
  rk.box(0.3, 0.3, 0.3, 0, 0.5, 0, 0x2a2a2a, { camo: 0, mat: MAT.dark });
  tm.box(0.4, 0.3, 0.4, 0, 7.2, w * 0.16, 0xffffff, { camo: 0, grime: 0, bevel: 0 });
  return { body: k.build(), team: tm.build({ ao: false }), rotor: rk.build({ ao: false }), rotorPivot: [0, 6.8, w * 0.16], rotorAxis: 'x', rotorSpeed: 1.6, rotorRock: true, height: 9 };
};

// ====================================================================================== civilian town buildings
const civ: Builder = ({ spec, pal: p }) => {
  const kind = String(spec.kind ?? 'house');
  const w = num(spec.w, 14), d = num(spec.d, 12);
  const seed = seedOf(kind + w);
  const rnd = mulberry32(seed);
  const S = mkSite(p, 'neutral', seed, w, d, 0.6);
  const wall = [0xd0c3a4, 0xc2b79a, 0xd8cdb2, 0xb9ac90, 0xcfbf9f][seed % 5];
  const h = kind === 'tower' ? 26 : kind === 'warehouse' ? 8.5 : kind === 'shop' ? 6.5 : 7.2;
  apron(S, w, d, 1.2, 0x6a675f);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl } = S;
    k.box(w, h, d, 0, h / 2, 0, wall, { camo: 0, mat: MAT.plaster, grime: 0.65, bevel: 0.18 });
    k.box(w + 0.5, 0.6, d + 0.5, 0, h + 0.1, 0, p.light, { camo: 0, mat: MAT.concrete, grime: 0.6, bevel: 0.05 });
    if (kind === 'warehouse') {
      barrel_roof(S, w, d, 2.0, h + 0.4, p.metal, MAT.ribX);
      for (let i = 0; i < 3; i++) rollerDoor(S, (i - 1) * w * 0.28, 0, d / 2 + 0.06, 0, w * 0.22, 4.4, [0x5d6a4a, 0x7a3a2e, 0x395a8a][i]);
      windows(S, 0, 5.2, d / 2 + 0.04, 0, 6, 1, 1.4, 1.0, w * 0.15, 0, WARM);
      for (let i = 0; i < 3; i++) container(S, w * 0.55 + 3, 0, -d * 0.3 + i * 2.8, 0, [0x7a2f26, 0x2f4a6a, 0x4d5d3b][i], 5, 2.4, 2.2);
    } else if (kind === 'shop') {
      // awning, signboard, shutters, rooftop water tank
      k.prism([[0, 0], [0, -0.5], [2.8, -1.4], [2.8, 0]], w * 0.84, 0, 4.1, d / 2 + 0.1, 0xb3392a, { camo: 0, mat: MAT.cloth, bevel: 0.02, rot: [0, PI / 2, 0] });
      for (let i = 0; i < 8; i++) k.box(w * 0.84 / 8, 0.04, 2.7, (i / 7 - 0.5) * w * 0.84 * 0.875, 3.65, d / 2 + 1.5, i % 2 ? 0xf2efe6 : 0xb3392a, { camo: 0, mat: MAT.cloth, bevel: 0.01, rot: [0.3, 0, 0] });
      k.box(w * 0.7, 1.1, 0.25, 0, 5.4, d / 2 + 0.15, 0x24425e, { camo: 0, grime: 0.4, bevel: 0.04 });
      gl.box(w * 0.64, 0.7, 0.04, 0, 5.4, d / 2 + 0.3, 0xffe9a8, { camo: 0, grime: 0, bevel: 0 });
      k.box(w * 0.78, 2.4, 0.2, 0, 1.6, d / 2 + 0.06, 0x1a1d1f, { camo: 0, mat: MAT.glass, bevel: 0.02 });
      gl.box(w * 0.7, 1.9, 0.02, 0, 1.6, d / 2 + 0.2, WARM, { camo: 0, grime: 0, bevel: 0 });
      windows(S, 0, 3.8, d / 2 + 0.04, 0, 3, 1, 1.4, 1.1, w * 0.26, 0, WARM);
      tank(S, w * 0.3, h + 0.5, -d * 0.2, 1.1, 1.8, 0x5a6a74);
    } else if (kind === 'tower') {
      for (let f = 0; f < 7; f++) blockWindows(S, 0, 0, 1.2 + f * 3.4 - 0.9, w, d, 1, 1, 1.5, 1.6, f % 2 ? WARM : COOL, false);
      for (let f = 0; f < 6; f++) { k.box(w + 0.3, 0.25, d + 0.3, 0, 3.6 + f * 3.4, 0, p.light, { camo: 0, mat: MAT.concrete, bevel: 0.03 }); }
      for (let f = 0; f < 6; f++) for (let c = 0; c < 3; c++) k.box(2.2, 0.15, 1.3, (c - 1) * w * 0.3, 2.4 + f * 3.4, d / 2 + 0.7, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
      k.box(w * 0.5, 2.4, d * 0.5, 0, h + 1.8, 0, p.light, { camo: 0, mat: MAT.concrete, bevel: 0.08 });
      mast(S, w * 0.2, h + 3, -d * 0.2, 9);
      tank(S, -w * 0.3, h + 0.5, d * 0.2, 1.2, 2.0, 0x5a6a74);
      hvac(S, w * 0.3, h + 0.4, d * 0.25, 0, true);
      gl.box(w * 0.4, 0.3, 0.04, 0, h + 2.4, d * 0.26, 0xff3a2a, { camo: 0, grime: 0, bevel: 0 });
      for (let i = 0; i < 8; i++) gl.box(0.8, 0.9, 0.02, (i % 4 - 1.5) * w * 0.2, 2 + Math.floor(rnd() * 20), d / 2 + 0.2, COOL, { camo: 0, grime: 0, bevel: 0 });
    } else {
      // house: flat roof, stair tower, balcony, water tank, dish
      windows(S, 0, 1.2, d / 2 + 0.04, 0, 3, 1, 1.2, 1.5, w * 0.26, 0, WARM);
      windows(S, 0, 4.4, d / 2 + 0.04, 0, 3, 1, 1.2, 1.5, w * 0.26, 0, WARM);
      blockWindows(S, 0, 0, 0.3, w, d, 2, 3.4, 1.2, 1.4, WARM, true);
      door(S, w * 0.22, 0, d / 2 + 0.04, 0, 1.8, 2.8);
      k.box(w * 0.7, 0.15, 1.4, -w * 0.05, 3.9, d / 2 + 0.8, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.03 });
      k.box(w * 0.7, 0.9, 0.08, -w * 0.05, 4.4, d / 2 + 1.45, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
      k.box(w * 0.28, 2.6, d * 0.34, w * 0.3, h + 1.6, -d * 0.2, wall, { camo: 0, mat: MAT.plaster, bevel: 0.1 });
      tank(S, -w * 0.3, h + 0.5, d * 0.1, 0.9, 1.6, 0x5a6a74);
      dish(S, w * 0.1, h + 0.7, d * 0.2, 0.7, -0.8, 0.6);
      hvac(S, -w * 0.1, h + 0.4, -d * 0.25, 0);
    }
    for (let i = 0; i < 2; i++) lamp(S, (i ? 1 : -1) * (w / 2 + 1.0), -0.2, d / 2 + 0.8, 5, 0);
  });
  return finish(S, h + 4);
};

// ====================================================================================== tunnel network entrance
const tunnel: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 16);
  const S = mkSite(p, style, seedOf(id), w, w, 0.75);
  apron(S, w, w, 1.6, 0x5a5448);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, tm } = S;
    const rnd = mulberry32(seedOf(id));
    // earth mound with rock cladding
    k.sphere(w * 0.5, 0, 0.2, -w * 0.08, 0x7a6a50, { camo: 0, mat: MAT.sand, grime: 0.8, sy: 0.38, seg: 18 });
    for (let i = 0; i < 12; i++) { const a = rnd() * PI * 2, r = w * (0.2 + rnd() * 0.28); k.sphere(0.6 + rnd() * 0.9, Math.sin(a) * r, 0.6 + rnd() * 1.2, Math.cos(a) * r - w * 0.08, 0x8a7b60, { camo: 0, grime: 0.8, mat: MAT.concrete, seg: 6, sy: 0.7, jitter: 0.15 }); }
    // reinforced portal
    k.box(w * 0.5, 3.6, 1.6, 0, 1.8, w * 0.28, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.75, bevel: 0.15 });
    k.box(w * 0.34, 2.8, 0.3, 0, 1.4, w * 0.28 + 0.8, 0x0b0c0d, { camo: 0, mat: MAT.dark, bevel: 0.05 });
    for (const s of [-1, 1]) k.box(w * 0.08, 2.9, 0.5, s * w * 0.2, 1.45, w * 0.28 + 0.95, p.steel, { camo: 0, mat: MAT.ribZ, grime: 0.6, bevel: 0.04 });
    k.box(w * 0.6, 0.6, 2.0, 0, 3.8, w * 0.28, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.75, bevel: 0.1 });
    // vent stacks, sandbags, camo net, barrels
    for (let i = 0; i < 2; i++) { k.cyl(0.5, 0.6, 2.2, -w * 0.2 + i * w * 0.2, 2.6, -w * 0.2, p.dark, { camo: 0, mat: MAT.metal, seg: 10 }); k.cyl(0.65, 0.5, 0.4, -w * 0.2 + i * w * 0.2, 3.9, -w * 0.2, p.dark, { camo: 0, mat: MAT.metal, seg: 10 }); }
    sandbags(S, -w * 0.3, 0, w * 0.44, 4.5, 0.2, 3);
    sandbags(S, w * 0.3, 0, w * 0.44, 4.5, -0.2, 3);
    k.prism([[-w * 0.28, 0], [w * 0.28, 0], [w * 0.2, 0.3], [-w * 0.2, 0.3]], 0.05, 0, 4.4, w * 0.5, p.canvas, { camo: 0.8, mat: MAT.cloth, bevel: 0.01, rot: [PI / 2 - 0.35, 0, 0] });
    barrel(S, w * 0.34, 0, w * 0.2, 0x4a5a3a);
    barrel(S, w * 0.34 + 0.8, 0, w * 0.26, 0x7a3a2e);
    tm.box(w * 0.4, 0.4, 0.3, 0, 3.4, w * 0.28 + 1.0, 0xffffff, { camo: 0, grime: 0, bevel: 0.02 });
    tm.cyl(w * 0.2, w * 0.2, 0.1, 0, 2.0, -w * 0.1, 0xffffff, { camo: 0, grime: 0, seg: 20 });
  });
  return finish(S, 8);
};

// ====================================================================================== fortified compound
const compound: Builder = ({ spec, pal: p, style, id }) => {
  const w = num(spec.w, 24), d = num(spec.d, 20);
  const S = mkSite(p, style, seedOf(id), w, d, 0.7);
  apron(S, w, d, 1.6, 0x5a5448);
  frame(S, 0, 0.36, 0, 0, () => {
    const { k, gl, tm } = S;
    const wallCol = p.concrete;
    const H = 4.2, T = 1.1;
    // perimeter walls with battlements; gate arch at the front
    const wallSeg = (x: number, z: number, len: number, rot: number) => {
      frame(S, x, 0, z, rot, () => {
        k.box(len, H, T, 0, H / 2, 0, wallCol, { camo: 0, mat: MAT.plaster, grime: 0.7, bevel: 0.12 });
        const n = Math.max(2, Math.round(len / 1.8));
        for (let i = 0; i < n; i++) k.box(1.1, 0.7, T * 0.9, -len / 2 + (i + 0.5) * (len / n), H + 0.35, 0, wallCol, { camo: 0, mat: MAT.plaster, grime: 0.7, bevel: 0.05 });
      });
    };
    wallSeg(0, -d / 2 + T / 2, w, 0);
    wallSeg(-w / 2 + T / 2, 0, d, PI / 2);
    wallSeg(w / 2 - T / 2, 0, d, PI / 2);
    wallSeg(-w * 0.31, d / 2 - T / 2, w * 0.38, 0);
    wallSeg(w * 0.31, d / 2 - T / 2, w * 0.38, 0);
    // gate
    k.box(w * 0.24, 1.0, T + 0.4, 0, H - 0.5, d / 2 - T / 2, wallCol, { camo: 0, mat: MAT.plaster, bevel: 0.1 });
    for (const s of [-1, 1]) k.box(1.0, H + 1, T + 0.5, s * w * 0.12, (H + 1) / 2, d / 2 - T / 2, p.light, { camo: 0, mat: MAT.plaster, grime: 0.6, bevel: 0.1 });
    k.box(w * 0.2, 2.6, 0.3, 0, 1.3, d / 2 - T / 2 + 0.1, p.steel, { camo: 0, mat: MAT.ribZ, grime: 0.6, bevel: 0.05 });
    // corner towers with weapon positions
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * (w / 2 - 1.4), z = sz * (d / 2 - 1.4);
      k.cyl(1.9, 2.1, 7.2, x, 3.6, z, wallCol, { camo: 0, mat: MAT.plaster, grime: 0.7, seg: 14 });
      k.cyl(2.3, 2.1, 0.7, x, 7.3, z, p.light, { camo: 0, mat: MAT.plaster, seg: 14 });
      k.cyl(1.7, 1.7, 1.4, x, 8.2, z, p.dark, { camo: 0.3, mat: MAT.dark, seg: 14 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; sandbags(S, Math.cos(a) * 1.9 + x, 7.6, Math.sin(a) * 1.9 + z, 1.8, -a + PI / 2, 2); }
    }
    // central keep + flat roof gun position
    k.box(w * 0.34, 6.4, d * 0.3, 0, 3.2, -d * 0.12, wallCol, { camo: 0, mat: MAT.plaster, grime: 0.6, bevel: 0.2 });
    k.box(w * 0.36, 0.7, d * 0.32, 0, 6.7, -d * 0.12, p.light, { camo: 0, mat: MAT.plaster, bevel: 0.08 });
    blockWindows(S, 0, -d * 0.12, 0.3, w * 0.34, d * 0.3, 1, 3, 1.1, 1.5, WARM, false);
    door(S, 0, 0, -d * 0.12 + d * 0.15 + 0.05, 0, 2.4, 3);
    k.cyl(1.0, 1.1, 0.6, w * 0.08, 7.3, -d * 0.1, p.concrete, { camo: 0, mat: MAT.plaster, seg: 10 });
    k.box(0.5, 0.4, 1.1, w * 0.08, 7.8, -d * 0.1, p.main, { camo: 0.5, bevel: 0.03 });
    k.pipe(0.05, 1.4, w * 0.08, 7.8, -d * 0.1 + 1.2, p.metal, { mat: MAT.metal, seg: 8 });
    mast(S, -w * 0.12, 7.0, -d * 0.2, 8);
    hvac(S, w * 0.12, 7.0, -d * 0.2, 0);
    // yard clutter
    crates(S, -w * 0.28, d * 0.15, 6, 4);
    for (let i = 0; i < 4; i++) barrel(S, w * 0.28 + (i % 2) * 0.8, 0, d * 0.12 + Math.floor(i / 2) * 0.8, [0x395a8a, 0x8a3a30, 0x4a5a3a, 0x7a6a2e][i]);
    tm.box(w * 0.36, 0.5, 0.3, 0, 6.0, -d * 0.12 + d * 0.15 + 0.3, 0xffffff, { camo: 0, grime: 0, bevel: 0.02 });
    tm.cyl(2.0, 2.0, 0.12, 0, 7.12, -d * 0.12, 0xffffff, { camo: 0, grime: 0, seg: 20 });
    gl.box(1.4, 0.1, 0.05, 0, 3.4, d / 2 + 0.2, 0xffc86a, { camo: 0, grime: 0, bevel: 0 });
  });
  flagpole(S, -w * 0.18, 0.36, d / 2 + 2, 11);
  return finish(S, 14);
};

export const structBuilders2: Record<string, Builder> = {
  airfield, radar, techcenter, cyber, bunker, silo, supplypile, derrick, civ, tunnel, compound,
};
export type { Site };
void hull2; void lamp; void flagpole; void sandbags; void gable; void COOL; void container;
