import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../procgen/noise';

export interface PartOpts {
  rot?: [number, number, number];
  camo?: number;
  grime?: number;
  /** scale after rotation */
  sx?: number;
  sy?: number;
  sz?: number;
  jitter?: number;
}

const tmpColor = new THREE.Color();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/**
 * Collects primitives into one merged, vertex-coloured geometry.
 * uv.x = camo amount, uv.y = grime amount (consumed by the unit material shader).
 */
export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private rnd: () => number;
  constructor(public camo = 0, public grime = 0.35, seed = 1) {
    this.rnd = mulberry32(seed * 7919 + 13);
  }

  private add(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, o: PartOpts = {}): this {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    const [rx, ry, rz] = o.rot ?? [0, 0, 0];
    tmpE.set(rx, ry, rz, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpS.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    tmpP.set(x, y, z);
    tmpM.compose(tmpP, tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    tmpColor.setHex(color);
    const j = 1 + (this.rnd() - 0.5) * 2 * (o.jitter ?? 0.07);
    for (let i = 0; i < n; i++) { col[i * 3] = tmpColor.r * j; col[i * 3 + 1] = tmpColor.g * j; col[i * 3 + 2] = tmpColor.b * j; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const uv = new Float32Array(n * 2);
    const c = o.camo ?? this.camo, gr = o.grime ?? this.grime;
    for (let i = 0; i < n; i++) { uv[i * 2] = c; uv[i * 2 + 1] = gr; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.parts.push(geo);
    return this;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, o);
  }

  /** box whose top front edge is dropped (glacis plates, nose cones) */
  slab(w: number, h: number, d: number, drop: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const g = new THREE.BoxGeometry(w, h, d);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) > 0) p.setY(i, p.getY(i) - drop);
    g.computeVertexNormals();
    return this.add(g, color, x, y, z, o);
  }

  /** tapered box (wider at base) */
  taper(wb: number, wt: number, h: number, db: number, dt: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const g = new THREE.BoxGeometry(1, h, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      p.setX(i, p.getX(i) * (top ? wt : wb));
      p.setZ(i, p.getZ(i) * (top ? dt : db));
    }
    g.computeVertexNormals();
    return this.add(g, color, x, y, z, o);
  }

  /** cylinder along Y by default. rot=[Math.PI/2,0,0] lays it along Z, [0,0,PI/2] along X */
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, o?: PartOpts & { seg?: number }): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, o?.seg ?? 14), color, x, y, z, o);
  }

  sphere(r: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    return this.add(new THREE.SphereGeometry(r, 12, 9), color, x, y, z, o);
  }

  cone(r: number, h: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    return this.add(new THREE.ConeGeometry(r, h, 12), color, x, y, z, o);
  }

  /** triangular prism for delta wings / roofs: base triangle in XZ pointing +Z, thickness h */
  tri(w: number, d: number, h: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(0, d / 2); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(Math.PI / 2); // shape XY -> XZ, extrusion down
    g.translate(0, h / 2, 0);
    g.rotateX(0);
    // after rotateX(PI/2): shape y -> z (inverted sign), so flip to point +Z
    g.rotateY(Math.PI);
    return this.add(g, color, x, y, z, o);
  }

  /** pitched roof prism along Z */
  roof(w: number, h: number, d: number, x: number, y: number, z: number, color: number, o?: PartOpts): this {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    return this.add(g, color, x, y, z, o);
  }

  build(): THREE.BufferGeometry {
    if (!this.parts.length) this.box(0.01, 0.01, 0.01, 0, 0, 0, 0);
    for (const g of this.parts) {
      if (g.attributes.normal === undefined) g.computeVertexNormals();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    const m = mergeGeometries(this.parts, false)!;
    m.computeBoundingSphere();
    m.computeBoundingBox();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return m;
  }
}
