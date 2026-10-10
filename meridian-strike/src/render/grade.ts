import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { atmo } from './atmo';

/**
 * Final colour grade, run on the display-referred (tone mapped, sRGB encoded) image:
 * split toning (cool shadows / warm highlights), lift, S-curve contrast, saturation,
 * radial chromatic aberration, vignette and fine film grain. Parameters come from the shared atmosphere
 * state so the Environment can push time-of-day / biome looks without knowing about the post stack.
 */
export const GradeShader = {
  name: 'MeridianGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uTime: { value: 0 },
    uSat: atmo.grade.sat,
    uContrast: atmo.grade.contrast,
    uLift: atmo.grade.lift,
    uShadowTint: atmo.grade.shadowTint,
    uHighTint: atmo.grade.highTint,
    uVig: { value: 0.32 },
    uGrain: { value: 0.022 },
    uCA: { value: 0.0014 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime;
    uniform float uSat; uniform float uContrast; uniform vec3 uLift; uniform vec3 uShadowTint; uniform vec3 uHighTint;
    uniform float uVig; uniform float uGrain; uniform float uCA;
    varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 ac = c * vec2(uRes.x / uRes.y, 1.0);
      float r2 = dot(ac, ac);
      vec2 off = c * uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // split toning
      col *= mix(vec3(1.0), uShadowTint, 1.0 - smoothstep(0.0, 0.5, l));
      col *= mix(vec3(1.0), uHighTint, smoothstep(0.3, 0.95, l));
      col += uLift * (1.0 - col);
      // S-curve contrast
      vec3 cs = col * col * (3.0 - 2.0 * col);
      col = mix(col, cs, clamp((uContrast - 1.0) * 3.0, 0.0, 1.0));
      col = (col - 0.5) * (1.0 + max(uContrast - 1.0, 0.0) * 0.25) + 0.5;
      // saturation (protect highlights from going neon)
      l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // vignette
      col *= 1.0 - uVig * smoothstep(0.25, 1.05, sqrt(r2) * 1.25);
      // film grain, strongest in the mids
      float g = hash(vUv * uRes + fract(uTime) * 61.7) - 0.5;
      col += g * uGrain * (1.0 - 0.7 * abs(l * 2.0 - 1.0));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makeGradePass(): ShaderPass {
  const p = new ShaderPass(new THREE.ShaderMaterial({
    name: GradeShader.name,
    uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms),
    vertexShader: GradeShader.vertexShader,
    fragmentShader: GradeShader.fragmentShader,
  }));
  // share the live atmosphere objects (UniformsUtils.clone copied them)
  const u = p.uniforms as Record<string, THREE.IUniform>;
  u.uSat = atmo.grade.sat; u.uContrast = atmo.grade.contrast; u.uLift = atmo.grade.lift;
  u.uShadowTint = atmo.grade.shadowTint; u.uHighTint = atmo.grade.highTint;
  return p;
}
