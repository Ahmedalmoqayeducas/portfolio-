import * as THREE from 'three';
import { DEF_LIST } from './sim/defs';
import { getModel } from './render/models';
import { makeGlowMaterial, makeTeamMaterial, makeUnitMaterial } from './render/materials';
import type { Engine } from './game/engine';

/** Debug view: every procedural model on a grid (?gallery=usa|china|iran|neutral). */
export function runGallery(engine: Engine, faction: string, colorHex = 0x3d7bff): void {
  const r = engine.renderer;
  r.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa6b8);
  scene.fog = new THREE.Fog(0x8fa6b8, 200, 900);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6a5a48, 1.7));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
  sun.position.set(-60, 120, 80);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x9a8c70, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const defs = DEF_LIST.filter((d) => d.faction === faction);
  const units = defs.filter((d) => d.kind === 'unit');
  const structs = defs.filter((d) => d.kind === 'structure');
  const matB = makeUnitMaterial(), matT = makeTeamMaterial(), matG = makeGlowMaterial();
  matT.color.set(colorHex);
  matG.color.setScalar(0.5);
  const spin: THREE.Object3D[] = [];
  const labels: { pos: THREE.Vector3; text: string }[] = [];
  const place = (list: typeof defs, row0: number, spacing: number, perRow: number) => {
    list.forEach((d, i) => {
      const m = getModel(d);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(m.body, matB));
      if (m.turret && m.turretPivot) { const t = new THREE.Mesh(m.turret, matB); t.position.set(...m.turretPivot); g.add(t); }
      if (m.team) g.add(new THREE.Mesh(m.team, matT));
      if (m.glow) g.add(new THREE.Mesh(m.glow, matG));
      if (m.rotor && m.rotorPivot) { const rt = new THREE.Mesh(m.rotor, matB); rt.position.set(...m.rotorPivot); g.add(rt); }
      const sc = m.scale ?? 1;
      g.scale.setScalar(sc);
      const col = i % perRow, row = Math.floor(i / perRow);
      g.position.set(col * spacing - ((perRow - 1) * spacing) / 2, d.layer === 'air' ? 14 : 0, row0 + row * spacing);
      scene.add(g);
      spin.push(g);
      labels.push({ pos: g.position.clone().add(new THREE.Vector3(0, -3, spacing * 0.35)), text: d.name });
    });
  };
  place(units, 0, 24, 7);
  place(structs, 24 * Math.ceil(units.length / 7) + 30, 56, 5);
  const cam = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3000);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;color:#fff;font:12px sans-serif;text-shadow:0 0 3px #000';
  document.body.appendChild(overlay);
  const lbls = labels.map((l) => { const e = document.createElement('div'); e.textContent = l.text; e.style.cssText = 'position:absolute;transform:translate(-50%,0);white-space:nowrap'; overlay.appendChild(e); return e; });
  let t = 0;
  const q = new URLSearchParams(location.search);
  const focus = Number(q.get('z') ?? 0);
  const dist = Number(q.get('d') ?? 180);
  const loop = () => {
    t += 0.01;
    cam.position.set(Math.sin(t * 0.25) * 30 * 0, 70 + dist * 0.2, focus + dist);
    cam.lookAt(0, 0, focus + 20);
    for (const g of spin) if (g.position.y === 0 || true) g.rotation.y = q.has('still') ? 0.6 : t;
    labels.forEach((l, i) => {
      const p = l.pos.clone().project(cam);
      lbls[i].style.left = (p.x * 0.5 + 0.5) * window.innerWidth + 'px';
      lbls[i].style.top = (-p.y * 0.5 + 0.5) * window.innerHeight + 'px';
    });
    r.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
}
