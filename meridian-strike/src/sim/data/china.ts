import type { EntityDef, GeneralDef, PowerDef, UpgradeDef } from '../types';
import { structure, unit, weapon } from './helpers';

const F = 'china' as const;

const structs: EntityDef[] = [
  structure({
    id: 'china_cc', name: 'Command Center', faction: F, roles: ['structure', 'production'], slot: 'cc', cost: 2000, time: 45, hp: 4400,
    vision: 90, footprint: [34, 34], power: 0, produces: ['china_dozer'], tech: [],
    model: { tpl: 'command', style: 'china', w: 34, d: 34 },
  }),
  structure({
    id: 'china_power', name: 'Nuclear Power Plant', faction: F, roles: ['structure', 'economy'], slot: 'power', cost: 700, time: 18, hp: 1500,
    vision: 50, footprint: [20, 20], power: 26, tech: ['china_cc'],
    model: { tpl: 'reactor', style: 'china', w: 20, d: 20 },
  }),
  structure({
    id: 'china_supply', name: 'Supply Center', faction: F, roles: ['structure', 'economy'], slot: 'supply', cost: 1400, time: 28, hp: 1900,
    vision: 60, footprint: [30, 26], power: -2, dropoff: true, produces: ['china_truck'], tech: ['china_cc'],
    model: { tpl: 'depotbuilding', style: 'china', w: 30, d: 26 },
  }),
  structure({
    id: 'china_barracks', name: 'Barracks', faction: F, roles: ['structure', 'production'], slot: 'barracks', cost: 500, time: 20, hp: 1500,
    vision: 60, footprint: [26, 20], power: -3, produces: ['china_militia', 'china_rifle', 'china_hj12', 'china_fpv'], tech: ['china_cc'],
    model: { tpl: 'barracks', style: 'china', w: 26, d: 20 },
  }),
  structure({
    id: 'china_armor', name: 'Armor Works', faction: F, roles: ['structure', 'production'], slot: 'factory', cost: 1700, time: 32, hp: 2500,
    vision: 60, footprint: [36, 30], power: -5, tech: ['china_supply'],
    produces: ['china_zbd04', 'china_ztz96', 'china_ztz99', 'china_type15', 'china_plz05', 'china_phl16', 'china_hq17'],
    model: { tpl: 'factory', style: 'china', w: 36, d: 30 },
  }),
  structure({
    id: 'china_airfield', name: 'Airfield', faction: F, roles: ['structure', 'production'], slot: 'airfield', cost: 1300, time: 30, hp: 2000,
    vision: 70, footprint: [60, 40], power: -5, airfield: 6, tech: ['china_armor'],
    produces: ['china_wingloong', 'china_z10', 'china_j16', 'china_j20', 'china_h6n'],
    model: { tpl: 'airfield', style: 'china', w: 60, d: 40 },
  }),
  structure({
    id: 'china_radar', name: 'Radar Array', faction: F, roles: ['structure', 'tech'], slot: 'radar', cost: 900, time: 22, hp: 1200,
    vision: 160, footprint: [20, 20], power: -4, radar: true, tech: ['china_supply'], detector: 60,
    model: { tpl: 'radar', style: 'china', w: 20, d: 20 },
  }),
  structure({
    id: 'china_tech', name: 'Rocket Force HQ', faction: F, roles: ['structure', 'tech'], slot: 'tech', cost: 2400, time: 45, hp: 2600,
    vision: 80, footprint: [32, 28], power: -8, tech: ['china_radar'], unique: true,
    model: { tpl: 'techcenter', style: 'china', w: 32, d: 28 },
  }),
  structure({
    id: 'china_cyber', name: 'Network Warfare Center', faction: F, roles: ['structure', 'tech'], slot: 'cyber', cost: 1400, time: 30, hp: 1500,
    vision: 60, footprint: [24, 22], power: -6, tech: ['china_radar'], jammer: 110,
    model: { tpl: 'cyber', style: 'china', w: 24, d: 22 },
  }),
  structure({
    id: 'china_drone', name: 'Drone Center', faction: F, roles: ['structure', 'production'], slot: 'drone', cost: 1100, time: 26, hp: 1600,
    vision: 70, footprint: [28, 22], power: -4, tech: ['china_radar'], produces: ['china_fpv'],
    model: { tpl: 'armory', style: 'china', w: 28, d: 22 },
  }),
  structure({
    id: 'china_institute', name: 'Research Institute', faction: F, roles: ['structure', 'tech'], slot: 'armory', cost: 1400, time: 28, hp: 1700,
    vision: 60, footprint: [28, 22], power: -3, tech: ['china_barracks'], produces: ['up_china_plating', 'up_china_fire', 'up_china_mobilize'],
    model: { tpl: 'armory', style: 'china', w: 28, d: 22 },
  }),
  structure({
    id: 'china_hq9', name: 'HQ-9 Air Defence', faction: F, roles: ['structure', 'defense'], slot: 'aa', cost: 900, time: 20, hp: 1000, armor: 'hardened',
    vision: 120, footprint: [14, 14], power: -2, tech: ['china_radar'],
    weapons: [weapon({ id: 'hq9', name: 'HQ-9', damage: 125, dtype: 'aa', range: 165, reload: 4.2, salvo: 2, salvoGap: 0.5, speed: 150, targets: ['air'], guided: true, vfx: 'missile', mount: [0, 3, 2] })],
    turret: 3, model: { tpl: 'sam', style: 'china', w: 14, d: 14, tubes: 4 },
  }),
  structure({
    id: 'china_firebase', name: 'Fire Base', faction: F, roles: ['structure', 'defense'], slot: 'defense', cost: 650, time: 16, hp: 1100, armor: 'hardened',
    vision: 100, footprint: [10, 10], power: -2, tech: ['china_barracks'],
    weapons: [
      weapon({ id: 'fb_gun', name: '100mm Gun', damage: 70, dtype: 'ap', range: 62, reload: 1.8, speed: 200, targets: ['ground'], vfx: 'cannon', aoe: 2, mount: [0, 3, 3] }),
      weapon({ id: 'fb_aa', name: 'Twin AA Gun', damage: 8, dtype: 'smallarms', range: 70, reload: 0.1, targets: ['air', 'ground'], vfx: 'bullet', mount: [0, 3, 2] }),
    ],
    turret: 4, model: { tpl: 'gunturret', style: 'china', w: 10, d: 10, barrels: 2 },
  }),
  structure({
    id: 'china_bunker', name: 'Fortified Bunker', faction: F, roles: ['structure', 'defense'], slot: 'bunker', cost: 350, time: 12, hp: 2000, armor: 'hardened',
    vision: 80, footprint: [14, 14], power: 0, tech: ['china_barracks'], garrison: 6,
    model: { tpl: 'bunker', style: 'china', w: 14 },
  }),
  structure({
    id: 'china_df17', name: 'DF-17 Silo', faction: F, roles: ['structure', 'superweapon'], slot: 'super', cost: 5000, time: 70, hp: 3200,
    vision: 80, footprint: [28, 28], power: -12, tech: ['china_tech'], unique: true,
    superweapon: { power: 'china_df17', charge: 360 },
    model: { tpl: 'silo', style: 'china', w: 28, d: 28 },
  }),
];

const units: EntityDef[] = [
  unit({
    id: 'china_dozer', name: 'Construction Dozer', faction: F, roles: ['worker'], cost: 450, time: 11, hp: 440, armor: 'light', radius: 3.4, vision: 60,
    producedBy: 'china_cc', speed: 6.5, move: 'track', model: { tpl: 'dozer', style: 'china' },
    builds: ['china_power', 'china_supply', 'china_barracks', 'china_armor', 'china_airfield', 'china_radar', 'china_tech', 'china_cyber', 'china_drone', 'china_institute', 'china_hq9', 'china_firebase', 'china_bunker', 'china_df17'],
  }),
  unit({
    id: 'china_truck', name: 'Supply Truck', faction: F, roles: ['truck'], cost: 450, time: 11, hp: 440, armor: 'light', radius: 3.2, vision: 50,
    producedBy: 'china_supply', speed: 9, move: 'wheel', cap: 360, model: { tpl: 'truck', style: 'china' },
  }),
  unit({
    id: 'china_militia', name: 'Militia Squad', faction: F, roles: ['infantry', 'militia'], cost: 100, time: 4.5, hp: 130, armor: 'infantry', radius: 1.8, vision: 55, swarm: 6, batch: 3,
    producedBy: 'china_barracks', speed: 4.3, move: 'foot', captures: true, canGarrison: true,
    weapons: [weapon({ id: 'type81', name: 'Type 81', damage: 7, dtype: 'smallarms', range: 22, reload: 0.5, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'china', n: 4, kit: 'rifle', militia: true },
  }),
  unit({
    id: 'china_rifle', name: 'Type-191 Squad', faction: F, roles: ['infantry'], cost: 180, time: 6, hp: 180, armor: 'infantry', radius: 1.8, vision: 60, swarm: 6,
    producedBy: 'china_barracks', speed: 4.2, move: 'foot', captures: true, canGarrison: true,
    weapons: [weapon({ id: 'qbz191', name: 'QBZ-191', damage: 9, dtype: 'smallarms', range: 24, reload: 0.5, targets: ['ground', 'air'], vfx: 'bullet', mount: [0, 1.3, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'china', n: 4, kit: 'rifle' },
  }),
  unit({
    id: 'china_hj12', name: 'HJ-12 Team', faction: F, roles: ['infantry', 'antitank'], cost: 280, time: 9, hp: 140, armor: 'infantry', radius: 1.7, vision: 60,
    producedBy: 'china_barracks', speed: 3.9, move: 'foot', canGarrison: true,
    weapons: [weapon({ id: 'hj12', name: 'HJ-12', damage: 115, dtype: 'missile', range: 50, minRange: 8, reload: 5.5, speed: 80, targets: ['ground'], guided: true, vfx: 'missile', aoe: 3, mount: [0, 1.5, 0.8], fixed: true })],
    model: { tpl: 'infantry', style: 'china', n: 2, kit: 'launcher' },
  }),
  unit({
    id: 'china_fpv', name: 'FPV Drone Handlers', faction: F, roles: ['infantry', 'swarm'], cost: 300, time: 9, hp: 110, armor: 'infantry', radius: 1.7, vision: 70, swarm: 6,
    producedBy: 'china_barracks', speed: 4, move: 'foot', canGarrison: true,
    weapons: [weapon({ id: 'fpv', name: 'FPV Kamikaze Drones', damage: 38, dtype: 'explosive', range: 52, reload: 3.5, salvo: 4, salvoGap: 0.15, speed: 30, arc: 0.1, targets: ['ground'], aoe: 4, vfx: 'swarm', mount: [0, 2, 0.5], fixed: true, spread: 3 })],
    model: { tpl: 'infantry', style: 'china', n: 3, kit: 'laptop' },
  }),
  unit({
    id: 'china_zbd04', name: 'ZBD-04A IFV', faction: F, roles: ['ifv'], cost: 700, time: 13, hp: 880, armor: 'heavy', radius: 4, vision: 80, swarm: 6,
    producedBy: 'china_armor', speed: 6.7, move: 'track', turret: 2.6,
    weapons: [
      weapon({ id: 'zpt99', name: '100mm Gun', damage: 50, dtype: 'ap', range: 46, reload: 2.2, speed: 180, targets: ['ground'], vfx: 'cannon', aoe: 2, mount: [0, 3, 3] }),
      weapon({ id: 'zbd30', name: '30mm Cannon', damage: 10, dtype: 'ap', range: 44, reload: 0.35, targets: ['ground', 'air'], vfx: 'cannon', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'china', len: 7.8, wid: 3.3, turretLen: 2.6, gun: 3.4, ifv: true },
  }),
  unit({
    id: 'china_ztz96', name: 'ZTZ-96B', faction: F, roles: ['tank'], cost: 750, time: 13, hp: 860, armor: 'heavy', radius: 4.4, vision: 75, swarm: 6,
    producedBy: 'china_armor', speed: 5.4, move: 'track', turret: 2.1,
    weapons: [
      weapon({ id: 'zpt98', name: '125mm Gun', damage: 110, dtype: 'ap', range: 54, reload: 3.0, speed: 210, targets: ['ground'], vfx: 'cannon', aoe: 2.5, mount: [0, 3, 5], spread: 2.5 }),
      weapon({ id: 'ztz_mg', name: 'Coaxial MG', damage: 6, dtype: 'smallarms', range: 30, reload: 0.2, targets: ['ground'], vfx: 'bullet', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'china', len: 9, wid: 3.6, turretLen: 3.3, gun: 5, era: true },
  }),
  unit({
    id: 'china_ztz99', name: 'ZTZ-99A', faction: F, roles: ['tank'], cost: 1100, time: 17, hp: 1050, armor: 'heavy', radius: 4.6, vision: 80, aps: 18, swarm: 6,
    producedBy: 'china_armor', speed: 5.2, move: 'track', turret: 2.2, tech: ['china_radar'],
    weapons: [
      weapon({ id: 'zpt98b', name: '125mm Gun', damage: 130, dtype: 'ap', range: 58, reload: 2.8, speed: 230, targets: ['ground'], vfx: 'cannon', aoe: 2.5, mount: [0, 3, 5], spread: 2 }),
      weapon({ id: 'ztz99_mg', name: 'Coaxial MG', damage: 6, dtype: 'smallarms', range: 30, reload: 0.2, targets: ['ground'], vfx: 'bullet', mount: [0.5, 3, 3] }),
    ],
    model: { tpl: 'tank', style: 'china', len: 9.8, wid: 3.8, turretLen: 3.6, gun: 5.4, era: true },
  }),
  unit({
    id: 'china_type15', name: 'Type 15 Light Tank', faction: F, roles: ['tank', 'scout'], cost: 900, time: 14, hp: 720, armor: 'light', radius: 4, vision: 90, swarm: 6,
    producedBy: 'china_armor', speed: 7.2, move: 'track', turret: 2.8,
    weapons: [weapon({ id: 'zpl15', name: '105mm Gun', damage: 100, dtype: 'ap', range: 54, reload: 2.4, speed: 220, targets: ['ground'], vfx: 'cannon', aoe: 2.2, mount: [0, 3, 4], spread: 2 })],
    model: { tpl: 'tank', style: 'china', len: 8.2, wid: 3.3, turretLen: 3, gun: 4.4 },
  }),
  unit({
    id: 'china_plz05', name: 'PLZ-05 Howitzer', faction: F, roles: ['artillery'], cost: 950, time: 17, hp: 540, armor: 'light', radius: 4.2, vision: 70,
    producedBy: 'china_armor', speed: 4.2, move: 'track', turret: 0.7, tech: ['china_supply'],
    weapons: [weapon({ id: 'plz_gun', name: '155mm Howitzer', damage: 165, dtype: 'artillery', range: 145, minRange: 30, reload: 5.8, speed: 110, arc: 0.45, aoe: 10, targets: ['ground'], vfx: 'shell', mount: [0, 3.2, 5], spread: 8 })],
    model: { tpl: 'artillery', style: 'china', len: 9, wid: 3.4, gun: 6.5 },
  }),
  unit({
    id: 'china_phl16', name: 'PHL-16 Rocket Launcher', faction: F, roles: ['mlrs', 'artillery'], cost: 1500, time: 22, hp: 520, armor: 'light', radius: 4, vision: 70,
    producedBy: 'china_armor', speed: 5.6, move: 'wheel', tech: ['china_radar'],
    weapons: [weapon({ id: 'phl16', name: 'A200 Rockets', damage: 60, dtype: 'artillery', range: 230, minRange: 50, reload: 22, salvo: 8, salvoGap: 0.3, speed: 150, arc: 0.55, aoe: 8, targets: ['ground'], vfx: 'rocket', mount: [0, 3.2, -1], spread: 10, fixed: true })],
    model: { tpl: 'mlrs', style: 'china', len: 8.5, wid: 3, tubes: 8 },
  }),
  unit({
    id: 'china_hq17', name: 'HQ-17 Short-Range SAM', faction: F, roles: ['aa'], cost: 700, time: 13, hp: 460, armor: 'light', radius: 3.8, vision: 80,
    producedBy: 'china_armor', speed: 6.2, move: 'wheel', tech: ['china_radar'],
    weapons: [weapon({ id: 'hq17', name: 'HQ-17', damage: 70, dtype: 'aa', range: 90, reload: 3.2, salvo: 2, salvoGap: 0.4, speed: 120, targets: ['air'], guided: true, vfx: 'missile', mount: [0, 4, 0], fixed: true })],
    model: { tpl: 'sam', style: 'china', len: 8, wid: 3, tubes: 4, mobile: true },
  }),
  unit({
    id: 'china_wingloong', name: 'Wing Loong II', faction: F, roles: ['drone', 'heli'], cost: 900, time: 16, hp: 230, armor: 'drone', radius: 3, vision: 120,
    producedBy: 'china_airfield', speed: 24, move: 'drone', layer: 'air', fly: 46, rearm: true, tech: ['china_radar'], detector: 40,
    weapons: [weapon({ id: 'bd7', name: 'BA-7 Missiles', damage: 75, dtype: 'missile', range: 58, reload: 4, salvo: 2, salvoGap: 0.4, speed: 100, targets: ['ground'], guided: true, vfx: 'missile', ammo: 8, aoe: 3, mount: [0, -1, 2], fixed: true })],
    model: { tpl: 'drone', style: 'china', span: 20, len: 9 },
  }),
  unit({
    id: 'china_z10', name: 'Z-10ME Attack Helicopter', faction: F, roles: ['heli'], cost: 1400, time: 20, hp: 720, armor: 'air', radius: 4, vision: 100,
    producedBy: 'china_airfield', speed: 18, move: 'heli', layer: 'air', fly: 16, rearm: true, accel: 24,
    weapons: [
      weapon({ id: 'z10_gun', name: '23mm Cannon', damage: 13, dtype: 'ap', range: 52, reload: 0.2, targets: ['ground', 'air'], vfx: 'cannon', ammo: 80, mount: [0, -1, 4], fixed: true }),
      weapon({ id: 'hj10', name: 'HJ-10 ATGM', damage: 95, dtype: 'missile', range: 64, reload: 5, salvo: 2, salvoGap: 0.4, speed: 100, targets: ['ground'], guided: true, vfx: 'missile', ammo: 8, aoe: 3, mount: [1.5, 0, 2], fixed: true }),
    ],
    model: { tpl: 'heli', style: 'china', len: 14, rotor: 13, attack: true },
  }),
  unit({
    id: 'china_j16', name: 'J-16 Flanker', faction: F, roles: ['fighter', 'bomber'], cost: 2000, time: 26, hp: 700, armor: 'air', radius: 5, vision: 120,
    producedBy: 'china_airfield', speed: 60, move: 'plane', layer: 'air', fly: 70, rearm: true, tech: ['china_radar'],
    weapons: [
      weapon({ id: 'ls500', name: 'LS-500 Guided Bombs', damage: 210, dtype: 'explosive', range: 60, reload: 1.2, salvo: 2, salvoGap: 0.25, targets: ['ground'], vfx: 'bomb', ammo: 6, aoe: 13, fixed: true, mount: [0, -1, 0] }),
      weapon({ id: 'pl12', name: 'PL-12', damage: 135, dtype: 'aa', range: 125, reload: 4, speed: 230, targets: ['air'], guided: true, vfx: 'missile', ammo: 4, fixed: true, mount: [1, -1, 2] }),
    ],
    model: { tpl: 'jet', style: 'china', len: 16, span: 11.5 },
  }),
  unit({
    id: 'china_j20', name: 'J-20 Mighty Dragon', faction: F, roles: ['fighter'], cost: 2400, time: 30, hp: 680, armor: 'air', radius: 5, vision: 130,
    producedBy: 'china_airfield', speed: 64, move: 'plane', layer: 'air', fly: 80, rearm: true, stealth: { detect: 45, reveal: 2, always: true }, tech: ['china_tech'],
    weapons: [
      weapon({ id: 'pl15', name: 'PL-15', damage: 150, dtype: 'aa', range: 140, reload: 3.5, speed: 250, targets: ['air'], guided: true, vfx: 'missile', ammo: 6, fixed: true, mount: [1, -1, 2] }),
      weapon({ id: 'j20_bomb', name: 'Precision Bombs', damage: 200, dtype: 'explosive', range: 60, reload: 1.3, salvo: 2, salvoGap: 0.25, targets: ['ground'], vfx: 'bomb', ammo: 4, aoe: 12, fixed: true, mount: [0, -1, 0] }),
    ],
    model: { tpl: 'jet', style: 'china', len: 20, span: 12.5, stealth: true },
  }),
  unit({
    id: 'china_h6n', name: 'H-6N Bomber', faction: F, roles: ['bomber'], cost: 2800, time: 34, hp: 1000, armor: 'air', radius: 8, vision: 110,
    producedBy: 'china_airfield', speed: 44, move: 'plane', layer: 'air', fly: 90, rearm: true, tech: ['china_tech'],
    weapons: [weapon({ id: 'h6_bombs', name: 'Carpet Bombs', damage: 260, dtype: 'explosive', range: 80, reload: 0.5, salvo: 6, salvoGap: 0.27, targets: ['ground'], vfx: 'bomb', ammo: 12, aoe: 17, fixed: true, structOnly: true, mount: [0, -1, 0] })],
    model: { tpl: 'bomber', style: 'china', len: 26, span: 36 },
  }),
];

export const chinaDefs: EntityDef[] = [...structs, ...units];

export const chinaPowers: PowerDef[] = [
  { id: 'china_humanwave', name: 'Human Wave', desc: 'Mobilise a mass of militia at your base, sent against the target.', faction: F, tier: 1, cost: 1, cooldown: 150, targeted: true, general: 'china_lin', effect: { kind: 'rush', unit: 'china_militia', count: 12, delay: 4 } },
  { id: 'china_tankswarm', name: 'Tank Swarm Rush', desc: 'Free ZTZ-96B tanks roll out and attack-move to the target.', faction: F, tier: 2, cost: 2, cooldown: 240, targeted: true, general: 'china_lin', effect: { kind: 'rush', unit: 'china_ztz96', count: 6, delay: 5 } },
  { id: 'china_overwhelm', name: 'Armoured Overrun', desc: 'A column of ZTZ-99A main battle tanks.', faction: F, tier: 3, cost: 3, cooldown: 330, targeted: true, general: 'china_lin', effect: { kind: 'rush', unit: 'china_ztz99', count: 8, delay: 6 } },
  { id: 'china_repair', name: 'Emergency Repair', desc: 'Repair crews restore units and structures in the area.', faction: F, tier: 1, cost: 1, cooldown: 150, targeted: true, general: 'china_chen', effect: { kind: 'repair', radius: 90, mult: 0.5 } },
  { id: 'china_barrage', name: 'Artillery Barrage', desc: 'Massed howitzers saturate the target area.', faction: F, tier: 2, cost: 2, cooldown: 200, targeted: true, general: 'china_chen', effect: { kind: 'barrage', radius: 55, count: 30, damage: 150, delay: 6, duration: 12, dtype: 'artillery' } },
  { id: 'china_thunder', name: 'Thunder Run Salvo', desc: 'Rocket force salvo over a wide area.', faction: F, tier: 3, cost: 3, cooldown: 300, targeted: true, general: 'china_chen', effect: { kind: 'salvo', radius: 45, count: 14, damage: 330, delay: 7, duration: 5, dtype: 'artillery' } },
  { id: 'china_recon', name: 'Recon Satellite', desc: 'Reveals a large area for 25 seconds.', faction: F, tier: 1, cost: 1, cooldown: 120, targeted: true, general: 'china_wu', effect: { kind: 'reveal', radius: 150, duration: 25 } },
  { id: 'china_airstrike', name: 'Air Force Strike', desc: 'J-16 bombers carpet the target area.', faction: F, tier: 2, cost: 2, cooldown: 180, targeted: true, general: 'china_wu', effect: { kind: 'airstrike', radius: 45, count: 12, damage: 210, delay: 5, duration: 4, dtype: 'explosive' } },
  { id: 'china_rocketforce', name: 'Rocket Force Salvo', desc: 'DF-series missiles hit the target area.', faction: F, tier: 3, cost: 3, cooldown: 320, targeted: true, general: 'china_wu', effect: { kind: 'salvo', radius: 40, count: 10, damage: 420, delay: 7, duration: 4, dtype: 'missile' } },
  { id: 'china_df17', name: 'DF-17 Barrage', desc: 'Three staggered hypersonic missiles over the target.', faction: F, tier: 3, cost: 0, cooldown: 360, targeted: true, effect: { kind: 'salvo', radius: 55, spread: 34, count: 3, damage: 1500, delay: 9, duration: 4, dtype: 'hyper' } },
];

export const chinaGenerals: GeneralDef[] = [
  { id: 'china_lin', name: 'Gen. Lin', faction: F, title: 'Infantry & Swarm', desc: 'Cheaper infantry and tougher militia. Overwhelm the enemy with numbers.', costMul: { infantry: 0.85, militia: 0.8 }, hpMul: { militia: 1.2 }, powers: ['china_humanwave', 'china_tankswarm', 'china_overwhelm'] },
  { id: 'china_chen', name: 'Gen. Chen', faction: F, title: 'Armour & Firepower', desc: 'Cheaper tanks and artillery that hit harder.', costMul: { tank: 0.9, artillery: 0.85 }, dmgMul: { tank: 1.08, artillery: 1.12 }, powers: ['china_repair', 'china_barrage', 'china_thunder'] },
  { id: 'china_wu', name: 'Gen. Wu', faction: F, title: 'Air & Missile Force', desc: 'Cheaper aircraft and missile units.', costMul: { fighter: 0.82, bomber: 0.82, heli: 0.82, mlrs: 0.85 }, hpMul: { fighter: 1.08 }, powers: ['china_recon', 'china_airstrike', 'china_rocketforce'] },
];

export const chinaUpgrades: UpgradeDef[] = [
  { id: 'up_china_plating', name: 'Reactive Plating', desc: 'Vehicles gain +25% armour.', faction: F, cost: 1800, time: 45, roles: ['tank', 'ifv', 'artillery', 'mlrs', 'aa', 'scout', 'worker', 'truck'], hpMul: 1.25, unique: true },
  { id: 'up_china_fire', name: 'Fire Control Upgrade', desc: '+15% damage and +10% range for armour and artillery.', faction: F, cost: 2300, time: 50, roles: ['tank', 'ifv', 'artillery', 'mlrs', 'heli', 'fighter', 'bomber'], dmgMul: 1.15, rangeMul: 1.1, unique: true },
  { id: 'up_china_mobilize', name: 'Mass Mobilisation', desc: 'Infantry gain +30% health.', faction: F, cost: 1200, time: 35, roles: ['infantry', 'militia'], hpMul: 1.3, unique: true },
];
