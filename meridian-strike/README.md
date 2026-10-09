# MERIDIAN STRIKE

Modern-day (2026) real-time strategy in the spirit of *Command & Conquer: Generals – Zero Hour*.
Browser game for desktop, built with TypeScript + Three.js. Original code, original (fully procedural) assets, original maps.

* **3 armies** — United States (networked precision / air power), China (industrial mass), Iran (asymmetric & hidden) — 9 generals, ~19 units + ~15 structures each, a superweapon each.
* **Skirmish** for **2–10 players**, human + AI (Easy / Medium / Hard / Brutal, 6 AI personalities), free-for-all or **teams by team number** (same number = allies, 0 = alone).
* **5 maps**: Red Mesa (2–4), Harbor Line (2–6), Oasis Crown (2–6), Highland Pass (2–8), Grand Meridian (2–10).
* Realistic-style graphics: PBR + cascaded shadows, SSAO, bloom, SMAA, dynamic sky / time of day, weather, GPU-instanced units, particle VFX, decals, wrecks.
* Everything generated in code: models, textures, sound effects, music, voice lines (browser speech synthesis).

## Run

```bash
npm install
npm run dev          # http://localhost:5173  (add --host to play from another machine on the LAN)
npm run build        # production bundle in dist/
npm test             # headless sim tests + AI soak tests (vitest)
npm run shot         # headless Chromium screenshot smoke test -> tests/out/
```

Open the page, choose **Skirmish**, pick a map / armies / team numbers and **Start**.
**Watch AI Battle** runs a spectator match. URL helpers: `?auto=1&map=grand_meridian&n=10&spectate=1&speed=4&q=low` (see `src/main.ts`), `?gallery=usa|china|iran` shows every model.

## Controls

| | |
|---|---|
| Camera | WASD / arrows / screen edge, Q E or middle-mouse rotate, wheel zoom, Shift = fast, Space = last alert, Alt+H = base |
| Select | click, drag-box, double-click = same type, Shift add, Ctrl+1-9 groups, 1-9 recall, Ctrl+A |
| Orders | right-click (move / attack / capture / garrison / harvest / repair), A attack-move, S stop, D scatter, F patrol, Q capture, W garrison, E hide/deploy, Z X C V stances |
| Build | select a Dozer → command card → click to place (Shift = keep placing) |
| Production | select a structure → Q W E R / A S D F / Z X C V, Shift = ×5, right-click an item cancels, Y = rally |
| Powers | spend ★ command points on the right panel, then click the target; superweapon button when charged |
| Misc | Esc menu, `~` perf overlay, Delete = sell |

## Architecture

```
src/
  sim/        deterministic simulation (runs in a Web Worker): entities, nav grid + flow fields, combat, economy, air, powers, AI
    data/     all balance numbers (units, structures, generals, powers, upgrades) per faction
    systems/  orders/movement, combat/projectiles, economy/production, air, vision (fog of war), powers
    ai/       build orders, production weights, waves, powers, personalities
  maps/       height-field generator + the five map definitions
  render/     Three.js: terrain, props, procedural model library, instanced entity renderer, VFX, fog shader, weather
  game/       session glue, input controller, worker/local sim hosts
  ui/         HUD, command card, minimap, lobby, icons
  audio/      synthesised SFX / music / voice
tests/        vitest: movement, combat, economy, air, AI soak games on every map
```

The simulation never imports the renderer and is driven only by serialisable commands, so it can be replayed and is ready for lockstep LAN play.
See [docs/GDD.md](docs/GDD.md) for the design and the "as implemented" appendix.
