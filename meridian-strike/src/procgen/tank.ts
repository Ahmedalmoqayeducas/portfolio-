import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * M0 placeholder MBT, built from parametric parts. The real unit generators (M2+) follow the same
 * pattern: pure function -> THREE.Group, materials passed in so factions can re-skin.
 * All parts are merged per material, so a tank costs 3 draw calls regardless of detail.
 */
export interface TankMaterials {
  hull: THREE.Material;
  dark: THREE.Material;
  metal: THREE.Material;
}

export function makeTankMaterials(color: number): TankMaterials {
  return {
    hull: new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.85, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3b3f42, roughness: 0.45, metalness: 0.8 }),
  };
}

type Bucket = THREE.BufferGeometry[];

function add(bucket: Bucket, geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0): void {
  geo.rotateX(rx);
  geo.rotateZ(rz);
  geo.translate(x, y, z);
  bucket.push(geo.index ? geo.toNonIndexed() : geo);
}

export function makeTank(mats: TankMaterials): THREE.Group {
  const hull: Bucket = [], dark: Bucket = [], metal: Bucket = [];
  // hull, glacis, skirts, running gear
  add(hull, new THREE.BoxGeometry(3.6, 0.9, 7.4), 0, 1.15, 0);
  add(hull, new THREE.BoxGeometry(3.4, 0.55, 2.2), 0, 1.45, 3.4, -0.35);
  for (const s of [-1, 1]) {
    add(dark, new THREE.BoxGeometry(0.75, 1.0, 7.8), s * 2.15, 0.95, 0);
    add(hull, new THREE.BoxGeometry(0.12, 0.7, 6.0), s * 2.55, 1.25, -0.2);
    for (let i = 0; i < 6; i++) add(metal, new THREE.CylinderGeometry(0.42, 0.42, 0.55, 14), s * 2.15, 0.52, -3.0 + i * 1.2, 0, Math.PI / 2);
  }
  // turret + gun (turret group origin offset baked in)
  const ty = 1.9, tz = -0.3;
  add(hull, new THREE.BoxGeometry(2.7, 0.85, 3.4), 0, ty, tz);
  add(hull, new THREE.BoxGeometry(2.5, 0.8, 1.4), 0, ty + 0.05, tz + 1.9, 0.28);
  add(metal, new THREE.BoxGeometry(0.5, 0.35, 0.5), 0.8, ty + 0.62, tz - 0.5);
  add(metal, new THREE.CylinderGeometry(0.12, 0.14, 5.6, 14), 0, ty + 0.05, tz + 4.4, Math.PI / 2);
  add(metal, new THREE.CylinderGeometry(0.19, 0.19, 0.5, 14), 0, ty + 0.05, tz + 7.1, Math.PI / 2);

  const g = new THREE.Group();
  for (const [b, m] of [[hull, mats.hull], [dark, mats.dark], [metal, mats.metal]] as const) {
    const mesh = new THREE.Mesh(mergeGeometries(b, false)!, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
