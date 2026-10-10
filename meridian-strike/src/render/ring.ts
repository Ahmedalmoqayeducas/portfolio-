import * as THREE from 'three';
import { Noise2D } from '../procgen/noise';
import type { BuiltMap } from '../maps/maps';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Terrain beyond the playable border: a square annulus whose first rows slip under the heightfield mesh
 * (hiding the seam), growing in cell size outwards and rising into a distant mountain ridge that fades
 * into the horizon haze. Heights continue the (clamped) border heights of the heightfield so there is
 * never a cliff into the void.
 */
export function buildRingGeometry(built: BuiltMap, extent = 5600): THREE.BufferGeometry {
  const { hf, def } = built;
  const half = hf.size / 2;
  const hole = half - 14;
  const n = new Noise2D(def.seed + 123);
  const wl = def.waterLevel ?? -1e9;

  // grid lines
  const out: number[] = [];
  let d = 0, s = 8;
  while (d < extent) { out.push(d); d += s; s *= 1.12; }
  out.push(d);
  const inner: number[] = [];
  const cnt = Math.max(2, Math.round((hole * 2) / 8));
  for (let i = 0; i <= cnt; i++) inner.push(-hole + (i / cnt) * hole * 2);
  const neg = out.map((v) => -hole - v).reverse(); // far .. -hole
  const pos = out.map((v) => hole + v);            // hole .. far
  const all = [...neg.slice(0, -1), ...inner, ...pos.slice(1)];

  const pxs: number[] = [], idx: number[] = [];
  const height = (x: number, z: number): number => {
    const cx = Math.max(-half, Math.min(half, x)), cz = Math.max(-half, Math.min(half, z));
    const base = hf.heightAt(cx, cz);
    const dd = Math.hypot(x - cx, z - cz);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (dd < 0.01) {
      // inside the overlap band: bury the ring under the heightfield
      return base - 3.5 * (1 - smooth(hole, half, edge));
    }
    const sea = base < wl;
    const de = sea ? Math.max(0, dd - 450) : dd;
    const rise = de * 0.045;
    const amp = 330 * smooth(40, 1700, de);
    const ridge = n.ridged(x * 0.0009 + 7, z * 0.0009 - 3, 4) * 1.25 - 0.3;
    const bump = n.fbm(x * 0.006, z * 0.006, 4) * 26 * smooth(0, 500, dd);
    const swell = n.fbm(x * 0.0018, z * 0.0018, 3) * 60 * smooth(100, 1500, de);
    return base + rise + amp * Math.max(ridge, -0.1) + bump + swell + smooth(0, 120, dd) * 4;
  };

  const addGrid = (xs: number[], zs: number[]) => {
    const base = pxs.length / 3;
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) pxs.push(xs[i], height(xs[i], zs[j]), zs[j]);
    const W = xs.length;
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < xs.length - 1; i++) {
        const a = base + j * W + i, b = a + 1, c = a + W, e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
    }
  };
  const negZ = neg;                       // far .. -hole
  const posZ = pos;                       // hole .. far
  const innerPlus = [-hole, ...inner.slice(1, -1), hole];
  addGrid(all, negZ);
  addGrid(all, posZ);
  addGrid(neg, innerPlus);
  addGrid(pos, innerPlus);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pxs, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
