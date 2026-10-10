import type { EntityDef, ModelSpec, Role, WeaponDef, FactionId, ArmorClass } from '../types';

export type WeaponInit = Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'damage' | 'dtype' | 'range' | 'reload'>;

export function weapon(w: WeaponInit): WeaponDef {
  return { speed: 0, targets: ['ground'], vfx: 'bullet', ...w };
}

interface UnitInit {
  id: string;
  name: string;
  faction: FactionId;
  roles: Role[];
  cost: number;
  time: number;
  hp: number;
  armor: ArmorClass;
  radius: number;
  vision: number;
  producedBy: string;
  tech?: string[];
  speed: number;
  move: EntityDef['move'];
  model: ModelSpec;
  turn?: number;
  accel?: number;
  layer?: 'ground' | 'air';
  fly?: number;
  weapons?: WeaponDef[];
  turret?: number;
  [k: string]: unknown;
}

export function unit(u: UnitInit): EntityDef {
  const air = u.layer === 'air';
  return {
    kind: 'unit',
    layer: air ? 'air' : 'ground',
    turn: u.move === 'foot' ? 9 : u.move === 'wheel' ? 2.4 : u.move === 'track' ? 1.8 : air ? 1.6 : 3,
    accel: u.speed * 1.6,
    ...u,
  } as EntityDef;
}

interface StructInit {
  id: string;
  name: string;
  faction: FactionId | 'neutral';
  roles: Role[];
  cost: number;
  time: number;
  hp: number;
  armor?: ArmorClass;
  radius?: number;
  vision: number;
  footprint: [number, number];
  model: ModelSpec;
  [k: string]: unknown;
}

export function structure(s: StructInit): EntityDef {
  return {
    kind: 'structure',
    armor: 'structure',
    radius: Math.max(s.footprint[0], s.footprint[1]) / 2,
    layer: 'ground',
    ...s,
  } as EntityDef;
}
