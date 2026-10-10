import { Kit, MAT } from './kit';
import { Palette, TEAM, PI } from './parts';

/** the three kits every structure fills: solid body, night-lit glow (windows, beacons), team colour */
export interface Site { k: Kit; gl: Kit; tm: Kit; p: Palette; style: string; w: number; d: number }

export function mkSite(p: Palette, style: string, seed: number, w: number, d: number, grime = 0.55): Site {
  return {
    k: new Kit({ camo: 0, grime, seed, bevelMax: 0.18, ground: false, tess: 2.4 }),
    gl: new Kit({ ground: false }),
    tm: new Kit({ ground: false }),
    p, style, w, d,
  };
}

/** run fn with the same local frame applied to all three kits */
export function frame(S: Site, x: number, y: number, z: number, rotY: number, fn: () => void): void {
  S.k.group(x, y, z, [0, rotY, 0], () => S.gl.group(x, y, z, [0, rotY, 0], () => S.tm.group(x, y, z, [0, rotY, 0], fn)));
}

/** concrete / asphalt apron that hides the terrain seam and grounds the building (top at y=0.35) */
export function apron(S: Site, w: number, d: number, margin = 2.6, color = 0x585b5c): void {
  S.k.box(w + margin * 2, 3.2, d + margin * 2, 0, -1.25, 0, color, { camo: 0, grime: 0.7, mat: MAT.asphalt, bevel: 0.25 });
  S.k.box(w + margin * 2 - 0.8, 0.12, d + margin * 2 - 0.8, 0, 0.36, 0, color, { camo: 0, grime: 0.6, mat: MAT.asphalt, bevel: 0.02, jitter: 0.1 });
}

export const WARM = 0xffd78a;
export const COOL = 0x9fdcff;

/** grid of framed windows on a wall; local +z is the outward normal of the face, (x,y,z) is the grid's bottom-centre */
export function windows(S: Site, x: number, y: number, z: number, rotY: number, cols: number, rows: number, ww: number, wh: number, dx: number, dy: number, glow: number = WARM, frameCol?: number): void {
  const p = S.p;
  frame(S, x, y, z, rotY, () => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = (c - (cols - 1) / 2) * dx, py = wh / 2 + r * dy;
      S.k.box(ww + 0.34, wh + 0.34, 0.16, px, py, 0.04, frameCol ?? p.trim, { camo: 0, grime: 0.5, bevel: 0.025, jitter: 0.08 });
      S.k.box(ww, wh, 0.1, px, py, 0.1, p.glass, { camo: 0, grime: 0.1, mat: MAT.glass, bevel: 0.01 });
      S.k.box(ww + 0.5, 0.12, 0.38, px, py - wh / 2 - 0.14, 0.14, p.light, { camo: 0, grime: 0.6, bevel: 0.02 });
      S.k.box(0.06, wh, 0.12, px, py, 0.14, frameCol ?? p.trim, { camo: 0, bevel: 0 });
      S.gl.box(ww * 0.94, wh * 0.92, 0.02, px, py, 0.16, glow, { camo: 0, grime: 0, bevel: 0, jitter: 0.25 });
    }
  });
}

/** four-face window helper for a rectangular block centred at (cx, cz) with base height y0 */
export function blockWindows(S: Site, cx: number, cz: number, y0: number, bw: number, bd: number, floors: number, floorH: number, ww: number, wh: number, glow: number = WARM, skipFront = false): void {
  const colsZ = Math.max(1, Math.floor((bw - 2) / (ww + 1.8)));
  const colsX = Math.max(1, Math.floor((bd - 2) / (ww + 1.8)));
  for (let f = 0; f < floors; f++) {
    const yy = y0 + 0.9 + f * floorH;
    if (!skipFront) windows(S, cx, yy, cz + bd / 2, 0, colsZ, 1, ww, wh, (bw - 2) / colsZ, 0, glow);
    windows(S, cx, yy, cz - bd / 2, PI, colsZ, 1, ww, wh, (bw - 2) / colsZ, 0, glow);
    windows(S, cx + bw / 2, yy, cz, PI / 2, colsX, 1, ww, wh, (bd - 2) / colsX, 0, glow);
    windows(S, cx - bw / 2, yy, cz, -PI / 2, colsX, 1, ww, wh, (bd - 2) / colsX, 0, glow);
  }
}

export function door(S: Site, x: number, y: number, z: number, rotY: number, w: number, h: number): void {
  const p = S.p;
  frame(S, x, y, z, rotY, () => {
    S.k.box(w + 0.7, h + 0.5, 0.3, 0, h / 2 + 0.2, 0.05, p.trim, { camo: 0, grime: 0.5, bevel: 0.04 });
    S.k.box(w, h, 0.2, 0, h / 2, 0.15, p.dark, { camo: 0, grime: 0.4, mat: MAT.dark, bevel: 0.03 });
    S.k.box(w * 0.48, h * 0.86, 0.1, -w * 0.25, h * 0.46, 0.27, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.02 });
    S.k.box(w * 0.48, h * 0.86, 0.1, w * 0.25, h * 0.46, 0.27, p.glass, { camo: 0, mat: MAT.glass, bevel: 0.02 });
    S.gl.box(w * 0.4, h * 0.7, 0.02, 0, h * 0.46, 0.34, WARM, { camo: 0, grime: 0, bevel: 0 });
  });
}

/** large roller / hangar door with ribs and hazard stripe */
export function rollerDoor(S: Site, x: number, y: number, z: number, rotY: number, w: number, h: number, color?: number): void {
  const p = S.p;
  frame(S, x, y, z, rotY, () => {
    S.k.box(w + 0.8, h + 0.5, 0.35, 0, h / 2 + 0.25, 0.06, p.dark, { camo: 0, mat: MAT.dark, grime: 0.6, bevel: 0.05 });
    S.k.box(w, h, 0.2, 0, h / 2, 0.2, color ?? p.metal, { camo: 0, mat: MAT.ribX, grime: 0.6, bevel: 0.03 });
    for (let i = 0; i < 9; i++) S.k.box(w, 0.08, 0.08, 0, 0.5 + i * (h - 0.8) / 8, 0.32, p.dark, { camo: 0, bevel: 0.01, mat: MAT.dark });
    for (let i = 0; i < 6; i++) S.k.box(w / 12, 0.34, 0.09, -w / 2 + (i + 0.5) * w / 6 * 1.0 - 0.0, 0.17, 0.33, i % 2 ? 0x1b1b1b : 0xd9b22a, { camo: 0, grime: 0.5, bevel: 0 });
    S.k.box(w * 0.2, 0.3, 0.2, 0, h + 0.62, 0.2, 0xd9b22a, { camo: 0, grime: 0.4, bevel: 0.02 });
  });
}

export function hvac(S: Site, x: number, y: number, z: number, rotY = 0, big = false): void {
  const p = S.p;
  const s = big ? 1.5 : 1;
  frame(S, x, y, z, rotY, () => {
    S.k.box(1.6 * s, 0.9 * s, 1.1 * s, 0, 0.45 * s, 0, p.light, { camo: 0, grime: 0.7, mat: MAT.steel, bevel: 0.04 });
    S.k.cyl(0.42 * s, 0.42 * s, 0.08, -0.35 * s, 0.93 * s, 0, p.dark, { camo: 0, mat: MAT.dark, seg: 12 });
    S.k.cyl(0.3 * s, 0.3 * s, 0.05, -0.35 * s, 0.97 * s, 0, 0x151515, { camo: 0, mat: MAT.dark, seg: 10 });
    S.k.box(0.5 * s, 0.7 * s, 0.9 * s, 0.5 * s, 0.4 * s, 0, p.metal, { camo: 0, mat: MAT.ribZ, bevel: 0.02 });
    S.k.rod(0.7 * s, 0.9 * s, 0.4 * s, 0.7 * s, 1.5 * s, 0.4 * s, 0.05, p.steel, { mat: MAT.metal, seg: 6 });
  });
}

export function tank(S: Site, x: number, y: number, z: number, r: number, h: number, color?: number): void {
  const p = S.p;
  S.k.cyl(r, r, h, x, y + h / 2 + 0.6, z, color ?? p.light, { camo: 0, grime: 0.7, seg: 20, bevel: 0.1, mat: MAT.steel });
  for (const a of [0, 2, 4]) { const ang = (a / 6) * PI * 2 + 0.3; S.k.rod(x + Math.cos(ang) * r * 0.7, y, z + Math.sin(ang) * r * 0.7, x + Math.cos(ang) * r * 0.75, y + 0.7, z + Math.sin(ang) * r * 0.75, 0.1, p.dark, { mat: MAT.metal, seg: 6 }); }
  S.k.box(0.12, h * 0.9, 0.3, x + r * 0.9, y + h * 0.5, z, p.dark, { camo: 0, mat: MAT.metal, bevel: 0.01, rot: [0, 0, 0] });
}

export function mast(S: Site, x: number, y: number, z: number, h: number, light = true): void {
  const p = S.p;
  const lat = Math.max(0.5, h * 0.035);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) S.k.rod(x + sx * lat, y, z + sz * lat, x + sx * lat * 0.3, y + h, z + sz * lat * 0.3, 0.06, p.steel, { mat: MAT.metal, seg: 5, camo: 0 });
  for (let i = 1; i < 6; i++) {
    const t = i / 6, hh = y + h * t, ww = lat * (1 - t * 0.7);
    S.k.box(ww * 2, 0.05, 0.05, x, hh, z - ww, p.steel, { mat: MAT.metal, camo: 0, bevel: 0 });
    S.k.box(ww * 2, 0.05, 0.05, x, hh, z + ww, p.steel, { mat: MAT.metal, camo: 0, bevel: 0 });
    S.k.box(0.05, 0.05, ww * 2, x - ww, hh, z, p.steel, { mat: MAT.metal, camo: 0, bevel: 0 });
    S.k.box(0.05, 0.05, ww * 2, x + ww, hh, z, p.steel, { mat: MAT.metal, camo: 0, bevel: 0 });
  }
  if (light) S.gl.sphere(0.22, x, y + h + 0.2, z, 0xff3b2a, { camo: 0, grime: 0, seg: 6 });
  S.k.rod(x, y + h, z, x, y + h + 1.2, z, 0.04, p.dark, { mat: MAT.metal, seg: 5 });
}

/** parabolic dish: axis tilted up by `tilt`, facing local +z */
export function dish(S: Site, x: number, y: number, z: number, r: number, tilt: number, rotY: number, kit: Kit = S.k): void {
  const p = S.p;
  const prof: [number, number][] = [[0, 0.02]];
  for (let i = 1; i <= 8; i++) { const t = i / 8; prof.push([r * t, r * 0.22 * t * t]); }
  kit.group(x, y, z, [tilt, rotY, 0], () => {
    kit.lathe(prof, 0, 0, 0, p.light, { camo: 0, grime: 0.4, seg: 24, rot: [PI / 2, 0, 0], mat: MAT.steel });
    kit.rod(0, 0, 0, 0, 0, r * 0.5, 0.05, p.dark, { mat: MAT.metal, seg: 6, camo: 0 });
    kit.box(r * 0.12, r * 0.12, r * 0.14, 0, 0, r * 0.52, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
  });
}

export function flagpole(S: Site, x: number, y: number, z: number, h: number, big = 1): void {
  const p = S.p;
  S.k.cyl(0.14, 0.2, h, x, y + h / 2, z, p.light, { camo: 0, grime: 0.2, mat: MAT.steel, seg: 10 });
  S.k.sphere(0.2, x, y + h + 0.1, z, 0xd4af37, { camo: 0, grime: 0, mat: MAT.metal, seg: 8 });
  S.k.box(0.9, 0.3, 0.9, x, y + 0.15, z, p.concrete, { camo: 0, mat: MAT.concrete, bevel: 0.04 });
  S.tm.box(0.05, 1.5 * big, 2.4 * big, x, y + h - 0.9 * big, z + 1.3 * big, TEAM, { camo: 0, grime: 0, bevel: 0.01 });
  S.tm.box(0.05, 0.25 * big, 2.4 * big, x + 0.04, y + h - 1.75 * big, z + 1.3 * big, TEAM, { camo: 0, grime: 0, bevel: 0 });
}

export function lamp(S: Site, x: number, y: number, z: number, h = 6, rotY = 0): void {
  const p = S.p;
  S.k.cyl(0.08, 0.14, h, x, y + h / 2, z, p.dark, { camo: 0, mat: MAT.metal, seg: 8, grime: 0.4 });
  frame(S, x, y + h, z, rotY, () => {
    S.k.box(0.3, 0.12, 1.1, 0, 0.05, 0.4, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
    S.gl.box(0.22, 0.04, 0.7, 0, -0.02, 0.5, 0xffe3a8, { camo: 0, grime: 0, bevel: 0 });
  });
}

export function barrier(S: Site, x: number, z: number, len: number, rotY: number): void {
  const p = S.p;
  frame(S, x, 0.35, z, rotY, () => {
    const n = Math.max(1, Math.round(len / 1.5));
    for (let i = 0; i < n; i++) {
      const px = -len / 2 + (i + 0.5) * (len / n);
      S.k.taper(1.4, 0.7, 1.0, 0.6, 0.4, px, 0.5, 0, p.concrete, { camo: 0, mat: MAT.concrete, grime: 0.7, bevel: 0.04 });
    }
  });
}

export function sandbags(S: Site, x: number, y: number, z: number, len: number, rotY: number, rows = 3): void {
  const p = S.p;
  frame(S, x, y, z, rotY, () => {
    const n = Math.max(2, Math.round(len / 0.58));
    for (let row = 0; row < rows; row++) for (let i = 0; i < n; i++) {
      const off = row % 2 ? 0.29 : 0;
      S.k.box(0.56, 0.22, 0.36, -len / 2 + i * (len / n) + off, 0.11 + row * 0.2, 0, p.canvas, { camo: 0.15, grime: 0.7, bevel: 0.09, mat: MAT.cloth, jitter: 0.1 });
    }
  });
}

export function barrel(S: Site, x: number, y: number, z: number, color = 0x3a4f6a): void {
  S.k.cyl(0.35, 0.35, 0.95, x, y + 0.48, z, color, { camo: 0, grime: 0.7, seg: 12, bevel: 0.03, mat: MAT.metal });
  S.k.torus(0.35, 0.025, x, y + 0.3, z, 0x2a2a2a, { camo: 0, seg: 12 });
  S.k.torus(0.35, 0.025, x, y + 0.65, z, 0x2a2a2a, { camo: 0, seg: 12 });
}

export function container(S: Site, x: number, y: number, z: number, rotY: number, color: number, w = 6, h = 2.5, d = 2.4): void {
  const p = S.p;
  frame(S, x, y, z, rotY, () => {
    S.k.box(w, h, d, 0, h / 2, 0, color, { camo: 0, grime: 0.65, mat: MAT.ribX, bevel: 0.05, jitter: 0.06 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.k.box(0.2, h, 0.2, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1), p.dark, { camo: 0, mat: MAT.dark, bevel: 0.02 });
    S.k.box(0.06, h * 0.84, d * 0.9, w / 2 + 0.01, h / 2, 0, p.steel, { camo: 0, mat: MAT.metal, bevel: 0.01 });
  });
}

export function crates(S: Site, x: number, z: number, n: number, seed: number): void {
  const cols = [0x8a6a3a, 0x5d6a4a, 0x7a5a30, 0x6a6258];
  for (let i = 0; i < n; i++) {
    const a = seed * 3.1 + i * 2.39, r = 0.5 + (i % 4) * 0.9;
    const h = 0.9 + (i % 3) * 0.5;
    S.k.group(x + Math.sin(a) * r, 0.35 + (i % 5 === 4 ? 1.0 : 0), z + Math.cos(a) * r, [0, a, 0], () => {
      S.k.box(1.4, h, 1.4, 0, h / 2, 0, cols[i % 4], { camo: 0, grime: 0.8, bevel: 0.05, jitter: 0.12 });
      S.k.box(1.46, 0.07, 1.46, 0, h * 0.25, 0, 0x2b2b29, { camo: 0, bevel: 0.01 });
      S.k.box(1.46, 0.07, 1.46, 0, h * 0.75, 0, 0x2b2b29, { camo: 0, bevel: 0.01 });
    });
  }
}

/** gable roof along z: base width w, rise h, length d, with overhang */
export function gable(S: Site, w: number, d: number, h: number, y: number, color: number, mat = MAT.ribZ, ov = 0.7, x = 0, z = 0): void {
  S.k.group(x, y, z, [0, 0, 0], () => {
    S.k.prism([[-w / 2 - ov, 0], [w / 2 + ov, 0], [0, h]], d + ov * 2, 0, 0, 0, color, { camo: 0, grime: 0.6, mat, bevel: 0.1, smooth: 10 });
    S.k.box(0.4, 0.22, d + ov * 2 + 0.1, 0, h + 0.05, 0, S.p.dark, { camo: 0, mat: MAT.metal, bevel: 0.03 });
  });
}

/** low-pitch barrel vault roof along z */
export function barrel_roof(S: Site, w: number, d: number, rise: number, y: number, color: number, mat = MAT.ribX, x = 0, z = 0): void {
  S.k.loft([
    { z: -d / 2, w: w / 2, ht: rise, hb: 0.02, y, n: 2.2, hard: true },
    { z: d / 2, w: w / 2, ht: rise, hb: 0.02, y, n: 2.2 },
  ], x, 0, z, color, { seg: 28, camo: 0, grime: 0.5, mat, capStart: true, capEnd: true });
}

/** hyperboloid cooling tower */
export function coolingTower(S: Site, x: number, z: number, R: number, H: number, color: number): void {
  const prof: [number, number][] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = R * (1 - 0.34 * Math.sin(Math.min(1, t * 1.15) * PI * 0.62) + 0.08 * t * t);
    prof.push([r, t * H]);
  }
  prof.unshift([0, 0]);
  S.k.lathe(prof, x, 0.3, z, color, { camo: 0, grime: 0.7, seg: 28, mat: MAT.concrete });
  for (let i = 3; i < n; i += 3) S.k.torus(prof[i + 1][0] + 0.05, 0.1, x, 0.3 + (i / n) * H, z, S.p.concrete, { camo: 0, grime: 0.7, seg: 28, mat: MAT.concrete });
  S.k.torus(prof[n + 1][0] + 0.1, 0.16, x, 0.3 + H, z, S.p.dark, { camo: 0, grime: 0.6, seg: 28, mat: MAT.concrete });
  S.gl.cyl(prof[n + 1][0] * 0.96, prof[n + 1][0] * 0.96, 0.4, x, 0.3 + H + 0.2, z, 0xd8f0ff, { camo: 0, grime: 0, seg: 16, bevel: 0 });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; S.k.box(1.4, R * 0.5, 0.5, x + Math.cos(a) * R * 0.98, 0.3 + R * 0.25, z + Math.sin(a) * R * 0.98, S.p.dark, { camo: 0, grime: 0.8, mat: MAT.dark, bevel: 0.03, rot: [0, -a, 0] }); } // inlet arches
}

export function pipeRun(S: Site, pts: [number, number, number][], r: number, color?: number): void {
  S.k.sweep(pts, r, color ?? S.p.steel, { mat: MAT.steel, camo: 0, grime: 0.5, seg: 8 });
}

export function gantry(S: Site, x: number, z: number, span: number, h: number, len: number): void {
  const p = S.p;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    S.k.box(0.5, h, 0.5, x + sx * span / 2, h / 2 + 0.3, z + sz * len / 2, p.accent, { camo: 0, grime: 0.6, bevel: 0.04 });
  }
  for (const sz of [-1, 1]) S.k.box(span + 0.8, 0.7, 0.7, x, h + 0.3, z + sz * len / 2, p.accent, { camo: 0, grime: 0.6, bevel: 0.05 });
  for (const sx of [-1, 1]) S.k.box(0.6, 0.6, len, x + sx * span / 2, h + 0.7, z, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 });
  S.k.box(1.4, 0.9, 1.6, x, h + 0.35, z, p.accent, { camo: 0, bevel: 0.05 });
  S.k.rod(x, h, z, x, h - 3.2, z, 0.04, p.dark, { mat: MAT.metal, seg: 4 });
  S.k.box(0.5, 0.5, 0.5, x, h - 3.4, z, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.03 });
}

export function finish(S: Site, height: number): { body: import('three').BufferGeometry; glow: import('three').BufferGeometry; team: import('three').BufferGeometry; height: number } {
  return { body: S.k.build({ aoDist: 2.0 }), glow: S.gl.build({ ao: false }), team: S.tm.build({ ao: false }), height };
}

/** common site dressing: corner lamps, flag, barriers */
export function dress(S: Site, flag = true, lamps = true): void {
  const { w, d } = S;
  if (lamps) for (const sx of [-1, 1]) lamp(S, sx * (w / 2 + 1.0), 0, d / 2 + 1.2, 6.5, sx * 0.6);
  if (flag) flagpole(S, -w / 2 - 0.4, 0, d / 2 + 1.4, 13);
}

