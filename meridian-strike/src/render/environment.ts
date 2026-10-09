import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';

/**
 * Sky dome + sun + cascaded shadows + image based lighting, all driven by one "hour of day" value.
 */
export class Environment {
  readonly sky = new Sky();
  readonly sun = new THREE.Vector3();
  readonly csm: CSM;
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly skyScene = new THREE.Scene();
  hour = 0;
  daylight = 1;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.sky.scale.setScalar(20000);
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u['turbidity'].value = 7;
    u['rayleigh'].value = 1.6;
    u['mieCoefficient'].value = 0.006;
    u['mieDirectionalG'].value = 0.82;
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.csm = new CSM({
      maxFar: 700,
      cascades: 4,
      mode: 'practical',
      parent: scene,
      shadowMapSize: 2048,
      lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
      camera,
      lightIntensity: 2.0,
      shadowBias: -0.0004,
    });
    this.csm.fade = true;
    scene.fog = new THREE.FogExp2(0xcdb99a, 0.00055);
  }

  /** Make a material receive cascaded shadows. */
  setupMaterial(m: THREE.Material): void {
    this.csm.setupMaterial(m);
  }

  setShadows(on: boolean): void {
    for (const l of this.csm.lights) l.castShadow = on;
  }

  /** hour in [0,24): 6 = sunrise, 12 = noon, 18 = sunset. */
  setHour(hour: number, bake = true): void {
    this.hour = ((hour % 24) + 24) % 24;
    const day = (this.hour - 6) / 12; // 0..1 over daylight
    const elev = Math.sin(day * Math.PI) * 62 + (day < 0 || day > 1 ? Math.sin(day * Math.PI) * 30 : 0);
    const azim = 100 + day * 160;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    this.sun.setFromSphericalCoords(1, phi, theta);

    const daylight = THREE.MathUtils.smoothstep(elev, -4, 14); // 0 night .. 1 day
    const u = this.sky.material.uniforms;
    u['sunPosition'].value.copy(this.sun);
    u['rayleigh'].value = 0.4 + 1.5 * daylight;

    const low = 1 - THREE.MathUtils.smoothstep(elev, 4, 30); // warm light near horizon
    const lightColor = new THREE.Color(1, 0.96, 0.9).lerp(new THREE.Color(1, 0.55, 0.28), low);
    // below the horizon the "sun" is replaced by a dim bluish moon so night stays readable
    const moon = new THREE.Vector3(-this.sun.x, Math.max(0.5, -this.sun.y), -this.sun.z).normalize();
    const lightDir = daylight > 0.02 ? this.sun : moon;
    lightColor.lerp(new THREE.Color(0.45, 0.58, 1.0), 1 - daylight);
    this.csm.lightDirection.copy(lightDir).negate();
    for (const l of this.csm.lights) {
      l.color.copy(lightColor);
      l.intensity = 2.0 * daylight + 0.9 * (1 - daylight);
    }

    this.daylight = daylight;
    // image based lighting from the sky itself (re-baked when the time changes)
    if (bake) {
      this.skyScene.clear();
      const skyClone = this.sky.clone();
      this.skyScene.add(skyClone);
      this.envTarget?.dispose();
      this.envTarget = this.pmrem.fromScene(this.skyScene, 0, 1, 40000);
      this.scene.environment = this.envTarget.texture;
    }
    this.scene.environmentIntensity = 0.45 + 0.25 * daylight;

    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(0x8d95a8).lerp(new THREE.Color(0xd8c3a0), daylight).lerp(new THREE.Color(0xe2a070), low * daylight * 0.5);
    fog.color.multiplyScalar(0.25 + 0.75 * daylight);
    this.renderer.toneMappingExposure = 0.75 - 0.15 * daylight;
  }

  update(): void {
    this.csm.update();
  }

  resize(): void {
    this.csm.updateFrustums();
  }
}
