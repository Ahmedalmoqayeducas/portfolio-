/** GLSL noise toolkit (GLSL ES 3.00). All functions are periodic so generated textures tile seamlessly. */
export const GLSL_NOISE = /* glsl */ `
uvec2 msPcg2d(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
vec2 hash22(vec2 p){ return vec2(msPcg2d(uvec2(ivec2(p) + ivec2(32768)))) * (1.0 / 4294967296.0); }
float hash12(vec2 p){ return hash22(p).x; }
vec2 gradv(vec2 cell){ float a = hash22(cell).x * 6.2831853; return vec2(cos(a), sin(a)); }
/** gradient noise in [-1,1], periodic with integer period per (lattice units) */
float gnoise(vec2 p, vec2 per){
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  float a = dot(gradv(i0), f);
  float b = dot(gradv(vec2(i1.x, i0.y)), f - vec2(1.0, 0.0));
  float c = dot(gradv(vec2(i0.x, i1.y)), f - vec2(0.0, 1.0));
  float d = dot(gradv(i1), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.414;
}
float fbm(vec2 p, vec2 per, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * gnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return s * 1.6;
}
/** periodic voronoi: x = F1, y = F2, z = cell hash */
vec3 voro(vec2 p, vec2 per){
  vec2 ip = floor(p), fp = p - ip;
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 cell = mod(ip + g, per);
    vec2 d = g + hash22(cell) - fp;
    float dd = dot(d, d);
    if (dd < f1) { f2 = f1; f1 = dd; id = hash12(cell + vec2(17.0, 5.0)); }
    else if (dd < f2) f2 = dd;
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
`;
