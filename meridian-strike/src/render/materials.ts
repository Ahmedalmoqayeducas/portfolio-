import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
float h31(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i+vec3(0,0,0)),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;

export const shared = {
  night: { value: 0 },
};

/** PBR material for procedural units: vertex colours + shader camo / grime driven by uv (camo, grime). */
export function makeUnitMaterial(opts: { wreck?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.wreck ? 0.95 : 0.62, metalness: opts.wreck ? 0.1 : 0.32 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos; varying vec2 vMat;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position; vMat = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vObjPos; varying vec2 vMat;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float n1 = vnoise(vObjPos*0.62) + 0.5*vnoise(vObjPos*1.7+4.0);
          float cm = smoothstep(0.55, 0.75, n1) - smoothstep(1.05, 1.25, n1)*0.9;
          vec3 camoTone = mix(vec3(1.0), mix(vec3(0.62,0.66,0.58), vec3(1.22,1.12,0.92), step(0.0, cm)), abs(cm));
          diffuseColor.rgb *= mix(vec3(1.0), camoTone, vMat.x);
          float streak = vnoise(vec3(vObjPos.x*2.5, vObjPos.y*0.5, vObjPos.z*2.5));
          float low = 1.0 - smoothstep(0.0, 2.2, vObjPos.y);
          float dirt = vMat.y * (0.35 + 0.65*streak) * (0.45 + 0.9*low);
          diffuseColor.rgb *= 1.0 - dirt*0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34,0.28,0.2)*dot(diffuseColor.rgb,vec3(0.33)), low*vMat.y*0.25);
          // fine surface noise on everything
          diffuseColor.rgb *= 0.9 + 0.2*vnoise(vObjPos*4.3);
          // structures (grime >= 0.45): panel seams, weathering streaks and base darkening
          float st = step(0.45, vMat.y);
          vec3 q = vObjPos;
          float seamX = smoothstep(0.035, 0.0, abs(fract(q.x/3.2)-0.5)-0.47);
          float seamY = smoothstep(0.035, 0.0, abs(fract(q.y/2.4)-0.5)-0.47);
          float seamZ = smoothstep(0.035, 0.0, abs(fract(q.z/3.2)-0.5)-0.47);
          float seams = max(seamX, max(seamY, seamZ));
          float streak2 = vnoise(vec3(q.x*1.3, q.y*0.18, q.z*1.3));
          diffuseColor.rgb *= 1.0 - st*(seams*0.16 + (1.0-smoothstep(0.0, 14.0, q.y))*0.18*streak2 + (1.0-smoothstep(0.0,1.6,q.y))*0.25);
        }
      `);
  };
  return m;
}

export function makeTeamMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
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
