import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { makeGradePass } from './grade';

export type Preset = 'low' | 'medium' | 'high' | 'ultra';

/**
 * HDR post stack: render -> GTAO -> bloom -> tone map -> SMAA -> colour grade (split toning, contrast,
 * saturation, chromatic aberration, vignette, grain).
 */
export class PostStack {
  readonly composer: EffectComposer;
  private readonly gtao: GTAOPass;
  private readonly bloom: UnrealBloomPass;
  private readonly smaa: SMAAPass;
  private readonly grade: ShaderPass;
  private readonly out: OutputPass;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.updateGtaoMaterial({ radius: 2.6, distanceExponent: 1.5, thickness: 2.5, scale: 1.25, samples: 16, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.blendIntensity = 0.85;
    // decorative geometry (grass, sky, ...) is excluded from the AO G-buffer pass
    const g = this.gtao as unknown as { _visibilityCache: Map<THREE.Object3D, boolean>; overrideVisibility: () => void };
    g.overrideVisibility = () => {
      const cache = g._visibilityCache;
      scene.traverse((o) => {
        cache.set(o, o.visible);
        const l = o as THREE.Line & THREE.Points;
        if (l.isPoints || l.isLine || o.userData.noAO) o.visible = false;
      });
    };
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(size, 0.14, 0.55, 1.5);
    this.composer.addPass(this.bloom);
    this.out = new OutputPass();
    this.composer.addPass(this.out);
    this.smaa = new SMAAPass(size.x, size.y);
    this.composer.addPass(this.smaa);
    this.grade = makeGradePass();
    this.composer.addPass(this.grade);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }

  setPreset(p: Preset): { shadows: boolean; pixelRatio: number; shadowSize: number } {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const u = this.grade.uniforms as Record<string, THREE.IUniform>;
    switch (p) {
      case 'low':
        this.gtao.enabled = false; this.bloom.enabled = false; this.smaa.enabled = false;
        u.uGrain.value = 0; u.uCA.value = 0; u.uVig.value = 0.2;
        return { shadows: false, pixelRatio: Math.min(dpr, 1) * 0.75, shadowSize: 1024 };
      case 'medium':
        this.gtao.enabled = false; this.bloom.enabled = true; this.smaa.enabled = true;
        u.uGrain.value = 0.012; u.uCA.value = 0.0004; u.uVig.value = 0.28;
        return { shadows: true, pixelRatio: Math.min(dpr, 1), shadowSize: 1024 };
      case 'high':
        this.gtao.enabled = true; this.bloom.enabled = true; this.smaa.enabled = true;
        u.uGrain.value = 0.02; u.uCA.value = 0.0007; u.uVig.value = 0.32;
        return { shadows: true, pixelRatio: Math.min(dpr, 1.5), shadowSize: 2048 };
      default:
        this.gtao.enabled = true; this.bloom.enabled = true; this.smaa.enabled = true;
        u.uGrain.value = 0.024; u.uCA.value = 0.0009; u.uVig.value = 0.34;
        return { shadows: true, pixelRatio: dpr, shadowSize: 4096 };
    }
  }

  setSize(w: number, h: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    (this.grade.uniforms as Record<string, THREE.IUniform>).uRes.value.set(w * pixelRatio, h * pixelRatio);
  }

  render(): void {
    (this.grade.uniforms as Record<string, THREE.IUniform>).uTime.value = (performance.now() % 100000) / 1000;
    this.composer.render();
  }
}
