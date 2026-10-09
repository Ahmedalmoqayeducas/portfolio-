import * as THREE from 'three';

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

export function patchFog(sh: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }): void {
  sh.uniforms.uFogTex = fog.map;
  sh.uniforms.uFogSize = fog.size;
  sh.uniforms.uFogOn = fog.on;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFogPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 fwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fwp = instanceMatrix * fwp;
        #endif
        fwp = modelMatrix * fwp;
        vFogPos = fwp.xz;
      }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vFogPos; uniform sampler2D uFogTex; uniform float uFogSize; uniform float uFogOn;')
    .replace('#include <fog_fragment>', `
      if (uFogOn > 0.5) {
        float fv = texture2D(uFogTex, (vFogPos + uFogSize * 0.5) / uFogSize).r;
        float vis = smoothstep(0.55, 0.9, fv);
        float ex = smoothstep(0.1, 0.4, fv);
        vec3 lum = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)));
        vec3 explored = mix(lum, gl_FragColor.rgb, 0.45) * 0.4;
        gl_FragColor.rgb = mix(vec3(0.004), mix(explored, gl_FragColor.rgb, vis), ex);
      }
      #include <fog_fragment>`);
}
