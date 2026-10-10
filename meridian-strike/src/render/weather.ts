import * as THREE from 'three';
import type { Weather as WeatherKind } from '../maps/maps';

/** Camera-attached particle weather (snow / sand / dust) with periodic sandstorms. */
export class Weather {
  private points: THREE.Points | null = null;
  private uniforms: Record<string, THREE.IUniform> | null = null;
  private time = 0;
  private storm = 0;
  private stormTarget = 0;
  private nextStorm = 70;
  private baseFog = 0;
  private fogBase: THREE.FogExp2 | null = null;
  storming = false;

  constructor(private scene: THREE.Scene, private kind: WeatherKind, _camera: THREE.Camera) {
    if (kind === 'none') return;
    const n = kind === 'snow' ? 9000 : kind === 'sandstorm' ? 9000 : 3500;
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.uniforms = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: 150 },
      uVel: { value: kind === 'snow' ? new THREE.Vector3(3, -5, 1.5) : kind === 'sandstorm' ? new THREE.Vector3(34, -0.5, 10) : new THREE.Vector3(2, 0.3, 1) },
      uSize: { value: kind === 'snow' ? 3.2 : kind === 'sandstorm' ? 2.4 : 1.8 },
      uColor: { value: new THREE.Color(kind === 'snow' ? 0xf4f8ff : kind === 'sandstorm' ? 0xc89b62 : 0xd9c9a8) },
      uAlpha: { value: kind === 'snow' ? 0.85 : kind === 'sandstorm' ? 0 : 0.25 },
      uLight: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed; uniform float uTime; uniform vec3 uCenter; uniform float uBox; uniform vec3 uVel; uniform float uSize;
        varying float vFade;
        void main(){
          vec3 p = aSeed * uBox + uVel * uTime;
          p = mod(p, uBox) - uBox * 0.5;
          vec3 w = vec3(uCenter.x + p.x, uCenter.y + 10.0 + (p.y + uBox * 0.5) * 0.55 - 6.0, uCenter.z + p.z);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (260.0 / max(1.0, -mv.z));
          vFade = smoothstep(uBox * 0.5, uBox * 0.3, length(p.xz));
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAlpha; uniform float uLight; varying float vFade;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.15, length(c)) * uAlpha * vFade;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * uLight, a);
        }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
    scene.add(this.points);
  }

  update(dt: number, target: THREE.Vector3, daylight: number): void {
    if (!this.points || !this.uniforms) return;
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    (u.uCenter.value as THREE.Vector3).copy(target);
    u.uLight.value = 0.35 + 0.65 * daylight;
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog && !this.fogBase) { this.fogBase = fog; this.baseFog = fog.density; }
    if (this.kind === 'sandstorm') {
      this.nextStorm -= dt;
      if (this.nextStorm <= 0) {
        this.stormTarget = this.stormTarget > 0.5 ? 0 : 1;
        this.nextStorm = this.stormTarget > 0.5 ? 55 : 110 + Math.random() * 60;
      }
      this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 0.25);
      this.storming = this.storm > 0.3;
      u.uAlpha.value = this.storm * 0.55;
      if (fog) fog.density = this.baseFog * (1 + this.storm * 7);
    } else if (this.kind === 'snow') {
      if (fog) fog.density = this.baseFog * 2.2;
    }
  }
}
