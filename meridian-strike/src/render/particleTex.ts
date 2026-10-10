import * as THREE from 'three';

/**
 * Procedural VFX texture bake.
 *
 * Everything is generated on the GPU at load (a throw-away WebGL context renders each flipbook frame with a
 * fragment shader, we read the pixels back once and upload them as texture arrays). No assets, no network.
 *
 *  big   (256^2 x 32 layers)  4 smoke puffs x 4 frames 0-15, fireball 16-31
 *  small (128^2 x 32 layers)  dust 0-7, wisp 8-15, flame tongue 16-23, grit/dirt 24-31
 *  noise (256^2, tileable)    R fine fbm, G worley billows, B low-freq fbm, A fine grain
 *  decal (512^2 atlas, 2x2)   scorch, crater, soot blot, spatter     (R = dark mask, G = light mask)
 *
 * Smoke-family layers store  R = density, G/B = relight normal xy (0.5 = flat), A = thickness (self shadow).
 * Fire layers store          R = density, G = temperature, B = soot, A = grain.
 */

export const SHEET = { SMOKE_A: 0, SMOKE_B: 1, SMOKE_C: 2, SMOKE_D: 3, FIRE: 4, DUST: 5, WISP: 6, FLAME: 7, GRIT: 8 } as const;

export interface VfxTextures {
  big: THREE.DataArrayTexture;
  small: THREE.DataArrayTexture;
  noise: THREE.DataTexture;
  decal: THREE.DataTexture;
  raw: { big: Uint8Array<ArrayBuffer>; small: Uint8Array<ArrayBuffer>; noise: Uint8Array<ArrayBuffer>; decal: Uint8Array<ArrayBuffer> };
  ms: number;
}

const BIG = 256, SMALL = 128, NOISE = 256, DECAL = 512;

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uMode, uFrame, uCount, uSeed, uRes;

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h13(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

float vn3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = h13(i), b = h13(i+vec3(1,0,0)), c = h13(i+vec3(0,1,0)), d = h13(i+vec3(1,1,0));
  float e = h13(i+vec3(0,0,1)), g = h13(i+vec3(1,0,1)), hh = h13(i+vec3(0,1,1)), k = h13(i+vec3(1,1,1));
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(hh,k,f.x), f.y), f.z);
}
const mat2 R2 = mat2(0.8, 0.6, -0.6, 0.8);
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vn3(p); p.xy = R2 * p.xy * 2.03; p.z = p.z * 1.7 + 3.1; a *= 0.5; }
  return s / 0.9375;
}
// F1 distance of animated 2D cells (loops over t in [0,1])
float worley(vec2 p, float t){
  vec2 i = floor(p), f = fract(p); float d = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = h22(i + g);
    o = 0.5 + 0.5 * sin(6.2831 * (t + o));
    vec2 r = g + o - f; d = min(d, dot(r, r));
  }
  return sqrt(d);
}

// ---- tileable noise (for the shared erosion texture)
float vnp(vec2 p, float per){
  vec2 i = floor(p), f = fract(p); f = f*f*f*(f*(f*6.0-15.0)+10.0);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  float a = h12(i0), b = h12(vec2(i1.x, i0.y)), c = h12(vec2(i0.x, i1.y)), d = h12(i1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbmp(vec2 p, float per, float seed){
  float a = 0.5, s = 0.0;
  p += seed * 31.7;
  for (int i = 0; i < 5; i++) { s += a * vnp(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s / 0.96875;
}
float worleyp(vec2 p, float per, float seed){
  vec2 i = floor(p), f = fract(p); float d = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 o = h22(mod(i + g, per) + seed * 13.0);
    vec2 r = g + o - f; d = min(d, dot(r, r));
  }
  return sqrt(d);
}

// ---------------------------------------------------------------- smoke family height fields
float edgeMask(vec2 p, float lo){ return smoothstep(lo, 1.0, length(p)); }

// sum of soft round bumps (Wyvill kernel) -> cauliflower silhouette. A central body + ring of lobes.
float lobes(vec2 p, float sd, float tt, float spread, float rmin, float rvar, float core, float fine){
  float s = 0.0;
  vec2 d0 = p / (core * (0.88 + 0.24 * h12(vec2(sd, 3.3))));
  float k0 = max(0.0, 1.0 - dot(d0, d0));
  s += k0 * k0 * 1.15;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 h = h22(vec2(fi * 7.13 + sd * 13.37, fi * 1.91 + sd * 5.11));
    float ang = (fi + h.x * 0.8) * 0.7854 + tt * 0.6 * (h.y - 0.5);
    float rad = spread * (0.5 + 0.5 * h.y) * (0.85 + 0.3 * h12(vec2(sd, 7.7)));
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float r = rmin + rvar * h.x;
    vec2 d = (p - c) / r;
    float k = max(0.0, 1.0 - dot(d, d));
    s += k * k;
  }
  // small satellite bumps along the rim -> cauliflower edge
  for (int j = 0; j < 10; j++) {
    float fj = float(j);
    vec2 h = h22(vec2(fj * 3.71 + sd * 9.13, fj * 2.17 + sd * 2.9 + 40.0));
    float ang = h.x * 6.2832;
    vec2 c = vec2(cos(ang), sin(ang)) * spread * (0.75 + 0.5 * h.y);
    float r = rmin * 0.7 + rvar * 0.6 * h.y;
    vec2 d = (p - c) / r;
    float k = max(0.0, 1.0 - dot(d, d));
    s += k * k * 0.4;
  }
  // fine cauliflower: many small bumps scattered inside / along the silhouette
  if (fine > 0.0) {
    for (int m = 0; m < 22; m++) {
      float fm = float(m);
      vec2 h = h22(vec2(fm * 5.31 + sd * 7.77, fm * 1.37 + sd * 3.21 + 90.0));
      float ang = h.x * 6.2832;
      float rad = spread * (0.35 + 0.95 * sqrt(h.y));
      vec2 c = vec2(cos(ang), sin(ang)) * rad;
      float r = 0.07 + 0.09 * h12(vec2(fm, sd));
      vec2 d = (p - c) / r;
      float k = max(0.0, 1.0 - dot(d, d));
      // only where the main body already exists (so they decorate, not extend it)
      s += k * k * fine * smoothstep(0.1, 0.5, s);
    }
  }
  return s;
}

float hSmoke(vec2 p, float tt, float sd){
  vec3 o = vec3(sd * 37.1, sd * 11.7, tt * 0.8 + sd);
  vec2 q = p;
  q += (vec2(vn3(vec3(q * 1.7, 0.0) + o), vn3(vec3(q * 1.7 + 5.2, 0.0) + o + 3.3)) - 0.5) * 0.12;
  float s = lobes(q, sd, tt, 0.47, 0.26, 0.17, 0.62, 0.5);
  float bill = 1.0 - worley(q * 3.0 + o.xy, tt * 0.5);
  float f = fbm3(vec3(q * 3.8, 0.0) + o);
  float bill2 = 1.0 - worley(q * 7.2 + o.yx, tt * 0.7);
  float h = (s - 0.34) * 0.9 + 0.09 * (bill - 0.40) * smoothstep(0.0, 0.5, s) + 0.04 * (bill2 - 0.40) * smoothstep(0.05, 0.5, s) + 0.16 * (f - 0.5) * smoothstep(0.0, 0.4, s);
  return h - 3.2 * edgeMask(p, 0.80);
}

float hDust(vec2 p, float tt, float sd){
  vec3 o = vec3(sd * 17.3, sd * 5.9, tt * 0.5 + sd);
  vec2 q = p;
  q += (vec2(vn3(vec3(q * 1.3, 0.0) + o), vn3(vec3(q * 1.3 + 7.7, 0.0) + o)) - 0.5) * 0.42;
  q += (vec2(vn3(vec3(q * 2.7, 1.0) + o), vn3(vec3(q * 2.7 + 3.3, 1.0) + o)) - 0.5) * 0.16;
  float f = fbm3(vec3(q * 2.3, 0.0) + o);
  float f2 = fbm3(vec3(q * 5.5, 2.0) + o * 1.3);
  float r = length(p * vec2(0.9, 1.12));
  float h = (f - 0.40) * 1.25 + (1.0 - r * 1.15) * 0.85 + 0.20 * (f2 - 0.5) - 0.10;
  return h - 3.2 * edgeMask(p, 0.84);
}

float hDustSoft(vec2 p, float tt, float sd){
  vec3 o = vec3(sd * 17.3, sd * 5.9, tt * 0.5 + sd);
  vec2 q = p + (vec2(vn3(vec3(p * 1.3, 0.0) + o), vn3(vec3(p * 1.3 + 7.7, 0.0) + o)) - 0.5) * 0.42;
  float f = vn3(vec3(q * 1.5, 0.0) + o);
  float r = length(p * vec2(0.9, 1.12));
  return (f - 0.40) * 1.0 + (1.0 - r * 1.15) * 0.85 - 0.10 - 3.2 * edgeMask(p, 0.84);
}

float hWisp(vec2 p, float tt, float sd){
  vec3 o = vec3(sd * 23.7, sd * 9.1, tt * 0.6 + sd);
  vec2 q = p;
  q += (vec2(vn3(vec3(q * 1.3, 0.0) + o), vn3(vec3(q * 1.3 + 4.4, 0.0) + o)) - 0.5) * 0.24;
  float n1 = vn3(vec3(q.x * 1.5, q.y * 3.4, 0.0) + o);
  float n2 = vn3(vec3(q.x * 3.2 + 4.0, q.y * 6.5, 1.0) + o);
  float ridge = 1.0 - abs(2.0 * (n1 * 0.65 + n2 * 0.35) - 1.0);
  float s = lobes(q * vec2(1.0, 0.8), sd + 9.0, tt, 0.5, 0.30, 0.2, 0.6, 0.0);
  return (s - 0.38) * 0.7 + 0.42 * (ridge - 0.55) - 3.2 * edgeMask(p, 0.82);
}

float hGrit(vec2 p, float tt, float sd){
  vec3 o = vec3(sd * 29.1, sd * 3.3, tt + sd);
  vec2 q = p;
  q += (vec2(vn3(vec3(q * 2.0, 0.0) + o), vn3(vec3(q * 2.0 + 2.2, 0.0) + o)) - 0.5) * 0.14;
  float s = lobes(q, sd + 2.0, tt, 0.52, 0.20, 0.16, 0.5, 0.4);
  float bill = 1.0 - worley(q * 4.0 + o.xy, 0.0);
  float f = fbm3(vec3(q * 8.0, 0.0) + o);
  float spk = vn3(vec3(q * 24.0, 3.0) + o);
  float h = (s - 0.30) * 0.9 + 0.30 * (bill - 0.4) * smoothstep(0.0, 0.4, s) + 0.26 * (f - 0.5) + 0.18 * (spk - 0.5);
  return h - 3.2 * edgeMask(p, 0.82);
}

float hazeOf(vec2 p, float sd, float k){
  float g = exp(-dot(p, p) * 3.4);
  float n = vn3(vec3(p * 2.3 + sd * 5.0, sd));
  return clamp(g * (0.35 + 0.9 * n) * k * 1.4 - 0.04, 0.0, 1.0) * smoothstep(1.0, 0.7, length(p));
}

// smooth lobes-only height used for lighting normals (keeps puffs soft, no creases)
float hSoft(vec2 p, float tt, float sd, float spread, float rmin, float rvar, float core){
  vec3 o = vec3(sd * 37.1, sd * 11.7, tt * 0.8 + sd);
  vec2 q = p + (vec2(vn3(vec3(p * 1.5, 0.0) + o), vn3(vec3(p * 1.5 + 5.2, 0.0) + o + 3.3)) - 0.5) * 0.10;
  float s = lobes(q, sd, tt, spread, rmin, rvar, core, 0.0);
  float f = vn3(vec3(q * 2.6, 0.0) + o);
  return (s - 0.34) * 0.9 + 0.07 * (f - 0.5) * smoothstep(0.0, 0.4, s) - 3.2 * edgeMask(p, 0.80);
}

vec4 packSmoke2(vec2 p2, float h, float hs, float hsx, float hsy, float e, float nStr, float aLo, float aHi, float thick, float aMax, float halo){
  float a = max(smoothstep(aLo, aHi, h), halo) * aMax;
  vec2 g = vec2(hsx - hs, hsy - hs) / e;
  vec2 n = -g * nStr;
  n *= smoothstep(-0.05, 0.2, hs);
  float nl = length(n); if (nl > 0.92) n *= 0.92 / nl;
  float env = exp(-dot(p2, p2) * 2.4);
  float th = clamp(0.62 * env + 0.38 * smoothstep(0.0, thick, hs), 0.0, 1.0);
  return vec4(a, n * 0.5 + 0.5, th * (1.0 - 0.35 * step(a, halo * aMax + 0.001)));
}

vec4 packSmoke(float h, float hx, float hy, float e, float nStr, float aLo, float aHi, float thick, float aMax, float halo){
  float a = max(smoothstep(aLo, aHi, h), halo) * aMax;
  vec2 g = vec2(hx - h, hy - h) / e;
  vec2 n = -g * nStr;
  n *= smoothstep(-0.05, 0.2, h);
  float nl = length(n); if (nl > 0.92) n *= 0.92 / nl;
  return vec4(a, n * 0.5 + 0.5, smoothstep(0.0, thick, h) * (1.0 - 0.35 * step(a, halo * aMax + 0.001)));
}

// ---------------------------------------------------------------- fire
vec4 fireFrame(vec2 p, float tau, float sd){
  float R = mix(0.52, 0.96, 1.0 - pow(1.0 - tau, 2.2));
  float z = tau * 2.4 + sd;
  vec2 q = p;
  q += (vec2(vn3(vec3(q * 1.9, z)), vn3(vec3(q * 1.9 + 9.1, z))) - 0.5) * mix(0.12, 0.30, tau);
  q += (vec2(vn3(vec3(q * 4.1, z * 1.4)), vn3(vec3(q * 4.1 + 3.3, z * 1.4))) - 0.5) * 0.10;
  float s = lobes(q / R * 0.64, sd, tau * 2.0, 0.52, 0.24, 0.20, 0.60, 0.5);
  float bill = 1.0 - worley(q * 3.4 / max(0.5, R), tau * 0.6);
  float n = fbm3(vec3(q * 4.6, z * 0.8));
  float n2 = fbm3(vec3(q * 9.0 + 4.0, z * 1.3));
  float bill2 = 1.0 - worley(q * 8.0 / max(0.5, R), tau * 0.9);
  float h = (s - 0.34) * 0.95 + 0.26 * (bill - 0.40) * smoothstep(0.0, 0.4, s) + 0.14 * (bill2 - 0.40) * smoothstep(0.0, 0.4, s) + 0.40 * (n - 0.5) * (0.6 + tau) * smoothstep(-0.1, 0.4, s);
  h -= 3.0 * edgeMask(p, 0.86);
  float cut = pow(tau, 2.2) * 0.50;
  float dens = smoothstep(cut, cut + 0.34, h) * clamp(0.78 + 0.9 * (n2 - 0.45), 0.35, 1.0);
  float heat = smoothstep(-0.05, 0.85, h) * (1.12 - 0.88 * tau) + (n - 0.5) * 0.65 + (n2 - 0.5) * 0.3;
  float soot = (1.0 - smoothstep(0.0, 0.5, h)) * smoothstep(0.05, 0.65, tau) + smoothstep(0.5, 1.0, tau) * 0.55 * (1.0 - clamp(heat, 0.0, 1.0)) + 0.35 * smoothstep(0.55, 0.9, n2) * smoothstep(0.1, 0.5, tau);
  return vec4(dens, clamp(heat, 0.0, 1.0), clamp(soot, 0.0, 1.0), n);
}

vec4 flameFrame(vec2 p, float tau, float sd){
  float yy = (p.y + 0.86) / 1.74;                       // 0 base .. 1 tip
  float n = vn3(vec3(p.x * 1.6, yy * 2.4 - tau * 1.8, sd));
  float n2 = vn3(vec3(p.x * 3.8 + 4.0, yy * 5.0 - tau * 3.4, sd + 2.0));
  float sway = 0.22 * yy * sin(yy * 4.2 + tau * 5.0 + sd * 6.0) + 0.42 * yy * (n - 0.5);
  float x = p.x + sway;
  float wid = 0.98 * pow(clamp(yy, 0.0, 1.0), 0.5) * pow(max(0.0, 1.0 - yy), 0.95) * (0.85 + 0.3 * n2);
  float core = 1.0 - abs(x) / max(wid, 0.001);
  float dens = smoothstep(0.0, 0.40, core + 0.38 * (n2 - 0.5)) * (1.0 - smoothstep(0.78, 1.0, yy + 0.2 * (n - 0.5))) * smoothstep(0.0, 0.08, yy);
  float heat = pow(clamp(core, 0.0, 1.0), 0.7) * (1.0 - yy * 0.7) * (0.8 + 0.4 * n2);
  float soot = smoothstep(0.5, 1.0, yy) * 0.65 + (1.0 - smoothstep(0.0, 0.4, core)) * 0.2;
  return vec4(dens, clamp(heat, 0.0, 1.0), clamp(soot, 0.0, 1.0), n2);
}

// ---------------------------------------------------------------- decals (cell coords c in [-1,1])
vec4 decalCell(vec2 c, float kind){
  float r = length(c);
  float ang = atan(c.y, c.x);
  vec2 o = vec2(kind * 11.3, kind * 5.7);
  float n = fbm3(vec3(c * 3.0 + o, 0.0));
  float n2 = fbm3(vec3(c * 7.0 + o, 2.0));
  float rays = vn3(vec3(cos(ang) * 4.0 + 7.0, sin(ang) * 4.0 + 3.0, kind)) * 0.6 + vn3(vec3(cos(ang) * 9.0 + 2.0, sin(ang) * 9.0 + 8.0, kind + 3.0)) * 0.4;
  float R = 0.0, G = 0.0;
  if (kind < 0.5) {              // scorch: soot bloom with streaky rays
    float rr = r * (0.80 + 0.55 * (rays - 0.5)) + 0.20 * (n - 0.5);
    float core = 1.0 - smoothstep(0.05, 0.55, rr);
    float halo = 1.0 - smoothstep(0.12, 0.95, rr);
    R = clamp(core * 0.8 + halo * 0.5 * (0.55 + 0.9 * n2), 0.0, 0.92);
  } else if (kind < 1.5) {       // crater: soft pit, ejecta rays, pale rim crescent
    float rr = r + 0.10 * (n - 0.5) + 0.06 * (n2 - 0.5);
    float pit = 1.0 - smoothstep(0.10, 0.42, rr);
    float rim = smoothstep(0.30, 0.42, rr) * (1.0 - smoothstep(0.42, 0.62, rr));
    float rayMask = smoothstep(0.52, 0.80, rays + 0.1 * (n2 - 0.5)) * smoothstep(0.30, 0.45, r) * (1.0 - smoothstep(0.55, 0.98, r));
    R = clamp(pit * 0.5 + (1.0 - smoothstep(0.25, 0.85, rr)) * 0.30 * (0.6 + 0.8 * n2), 0.0, 0.62);
    G = clamp(rim * 0.32 * (0.5 + n2) + rayMask * 0.32, 0.0, 0.5);
  } else if (kind < 2.5) {       // burn blot: irregular soot stain
    float rr = r + 0.38 * (n - 0.5) + 0.14 * (n2 - 0.5);
    R = (1.0 - smoothstep(0.15, 0.85, rr)) * (0.55 + 0.45 * n2) * 0.9;
  } else {                       // debris spatter: scattered small dark flecks + faint dust
    float flecks = smoothstep(0.64, 0.74, vn3(vec3(c * 11.0 + o, 5.0))) * (0.6 + 0.4 * vn3(vec3(c * 30.0, 1.0)));
    float big = smoothstep(0.70, 0.78, vn3(vec3(c * 5.0 + o, 9.0)));
    R = clamp((flecks * 0.7 + big * 0.55) * (1.0 - smoothstep(0.35, 0.95, r + 0.2 * (n - 0.5))) + (1.0 - smoothstep(0.1, 0.8, r)) * 0.12 * n2, 0.0, 0.8);
  }
  R *= 1.0 - smoothstep(0.86, 1.0, r);
  G *= 1.0 - smoothstep(0.86, 1.0, r);
  return vec4(R, G, 0.0, 1.0);
}

void main(){
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  float e = 2.0 / uRes * 4.0;
  float sd = uSeed;
  float tt = uFrame / max(1.0, uCount - 1.0);
  vec4 o = vec4(0.0);
  if (uMode < 0.5) {
    float h = hSmoke(p, tt, sd);
    float es = e * 3.0;
    float hs = hSoft(p, tt, sd, 0.47, 0.26, 0.17, 0.62), hsx = hSoft(p + vec2(es, 0.0), tt, sd, 0.47, 0.26, 0.17, 0.62), hsy = hSoft(p + vec2(0.0, es), tt, sd, 0.47, 0.26, 0.17, 0.62);
    o = packSmoke2(p, h, hs, hsx, hsy, es, 0.20, -0.16, 0.70, 0.95, 1.0, hazeOf(p, sd, 0.55));
  } else if (uMode < 1.5) {
    o = fireFrame(p, tt, sd);
  } else if (uMode < 2.5) {
    float h = hDust(p, tt, sd);
    float es = e * 3.0;
    float hs = hDustSoft(p, tt, sd), hsx = hDustSoft(p + vec2(es, 0.0), tt, sd), hsy = hDustSoft(p + vec2(0.0, es), tt, sd);
    o = packSmoke2(p, h, hs, hsx, hsy, es, 0.14, -0.10, 0.95, 1.2, 0.75, hazeOf(p, sd, 0.5));
  } else if (uMode < 3.5) {
    float h = hWisp(p, tt, sd), hx = hWisp(p + vec2(e, 0.0), tt, sd), hy = hWisp(p + vec2(0.0, e), tt, sd);
    o = packSmoke(h, hx, hy, e, 0.12, -0.08, 0.8, 1.0, 0.7, hazeOf(p, sd, 0.3));
  } else if (uMode < 4.5) {
    o = flameFrame(p, tt, sd);
  } else if (uMode < 5.5) {
    float h = hGrit(p, tt, sd), hx = hGrit(p + vec2(e, 0.0), tt, sd), hy = hGrit(p + vec2(0.0, e), tt, sd);
    o = packSmoke(h, hx, hy, e, 0.42, -0.02, 0.38, 0.7, 0.95, 0.0);
  } else if (uMode < 6.5) {
    vec2 q = uv * 8.0;
    float f1 = fbmp(q, 8.0, 0.0);
    float w = 1.0 - worleyp(uv * 6.0, 6.0, 1.0);
    float f2 = fbmp(uv * 3.0, 3.0, 2.0);
    float g = vnp(uv * 64.0, 64.0);
    o = vec4(f1, w, f2, g);
  } else {
    // decal atlas: 2x2 cells
    vec2 cell = floor(uv * 2.0);
    vec2 c = fract(uv * 2.0) * 2.0 - 1.0;
    float kind = cell.x + cell.y * 2.0;
    o = decalCell(c, kind);
  }
  gl_FragColor = o;
}
`;

function makeArray(data: Uint8Array<ArrayBuffer>, size: number, layers: number): THREE.DataArrayTexture {
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.unpackAlignment = 4;
  t.needsUpdate = true;
  return t;
}

/** Renders all procedural sheets once. ~100 ms on a real GPU. */
export function bakeVfxTextures(): VfxTextures {
  const t0 = performance.now();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  gl.setPixelRatio(1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    uniforms: { uMode: { value: 0 }, uFrame: { value: 0 }, uCount: { value: 8 }, uSeed: { value: 0 }, uRes: { value: 256 } },
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const targets = new Map<number, THREE.WebGLRenderTarget>();
  const rtFor = (s: number) => {
    let r = targets.get(s);
    if (!r) {
      r = new THREE.WebGLRenderTarget(s, s, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
      targets.set(s, r);
    }
    return r;
  };
  const u = mat.uniforms;
  const render = (size: number, mode: number, frame: number, count: number, seed: number, out: Uint8Array<ArrayBuffer>, offset: number): void => {
    const rt = rtFor(size);
    u.uMode.value = mode; u.uFrame.value = frame; u.uCount.value = count; u.uSeed.value = seed; u.uRes.value = size;
    gl.setRenderTarget(rt);
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, size, size, out.subarray(offset, offset + size * size * 4));
  };

  const bigData = new Uint8Array(new ArrayBuffer(BIG * BIG * 4 * 32));
  const smallData = new Uint8Array(new ArrayBuffer(SMALL * SMALL * 4 * 32));
  const noiseData = new Uint8Array(new ArrayBuffer(NOISE * NOISE * 4));
  const decalData = new Uint8Array(new ArrayBuffer(DECAL * DECAL * 4));
  const bl = BIG * BIG * 4, sl = SMALL * SMALL * 4;
  // big: smoke A (2 puffs x 8 frames), fire
  for (let v = 0; v < 4; v++) for (let f = 0; f < 4; f++) render(BIG, 0, f, 4, 1.3 + v * 2.77, bigData, (v * 4 + f) * bl);
  for (let f = 0; f < 16; f++) render(BIG, 1, f, 16, 2.0, bigData, (16 + f) * bl);
  // small: dust, wisp, flame, grit (8 variants each)
  for (let i = 0; i < 8; i++) render(SMALL, 2, 0, 8, 0.7 + i * 2.31, smallData, i * sl);
  for (let i = 0; i < 8; i++) render(SMALL, 3, 0, 8, 1.1 + i * 1.77, smallData, (8 + i) * sl);
  for (let i = 0; i < 8; i++) render(SMALL, 4, i, 8, 0.9, smallData, (16 + i) * sl);
  for (let i = 0; i < 8; i++) render(SMALL, 5, 0, 8, 3.3 + i * 2.9, smallData, (24 + i) * sl);
  render(NOISE, 6, 0, 1, 0, noiseData, 0);
  render(DECAL, 7, 0, 1, 0, decalData, 0);

  gl.setRenderTarget(null);
  targets.forEach((r) => r.dispose());
  mat.dispose(); quad.geometry.dispose();
  gl.dispose();
  gl.forceContextLoss();

  const noise = new THREE.DataTexture(noiseData, NOISE, NOISE, THREE.RGBAFormat);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.minFilter = THREE.LinearMipmapLinearFilter; noise.magFilter = THREE.LinearFilter;
  noise.generateMipmaps = true; noise.anisotropy = 2; noise.needsUpdate = true;
  const decal = new THREE.DataTexture(decalData, DECAL, DECAL, THREE.RGBAFormat);
  decal.wrapS = decal.wrapT = THREE.ClampToEdgeWrapping;
  decal.minFilter = THREE.LinearMipmapLinearFilter; decal.magFilter = THREE.LinearFilter;
  decal.generateMipmaps = true; decal.anisotropy = 4; decal.needsUpdate = true;
  return {
    big: makeArray(bigData, BIG, 32), small: makeArray(smallData, SMALL, 32), noise, decal,
    raw: { big: bigData, small: smallData, noise: noiseData, decal: decalData }, ms: performance.now() - t0,
  };
}

export const TEX_SIZES = { BIG, SMALL, NOISE, DECAL };
