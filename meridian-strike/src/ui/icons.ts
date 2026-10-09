import * as THREE from 'three';
import { DEF_LIST, DEFS } from '../sim/defs';
import { getModel } from '../render/models';
import { makeUnitMaterial, makeTeamMaterial, makeGlowMaterial } from '../render/materials';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
const cache = new Map<string, string>();

function init(): void {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(112, 112);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a4a3a, 1.6));
  const d = new THREE.DirectionalLight(0xfff0d8, 3.2);
  d.position.set(-6, 10, 8);
  scene.add(d);
  const d2 = new THREE.DirectionalLight(0x8aa8ff, 0.8);
  d2.position.set(8, 2, -6);
  scene.add(d2);
  camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
}

export function getIcon(defId: string, color = 0xffffff): string {
  const key = `${defId}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!renderer) init();
    const def = DEFS.get(defId);
    if (!def) return '';
    const model = getModel(def);
    const g = new THREE.Group();
    const matB = makeUnitMaterial();
    const matT = makeTeamMaterial();
    matT.color.set(color);
    const body = new THREE.Mesh(model.body, matB);
    g.add(body);
    if (model.turret && model.turretPivot) { const t = new THREE.Mesh(model.turret, matB); t.position.set(...model.turretPivot); g.add(t); }
    if (model.team) { g.add(new THREE.Mesh(model.team, matT)); }
    if (model.glow) { const gm = makeGlowMaterial(); gm.color.setScalar(0.35); g.add(new THREE.Mesh(model.glow, gm)); }
    if (model.rotor && model.rotorPivot) { const r = new THREE.Mesh(model.rotor, matB); r.position.set(...model.rotorPivot); g.add(r); }
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const R = Math.max(size.x, size.y * 1.3, size.z) * 0.5 + 0.5;
    scene.add(g);
    const dist = (R / Math.tan((30 * Math.PI) / 360)) * 1.12;
    const dir = new THREE.Vector3(0.62, 0.52, 0.85).normalize();
    camera.position.copy(ctr).addScaledVector(dir, dist);
    camera.lookAt(ctr);
    camera.updateProjectionMatrix();
    renderer!.render(scene, camera);
    const url = renderer!.domElement.toDataURL('image/png');
    scene.remove(g);
    matB.dispose(); matT.dispose();
    cache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

export function unitDefsFor(faction: string) {
  return DEF_LIST.filter((d) => d.faction === faction);
}
