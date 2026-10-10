import * as THREE from 'three';
import { patchFog } from './fog';
import type { LayerSet } from './terrainTex';
import type { TerrainMaps } from './terrainData';
import type { Biome } from '../maps/maps';

/**
 * PBR splat material for the terrain: 8 procedural layers in texture arrays, blended by slope / height /
 * biome control maps with height-aware transitions, two-scale anti-tiling, triplanar rock on steep faces,
 * a hi-res bicubic normal map from the heightfield, roads with lane markings, shoreline wetness.
 * Built on MeshStandardMaterial so CSM shadows, IBL and the fog-of-war patch keep working.
 */

const CLIFF: Record<Biome, [number, number]> = {
  desert: [0.1, 0.3], urban: [0.1, 0.3], oasis: [0.1, 0.28], highland: [0.13, 0.36], mixed: [0.1, 0.3],
};

const VERT_PARS = /* glsl */ `varying vec3 vTW; varying vec3 vTN;`;
const VERT_SET = /* glsl */ `
  vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vTN = normalize(mat3(modelMatrix) * objectNormal);`;

const FRAG_PARS = /* glsl */ `
varying vec3 vTW; varying vec3 vTN;
uniform highp sampler2DArray uAlb;
uniform highp sampler2DArray uNrmA;
uniform float uTile[8];
uniform sampler2D uNrm; uniform sampler2D uCtl; uniform sampler2D uCtl2; uniform sampler2D uRoad; uniform sampler2D uMacro;
uniform vec4 uWorld;   // x half, y size, z water level, w mip level of the 1x1 average
uniform vec4 uBiome;   // x cliff0, y cliff1, z snow world, w -
uniform vec4 uQ;       // x detail scale-B amount, y triplanar

void msSampleL(int l, vec3 wp, vec3 N, vec3 dpx, vec3 dpy, float sm, bool rot, out vec4 ar, out vec3 wn, out float hh, out float cv){
  float k = 1.0 / (uTile[l] * sm);
  float fl = float(l);
  if (l != 2 || uQ.y < 0.5) {
    mat2 R = rot ? mat2(0.8, 0.6, -0.6, 0.8) : mat2(1.0, 0.0, 0.0, 1.0);
    vec2 uv = R * wp.xz * k, gx = R * dpx.xz * k, gy = R * dpy.xz * k;
    ar = textureGrad(uAlb, vec3(uv, fl), gx, gy);
    vec4 nh = textureGrad(uNrmA, vec3(uv, fl), gx, gy);
    vec2 t = nh.xy * 2.0 - 1.0;
    t = t * R;
    float tz = sqrt(max(1.0 - dot(t, t), 0.05));
    wn = normalize(vec3(N.x + t.x, N.y * tz, N.z + t.y));
    hh = nh.a; cv = nh.b;
  } else {
    vec3 bw = pow(abs(N), vec3(5.0));
    bw /= (bw.x + bw.y + bw.z);
    ar = vec4(0.0); wn = vec3(0.0); hh = 0.0; cv = 0.0;
    float ws = 0.0;
    if (bw.y > 0.04) {
      vec2 uv = wp.xz * k, gx = dpx.xz * k, gy = dpy.xz * k;
      vec4 a = textureGrad(uAlb, vec3(uv, fl), gx, gy); vec4 nh = textureGrad(uNrmA, vec3(uv, fl), gx, gy);
      vec2 t = nh.xy * 2.0 - 1.0; float tz = sqrt(max(1.0 - dot(t, t), 0.05));
      ar += a * bw.y; wn += vec3(t.x + N.x, tz * N.y, t.y + N.z) * bw.y; hh += nh.a * bw.y; cv += nh.b * bw.y; ws += bw.y;
    }
    if (bw.x > 0.04) {
      vec2 uv = wp.zy * k, gx = dpx.zy * k, gy = dpy.zy * k;
      vec4 a = textureGrad(uAlb, vec3(uv, fl), gx, gy); vec4 nh = textureGrad(uNrmA, vec3(uv, fl), gx, gy);
      vec2 t = nh.xy * 2.0 - 1.0; float tz = sqrt(max(1.0 - dot(t, t), 0.05));
      ar += a * bw.x; wn += vec3(tz * N.x, t.y + N.y, t.x + N.z) * bw.x; hh += nh.a * bw.x; cv += nh.b * bw.x; ws += bw.x;
    }
    if (bw.z > 0.04) {
      vec2 uv = wp.xy * k, gx = dpx.xy * k, gy = dpy.xy * k;
      vec4 a = textureGrad(uAlb, vec3(uv, fl), gx, gy); vec4 nh = textureGrad(uNrmA, vec3(uv, fl), gx, gy);
      vec2 t = nh.xy * 2.0 - 1.0; float tz = sqrt(max(1.0 - dot(t, t), 0.05));
      ar += a * bw.z; wn += vec3(t.x + N.x, t.y + N.y, tz * N.z) * bw.z; hh += nh.a * bw.z; cv += nh.b * bw.z; ws += bw.z;
    }
    float iw = 1.0 / max(ws, 1e-3);
    ar *= iw; hh *= iw; cv *= iw; wn = normalize(wn * iw);
  }
}

void msTerrain(vec3 wp, out vec3 oAlb, out float oRough, out vec3 oN, out float oAO){
  vec3 dpx = dFdx(wp), dpy = dFdy(wp);
  float dist = length(wp - cameraPosition);
  vec2 tuv = (wp.xz + uWorld.x) / uWorld.y;
  vec4 mac = texture2D(uMacro, wp.xz / 397.0);
  vec4 mac2 = texture2D(uMacro, wp.xz / 59.0 + vec2(0.37, 0.11));
  float m1 = mac.r, m2 = mac.g, m3 = mac2.b, m4 = mac2.a;
  #ifdef RING
    vec3 N = normalize(vTN);
    vec4 ctl = vec4(0.0);
    vec4 ct2 = vec4(0.0, 0.0, 0.5, 1.0);
    vec4 rd = vec4(0.0);
    float tAO = 1.0, cavT = 0.5;
    ct2.g = uBiome.z > 0.5 ? smoothstep(0.0, 55.0, wp.y + (m1 - 0.5) * 70.0) : smoothstep(0.55, 0.75, m1) * 0.8;
  #else
    vec4 nd = texture2D(uNrm, tuv);
    vec3 N = normalize(vec3(nd.x, sqrt(max(1.0 - nd.x * nd.x - nd.y * nd.y, 0.04)), nd.y));
    vec4 ctl = texture2D(uCtl, tuv);
    vec4 ct2 = texture2D(uCtl2, tuv);
    vec4 rd = texture2D(uRoad, tuv);
    float tAO = nd.w, cavT = nd.z;
  #endif
  float sl = 1.0 - N.y;
  float cliff = smoothstep(uBiome.x, uBiome.y, sl + (m3 - 0.5) * 0.07);
  float flatw = 1.0 - cliff;
  float asph = smoothstep(0.3, 0.7, rd.r + (m4 - 0.5) * 0.1);
  float shoulder = smoothstep(0.06, 0.55, ct2.r) * (1.0 - asph);
  float conc = smoothstep(0.35, 0.65, ctl.a + (m4 - 0.5) * 0.3) * (1.0 - asph);
  float pad = ctl.b;
  float dirtA = clamp(ctl.g * 0.8 + smoothstep(0.62, 0.9, m1) * 0.4 + pad * 0.8 + shoulder * 0.3, 0.0, 1.0);
  float gravel = max(smoothstep(uBiome.x * 0.35, uBiome.x * 1.15, sl) * flatw, max(shoulder * 0.8, smoothstep(0.72, 0.88, m4 * 0.5 + m2 * 0.5) * 0.55 * flatw));
  gravel = max(gravel, pad * 0.4 * smoothstep(0.45, 0.7, m3));
  float veg = ctl.r * flatw * (1.0 - pad) * (1.0 - shoulder);
  veg *= smoothstep(0.12, 0.45, ctl.r * 0.8 + (m3 - 0.5) * 0.5 + 0.2);
  float spec = ct2.g * flatw;
  if (uBiome.z > 0.5) spec *= 1.0 - smoothstep(0.15, 0.4, sl);
  spec *= 1.0 - veg * 0.7;

  float w[8];
  float w2 = cliff * (1.0 - asph);
  float w6 = asph;
  float w7 = conc * flatw;
  float rest = max(1.0 - w2 - w6 - w7, 0.0);
  float a5 = rest * spec;
  float r2 = rest - a5;
  float a4 = r2 * veg;
  float r3 = r2 - a4;
  float a3 = r3 * gravel;
  float r4 = r3 - a3;
  float a1 = r4 * dirtA;
  w[0] = r4 - a1; w[1] = a1; w[2] = w2; w[3] = a3; w[4] = a4; w[5] = a5; w[6] = w6; w[7] = w7;

  // pass 1: scale A of every contributing layer + height-aware blend weights
  vec4 aa[8]; vec3 nn[8]; float hts[8]; float cc[8]; float v[8];
  float hbk = 0.6 * (1.0 - smoothstep(20.0, 130.0, dist));
  float ma = -1.0;
  for (int i = 0; i < 8; i++) {
    aa[i] = vec4(0.0); nn[i] = N; hts[i] = 0.0; cc[i] = 1.0; v[i] = -1.0;
    if (w[i] > 0.012) {
      msSampleL(i, wp, N, dpx, dpy, 1.0, false, aa[i], nn[i], hts[i], cc[i]);
      v[i] = w[i] + (hts[i] - 0.5) * hbk * min(1.0, w[i] * 3.0);
      ma = max(ma, v[i]);
    }
  }
  float b[8]; float bs = 0.0;
  for (int i = 0; i < 8; i++) {
    b[i] = v[i] > -0.5 ? max(v[i] - ma + 0.2, 0.0) : 0.0;
    bs += b[i];
  }
  float ib = 1.0 / max(bs, 1e-4);
  float lodB = (1.0 - smoothstep(300.0, 750.0, dist)) * uQ.x;
  vec3 alb = vec3(0.0); float rough = 0.0; vec3 nW = vec3(0.0); float ao = 0.0; vec3 albAvg = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float bi = b[i] * ib;
    if (bi > 0.02) {
      vec3 albI = aa[i].rgb; vec3 nI = nn[i];
      albAvg += textureLod(uAlb, vec3(0.5, 0.5, float(i)), uWorld.w).rgb * bi;
      if (lodB > 0.01 && bi > 0.05) {
        vec4 a2; vec3 n2; float h2, c2;
        msSampleL(i, wp, N, dpx, dpy, 4.73, true, a2, n2, h2, c2);
        vec3 avg = textureLod(uAlb, vec3(0.5, 0.5, float(i)), uWorld.w).rgb;
        vec3 mm = clamp(a2.rgb / max(avg, vec3(0.02)), vec3(0.5), vec3(1.8));
        albI *= mix(vec3(1.0), mm, 0.75 * lodB);
        nI = normalize(nI + (n2 - N) * 0.7 * lodB);
      }
      alb += albI * bi; rough += aa[i].a * bi; nW += nI * bi; ao += cc[i] * bi;
    }
  }
  nW = normalize(nW);
  // mid-distance detail fade: high-frequency albedo contrast relaxes toward the layer average (kills speckle shimmer)
  alb = mix(alb, albAvg, 0.72 * smoothstep(9.0, 75.0, dist));

  // large scale tint + cavity from the terrain normal map
  float tA = (m1 - 0.5) * 0.5, tB = (m2 - 0.5) * 0.34;
  alb *= vec3(1.0 + tA + tB * 0.5, 1.0 + tA * 0.92, 1.0 + tA * 0.8 - tB * 0.45) * (0.9 + 0.2 * m3);
  alb *= 1.0 - (cavT - 0.5) * 0.7;
  // wet / dark patches
  float wetP = smoothstep(0.55, 0.9, ct2.b * 0.6 + m2 * 0.5) * flatw * (1.0 - asph);
  alb *= 1.0 - 0.25 * wetP; rough = mix(rough, rough * 0.7, wetP);
  // road markings + wear
  alb = mix(alb, vec3(0.6, 0.58, 0.52), clamp(rd.g, 0.0, 1.0) * asph * 0.6);
  alb *= 1.0 - 0.3 * rd.b * asph;
  rough = mix(rough, 0.6, rd.b * asph * 0.5);
  // shoreline
  float sd = wp.y - uWorld.z;
  float wetS = 1.0 - smoothstep(0.0, 1.3 + 1.4 * m2, sd);
  alb *= mix(1.0, 0.5, wetS);
  rough = mix(rough, 0.28, wetS * 0.8);
  alb *= mix(1.0, 0.7, smoothstep(0.0, -1.5, sd));

  oAlb = alb;
  oRough = clamp(rough, 0.05, 1.0);
  oN = nW;
  oAO = mix(1.0, tAO, 0.9) * mix(1.0, ao, 0.65);
}
`;

export interface TerrainMatOpts {
  layers: LayerSet;
  maps?: TerrainMaps;
  macro: THREE.Texture;
  biome: Biome;
  size: number;
  waterLevel: number | null;
  ring?: boolean;
}

export function makeTerrainMaterial(o: TerrainMatOpts): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const cl = CLIFF[o.biome];
  const dummy = o.macro;
  const uniforms: Record<string, THREE.IUniform> = {
    uAlb: { value: o.layers.albedo },
    uNrmA: { value: o.layers.normal },
    uTile: { value: o.layers.tile.slice() },
    uNrm: { value: o.maps?.nrm ?? dummy },
    uCtl: { value: o.maps?.ctl ?? dummy },
    uCtl2: { value: o.maps?.ctl2 ?? dummy },
    uRoad: { value: o.maps?.road ?? dummy },
    uMacro: { value: o.macro },
    uWorld: { value: new THREE.Vector4(o.size / 2, o.size, o.waterLevel ?? -1e5, Math.log2(o.layers.size)) },
    uBiome: { value: new THREE.Vector4(cl[0], cl[1], o.biome === 'highland' ? 1 : 0, 0) },
    uQ: { value: new THREE.Vector4(1, 1, 0, 0) },
  };
  if (o.ring) mat.defines = { RING: 1 };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    patchFog(sh);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_SET);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', `
        vec3 msAlb; float msRough; vec3 msN; float msAO;
        msTerrain(vTW, msAlb, msRough, msN, msAO);
        diffuseColor.rgb = msAlb;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = msRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(msN, 0.0)).xyz);')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= msAO;
        reflectedLight.indirectSpecular *= mix(1.0, msAO, 0.8);
        reflectedLight.directDiffuse *= mix(1.0, msAO, 0.3);`);
  };
  mat.customProgramCacheKey = () => (o.ring ? 'terrain-ring' : 'terrain-main');
  return mat;
}
