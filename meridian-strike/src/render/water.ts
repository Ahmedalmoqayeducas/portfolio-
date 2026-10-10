import * as THREE from 'three';
import { atmo, GLSL_SKY, periodicFbm } from './atmo';
import { patchFog } from './fog';
import { mulberry32 } from '../procgen/noise';

/**
 * Water surface: analytic depth from the heightfield texture (colour absorption, soft shoreline, animated
 * foam), 3-octave scrolling normals, Fresnel reflection of the analytic sky, sun glitter and cheap caustics.
 * Alpha blended over the already rendered terrain/units, so shallows show the sea bed.
 */

let waterTex: THREE.DataTexture | null = null;
/** rg: tangent normal xy, b: height noise, a: caustic web (cellular) */
function getWaterTex(): THREE.DataTexture {
  if (waterTex) return waterTex;
  const S = 256;
  const h = periodicFbm(S, 4, 5, 77);
  const rnd = mulberry32(5);
  const C = 10;
  const pts = new Float32Array(C * C * 2);
  for (let i = 0; i < C * C; i++) { pts[i * 2] = rnd(); pts[i * 2 + 1] = rnd(); }
  const d = new Uint8Array(S * S * 4);
  const at = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 9, dy = (at(x, y + 1) - at(x, y - 1)) * 9;
      const l = Math.hypot(dx, dy, 1);
      // periodic worley
      const fx = (x / S) * C, fy = (y / S) * C;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let f1 = 9, f2 = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = (((ix + i) % C) + C) % C, cy = (((iy + j) % C) + C) % C;
        const px = ix + i + pts[(cy * C + cx) * 2] - fx, py = iy + j + pts[(cy * C + cx) * 2 + 1] - fy;
        const dd = px * px + py * py;
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
      }
      const web = Math.min(1, Math.max(0, 1 - (Math.sqrt(f2) - Math.sqrt(f1)) * 3.2));
      const o = (y * S + x) * 4;
      d[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      d[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      d[o + 2] = Math.round(at(x, y) * 255);
      d[o + 3] = Math.round(web * web * 255);
    }
  }
  waterTex = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.magFilter = THREE.LinearFilter; waterTex.minFilter = THREE.LinearMipmapLinearFilter;
  waterTex.generateMipmaps = true; waterTex.anisotropy = 8;
  waterTex.needsUpdate = true;
  return waterTex;
}

const VERT = /* glsl */ `
#include <common>
varying vec3 vWP;
void main(){
  vec3 transformed = position;
  #include <project_vertex>
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`;

const FRAG = /* glsl */ `
#include <common>
varying vec3 vWP;
uniform sampler2D uWN;
uniform highp sampler2D uH;
uniform vec4 uW;          // x half, y step, z grid res, w water level
uniform vec3 uShallow; uniform vec3 uDeep;
uniform float uDay; uniform float uTime;
uniform vec3 uKeyDir; uniform vec3 uKeyCol;
${GLSL_SKY}
float hAt(vec2 xz){
  vec2 g = clamp((xz + uW.x) / uW.y, vec2(0.0), vec2(uW.z - 1.001));
  ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);
  float a = texelFetch(uH, i, 0).r, b = texelFetch(uH, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uH, i + ivec2(0, 1), 0).r, d = texelFetch(uH, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main(){
  float t = uTime;
  vec2 p = vWP.xz;
  vec3 toCam = cameraPosition - vWP;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float depth = uW.w - hAt(p);
  if (depth < -0.03) discard;
  float far = smoothstep(150.0, 1100.0, dist);
  vec3 n1 = texture2D(uWN, p / 57.0 + vec2(t * 0.0113, t * 0.0071)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uWN, p / 19.0 + vec2(-t * 0.0231, t * 0.0173) + 0.31).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(uWN, p / 5.1 + vec2(t * 0.047, -t * 0.039) + 0.7).xyz * 2.0 - 1.0;
  vec2 gr = (n1.xy * 0.9 + n2.xy * 0.75 + n3.xy * 0.55 * (1.0 - far)) * mix(1.0, 0.35, far);
  vec3 N = normalize(vec3(gr.x, 1.0, gr.y));
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.015;
  vec3 refl = skyRad(normalize(R));
  // sun / moon glitter
  vec3 L = uKeyDir;
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 700.0) * 45.0 + pow(nh, 80.0) * 1.1;
  float fs = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  vec3 sunSpec = uKeyCol * spec * fs * smoothstep(0.0, 0.12, L.y);
  // body colour
  float k = 1.0 - exp(-depth * 0.3);
  vec3 body = mix(uShallow, uDeep, k) * (0.22 + 0.78 * uDay);
  float c1 = texture2D(uWN, p / 8.3 + vec2(t * 0.019, t * 0.013)).a;
  float c2 = texture2D(uWN, p / 6.1 + vec2(-t * 0.015, t * 0.023) + 0.4).a;
  float caus = c1 * c2 * 9.0 * (1.0 - smoothstep(0.0, 4.5, depth)) * smoothstep(0.0, 0.4, depth);
  body += uKeyCol * caus * 0.045 * uDay * vec3(0.8, 1.0, 1.0);
  body += uKeyCol * 0.018 * (1.0 - k);
  vec3 col = mix(body, refl, F);
  col += sunSpec;
  float alpha = 1.0 - exp(-depth * 1.05);
  alpha = mix(alpha, 1.0, F * 0.85);
  alpha *= smoothstep(0.0, 0.3, depth);
  // shoreline foam
  float fn = texture2D(uWN, p / 12.0 + vec2(t * 0.012, -t * 0.01)).b;
  float fn2 = texture2D(uWN, p / 2.9 + vec2(-t * 0.02, t * 0.03)).b;
  float swash = 0.5 + 0.5 * sin(t * 0.75 + fn * 6.2831);
  float band = 1.0 - smoothstep(0.0, 0.5 + 0.75 * swash, depth + (fn - 0.5) * 0.55);
  float lace = smoothstep(0.38, 0.62, fn2 + band * 0.45);
  float foam = band * lace + (1.0 - smoothstep(0.0, 0.14, depth)) * 0.55;
  foam = clamp(foam, 0.0, 1.0);
  vec3 foamCol = vec3(0.82, 0.88, 0.9) * (0.3 + 0.7 * uDay) + uKeyCol * 0.05;
  col = mix(col, foamCol, foam * 0.85);
  alpha = max(alpha, foam * 0.92);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export interface WaterOpts {
  size: number;
  level: number;
  heights: THREE.DataTexture;
  res: number;
  step: number;
  shallow: THREE.ColorRepresentation;
  deep: THREE.ColorRepresentation;
}

export function makeWater(o: WaterOpts): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(18000, 18000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uWN: { value: getWaterTex() },
    uH: { value: o.heights },
    uW: { value: new THREE.Vector4(o.size / 2, o.step, o.res, o.level) },
    uShallow: { value: new THREE.Color(o.shallow) },
    uDeep: { value: new THREE.Color(o.deep) },
    uDay: atmo.day, uTime: atmo.time,
    uKeyDir: atmo.key.dir, uKeyCol: atmo.key.col,
    uSkySun: atmo.sky.sunDir, uBetaR: atmo.sky.betaR, uBetaM: atmo.sky.betaM, uSunE: atmo.sky.sunE, uMieG: atmo.sky.mieG,
    uSunDisk: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, fog: true,
  });
  mat.onBeforeCompile = (sh) => patchFog(sh);
  mat.customProgramCacheKey = () => 'water';
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, o.level, 0);
  m.receiveShadow = false;
  m.frustumCulled = false;
  m.renderOrder = 2;
  m.name = 'water';
  m.userData.noAO = true;
  return m;
}
