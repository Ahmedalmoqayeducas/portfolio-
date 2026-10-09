import * as THREE from 'three';
import { Terrain } from '../render/terrain';

/** Classic RTS camera: orbits a ground target; pitch eases with zoom. */
export class RtsCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3(0, 0, 0);
  yaw = Math.PI * 0.25;
  distance = 120;
  minDistance = 18;
  maxDistance = 420;
  private distGoal = 120;
  private yawGoal = this.yaw;
  private readonly keys = new Set<string>();
  private mouse = { x: 0, y: 0, inside: false, mmb: false };
  edgePan = true;

  constructor(dom: HTMLElement, private readonly terrain: Terrain) {
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 6000);
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousemove', (e) => {
      if (this.mouse.mmb) this.yawGoal -= e.movementX * 0.006;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    });
    dom.addEventListener('mouseleave', () => (this.mouse.inside = false));
    dom.addEventListener('mousedown', (e) => { if (e.button === 1) { this.mouse.mmb = true; e.preventDefault(); } });
    window.addEventListener('mouseup', (e) => { if (e.button === 1) this.mouse.mmb = false; });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distGoal = THREE.MathUtils.clamp(this.distGoal * Math.exp(e.deltaY * 0.0012), this.minDistance, this.maxDistance);
    }, { passive: false });
    this.update(0);
  }

  /** Jump straight to a view (no easing). */
  setView(distance: number, yaw: number): void {
    this.distance = this.distGoal = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
    this.yaw = this.yawGoal = yaw;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  has(code: string): boolean { return this.keys.has(code); }

  update(dt: number): void {
    const k = this.keys;
    let fx = 0, fz = 0;
    // arrow keys scroll (letters are command-card hotkeys, as in the classic games)
    if (k.has('ArrowUp')) fz -= 1;
    if (k.has('ArrowDown')) fz += 1;
    if (k.has('ArrowLeft')) fx -= 1;
    if (k.has('ArrowRight')) fx += 1;
    if (this.edgePan && this.mouse.inside && !this.mouse.mmb) {
      const m = 6, w = window.innerWidth, h = window.innerHeight;
      if (this.mouse.x < m) fx -= 1; else if (this.mouse.x > w - m) fx += 1;
      if (this.mouse.y < m) fz -= 1; else if (this.mouse.y > h - m) fz += 1;
    }
    if (k.has('BracketLeft') || k.has('PageUp') || k.has('Comma')) this.yawGoal += 1.6 * dt;
    if (k.has('BracketRight') || k.has('PageDown') || k.has('Period')) this.yawGoal -= 1.6 * dt;

    const speed = (this.distance * 1.1) * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.2 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward on the ground plane is (-sin, -cos) for a camera looking along -z rotated by yaw
    this.target.x += (fx * cos + fz * sin) * speed * dt;
    this.target.z += (-fx * sin + fz * cos) * speed * dt;
    const lim = this.terrain.size * 0.42;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -lim, lim);
    this.target.z = THREE.MathUtils.clamp(this.target.z, -lim, lim);
    const ground = this.terrain.heightAt(this.target.x, this.target.z);
    this.target.y += (ground - this.target.y) * Math.min(1, dt * 8 + (dt === 0 ? 1 : 0));

    const ease = dt === 0 ? 1 : 1 - Math.exp(-dt * 10);
    this.distance += (this.distGoal - this.distance) * ease;
    this.yaw += (this.yawGoal - this.yaw) * ease;

    const zt = (this.distance - this.minDistance) / (this.maxDistance - this.minDistance);
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(28, 62, Math.pow(zt, 0.6)));
    const cy = Math.sin(pitch) * this.distance;
    const cr = Math.cos(pitch) * this.distance;
    const cx = this.target.x + Math.sin(this.yaw) * cr;
    const cz = this.target.z + Math.cos(this.yaw) * cr;
    let camY = this.target.y + cy;
    camY = Math.max(camY, this.terrain.heightAt(cx, cz) + 4);
    this.camera.position.set(cx, camY, cz);
    this.camera.lookAt(this.target);
  }
}
