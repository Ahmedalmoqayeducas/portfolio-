import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p){ return vnoise(p)*0.55 + vnoise(p*2.07+3.1)*0.3 + vnoise(p*4.3+7.7)*0.15; }
`;

export const shared = {
  night: { value: 0 },
  time: { value: 0 },
};

export type UnitStyle = 'usa' | 'china' | 'iran' | 'neutral';

const STYLE_CAMO: Record<UnitStyle, { c1: number; c2: number; kind: number }> = {
  usa: { c1: 0x56573a, c2: 0x4a3a28, kind: 0 },
  china: { c1: 0x2f3e26, c2: 0x8c8158, kind: 1 },
  iran: { c1: 0x4a5636, c2: 0x5a4632, kind: 2 },
  neutral: { c1: 0x6a6a58, c2: 0x504a40, kind: 0 },
};

const UNIT_VERT_PARS = /* glsl */ `
attribute vec4 aMat; attribute vec4 aEx; attribute vec2 aAnim;
varying vec3 vObjPos; varying vec3 vObjN; varying vec2 vCG; varying vec4 vMat; varying vec2 vEx; varying vec2 vAnim;
uniform float uTime;
`;

/**
 * PBR material for procedural units: vertex colours + per-vertex roughness/metal/emissive/AO (aMat), material kind and
 * edge wear (aEx), per-instance animation (aAnim: walk amount, phase). Procedural camo / grime / dust / chipped paint,
 * bump detail (hammered metal, track links, concrete), walker limb animation in the vertex shader.
 */
export function makeUnitMaterial(opts: { wreck?: boolean; style?: UnitStyle } = {}): THREE.MeshStandardMaterial {
  const style = opts.style ?? 'neutral';
  const camo = STYLE_CAMO[style];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  (m as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = { aAnim: [0, 0], aMat: [0.55, 0.2, 0, 1], aEx: [0, 0, 0, 0] };
  const c1 = new THREE.Color(camo.c1), c2 = new THREE.Color(camo.c2);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.time;
    sh.uniforms.uNight = shared.night;
    sh.uniforms.uC1 = { value: c1 };
    sh.uniforms.uC2 = { value: c2 };
    sh.uniforms.uStyle = { value: camo.kind };
    sh.uniforms.uWreck = { value: opts.wreck ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${UNIT_VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        mat3 limbR = mat3(1.0); vec3 limbP = vec3(0.0);
        {
          float lk = aEx.y;
          if (lk > 7.5 && lk < 11.5 && aAnim.x > 0.02) {
            float legs = step(lk, 9.5);
            float side = (lk == 8.0 || lk == 11.0) ? 0.0 : 3.14159;
            float sph = fract(aEx.z * 0.731 + aEx.w * 0.417) * 6.2831;
            float ang = sin(aAnim.y + sph + side) * aAnim.x * mix(0.45, 0.7, legs);
            float c = cos(ang), s = sin(ang);
            limbR = mat3(1.0, 0.0, 0.0,  0.0, c, s,  0.0, -s, c);
            limbP = vec3(aEx.z, mix(1.45, 0.92, legs), aEx.w);
          }
        }
        objectNormal = limbR * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed = limbP + limbR * (position - limbP);
        vObjPos = transformed; vObjN = objectNormal; vCG = uv; vMat = aMat; vEx = aEx.xy; vAnim = aAnim;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos; varying vec3 vObjN; varying vec2 vCG; varying vec4 vMat; varying vec2 vEx; varying vec2 vAnim;
        uniform float uNight; uniform vec3 uC1; uniform vec3 uC2; uniform float uStyle; uniform float uWreck;
        ${NOISE_GLSL}
        vec3 bumpPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
          vec3 R1 = cross(vSigmaY, surf_norm); vec3 R2 = cross(surf_norm, vSigmaX);
          float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          return normalize(abs(fDet) * surf_norm - vGrad);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gWear = 0.0; float gDirt = 0.0;
        {
          vec3 op = vObjPos;
          float kind = vEx.y;
          float camoAmt = vCG.x, grimeAmt = vCG.y;
          vec3 c = diffuseColor.rgb;
          // ---- camouflage (per faction pattern)
          if (camoAmt > 0.01) {
            float m1, m2;
            if (uStyle < 0.5) {
              m1 = smoothstep(0.50, 0.545, fbm3(op*0.55)); m2 = smoothstep(0.585, 0.625, fbm3(op*0.9+11.0));
            } else if (uStyle < 1.5) {
              vec3 q = floor(op/0.26);
              float j1 = h31(q) - 0.5, j2 = h31(q+7.0) - 0.5;
              m1 = step(0.5, fbm3(q*0.26*0.8) + j1*0.30); m2 = step(0.62, fbm3(q*0.26*1.3+5.0) + j2*0.30);
            } else {
              float n1 = vnoise(op*vec3(0.55,1.0,0.55)+1.3) + 0.35*(vnoise(op*2.1)-0.5);
              float n2 = vnoise(op*vec3(1.0,0.5,1.0)+9.1) + 0.3*(vnoise(op*2.7+4.0)-0.5);
              m1 = step(0.56, n1); m2 = step(0.6, n2);
            }
            c = mix(c, uC1, m1 * camoAmt);
            c = mix(c, uC2, m2 * camoAmt * (1.0 - m1*0.4));
          }
          // ---- soiling
          float low = 1.0 - smoothstep(0.0, 1.7, op.y);
          float streak = vnoise(vec3(op.x*2.3, op.y*0.35, op.z*2.3));
          gDirt = grimeAmt * (0.3 + 0.7*streak) * (0.4 + 0.9*low);
          float lum = dot(c, vec3(0.33));
          c = mix(c, c * vec3(0.52,0.48,0.42), clamp(gDirt, 0.0, 1.0) * 0.75);
          c = mix(c, vec3(0.36,0.29,0.2) * (lum + 0.25), clamp(low * grimeAmt * 0.45, 0.0, 0.6));
          float up = smoothstep(0.5, 0.95, vObjN.y);
          c = mix(c, vec3(0.5,0.42,0.3) * (lum + 0.2), up * grimeAmt * 0.3 * (0.4 + 0.6*vnoise(op*2.6)));
          // ---- concrete / plaster: stains, joints, speckle
          if (kind > 4.5 && kind < 5.5) {
            float st = vnoise(vec3(op.x*0.9, op.y*0.1, op.z*0.9));
            float blot = vnoise(op*0.22) * 0.6 + vnoise(op*0.9) * 0.4;
            c *= 0.78 + 0.34*blot;
            c *= 1.0 - 0.28*smoothstep(0.55, 0.9, st) * (1.0 - smoothstep(0.0, 14.0, op.y)*0.4);
            c *= 1.0 - (1.0 - smoothstep(0.0, 2.2, op.y)) * 0.32;
            float jx = smoothstep(0.03, 0.0, abs(fract(op.x/3.0)-0.5)-0.485), jy = smoothstep(0.03, 0.0, abs(fract(op.y/2.2)-0.5)-0.485), jz = smoothstep(0.03, 0.0, abs(fract(op.z/3.0)-0.5)-0.485);
            c *= 1.0 - 0.14*max(jx, max(jy, jz)) * step(0.5, abs(vObjN.y) < 0.5 ? 1.0 : 0.0);
            c *= 0.93 + 0.14*vnoise(op*30.0);
          } else {
            c *= 0.92 + 0.16*vnoise(op*5.1);
          }
          if (kind > 17.5 && kind < 18.5) {
            vec2 tc = vec2(floor(op.x*1.6), floor(op.z*1.1));
            c *= 0.82 + 0.36 * h31(vec3(tc, 3.0));
          } else if (kind > 18.5 && kind < 19.5) {
            vec3 bc = vec3(floor(op.x*1.5 + floor(op.y*3.0)*0.5), floor(op.y*3.0), floor(op.z*1.5 + floor(op.y*3.0)*0.5));
            c *= 0.8 + 0.4 * h31(bc);
          }
          // ---- chipped paint on edges
          float chip = smoothstep(0.38, 0.62, vnoise(op*13.0 + 3.0));
          gWear = vEx.x * chip * step(kind, 0.5);
          c = mix(c, vec3(0.34,0.32,0.3) * (0.7 + 0.6*vnoise(op*6.0)), gWear * 0.65);
          // ---- crevice darkening
          c *= 0.8 + 0.2 * vMat.w;
          // ---- wrecks: scorched
          if (uWreck > 0.5) { float soot = 0.18 + 0.2*vnoise(op*3.0); c = c * soot + vec3(0.02,0.015,0.01); }
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(vMat.x * (0.88 + 0.24*vnoise(vObjPos*9.0)) + gDirt*0.2 + gWear*0.15 + uWreck*0.3, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = clamp((vMat.y + gWear*0.55) * (1.0 - clamp(gDirt, 0.0, 1.0)*0.5), 0.0, 1.0) * (1.0 - uWreck*0.5);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float kk = vEx.y;
          vec3 q = vObjPos;
          float hh = 0.5 * vnoise(q*34.0);
          if (kk > 0.5 && kk < 1.5) {
            float tz = q.z * 3.0 - vAnim.y * 0.55;
            hh += smoothstep(0.18, 0.5, abs(fract(tz) - 0.5)) * 1.6 + 0.4*vnoise(q*vec3(9.0,9.0,2.0));
          } else if (kk > 1.5 && kk < 2.5) {
            hh += step(0.55, fract((q.z + q.y) * 3.4)) * 0.9;
          } else if (kk > 4.5 && kk < 5.5) {
            hh += 1.1*vnoise(q*11.0) + 0.7*vnoise(q*52.0);
          } else if (kk > 5.5 && kk < 6.5) {
            hh += 0.9 * vnoise(q*vec3(55.0,55.0,55.0));
          } else if (kk > 15.5 && kk < 16.5) {
            hh += smoothstep(0.25, 0.5, abs(fract(q.x*2.4)-0.5)) * 1.5;
          } else if (kk > 16.5 && kk < 17.5) {
            hh += smoothstep(0.25, 0.5, abs(fract(q.z*2.4)-0.5)) * 1.5;
          } else if (kk > 17.5 && kk < 18.5) {
            hh += smoothstep(0.2, 0.5, abs(fract(q.x*1.6)-0.5)) * 1.3 + smoothstep(0.35, 0.5, fract(q.z*1.1)) * 0.7;
          } else if (kk > 18.5 && kk < 19.5) {
            hh += (smoothstep(0.42, 0.5, abs(fract(q.y*3.0)-0.5)) + smoothstep(0.44, 0.5, abs(fract(q.x*1.5 + floor(q.y*3.0)*0.5)-0.5)) + smoothstep(0.44, 0.5, abs(fract(q.z*1.5 + floor(q.y*3.0)*0.5)-0.5))) * 0.9 + 0.5*vnoise(q*16.0);
          }
          float fadeB = 1.0 - smoothstep(25.0, 110.0, length(vViewPosition));
          normal = bumpPerturb(-vViewPosition, normal, vec2(dFdx(hh), dFdy(hh)) * (0.22 * fadeB), faceDirection);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vMat.z * (0.18 + uNight * 2.4);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          float aoI = vMat.w * vMat.w * (3.0 - 2.0 * vMat.w) * 0.5 + vMat.w * 0.5;
          reflectedLight.indirectDiffuse *= aoI;
          reflectedLight.indirectSpecular *= mix(1.0, aoI, 0.8);
          reflectedLight.directDiffuse *= mix(1.0, vMat.w, 0.4);
          reflectedLight.directSpecular *= mix(1.0, vMat.w, 0.6);
        }`);
  };
  return m;
}

/** team-colour parts: white vertex colours multiplied by the per-instance colour; slightly emissive so the colour reads in shade */
export function makeTeamMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0 });
  (m as unknown as { defaultAttributeValues: Record<string, number[]> }).defaultAttributeValues = { aAnim: [0, 0], aMat: [0.5, 0.0, 0, 1], aEx: [0, 0, 0, 0] };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${UNIT_VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        mat3 limbR = mat3(1.0); vec3 limbP = vec3(0.0);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = transformed; vObjN = objectNormal; vCG = uv; vMat = aMat; vEx = aEx.xy; vAnim = aAnim;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObjPos; varying vec3 vObjN; varying vec2 vCG; varying vec4 vMat; varying vec2 vEx; varying vec2 vAnim;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.22;`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= vMat.w;`);
  };
  return m;
}

export function makeGlowMaterial(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  return m;
}

export function setNight(k: number): void {
  shared.night.value = k;
}

/** soft round / smoke / spark sprite atlas (4 cells: puff, ring-ish smoke, spark, flash) */
export function makeParticleAtlas(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d')!;
  const cell = (cx: number, cy: number, draw: (g: CanvasRenderingContext2D) => void) => {
    g.save(); g.translate(cx * S, cy * S); g.beginPath(); g.rect(0, 0, S, S); g.clip(); draw(g); g.restore();
  };
  // 0: soft puff (noisy radial)
  cell(0, 0, (g) => {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.65)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * S * 0.34;
      const rr = 14 + Math.random() * 38;
      const gr = g.createRadialGradient(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 0, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rr);
      gr.addColorStop(0, `rgba(255,255,255,${0.12 + Math.random() * 0.12})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
  });
  // 1: dense smoke puff with darker lobes
  cell(1, 0, (g) => {
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.7) * S * 0.36;
      const rr = 16 + Math.random() * 46;
      const v = 200 + Math.floor(Math.random() * 55);
      const gr = g.createRadialGradient(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 0, S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rr);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.34)`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }
    const edge = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = edge; g.fillRect(0, 0, S, S);
  });
  // 2: hard spark
  cell(0, 1, (g) => {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  });
  // 3: flash star
  cell(1, 1, (g) => {
    g.translate(S / 2, S / 2);
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      const gr = g.createLinearGradient(0, 0, S * 0.5, 0);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, -6, S * 0.5, 12);
    }
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.3);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(-S / 2, -S / 2, S, S);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
