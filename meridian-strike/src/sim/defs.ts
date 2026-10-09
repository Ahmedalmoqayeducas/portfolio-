import type { EntityDef, FactionId, GeneralDef, PowerDef, UpgradeDef } from './types';
import { neutralDefs } from './data/neutral';
import { usaDefs, usaGenerals, usaPowers, usaUpgrades } from './data/usa';

/** Registry. All gameplay numbers live in ./data/*. Index order is stable on both threads. */
const allDefs: EntityDef[] = [...neutralDefs, ...usaDefs];
const allPowers: PowerDef[] = [...usaPowers];
const allGenerals: GeneralDef[] = [...usaGenerals];
const allUpgrades: UpgradeDef[] = [...usaUpgrades];

export function registerFaction(defs: EntityDef[], powers: PowerDef[], generals: GeneralDef[], upgrades: UpgradeDef[]): void {
  allDefs.push(...defs); allPowers.push(...powers); allGenerals.push(...generals); allUpgrades.push(...upgrades);
  rebuild();
}

export let DEF_LIST: EntityDef[] = [];
export const DEFS = new Map<string, EntityDef>();
export const DEF_INDEX = new Map<string, number>();
export const POWERS = new Map<string, PowerDef>();
export const GENERALS = new Map<string, GeneralDef>();
export const UPGRADES = new Map<string, UpgradeDef>();
export const SLOTS = new Map<string, Map<string, string>>();

function rebuild(): void {
  DEF_LIST = [...allDefs].sort((a, b) => (a.id < b.id ? -1 : 1));
  DEFS.clear(); DEF_INDEX.clear(); POWERS.clear(); GENERALS.clear(); UPGRADES.clear(); SLOTS.clear();
  DEF_LIST.forEach((d, i) => {
    DEFS.set(d.id, d);
    DEF_INDEX.set(d.id, i);
    if (d.slot && d.faction !== 'neutral') {
      let m = SLOTS.get(d.faction);
      if (!m) SLOTS.set(d.faction, (m = new Map()));
      // first structure with a slot wins; others get slot2/slot3 keys
      let key = d.slot;
      while (m.has(key)) key += '+';
      m.set(key, d.id);
    }
  });
  for (const p of allPowers) POWERS.set(p.id, p);
  for (const g of allGenerals) GENERALS.set(g.id, g);
  for (const u of allUpgrades) UPGRADES.set(u.id, u);
}
rebuild();

export function def(id: string): EntityDef {
  const d = DEFS.get(id);
  if (!d) throw new Error(`unknown def ${id}`);
  return d;
}

export function factionGenerals(f: FactionId): GeneralDef[] {
  return [...GENERALS.values()].filter((g) => g.faction === f);
}
export function availableFactions(): FactionId[] {
  const out: FactionId[] = [];
  for (const f of ['usa', 'china', 'iran'] as FactionId[]) if (SLOTS.has(f)) out.push(f);
  return out;
}
export function slotDef(f: FactionId, slot: string): string | undefined {
  return SLOTS.get(f)?.get(slot);
}
/** Primary production structure for a unit (for AI) */
export function role(d: EntityDef, r: string): boolean {
  return d.roles.includes(r as never);
}
