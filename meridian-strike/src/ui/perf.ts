import * as THREE from 'three';

export class PerfOverlay {
  private readonly el = document.getElementById('perf') as HTMLElement;
  private frames = 0;
  private acc = 0;
  private fps = 0;
  private ms = 0;
  visible = true;
  extra = '';

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  tick(dt: number): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.ms = (this.acc / this.frames) * 1000;
      this.frames = 0;
      this.acc = 0;
      const i = this.renderer.info;
      this.el.textContent =
        `FPS ${this.fps.toFixed(0).padStart(3)}  (${this.ms.toFixed(1)} ms)\n` +
        `Draw calls ${i.render.calls}  Tris ${(i.render.triangles / 1000).toFixed(0)}k\n` +
        `Geo ${i.memory.geometries}  Tex ${i.memory.textures}\n` + this.extra;
    }
  }
}
