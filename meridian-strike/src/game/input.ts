import * as THREE from 'three';
import type { GameSession } from './session';
import { DEF_LIST, DEFS } from '../sim/defs';
import { Command, F_BUILDING, F_GHOST, Stance } from '../sim/types';
import { getModel } from '../render/models';
import { makeUnitMaterial } from '../render/materials';
import { fog } from '../render/fog';
import { NavGrid } from '../sim/nav';

export type Mode =
  | { k: 'normal' }
  | { k: 'place'; def: string }
  | { k: 'amove' }
  | { k: 'rally' }
  | { k: 'power'; id: string; radius: number }
  | { k: 'capture' }
  | { k: 'garrison' }
  | { k: 'repair' }
  | { k: 'patrol' };

interface Proj { id: number; sx: number; sy: number; r: number; owner: number; structure: boolean; air: boolean }

const ray = new THREE.Raycaster();
const v2 = new THREE.Vector2();

export class InputController {
  mode: Mode = { k: 'normal' };
  private mx = 0;
  private my = 0;
  private down = false;
  private dragX = 0;
  private dragY = 0;
  private dragging = false;
  private shift = false;
  private ctrl = false;
  private groups = new Map<number, number[]>();
  private lastClickId = 0;
  private lastClickT = 0;
  private proj: Proj[] = [];
  private projDirty = true;
  private box: HTMLDivElement;
  private ghost: THREE.Group | null = null;
  private ghostRing: THREE.Mesh | null = null;
  private ghostOk = false;
  private placeTip: HTMLDivElement | null = null;
  private cursorRing: THREE.Mesh;
  private groundPoint = new THREE.Vector3();
  private lastGround = false;
  private el: HTMLCanvasElement;
  private cleanup: (() => void)[] = [];
  /** same walkability grid the simulation uses to validate placements (terrain only: structures are checked separately) */
  private nav: NavGrid;

  constructor(private s: GameSession) {
    this.nav = new NavGrid(s.built.hf, s.built.def.waterLevel ?? null, 4);
    this.el = s.engine.canvas;
    this.box = document.createElement('div');
    this.box.id = 'selbox';
    document.getElementById('hud')?.appendChild(this.box);
    const rg = new THREE.RingGeometry(0.96, 1, 64);
    rg.rotateX(-Math.PI / 2);
    this.cursorRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.9, depthTest: false }));
    this.cursorRing.visible = false;
    this.cursorRing.renderOrder = 30;
    s.scene.add(this.cursorRing);
    this.bind();
  }

  private on(el: HTMLElement | Window, ev: string, fn: (e: never) => void): void {
    el.addEventListener(ev, fn as EventListener);
    this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener));
  }

  private bind(): void {
    const el = this.el;
    this.on(el, 'contextmenu', ((e: Event) => e.preventDefault()) as never);
    this.on(el, 'mousedown', ((e: MouseEvent) => this.onDown(e)) as never);
    this.on(window, 'mouseup', ((e: MouseEvent) => this.onUp(e)) as never);
    this.on(window, 'mousemove', ((e: MouseEvent) => this.onMove(e)) as never);
    this.on(window, 'keydown', ((e: KeyboardEvent) => this.onKey(e)) as never);
    this.on(window, 'keyup', ((e: KeyboardEvent) => { this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey; }) as never);
  }

  dispose(): void {
    for (const c of this.cleanup) c();
    this.box.remove();
    this.s.scene.remove(this.cursorRing);
    this.clearGhost();
  }

  // ------------------------------------------------------------------ helpers
  get viewer(): number { return this.s.viewer; }

  /** mouse -> terrain point */
  pickGround(sx: number, sy: number, out: THREE.Vector3): boolean {
    const cam = this.s.rts.camera;
    v2.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(v2, cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    const hf = this.s.terrain.hf;
    let t = 0, prev = 0;
    const step0 = 6;
    let hit = false;
    for (let i = 0; i < 900; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (Math.abs(x) > hf.size / 2 + 50 || Math.abs(z) > hf.size / 2 + 50) { if (d.y >= 0) break; }
      const gh = hf.heightAt(x, z);
      if (y <= gh) { hit = true; break; }
      prev = t;
      t += Math.max(step0, (y - gh) * 0.5);
    }
    if (!hit) return false;
    let a = prev, b = t;
    for (let i = 0; i < 14; i++) {
      const m = (a + b) / 2;
      const x = o.x + d.x * m, y = o.y + d.y * m, z = o.z + d.z * m;
      if (y <= hf.heightAt(x, z)) b = m; else a = m;
    }
    const x = o.x + d.x * b, z = o.z + d.z * b;
    out.set(x, hf.heightAt(x, z), z);
    return true;
  }

  private refreshProj(): void {
    if (!this.projDirty) return;
    this.s.entities.project(this.s.rts.camera, window.innerWidth, window.innerHeight, this.proj);
    this.projDirty = false;
  }

  private entityAt(sx: number, sy: number): Proj | null {
    this.refreshProj();
    let best: Proj | null = null, bd = 1e18;
    for (const p of this.proj) {
      const d = Math.hypot(p.sx - sx, p.sy - sy);
      const pr = p.r * (p.structure ? 1.0 : 1.0);
      if (d <= pr && d / pr < bd) { bd = d / pr; best = p; }
    }
    return best;
  }

  private selectedOwned(): number[] {
    const out: number[] = [];
    for (const id of this.s.selection) { const v = this.s.entities.views.get(id); if (v && v.owner === this.viewer) out.push(id); }
    return out;
  }

  selectedViews() {
    const out = [];
    for (const id of this.s.selection) { const v = this.s.entities.views.get(id); if (v) out.push(v); }
    return out;
  }

  private setSelection(ids: number[], add = false): void {
    const sel = this.s.selection;
    if (!add) sel.clear();
    for (const id of ids) sel.add(id);
    this.s.hud?.selectionChanged();
    if (ids.length) {
      this.s.audio.ui('select');
      const v = this.s.entities.views.get(ids[0]);
      if (v && v.owner === this.viewer) this.s.audio.ack('select', v.def);
    }
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.clearGhost();
    if (m.k === 'place') this.makeGhost(m.def);
    this.s.engine.canvas.style.cursor = m.k === 'normal' ? 'default' : 'crosshair';
    this.s.hud?.modeChanged(m);
  }

  // ------------------------------------------------------------------ events
  private onMove(e: MouseEvent): void {
    this.mx = e.clientX; this.my = e.clientY;
    this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey;
    if (this.down && !this.dragging && Math.hypot(this.mx - this.dragX, this.my - this.dragY) > 6) this.dragging = true;
    if (this.dragging) {
      const x0 = Math.min(this.dragX, this.mx), y0 = Math.min(this.dragY, this.my);
      Object.assign(this.box.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: Math.abs(this.mx - this.dragX) + 'px', height: Math.abs(this.my - this.dragY) + 'px' });
    }
  }

  private onDown(e: MouseEvent): void {
    this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey;
    if (e.button === 0) {
      this.down = true; this.dragging = false; this.dragX = e.clientX; this.dragY = e.clientY;
    } else if (e.button === 2) {
      if (this.mode.k !== 'normal') { this.setMode({ k: 'normal' }); return; }
      this.rightClick(e.clientX, e.clientY);
    }
  }

  private onUp(e: MouseEvent): void {
    if (e.button !== 0 || !this.down) return;
    this.down = false;
    this.box.style.display = 'none';
    if (this.s.viewer < 0) return;
    if (e.target !== this.el && !this.dragging) return;
    if (this.dragging) { this.dragging = false; this.boxSelect(); return; }
    this.leftClick(e.clientX, e.clientY);
  }

  private leftClick(sx: number, sy: number): void {
    const m = this.mode;
    if (m.k === 'place') { this.confirmPlace(); return; }
    if (m.k === 'power') { if (this.pickGround(sx, sy, this.groundPoint)) { this.s.command({ t: 'power', power: m.id, x: this.groundPoint.x, z: this.groundPoint.z }); this.setMode({ k: 'normal' }); } return; }
    if (m.k === 'amove' || m.k === 'patrol') {
      if (this.pickGround(sx, sy, this.groundPoint)) {
        const ids = this.mobileSelected();
        if (ids.length) {
          if (m.k === 'amove') this.s.command({ t: 'move', ids, x: this.groundPoint.x, z: this.groundPoint.z, attack: true, queue: this.shift });
          else this.s.command({ t: 'patrol', ids, x: this.groundPoint.x, z: this.groundPoint.z });
          this.s.vfx.shocks.add(this.groundPoint.x, this.groundPoint.y + 0.5, this.groundPoint.z, 6, 0.5, 0xff8a3a);
        }
        if (!this.shift) this.setMode({ k: 'normal' });
      }
      return;
    }
    if (m.k === 'rally') {
      if (this.pickGround(sx, sy, this.groundPoint)) {
        const ids = this.selectedOwned();
        this.s.command({ t: 'rally', structures: ids, x: this.groundPoint.x, z: this.groundPoint.z });
        this.s.hud?.toast('Rally point set');
      }
      this.setMode({ k: 'normal' });
      return;
    }
    if (m.k === 'capture' || m.k === 'garrison' || m.k === 'repair') {
      const hit = this.entityAt(sx, sy);
      if (hit) {
        const ids = this.selectedOwned();
        if (m.k === 'capture') this.s.command({ t: 'capture', ids, target: hit.id });
        else if (m.k === 'garrison') this.s.command({ t: 'garrison', ids, target: hit.id });
        else this.s.command({ t: 'repair', ids, target: hit.id });
      }
      this.setMode({ k: 'normal' });
      return;
    }
    // normal selection
    const hit = this.entityAt(sx, sy);
    const now = performance.now();
    if (hit) {
      const view = this.s.entities.views.get(hit.id);
      if (view && view.owner === this.viewer && this.lastClickId === hit.id && now - this.lastClickT < 350 && !hit.structure) {
        // double click: select all of the same type on screen
        this.refreshProj();
        const ids = this.proj.filter((p) => { const v = this.s.entities.views.get(p.id); return v && v.def === view.def && v.owner === this.viewer && p.sx >= 0 && p.sx <= window.innerWidth && p.sy >= 0 && p.sy <= window.innerHeight; }).map((p) => p.id);
        this.setSelection(ids, this.shift);
      } else if (this.shift && this.s.selection.has(hit.id)) {
        this.s.selection.delete(hit.id);
        this.s.hud?.selectionChanged();
      } else {
        this.setSelection([hit.id], this.shift && !!view && view.owner === this.viewer);
      }
      this.lastClickId = hit.id; this.lastClickT = now;
    } else if (!this.shift) {
      this.s.selection.clear();
      this.s.hud?.selectionChanged();
    }
  }

  private mobileSelected(): number[] {
    return this.selectedOwned().filter((id) => { const v = this.s.entities.views.get(id)!; return DEF_LIST[v.def].kind === 'unit'; });
  }

  private boxSelect(): void {
    this.refreshProj();
    const x0 = Math.min(this.dragX, this.mx), x1 = Math.max(this.dragX, this.mx);
    const y0 = Math.min(this.dragY, this.my), y1 = Math.max(this.dragY, this.my);
    const units: number[] = [], structs: number[] = [];
    for (const p of this.proj) {
      if (p.sx < x0 || p.sx > x1 || p.sy < y0 || p.sy > y1) continue;
      const v = this.s.entities.views.get(p.id);
      if (!v || v.owner !== this.viewer) continue;
      if (p.structure) structs.push(p.id); else units.push(p.id);
    }
    const ids = units.length ? units : structs.slice(0, 1);
    if (ids.length) this.setSelection(ids, this.shift);
    else if (!this.shift) { this.s.selection.clear(); this.s.hud?.selectionChanged(); }
  }

  private rightClick(sx: number, sy: number): void {
    if (this.s.viewer < 0) return;
    const sel = this.selectedViews().filter((v) => v.owner === this.viewer);
    if (!sel.length) return;
    const hit = this.entityAt(sx, sy);
    const hv = hit ? this.s.entities.views.get(hit.id) : undefined;
    const hdef = hv ? DEF_LIST[hv.def] : undefined;
    const ids = sel.filter((v) => DEF_LIST[v.def].kind === 'unit').map((v) => v.id);
    const structs = sel.filter((v) => DEF_LIST[v.def].kind === 'structure');
    if (!ids.length && structs.length) {
      // rally point for production structures
      if (this.pickGround(sx, sy, this.groundPoint)) {
        const ps = structs.filter((v) => DEF_LIST[v.def].produces).map((v) => v.id);
        if (ps.length) { this.s.command({ t: 'rally', structures: ps, x: this.groundPoint.x, z: this.groundPoint.z }); this.s.vfx.shocks.add(this.groundPoint.x, this.groundPoint.y + 0.5, this.groundPoint.z, 5, 0.5, 0x66ff88); }
      }
      return;
    }
    const q = this.shift;
    if (hv && hdef && hit) {
      const enemy = hv.owner !== this.viewer && !(this.s.snap && this.alliedOwner(hv.owner));
      const neutral = hv.owner < 0;
      const units = ids.map((id) => ({ id, d: DEF_LIST[this.s.entities.views.get(id)!.def] }));
      if (hdef.supply) {
        const trucks = units.filter((u) => u.d.cap).map((u) => u.id);
        if (trucks.length) { this.s.command({ t: 'harvest', ids: trucks, target: hit.id }); return; }
      }
      if (neutral || enemy) {
        if (hdef.kind === 'structure' && (neutral || this.ctrl)) {
          const caps = units.filter((u) => u.d.captures).map((u) => u.id);
          const gars = units.filter((u) => u.d.canGarrison && !u.d.captures).map((u) => u.id);
          if (caps.length) {
            if (neutral && hdef.garrison && !hdef.income) { this.s.command({ t: 'garrison', ids: caps, target: hit.id }); }
            else this.s.command({ t: 'capture', ids: caps, target: hit.id });
          }
          if (gars.length && hdef.garrison) this.s.command({ t: 'garrison', ids: gars, target: hit.id });
          const rest = units.filter((u) => !u.d.captures && !(u.d.canGarrison && hdef.garrison)).map((u) => u.id);
          if (rest.length && !neutral) this.s.command({ t: 'attack', ids: rest, target: hit.id, queue: q });
          if (neutral && rest.length && this.pickGround(sx, sy, this.groundPoint)) this.s.command({ t: 'move', ids: rest, x: this.groundPoint.x, z: this.groundPoint.z, queue: q });
          return;
        }
        if (enemy) {
          const cyb = units.filter((u) => u.d.cyber).map((u) => u.id);
          const atk = units.filter((u) => !u.d.cyber && u.d.weapons?.length).map((u) => u.id);
          const mov = units.filter((u) => !u.d.weapons?.length).map((u) => u.id);
          if (cyb.length) this.s.command({ t: 'cyber', ids: cyb, target: hit.id });
          if (atk.length) this.s.command({ t: 'attack', ids: atk, target: hit.id, queue: q });
          if (mov.length) this.s.command({ t: 'move', ids: mov, x: hv.x, z: hv.z, queue: q });
          this.s.vfx.shocks.add(hv.x, hv.y + 0.5, hv.z, 5, 0.45, 0xff4a3a);
          return;
        }
      } else if (hdef.kind === 'structure') {
        // own structure
        const dozers = units.filter((u) => u.d.builds).map((u) => u.id);
        if (dozers.length && (hv.hp < 0.999 || (hv.flags & 4))) { this.s.command({ t: 'repair', ids: dozers, target: hit.id }); return; }
        const gars = units.filter((u) => u.d.canGarrison).map((u) => u.id);
        if (gars.length && hdef.garrison) { this.s.command({ t: 'garrison', ids: gars, target: hit.id }); return; }
      }
    }
    if (this.pickGround(sx, sy, this.groundPoint)) {
      const mv = ids;
      if (mv.length) {
        this.s.command({ t: 'move', ids: mv, x: this.groundPoint.x, z: this.groundPoint.z, queue: q });
        this.s.vfx.shocks.add(this.groundPoint.x, this.groundPoint.y + 0.5, this.groundPoint.z, 4.5, 0.45, 0x66ff88);
      }
    }
  }

  alliedOwner(owner: number): boolean {
    const ps = this.s.snap?.players;
    if (!ps) return owner === this.viewer;
    return ps[owner]?.team === ps[this.viewer]?.team;
  }

  // ------------------------------------------------------------------ keyboard
  private onKey(e: KeyboardEvent): void {
    this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey;
    if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
    if (e.code === 'Escape') {
      if (this.mode.k !== 'normal') this.setMode({ k: 'normal' });
      else if (this.s.selection.size) { this.s.selection.clear(); this.s.hud.selectionChanged(); }
      else this.s.hud.togglePause();
      return;
    }
    if (e.code === 'Space') { this.s.hud.jumpToAlert(); e.preventDefault(); return; }
    if (e.code === 'F10') { const h = document.getElementById('hud'); if (h) h.style.display = h.style.display === 'none' ? '' : 'none'; e.preventDefault(); return; }
    if (e.code === 'KeyH' && e.altKey) { this.s.hud.centerOnBase(); return; }
    // control groups
    const dm = /^Digit([0-9])$/.exec(e.code);
    if (dm && this.s.viewer >= 0) {
      const n = Number(dm[1]);
      if (this.ctrl) {
        this.groups.set(n, this.selectedOwned());
        this.s.hud.toast(`Group ${n} assigned`);
        e.preventDefault();
      } else {
        const g = (this.groups.get(n) ?? []).filter((id) => this.s.entities.views.has(id));
        if (g.length) {
          this.setSelection(g, this.shift);
          const v = this.s.entities.views.get(g[0])!;
          if (performance.now() - this.lastGroupT < 400 && this.lastGroup === n) this.s.rts.target.set(v.x, v.y, v.z);
          this.lastGroup = n; this.lastGroupT = performance.now();
        }
      }
      return;
    }
    if (this.ctrl && e.code === 'KeyA' && this.s.viewer >= 0) {
      e.preventDefault();
      this.refreshProj();
      const ids = this.proj.filter((p) => { const v = this.s.entities.views.get(p.id); return v && v.owner === this.viewer && !p.structure; }).map((p) => p.id);
      this.setSelection(ids);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // command card hotkeys
    if (this.s.hud?.pressKey(e.code.replace('Key', ''))) { e.preventDefault(); }
  }
  private lastGroup = 0;
  private lastGroupT = 0;

  // ------------------------------------------------------------------ placement ghost
  private makeGhost(defId: string): void {
    const def = DEFS.get(defId);
    if (!def) return;
    const model = getModel(def);
    const g = new THREE.Group();
    const mat = makeUnitMaterial();
    mat.transparent = true; mat.opacity = 0.65;
    g.add(new THREE.Mesh(model.body, mat));
    if (model.turret && model.turretPivot) { const t = new THREE.Mesh(model.turret, mat); t.position.set(...model.turretPivot); g.add(t); }
    if (model.glow) g.add(new THREE.Mesh(model.glow, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4 })));
    this.s.scene.add(g);
    this.ghost = g;
    const [w, d] = def.footprint!;
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.28, depthWrite: false }));
    ring.renderOrder = 25;
    this.s.scene.add(ring);
    this.ghostRing = ring;
  }

  /** floating reason label next to the cursor while a placement is invalid */
  private showPlaceTip(why: string | null): void {
    if (!why) { if (this.placeTip) this.placeTip.style.display = 'none'; return; }
    if (!this.placeTip) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:60;pointer-events:none;padding:4px 9px;border-radius:4px;background:rgba(120,20,20,.88);color:#ffe4e0;font:600 13px Rajdhani,sans-serif;letter-spacing:.04em;border:1px solid #ff6a5a;white-space:nowrap';
      document.body.appendChild(d);
      this.placeTip = d;
    }
    this.placeTip.textContent = why;
    this.placeTip.style.left = this.mx + 18 + 'px';
    this.placeTip.style.top = this.my + 14 + 'px';
    this.placeTip.style.display = 'block';
  }

  private clearGhost(): void {
    if (this.placeTip) this.placeTip.style.display = 'none';
    if (this.ghost) { this.s.scene.remove(this.ghost); this.ghost = null; }
    if (this.ghostRing) { this.s.scene.remove(this.ghostRing); this.ghostRing = null; }
  }

  /** client-side approximation of the sim's placement rules (sim re-validates). Returns the reason it fails, or null if OK. */
  placementWhy(defId: string, x: number, z: number): string | null {
    const def = DEFS.get(defId);
    if (!def) return 'Unknown building';
    const [fw, fd] = def.footprint!;
    const hf = this.s.terrain.hf;
    const wl = this.s.built.def.waterLevel ?? null;
    let lo = 1e9, hi = -1e9;
    for (const [ox, oz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { // same five probes as the simulation
      const px = x + (ox * fw) / 2, pz = z + (oz * fd) / 2;
      const h = hf.heightAt(px, pz);
      if (wl !== null && h < wl + 0.2) return 'Cannot build on water';
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 2.4) return 'Ground too uneven';
    if (!this.nav.rectFree(x, z, fw, fd, 0.5)) return 'Blocked by steep ground or water';
    if (fog.on.value > 0.5 && fog.w > 0) {
      const size = fog.size.value, gx = Math.floor(((x + size / 2) / size) * fog.w), gz = Math.floor(((z + size / 2) / size) * fog.w);
      const data = fog.tex.image.data as Uint8Array;
      if (gx >= 0 && gz >= 0 && gx < fog.w && gz < fog.w && data[gz * fog.w + gx] === 0) return 'Unexplored area';
    }
    let near = false;
    const range = def.buildRadius ?? 260;
    // the sim blocks whole nav cells (4 m) around every footprint, so compare cell ranges exactly like NavGrid.rectFree does
    const nav = this.nav;
    const ci0 = nav.ci(x - fw / 2 - 0.5), ci1 = nav.ci(x + fw / 2 + 0.5), cj0 = nav.ci(z - fd / 2 - 0.5), cj1 = nav.ci(z + fd / 2 + 0.5);
    for (const v of this.s.entities.views.values()) {
      const d = DEF_LIST[v.def];
      if (d.kind !== 'structure') continue;
      const [sw, sd] = d.footprint!;
      if (Math.abs(v.x - x) < (sw + fw) / 2 + 3 && Math.abs(v.z - z) < (sd + fd) / 2 + 3) return `Too close to ${d.name}`;
      if (!(v.flags & F_GHOST) && nav.ci(v.x - sw / 2 + 0.01) <= ci1 && nav.ci(v.x + sw / 2 - 0.01) >= ci0 && nav.ci(v.z - sd / 2 + 0.01) <= cj1 && nav.ci(v.z + sd / 2 - 0.01) >= cj0) return `Too close to ${d.name}`;
      if (v.owner === this.viewer && !d.prop && !(v.flags & F_BUILDING) && (v.x - x) ** 2 + (v.z - z) ** 2 <= range * range) near = true;
    }
    return near ? null : 'Too far from your base';
  }

  placementOk(defId: string, x: number, z: number): boolean { return this.placementWhy(defId, x, z) === null; }

  private confirmPlace(): void {
    const m = this.mode;
    if (m.k !== 'place') return;
    if (!this.pickGround(this.mx, this.my, this.groundPoint)) return;
    const x = Math.round(this.groundPoint.x / 2) * 2, z = Math.round(this.groundPoint.z / 2) * 2;
    const ids = this.selectedOwned().filter((id) => DEF_LIST[this.s.entities.views.get(id)!.def].builds?.includes(m.def));
    if (!ids.length) { this.setMode({ k: 'normal' }); return; }
    const why = this.placementWhy(m.def, x, z);
    if (why) { this.s.audio.ui('error'); this.s.hud.toast(why); return; }
    this.s.command({ t: 'build', ids, def: m.def, x, z, queue: this.shift });
    this.s.audio.ui('build');
    if (!this.shift) this.setMode({ k: 'normal' });
  }

  // ------------------------------------------------------------------ per frame
  frame(_dt: number): void {
    this.projDirty = true;
    // hover
    if (!this.dragging) {
      const h = this.mode.k === 'normal' || this.mode.k === 'capture' || this.mode.k === 'garrison' || this.mode.k === 'repair' ? this.entityAt(this.mx, this.my) : null;
      this.s.hover = h ? h.id : 0;
    } else this.s.hover = 0;
    // mouse over HUD: ignore ground pick
    const overHud = (document.elementFromPoint(this.mx, this.my)?.id ?? '') !== 'gl';
    const m = this.mode;
    this.cursorRing.visible = false;
    if ((m.k === 'place' || m.k === 'power') && !overHud) {
      this.lastGround = this.pickGround(this.mx, this.my, this.groundPoint);
      if (this.lastGround) {
        if (m.k === 'place' && this.ghost && this.ghostRing) {
          const x = Math.round(this.groundPoint.x / 2) * 2, z = Math.round(this.groundPoint.z / 2) * 2;
          const y = this.s.terrain.heightAt(x, z);
          this.ghost.position.set(x, y, z);
          this.ghostRing.position.set(x, y + 0.6, z);
          const why = this.placementWhy(m.def, x, z);
          this.ghostOk = why === null;
          (this.ghostRing.material as THREE.MeshBasicMaterial).color.set(this.ghostOk ? 0x40ff60 : 0xff3a3a);
          this.showPlaceTip(why);
          this.ghost.visible = true; this.ghostRing.visible = true;
        } else if (m.k === 'power') {
          this.cursorRing.visible = true;
          this.cursorRing.position.set(this.groundPoint.x, this.groundPoint.y + 0.6, this.groundPoint.z);
          this.cursorRing.scale.setScalar(m.radius);
        }
      }
    } else if (this.ghost && this.ghostRing) { this.ghost.visible = false; this.ghostRing.visible = false; if (this.placeTip) this.placeTip.style.display = 'none'; }
  }

  // ------------------------------------------------------------------ api for the HUD / minimap
  commandMove(x: number, z: number): void {
    const ids = this.mobileSelected();
    if (ids.length) this.s.command({ t: 'move', ids, x, z, queue: this.shift });
  }
  stance(st: Stance): void {
    const ids = this.mobileSelected();
    if (ids.length) this.s.command({ t: 'stance', ids, stance: st });
  }
  cmd(c: Command): void { this.s.command(c); }
  stop(): void { const ids = this.mobileSelected(); if (ids.length) this.s.command({ t: 'stop', ids }); }
}
