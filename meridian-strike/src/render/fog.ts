import * as THREE from 'three';
import { atmo, GLSL_CLOUD } from './atmo';

/** Shared fog-of-war texture + shader patch applied to terrain, props and entities. */
export const fog = {
  tex: new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.RedFormat),
  size: { value: 1024 },
  on: { value: 0 },
  map: { value: null as THREE.DataTexture | null },
  w: 0,
};
fog.tex.needsUpdate = true;
fog.map.value = fog.tex;

export function setupFog(worldSize: number, cells: number, enabled: boolean): void {
  fog.size.value = worldSize;
  fog.on.value = enabled ? 1 : 0;
  fog.w = cells;
  const data = new Uint8Array(cells * cells);
  fog.tex = new THREE.DataTexture(data, cells, cells, THREE.RedFormat);
  fog.tex.minFilter = fog.tex.magFilter = THREE.LinearFilter;
  fog.tex.wrapS = fog.tex.wrapT = THREE.ClampToEdgeWrapping;
  fog.tex.needsUpdate = true;
  fog.map.value = fog.tex;
}

export function updateFog(grid: Uint8Array): void {
  const d = fog.tex.image.data as Uint8Array;
  if (d.length !== grid.length) return;
  for (let i = 0; i < grid.length; i++) d[i] = grid[i] === 2 ? 255 : grid[i] === 1 ? 105 : 0;
  fog.tex.needsUpdate = true;
}

/** GLSL: cloud shadow + aerial perspective helpers, injected after <common> of every patched material. */
const FRAG_PARS = /* glsl */ `
varying vec2 vFogPos; varying vec3 vFogW;
uniform sampler2D uFogTex; uniform float uFogSize; uniform float uFogOn;
uniform vec4 uFogP; uniform vec3 uFogCol; uniform vec3 uFogSunCol; uniform vec3 uSunDir; uniform float uFogMul;
${GLSL_CLOUD}
float msCloudShadow(vec3 wp){
  float sy = max(uSunDir.y, 0.14);
  vec2 q = wp.xz + uSunDir.xz / sy * (uCloud.w - wp.y);
  return 1.0 - uCloudCov.z * msCloudDens(q);
}
vec3 msAerial(vec3 col, vec3 wpos){
  vec3 wv = wpos - cameraPosition;
  float dist = length(wv);
  vec3 vd = wv / max(dist, 0.001);
  float k = uFogP.y;
  float cy = cameraPosition.y - uFogP.z;
  float ky = k * vd.y;
  float seg = abs(ky) < 1e-4 ? dist : (1.0 - exp(clamp(-ky * dist, -18.0, 18.0))) / ky;
  float tau = (uFogP.x * exp(clamp(-k * cy, -12.0, 12.0)) * seg + uFogP.w * dist) * uFogMul;
  float f = 1.0 - exp(-tau);
  float s = pow(max(dot(vd, uSunDir), 0.0), 3.0);
  vec3 fc = mix(uFogCol, uFogSunCol, s);
  return mix(col, fc, f);
}
`;

export function patchFog(sh: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }): void {
  if (sh.fragmentShader.includes('uFogTex')) return;
  sh.uniforms.uFogTex = fog.map;
  sh.uniforms.uFogSize = fog.size;
  sh.uniforms.uFogOn = fog.on;
  sh.uniforms.uFogP = atmo.fogP;
  sh.uniforms.uFogCol = atmo.fogCol;
  sh.uniforms.uFogSunCol = atmo.fogSunCol;
  sh.uniforms.uSunDir = atmo.sunDir;
  sh.uniforms.uFogMul = atmo.fogMul;
  sh.uniforms.uCloudMap = atmo.cloudMap;
  sh.uniforms.uCloud = atmo.cloud;
  sh.uniforms.uCloudCov = atmo.cloudCov;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFogPos; varying vec3 vFogW;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 fwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fwp = instanceMatrix * fwp;
        #endif
        fwp = modelMatrix * fwp;
        vFogPos = fwp.xz;
        vFogW = fwp.xyz;
      }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float msCs = msCloudShadow(vFogW); reflectedLight.directDiffuse *= msCs; reflectedLight.directSpecular *= msCs; }`)
    .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        gl_FragColor.rgb = msAerial(gl_FragColor.rgb, vFogW);
      #endif
      if (uFogOn > 0.5) {
        float fv = texture2D(uFogTex, (vFogPos + uFogSize * 0.5) / uFogSize).r;
        float vis = smoothstep(0.55, 0.9, fv);
        float ex = smoothstep(0.1, 0.4, fv);
        vec3 lum = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)));
        vec3 explored = mix(lum, gl_FragColor.rgb, 0.45) * 0.4;
        gl_FragColor.rgb = mix(vec3(0.004), mix(explored, gl_FragColor.rgb, vis), ex);
      }`);
}
