import * as THREE from 'three';
import { Terrain } from './render/terrain';
import { Environment } from './render/environment';
import { PostStack, Preset } from './render/post';
import { makeRocks } from './render/props';
import { makeTank, makeTankMaterials } from './procgen/tank';
import { RtsCamera } from './engine/rtsCamera';
import { PerfOverlay } from './ui/perf';

const params = new URLSearchParams(location.search);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const terrain = new Terrain({ size: 1024, resolution: 513, seed: 1337 });
const rts = new RtsCamera(renderer.domElement, terrain);
const env = new Environment(renderer, scene, rts.camera);
const post = new PostStack(renderer, scene, rts.camera);
const perf = new PerfOverlay(renderer);

scene.add(terrain.mesh);
env.setupMaterial(terrain.mesh.material as THREE.Material);

const rocks = makeRocks(terrain, 1400, 99);
scene.add(rocks);
env.setupMaterial(rocks.material as THREE.Material);

// M0 showcase: a column of placeholder tanks so lighting / shadows / AO can be judged.
const tankMats = makeTankMaterials(0x5b6040);
Object.values(tankMats).forEach((m) => env.setupMaterial(m));
for (let r = 0; r < 4; r++) {
  for (let c = 0; c < 6; c++) {
    const t = makeTank(tankMats);
    const x = -25 + c * 10, z = -15 + r * 14;
    t.position.set(x, terrain.heightAt(x, z), z);
    t.rotation.y = 0.15 * Math.sin(r * 3 + c);
    scene.add(t);
  }
}

// ---- settings ---------------------------------------------------------------------------------
let preset: Preset = (params.get('q') as Preset) || 'ultra';
let pixelRatio = 1;
function applyPreset(p: Preset): void {
  preset = p;
  const r = post.setPreset(p);
  env.setShadows(r.shadows);
  pixelRatio = r.pixelRatio;
  resize();
}
function resize(): void {
  const w = window.innerWidth, h = window.innerHeight;
  rts.resize(w, h);
  post.setSize(w, h, pixelRatio);
  env.resize();
}
window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit1') applyPreset('low');
  if (e.code === 'Digit2') applyPreset('medium');
  if (e.code === 'Digit3') applyPreset('high');
  if (e.code === 'Digit4') applyPreset('ultra');
  if (e.code === 'KeyF') perf.toggle();
  if (e.code === 'KeyT') env.setHour(env.hour + 3);
});

env.setHour(Number(params.get('t') ?? 16.5));
applyPreset(preset);
rts.setView(Number(params.get('d') ?? rts.distance), Number(params.get('yaw') ?? rts.yaw));
rts.update(0);

// ---- loop -------------------------------------------------------------------------------------
const clock = new THREE.Clock();
let frameCount = 0;
function frame(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  rts.update(dt);
  env.update();
  renderer.info.reset();
  post.render();
  perf.extra = `Preset ${preset}  Hour ${env.hour.toFixed(1)}`;
  perf.tick(dt);
  frameCount++;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hooks (used by tests/screenshot.mjs)
(window as unknown as Record<string, unknown>).__game = {
  rts, env, terrain, applyPreset, get frames() { return frameCount; }, info: () => ({ ...renderer.info.render }),
};
