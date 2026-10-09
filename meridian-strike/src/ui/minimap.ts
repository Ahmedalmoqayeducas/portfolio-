import * as THREE from 'three';
import type { GameSession } from '../game/session';
import { DEF_LIST } from '../sim/defs';
import { fog } from '../render/fog';
import { bakeMapImage } from './mapimage';

const S = 232;

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private fogC: HTMLCanvasElement;
  private pings: { x: number; z: number; t: number; c: string }[] = [];
  private acc = 0;
  private drag = false;
  private tmp = new THREE.Vector3();

  constructor(private s: GameSession, parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.canvas.id = 'minimap';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.base = this.bake();
    this.fogC = document.createElement('canvas');
    this.fogC.width = this.fogC.height = Math.ceil(s.built.def.size / 8);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => this.down(e));
    window.addEventListener('mouseup', () => (this.drag = false));
    window.addEventListener('mousemove', (e) => { if (this.drag) this.move(e); });
  }

  private toWorld(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    const size = this.s.built.def.size;
    return [(u - 0.5) * size, (v - 0.5) * size];
  }

  private down(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const [x, z] = this.toWorld(e);
    if (e.button === 0) { this.drag = true; this.s.rts.target.x = x; this.s.rts.target.z = z; }
    else if (e.button === 2) {
      this.s.input.commandMove(x, z);
    }
  }
  private move(e: MouseEvent): void {
    const [x, z] = this.toWorld(e);
    const lim = this.s.built.def.size * 0.42;
    this.s.rts.target.x = Math.max(-lim, Math.min(lim, x));
    this.s.rts.target.z = Math.max(-lim, Math.min(lim, z));
  }

  ping(x: number, z: number, color = '#ff4a3a'): void { this.pings.push({ x, z, t: 0, c: color }); }

  private bake(): HTMLCanvasElement { return bakeMapImage(this.s.built, S); }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.09) return;
    const step = this.acc;
    this.acc = 0;
    const g = this.ctx;
    const size = this.s.built.def.size;
    const k = S / size;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.base, 0, 0);
    // fog
    if (fog.on.value > 0.5 && fog.tex.image.data) {
      const d = fog.tex.image.data as Uint8Array;
      const w = fog.w;
      if (this.fogC.width !== w) { this.fogC.width = this.fogC.height = w; }
      const fg = this.fogC.getContext('2d')!;
      const img = fg.createImageData(w, w);
      for (let i = 0; i < w * w; i++) {
        const v = d[i];
        img.data[i * 4 + 3] = v > 200 ? 0 : v > 50 ? 120 : 235;
      }
      fg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.fogC, 0, 0, S, S);
    }
    // entities
    const colors = this.s.setup.players.map((p) => '#' + p.color.toString(16).padStart(6, '0'));
    for (const v of this.s.entities.views.values()) {
      const def = DEF_LIST[v.def];
      const x = (v.x / size + 0.5) * S, y = (v.z / size + 0.5) * S;
      if (def.prop) {
        if (def.supply) { g.fillStyle = '#ffd34a'; g.fillRect(x - 1, y - 1, 2.4, 2.4); }
        continue;
      }
      g.fillStyle = v.owner >= 0 ? colors[v.owner] : '#e8e8e8';
      if (def.kind === 'structure') {
        if (v.owner < 0 && def.roles.includes('civilian')) { g.fillStyle = 'rgba(210,210,210,0.7)'; g.fillRect(x - 1, y - 1, 2, 2); continue; }
        const s = Math.max(3, Math.max(def.footprint![0], def.footprint![1]) * k * 0.9);
        g.fillRect(x - s / 2, y - s / 2, s, s);
        g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 0.7; g.strokeRect(x - s / 2, y - s / 2, s, s);
      } else {
        const s = def.layer === 'air' ? 3 : 2;
        g.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
    // selected highlights
    g.strokeStyle = '#7dff9a'; g.lineWidth = 1;
    for (const id of this.s.selection) {
      const v = this.s.entities.views.get(id);
      if (!v) continue;
      g.strokeRect((v.x / size + 0.5) * S - 3, (v.z / size + 0.5) * S - 3, 6, 6);
    }
    // pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += step;
      if (p.t > 3) { this.pings.splice(i, 1); continue; }
      g.strokeStyle = p.c; g.globalAlpha = 1 - p.t / 3; g.lineWidth = 2;
      g.beginPath(); g.arc((p.x / size + 0.5) * S, (p.z / size + 0.5) * S, 4 + p.t * 12, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    // camera frustum
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.2;
    const w = window.innerWidth, h = window.innerHeight;
    const pts: [number, number][] = [];
    for (const [sx, sy] of [[0, 0], [w, 0], [w, h], [0, h]] as [number, number][]) {
      if (this.s.input.pickGround(sx, sy, this.tmp)) pts.push([(this.tmp.x / size + 0.5) * S, (this.tmp.z / size + 0.5) * S]);
    }
    if (pts.length === 4) {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 4; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath(); g.stroke();
    }
  }
}
