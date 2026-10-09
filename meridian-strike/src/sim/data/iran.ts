import type { EntityDef, GeneralDef, PowerDef, UpgradeDef } from '../types';
import { structure, unit, weapon } from './helpers';

const F = 'iran' as const;

const structs: EntityDef[] = [
  structure({
    id: 'iran_cc', name: 'Command Bunker', faction: F, roles: ['structure', 'production'], slot: 'cc', cost: 2000, time: 45, hp: 4200,
    vision: 90, footprint: [34, 34], power: 0, produces: ['iran_dozer'], tech: [],
    model: { tpl: 'command', style: 'iran', w: 34, d: 34 },
  }),
  structure({
    id: 'iran_power', name: 'Power Plant', faction: F, roles: ['structure', 'economy'], slot: 'power', cost: 700, time: 18, hp: 1400,
    vision: 50, footprint: [20, 20], power: 22, tech: ['iran_cc'],
    model: { tpl: 'reactor', style: 'iran', w: 20, d: 20 },
  }),
  structure({
    id: 'iran_supply', name: 'Supply Dock', faction: F, roles: ['structure', 'economy'], slot: 'supply', cost: 1300, time: 26, hp: 1700,
    vision: 60, footprint: [30, 26], power: -2, dropoff: true, produces: ['iran_truck'], tech: ['iran_cc'],
    model: { tpl: 'depotbuilding', style: 'iran', w: 30, d: 26 },
  }),
  structure({
    id: 'iran_barracks', name: 'Barracks', faction: F, roles: ['structure', 'production'], slot: 'barracks', cost: 500, time: 20, hp: 1400,
    vision: 60, footprint: [26, 20], power: -3, produces: ['iran_basij', 'iran_irgc', 'iran_atgm', 'iran_technical'], tech: ['iran_cc'],
    model: { tpl: 'barracks', style: 'iran', w: 26, d: 20 },
  }),
  structure({
    id: 'iran_workshop', name: 'Vehicle Workshop', faction: F, roles: ['structure', 'production'], slot: 'factory', cost: 1500, time: 30, hp: 2200,
    vision: 60, footprint: [36, 30], power: -5, tech: ['iran_supply'],
    produces: ['iran_boragh', 'iran_t72', 'iran_karrar', 'iran_zulfiqar', 'iran_fajr', 'iran_sayyad', 'iran_decoy_tank'],
    model: { tpl: 'factory', style: 'iran', w: 36, d: 30 },
  }),
  structure({
    id: 'iran_hangar', name: 'Drone Hangar', faction: F, roles: ['structure', 'production'], slot: 'airfield', cost: 1200, time: 28, hp: 1800,
    vision: 70, footprint: [60, 40], power: -4, airfield: 8, tech: ['iran_workshop'],
    produces: ['iran_shahed', 'iran_mohajer', 'iran_shahed129'],
    model: { tpl: 'airfield', style: 'iran', w: 60, d: 40 },
  }),
  structure({
    id: 'iran_radar', name: 'Radar Station', faction: F, roles: ['structure', 'tech'], slot: 'radar', cost: 900, time: 22, hp: 1100,
    vision: 160, footprint: [20, 20], power: -4, radar: true, tech: ['iran_supply'], detector: 60, jammer: 100,
    model: { tpl: 'radar', style: 'iran', w: 20, d: 20 },
  }),
  structure({
    id: 'iran_missilecity', name: 'Underground Missile City', faction: F, roles: ['structure', 'production', 'tech'], slot: 'tech', cost: 2300, time: 42, hp: 2800, armor: 'hardened',
    vision: 80, footprint: [32, 28], power: -7, tech: ['iran_radar'], unique: true, produces: ['iran_fateh', 'iran_zolfaghar', 'iran_decoy_tel'],
    model: { tpl: 'tunnel', style: 'iran', w: 28 },
  }),
  structure({
    id: 'iran_decoysite', name: 'Decoy Site', faction: F, roles: ['structure', 'production'], slot: 'decoy', cost: 600, time: 18, hp: 1000,
    vision: 60, footprint: [24, 20], power: -2, tech: ['iran_barracks'], produces: ['iran_decoy_tank', 'iran_decoy_tel'],
    model: { tpl: 'compound', style: 'iran', w: 24, d: 20 },
  }),
  structure({
    id: 'iran_armory', name: 'Revolutionary Armory', faction: F, roles: ['structure', 'tech'], slot: 'armory', cost: 1300, time: 26, hp: 1600,
    vision: 60, footprint: [28, 22], power: -3, tech: ['iran_barracks'], produces: ['up_iran_warheads', 'up_iran_camo', 'up_iran_guidance'],
    model: { tpl: 'armory', style: 'iran', w: 28, d: 22 },
  }),
  structure({
    id: 'iran_bavar', name: 'Bavar-373 Battery', faction: F, roles: ['structure', 'defense'], slot: 'aa', cost: 1000, time: 20, hp: 900, armor: 'hardened',
    vision: 120, footprint: [14, 14], power: -2, tech: ['iran_radar'],
    weapons: [weapon({ id: 'bavar', name: 'Sayyad-4B', damage: 125, dtype: 'aa', range: 150, reload: 4.4, salvo: 2, salvoGap: 0.5, speed: 150, targets: ['air'], guided: true, vfx: 'missile', mount: [0, 3, 2] })],
    turret: 3, model: { tpl: 'sam', style: 'iran', w: 14, d: 14, tubes: 4 },
  }),
  structure({
    id: 'iran_compound', name: 'Fortified Compound', faction: F, roles: ['structure', 'defense'], slot: 'defense', cost: 600, time: 15, hp: 1600, armor: 'hardened',
    vision: 100, footprint: [12, 12], power: -1, tech: ['iran_barracks'], garrison: 6,
    weapons: [
      weapon({ id: 'comp_mg', name: 'Heavy MG', damage: 14, dtype: 'smallarms', range: 60, reload: 0.15, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 3, 2] }),
      weapon({ id: 'comp_atgm', name: 'Dehlavieh', damage: 100, dtype: 'missile', range: 62, minRange: 10, reload: 6, speed: 90, targets: ['ground'], guided: true, vfx: 'missile', aoe: 3, mount: [0, 3, 2] }),
    ],
    turret: 4, model: { tpl: 'gunturret', style: 'iran', w: 12, d: 12, barrels: 1 },
  }),
  structure({
    id: 'iran_tunnel', name: 'Tunnel Entrance', faction: F, roles: ['structure', 'defense'], slot: 'bunker', cost: 350, time: 12, hp: 1800, armor: 'hardened',
    vision: 70, footprint: [16, 16], power: 0, tech: ['iran_barracks'], garrison: 8, tunnel: true,
    model: { tpl: 'tunnel', style: 'iran', w: 16 },
  }),
  structure({
    id: 'iran_fattah', name: 'Fattah Missile Silo', faction: F, roles: ['structure', 'superweapon'], slot: 'super', cost: 5000, time: 70, hp: 3200, armor: 'hardened',
    vision: 80, footprint: [28, 28], power: -10, tech: ['iran_missilecity'], unique: true,
    superweapon: { power: 'iran_fattah', charge: 340 },
    model: { tpl: 'silo', style: 'iran', w: 28, d: 28 },
  }),
];

const units: EntityDef[] = [
  unit({
    id: 'iran_dozer', name: 'Builder Crew', faction: F, roles: ['worker'], cost: 450, time: 11, hp: 400, armor: 'light', radius: 3.4, vision: 60,
    producedBy: 'iran_cc', speed: 6.8, move: 'track', model: { tpl: 'dozer', style: 'iran' },
    builds: ['iran_power', 'iran_supply', 'iran_barracks', 'iran_workshop', 'iran_hangar', 'iran_radar', 'iran_missilecity', 'iran_decoysite', 'iran_armory', 'iran_bavar', 'iran_compound', 'iran_tunnel', 'iran_fattah'],
  }),
  unit({
    id: 'iran_truck', name: 'Supply Truck', faction: F, roles: ['truck'], cost: 450, time: 11, hp: 400, armor: 'light', radius: 3.2, vision: 50,
    producedBy: 'iran_supply', speed: 9.5, move: 'wheel', cap: 320, model: { tpl: 'truck', style: 'iran' },
  }),
  unit({
    id: 'iran_basij', name: 'Basij Militia', faction: F, roles: ['infantry', 'militia'], cost: 80, time: 4, hp: 120, armor: 'infantry', radius: 1.8, vision: 55,
    producedBy: 'iran_barracks', speed: 4.4, move: 'foot', captures: true, canGarrison: true,
    weapons: [weapon({ id: 'g3', name: 'G3 Rifles', damage: 7, dtype: 'smallarms', range: 21, reload: 0.5, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'iran', n: 4, kit: 'rifle', militia: true },
  }),
  unit({
    id: 'iran_irgc', name: 'IRGC Rifle Squad', faction: F, roles: ['infantry'], cost: 200, time: 6, hp: 175, armor: 'infantry', radius: 1.8, vision: 60,
    producedBy: 'iran_barracks', speed: 4.2, move: 'foot', captures: true, canGarrison: true, deploy: 'stealth', stealth: { detect: 14, reveal: 3 },
    weapons: [weapon({ id: 'irgc_ar', name: 'Assault Rifles', damage: 9, dtype: 'smallarms', range: 24, reload: 0.5, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'iran', n: 4, kit: 'rifle' },
  }),
  unit({
    id: 'iran_atgm', name: 'Dehlavieh ATGM Team', faction: F, roles: ['infantry', 'antitank'], cost: 260, time: 8, hp: 130, armor: 'infantry', radius: 1.7, vision: 60,
    producedBy: 'iran_barracks', speed: 3.9, move: 'foot', canGarrison: true, deploy: 'stealth', stealth: { detect: 14, reveal: 3 },
    weapons: [weapon({ id: 'dehlavieh', name: 'Dehlavieh', damage: 115, dtype: 'missile', range: 52, minRange: 8, reload: 5.5, speed: 85, targets: ['ground'], guided: true, vfx: 'missile', aoe: 3, mount: [0, 1.5, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'iran', n: 2, kit: 'launcher' },
  }),
  unit({
    id: 'iran_technical', name: 'Technical', faction: F, roles: ['scout'], cost: 300, time: 7, hp: 280, armor: 'light', radius: 2.8, vision: 100,
    producedBy: 'iran_barracks', speed: 11, move: 'wheel', turret: 4,
    weapons: [weapon({ id: 'dshk', name: 'DShK', damage: 8, dtype: 'smallarms', range: 32, reload: 0.22, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 2.8, -1.2] })],
    model: { tpl: 'wheeled', style: 'iran', len: 5.4, wid: 2.4, wheels: 4, turret: 'mg', bed: true },
  }),
  unit({
    id: 'iran_boragh', name: 'Boragh APC', faction: F, roles: ['ifv'], cost: 500, time: 10, hp: 620, armor: 'light', radius: 3.6, vision: 80,
    producedBy: 'iran_workshop', speed: 8.5, move: 'wheel', turret: 3,
    weapons: [weapon({ id: 'boragh_gun', name: '30mm Cannon', damage: 18, dtype: 'ap', range: 38, reload: 0.7, targets: ['ground', 'air'], vfx: 'cannon', mount: [0, 3, 2.4] })],
    model: { tpl: 'wheeled', style: 'iran', len: 7, wid: 2.9, wheels: 8, turret: 'cannon' },
  }),
  unit({
    id: 'iran_t72', name: 'T-72S Upgrade', faction: F, roles: ['tank'], cost: 650, time: 12, hp: 880, armor: 'heavy', radius: 4.4, vision: 75,
    producedBy: 'iran_workshop', speed: 5.2, move: 'track', turret: 2.0,
    weapons: [
      weapon({ id: 't72_gun', name: '125mm Gun', damage: 100, dtype: 'ap', range: 50, reload: 3.2, speed: 200, targets: ['ground'], vfx: 'cannon', aoe: 2.4, mount: [0, 3, 5], spread: 2.5 }),
      weapon({ id: 't72_mg', name: 'Coaxial MG', damage: 6, dtype: 'smallarms', range: 30, reload: 0.2, targets: ['ground'], vfx: 'bullet', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'iran', len: 8.8, wid: 3.5, turretLen: 3.2, gun: 4.8 },
  }),
  unit({
    id: 'iran_karrar', name: 'Karrar MBT', faction: F, roles: ['tank'], cost: 1000, time: 16, hp: 1000, armor: 'heavy', radius: 4.6, vision: 78, tech: ['iran_radar'],
    producedBy: 'iran_workshop', speed: 5.1, move: 'track', turret: 2.2,
    weapons: [
      weapon({ id: 'karrar_gun', name: '125mm Gun', damage: 120, dtype: 'ap', range: 54, reload: 2.8, speed: 215, targets: ['ground'], vfx: 'cannon', aoe: 2.5, mount: [0, 3, 5], spread: 2.2 }),
      weapon({ id: 'karrar_mg', name: 'Coaxial MG', damage: 6, dtype: 'smallarms', range: 30, reload: 0.2, targets: ['ground'], vfx: 'bullet', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'iran', len: 9.4, wid: 3.6, turretLen: 3.4, gun: 5.2, era: true },
  }),
  unit({
    id: 'iran_zulfiqar', name: 'Zulfiqar-3', faction: F, roles: ['tank'], cost: 1050, time: 17, hp: 1100, armor: 'heavy', radius: 4.6, vision: 78, aps: 20, tech: ['iran_radar'],
    producedBy: 'iran_workshop', speed: 5.1, move: 'track', turret: 2.2,
    weapons: [
      weapon({ id: 'zulf_gun', name: '125mm Gun', damage: 124, dtype: 'ap', range: 55, reload: 2.8, speed: 215, targets: ['ground'], vfx: 'cannon', aoe: 2.5, mount: [0, 3, 5], spread: 2.2 }),
      weapon({ id: 'zulf_mg', name: 'Coaxial MG', damage: 6, dtype: 'smallarms', range: 30, reload: 0.2, targets: ['ground'], vfx: 'bullet', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'iran', len: 9.6, wid: 3.7, turretLen: 3.5, gun: 5.3, era: true },
  }),
  unit({
    id: 'iran_fajr', name: 'Fajr-5 Launcher', faction: F, roles: ['mlrs', 'artillery'], cost: 800, time: 15, hp: 400, armor: 'light', radius: 3.8, vision: 70,
    producedBy: 'iran_workshop', speed: 6.4, move: 'wheel', tech: ['iran_radar'], deploy: 'stealth', stealth: { detect: 16, reveal: 4 }, scoot: true,
    weapons: [weapon({ id: 'fajr5', name: 'Fajr-5 Rockets', damage: 55, dtype: 'artillery', range: 150, minRange: 35, reload: 16, salvo: 4, salvoGap: 0.35, speed: 130, arc: 0.55, aoe: 8, targets: ['ground'], vfx: 'rocket', mount: [0, 3.2, -1], spread: 9, fixed: true })],
    model: { tpl: 'mlrs', style: 'iran', len: 8, wid: 2.9, tubes: 4 },
  }),
  unit({
    id: 'iran_fateh', name: 'Fateh-110 TEL', faction: F, roles: ['missile', 'artillery'], cost: 1500, time: 20, hp: 380, armor: 'light', radius: 4.2, vision: 70,
    producedBy: 'iran_missilecity', speed: 6.2, move: 'wheel', deploy: 'stealth', stealth: { detect: 16, reveal: 4 }, scoot: true,
    weapons: [weapon({ id: 'fateh', name: 'Fateh-110', damage: 300, dtype: 'artillery', range: 210, minRange: 50, reload: 22, speed: 160, arc: 0.6, aoe: 14, targets: ['ground'], vfx: 'missile', mount: [0, 3.2, 1], spread: 8, fixed: true })],
    model: { tpl: 'tel', style: 'iran', len: 10, wid: 3 },
  }),
  unit({
    id: 'iran_zolfaghar', name: 'Zolfaghar TEL', faction: F, roles: ['missile', 'artillery'], cost: 1800, time: 24, hp: 380, armor: 'light', radius: 4.2, vision: 70,
    producedBy: 'iran_missilecity', speed: 6.2, move: 'wheel', deploy: 'stealth', stealth: { detect: 16, reveal: 4 }, scoot: true, tech: ['iran_armory'],
    weapons: [weapon({ id: 'zolfaghar', name: 'Zolfaghar', damage: 340, dtype: 'artillery', range: 270, minRange: 60, reload: 26, speed: 190, arc: 0.65, aoe: 16, targets: ['ground'], vfx: 'missile', mount: [0, 3.2, 1], spread: 8, fixed: true })],
    model: { tpl: 'tel', style: 'iran', len: 10.5, wid: 3 },
  }),
  unit({
    id: 'iran_shahed', name: 'Shahed-136 Swarm', faction: F, roles: ['swarm', 'drone'], cost: 450, time: 12, hp: 130, armor: 'drone', radius: 3, vision: 70, batch: 2, oneShot: true,
    producedBy: 'iran_hangar', speed: 22, move: 'drone', layer: 'air', fly: 38, accel: 20,
    weapons: [weapon({ id: 'shahed_warhead', name: 'Loitering Warheads', damage: 380, dtype: 'explosive', range: 130, reload: 1, targets: ['ground'], vfx: 'swarm', aoe: 8, suicide: true, fixed: true, mount: [0, 0, 1] })],
    model: { tpl: 'loiter', style: 'iran', n: 5 },
  }),
  unit({
    id: 'iran_mohajer', name: 'Mohajer-6', faction: F, roles: ['drone', 'heli'], cost: 800, time: 14, hp: 200, armor: 'drone', radius: 3, vision: 120,
    producedBy: 'iran_hangar', speed: 24, move: 'drone', layer: 'air', fly: 44, rearm: true, detector: 35,
    weapons: [weapon({ id: 'qaem', name: 'Qaem Missiles', damage: 70, dtype: 'missile', range: 55, reload: 4, salvo: 2, salvoGap: 0.4, speed: 100, targets: ['ground'], guided: true, vfx: 'missile', ammo: 4, aoe: 3, mount: [0, -1, 2], fixed: true })],
    model: { tpl: 'drone', style: 'iran', span: 17, len: 8 },
  }),
  unit({
    id: 'iran_shahed129', name: 'Shahed-129', faction: F, roles: ['drone', 'heli'], cost: 1000, time: 16, hp: 280, armor: 'drone', radius: 3, vision: 120,
    producedBy: 'iran_hangar', speed: 25, move: 'drone', layer: 'air', fly: 50, rearm: true, tech: ['iran_radar'], detector: 40,
    weapons: [weapon({ id: 'sadid', name: 'Sadid-345', damage: 85, dtype: 'missile', range: 60, reload: 4, salvo: 2, salvoGap: 0.4, speed: 100, targets: ['ground'], guided: true, vfx: 'missile', ammo: 6, aoe: 3, mount: [0, -1, 2], fixed: true })],
    model: { tpl: 'drone', style: 'iran', span: 20, len: 9 },
  }),
  unit({
    id: 'iran_sayyad', name: 'Mersad Air Defence', faction: F, roles: ['aa'], cost: 600, time: 12, hp: 380, armor: 'light', radius: 3.8, vision: 80,
    producedBy: 'iran_workshop', speed: 6.4, move: 'wheel', tech: ['iran_radar'], deploy: 'stealth', stealth: { detect: 16, reveal: 3 },
    weapons: [weapon({ id: 'mersad', name: 'Shahin', damage: 65, dtype: 'aa', range: 85, reload: 3, salvo: 2, salvoGap: 0.4, speed: 120, targets: ['air'], guided: true, vfx: 'missile', mount: [0, 4, 0], fixed: true })],
    model: { tpl: 'sam', style: 'iran', len: 8, wid: 3, tubes: 4, mobile: true },
  }),
  unit({
    id: 'iran_decoy_tank', name: 'Karrar MBT', faction: F, roles: ['decoy'], cost: 120, time: 4, hp: 220, armor: 'heavy', radius: 4.6, vision: 40, decoyOf: 'iran_karrar',
    producedBy: 'iran_workshop', speed: 5.6, move: 'track',
    model: { tpl: 'tank', style: 'iran', len: 9.4, wid: 3.6, turretLen: 3.4, gun: 5.2, era: true, decoy: true },
  }),
  unit({
    id: 'iran_decoy_tel', name: 'Fateh-110 TEL', faction: F, roles: ['decoy'], cost: 120, time: 4, hp: 200, armor: 'light', radius: 4.2, vision: 40, decoyOf: 'iran_fateh',
    producedBy: 'iran_missilecity', speed: 6.2, move: 'wheel',
    model: { tpl: 'tel', style: 'iran', len: 10, wid: 3 },
  }),
];

export const iranDefs: EntityDef[] = [...structs, ...units];

export const iranPowers: PowerDef[] = [
  { id: 'iran_spy', name: 'Spy Network', desc: 'Informants reveal a large area for 25 seconds.', faction: F, tier: 1, cost: 1, cooldown: 120, targeted: true, general: 'iran_rahimi', effect: { kind: 'reveal', radius: 140, duration: 25 } },
  { id: 'iran_cluster', name: 'Cluster Barrage', desc: 'Rocket artillery with wide-area warheads.', faction: F, tier: 2, cost: 2, cooldown: 200, targeted: true, general: 'iran_rahimi', effect: { kind: 'barrage', radius: 60, count: 26, damage: 130, delay: 6, duration: 12, dtype: 'artillery', spread: 12 } },
  { id: 'iran_ballistic', name: 'Ballistic Salvo', desc: 'Short-range ballistic missiles strike the target area.', faction: F, tier: 3, cost: 3, cooldown: 300, targeted: true, general: 'iran_rahimi', effect: { kind: 'salvo', radius: 40, count: 9, damage: 400, delay: 7, duration: 4, dtype: 'missile' } },
  { id: 'iran_decoys', name: 'Decoy Network', desc: 'Inflatable decoy tanks appear around the target for 90 seconds.', faction: F, tier: 1, cost: 1, cooldown: 140, targeted: true, general: 'iran_karimi', effect: { kind: 'decoys', unit: 'iran_decoy_tank', count: 6, duration: 90, delay: 3 } },
  { id: 'iran_swarm', name: 'Smart Swarm', desc: 'A wave of Shahed-136 loitering munitions strikes the target.', faction: F, tier: 2, cost: 2, cooldown: 200, targeted: true, general: 'iran_karimi', effect: { kind: 'swarm', unit: 'iran_shahed', count: 4, delay: 4 } },
  { id: 'iran_cloud', name: 'Kamikaze Cloud', desc: 'A massive swarm of loitering munitions.', faction: F, tier: 3, cost: 3, cooldown: 300, targeted: true, general: 'iran_karimi', effect: { kind: 'swarm', unit: 'iran_shahed', count: 10, delay: 5 } },
  { id: 'iran_militia', name: 'Call the Militia', desc: 'Basij militia rise up at the target location.', faction: F, tier: 1, cost: 1, cooldown: 150, targeted: true, general: 'iran_sadeghi', effect: { kind: 'ambush', unit: 'iran_basij', count: 8, delay: 3 } },
  { id: 'iran_minefield', name: 'Minefield', desc: 'Hidden mines cover the target area for two minutes.', faction: F, tier: 2, cost: 2, cooldown: 200, targeted: true, general: 'iran_sadeghi', effect: { kind: 'minefield', radius: 50, count: 30, damage: 260, duration: 120, delay: 2 } },
  { id: 'iran_ambush', name: 'Total Ambush', desc: 'IRGC squads and ATGM teams materialise around the target.', faction: F, tier: 3, cost: 3, cooldown: 320, targeted: true, general: 'iran_sadeghi', effect: { kind: 'ambush', unit: 'iran_atgm', count: 10, delay: 3 } },
  { id: 'iran_fattah', name: 'Fattah Salvo', desc: 'Hypersonic missile volley. Very hard to intercept.', faction: F, tier: 3, cost: 0, cooldown: 340, targeted: true, effect: { kind: 'salvo', radius: 50, spread: 24, count: 6, damage: 1000, delay: 8, duration: 5, dtype: 'hyper' } },
];

export const iranGenerals: GeneralDef[] = [
  { id: 'iran_rahimi', name: 'Gen. Rahimi', faction: F, title: 'Missile Force', desc: 'Cheaper missile units and rocket artillery that hits harder.', costMul: { missile: 0.85, mlrs: 0.85 }, dmgMul: { missile: 1.1, mlrs: 1.1 }, powers: ['iran_spy', 'iran_cluster', 'iran_ballistic'] },
  { id: 'iran_karimi', name: 'Gen. Karimi', faction: F, title: 'Drone Warfare', desc: 'Cheaper drones, tougher swarms.', costMul: { drone: 0.8, swarm: 0.8 }, hpMul: { drone: 1.2 }, powers: ['iran_decoys', 'iran_swarm', 'iran_cloud'] },
  { id: 'iran_sadeghi', name: 'Gen. Sadeghi', faction: F, title: 'Irregular Warfare', desc: 'Cheaper infantry and militia, tougher irregulars.', costMul: { infantry: 0.85, militia: 0.8 }, hpMul: { infantry: 1.15 }, powers: ['iran_militia', 'iran_minefield', 'iran_ambush'] },
];

export const iranUpgrades: UpgradeDef[] = [
  { id: 'up_iran_warheads', name: 'Cluster Warheads', desc: '+20% damage for missiles and rocket artillery.', faction: F, cost: 2200, time: 48, roles: ['missile', 'mlrs', 'artillery'], dmgMul: 1.2, unique: true },
  { id: 'up_iran_camo', name: 'Advanced Camouflage', desc: '+25% armour for vehicles.', faction: F, cost: 1700, time: 40, roles: ['tank', 'ifv', 'scout', 'mlrs', 'missile', 'aa'], hpMul: 1.25, unique: true },
  { id: 'up_iran_guidance', name: 'Smart Guidance', desc: '+15% damage and range for drones and tank guns.', faction: F, cost: 2000, time: 45, roles: ['drone', 'swarm', 'tank'], dmgMul: 1.15, rangeMul: 1.1, unique: true },
];
