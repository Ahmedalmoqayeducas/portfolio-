import * as THREE from 'three';
import type { BuiltMap, Biome } from '../maps/maps';
import { Noise2D, mulberry32 } from '../procgen/noise';
import { atmo } from './atmo';
import { patchFog } from './fog';
import type { Terrain } from './terrain';
import { makeBroadleaf, makeCactus, makeConifer, makeGrass, makePalm, makeRock, makeShrub, RockPalette } from './propGeo';

/**
 * Vegetation, boulders and debris. Everything is instanced and chunked into spatial cells so frustum culling,
 * distance culling and two levels of detail work per cell; only the large rocks and nearby trees cast shadows.
 * Wind sway and distance fade run on the GPU.
 */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ROCK_PAL: Record<Biome, RockPalette> = {
  desert: { a: 0x8a4a30, b: 0xb36d42, c: 0x4a2a1c, dust: 0xc9a074 },
  urban: { a: 0x8b867a, b: 0xa6a094, c: 0x4a463f, dust: 0xbdb5a0 },
  oasis: { a: 0xa56c46, b: 0xc98d5c, c: 0x5a3a24, dust: 0xe0c090 },
  highland: { a: 0x65676c, b: 0x85878a, c: 0x2c2e33, dust: 0xe8eef5 },
  mixed: { a: 0x7b6f60, b: 0x978a78, c: 0x3b342c, dust: 0xbdae96 },
};

type Quality = 'low' | 'medium' | 'high' | 'ultra';
const QUALITY: Record<Quality, { grass: number; shrub: number; tree: number; rock: number; far: number }> = {
  low: { grass: 0, shrub: 0.25, tree: 0.55, rock: 0.5, far: 0.55 },
  medium: { grass: 0.3, shrub: 0.6, tree: 0.8, rock: 0.8, far: 0.8 },
  high: { grass: 0.65, shrub: 0.85, tree: 1, rock: 1, far: 1 },
  ultra: { grass: 1, shrub: 1, tree: 1, rock: 1, far: 1.15 },
};

interface Inst { x: number; y: number; z: number; yaw: number; s: number; sy: number; r: number; g: number; b: number; tx: number; tz: number }

interface Kind {
  name: string;
  geos: THREE.BufferGeometry[];
  mat: THREE.Material;
  cell: number;
  /** [min, max) horizontal distance for each LOD */
  ranges: [number, number][];
  shadow: boolean[];
  ao: boolean[];
  densityKey: 'grass' | 'shrub' | 'tree' | 'rock';
  items: Map<number, { cx: number; cz: number; list: Inst[]; meshes: (THREE.InstancedMesh | null)[] }>;
  group: THREE.Group;
  cellsX: number;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function buildCellMesh(kind: Kind, lod: number, cell: { cx: number; cz: number; list: Inst[] }, density: number): THREE.InstancedMesh {
  const n = cell.list.length;
  const mesh = new THREE.InstancedMesh(kind.geos[lod], kind.mat, n);
  for (let i = 0; i < n; i++) {
    const it = cell.list[i];
    _e.set(it.tx, it.yaw, it.tz, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(it.x, it.y, it.z);
    _s.set(it.s, it.sy, it.s);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    _c.setRGB(it.r, it.g, it.b);
    mesh.setColorAt(i, _c);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.count = Math.max(0, Math.floor(n * density));
  mesh.castShadow = kind.shadow[lod];
  mesh.receiveShadow = true;
  mesh.userData.noAO = !kind.ao[lod];
  mesh.computeBoundingSphere();
  mesh.name = `${kind.name}-lod${lod}`;
  return mesh;
}

/** swaying + distance fading vegetation material */
function vegMaterial(opts: { sway: number; fade?: [number, number]; double?: boolean; rough?: number; key: string; uniforms: { focus: THREE.IUniform } }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.rough ?? 0.9, metalness: 0, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  const fade = opts.fade ?? [1e5, 1e5 + 1];
  m.onBeforeCompile = (sh) => {
    patchFog(sh);
    sh.uniforms.uTime = atmo.time;
    sh.uniforms.uWind = atmo.wind;
    sh.uniforms.uSway = { value: opts.sway };
    sh.uniforms.uFade = { value: new THREE.Vector2(fade[0], fade[1]) };
    sh.uniforms.uFocus = opts.uniforms.focus;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway; uniform float uTime; uniform vec3 uWind; uniform float uSway; uniform vec2 uFade; uniform vec3 uFocus;')
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3( position );
        #ifdef USE_INSTANCING
          mat3 msR = mat3(instanceMatrix);
          vec3 msO = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        #else
          mat3 msR = mat3(1.0);
          vec3 msO = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif
        float msPh = dot(msO.xz, vec2(0.13, 0.09));
        float msG = sin(uTime * 1.7 + msPh) * 0.55 + sin(uTime * 3.3 + msPh * 2.1) * 0.25 + sin(uTime * 0.5 + msO.x * 0.021) * 0.9;
        vec3 msWd = vec3(uWind.x, 0.0, uWind.z) * (0.55 + 0.45 * msG) * uSway * aSway * aSway;
        transformed += (transpose(msR) * msWd) / max(dot(msR[0], msR[0]), 1e-4);
        float msFd = 1.0 - smoothstep(uFade.x, uFade.y, length(msO.xz - uFocus.xz));
        transformed *= msFd;`);
  };
  m.customProgramCacheKey = () => 'veg-' + opts.key;
  return m;
}

/** rock material with triplanar detail taken from the terrain's cliff layer */
function rockMaterial(terrain: Terrain | undefined): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    patchFog(sh);
    if (!terrain) return;
    sh.uniforms.uAlb = { value: terrain.layers.albedo };
    sh.uniforms.uNrmA = { value: terrain.layers.normal };
    sh.uniforms.uRTile = { value: terrain.layers.tile[2] * 0.42 };
    sh.uniforms.uRLod = { value: Math.log2(terrain.layers.size) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 msP = vec4(transformed, 1.0); vec3 msN = objectNormal;
          #ifdef USE_INSTANCING
            msP = instanceMatrix * msP; msN = mat3(instanceMatrix) * msN;
          #endif
          vRW = (modelMatrix * msP).xyz; vRN = normalize(mat3(modelMatrix) * msN);
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN; uniform highp sampler2DArray uAlb; uniform highp sampler2DArray uNrmA; uniform float uRTile; uniform float uRLod;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 msBW = pow(abs(normalize(vRN)), vec3(4.0)); msBW /= (msBW.x + msBW.y + msBW.z);
        float msK = 1.0 / uRTile;
        vec3 msDet = texture(uAlb, vec3(vRW.zy * msK, 2.0)).rgb * msBW.x + texture(uAlb, vec3(vRW.xz * msK, 2.0)).rgb * msBW.y + texture(uAlb, vec3(vRW.xy * msK, 2.0)).rgb * msBW.z;
        vec3 msAvg = textureLod(uAlb, vec3(0.5, 0.5, 2.0), uRLod).rgb;
        diffuseColor.rgb *= mix(vec3(1.0), clamp(msDet / max(msAvg, vec3(0.02)), vec3(0.45), vec3(1.8)), 0.85);`)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 msWn = normalize(vRN);
          vec2 tX = texture(uNrmA, vec3(vRW.zy * msK, 2.0)).xy * 2.0 - 1.0;
          vec2 tY = texture(uNrmA, vec3(vRW.xz * msK, 2.0)).xy * 2.0 - 1.0;
          vec2 tZ = texture(uNrmA, vec3(vRW.xy * msK, 2.0)).xy * 2.0 - 1.0;
          vec3 nX = vec3(msWn.x * sqrt(max(1.0 - dot(tX, tX), 0.05)), tX.y + msWn.y, tX.x + msWn.z);
          vec3 nY = vec3(tY.x + msWn.x, msWn.y * sqrt(max(1.0 - dot(tY, tY), 0.05)), tY.y + msWn.z);
          vec3 nZ = vec3(tZ.x + msWn.x, tZ.y + msWn.y, msWn.z * sqrt(max(1.0 - dot(tZ, tZ), 0.05)));
          vec3 msFinal = normalize(nX * msBW.x + nY * msBW.y + nZ * msBW.z);
          normal = normalize((viewMatrix * vec4(msFinal, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'rock';
  return m;
}

export interface PropMaterials { all: THREE.Material[] }

/** Boulders + vegetation scattered by the map definition (purely decorative). */
export function makeProps(built: BuiltMap, terrain?: Terrain): { group: THREE.Group; materials: THREE.Material[] } {
  const { def, hf } = built;
  const group = new THREE.Group();
  group.name = 'props';
  const mats: THREE.Material[] = [];
  const rnd = mulberry32(def.seed + 77);
  const n = new Noise2D(def.seed + 5);
  const wl = def.waterLevel ?? -1e9;
  const area = (hf.size / 1024) ** 2;
  const biome = def.biome;
  const focusU: THREE.IUniform = { value: new THREE.Vector3() };
  const shared = { focus: focusU };
  const N = hf.res;

  const roadAt = (x: number, z: number): number => {
    const gx = Math.min(N - 1, Math.max(0, Math.round((x + hf.size / 2) / hf.step)));
    const gz = Math.min(N - 1, Math.max(0, Math.round((z + hf.size / 2) / hf.step)));
    return built.roadMask[gz * N + gx] / 255;
  };
  const blocked = (x: number, z: number): boolean => {
    for (const s of def.spawns) if (Math.hypot(x - s[0], z - s[1]) < 95) return true;
    for (const d of def.depots) if (Math.hypot(x - d[0], z - d[1]) < 22) return true;
    for (const d of def.derricks) if (Math.hypot(x - d[0], z - d[1]) < 18) return true;
    for (const c of def.civ) if (Math.abs(x - c.x) < 22 && Math.abs(z - c.z) < 22) return true;
    return roadAt(x, z) > 0.04;
  };
  const ctl = (x: number, z: number, ch: number) => (terrain ? terrain.ctl(x, z, ch) : 0);
  const inMap = (v: number) => (rnd() - 0.5) * hf.size * v;

  const kinds: Kind[] = [];
  const mk = (name: string, geos: THREE.BufferGeometry[], mat: THREE.Material, cell: number, ranges: [number, number][], shadow: boolean[], ao: boolean[], densityKey: Kind['densityKey']): Kind => {
    const g = new THREE.Group();
    g.name = name;
    group.add(g);
    const k: Kind = { name, geos, mat, cell, ranges, shadow, ao, densityKey, items: new Map(), group: g, cellsX: Math.ceil(hf.size / cell) + 2 };
    kinds.push(k);
    if (!mats.includes(mat)) mats.push(mat);
    return k;
  };
  const add = (k: Kind, it: Inst) => {
    const cx = Math.floor((it.x + hf.size / 2) / k.cell), cz = Math.floor((it.z + hf.size / 2) / k.cell);
    const key = cz * k.cellsX + cx;
    let c = k.items.get(key);
    if (!c) { c = { cx: (cx + 0.5) * k.cell - hf.size / 2, cz: (cz + 0.5) * k.cell - hf.size / 2, list: [], meshes: [null, null] }; k.items.set(key, c); }
    c.list.push(it);
  };
  const inst = (x: number, z: number, s: number, o: Partial<Inst> = {}): Inst => ({
    x, y: hf.heightAt(x, z), z, yaw: rnd() * Math.PI * 2, s, sy: s, r: 1, g: 1, b: 1, tx: 0, tz: 0, ...o,
  });
  const tint = (v: number) => 1 - v + rnd() * 2 * v;

  // ------------------------------------------------------------------------------ rocks
  {
    const pal = ROCK_PAL[biome];
    const variants: THREE.BufferGeometry[][] = [];
    const kindsR: ('boulder' | 'slab' | 'shard')[] = ['boulder', 'boulder', 'slab', 'shard'];
    for (let v = 0; v < 4; v++) variants.push([makeRock(100 + v * 7 + def.seed, 0, pal, kindsR[v]), makeRock(100 + v * 7 + def.seed, 1, pal, kindsR[v])]);
    const mat = rockMaterial(terrain);
    const big: Kind[] = [], small: Kind[] = [];
    for (let v = 0; v < 4; v++) {
      big.push(mk(`rock-big-${v}`, variants[v], mat, 192, [[0, 260], [260, 900]], [true, false], [true, false], 'rock'));
      small.push(mk(`rock-small-${v}`, variants[v], mat, 128, [[0, 190], [190, 520]], [false, false], [false, false], 'rock'));
    }
    const clusters = Math.round(def.props.rocks * 1.1);
    let placed = 0, tries = 0;
    while (placed < clusters && tries++ < clusters * 30) {
      const x = inMap(0.96), z = inMap(0.96);
      if (blocked(x, z)) continue;
      const y = hf.heightAt(x, z);
      if (y < wl + 0.4) continue;
      const slope = hf.slopeAt(x, z, 3);
      // cluster centres prefer broken ground (cliff feet, ridges)
      if (rnd() > 0.2 + slope * 3.5) continue;
      if (ctl(x, z, 3) > 0.1 || ctl(x, z, 2) > 0.25) continue;
      placed++;
      const v = Math.floor(rnd() * 4);
      const sBig = 0.9 + Math.pow(rnd(), 2.6) * 4.8;
      const tw = (a: number) => (rnd() - 0.5) * a;
      const col = tint(0.22);
      const nx = n.noise(x * 0.01, z * 0.01);
      const rr = col * (0.92 + 0.14 * nx);
      const k = sBig > 1.6 ? big[v] : small[v];
      add(k, inst(x, z, sBig, { sy: sBig * (0.7 + rnd() * 0.5), y: y - sBig * 0.28, tx: tw(0.35), tz: tw(0.35), r: rr, g: rr, b: rr }));
      const nm = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < nm; i++) {
        const a = rnd() * Math.PI * 2, d = sBig * (0.9 + rnd() * 1.6);
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (blocked(px, pz)) continue;
        const s2 = sBig * (0.18 + rnd() * 0.35);
        const vv = Math.floor(rnd() * 4);
        const c2 = tint(0.22);
        add(small[vv], inst(px, pz, s2, { sy: s2 * (0.7 + rnd() * 0.5), y: hf.heightAt(px, pz) - s2 * 0.3, tx: tw(0.5), tz: tw(0.5), r: c2, g: c2, b: c2 }));
      }
      const npb = Math.floor(rnd() * 7);
      for (let i = 0; i < npb; i++) {
        const a = rnd() * Math.PI * 2, d = sBig * (1.2 + rnd() * 3.2);
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (blocked(px, pz)) continue;
        const s3 = 0.12 + rnd() * 0.3;
        const c3 = tint(0.25);
        add(small[Math.floor(rnd() * 4)], inst(px, pz, s3, { sy: s3 * 0.8, y: hf.heightAt(px, pz) - s3 * 0.25, tx: tw(0.6), tz: tw(0.6), r: c3, g: c3, b: c3 }));
      }
    }
  }

  // ------------------------------------------------------------------------------ trees
  const tkind = def.props.treeKind;
  if (tkind !== 'none' && def.props.trees > 0) {
    const tm = vegMaterial({ sway: 0.5, double: true, rough: 0.88, key: 'tree', uniforms: shared });
    const snow = biome === 'highland' ? 0.85 : 0;
    const mk2 = (name: string, a: THREE.BufferGeometry, b: THREE.BufferGeometry) => mk(name, [a, b], tm, 192, [[0, 280], [280, 1150]], [true, false], [true, false], 'tree');
    const vars: Kind[] = [];
    for (let v = 0; v < 3; v++) {
      const seed = 40 + v * 11 + def.seed;
      if (tkind === 'pine') vars.push(mk2(`pine-${v}`, makeConifer(seed, 0, snow), makeConifer(seed, 1, snow)));
      else if (tkind === 'palm') vars.push(mk2(`palm-${v}`, makePalm(seed, 0), makePalm(seed, 1)));
      else vars.push(mk2(`tree-${v}`, makeBroadleaf(seed, 0, biome === 'mixed' ? (v === 2 ? 1 : 0) : 0), makeBroadleaf(seed, 1, biome === 'mixed' ? (v === 2 ? 1 : 0) : 0)));
    }
    const count = Math.round(def.props.trees * (tkind === 'pine' ? 2.2 : tkind === 'palm' ? 1.8 : 2));
    let placed = 0, tries = 0;
    while (placed < count && tries++ < count * 40) {
      const x = inMap(0.94), z = inMap(0.94);
      if (blocked(x, z)) continue;
      const y = hf.heightAt(x, z);
      if (y < wl + (tkind === 'palm' ? 0.9 : 1.4)) continue;
      if (hf.slopeAt(x, z) > (tkind === 'pine' ? 0.5 : 0.35)) continue;
      const dens = def.props.treeAt ? def.props.treeAt(x, z, n) : 0.5;
      const grove = 0.3 + 0.7 * smooth(-0.25, 0.3, n.fbm(x * 0.022 + 4, z * 0.022 - 2, 3));
      if (rnd() > dens * grove) continue;
      if (ctl(x, z, 3) > 0.1) continue;
      placed++;
      const s = 0.75 + rnd() * 0.6;
      const c = tint(0.14);
      const tw = (rnd() - 0.5) * 0.08;
      add(vars[Math.floor(rnd() * vars.length)], inst(x, z, s, { sy: s * (0.9 + rnd() * 0.3), y: y - 0.15, r: c, g: c * (0.95 + rnd() * 0.1), b: c * 0.95, tx: tw, tz: tw }));
    }
  }

  // ------------------------------------------------------------------------------ scrub, cacti
  {
    const sm = vegMaterial({ sway: 0.12, double: true, rough: 0.92, key: 'shrub', uniforms: shared });
    const tones = biome === 'desert' || biome === 'oasis' ? [0.2, 0.5] : biome === 'highland' ? [0.35, 0.8] : [0.8, 0.95];
    const sk: Kind[] = [];
    for (let v = 0; v < 3; v++) {
      const tone = v === 0 ? tones[0] : v === 1 ? tones[1] : 0.55;
      sk.push(mk(`shrub-${v}`, [makeShrub(300 + v * 5 + def.seed, 0, tone), makeShrub(300 + v * 5 + def.seed, 1, tone)], sm, 128, [[0, 160], [160, 380]], [false, false], [false, false], 'shrub'));
    }
    const wantShrubs = Math.round((biome === 'desert' ? 1500 : biome === 'highland' ? 700 : biome === 'oasis' ? 900 : 1300) * area);
    let placed = 0, tries = 0;
    while (placed < wantShrubs && tries++ < wantShrubs * 30) {
      const x = inMap(0.95), z = inMap(0.95);
      if (blocked(x, z)) continue;
      const y = hf.heightAt(x, z);
      if (y < wl + 1.0) continue;
      const slope = hf.slopeAt(x, z, 3);
      if (slope > 0.5) continue;
      const veg = ctl(x, z, 0);
      const p = 0.12 + veg * 0.9;
      if (rnd() > p * (0.35 + 0.65 * smooth(-0.1, 0.3, n.fbm(x * 0.03, z * 0.03, 2)))) continue;
      if (ctl(x, z, 3) > 0.1 || ctl(x, z, 2) > 0.3) continue;
      placed++;
      const s = 0.7 + rnd() * 1.0;
      const c = tint(0.2);
      add(sk[Math.floor(rnd() * 3)], inst(x, z, s, { sy: s * (0.7 + rnd() * 0.5), y: y - 0.05, r: c, g: c, b: c * 0.95 }));
    }
    if (biome === 'desert' || biome === 'oasis') {
      const cm = vegMaterial({ sway: 0.02, double: false, rough: 0.85, key: 'cactus', uniforms: shared });
      const ck = [mk('cactus-0', [makeCactus(500 + def.seed, 0), makeCactus(500 + def.seed, 1)], cm, 192, [[0, 260], [260, 800]], [true, false], [true, false], 'tree'),
        mk('cactus-1', [makeCactus(509 + def.seed, 0), makeCactus(509 + def.seed, 1)], cm, 192, [[0, 260], [260, 800]], [true, false], [true, false], 'tree')];
      const want = Math.round((biome === 'desert' ? 260 : 120) * area);
      let pl = 0, tr = 0;
      while (pl < want && tr++ < want * 40) {
        const x = inMap(0.94), z = inMap(0.94);
        if (blocked(x, z)) continue;
        const y = hf.heightAt(x, z);
        if (y < wl + 1.5 || hf.slopeAt(x, z, 3) > 0.3) continue;
        if (biome === 'oasis' && Math.hypot(x, z) < 250) continue;
        if (ctl(x, z, 3) > 0.1 || ctl(x, z, 2) > 0.2) continue;
        const grove = smooth(0.0, 0.4, n.fbm(x * 0.02 + 30, z * 0.02, 2));
        if (rnd() > 0.15 + grove * 0.85) continue;
        pl++;
        const s = 0.7 + rnd() * 0.7;
        add(ck[Math.floor(rnd() * 2)], inst(x, z, s, { sy: s * (0.9 + rnd() * 0.3), y: y - 0.1, r: tint(0.12), g: tint(0.1), b: tint(0.12) }));
      }
    }
  }

  // ------------------------------------------------------------------------------ grass tufts
  {
    const dry = biome === 'desert' ? 0.9 : biome === 'highland' ? 0.6 : biome === 'oasis' ? 0.15 : 0.35;
    const gm = vegMaterial({ sway: 0.28, fade: [95, 175], double: true, rough: 0.95, key: 'grass', uniforms: shared });
    const gk: Kind[] = [];
    const heights = biome === 'desert' ? 0.55 : 0.5;
    for (let v = 0; v < 3; v++) {
      const tone = Math.min(1, dry + (v - 1) * 0.2);
      gk.push(mk(`grass-${v}`, [makeGrass(700 + v * 3 + def.seed, 9, heights * (v === 2 ? 1.4 : 1), tone)], gm, 64, [[0, 185]], [false], [false], 'grass'));
    }
    const cap = Math.round(120000 * Math.min(2.2, area));
    const cellSize = 1.45;
    const nx = Math.floor((hf.size * 0.96) / cellSize);
    let total = 0;
    const jit = () => (rnd() - 0.5) * cellSize * 1.4;
    outer:
    for (let j = 0; j < nx; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = (i / nx - 0.48) * hf.size + cellSize * 0.5, z0 = (j / nx - 0.48) * hf.size + cellSize * 0.5;
        const x = x0 + jit(), z = z0 + jit();
        const veg = ctl(x, z, 0);
        if (veg < 0.06) continue;
        const p = veg * veg * (0.4 + 0.6 * smooth(-0.15, 0.25, n.fbm(x * 0.05, z * 0.05, 2)));
        if (rnd() > p) continue;
        if (ctl(x, z, 3) > 0.05 || ctl(x, z, 2) > 0.15 || roadAt(x, z) > 0.03) continue;
        if (Math.abs(x) > hf.size * 0.49 || Math.abs(z) > hf.size * 0.49) continue;
        const y = hf.heightAt(x, z);
        if (y < wl + 1.0) continue;
        if (blocked(x, z)) continue;
        const s = 0.7 + rnd() * 0.7;
        const c = tint(0.25);
        add(gk[Math.floor(rnd() * 3)], inst(x, z, s, { sy: s * (0.7 + rnd() * 0.7), y: y - 0.02, r: c, g: c, b: c * 0.9, tx: (rnd() - 0.5) * 0.3, tz: (rnd() - 0.5) * 0.3 }));
        if (++total >= cap) break outer;
      }
    }
  }

  // shuffle each cell so a density fraction (quality) thins the tufts uniformly
  for (const k of kinds) {
    for (const c of k.items.values()) {
      const a = c.list;
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    }
  }

  // ------------------------------------------------------------------------------ per-frame culling / LOD
  let quality: Quality = 'ultra';
  const dens = (k: Kind) => QUALITY[quality][k.densityKey];
  const focus = new THREE.Vector3(), dir = new THREE.Vector3();
  const update = (camera: THREE.Camera): void => {
    camera.getWorldDirection(dir);
    const gy = hf.heightAt(camera.position.x, camera.position.z);
    const t = Math.min(1400, (camera.position.y - gy) / Math.max(0.2, -dir.y));
    focus.copy(camera.position).addScaledVector(dir, t);
    focus.y = gy;
    (focusU.value as THREE.Vector3).copy(focus);
    const far = QUALITY[quality].far;
    for (const k of kinds) {
      const d = dens(k);
      for (const c of k.items.values()) {
        const dist = Math.hypot(c.cx - focus.x, c.cz - focus.z);
        const half = k.cell * 0.72;
        for (let l = 0; l < k.geos.length; l++) {
          const [r0, r1] = k.ranges[l];
          const on = d > 0 && dist + half > r0 * far * (l ? 1 : 0) && dist - half < r1 * (k.densityKey === 'grass' ? 1 : far);
          // LOD0 shows when the cell touches [0, r1); LOD1 only beyond r0
          const vis = l === 0 ? d > 0 && dist - half < r1 * (k.densityKey === 'grass' ? 1 : far) : on && dist + half > r0 * far;
          let m = c.meshes[l];
          if (vis) {
            if (!m) { m = buildCellMesh(k, l, c, d); c.meshes[l] = m; k.group.add(m); }
            m.visible = true;
          } else if (m) m.visible = false;
        }
      }
    }
  };
  group.userData.update = update;
  group.userData.setQuality = (q: Quality) => {
    quality = q;
    for (const k of kinds) {
      const d = dens(k);
      for (const c of k.items.values()) {
        for (let l = 0; l < c.meshes.length; l++) {
          const m = c.meshes[l];
          if (m) m.count = Math.max(0, Math.floor(c.list.length * d));
        }
      }
    }
  };
  if (terrain) terrain.onQuality((q) => (group.userData.setQuality as (q: Quality) => void)(q));
  return { group, materials: mats };
}
