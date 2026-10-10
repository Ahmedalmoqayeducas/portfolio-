import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import type { MapDef } from '../maps/maps';
import { atmo, ATMO_STYLES, AtmoStyle, CLOUD_ALT, getCloudMap, GLSL_CLOUD, GLSL_HASH, GLSL_SKY, makeSkyModel, skyAt, SkyModel } from './atmo';

const SKY_VERT = /* glsl */ `
varying vec3 vWorldPosition;
void main(){
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = /* glsl */ `
varying vec3 vWorldPosition;
uniform float uClouds; uniform float uNight; uniform float uTime;
uniform vec3 uBelow; uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform vec3 uMoonDir; uniform vec3 uFogHaze;
${GLSL_SKY}
${GLSL_CLOUD}
${GLSL_HASH}
void main(){
  vec3 dir = normalize(vWorldPosition - cameraPosition);
  vec3 col = skyRad(dir);
  float up = dir.y;
  // clouds (single layer, lit from the sun, soft self shadowing)
  if (uClouds > 0.0 && up > 0.005) {
    float t = (uCloud.w - cameraPosition.y) / max(up, 0.015);
    vec2 q = cameraPosition.xz + dir.xz * t;
    float d = msCloudDens(q);
    if (d > 0.003) {
      vec2 sd = normalize(uSkySun.xz + vec2(1e-4)) * (700.0 + 900.0 * (1.0 - uSkySun.y));
      float d1 = msCloudDens(q + sd * 0.5);
      float d2 = msCloudDens(q + sd * 1.3);
      float shade = exp(-(d1 * 1.1 + d2 * 0.9) * 1.25);
      float edge = pow(1.0 - d, 3.0);
      float cs = max(dot(dir, uSkySun), 0.0);
      vec3 cc = mix(uCloudDark, uCloudLit, shade);
      cc += uCloudLit * edge * pow(cs, 6.0) * 0.8;       // silver lining towards the sun
      float hz = smoothstep(0.0, 0.2, up);
      col = mix(col, mix(uFogHaze, cc, hz), d * uClouds * (0.55 + 0.4 * hz));
    }
  }
  // night: stars + moon
  if (uNight > 0.01 && up > -0.05) {
    vec3 sp = dir * 140.0;
    vec3 ci = floor(sp); vec3 f = fract(sp) - 0.5;
    float h = msHash13(ci);
    float star = step(0.9935, h) * smoothstep(0.38, 0.0, length(f)) * (0.5 + 0.5 * msHash13(ci + 7.7));
    col += vec3(0.8, 0.88, 1.0) * star * 1.4 * uNight * smoothstep(0.0, 0.25, up);
    float md = dot(dir, uMoonDir);
    float moon = smoothstep(0.99985, 0.99992, md);
    col += vec3(0.85, 0.9, 1.0) * moon * 5.0 * uNight;
    col += vec3(0.25, 0.32, 0.5) * pow(max(md, 0.0), 220.0) * 0.5 * uNight;
  }
  col = mix(col, uBelow, smoothstep(0.012, -0.12, up));
  gl_FragColor = vec4(col, 1.0);
}`;

function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    uniforms: {
      uSkySun: atmo.sky.sunDir, uBetaR: atmo.sky.betaR, uBetaM: atmo.sky.betaM, uSunE: atmo.sky.sunE, uMieG: atmo.sky.mieG,
      uSunDisk: { value: 1 }, uClouds: { value: 1 }, uNight: atmo.sky.night, uTime: { value: 0 },
      uBelow: { value: new THREE.Color(0.4, 0.4, 0.4) }, uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudDark: { value: new THREE.Color(0.4, 0.45, 0.55) },
      uMoonDir: atmo.sky.moonDir, uFogHaze: { value: new THREE.Color(0.6, 0.65, 0.75) },
      uCloudMap: atmo.cloudMap, uCloud: atmo.cloud, uCloudCov: atmo.cloudCov,
    },
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
}

/** Hooks: any scene child may carry `userData.update(camera, time)`, called once per frame by the Environment. */
export type FrameHook = (camera: THREE.Camera, time: number) => void;

/**
 * Sky dome + sun + cascaded shadows + image based lighting, all driven by one "hour of day" value.
 * Also owns the shared atmosphere uniforms (fog colours from the sky model, cloud shadows, colour grade).
 */
export class Environment {
  readonly sky: THREE.Mesh;
  readonly sun = new THREE.Vector3();
  readonly csm: CSM;
  readonly hemi: THREE.HemisphereLight;
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly envScene = new THREE.Scene();
  private readonly envSky: THREE.Mesh;
  readonly style: AtmoStyle;
  private readonly model: SkyModel = makeSkyModel(new THREE.Vector3(0, 1, 0), ATMO_STYLES.desert);
  private shadowSize = 2048;
  hour = 0;
  daylight = 1;
  /** sun/moon elevation in degrees (for other systems) */
  elevation = 45;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    def?: Pick<MapDef, 'biome' | 'weather'>,
  ) {
    this.style = ATMO_STYLES[def?.biome ?? 'desert'];
    getCloudMap();
    this.sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), makeSkyMaterial());
    this.sky.scale.setScalar(20000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.sky.userData.noAO = true;
    scene.add(this.sky);
    this.envSky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), makeSkyMaterial());
    this.envSky.scale.setScalar(20000);
    this.envSky.frustumCulled = false;
    (this.envSky.material as THREE.ShaderMaterial).uniforms.uClouds.value = 0;
    (this.envSky.material as THREE.ShaderMaterial).uniforms.uSunDisk.value = 0;
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.csm = new CSM({
      maxFar: 720,
      cascades: 4,
      mode: 'practical',
      parent: scene,
      shadowMapSize: this.shadowSize,
      lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
      camera,
      lightIntensity: 3,
      shadowBias: -0.00025,
      lightFar: 3200,
      lightMargin: 420,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) { l.shadow.normalBias = 0.3; }
    this.hemi = new THREE.HemisphereLight(0x8aa4d0, 0x6a5238, 0.2);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xcdb99a, 0.0006);
    atmo.fogMul.value = 1;
    atmo.cloudCov.value.set(this.style.cloudCover[0], this.style.cloudCover[1], 0.55);
    this.updateShadowBias();
  }

  /** Make a material receive cascaded shadows (chains with any onBeforeCompile the material already has). */
  setupMaterial(m: THREE.Material): void {
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
    this.csm.setupMaterial(m);
    const csmHook = m.onBeforeCompile;
    m.onBeforeCompile = function (this: THREE.Material, sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) {
      csmHook.call(this, sh, r);
      prev.call(this, sh, r);
    };
    m.customProgramCacheKey = () => 'csm|' + prevKey;
  }

  setShadows(on: boolean, size?: number): void {
    for (const l of this.csm.lights) l.castShadow = on;
    if (size && size !== this.shadowSize) {
      this.shadowSize = size;
      this.csm.shadowMapSize = size;
      for (const l of this.csm.lights) {
        l.shadow.mapSize.set(size, size);
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
      }
      this.updateShadowBias();
    }
  }

  /** hour in [0,24): 6 = sunrise, 12 = noon, 18 = sunset. */
  setHour(hour: number, bake = true): void {
    const st = this.style;
    this.hour = ((hour % 24) + 24) % 24;
    const day = (this.hour - 6) / 12; // 0..1 over daylight
    const elev = Math.sin(day * Math.PI) * 62 + (day < 0 || day > 1 ? Math.sin(day * Math.PI) * 30 : 0);
    const azim = 100 + day * 160;
    this.elevation = elev;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    this.sun.setFromSphericalCoords(1, phi, theta);

    const sunUp = THREE.MathUtils.smoothstep(elev, -3, 6);        // light switches off as the sun sets
    const daylight = THREE.MathUtils.smoothstep(elev, -5, 16);    // 0 night .. 1 day (ambient, grading)
    this.daylight = daylight;
    atmo.day.value = daylight;
    const night = 1 - THREE.MathUtils.smoothstep(elev, -14, -2);
    const nightK = 1 - daylight;

    // ---- sky model + fog colours (JS twin of the dome shader)
    makeSkyModel(this.sun, st, this.model);
    const m = this.model;
    const sm = (this.sky.material as THREE.ShaderMaterial).uniforms;
    const em = (this.envSky.material as THREE.ShaderMaterial).uniforms;
    atmo.sky.sunDir.value.copy(this.sun);
    atmo.sky.betaR.value.copy(m.betaR); atmo.sky.betaM.value.copy(m.betaM);
    atmo.sky.sunE.value = m.sunE; atmo.sky.mieG.value = m.g;
    atmo.sky.night.value = night;
    const moon = new THREE.Vector3(-this.sun.x, 0, -this.sun.z).normalize().multiplyScalar(0.7).setY(0.72).normalize();
    atmo.sky.moonDir.value.copy(moon);

    const tmp = new THREE.Color(), acc = new THREE.Color(0, 0, 0);
    const d = new THREE.Vector3();
    const sunAz = Math.atan2(this.sun.x, this.sun.z);
    let n = 0;
    for (let i = 0; i < 8; i++) {
      const a = sunAz + Math.PI * 0.35 + (i / 8) * Math.PI * 1.3;
      d.set(Math.sin(a), 0.035, Math.cos(a)).normalize();
      acc.add(skyAt(d, m, tmp)); n++;
    }
    acc.multiplyScalar(1 / n);
    const fogCol = acc.clone();
    fogCol.r *= st.hazeTint[0]; fogCol.g *= st.hazeTint[1]; fogCol.b *= st.hazeTint[2];
    // a little desaturation towards luminance keeps the haze from going neon
    const lum = fogCol.r * 0.3 + fogCol.g * 0.59 + fogCol.b * 0.11;
    fogCol.lerp(new THREE.Color(lum, lum, lum), 0.12);
    d.set(this.sun.x, 0, this.sun.z).normalize().setY(0.06).normalize();
    const fogSun = skyAt(d, m, new THREE.Color());
    fogSun.r *= st.hazeTint[0]; fogSun.g *= st.hazeTint[1]; fogSun.b *= st.hazeTint[2];
    fogSun.lerp(fogCol, 0.25);
    // floor so the night horizon keeps a faint blue glow rather than pure black
    const nightGlow = new THREE.Color(0.012, 0.018, 0.034).multiplyScalar(nightK);
    fogCol.add(nightGlow); fogSun.add(nightGlow);
    atmo.fogCol.value.copy(fogCol);
    atmo.fogSunCol.value.copy(fogSun);
    atmo.fogP.value.set(st.fogDensity, st.fogK, st.fogBase, st.haze);
    atmo.sunDir.value.copy(this.sun).y = Math.max(this.sun.y, 0.05);
    atmo.sunDir.value.normalize();

    // ---- sun / moon light
    const sinE = Math.max(0.0, Math.sin(THREE.MathUtils.degToRad(Math.max(elev, 0.01))));
    const air = 1 / (sinE + 0.15 * Math.pow(Math.max(elev, 0.01) + 3.885, -1.253));
    const tk = 0.055 * st.turbidity / 5 + 0.03;
    const trans = new THREE.Color(Math.exp(-air * tk * 0.78), Math.exp(-air * tk * 1.22), Math.exp(-air * tk * 2.2));
    const keyCol = new THREE.Color(1, 0.97, 0.9).multiply(trans);
    const base = 5.2 * st.sunPower * sunUp;
    const moonCol = new THREE.Color(0.52, 0.62, 1.0);
    const moonI = 0.85 * night * (1 - sunUp);
    const useSun = sunUp > 0.015;
    const lightDir = useSun ? this.sun : moon;
    const lightColor = useSun ? keyCol.clone().lerp(moonCol, (1 - sunUp) * 0.6) : moonCol;
    const intensity = useSun ? base + moonI * 0.5 : Math.max(0.2, moonI);
    this.csm.lightDirection.copy(lightDir).negate();
    for (const l of this.csm.lights) { l.color.copy(lightColor); l.intensity = intensity; }
    atmo.key.dir.value.copy(lightDir);
    atmo.key.col.value.copy(lightColor).multiplyScalar(intensity);
    // clouds are lit by the same key colour
    const cl = new THREE.Color(0.32, 0.32, 0.34).add(keyCol.clone().multiplyScalar(1.0 * sunUp + 0.04)).multiplyScalar(0.55 + 0.45 * daylight);
    const zen = skyAt(new THREE.Vector3(0.0, 1, 0), m, new THREE.Color());
    const cd = zen.clone().multiplyScalar(0.7).add(new THREE.Color(0.05, 0.05, 0.06)).multiplyScalar(0.4 + 0.6 * daylight);
    sm.uCloudLit.value.copy(cl); sm.uCloudDark.value.copy(cd);
    sm.uFogHaze.value.copy(fogCol); sm.uBelow.value.copy(fogCol).multiplyScalar(0.92);
    atmo.cloudCov.value.z = 0.32 * sunUp;

    // ---- ambient: hemisphere (cool sky / warm ground) + sky IBL
    this.hemi.color.copy(zen).lerp(new THREE.Color(0.3, 0.4, 0.8), 0.35);
    this.hemi.groundColor.setRGB(st.ground[0], st.ground[1], st.ground[2]);
    this.hemi.intensity = 0.08 + 0.55 * nightK * nightK + (1 - sunUp) * 0.15;
    const bounce = new THREE.Color(st.ground[0], st.ground[1], st.ground[2]);
    bounce.multiply(keyCol).multiplyScalar(0.55 * sunUp + 0.03);
    bounce.add(new THREE.Color(0.015, 0.02, 0.035).multiplyScalar(nightK));
    em.uBelow.value.copy(bounce);
    if (bake) {
      this.envTarget?.dispose();
      this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 40000);
      this.scene.environment = this.envTarget.texture;
    }
    this.scene.environmentIntensity = (0.5 * st.skyFill) * (0.15 + 0.85 * daylight) + 0.1 * nightK;

    // legacy scene fog (particles / un-patched materials)
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(fogCol);
    fog.density = st.fogDensity * 0.9 + st.haze * 4;

    // ---- exposure + colour grade
    this.renderer.toneMappingExposure = st.exposure * (1 + 0.5 * nightK);
    const g = atmo.grade;
    g.sat.value = st.sat * (1 - 0.18 * nightK);
    g.contrast.value = st.contrast;
    const warm = st.warm;
    g.highTint.value.setRGB(1.0 + 0.07 * warm, 1.0 + 0.01 * warm, 1.0 - 0.09 * warm).lerp(new THREE.Color(0.9, 0.95, 1.1), nightK);
    g.shadowTint.value.setRGB(0.94, 0.99, 1.07 + 0.03 * (1 - warm));
    g.lift.value.setRGB(0.004, 0.006, 0.012).lerp(new THREE.Color(0.004, 0.012, 0.03), nightK);
  }

  private updateShadowBias(): void {
    const lights = this.csm.lights;
    for (let i = 0; i < lights.length; i++) {
      const cam = lights[i].shadow.camera;
      const texel = (cam.right - cam.left) / this.shadowSize;
      lights[i].shadow.normalBias = Math.max(0.05, texel * 1.6);
      lights[i].shadow.bias = -0.0002 - texel * 0.0002;
    }
  }

  update(): void {
    const t = performance.now() / 1000;
    atmo.time.value = t;
    // clouds drift with the wind
    const w = atmo.wind.value;
    atmo.cloud.value.y = (t * 7 * w.x) / 15000;
    atmo.cloud.value.z = (t * 7 * w.z) / 15000;
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    this.csm.update();
    const ch = this.scene.children;
    for (let i = 0; i < ch.length; i++) {
      const u = ch[i].userData.update as FrameHook | undefined;
      if (u) u(this.camera, t);
    }
  }

  resize(): void {
    this.csm.updateFrustums();
    this.updateShadowBias();
  }

  /** altitude of the cloud plane (metres) */
  static readonly cloudAltitude = CLOUD_ALT;
}
