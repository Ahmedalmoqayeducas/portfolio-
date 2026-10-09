import * as THREE from 'three';
import { Terrain } from './terrain';
import { Noise2D, mulberry32 } from '../procgen/noise';

/** Scatter instanced boulders over the terrain (outside the central basin). */
export function makeRocks(terrain: Terrain, count: number, seed: number): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const n = new Noise2D(seed);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + n.fbm(x * 1.7, z * 1.7 + y, 3) * 0.55;
    p.setXYZ(i, x * d, y * d * 0.75, z * d);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const rnd = mulberry32(seed);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  let placed = 0;
  let tries = 0;
  while (placed < count && tries++ < count * 20) {
    const x = (rnd() - 0.5) * terrain.size * 0.92;
    const z = (rnd() - 0.5) * terrain.size * 0.92;
    if (Math.hypot(x, z) < 60) continue;
    const s = 0.6 + Math.pow(rnd(), 3) * 5.5;
    const y = terrain.heightAt(x, z);
    e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y + s * 0.15, z), q, new THREE.Vector3(s * (0.8 + rnd() * 0.5), s, s * (0.8 + rnd() * 0.5)));
    mesh.setMatrixAt(placed, m);
    col.setHSL(0.07 + rnd() * 0.03, 0.25 + rnd() * 0.15, 0.22 + rnd() * 0.14);
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
