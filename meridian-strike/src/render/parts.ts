import { Kit, MAT, PartOpts } from './kit';

export interface Palette {
  main: number; alt: number; dark: number; metal: number; steel: number; rubber: number; glass: number; light: number; accent: number;
  concrete: number; roof: number; skin: number; trim: number; cloth: number; canvas: number; rust: number;
}

export const PALETTES: Record<string, Palette> = {
  usa: { main: 0x8a7b5a, alt: 0x646a48, dark: 0x25282a, metal: 0x4a4e53, steel: 0x6d7176, rubber: 0x1b1b1c, glass: 0x172733, light: 0xb7b4a6, accent: 0x38463a, concrete: 0xa9a79e, roof: 0x5d656d, skin: 0xc9a07a, trim: 0x5d6b76, cloth: 0x7b7a5c, canvas: 0x6e6b4e, rust: 0x7a4a2e },
  china: { main: 0x55663f, alt: 0x7d7752, dark: 0x1f221f, metal: 0x42474c, steel: 0x666b70, rubber: 0x1a1a1a, glass: 0x1a2a2e, light: 0xaaa89b, accent: 0xa3281f, concrete: 0x8f8e84, roof: 0x7d3027, skin: 0xc7a07a, trim: 0xb08a2e, cloth: 0x56633f, canvas: 0x5d6745, rust: 0x7a4a2e },
  iran: { main: 0x8d805e, alt: 0x66694a, dark: 0x262420, metal: 0x4b4a46, steel: 0x6c6b66, rubber: 0x1c1b1a, glass: 0x1d2a2c, light: 0xc3bba2, accent: 0x2b7a48, concrete: 0xb0a587, roof: 0x80684e, skin: 0xb98f6c, trim: 0x2f6f8f, cloth: 0x6e6a4a, canvas: 0x7a6e4e, rust: 0x7a4a2e },
  neutral: { main: 0xa89f8c, alt: 0x8e8574, dark: 0x2a2825, metal: 0x55575a, steel: 0x74767a, rubber: 0x1c1c1c, glass: 0x22333b, light: 0xd8d4c8, accent: 0xa5412f, concrete: 0xb0ada1, roof: 0x8a4a3a, skin: 0xc9a07a, trim: 0x6d7a82, cloth: 0x8a8470, canvas: 0x8a8068, rust: 0x7a4a2e },
};

export function num(v: unknown, d: number): number { return typeof v === 'number' ? v : d; }
export function seedOf(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 1000 + 1; }

export const TEAM = 0xffffff;
export const PI = Math.PI;

export function clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }

type V2 = [number, number];

/** convex hull of points (monotone chain) */
export function hull2(pts: V2[]): V2[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up: V2[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

export function circlePts(cx: number, cy: number, r: number, n = 14): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

// ------------------------------------------------------------------ wheels & running gear
/** wheel with axis along X, centred at (x,y,z); outer = +1 / -1 side the hub faces */
export function wheel(k: Kit, x: number, y: number, z: number, r: number, w: number, p: Palette, outer = 1, hub = true): void {
  k.drum(r, w, x, y, z, p.rubber, { mat: MAT.rubber, seg: r > 0.5 ? 20 : 14, bevel: Math.min(0.08, r * 0.16), grime: 0.6, camo: 0 });
  if (hub) {
    k.drum(r * 0.58, w + 0.03, x, y, z, p.steel, { mat: MAT.metal, seg: 12, bevel: 0, grime: 0.4, camo: 0 });
    k.drum(r * 0.22, w + 0.1, x + outer * 0.02, y, z, p.dark, { mat: MAT.metal, seg: 6, bevel: 0, camo: 0 });
    if (r > 0.55) for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      k.drum(r * 0.05, w + 0.08, x + outer * 0.02, y + Math.cos(a) * r * 0.4, z + Math.sin(a) * r * 0.4, p.dark, { mat: MAT.metal, seg: 5, bevel: 0, camo: 0 });
    }
  }
}

/** one tracked running gear side: loop prism (tracks), road wheels, sprocket, idler, return rollers */
export function trackSide(k: Kit, s: number, L: number, tw: number, x: number, rRear: number, rFront: number, nWheels: number, p: Palette, opt: { skirtLen?: number } = {}): void {
  const zr = -L / 2 + rRear, zf = L / 2 - rFront;
  const pts = hull2([...circlePts(zr, rRear + 0.02, rRear + 0.06, 18), ...circlePts(zf, rFront + 0.02, rFront + 0.06, 18), ...circlePts((zr + zf) / 2, rRear * 2.0 + 0.08, 0.22, 8)]);
  k.group(x, 0, 0, [0, -PI / 2, 0], () => {
    k.prism(pts, tw, 0, 0, 0, p.dark, { mat: MAT.track, camo: 0, grime: 0.75, bevel: 0.06, smooth: 60 });
  });
  const wx = x + s * (tw / 2 + 0.005);
  const span = zf - zr;
  const wr = Math.min(rRear, rFront) * 0.8;
  for (let i = 0; i < nWheels; i++) {
    const z = zr + rRear * 1.1 + ((span - rRear * 1.1 - rFront * 1.0) * i) / Math.max(1, nWheels - 1);
    wheel(k, wx, wr + 0.05, z, wr, 0.1, p, s);
  }
  // sprocket + idler outer discs
  wheel(k, wx, rRear + 0.05, zr, rRear * 0.8, 0.1, p, s);
  wheel(k, wx, rFront + 0.05, zf, rFront * 0.8, 0.1, p, s);
  // return rollers
  for (let i = 0; i < 3; i++) {
    const z = zr + 0.9 + (span - 1.8) * (i / 2);
    k.drum(0.14, 0.14, wx, rRear * 2 + 0.2, z, p.steel, { mat: MAT.metal, seg: 8, camo: 0, bevel: 0.01 });
  }
  void opt;
}

// ------------------------------------------------------------------ small hardware
export function hatch(k: Kit, x: number, y: number, z: number, r: number, p: Palette, open = false): void {
  k.cyl(r, r * 1.08, 0.12, x, y + 0.06, z, p.main, { seg: 16, bevel: 0.03 });
  k.cyl(r * 0.8, r * 0.8, 0.05, x, y + 0.14, z, p.dark, { seg: 12, bevel: 0.01, camo: 0, mat: MAT.dark });
  k.box(r * 0.5, 0.04, 0.05, x, y + 0.18, z, p.steel, { camo: 0, mat: MAT.metal, bevel: 0.005 });
  if (open) k.box(r * 1.8, 0.06, r * 1.6, x, y + 0.5, z - r * 0.9, p.main, { rot: [-1.1, 0, 0] });
}

export function whip(k: Kit, tm: Kit | null, x: number, y: number, z: number, h: number, p: Palette, lean = 0): void {
  k.cyl(0.05, 0.07, 0.18, x, y + 0.09, z, p.dark, { camo: 0, seg: 8 });
  k.rod(x, y + 0.18, z, x + lean, y + h, z, 0.012, p.dark, { camo: 0, mat: MAT.metal, seg: 5, rb: 0.022 });
  if (tm) tm.box(0.02, 0.22, 0.38, x + lean, y + h - 0.2, z - 0.2, TEAM, { camo: 0, grime: 0, bevel: 0 });
}

export function smokeLaunchers(k: Kit, x: number, y: number, z: number, n: number, dir: number, p: Palette, rotY = 0): void {
  k.group(x, y, z, [0, rotY, 0], () => {
    for (let i = 0; i < n; i++) {
      k.pipe(0.05, 0.28, dir * 0.0, 0.08 * (i % 2), (i - (n - 1) / 2) * 0.13, p.dark, { camo: 0, mat: MAT.metal, seg: 7, rot: [PI / 2 - 0.5, dir * 0.3, 0] });
    }
    k.box(0.1, 0.09, n * 0.13 + 0.06, 0, -0.06, 0, p.dark, { camo: 0, mat: MAT.metal });
  });
}

export function eraTiles(k: Kit, x: number, y: number, z: number, cols: number, rows: number, tw: number, th: number, rot: [number, number, number], p: Palette, thick = 0.12): void {
  k.group(x, y, z, rot, () => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      k.box(tw * 0.92, th * 0.92, thick, (c - (cols - 1) / 2) * tw, (r - (rows - 1) / 2) * th, 0, (r + c) % 2 ? p.dark : 0x2d3128, { camo: 0, grime: 0.5, bevel: 0.012, jitter: 0.12 });
    }
  });
}

export function jerrycan(k: Kit, x: number, y: number, z: number, p: Palette, rotY = 0, col = 0): void {
  k.group(x, y, z, [0, rotY, 0], () => {
    k.box(0.2, 0.34, 0.34, 0, 0.17, 0, col || p.alt, { camo: 0.3, bevel: 0.02, grime: 0.6 });
    k.box(0.1, 0.05, 0.08, 0.03, 0.36, 0.1, p.dark, { camo: 0, bevel: 0.01 });
  });
}

export function crate(k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, col: number, rotY = 0): void {
  k.group(x, y, z, [0, rotY, 0], () => {
    k.box(w, h, d, 0, h / 2, 0, col, { camo: 0, grime: 0.7, bevel: 0.03, jitter: 0.12 });
    k.box(w + 0.04, 0.05, d + 0.04, 0, h * 0.2, 0, 0x2a2a28, { camo: 0, grime: 0.6, bevel: 0.01 });
    k.box(w + 0.04, 0.05, d + 0.04, 0, h * 0.8, 0, 0x2a2a28, { camo: 0, grime: 0.6, bevel: 0.01 });
  });
}

export function bedroll(k: Kit, x: number, y: number, z: number, len: number, r: number, col: number): void {
  k.drum(r, len, x, y, z, col, { camo: 0.3, grime: 0.7, seg: 10, bevel: 0.02, mat: MAT.cloth });
}

export function tarpBundle(k: Kit, x: number, y: number, z: number, w: number, d: number, col: number, rot: [number, number, number] = [0, 0, 0]): void {
  k.box(w, 0.2, d, x, y, z, col, { camo: 0.4, grime: 0.6, bevel: 0.07, mat: MAT.cloth, rot });
}

/** row of vent slats (engine deck grilles) */
export function grille(k: Kit, x: number, y: number, z: number, w: number, d: number, n: number, p: Palette, rot: [number, number, number] = [0, 0, 0]): void {
  k.group(x, y, z, rot, () => {
    k.box(w, 0.05, d, 0, 0, 0, p.dark, { camo: 0, mat: MAT.dark, bevel: 0.01 });
    for (let i = 0; i < n; i++) k.box(w * 0.94, 0.045, (d / n) * 0.4, 0, 0.04, -d / 2 + (d / n) * (i + 0.5), p.steel, { camo: 0, mat: MAT.metal, bevel: 0.008, rot: [0.25, 0, 0] });
  });
}

export function headlight(k: Kit, x: number, y: number, z: number, p: Palette, size = 0.14): void {
  k.box(size * 1.4, size, size * 0.6, x, y, z, p.dark, { camo: 0, bevel: 0.01 });
  k.box(size * 1.1, size * 0.7, size * 0.3, x, y, z + size * 0.3, 0xfff1c9, { camo: 0, grime: 0, mat: MAT.emit, bevel: 0 });
}

export function pennant(tm: Kit, x: number, y: number, z: number, w = 0.45, h = 0.28): void {
  tm.box(0.02, h, w, x, y, z, TEAM, { camo: 0, grime: 0, bevel: 0 });
}

export type { PartOpts };
