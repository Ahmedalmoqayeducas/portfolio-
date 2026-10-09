import type { EntityDef } from '../types';
import { structure } from './helpers';

export const neutralDefs: EntityDef[] = [
  structure({
    id: 'n_depot', name: 'Supply Depot', faction: 'neutral', roles: ['resource', 'structure'], cost: 0, time: 0, hp: 1e9, vision: 0,
    footprint: [12, 12], prop: true, supply: 22000, model: { tpl: 'supplypile', w: 12, d: 12 },
  }),
  structure({
    id: 'n_derrick', name: 'Oil Derrick', faction: 'neutral', roles: ['structure', 'economy'], cost: 0, time: 0, hp: 900, vision: 40,
    footprint: [10, 10], income: 6, noPower: true, model: { tpl: 'derrick', w: 10, d: 10 },
  }),
  structure({
    id: 'civ_house', name: 'Civilian House', faction: 'neutral', roles: ['structure', 'civilian'], cost: 150, time: 0, hp: 900, vision: 30,
    footprint: [14, 12], garrison: 4, noPower: true, model: { tpl: 'civ', kind: 'house', w: 14, d: 12 },
  }),
  structure({
    id: 'civ_shop', name: 'Civilian Shop', faction: 'neutral', roles: ['structure', 'civilian'], cost: 200, time: 0, hp: 1300, vision: 30,
    footprint: [18, 14], garrison: 6, noPower: true, model: { tpl: 'civ', kind: 'shop', w: 18, d: 14 },
  }),
  structure({
    id: 'civ_tower', name: 'Office Tower', faction: 'neutral', roles: ['structure', 'civilian'], cost: 400, time: 0, hp: 2400, vision: 40,
    footprint: [16, 16], garrison: 8, noPower: true, model: { tpl: 'civ', kind: 'tower', w: 16, d: 16 },
  }),
  structure({
    id: 'civ_warehouse', name: 'Warehouse', faction: 'neutral', roles: ['structure', 'civilian'], cost: 250, time: 0, hp: 1700, vision: 30,
    footprint: [26, 16], garrison: 8, noPower: true, model: { tpl: 'civ', kind: 'warehouse', w: 26, d: 16 },
  }),
];
