# MERIDIAN STRIKE — Game Design Document (v0.1)

> Modern-day (2026) real-time strategy in the spirit of *C&C Generals: Zero Hour*.
> Original code, original assets, original maps. Browser game, desktop only, English UI, local play.
> Stats are **gameplay approximations**, not real-world performance data.

---

## 1. Pillars

1. **Classic Generals feel, modern fidelity** — fast base building, big battles, garrison/capture, superweapons, General's Powers.
2. **Three armies that play *differently*** (not reskins): US = networked precision, China = industrial mass, Iran = asymmetric/hidden.
3. **Cinematic combat** — everything that happens on screen has light, smoke, debris, sound and screen feedback.
4. **Up to 10 players, no artificial limits** — scale is a feature; quality settings, not caps.
5. **Everything is data** — units, buildings, powers, maps are JSON/TS data files. Balance without touching engine code.

## 2. Technical Direction

| Area | Choice |
|---|---|
| Language / build | TypeScript, Vite |
| Renderer | Three.js on WebGL2 (WebGPU renderer behind a flag once stable for our features) |
| Simulation | Own deterministic fixed-step sim (30 Hz) in a **Web Worker**; renderer interpolates snapshots |
| Entities | bitECS (struct-of-arrays, cache friendly) |
| Pathfinding | Hierarchical flow-fields per destination + local avoidance (RVO/ORCA-lite), spatial hash |
| Fog of war | GPU texture, per-team vision grids computed in sim |
| AI | Behaviour trees + build-order scripts + squad manager; one AI "brain" per player |
| Audio | Web Audio: synthesized SFX, procedural music layers, radio-filtered speech synthesis for unit voices; CC0 samples where available |
| Models | **100% procedural** (parametric generators in code) + procedurally generated PBR textures (noise, panel lines, camo, grime). Pipeline is glTF-compatible so hand-made models can replace any generator later |
| Tests | Vitest for sim (deterministic replay tests), Playwright (bundled Chromium) for screenshots/perf smoke tests |
| Multiplayer (later) | Sim is deterministic + command-based → LAN lockstep for you and friends is a realistic Phase 2 |

### Why a Worker for the sim
10 players × hundreds of units × pathfinding + AI would stall the render thread. Sim runs in a Worker, writes transform/state to a SharedArrayBuffer (COOP/COEP headers set in the Vite dev server), renderer just draws. Fallback to transferable buffers if SAB is unavailable.

## 3. Visual Target ("high-end realistic")

No caps for the first version; a quality menu (Ultra / High / Medium / Low) exists only so the game can scale on other machines.

**Rendering stack**
- PBR everywhere (metal/rough), HDR environment lighting, filmic tone mapping (ACES/AgX)
- Cascaded shadow maps (4 cascades), contact shadows, GTAO ambient occlusion
- TAA + optional SMAA, bloom, subtle lens flare, vignette, chromatic aberration on explosions
- Atmospheric scattering sky, **dynamic time of day** per map (dawn, noon, dusk, night with searchlights/NVG-style tint option)
- Volumetric-style fog & god-rays, height fog in valleys, dust haze in deserts, snow/rain/sandstorm weather systems
- Instanced rendering for infantry & props; LOD for vehicles; impostors for distant units
- GPU particles: muzzle flash, tracers (additive light streaks that also light the ground), smoke columns with lighting, fire, sparks, shockwave distortion, heat haze
- Decals: tank tracks, craters, scorch marks, blood-free debris stains, burning wrecks that smoke for minutes
- Terrain: heightmap + triplanar splat (sand/rock/grass/snow/asphalt), parallax detail normals, procedural roads, water with foam/reflection/refraction
- Destruction: buildings fracture into chunks by pre-baked Voronoi cells; wrecks remain as cover and can be captured/garrisoned by some factions
- Cinematic camera: RTS camera with smooth zoom/tilt/rotate, edge-pan, screen shake scaled by explosion size, optional "kill cam" slow-mo on superweapon impact and last-building-destroyed

**Procedural model quality plan** (the honest part): every unit is built from 40–400 parametric parts (hull, turret, barrel, skirts, tracks with animated links, ERA blocks, antennae, rivets) + faction-specific camo & weathering shader (dirt accumulation by height & normal, edge wear, exhaust soot). This gives detailed, consistent, readable silhouettes — not photogrammetry. Hero units (Abrams, J-20, Shahed swarm, etc.) get extra budget first.

## 4. Core Gameplay

### 4.1 Resources & economy
- **Supply** (credits): harvested from supply depots by supply trucks/ships/helis (faction-specific carriers), plus capturable **oil derricks** for passive income. Depots deplete → forces expansion.
- **Power**: buildings need power; low power slows production and shuts down radar/defences/superweapons.
- **Command Points (CP)** from veterancy kills → unlock **General's Powers** (3 tiers).
- **Intel** (new): scouting/recon drones/radar reveal enemy tech; used for some powers and AI scoring.

### 4.2 Controls (RTS standard)
Box select, double-click select-type, Ctrl+# groups, Shift-queue, rally points, attack-move, guard, patrol, stances (aggressive / hold / hold-fire), formations, waypoint-line preview, hotkey grid for the command card, minimap with ping & camera drag, idle-unit hotkey, F-keys for base jump.

### 4.3 Combat model
- Damage types: **Small Arms, Armor-Piercing, Explosive, Artillery, Missile, Anti-Air, Flame/Thermite, EMP, Cyber, Hypersonic**
- Armor classes: Infantry, Light Vehicle, Heavy Armor, Structure, Aircraft, Drone, Hardened Structure
- Matrix of multipliers in data (`damage-matrix.json`)
- Projectiles are simulated (arcs, travel time, missiles can be jammed/flared/intercepted)
- Line-of-sight uses terrain height + building occluders; elevation gives range & vision bonus
- Veterancy: Rookie → Veteran → Elite → Heroic (HP, damage, ROF, vision, self-heal)
- Garrison: infantry in buildings get cover bonus; buildings can be demolished or captured

### 4.4 Shared systems that make the era feel modern
- **Air defence umbrella**: SAM sites project an interception zone; stealth aircraft reduce detection radius.
- **Electronic warfare**: jammers shrink enemy radar & disrupt guided missiles/drone control in radius; GPS-jam zones hurt precision weapons.
- **Drones everywhere**: recon, loitering munitions, FPV swarms — every faction has them, in different roles.
- **Active protection**: some tanks intercept the first incoming ATGM every N seconds.
- **Cyber**: temporary disable of structures/vehicles in range (US strongest, China second).

## 5. Factions

Each faction: **identity mechanic**, ~17 units, ~14 structures, 3 Generals (9 total), 1 superweapon.

### 5.1 UNITED STATES — "Networked Precision"
**Identity mechanic — Battle Network:** units within range of a *Command Node / AWACS / Recon Drone* share vision and gain +accuracy and +ROF; outside the network they are weaker. Fewer, more expensive, longer-range units; best air power; best at scouting.
**Weakness:** expensive, vulnerable to EMP/jamming, thin early game.

**Structures:** Command Center, Power Plant (Microreactor), Supply Depot, Barracks, War Factory, Airfield, Radar/Network Node, Strategic Command (tech), Patriot Battery, C-RAM turret, Hardened Bunker, Cyber Warfare Center, Armory (upgrades), Dark Eagle Battery (superweapon).

**Units (representative):**
| Unit | Role | Cost | HP | Dmg/Shot | Range | Speed | Notes |
|---|---|---|---|---|---|---|---|
| Rifle Squad | basic inf | 150 | 120 | 8 AP-light | 22 | 4.0 | garrison, capture |
| Javelin Team | AT inf | 300 | 100 | 90 Missile | 45 | 3.8 | top-attack, fire-and-forget |
| Ranger Recon | stealth inf | 350 | 100 | 10 | 25 | 4.4 | reveals, calls drone strike |
| Humvee→JLTV | scout | 450 | 350 | 14 MG | 28 | 9.0 | transports 4, mounts TOW |
| Stryker Dragoon | fast IFV | 700 | 700 | 30 AP | 35 | 7.5 | squad carrier |
| M1A2 Abrams (SEPv4) | MBT | 1200 | 1500 | 120 AP | 55 | 5.0 | APS: blocks 1 missile / 12 s |
| Bradley IFV | AT/IFV | 900 | 900 | 55 + TOW | 50 | 6.0 | carries 6 |
| M109 Paladin | SP artillery | 1000 | 600 | 150 Artillery | 130 | 3.5 | needs network vision |
| M142 HIMARS | MLRS | 1400 | 550 | 6×60 Rocket | 160 | 5.5 | ATACMS special |
| Patriot Launcher | long SAM | 1100 | 500 | 4×110 AA | 140 | 4.0 | anti-air/anti-missile |
| MQ-9 Reaper | drone | 1100 | 250 | 2×80 Hellfire | 55 | 20 (air) | recon + strike, cheap re-arm |
| AH-64E Apache | attack heli | 1500 | 800 | 30 cannon + Hellfire | 60 | 17 | strong vs armor |
| F-35A Lightning II | stealth multirole | 2200 | 650 | bombs/AAM | — | 40 | low detection, 1 sortie then re-arm |
| B-21 Raider | stealth bomber | 3000 | 900 | 4×350 Bunker/Heavy | strike | 36 | vs structures |
| Cyber Operator | support | 800 | 100 | disable 20 s | 60 | 4 | disables vehicle/structure |
| Combat Engineer | build/capture | 250 | 90 | — | — | 4 | build forward FOB |
| Supply Truck (MRAP) | economy | 500 | 400 | — | — | 7 | carries 600 |

**Generals:**
1. **Gen. Hale — Air Superiority:** cheaper aircraft, Carpet Strike, Combat Air Patrol.
2. **Gen. Brooks — Combined Arms:** cheaper armour, Fire Support Base, Smart Munitions upgrade.
3. **Gen. Vance — Special Warfare/Cyber:** upgraded Rangers, Cyber Blackout (disable enemy structures), Delta raid.

**Superweapon:** *Dark Eagle Strike* — hypersonic glide strike, 3 s warning, huge single blast.

### 5.2 CHINA — "Industrial Mass"
**Identity mechanic — Mass Production:** factories can queue in **batches** (x4 units, discounted, faster); units gain **Swarm Bonus** (+armour/+damage) when ≥ 6 friendly units are close. Strongest economy & best defensive structures (layered air defence, long-range artillery).
**Weakness:** slower tech, mediocre individuals, weak stealth.

**Structures:** Command Center, Power Plant, Supply Center, Barracks, Armor Works, Airfield, Radar Array, Propaganda/Drone Center, Layered AD Site (HQ-9), Coastal/Land Fire Base, Internet Cafe→Cyber Center, Fortress Wall segments, Tunnel Network, DF-17 Silo (superweapon).

**Units (representative):**
| Unit | Role | Cost | HP | Dmg | Range | Speed |
|---|---|---|---|---|---|---|
| Militia Squad | cheap inf | 100 | 100 | 7 | 20 | 4.0 |
| Type-191 Rifleman Squad | inf | 180 | 130 | 9 | 24 | 4.0 |
| HJ-12 Team | AT inf | 280 | 100 | 85 Missile | 45 | 3.8 |
| FPV Drone Handler | swarm | 300 | 90 | 6×40 suicide FPV | 50 | 4 |
| ZBD-04A IFV | IFV | 700 | 850 | 40 + ATGM | 45 | 6.5 |
| ZTZ-96B | cheap MBT | 750 | 1200 | 95 AP | 50 | 5.2 |
| ZTZ-99A | MBT | 1100 | 1450 | 115 AP | 55 | 5.0 |
| Type 15 | light tank | 900 | 900 | 90 AP | 50 | 7.0 |
| PLZ-05 | SP howitzer | 950 | 600 | 150 Artillery | 135 | 3.5 |
| PHL-16 | long-range MLRS | 1500 | 600 | 8×55 | 220 | 5 |
| HQ-17 Tor-type | short SAM | 700 | 450 | 4×60 AA | 80 | 6 |
| HQ-9 Launcher | long SAM | 1100 | 500 | 4×110 AA | 150 | 4 |
| Wing Loong Drone | UCAV | 900 | 220 | 2×70 | 50 | 18 |
| Z-10ME Helicopter | attack heli | 1400 | 750 | 30 + ATGM | 60 | 16 |
| J-16 Flanker | strike fighter | 2000 | 700 | bombs/AAM | — | 38 |
| J-20 Mighty Dragon | stealth fighter | 2400 | 700 | AAM/strike | — | 42 |
| H-6N Bomber | heavy bomber | 2800 | 1000 | carpet 6×250 | strike | 28 |

**Generals:**
1. **Gen. Lin — Infantry/Swarm:** Tank Swarm Rush, Human Wave, Militia upgrades.
2. **Gen. Chen — Armor/Firepower:** Artillery Barrage, Hardened Armour upgrade, Thunder Run.
3. **Gen. Wu — Air & Missile Force:** discounted aircraft, Rocket Force Salvo, Area-denial SAM grid.

**Superweapon:** *DF-17 Barrage* — three staggered hypersonic missiles over a target area.

### 5.3 IRAN — "Asymmetric & Hidden"
**Identity mechanic — Hide and Strike:** launchers and many units can **deploy to stealth/dug-in** (camouflaged, hard to see until they fire), then **shoot-and-scoot** to relocate before counter-battery arrives. Mass cheap drones & missiles; **decoys** (inflatable/wooden) that soak missiles; proxy militia captures neutral buildings quickly. Tunnels link bases.
**Weakness:** weak air force, fragile units, relies on micromanagement & map knowledge.

**Structures:** Command Bunker, Power Plant, Supply Dock, Barracks, Vehicle Workshop, Drone Hangar, Underground Missile City (tech), Radar Station, Bavar-373 Battery, Tunnel Network, Decoy Site, Fortified Compound, Naval/Coastal Missile Site, *Fattah* Silo (superweapon).

**Units (representative):**
| Unit | Role | Cost | HP | Dmg | Range | Speed |
|---|---|---|---|---|---|---|
| Basij Militia | cheap inf, captures fast | 80 | 80 | 6 | 18 | 4.2 |
| IRGC Rifle Squad | inf | 200 | 130 | 9 | 24 | 4.0 |
| Saeghe/Dehlavieh ATGM Team | AT inf | 260 | 90 | 80 Missile | 45 | 3.8 |
| Technical | scout | 300 | 250 | 12 MG | 26 | 10 |
| Boragh APC | APC | 500 | 600 | 20 | 28 | 7 |
| T-72S Upgrade | cheap tank | 650 | 1000 | 85 AP | 48 | 5.0 |
| Karrar | MBT | 1000 | 1300 | 105 AP | 52 | 5.0 |
| Zulfiqar-3 | MBT | 1050 | 1350 | 108 AP | 52 | 5.0 |
| Fajr-5 Launcher | MLRS | 800 | 350 | 4×50 | 140 | 6 |
| Fateh-110 TEL | ballistic | 1500 | 350 | 280 Explosive | 200 | 6 |
| Zolfaghar TEL | ballistic | 1700 | 350 | 320 Explosive | 260 | 6 |
| Shahed-136 Swarm | loitering munitions (batch of 6) | 600 | 6×30 | 6×120 suicide | 120 | 14 |
| Mohajer-6 | UCAV | 800 | 200 | 2×70 | 50 | 18 |
| Shahed-129 | UCAV | 1000 | 280 | 2×80 | 55 | 17 |
| Bavar-373 | SAM | 1200 | 500 | 4×110 AA | 150 | 4 |
| Sayyad/Mersad AD | short SAM | 600 | 400 | 4×55 AA | 75 | 6 |
| Decoy TEL / Decoy Tank | decoy | 80 | 100 | — | — | 6 |
| Mine-layer / Sapper | support | 250 | 90 | traps | — | 4 |

**Generals:**
1. **Gen. Rahimi — Missile Force:** faster TEL reload, cluster warheads, Ballistic Salvo.
2. **Gen. Karimi — Drone Warfare:** bigger swarm batches, Smart Swarm, Kamikaze Cloud power.
3. **Gen. Sadeghi — Irregular/Defensive:** tunnels everywhere, ambush bonus, Minefield power, Decoy Network.

**Superweapon:** *Fattah Salvo* — hypersonic missile volley, lower damage than the others but cannot be intercepted by non-advanced AD.

> Names of generals are fictional. No real people, no real events/campaigns. Keep the in-game fiction neutral ("Coalition", "Eastern Command", "Gulf Command" fictional theatre).

## 6. Superweapons & General's Powers

| Tier | CP | Examples |
|---|---|---|
| 1 | 1 | Recon Sweep, Emergency Repair, Spy Satellite |
| 2 | 3 | Airstrike / Artillery Barrage / Drone Swarm, EMP pulse, Paradrop |
| 3 | 5 | Faction ultimate (carpet bomb, cyber blackout, ballistic salvo) |

Superweapon: 6 min build timer after tech, 6 min recharge, visible global countdown + audio sting for everyone.

## 7. Game Modes

### 7.1 Skirmish (main mode)
- 2–10 slots, each: Human / AI (Easy, Medium, Hard, Brutal) / Closed, Faction, General, Colour, **Team number**.
- **Team number rule:** same number = allied (shared vision & victory). **Empty = free-for-all, alone.** Up to 10 distinct teams.
- Options: starting cash, game speed, fog on/off, superweapons on/off, tech start, unit cap (default **unlimited**), day/night, weather, random start positions, shared control.
- Victory: destroy all enemy construction + production, or last team standing; optional Annihilation, Domination (hold zones).

### 7.2 AI personalities
Rusher, Turtle, Boomer (eco), Air Raider, Turtle-then-Artillery, Cheater (Brutal gets bonus income/vision). AIs ally if same team, respect teams in FFA, and hate whoever is strongest ("bully the leader").

### 7.3 Campaign (Phase 2)
Three 5-mission mini-campaigns, one per faction (fictional theatre). Not in the first playable versions.

## 8. Maps (first 5, fully authored)

All maps: seeded noise terrain **plus hand-authored layout JSON** (spawns, depots, derricks, roads, neutral buildings, choke points, props, weather & time of day). Each supports fewer players by using spawn subsets, balanced by rotational symmetry.

| # | Name | Players | Size | Biome | Concept |
|---|---|---|---|---|---|
| 1 | **Red Mesa** | 2–4 | Small | Desert canyon | Two plateaus, ramps, a central oil field; teaches high-ground and flanking |
| 2 | **Harbor Line** | 2–6 | Medium | Coastal port city | Dense urban with garrisonable buildings, docks, a bridge, helipads on rooftops |
| 3 | **Oasis Crown** | 2–6 | Medium | Desert + oasis | Central oasis (water + supply), dune fields hide stealth ambushes, sandstorm events |
| 4 | **Highland Pass** | 2–8 | Large | Mountains/snow | Narrow valleys, air-only shortcuts, avalanche event, great for artillery & air |
| 5 | **Grand Meridian** | 2–10 | Huge | Mixed (desert→city→forest→hills) | 10 radial bases around a central metropolis with superweapon-zone; day→night cycle during match |

Map-gen tooling: `tools/mapgen.ts` builds heightmap + splat + roads from seed + layout; map preview PNG generated for the lobby.

## 9. UI / UX

- Main menu with live 3D backdrop (flyover of a battlefield), English text only.
- Lobby (Skirmish setup) — slots list with faction flag, general, colour, **team number box**, map preview, option panel.
- In-game HUD: top resource bar (Supply, Power, CP), minimap bottom-left with radar overlay, selection panel bottom-centre, **command card** bottom-right with hotkeys, event/alert log, build queue bars, superweapon timers, FPS/perf overlay toggle.
- Accessibility: colour-blind safe team colours + team number badge above units, UI scale slider, rebindable hotkeys.
- Settings: graphics preset + per-feature toggles (shadows, GTAO, TAA, particles, resolution scale, MSAA), audio mixer, camera speed.

## 10. Audio

- **SFX:** synthesized per-weapon/per-engine in Web Audio (layered noise + oscillators + convolution reverb), distance & occlusion filtering, Doppler for aircraft, positional audio.
- **Voice:** unit acknowledgements & EVA announcements via browser speech synthesis through radio effect (bandpass + noise + squelch click). Fully offline, no copyrighted voice.
- **Music:** procedurally generated adaptive layers (ambient → tension → combat) per faction mood; optionally drop in CC0 tracks later.

## 11. Architecture

```
meridian-strike/
  docs/            GDD.md, BALANCE.md
  src/
    main.ts
    engine/        loop, input, camera, assets, settings
    sim/           worker entry, ECS components/systems, pathfinding, combat, fog, economy
    render/        scene, terrain, units, vfx, post, minimap
    procgen/       mesh generators, texture generators (camo, grime, panels)
    ai/            behaviour trees, build orders, personalities
    audio/         synth, music, voice
    ui/            menu, lobby, hud, command card
    data/          factions/*.json, units/*.json, structures/*.json, powers.json, damage-matrix.json
    maps/          *.map.json + generators
  tools/           mapgen, balance report, icon baker
  tests/           sim determinism, pathfinding, economy
```

Key rules: sim never imports render; all gameplay values come from `data/`; commands are serialisable (enables replays + LAN lockstep).

## 12. Roadmap (every milestone is playable)

| M | Deliverable |
|---|---|
| **M0** | Vite + TS project, Three.js scene, terrain, RTS camera, post-processing stack, perf overlay, Playwright screenshot test |
| **M1** | ECS + sim Worker, selection, move orders, flow-field pathfinding, 300 test units at 60 fps |
| **M2** | First units (US tank/inf), weapons, projectiles, damage matrix, VFX, SFX, fog of war, death/wrecks |
| **M3** | Economy: Command Center, power, supply, production queues, building placement, base building |
| **M4** | Full **US** roster & structures, Generals' Powers, veterancy, garrison/capture |
| **M5** | AI v1 (Medium) vs. US on **Red Mesa**; win/lose; main menu + skirmish lobby |
| **M6** | **China** full roster + mass-production mechanic |
| **M7** | **Iran** full roster + stealth/deploy/decoy mechanics |
| **M8** | Maps 2–5, 2–10 player lobby with team numbers, all AI personalities & levels |
| **M9** | Superweapons, air/EW/cyber systems, weather & day-night, destruction polish |
| **M10** | Audio pass, balance pass (AI-vs-AI batch simulations), settings, perf tuning, save/replay |
| **M11 (opt)** | LAN multiplayer lockstep with friends |
| **M12 (opt)** | Campaigns |

**Order logic:** build the full vertical slice with *one* faction first (M0→M5) so rendering, sim, economy and AI are proven before multiplying content by three.

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Procedural models not "pretty" enough | Heavy investment in materials/lighting/VFX; generator API takes glTF override per unit |
| 10 players × many units = CPU load | Sim in Worker, spatial hash, flow-fields shared per destination, AI think time sliced across ticks |
| Browser memory/GPU limits | Instancing, texture atlases, LOD, quality presets |
| Balance across 3 asymmetric factions | Data-driven stats + automated AI-vs-AI win-rate reports |
| Scope | Strict milestone gating; each milestone must be playable before the next starts |

## 14. Publishing note
This repo currently deploys to GitHub Pages on pushes to `main`. The game lives in `meridian-strike/` on a feature branch and is **not** published until merged to `main` — keep it unmerged (or exclude the folder from the Pages workflow) while it is local-only.


---

## Appendix A — As implemented (v1.0)

Where the implementation differs from or extends the plan above:

* **Simulation architecture:** plain struct-style entity classes + spatial hash (instead of bitECS); runs in a Web Worker at 30 Hz and posts typed-array snapshots. Flow-fields are demand-driven Dijkstra fields cached per 8 m goal cell, with straight-line LOS shortcuts and soft local avoidance.
* **Economy:** Supply Trucks harvest neutral supply piles (12–14k each) and return to Supply Centers; capturable oil derricks give +6 $/s. Power: low power slows production (min 35 %) and switches off radar / defences / superweapons below 55 %. Construction is done by Dozers (cost paid when the structure is placed).
* **Command points:** rank-ups (8 ranks, from 40 % of the value of enemies killed) give 1 ★ each; General's Powers are unlocked for 1 / 2 / 3 ★ (tier 1 / 2 / 3) and then used with a cooldown. Tier-3 powers also require the faction's tech structure.
* **Veterancy:** units rank Rookie → Veteran → Elite → Heroic from the cost of kills (HP, damage, ROF, vision; elite+ self-repair).
* **Armies:** each faction has ~19 units (incl. Dozer and Supply Truck), ~15 structures, 3 generals (3 powers each), 3 upgrades and one superweapon. Mechanics:
  * **USA** — Active Protection System on Abrams, cyber operators that disable vehicles/structures, stealth F-35 / B-21 / Ranger, EMP + cyber blackout powers, longest-range air defence.
  * **China** — batch ("mass") production and **Swarm bonus** (+12 % damage / −15 % damage taken near 6+ allied swarm units), cheapest economy, layered air defence, rocket-force artillery.
  * **Iran** — units that **hide** (stealth when deployed / idle), **shoot-and-scoot** TELs & rocket launchers, **decoy** vehicles that appear as real units to the enemy, **Shahed loitering-munition swarms**, minefield / militia / ambush powers.
* **Fog of war:** per-team 8 m grid, shared with allies; structures you have seen stay visible as remembered ghosts; stealth units are only revealed by detectors, short-range proximity or by firing.
* **Combat:** damage-type × armour-class matrix, simulated projectiles (hit-scan, ballistic, guided, bombs), guided missiles can be jammed and intercepted by APS, splash with falloff, garrison / capture, wrecks, craters, burning ruins.
* **AI:** build orders by role-slot (so it works for every faction), production weighted by personality and counter-picking, attack waves with retreat logic, defence responses, expansion to free supply piles, uses powers and superweapons. Difficulty scales think rate, wave size, army cap, expansion and (Brutal) income.
* **Maps:** five authored maps built from seeded noise + graded roads/pads that guarantee connectivity; Harbor Line / Grand Meridian contain garrisonable civilian cities, Oasis Crown has water and sandstorms, Highland Pass has snow, Grand Meridian has a day/night cycle.
* **Graphics:** HDR PBR pipeline, CSM shadows, GTAO, bloom, SMAA, sky + IBL, fog, weather, GPU-instanced procedural models with shader camo/grime, 28k-particle VFX (additive + smoke), decals, shockwaves, dynamic flashes, night window lights.
* **Audio:** all synthesised in Web Audio (weapons, explosions, UI, adaptive music, radio voice through the browser's speech synthesis).
* **Replays:** the simulation is deterministic (seeded RNG, command log) — *Save replay* in the pause / end screen, *Watch replay* in the main menu. See `docs/BALANCE.md` for the AI-vs-AI balance method and results.
* **Not included in v1.0:** LAN lockstep (the simulation is deterministic-by-commands and ready for it), campaigns, naval units.
