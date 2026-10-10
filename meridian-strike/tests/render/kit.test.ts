import { describe, it, expect } from 'vitest';
import { Kit, MAT } from '../../src/render/kit';

describe('kit', () => {
  it('builds primitives with finite data and AO', () => {
    const k = new Kit({ camo: 0.5, seed: 3 });
    k.box(2, 1, 4, 0, 0.5, 0, 0x667755);
    k.slab(2, 1, 2, 0.5, 0, 1.5, 2, 0x667755);
    k.taper(2, 1, 1, 2, 1, 0, 2.5, 0, 0x778866, {}, 0.2);
    k.cyl(0.4, 0.4, 3, 0, 1.2, 1, 0x333333, { rot: [Math.PI / 2, 0, 0] });
    k.sphere(0.6, 0, 3, 0, 0x888888);
    k.torus(0.5, 0.15, 2, 0.5, 0, 0x222222, { rot: [0, 0, Math.PI / 2] });
    k.loft([{ z: -4, w: 0.01, h: 0.01 }, { z: -3, w: 0.6, h: 0.5, n: 3 }, { z: 0, w: 0.9, h: 0.7, n: 4, hard: true }, { z: 4, w: 0.01, h: 0.01 }], 5, 1, 0, 0x889988, { capEnd: true });
    k.prism([[0, 0], [2, 0], [1, 1.5]], 0.4, -4, 0, 0, 0x884444);
    k.plate([[-2, 0], [2, 0], [0, 3]], 0.2, 8, 1, 0, 0x445566);
    k.sweep([[0, 0, 0], [1, 1, 0], [2, 1, 1]], 0.1, 0x111111);
    k.rod(0, 0, 0, 1, 2, 3, 0.1, 0x111111);
    const t0 = performance.now();
    const g = k.build();
    const dt = performance.now() - t0;
    const pos = g.getAttribute('position').array as Float32Array;
    const nor = g.getAttribute('normal').array as Float32Array;
    const mat = g.getAttribute('aMat').array as Float32Array;
    for (const v of pos) expect(Number.isFinite(v)).toBe(true);
    for (const v of nor) expect(Number.isFinite(v)).toBe(true);
    let min = 1, max = 0;
    for (let i = 3; i < mat.length; i += 4) { min = Math.min(min, mat[i]); max = Math.max(max, mat[i]); }
    console.log('verts', pos.length / 3, 'tris', g.index!.count / 3, 'ao', min.toFixed(2), max.toFixed(2), 'ms', dt.toFixed(0));
    expect(min).toBeLessThan(1);
    void MAT;
  });
});
