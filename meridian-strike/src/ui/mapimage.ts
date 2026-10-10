import type { BuiltMap } from '../maps/maps';

/** Shaded relief image of a map (used by the minimap and the lobby preview). */
export function bakeMapImage(built: BuiltMap, S: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  const { hf, roadMask } = built;
  const def = built.def;
  const size = hf.size;
  const wl = def.waterLevel ?? null;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const x = (i / S - 0.5) * size, z = (j / S - 0.5) * size;
      const h = hf.heightAt(x, z);
      const e = size / S * 2;
      const hx = hf.heightAt(x + e, z) - hf.heightAt(x - e, z);
      const hz = hf.heightAt(x, z + e) - hf.heightAt(x, z - e);
      const shade = Math.max(0.55, Math.min(1.4, 1 - (hx * 0.5 + hz * 0.8) * (0.06 * 8 / e)));
      let r: number, gg: number, b: number;
      const k = Math.min(1, Math.max(0, h / 90));
      if (def.biome === 'highland') { r = 200 - k * 40; gg = 210 - k * 40; b = 225 - k * 30; }
      else if (def.biome === 'urban') { r = 110 + k * 50; gg = 120 + k * 40; b = 90 + k * 30; }
      else if (def.biome === 'oasis') { r = 190 - k * 40; gg = 150 - k * 30; b = 100 - k * 20; }
      else if (def.biome === 'mixed') { r = 140 + k * 40; gg = 130 + k * 20; b = 90; }
      else { r = 190 - k * 50; gg = 130 - k * 40; b = 80 - k * 25; }
      if (wl !== null && h < wl + 0.3) { r = 28; gg = 80; b = 110; }
      else {
        const idx = Math.min(hf.res * hf.res - 1, Math.floor((j / S) * (hf.res - 1)) * hf.res + Math.floor((i / S) * (hf.res - 1)));
        if (roadMask[idx] / 255 > 0.5) { r = 70; gg = 70; b = 72; }
      }
      const o = (j * S + i) * 4;
      img.data[o] = Math.min(255, r * shade); img.data[o + 1] = Math.min(255, gg * shade); img.data[o + 2] = Math.min(255, b * shade); img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
