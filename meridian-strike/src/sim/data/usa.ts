import type { EntityDef, GeneralDef, PowerDef, UpgradeDef } from '../types';
import { structure, unit, weapon } from './helpers';

const F = 'usa' as const;

// ------------------------------------------------------------------------------ structures
const structs: EntityDef[] = [
  structure({
    id: 'usa_cc', name: 'Command Center', faction: F, roles: ['structure', 'production'], slot: 'cc', cost: 2000, time: 45, hp: 4200,
    vision: 90, footprint: [34, 34], power: 0, produces: ['usa_dozer'], unique: false, tech: [],
    model: { tpl: 'command', style: 'usa', w: 34, d: 34 },
  }),
  structure({
    id: 'usa_reactor', name: 'Microreactor', faction: F, roles: ['structure', 'economy'], slot: 'power', cost: 800, time: 20, hp: 1400,
    vision: 50, footprint: [20, 20], power: 22, tech: ['usa_cc'],
    model: { tpl: 'reactor', style: 'usa', w: 20, d: 20 },
  }),
  structure({
    id: 'usa_supply', name: 'Supply Center', faction: F, roles: ['structure', 'economy'], slot: 'supply', cost: 1500, time: 30, hp: 1800,
    vision: 60, footprint: [30, 26], power: -2, dropoff: true, produces: ['usa_truck'], tech: ['usa_cc'],
    model: { tpl: 'depotbuilding', style: 'usa', w: 30, d: 26 },
  }),
  structure({
    id: 'usa_barracks', name: 'Barracks', faction: F, roles: ['structure', 'production'], slot: 'barracks', cost: 600, time: 22, hp: 1500,
    vision: 60, footprint: [26, 20], power: -3, produces: ['usa_rifle', 'usa_javelin', 'usa_ranger'], tech: ['usa_cc'],
    model: { tpl: 'barracks', style: 'usa', w: 26, d: 20 },
  }),
  structure({
    id: 'usa_factory', name: 'War Factory', faction: F, roles: ['structure', 'production'], slot: 'factory', cost: 1800, time: 35, hp: 2400,
    vision: 60, footprint: [36, 30], power: -5, tech: ['usa_supply'],
    produces: ['usa_jltv', 'usa_stryker', 'usa_abrams', 'usa_bradley', 'usa_paladin', 'usa_himars', 'usa_patriot_l'],
    model: { tpl: 'factory', style: 'usa', w: 36, d: 30 },
  }),
  structure({
    id: 'usa_airfield', name: 'Airfield', faction: F, roles: ['structure', 'production'], slot: 'airfield', cost: 1400, time: 32, hp: 2000,
    vision: 70, footprint: [60, 40], power: -5, airfield: 6, tech: ['usa_factory'],
    produces: ['usa_reaper', 'usa_apache', 'usa_f35', 'usa_b21'],
    model: { tpl: 'airfield', style: 'usa', w: 60, d: 40 },
  }),
  structure({
    id: 'usa_radar', name: 'Network Node', faction: F, roles: ['structure', 'tech'], slot: 'radar', cost: 1000, time: 24, hp: 1200,
    vision: 160, footprint: [20, 20], power: -4, radar: true, tech: ['usa_supply'], detector: 70,
    model: { tpl: 'radar', style: 'usa', w: 20, d: 20 },
  }),
  structure({
    id: 'usa_strategic', name: 'Strategic Command', faction: F, roles: ['structure', 'tech'], slot: 'tech', cost: 2500, time: 45, hp: 2600,
    vision: 80, footprint: [32, 28], power: -8, tech: ['usa_radar'], unique: true,
    model: { tpl: 'techcenter', style: 'usa', w: 32, d: 28 },
  }),
  structure({
    id: 'usa_cyber', name: 'Cyber Warfare Center', faction: F, roles: ['structure', 'production'], slot: 'cyber', cost: 1500, time: 30, hp: 1500,
    vision: 60, footprint: [24, 22], power: -6, tech: ['usa_radar'], produces: ['usa_cyberop'],
    model: { tpl: 'cyber', style: 'usa', w: 24, d: 22 },
  }),
  structure({
    id: 'usa_armory', name: 'Armory', faction: F, roles: ['structure', 'tech'], slot: 'armory', cost: 1500, time: 28, hp: 1800,
    vision: 60, footprint: [28, 22], power: -3, tech: ['usa_barracks'], produces: ['up_usa_armor', 'up_usa_munitions', 'up_usa_optics'],
    model: { tpl: 'armory', style: 'usa', w: 28, d: 22 },
  }),
  structure({
    id: 'usa_patriot', name: 'Patriot Battery', faction: F, roles: ['structure', 'defense'], slot: 'aa', cost: 1000, time: 20, hp: 900, armor: 'hardened',
    vision: 120, footprint: [14, 14], power: -2, tech: ['usa_radar'],
    weapons: [weapon({ id: 'patriot', name: 'PAC-3', damage: 130, dtype: 'aa', range: 160, reload: 4.5, salvo: 2, salvoGap: 0.5, speed: 150, targets: ['air'], guided: true, vfx: 'missile', mount: [0, 3, 2] })],
    turret: 3,
    model: { tpl: 'sam', style: 'usa', w: 14, d: 14, tubes: 4 },
  }),
  structure({
    id: 'usa_cram', name: 'C-RAM Turret', faction: F, roles: ['structure', 'defense'], slot: 'defense', cost: 700, time: 16, hp: 800, armor: 'hardened',
    vision: 90, footprint: [10, 10], power: -2, tech: ['usa_radar'],
    weapons: [
      weapon({ id: 'cram', name: '20mm Phalanx', damage: 7, dtype: 'smallarms', range: 80, reload: 0.08, speed: 0, targets: ['air', 'ground'], vfx: 'bullet', mount: [0, 3, 2] }),
    ],
    turret: 6,
    model: { tpl: 'gunturret', style: 'usa', w: 10, d: 10, barrels: 1 },
  }),
  structure({
    id: 'usa_bunker', name: 'Hardened Bunker', faction: F, roles: ['structure', 'defense'], slot: 'bunker', cost: 400, time: 14, hp: 1800, armor: 'hardened',
    vision: 80, footprint: [14, 14], power: 0, tech: ['usa_barracks'], garrison: 5,
    model: { tpl: 'bunker', style: 'usa', w: 14, d: 14 },
  }),
  structure({
    id: 'usa_darkeagle', name: 'Dark Eagle Battery', faction: F, roles: ['structure', 'superweapon'], slot: 'super', cost: 5000, time: 70, hp: 3000,
    vision: 80, footprint: [28, 28], power: -12, tech: ['usa_strategic'], unique: true,
    superweapon: { power: 'usa_dark_eagle', charge: 360 },
    model: { tpl: 'silo', style: 'usa', w: 28, d: 28 },
  }),
];

// ------------------------------------------------------------------------------ units
const units: EntityDef[] = [
  unit({
    id: 'usa_dozer', name: 'Construction Dozer', faction: F, roles: ['worker'], cost: 500, time: 12, hp: 420, armor: 'light', radius: 3.4, vision: 60,
    producedBy: 'usa_cc', speed: 6.5, move: 'track', model: { tpl: 'dozer', style: 'usa' },
    builds: ['usa_reactor', 'usa_supply', 'usa_barracks', 'usa_factory', 'usa_airfield', 'usa_radar', 'usa_strategic', 'usa_cyber', 'usa_armory', 'usa_patriot', 'usa_cram', 'usa_bunker', 'usa_darkeagle'],
  }),
  unit({
    id: 'usa_truck', name: 'Supply Truck', faction: F, roles: ['truck'], cost: 500, time: 12, hp: 420, armor: 'light', radius: 3.2, vision: 50,
    producedBy: 'usa_supply', speed: 9, move: 'wheel', cap: 300, model: { tpl: 'truck', style: 'usa' },
  }),
  unit({
    id: 'usa_rifle', name: 'Rifle Squad', faction: F, roles: ['infantry'], cost: 150, time: 6, hp: 170, armor: 'infantry', radius: 1.8, vision: 60,
    producedBy: 'usa_barracks', speed: 4.2, move: 'foot', captures: true, canGarrison: true,
    weapons: [weapon({ id: 'm4', name: 'M4 Carbines', damage: 9, dtype: 'smallarms', range: 24, reload: 0.5, speed: 0, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'usa', n: 4, kit: 'rifle' },
  }),
  unit({
    id: 'usa_javelin', name: 'Javelin Team', faction: F, roles: ['infantry', 'antitank'], cost: 300, time: 9, hp: 140, armor: 'infantry', radius: 1.7, vision: 60,
    producedBy: 'usa_barracks', speed: 3.9, move: 'foot', canGarrison: true,
    weapons: [weapon({ id: 'javelin', name: 'Javelin', damage: 120, dtype: 'missile', range: 50, minRange: 8, reload: 5.5, speed: 80, targets: ['ground'], guided: true, vfx: 'missile', aoe: 3, mount: [0, 1.5, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'usa', n: 2, kit: 'launcher' },
  }),
  unit({
    id: 'usa_ranger', name: 'Ranger Recon', faction: F, roles: ['infantry', 'scout'], cost: 350, time: 10, hp: 130, armor: 'infantry', radius: 1.6, vision: 110,
    producedBy: 'usa_barracks', speed: 4.8, move: 'foot', canGarrison: true, stealth: { detect: 16, reveal: 3 }, detector: 14,
    weapons: [weapon({ id: 'scar', name: 'Suppressed SCAR', damage: 13, dtype: 'smallarms', range: 28, reload: 0.5, speed: 0, targets: ['ground'], vfx: 'bullet', mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'usa', n: 2, kit: 'rifle', dark: true },
  }),
  unit({
    id: 'usa_cyberop', name: 'Cyber Operator', faction: F, roles: ['infantry', 'support'], cost: 800, time: 16, hp: 120, armor: 'infantry', radius: 1.6, vision: 70,
    producedBy: 'usa_cyber', speed: 4, move: 'foot', cyber: true,
    weapons: [weapon({ id: 'cyberhack', name: 'Cyber Intrusion', damage: 0, dtype: 'cyber', range: 62, reload: 24, speed: 0, targets: ['ground'], vfx: 'cyber', stunTime: 20, mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'usa', n: 1, kit: 'laptop' },
  }),
  unit({
    id: 'usa_jltv', name: 'JLTV Scout', faction: F, roles: ['scout'], cost: 450, time: 10, hp: 380, armor: 'light', radius: 3, vision: 110,
    producedBy: 'usa_factory', speed: 10.5, move: 'wheel', turret: 4, detector: 20,
    weapons: [weapon({ id: 'm240', name: 'M240 MG', damage: 7, dtype: 'smallarms', range: 32, reload: 0.25, speed: 0, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 2.6, 1.2] })],
    model: { tpl: 'wheeled', style: 'usa', len: 5.6, wid: 2.5, wheels: 4, turret: 'mg' },
  }),
  unit({
    id: 'usa_stryker', name: 'Stryker Dragoon', faction: F, roles: ['ifv'], cost: 700, time: 14, hp: 800, armor: 'light', radius: 3.6, vision: 80,
    producedBy: 'usa_factory', speed: 8.5, move: 'wheel', turret: 3,
    weapons: [weapon({ id: 'mk44', name: '30mm Bushmaster', damage: 24, dtype: 'ap', range: 40, reload: 0.7, speed: 0, targets: ['ground', 'air'], vfx: 'cannon', mount: [0, 3, 2.4] })],
    model: { tpl: 'wheeled', style: 'usa', len: 7, wid: 2.9, wheels: 8, turret: 'cannon' },
  }),
  unit({
    id: 'usa_abrams', name: 'M1A2 Abrams', faction: F, roles: ['tank'], cost: 1200, time: 18, hp: 1150, armor: 'heavy', radius: 4.6, vision: 80,
    producedBy: 'usa_factory', speed: 5.4, move: 'track', turret: 2.2, aps: 12,
    weapons: [
      weapon({ id: 'm256', name: '120mm Smoothbore', damage: 135, dtype: 'ap', range: 60, reload: 2.7, speed: 220, targets: ['ground'], vfx: 'cannon', aoe: 2.5, mount: [0, 3, 5], spread: 2 }),
      weapon({ id: 'coax', name: 'Coaxial MG', damage: 6, dtype: 'smallarms', range: 32, reload: 0.2, speed: 0, targets: ['ground'], vfx: 'bullet', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'usa', len: 9.4, wid: 3.7, turretLen: 3.6, gun: 5.4, era: true },
  }),
  unit({
    id: 'usa_bradley', name: 'Bradley IFV', faction: F, roles: ['ifv', 'antitank'], cost: 900, time: 16, hp: 900, armor: 'heavy', radius: 4, vision: 80,
    producedBy: 'usa_factory', speed: 6.5, move: 'track', turret: 2.6, tech: ['usa_supply'],
    weapons: [
      weapon({ id: 'm242', name: '25mm Bushmaster', damage: 12, dtype: 'ap', range: 42, reload: 0.35, speed: 0, targets: ['ground', 'air'], vfx: 'cannon', mount: [0, 3, 3] }),
      weapon({ id: 'tow', name: 'TOW-2B', damage: 100, dtype: 'missile', range: 56, minRange: 10, reload: 6, speed: 90, targets: ['ground'], guided: true, vfx: 'missile', mount: [1.4, 3.2, 1], aoe: 2.5 }),
    ],
    model: { tpl: 'tank', style: 'usa', len: 7.6, wid: 3.3, turretLen: 2.4, gun: 3, ifv: true },
  }),
  unit({
    id: 'usa_paladin', name: 'M109 Paladin', faction: F, roles: ['artillery'], cost: 1000, time: 18, hp: 520, armor: 'light', radius: 4.2, vision: 70,
    producedBy: 'usa_factory', speed: 4.2, move: 'track', turret: 0.7, tech: ['usa_supply'],
    weapons: [weapon({ id: 'm284', name: '155mm Howitzer', damage: 170, dtype: 'artillery', range: 150, minRange: 30, reload: 6, speed: 110, arc: 0.45, aoe: 10, targets: ['ground'], vfx: 'shell', mount: [0, 3.2, 5], spread: 8 })],
    model: { tpl: 'artillery', style: 'usa', len: 9, wid: 3.4, gun: 6.5 },
  }),
  unit({
    id: 'usa_himars', name: 'M142 HIMARS', faction: F, roles: ['mlrs', 'artillery'], cost: 1400, time: 22, hp: 480, armor: 'light', radius: 4, vision: 70,
    producedBy: 'usa_factory', speed: 6.2, move: 'wheel', tech: ['usa_radar'],
    weapons: [weapon({ id: 'gmlrs', name: 'GMLRS', damage: 65, dtype: 'artillery', range: 190, minRange: 40, reload: 20, salvo: 6, salvoGap: 0.35, speed: 130, arc: 0.55, aoe: 8, targets: ['ground'], vfx: 'rocket', mount: [0, 3.2, -1], spread: 9, fixed: true })],
    model: { tpl: 'mlrs', style: 'usa', len: 8, wid: 2.9, tubes: 6 },
  }),
  unit({
    id: 'usa_patriot_l', name: 'Patriot Launcher', faction: F, roles: ['aa'], cost: 1100, time: 18, hp: 480, armor: 'light', radius: 4, vision: 80,
    producedBy: 'usa_factory', speed: 5, move: 'wheel', tech: ['usa_radar'],
    weapons: [weapon({ id: 'pac3l', name: 'PAC-3 MSE', damage: 130, dtype: 'aa', range: 150, reload: 5, salvo: 2, salvoGap: 0.5, speed: 150, targets: ['air'], guided: true, vfx: 'missile', mount: [0, 4, 0], fixed: true })],
    model: { tpl: 'sam', style: 'usa', len: 9, wid: 3, tubes: 4, mobile: true },
  }),
  unit({
    id: 'usa_reaper', name: 'MQ-9 Reaper', faction: F, roles: ['drone', 'heli'], cost: 1100, time: 20, hp: 260, armor: 'drone', radius: 3, vision: 130,
    producedBy: 'usa_airfield', speed: 24, move: 'drone', layer: 'air', fly: 46, rearm: true, tech: ['usa_radar'], detector: 40,
    weapons: [weapon({ id: 'hellfire', name: 'AGM-114 Hellfire', damage: 90, dtype: 'missile', range: 62, reload: 4, salvo: 2, salvoGap: 0.4, speed: 100, targets: ['ground'], guided: true, vfx: 'missile', ammo: 8, aoe: 3, mount: [0, -1, 2], fixed: true })],
    model: { tpl: 'drone', style: 'usa', span: 20, len: 11 },
  }),
  unit({
    id: 'usa_apache', name: 'AH-64E Apache', faction: F, roles: ['heli'], cost: 1500, time: 22, hp: 750, armor: 'air', radius: 4, vision: 100,
    producedBy: 'usa_airfield', speed: 18, move: 'heli', layer: 'air', fly: 16, rearm: true, accel: 24,
    weapons: [
      weapon({ id: 'm230', name: '30mm Chain Gun', damage: 14, dtype: 'ap', range: 55, reload: 0.2, speed: 0, targets: ['ground', 'air'], vfx: 'cannon', ammo: 80, mount: [0, -1, 4], fixed: true }),
      weapon({ id: 'hellfire_a', name: 'Hellfire', damage: 100, dtype: 'missile', range: 66, reload: 5, salvo: 2, salvoGap: 0.4, speed: 100, targets: ['ground'], guided: true, vfx: 'missile', ammo: 8, aoe: 3, mount: [1.5, 0, 2], fixed: true }),
    ],
    model: { tpl: 'heli', style: 'usa', len: 15, rotor: 14, attack: true },
  }),
  unit({
    id: 'usa_f35', name: 'F-35A Lightning II', faction: F, roles: ['fighter', 'bomber'], cost: 2200, time: 28, hp: 650, armor: 'air', radius: 5, vision: 120,
    producedBy: 'usa_airfield', speed: 62, move: 'plane', layer: 'air', fly: 70, rearm: true, stealth: { detect: 40, reveal: 2, always: true }, tech: ['usa_radar'],
    weapons: [
      weapon({ id: 'gbu', name: 'GBU-39 SDB', damage: 230, dtype: 'explosive', range: 60, reload: 1.2, salvo: 2, salvoGap: 0.25, speed: 0, targets: ['ground'], vfx: 'bomb', ammo: 6, aoe: 14, fixed: true, mount: [0, -1, 0] }),
      weapon({ id: 'aim120', name: 'AIM-120', damage: 140, dtype: 'aa', range: 130, reload: 4, speed: 240, targets: ['air'], guided: true, vfx: 'missile', ammo: 4, fixed: true, mount: [1, -1, 2] }),
    ],
    model: { tpl: 'jet', style: 'usa', len: 15, span: 10.5, stealth: true },
  }),
  unit({
    id: 'usa_b21', name: 'B-21 Raider', faction: F, roles: ['bomber'], cost: 3000, time: 36, hp: 950, armor: 'air', radius: 8, vision: 120,
    producedBy: 'usa_airfield', speed: 48, move: 'plane', layer: 'air', fly: 90, rearm: true, stealth: { detect: 30, reveal: 3, always: true }, tech: ['usa_strategic'],
    weapons: [weapon({ id: 'gbu57', name: 'GBU-31 JDAM Stick', damage: 320, dtype: 'explosive', range: 80, reload: 0.5, salvo: 5, salvoGap: 0.28, speed: 0, targets: ['ground'], vfx: 'bomb', ammo: 10, aoe: 19, fixed: true, structOnly: true, mount: [0, -1, 0] })],
    model: { tpl: 'bomber', style: 'usa', len: 21, span: 40 },
  }),
];

export const usaDefs: EntityDef[] = [...structs, ...units];

// ------------------------------------------------------------------------------ powers & generals
export const usaPowers: PowerDef[] = [
  { id: 'usa_recon', name: 'Recon Sweep', desc: 'Satellite scan reveals a large area for 25 seconds.', faction: F, tier: 1, cost: 1, cooldown: 120, targeted: true, general: 'usa_hale', effect: { kind: 'reveal', radius: 140, duration: 25 } },
  { id: 'usa_airstrike', name: 'Precision Airstrike', desc: 'F-35s drop a salvo of guided bombs.', faction: F, tier: 2, cost: 2, cooldown: 180, targeted: true, general: 'usa_hale', effect: { kind: 'airstrike', radius: 40, count: 10, damage: 220, delay: 5, duration: 4, dtype: 'explosive' } },
  { id: 'usa_carpet', name: 'B-21 Carpet Bombing', desc: 'A stealth bomber carpets a line across the target.', faction: F, tier: 3, cost: 3, cooldown: 300, targeted: true, general: 'usa_hale', effect: { kind: 'carpet', radius: 110, count: 22, damage: 300, delay: 6, duration: 6, dtype: 'explosive' } },
  { id: 'usa_repair', name: 'Emergency Repair', desc: 'Nanite repair restores units and structures in the area.', faction: F, tier: 1, cost: 1, cooldown: 150, targeted: true, general: 'usa_brooks', effect: { kind: 'repair', radius: 90, mult: 0.5 } },
  { id: 'usa_barrage', name: 'Fire Support Barrage', desc: 'Off-map howitzers shell the target area.', faction: F, tier: 2, cost: 2, cooldown: 200, targeted: true, general: 'usa_brooks', effect: { kind: 'barrage', radius: 50, count: 24, damage: 150, delay: 6, duration: 12, dtype: 'artillery' } },
  { id: 'usa_salvo', name: 'Smart Munitions Salvo', desc: 'Guided missiles hit the target area.', faction: F, tier: 3, cost: 3, cooldown: 300, targeted: true, general: 'usa_brooks', effect: { kind: 'salvo', radius: 36, count: 8, damage: 420, delay: 7, duration: 3, dtype: 'missile' } },
  { id: 'usa_paradrop', name: 'Ranger Paradrop', desc: 'Airdrops a team of Rangers.', faction: F, tier: 1, cost: 1, cooldown: 150, targeted: true, general: 'usa_vance', effect: { kind: 'paradrop', unit: 'usa_rifle', count: 5, delay: 6 } },
  { id: 'usa_emp', name: 'EMP Pulse', desc: 'Disables vehicles and structures in the area for 15 seconds.', faction: F, tier: 2, cost: 2, cooldown: 220, targeted: true, general: 'usa_vance', effect: { kind: 'emp', radius: 60, duration: 15, delay: 4 } },
  { id: 'usa_blackout', name: 'Cyber Blackout', desc: 'Shuts down enemy structures in a wide area for 30 seconds.', faction: F, tier: 3, cost: 3, cooldown: 330, targeted: true, general: 'usa_vance', effect: { kind: 'blackout', radius: 120, duration: 30, delay: 3 } },
  { id: 'usa_dark_eagle', name: 'Dark Eagle Strike', desc: 'Hypersonic glide vehicle. Devastating single blast.', faction: F, tier: 3, cost: 0, cooldown: 360, targeted: true, effect: { kind: 'strike', radius: 70, damage: 2600, delay: 9, dtype: 'hyper' } },
];

export const usaGenerals: GeneralDef[] = [
  {
    id: 'usa_hale', name: 'Gen. Hale', faction: F, title: 'Air Superiority', desc: 'Aircraft cost 20% less and are tougher. Master of the skies.',
    costMul: { heli: 0.8, fighter: 0.8, bomber: 0.8 }, hpMul: { heli: 1.1, fighter: 1.1, bomber: 1.1 }, powers: ['usa_recon', 'usa_airstrike', 'usa_carpet'],
  },
  {
    id: 'usa_brooks', name: 'Gen. Brooks', faction: F, title: 'Combined Arms', desc: 'Armour and artillery are cheaper and hit harder.',
    costMul: { tank: 0.85, ifv: 0.85, artillery: 0.85 }, dmgMul: { tank: 1.1, artillery: 1.1 }, powers: ['usa_repair', 'usa_barrage', 'usa_salvo'],
  },
  {
    id: 'usa_vance', name: 'Gen. Vance', faction: F, title: 'Special Warfare', desc: 'Elite infantry, cheaper Rangers and Cyber Operators.',
    costMul: { infantry: 0.85 }, hpMul: { infantry: 1.2 }, powers: ['usa_paradrop', 'usa_emp', 'usa_blackout'],
  },
];

export const usaUpgrades: UpgradeDef[] = [
  { id: 'up_usa_armor', name: 'Composite Armor', desc: 'Vehicles gain +25% armour.', faction: F, cost: 2000, time: 45, roles: ['tank', 'ifv', 'artillery', 'mlrs', 'aa', 'scout', 'worker', 'truck'], hpMul: 1.25, unique: true },
  { id: 'up_usa_munitions', name: 'Smart Munitions', desc: '+20% damage for vehicles and aircraft.', faction: F, cost: 2500, time: 50, roles: ['tank', 'ifv', 'artillery', 'mlrs', 'heli', 'fighter', 'bomber', 'drone'], dmgMul: 1.2, unique: true },
  { id: 'up_usa_optics', name: 'Advanced Optics', desc: '+30% vision for every unit.', faction: F, cost: 1500, time: 35, roles: ['all'], visionMul: 1.3, unique: true },
];
