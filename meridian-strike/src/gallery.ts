import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { DEF_LIST } from './sim/defs';
import { getModel } from './render/models';
import { makeGlowMaterial, makeTeamMaterial, makeUnitMaterial, shared, UnitStyle } from './render/materials';
import type { Engine } from './game/engine';

/**
 * Debug view: every procedural model on a grid (?gallery=usa|china|iran|neutral).
 * Extra params: only=<def id> (single model close-up), yaw=<deg>, pitch=<deg>, still=1, z=<row focus>, d=<distance>, hour=<0-24>
 */
export function runGallery(engine: Engine, faction: string, colorHex = 0x3d7bff): void {
  const r = engine.renderer;
  const q = new URLSearchParams(location.search);
  r.setSize(window.innerWidth, window.innerHeight);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.8;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const hour = Number(q.get('hour') ?? 14);
  const sky = new Sky();
  sky.scale.setScalar(5000);
  const su = sky.material.uniforms;
  su['turbidity'].value = 6; su['rayleigh'].value = 1.4; su['mieCoefficient'].value = 0.005; su['mieDirectionalG'].value = 0.8;
  const elev = Math.max(8, Math.sin(((hour - 6) / 12) * Math.PI) * 60);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(210));
  su['sunPosition'].value.copy(sunDir);
  scene.add(sky);
  const pm = new THREE.PMREMGenerator(r);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  scene.environment = pm.fromScene(envScene, 0, 1, 10000).texture;
  scene.environmentIntensity = 0.6;
  scene.fog = new THREE.Fog(0xb9b3a4, 300, 1600);
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
  sun.position.copy(sunDir).multiplyScalar(200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const only = q.get('only');
  const defs = only ? DEF_LIST.filter((d) => d.id === only) : DEF_LIST.filter((d) => d.faction === faction);
  const units = defs.filter((d) => d.kind === 'unit');
  const structs = defs.filter((d) => d.kind === 'structure');
  const mats: Record<string, THREE.MeshStandardMaterial> = {};
  const matFor = (f: string) => { const k = (f === 'usa' || f === 'china' || f === 'iran' ? f : 'neutral') as UnitStyle; return (mats[k] ??= makeUnitMaterial({ style: k })); };
  const matT = makeTeamMaterial(), matG = makeGlowMaterial();
  matT.color.set(colorHex);
  matG.color.setScalar(0.5);
  const spin: THREE.Object3D[] = [];
  const rotors: { o: THREE.Object3D; speed: number; axis: 'x' | 'y' | 'z' }[] = [];
  const labels: { pos: THREE.Vector3; text: string }[] = [];
  const place = (list: typeof defs, row0: number, spacing: number, perRow: number) => {
    list.forEach((d, i) => {
      const m = getModel(d);
      const matB = matFor(d.faction);
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, piv?: [number, number, number]) => {
        const me = new THREE.Mesh(geo, mat);
        me.castShadow = true; me.receiveShadow = true;
        if (piv) me.position.set(...piv);
        g.add(me);
        return me;
      };
      add(m.body, matB);
      if (m.turret && m.turretPivot) {
        add(m.turret, matB, m.turretPivot);
        if (m.teamTurret) add(m.teamTurret, matT, m.turretPivot);
      }
      if (m.team) add(m.team, matT);
      if (m.glow) add(m.glow, matG);
      if (m.rotor && m.rotorPivot) rotors.push({ o: add(m.rotor, matB, m.rotorPivot), speed: m.rotorSpeed ?? 20, axis: m.rotorAxis ?? 'y' });
      if (m.rotor2 && m.rotor2Pivot) rotors.push({ o: add(m.rotor2, matB, m.rotor2Pivot), speed: m.rotor2Speed ?? 30, axis: m.rotor2Axis ?? 'x' });
      const s = m.scale ?? 1;
      g.scale.setScalar(s);
      const col = i % perRow, row = Math.floor(i / perRow);
      const bob = d.layer === 'air' ? 10 : 0;
      g.position.set(only ? 0 : col * spacing - ((perRow - 1) * spacing) / 2, bob, only ? 0 : row0 + row * spacing);
      scene.add(g);
      spin.push(g);
      labels.push({ pos: g.position.clone().add(new THREE.Vector3(0, -3, spacing * 0.35)), text: d.name });
    });
  };
  if (only) place(defs, 0, 24, 1);
  else {
    place(units, 0, 24, 7);
    place(structs, 24 * Math.ceil(units.length / 7) + 30, 56, 5);
  }
  if (q.has('sheet')) { runSheet(r, scene, spin, [...units, ...structs], labels, q); return; }
  const cam = new THREE.PerspectiveCamera(only ? 32 : 45, window.innerWidth / window.innerHeight, 0.5, 4000);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;color:#fff;font:12px sans-serif;text-shadow:0 0 3px #000';
  document.body.appendChild(overlay);
  const lbls = only ? [] : labels.map((l) => { const e = document.createElement('div'); e.textContent = l.text; e.style.cssText = 'position:absolute;transform:translate(-50%,0);white-space:nowrap'; overlay.appendChild(e); return e; });
  let t = 0;
  const focus = Number(q.get('z') ?? 0);
  const dist = Number(q.get('d') ?? 180);
  const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 35));
  const pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 25));
  let target = new THREE.Vector3();
  let camDist = dist;
  if (only && spin[0]) {
    const box = new THREE.Box3().setFromObject(spin[0]);
    target = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    camDist = Number(q.get('d') ?? Math.max(size.x, size.y * 1.6, size.z) * 1.35 + 4);
  }
  const loop = () => {
    t += 0.01;
    shared.time.value = t * 30;
    if (only) {
      const a = q.has('still') ? yaw : yaw + t * 0.4;
      cam.position.set(target.x + Math.sin(a) * Math.cos(pitch) * camDist, target.y + Math.sin(pitch) * camDist, target.z + Math.cos(a) * Math.cos(pitch) * camDist);
      cam.lookAt(target);
    } else {
      cam.position.set(0, 70 + dist * 0.2, focus + dist);
      cam.lookAt(0, 0, focus + 20);
      for (const g of spin) g.rotation.y = q.has('still') ? 0.6 : t;
    }
    for (const ro of rotors) ro.o.rotation[ro.axis] = t * ro.speed * 4;
    labels.forEach((l, i) => {
      if (!lbls[i]) return;
      const p = l.pos.clone().project(cam);
      lbls[i].style.left = (p.x * 0.5 + 0.5) * window.innerWidth + 'px';
      lbls[i].style.top = (-p.y * 0.5 + 0.5) * window.innerHeight + 'px';
    });
    r.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
}

/** contact sheet: each model gets its own tile / camera (?sheet=1&cols=4&rows=3&p=0&yaw=35&pitch=25) */
function runSheet(r: THREE.WebGLRenderer, scene: THREE.Scene, groups: THREE.Object3D[], defs: { name: string; id: string }[], labels: { text: string }[], q: URLSearchParams): void {
  const cols = Number(q.get('cols') ?? 4), rows = Number(q.get('rows') ?? 3), page = Number(q.get('p') ?? 0);
  const yaw = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 35)), pitch = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 28));
  const W = window.innerWidth, H = window.innerHeight;
  const tw = W / cols, th = H / rows;
  const cam = new THREE.PerspectiveCamera(30, tw / th, 0.5, 4000);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;color:#fff;font:13px sans-serif;text-shadow:0 0 3px #000';
  document.body.appendChild(overlay);
  const per = cols * rows;
  const items = groups.map((g, i) => ({ g, def: defs[i], label: labels[i] })).slice(page * per, page * per + per);
  items.forEach((it, i) => {
    const e = document.createElement('div');
    e.textContent = it.def.name;
    e.style.cssText = `position:absolute;left:${(i % cols) * tw + 8}px;top:${Math.floor(i / cols) * th + 6}px`;
    overlay.appendChild(e);
  });
  const boxes = items.map((it) => { it.g.position.set(0, 0, 0); it.g.rotation.set(0, 0, 0); return new THREE.Box3().setFromObject(it.g); });
  let t = 0;
  r.setScissorTest(true);
  const loop = () => {
    t += 0.01;
    shared.time.value = t * 30;
    r.setClearColor(0x000000, 0);
    items.forEach((it, i) => {
      for (const o of groups) o.visible = o === it.g;
      const bx = boxes[i];
      const ctr = bx.getCenter(new THREE.Vector3()), size = bx.getSize(new THREE.Vector3());
      const dist = Math.max(size.x, size.y * 1.5, size.z) * 1.45 + 3;
      const a = yaw;
      cam.position.set(ctr.x + Math.sin(a) * Math.cos(pitch) * dist, ctr.y + Math.sin(pitch) * dist, ctr.z + Math.cos(a) * Math.cos(pitch) * dist);
      cam.lookAt(ctr);
      const x = (i % cols) * tw, y = H - (Math.floor(i / cols) + 1) * th;
      r.setViewport(x, y, tw, th); r.setScissor(x, y, tw, th);
      r.render(scene, cam);
    });
    requestAnimationFrame(loop);
  };
  loop();
}
