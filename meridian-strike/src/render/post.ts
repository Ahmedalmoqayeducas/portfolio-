import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export type Preset = 'low' | 'medium' | 'high' | 'ultra';

/** HDR post stack: render -> GTAO -> bloom -> tone map -> SMAA. */
export class PostStack {
  readonly composer: EffectComposer;
  private readonly gtao: GTAOPass;
  private readonly bloom: UnrealBloomPass;
  private readonly smaa: SMAAPass;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.updateGtaoMaterial({ radius: 3.5, distanceExponent: 1.4, thickness: 3, scale: 1.1, samples: 16 });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(size, 0.16, 0.5, 1.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass(size.x, size.y);
    this.composer.addPass(this.smaa);
  }

  setPreset(p: Preset): { shadows: boolean; pixelRatio: number } {
    const dpr = Math.min(window.devicePixelRatio, 2);
    switch (p) {
      case 'low':
        this.gtao.enabled = false; this.bloom.enabled = false; this.smaa.enabled = false;
        return { shadows: false, pixelRatio: Math.min(dpr, 1) * 0.75 };
      case 'medium':
        this.gtao.enabled = false; this.bloom.enabled = true; this.smaa.enabled = true;
        return { shadows: true, pixelRatio: Math.min(dpr, 1) };
      case 'high':
        this.gtao.enabled = true; this.bloom.enabled = true; this.smaa.enabled = true;
        return { shadows: true, pixelRatio: Math.min(dpr, 1.5) };
      default:
        this.gtao.enabled = true; this.bloom.enabled = true; this.smaa.enabled = true;
        return { shadows: true, pixelRatio: dpr };
    }
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(): void {
    this.composer.render();
  }
}
