import * as THREE from 'three';
import { DEF_LIST } from '../sim/defs';
import { ENT_STRIDE, F_BUILDING, F_DAMAGED, F_DEPLOYED, F_GHOST, F_MOVING, F_STEALTH, F_STUNNED, F_UNPOWERED, PROJ_STRIDE, Snapshot } from '../sim/types';
import { getModel, ModelData } from './models';
import { makeGlowMaterial, makeTeamMaterial, makeUnitMaterial, shared, UnitStyle } from './materials';
import { patchFog } from './fog';
import type { Vfx } from './vfx';
import type { Terrain } from './terrain';

export interface EntView {
  id: number;
  def: number;
  owner: number;
  x: number; y: number; z: number; h: number; t: number;
  px: number; py: number; pz: number; ph: number; pt: number;
  hp: number; flags: number; prog: number; vet: number; ammo: number; cargo: number; speed: number; aux: number;
  seen: number;
  roll: number; pitch: number;
  /** animation state: walk/track amount and phase */
  aAmt: number; aPhase: number;
  // interpolated (written each frame)
  ix: number; iy: number; iz: number; ih: number; it: number;
}

interface Part {
  mesh: THREE.InstancedMesh;
  count: number;
  cap: number;
  /** per-instance animation (walk amount, phase) for the unit shader */
  anim?: THREE.InstancedBufferAttribute;
}

interface Bucket {
  defIdx: number;
  model: ModelData;
  body: Part;
  turret?: Part;
  team?: Part;
  teamTurret?: Part;
  glow?: Part;
  rotor?: Part;
  rotor2?: Part;
  wreckBody?: Part;
  wreckTurret?: Part;
  radius: number;
  structure: boolean;
  air: boolean;
}

interface Wreck { defIdx: number; x: number; y: number; z: number; h: number; until: number; struct: boolean; turret: number }

const m4 = new THREE.Matrix4();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const e1 = new THREE.Euler();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const AXY = new THREE.Vector3(0, 1, 0);
const AXX = new THREE.Vector3(1, 0, 0);
const AXZ = new THREE.Vector3(0, 0, 1);
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const mLoc = new THREE.Matrix4();
const mWorld = new THREE.Matrix4();
const col = new THREE.Color();

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function setRY(arr: Float32Array, o: number, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number): void {
  const c = Math.cos(ry), s = Math.sin(ry);
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

export class EntityRenderer {
  readonly group = new THREE.Group();
  readonly views = new Map<number, EntView>();
  private buckets = new Map<number, Bucket>();
  private matBodies = new Map<string, THREE.MeshStandardMaterial>();
  private setupMat: (m: THREE.Material) => void;
  private matWreck = makeUnitMaterial({ wreck: true });
  private matTeam = makeTeamMaterial();
  private matGlow = makeGlowMaterial();
  private snapSeq = 0;
  private lastSnapT = 0;
  private snapDt = 1 / 30;
  private wrecks: Wreck[] = [];
  private ringMesh: THREE.InstancedMesh;
  private barMesh: THREE.InstancedMesh;
  private barAttr: THREE.InstancedBufferAttribute;
  private projTracer: THREE.InstancedMesh;
  private projBody: THREE.InstancedMesh;
  playerColors: number[] = [];
  nightGlow = 0.1;
  viewer = 0;
  proj: Float32Array = new Float32Array(0);
  nProj = 0;
  private lastProjPos = new Map<number, [number, number, number]>();

  constructor(private terrain: Terrain, private vfx: Vfx, setupMaterial: (m: THREE.Material) => void, scene: THREE.Scene) {
    this.setupMat = setupMaterial;
    for (const m of [this.matWreck, this.matTeam]) this.hookMaterial(m);
    {
      const prev = this.matGlow.onBeforeCompile;
      this.matGlow.onBeforeCompile = (sh, r) => { prev.call(this.matGlow, sh, r); patchFog(sh); };
    }
    // selection rings
    const ring = new THREE.RingGeometry(0.9, 1.0, 40, 1);
    ring.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }), 3000);
    this.ringMesh.frustumCulled = false; this.ringMesh.renderOrder = 20; this.ringMesh.count = 0;
    // health / progress bars
    const quad = new THREE.PlaneGeometry(1, 1);
    this.barAttr = new THREE.InstancedBufferAttribute(new Float32Array(3000 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute('aBar', this.barAttr);
    this.barMesh = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 aBar; varying vec2 vUv; varying vec4 vBar;
        void main(){
          vUv = uv; vBar = aBar;
          vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float w = instanceMatrix[0][0];
          float pw = 26.0 + w * 1.6;
          c.xy += vec2(position.x * pw, position.y * 5.0) * (-c.z * 0.00104);
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec4 vBar;
        vec3 ramp(float f){ return f > 0.5 ? mix(vec3(1.0,0.85,0.1), vec3(0.2,0.9,0.25), (f-0.5)*2.0) : mix(vec3(0.95,0.15,0.1), vec3(1.0,0.85,0.1), f*2.0); }
        void main(){
          float edge = step(vUv.x, 0.012) + step(0.988, vUv.x) + step(vUv.y, 0.12) + step(0.88, vUv.y);
          vec3 c = vUv.x <= vBar.x ? (vBar.y > 0.5 ? vec3(0.3,0.65,1.0) : ramp(vBar.x)) : vec3(0.06,0.06,0.07);
          if (edge > 0.5) c = vec3(0.0);
          gl_FragColor = vec4(c, 0.95);
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    }), 3000);
    this.barMesh.frustumCulled = false; this.barMesh.renderOrder = 21; this.barMesh.count = 0;
    // projectile visuals
    const tg = new THREE.CylinderGeometry(0.09, 0.09, 2.6, 5);
    tg.rotateX(Math.PI / 2);
    this.projTracer = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe3a0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 4000);
    this.projTracer.frustumCulled = false; this.projTracer.count = 0;
    const bg = new THREE.CylinderGeometry(0.2, 0.2, 2.4, 8);
    bg.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.2, 0.7, 8);
    nose.rotateX(Math.PI / 2); nose.translate(0, 0, 1.5);
    const fins = new THREE.BoxGeometry(0.8, 0.05, 0.5); fins.translate(0, 0, -1.0);
    const fins2 = new THREE.BoxGeometry(0.05, 0.8, 0.5); fins2.translate(0, 0, -1.0);
    const merged = mergeSimple([bg, nose, fins, fins2]);
    this.projBody = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.4, metalness: 0.7 }), 2000);
    this.projBody.frustumCulled = false; this.projBody.count = 0;
    this.group.add(this.ringMesh, this.barMesh, this.projTracer, this.projBody);
    scene.add(this.group);
  }

  private hookMaterial(m: THREE.MeshStandardMaterial): void {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { prev.call(m, sh, r); patchFog(sh); };
    this.setupMat(m);
  }

  private bodyMaterial(faction: string): THREE.MeshStandardMaterial {
    const key = faction === 'usa' || faction === 'china' || faction === 'iran' ? faction : 'neutral';
    let m = this.matBodies.get(key);
    if (!m) { m = makeUnitMaterial({ style: key as UnitStyle }); this.hookMaterial(m); this.matBodies.set(key, m); }
    return m;
  }

  private bucket(defIdx: number): Bucket {
    let b = this.buckets.get(defIdx);
    if (b) return b;
    const def = DEF_LIST[defIdx];
    const model = getModel(def);
    const matBody = this.bodyMaterial(def.faction);
    const mk = (geo0: THREE.BufferGeometry, mat: THREE.Material, cast: boolean, cap = 32, animated = false): Part => {
      let geo = geo0;
      let anim: THREE.InstancedBufferAttribute | undefined;
      if (animated) {
        // wrapper geometry sharing the vertex buffers, so the per-instance animation attribute is private to this bucket
        geo = new THREE.BufferGeometry();
        for (const k of Object.keys(geo0.attributes)) geo.setAttribute(k, geo0.attributes[k]);
        geo.setIndex(geo0.index);
        geo.boundingSphere = geo0.boundingSphere; geo.boundingBox = geo0.boundingBox;
        anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aAnim', anim);
      }
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = cast; mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      return { mesh, count: 0, cap, anim };
    };
    b = {
      defIdx, model, structure: def.kind === 'structure', air: def.layer === 'air', radius: def.radius,
      body: mk(model.body, matBody, true, 32, !!model.animated),
      turret: model.turret ? mk(model.turret, matBody, true) : undefined,
      team: model.team ? mk(model.team, this.matTeam, false) : undefined,
      teamTurret: model.teamTurret ? mk(model.teamTurret, this.matTeam, false) : undefined,
      glow: model.glow ? mk(model.glow, this.matGlow, false) : undefined,
      rotor: model.rotor ? mk(model.rotor, matBody, true) : undefined,
      rotor2: model.rotor2 ? mk(model.rotor2, matBody, true) : undefined,
    };
    if (b.team) { (b.team.mesh as THREE.InstancedMesh).setColorAt(0, col.set(0xffffff)); }
    if (b.teamTurret) { (b.teamTurret.mesh as THREE.InstancedMesh).setColorAt(0, col.set(0xffffff)); }
    this.buckets.set(defIdx, b);
    return b;
  }

  private ensure(part: Part, need: number, color = false): void {
    if (need <= part.cap) return;
    const cap = Math.max(need, part.cap * 2);
    const old = part.mesh;
    if (part.anim) {
      const na = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
      na.array.set(part.anim.array);
      old.geometry.setAttribute('aAnim', na);
      part.anim = na;
    }
    const mesh = new THREE.InstancedMesh(old.geometry, old.material, cap);
    mesh.frustumCulled = false; mesh.castShadow = old.castShadow; mesh.receiveShadow = old.receiveShadow;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (color) mesh.setColorAt(0, col.set(0xffffff));
    this.group.add(mesh);
    this.group.remove(old);
    old.dispose();
    part.mesh = mesh; part.cap = cap;
  }

  // ---------------------------------------------------------------- snapshots
  onSnapshot(snap: Snapshot, nowSec: number): void {
    this.snapSeq++;
    const dt = nowSec - this.lastSnapT;
    if (this.lastSnapT > 0 && dt > 0.005 && dt < 0.3) this.snapDt = this.snapDt * 0.8 + dt * 0.2;
    this.lastSnapT = nowSec;
    const a = snap.ents;
    for (let i = 0; i < snap.n; i++) {
      const o = i * ENT_STRIDE;
      const id = a[o];
      let v = this.views.get(id);
      if (!v) {
        v = {
          id, def: a[o + 1], owner: a[o + 2], x: a[o + 3], y: a[o + 4], z: a[o + 5], h: a[o + 6], t: a[o + 7],
          px: a[o + 3], py: a[o + 4], pz: a[o + 5], ph: a[o + 6], pt: a[o + 7],
          hp: 1, flags: 0, prog: 1, vet: 0, ammo: 1, cargo: 0, speed: 0, aux: 0, seen: 0, roll: 0, pitch: 0, aAmt: 0, aPhase: id * 1.7,
          ix: 0, iy: 0, iz: 0, ih: 0, it: 0,
        };
        this.views.set(id, v);
      } else {
        v.px = v.ix || v.x; v.py = v.iy || v.y; v.pz = v.iz || v.z; v.ph = v.ih || v.h; v.pt = v.it || v.t;
        v.x = a[o + 3]; v.y = a[o + 4]; v.z = a[o + 5]; v.h = a[o + 6]; v.t = a[o + 7];
      }
      v.owner = a[o + 2];
      v.hp = a[o + 8]; v.flags = a[o + 9]; v.prog = a[o + 10]; v.vet = a[o + 11]; v.ammo = a[o + 12]; v.cargo = a[o + 13]; v.speed = a[o + 14]; v.aux = a[o + 15];
      v.seen = this.snapSeq;
    }
    for (const [id, v] of this.views) if (v.seen !== this.snapSeq) this.views.delete(id);
    this.proj = snap.proj; this.nProj = snap.nProj;
  }

  addWreck(defId: string, x: number, _y: number, z: number, h: number, struct: boolean, nowSec: number): void {
    const idx = DEF_LIST.findIndex((d) => d.id === defId);
    if (idx < 0) return;
    const def = DEF_LIST[idx];
    if (def.move === 'foot') return;
    this.wrecks.push({ defIdx: idx, x, y: this.terrain.heightAt(x, z), z, h, turret: h + (Math.random() - 0.5) * 1.2, until: nowSec + (struct ? 120 : 70), struct });
    if (this.wrecks.length > 400) this.wrecks.shift();
  }

  // ---------------------------------------------------------------- frame
  frame(nowSec: number, dt: number, selected: Set<number>, hover: number): void {
    const alpha = Math.min(1.15, (nowSec - this.lastSnapT) / this.snapDt);
    for (const b of this.buckets.values()) {
      b.body.count = 0;
      if (b.turret) b.turret.count = 0;
      if (b.team) b.team.count = 0;
      if (b.teamTurret) b.teamTurret.count = 0;
      if (b.glow) b.glow.count = 0;
      if (b.rotor) b.rotor.count = 0;
      if (b.rotor2) b.rotor2.count = 0;
      if (b.wreckBody) b.wreckBody.count = 0;
      if (b.wreckTurret) b.wreckTurret.count = 0;
    }
    let rings = 0, bars = 0;
    const barArr = this.barAttr.array as Float32Array;
    const ringMat = this.ringMesh.instanceMatrix.array as Float32Array;
    const barMat = this.barMesh.instanceMatrix.array as Float32Array;
    shared.time.value = nowSec;
    const glowI = this.nightGlow;
    (this.matGlow.color as THREE.Color).setScalar(glowI);

    for (const v of this.views.values()) {
      const def = DEF_LIST[v.def];
      const b = this.bucket(v.def);
      const t = Math.min(1, alpha);
      v.ix = v.px + (v.x - v.px) * t; v.iy = v.py + (v.y - v.py) * t; v.iz = v.pz + (v.z - v.pz) * t;
      v.ih = lerpAngle(v.ph, v.h, t); v.it = lerpAngle(v.pt, v.t, t);
      const structure = b.structure;
      const sc = b.model.scale ?? 1;
      let x = v.ix, y = v.iy, z = v.iz, h = structure ? (def.faction === 'neutral' && def.roles.includes('civilian') ? Math.round(v.ih / (Math.PI / 2)) * (Math.PI / 2) : 0) : v.ih;
      let sy = sc;
      if (structure && (v.flags & F_BUILDING)) sy = sc * (0.12 + 0.88 * v.prog);
      if (b.model.walker && (v.flags & F_MOVING)) y += Math.abs(Math.sin(nowSec * 9 + v.id)) * 0.14;
      const ghost = (v.flags & F_GHOST) !== 0;

      // aircraft attitude from motion
      if (b.air || b.model.flier) {
        let dyaw = v.ih - v.ph; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        const tr = Math.max(-0.7, Math.min(0.7, -dyaw * 7));
        v.roll += (tr - v.roll) * Math.min(1, dt * 5);
        const climb = Math.max(-0.5, Math.min(0.5, (v.y - v.py) * 4));
        v.pitch += (climb - v.pitch) * Math.min(1, dt * 4);
        e1.set(-v.pitch * 0.6, h, v.roll, 'YXZ');
        q1.setFromEuler(e1);
        v1.set(x, y, z); v2.set(sc, sc, sc);
        m4.compose(v1, q1, v2);
        this.put(b.body, m4);
        if (b.team) this.putTeam(b.team, m4, v.owner);
        if (b.rotor) this.spinner(b.rotor, b.model.rotorPivot!, b.model.rotorAxis ?? 'y', nowSec * (b.model.rotorSpeed ?? 20) + v.id, q1, x, y, z, sc);
        if (b.rotor2 && b.model.rotor2Pivot) this.spinner(b.rotor2, b.model.rotor2Pivot, b.model.rotor2Axis ?? 'x', nowSec * (b.model.rotor2Speed ?? 30) + v.id, q1, x, y, z, sc);
        if (v.hp < 0.5 && Math.random() < dt * 14) this.vfx.trail(x, y, z, 'shell');
        continue;
      }

      // body
      this.putRY(b.body, x, y, z, h, sc, sy, sc);
      if (b.body.anim) {
        const moving = (v.flags & F_MOVING) !== 0;
        const kind = b.model.animated;
        if (kind === 'walker') {
          v.aAmt += ((moving ? Math.min(1, 0.35 + v.speed / 5) : 0) - v.aAmt) * Math.min(1, dt * 8);
          v.aPhase += dt * (7 + v.speed * 1.3) * (moving ? 1 : 0.0);
        } else {
          v.aAmt += ((moving ? 1 : 0) - v.aAmt) * Math.min(1, dt * 6);
          v.aPhase += dt * v.speed * 5.45;
        }
        const ai = (b.body.count - 1) * 2;
        const aa = b.body.anim.array as Float32Array;
        aa[ai] = v.aAmt; aa[ai + 1] = v.aPhase;
      }
      if (b.team) this.putTeamRY(b.team, x, y, z, h, sc, sy, sc, v.owner, ghost);
      if (b.glow) this.putRY(b.glow, x, y, z, h, sc, sy, sc);
      if (b.turret && b.model.turretPivot) {
        const p = b.model.turretPivot;
        const c = Math.cos(h), s = Math.sin(h);
        const tx = x + (c * p[0] + s * p[2]) * sc, ty = y + p[1] * sy, tz = z + (-s * p[0] + c * p[2]) * sc;
        this.putRY(b.turret, tx, ty, tz, v.it, sc, sy, sc);
        if (b.teamTurret) this.putTeamRY(b.teamTurret, tx, ty, tz, v.it, sc, sy, sc, v.owner, ghost);
      }
      if (b.rotor && b.model.rotorPivot) {
        const p = b.model.rotorPivot;
        const c = Math.cos(h), s = Math.sin(h);
        const px = x + (c * p[0] + s * p[2]) * sc, py = y + p[1] * sy, pz = z + (-s * p[0] + c * p[2]) * sc;
        const powered = !(v.flags & F_UNPOWERED) && !(v.flags & F_STUNNED) && !(v.flags & F_BUILDING);
        const speed = powered ? (b.model.rotorSpeed ?? 1) : 0;
        if (b.model.rotorRock) {
          q1.setFromAxisAngle(AXY, h);
          q2.setFromEuler(e1.set(Math.sin(nowSec * (speed || 0.0001) * 1.6 + v.id) * 0.35 * (speed ? 1 : 0), 0, 0));
          q1.multiply(q2);
          this.put(b.rotor, m4.compose(v1.set(px, py, pz), q1, v2.set(sc, sc, sc)));
        } else {
          q1.setFromAxisAngle(AXY, h + nowSec * speed + v.id);
          this.put(b.rotor, m4.compose(v1.set(px, py, pz), q1, v2.set(sc, sc, sc)));
        }
      }

      // effects tied to state
      if ((v.flags & F_DAMAGED) && Math.random() < dt * (structure ? 5 : 3)) this.vfx.trail(x + (Math.random() - 0.5) * def.radius * 0.6, y + (structure ? 4 : 2), z + (Math.random() - 0.5) * def.radius * 0.6, 'shell');
      if (!structure && (v.flags & F_MOVING) && v.speed > 2 && def.move !== 'foot' && Math.random() < dt * 7 * Math.min(1, v.speed / 6)) this.vfx.dust(x, y, z - 0, 1);
      void F_STEALTH; void F_DEPLOYED;

      // overlays
      const isSel = selected.has(v.id);
      const owned = v.owner === this.viewer;
      if (isSel && rings < 2999) {
        const r = structure ? Math.max(def.footprint![0], def.footprint![1]) * 0.55 : def.radius * 1.25;
        setRY(ringMat, rings * 16, x, this.terrain.heightAt(x, z) + 0.35, z, 0, r, 1, r);
        this.ringColor(rings, owned ? 0x42ff66 : 0xff4a4a);
        rings++;
      } else if (hover === v.id && rings < 2999) {
        const r = structure ? Math.max(def.footprint![0], def.footprint![1]) * 0.55 : def.radius * 1.25;
        setRY(ringMat, rings * 16, x, this.terrain.heightAt(x, z) + 0.35, z, 0, r, 1, r);
        this.ringColor(rings, owned ? 0x9affb0 : 0xffa0a0);
        rings++;
      }
      const capturing = (v.flags & 1024) !== 0;
      const showBar = (isSel || v.hp < 0.995 || (structure && v.flags & F_BUILDING) || capturing) && !def.prop && bars < 2999 && !(structure && !isSel && !capturing && v.hp >= 0.995 && !(v.flags & F_BUILDING));
      if (showBar) {
        const top = (b.model.height * sy) + (structure ? 3 : 1.5) + (b.air ? 0 : 0);
        const w = Math.min(26, Math.max(4, def.radius * 1.9));
        setRY(barMat, bars * 16, x, y + top, z, 0, w, 1, 1);
        const building = structure && ((v.flags & F_BUILDING) || capturing);
        barArr[bars * 4] = building ? v.prog : v.hp;
        barArr[bars * 4 + 1] = building ? 1 : 0;
        bars++;
      }
    }

    // wrecks
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      if (nowSec > w.until) { this.wrecks.splice(i, 1); continue; }
      const b = this.bucket(w.defIdx);
      if (!b.wreckBody) {
        const mk = (geo: THREE.BufferGeometry): Part => { const mesh = new THREE.InstancedMesh(geo, this.matWreck, 16); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; this.group.add(mesh); return { mesh, count: 0, cap: 16 }; };
        b.wreckBody = mk(b.model.body);
        if (b.model.turret) b.wreckTurret = mk(b.model.turret);
      }
      const sc = b.model.scale ?? 1;
      const sy = w.struct ? 0.22 : 0.8;
      this.putRY(b.wreckBody, w.x, w.y - (w.struct ? 0.2 : 0), w.z, w.struct ? Math.round(w.h / 1.5708) * 1.5708 : w.h, sc, sy * sc, sc);
      if (b.wreckTurret && b.model.turretPivot && !w.struct) {
        const p = b.model.turretPivot, c = Math.cos(w.h), s = Math.sin(w.h);
        this.putRY(b.wreckTurret, w.x + (c * p[0] + s * p[2]) * sc, w.y + p[1] * 0.7, w.z + (-s * p[0] + c * p[2]) * sc, w.turret, sc, sc * 0.8, sc);
      }
    }

    for (const b of this.buckets.values()) {
      this.commit(b.body);
      if (b.turret) this.commit(b.turret);
      if (b.team) { this.commit(b.team); if (b.team.mesh.instanceColor) b.team.mesh.instanceColor.needsUpdate = true; }
      if (b.teamTurret) { this.commit(b.teamTurret); if (b.teamTurret.mesh.instanceColor) b.teamTurret.mesh.instanceColor.needsUpdate = true; }
      if (b.body.anim) b.body.anim.needsUpdate = true;
      if (b.glow) this.commit(b.glow);
      if (b.rotor) this.commit(b.rotor);
      if (b.rotor2) this.commit(b.rotor2);
      if (b.wreckBody) this.commit(b.wreckBody);
      if (b.wreckTurret) this.commit(b.wreckTurret);
    }
    this.ringMesh.count = rings; this.ringMesh.instanceMatrix.needsUpdate = true;
    if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    this.barMesh.count = bars; this.barMesh.instanceMatrix.needsUpdate = true; this.barAttr.needsUpdate = true;
    this.frameProjectiles(alpha, dt);
  }

  private ringColor(i: number, c: number): void {
    col.set(c);
    this.ringMesh.setColorAt(i, col);
  }

  /** a spinning sub-mesh (rotor blades) rotating about `axis` at model-space pivot `piv` of an aircraft transformed by (x,y,z,base,sc) */
  private spinner(part: Part, piv: [number, number, number], axis: 'x' | 'y' | 'z', angle: number, base: THREE.Quaternion, x: number, y: number, z: number, sc: number): void {
    q2.setFromAxisAngle(axis === 'x' ? AXX : axis === 'z' ? AXZ : AXY, angle);
    mLoc.compose(v3.set(piv[0], piv[1], piv[2]), q2, v4.set(1, 1, 1));
    mWorld.compose(v1.set(x, y, z), base, v2.set(sc, sc, sc)).multiply(mLoc);
    this.put(part, mWorld);
  }

  private put(part: Part, m: THREE.Matrix4): void {
    this.ensure(part, part.count + 1, part.mesh.instanceColor !== null);
    part.mesh.setMatrixAt(part.count++, m);
  }

  private putRY(part: Part, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number): void {
    if (part.count + 1 > part.cap) this.ensure(part, part.count + 1, part.mesh.instanceColor !== null);
    setRY(part.mesh.instanceMatrix.array as Float32Array, part.count * 16, x, y, z, ry, sx, sy, sz);
    part.count++;
  }

  private putTeam(part: Part, m: THREE.Matrix4, owner: number): void {
    this.ensure(part, part.count + 1, true);
    part.mesh.setMatrixAt(part.count, m);
    part.mesh.setColorAt(part.count, col.set(this.teamColor(owner)));
    part.count++;
  }

  private putTeamRY(part: Part, x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, owner: number, ghost: boolean): void {
    this.ensure(part, part.count + 1, true);
    setRY(part.mesh.instanceMatrix.array as Float32Array, part.count * 16, x, y, z, ry, sx, sy, sz);
    col.set(this.teamColor(owner));
    if (ghost) col.multiplyScalar(0.4);
    part.mesh.setColorAt(part.count, col);
    part.count++;
  }

  private teamColor(owner: number): number {
    return owner >= 0 ? this.playerColors[owner] ?? 0xffffff : 0xb8b8b0;
  }

  private commit(part: Part): void {
    part.mesh.count = part.count;
    part.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- projectiles
  private frameProjectiles(alpha: number, dt: number): void {
    let nt = 0, nb = 0;
    const a = this.proj;
    const tm = this.projTracer.instanceMatrix.array as Float32Array;
    const bm = this.projBody.instanceMatrix.array as Float32Array;
    const seen = new Set<number>();
    for (let i = 0; i < this.nProj && nt < 3990 && nb < 1990; i++) {
      const o = i * PROJ_STRIDE;
      const id = a[o], vfx = a[o + 1];
      seen.add(id);
      const prev = this.lastProjPos.get(id);
      let x = a[o + 2], y = a[o + 3], z = a[o + 4];
      if (prev) { x = prev[0] + (x - prev[0]) * Math.min(1, alpha); y = prev[1] + (y - prev[1]) * Math.min(1, alpha); z = prev[2] + (z - prev[2]) * Math.min(1, alpha); }
      const dx = a[o + 5], dy = a[o + 6], dz = a[o + 7];
      // orient +Z along (dx,dy,dz)
      const yaw = Math.atan2(dx, dz), pitch = -Math.asin(Math.max(-1, Math.min(1, dy)));
      e1.set(pitch, yaw, 0, 'YXZ');
      q1.setFromEuler(e1);
      // vfx index: 0 bullet 1 cannon 2 missile 3 rocket 4 shell 5 bomb ...
      if (vfx === 0 || vfx === 1 || vfx === 6 || vfx === 9) {
        v1.set(x, y, z);
        const s = vfx === 1 ? 1.4 : 1;
        m4.compose(v1, q1, v2.set(s, s, s));
        m4.toArray(tm, nt * 16); nt++;
      } else {
        const s = vfx === 5 ? 1.2 : vfx === 4 ? 0.9 : vfx === 3 ? 0.55 : 0.7;
        m4.compose(v1.set(x, y, z), q1, v2.set(s, s, s));
        m4.toArray(bm, nb * 16); nb++;
        this.vfx.trail(x - dx * 1.2, y - dy * 1.2, z - dz * 1.2, vfx === 2 ? 'missile' : vfx === 3 ? 'rocket' : vfx === 4 ? 'shell' : 'bomb');
      }
    }
    // remember last positions for interpolation
    this.lastProjPos.clear();
    for (let i = 0; i < this.nProj; i++) { const o = i * PROJ_STRIDE; this.lastProjPos.set(a[o], [a[o + 2], a[o + 3], a[o + 4]]); }
    void dt; void seen;
    this.projTracer.count = nt; this.projTracer.instanceMatrix.needsUpdate = true;
    this.projBody.count = nb; this.projBody.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- picking helpers
  /** Screen-space candidates: returns [id, sx, sy, radiusPx] for each visible view. */
  project(camera: THREE.Camera, w: number, h: number, out: { id: number; sx: number; sy: number; r: number; owner: number; structure: boolean; air: boolean }[]): void {
    out.length = 0;
    for (const v of this.views.values()) {
      const def = DEF_LIST[v.def];
      if (def.prop) continue;
      const structure = def.kind === 'structure';
      const hh = getModel(def).height * (getModel(def).scale ?? 1) * 0.45;
      v1.set(v.ix || v.x, (v.iy || v.y) + hh, v.iz || v.z);
      const pos = v1.clone().project(camera);
      if (pos.z > 1 || pos.z < -1) continue;
      const sx = (pos.x * 0.5 + 0.5) * w, sy = (-pos.y * 0.5 + 0.5) * h;
      const dist = camera.position.distanceTo(v1);
      const fovScale = h / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360));
      const rad = Math.max(10, ((structure ? Math.max(def.footprint![0], def.footprint![1]) * 0.5 : def.radius * 1.15) * fovScale) / dist);
      out.push({ id: v.id, sx, sy, r: rad, owner: v.owner, structure, air: def.layer === 'air' && (v.flags & 256) !== 0 });
    }
  }
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
  let total = 0;
  for (const g of prepared) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of prepared) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
