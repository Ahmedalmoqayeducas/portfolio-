import { burst, tone, rand, lvl, Rig } from './dsp';

/**
 * One-shot weapon / impact recipes. Every recipe layers several physically motivated components:
 *   crack   - supersonic transient (very short, bright)
 *   blast   - muzzle blast / explosion body (noise with sweeping low-pass)
 *   body    - low thump (pitch-dropping sine)
 *   mech    - breech / metal noises
 *   tail    - rumble that the reverb send turns into echo
 * `f` is a pitch factor (faction / calibre flavour), `out` the per-shot spatial chain input.
 */

export function rifle(c: Rig, o: AudioNode, t: number, f = 1, heavy = 0): void {
  const out = lvl(c, o, 0.5);
  burst(c, out, t, 'white', 0.016, 1.0, { type: 'highpass', f0: 2800 * f, f1: 1700 * f, q: 0.7 }, 0.0004);
  burst(c, out, t, 'pink', 0.075 + 0.03 * heavy, 0.7, { type: 'bandpass', f0: 1700 * f, f1: 560 * f, q: 0.9 }, 0.0008);
  tone(c, out, t, 190 * f, 85 * f, 0.055 + 0.03 * heavy, 'sine', 0.38 + 0.14 * heavy);
  if (heavy > 0) {
    tone(c, out, t, 105 * f, 52 * f, 0.1, 'sine', 0.3 * heavy);
    burst(c, out, t, 'pink', 0.14, 0.3 * heavy, { type: 'lowpass', f0: 900, f1: 260, q: 0.6 }, 0.002);
  }
}

/** 20-40 mm autocannon: punchy thump with a metallic snap */
export function autocannon(c: Rig, o: AudioNode, t: number, f = 1): void {
  const out = lvl(c, o, 0.45);
  burst(c, out, t, 'white', 0.014, 0.85, { type: 'highpass', f0: 2600 * f, f1: 1500, q: 0.7 }, 0.0004);
  tone(c, out, t, 135 * f, 56 * f, 0.1, 'sine', 0.75);
  burst(c, out, t, 'pink', 0.11, 0.55, { type: 'bandpass', f0: 850 * f, f1: 380, q: 0.9 }, 0.001);
  burst(c, out, t + 0.012, 'white', 0.04, 0.18, { type: 'bandpass', f0: 3400, f1: 2800, q: 4 }, 0.001);
}

/** main battle tank gun (and howitzers with scale > 1) */
export function tankGun(c: Rig, o: AudioNode, t: number, f = 1, scale = 1): void {
  const out = lvl(c, o, 0.36);
  burst(c, out, t, 'white', 0.014, 1.0, { type: 'highpass', f0: 1500, f1: 900, q: 0.7 }, 0.0004);
  burst(c, out, t, 'white', 0.42 * scale, 1.0, { type: 'lowpass', f0: 4200, f1: 250, q: 0.6 }, 0.001);
  burst(c, out, t, 'pink', 0.38 * scale, 0.8, { type: 'bandpass', f0: 650, f1: 170, q: 0.7 }, 0.002); // body that survives laptop speakers
  burst(c, out, t, 'brown', 0.95 * scale, 0.9, { type: 'lowpass', f0: 650, f1: 60, q: 0.7 }, 0.004);
  tone(c, out, t, 80 * f, 29 * f, 0.6 * scale, 'sine', 0.7, 0.002);
  tone(c, out, t, 155 * f, 62 * f, 0.22, 'sine', 0.6);
  // breech / recoil mechanism a few ms later
  burst(c, out, t + 0.05, 'white', 0.05, 0.3, { type: 'bandpass', f0: 1800, f1: 1500, q: 3 }, 0.001);
  tone(c, out, t + 0.05, 520, 470, 0.14, 'triangle', 0.1);
}

export function rocketLaunch(c: Rig, o: AudioNode, t: number, scale = 1): void {
  const out = lvl(c, o, 0.55);
  burst(c, out, t, 'pink', 1.0 * scale, 0.7, { type: 'bandpass', f0: 250, f1: 3500, q: 1.3 }, 0.05);
  burst(c, out, t, 'brown', 1.6 * scale, 0.95, { type: 'lowpass', f0: 1100, f1: 200, q: 0.7 }, 0.08);
  burst(c, out, t, 'white', 0.05, 0.5, { type: 'highpass', f0: 2500, q: 0.7 }, 0.0005); // ignition pop
  for (let i = 0; i < 10; i++) burst(c, out, t + rand(0.05, 0.9) * scale, 'pink', 0.025, rand(0.08, 0.22), { type: 'bandpass', f0: rand(900, 3500), q: 2 }, 0.001);
}

export function missileLaunch(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.6);
  burst(c, out, t, 'pink', 0.75, 0.55, { type: 'bandpass', f0: 400, f1: 3000, q: 1.1 }, 0.04);
  burst(c, out, t, 'brown', 1.1, 0.7, { type: 'lowpass', f0: 900, f1: 180, q: 0.7 }, 0.06);
  burst(c, out, t, 'white', 0.04, 0.4, { type: 'highpass', f0: 3000, q: 0.7 }, 0.0005);
}

/** incoming shell / bomb: descending whistle with a hiss */
export function whistle(c: Rig, o: AudioNode, t: number, dur = 1.1): void {
  const out = lvl(c, o, 1.0);
  tone(c, out, t, 2400, 1000, dur, 'sine', 0.09, dur * 0.4);
  tone(c, out, t, 2410, 1010, dur, 'sine', 0.05, dur * 0.4);
  burst(c, out, t, 'pink', dur, 0.12, { type: 'bandpass', f0: 2200, f1: 900, q: 4 }, dur * 0.45);
}

/** explosion; size ~0.5 (grenade) .. 8 (superweapon) */
export function explosion(c: Rig, o: AudioNode, t: number, size: number, structure = false): void {
  const s = Math.max(0.4, Math.min(8, size));
  const out = lvl(c, o, 0.42 - 0.02 * Math.min(8, s));
  burst(c, out, t, 'white', 0.018, 1.0, { type: 'highpass', f0: 1200, f1: 700, q: 0.7 }, 0.0004);
  burst(c, out, t, 'white', 0.22 + 0.16 * s, 1.0, { type: 'lowpass', f0: 5200, f1: 300, q: 0.6 }, 0.001);
  burst(c, out, t + 0.01, 'brown', 0.55 + 0.45 * s, 1.0, { type: 'lowpass', f0: 420, f1: 55, q: 0.7 }, 0.006);
  tone(c, out, t, 72 - s * 3, 24, 0.45 + 0.3 * s, 'sine', Math.min(1.1, 0.5 + s * 0.12), 0.003);
  if (s > 2) burst(c, out, t + 0.07, 'brown', 1.2 + 0.4 * s, 0.9, { type: 'lowpass', f0: 280, f1: 40, q: 0.6 }, 0.05);
  // debris raining down
  const n = Math.floor(6 + s * 4);
  for (let i = 0; i < n; i++) {
    const dt = 0.12 + Math.pow(Math.random(), 0.7) * (0.8 + 0.25 * s);
    burst(c, out, t + dt, 'pink', rand(0.02, 0.06), rand(0.06, 0.22) * (1 - dt / (1.4 + 0.3 * s)), { type: 'bandpass', f0: rand(700, 4200), q: 1.4 }, 0.001);
  }
  if (structure) {
    burst(c, out, t + 0.25, 'brown', 2.6, 0.8, { type: 'lowpass', f0: 220, f1: 45, q: 0.6 }, 0.15);
    for (let i = 0; i < 22; i++) burst(c, out, t + rand(0.3, 2.4), 'pink', rand(0.03, 0.09), rand(0.05, 0.2), { type: 'bandpass', f0: rand(300, 2500), q: 1.2 }, 0.002);
  }
}

/** small impact sounds near the target of direct-fire weapons */
export function impactMetal(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.8);
  const f = rand(1500, 3400);
  tone(c, out, t, f, f * 0.93, 0.18, 'sine', 0.22);
  burst(c, out, t, 'white', 0.012, 0.35, { type: 'highpass', f0: 3000, q: 0.7 }, 0.0004);
}
export function impactDirt(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.8);
  burst(c, out, t, 'brown', 0.06, 0.7, { type: 'lowpass', f0: 420, f1: 120, q: 0.7 }, 0.002);
  burst(c, out, t, 'pink', 0.05, 0.25, { type: 'bandpass', f0: 1200, q: 0.9 }, 0.001);
}

export function flareHiss(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.6);
  burst(c, out, t, 'white', 0.55, 0.5, { type: 'highpass', f0: 2400, f1: 1000, q: 0.7 }, 0.03);
  burst(c, out, t, 'pink', 0.4, 0.3, { type: 'bandpass', f0: 3000, q: 1.5 }, 0.01);
}

/** single footfall on gravel / sand */
export function footstep(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.7);
  burst(c, out, t, 'pink', 0.06, rand(0.4, 0.7), { type: 'bandpass', f0: rand(350, 600), f1: 200, q: 0.9 }, 0.002);
  burst(c, out, t + 0.012, 'white', 0.03, 0.15, { type: 'bandpass', f0: rand(1800, 2800), q: 1.5 }, 0.001);
}

/** flamethrower: pressurised whoosh with a crackling tail */
export function flameThrower(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.9);
  burst(c, out, t, 'pink', 0.55, 0.8, { type: 'bandpass', f0: 450, f1: 1000, q: 0.6 }, 0.05);
  burst(c, out, t, 'brown', 0.7, 0.7, { type: 'lowpass', f0: 420, f1: 170, q: 0.7 }, 0.04);
  burst(c, out, t, 'white', 0.35, 0.18, { type: 'highpass', f0: 2600, q: 0.7 }, 0.06);
  for (let i = 0; i < 7; i++) burst(c, out, t + rand(0.05, 0.5), 'white', 0.02, rand(0.1, 0.3), { type: 'bandpass', f0: rand(1500, 4000), q: 2 }, 0.001);
}

/** EMP / cyber discharge: zapping sweep and crackle */
export function zap(c: Rig, o: AudioNode, t: number, big = 0): void {
  const out = lvl(c, o, 0.7);
  tone(c, out, t, 2200 + big * 400, 220, 0.35 + 0.4 * big, 'sawtooth', 0.35);
  tone(c, out, t, 3300, 400, 0.25 + 0.3 * big, 'square', 0.12);
  burst(c, out, t, 'white', 0.3 + 0.4 * big, 0.5, { type: 'bandpass', f0: 3200, f1: 900, q: 1.2 }, 0.002);
  for (let i = 0; i < 10 + big * 14; i++) burst(c, out, t + rand(0, 0.4 + 0.6 * big), 'white', 0.015, rand(0.15, 0.5), { type: 'highpass', f0: rand(2500, 6000), q: 0.8 }, 0.0005);
  if (big) tone(c, out, t, 90, 30, 1.2, 'sine', 0.5, 0.01);
}

/** nuclear detonation: huge low boom, long shockwave rumble, distant secondary roll */
export function nukeBlast(c: Rig, o: AudioNode, t: number): void {
  explosion(c, o, t, 8, true);
  const out = lvl(c, o, 0.5);
  burst(c, out, t + 0.2, 'brown', 6, 1.0, { type: 'lowpass', f0: 180, f1: 30, q: 0.6 }, 0.3);
  tone(c, out, t + 0.1, 40, 17, 5, 'sine', 0.9, 0.2);
  for (let i = 0; i < 14; i++) burst(c, out, t + rand(0.6, 5), 'brown', rand(0.3, 0.8), rand(0.15, 0.4), { type: 'lowpass', f0: rand(200, 400), f1: 50, q: 0.6 }, 0.02);
}

/** radio squelch click used around unit voice lines */
export function squelch(c: Rig, o: AudioNode, t: number): void {
  const out = lvl(c, o, 0.4);
  burst(c, out, t, 'white', 0.05, 0.6, { type: 'bandpass', f0: 2400, f1: 1800, q: 1.4 }, 0.001);
  burst(c, out, t + 0.04, 'white', 0.05, 0.25, { type: 'bandpass', f0: 3200, q: 2 }, 0.001);
}
