import * as THREE from 'three';
import type { BuiltMap } from '../maps/maps';
import { Noise2D, mulberry32 } from '../procgen/noise';
import { GeoBuilder } from './geo';
import { patchFog } from './fog';

function propMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => patchFog(sh);
  return m;
}

export interface PropMaterials { all: THREE.Material[] }

/** Boulders + vegetation scattered by the map definition (purely decorative). */
export function makeProps(built: BuiltMap): { group: THREE.Group; materials: THREE.Material[] } {
  const { def, hf } = built;
  const group = new THREE.Group();
  const mats: THREE.Material[] = [];
  const rnd = mulberry32(def.seed + 77);
  const n = new Noise2D(def.seed + 5);
  const wl = def.waterLevel ?? -1e9;

  const blocked = (x: number, z: number): boolean => {
    for (const s of def.spawns) if (Math.hypot(x - s[0], z - s[1]) < 95) return true;
    for (const d of def.depots) if (Math.hypot(x - d[0], z - d[1]) < 22) return true;
    for (const d of def.derricks) if (Math.hypot(x - d[0], z - d[1]) < 18) return true;
    for (const c of def.civ) if (Math.abs(x - c.x) < 22 && Math.abs(z - c.z) < 22) return true;
    return false;
  };

  // rocks
  {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + n.fbm(x * 1.7, z * 1.7 + y, 3) * 0.55;
      p.setXYZ(i, x * d, y * d * 0.75, z * d);
    }
    geo.computeVertexNormals();
    const col = new Float32Array(p.count * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = propMaterial();
    mats.push(mat);
    const count = def.props.rocks;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    let placed = 0, tries = 0;
    const base = def.biome === 'highland' ? [0.0, 0.0, 0.3] : def.biome === 'urban' ? [0.0, 0.0, 0.3] : [0.07, 0.3, 0.3];
    while (placed < count && tries++ < count * 25) {
      const x = (rnd() - 0.5) * hf.size * 0.94, z = (rnd() - 0.5) * hf.size * 0.94;
      if (blocked(x, z)) continue;
      const y = hf.heightAt(x, z);
      if (y < wl + 0.5) continue;
      const s = 0.6 + Math.pow(rnd(), 3) * 5.5;
      e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y + s * 0.15, z), q, new THREE.Vector3(s * (0.8 + rnd() * 0.5), s, s * (0.8 + rnd() * 0.5)));
      mesh.setMatrixAt(placed, m);
      c.setHSL(base[0] + rnd() * 0.03, base[1] + rnd() * 0.15, 0.2 + rnd() * 0.14);
      mesh.setColorAt(placed, c);
      placed++;
    }
    mesh.count = placed;
    group.add(mesh);
  }

  // trees
  if (def.props.treeKind !== 'none' && def.props.trees > 0) {
    const b = new GeoBuilder(0, 0.2, 3);
    const kind = def.props.treeKind;
    if (kind === 'pine') {
      b.cyl(0.25, 0.4, 3, 0, 1.5, 0, 0x4a3828, { camo: 0 });
      for (let i = 0; i < 5; i++) b.cone(3.2 - i * 0.55, 3.4, 0, 3.0 + i * 1.9, 0, i % 2 ? 0x24402a : 0x2b4a30, { camo: 0 });
    } else if (kind === 'palm') {
      b.cyl(0.18, 0.32, 7, 0, 3.5, 0, 0x7a6a4a, { camo: 0, rot: [0, 0, 0.12] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.box(0.5, 0.08, 4.0, Math.sin(a) * 1.8, 7.2, Math.cos(a) * 1.8, 0x3f7a2a, { camo: 0, rot: [0.5, a, 0] });
      }
    } else {
      b.cyl(0.3, 0.45, 3.5, 0, 1.75, 0, 0x5a4330, { camo: 0 });
      b.sphere(2.6, 0, 5.0, 0, 0x3d6a2a, { camo: 0 });
      b.sphere(2.0, 1.4, 4.3, 0.6, 0x477a31, { camo: 0 });
      b.sphere(1.8, -1.3, 4.5, -0.8, 0x366326, { camo: 0 });
    }
    const geo = b.build();
    const mat = propMaterial();
    mats.push(mat);
    const count = def.props.trees;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 40) {
      const x = (rnd() - 0.5) * hf.size * 0.92, z = (rnd() - 0.5) * hf.size * 0.92;
      if (blocked(x, z)) continue;
      const y = hf.heightAt(x, z);
      if (y < wl + 1.2) continue;
      if (hf.slopeAt(x, z) > 0.35) continue;
      const dens = def.props.treeAt ? def.props.treeAt(x, z, n) : 0.5;
      if (rnd() > dens) continue;
      const s = 0.8 + rnd() * 0.7;
      e.set(0, rnd() * Math.PI * 2, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y - 0.1, z), q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.3), s));
      mesh.setMatrixAt(placed, m);
      c.setRGB(0.85 + rnd() * 0.3, 0.85 + rnd() * 0.3, 0.85 + rnd() * 0.3);
      mesh.setColorAt(placed, c);
      placed++;
    }
    mesh.count = placed;
    group.add(mesh);
  }
  return { group, materials: mats };
}
