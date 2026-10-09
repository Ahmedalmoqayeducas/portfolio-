import { MAPS, MapDef, buildMap, spawnIndex } from '../maps/maps';
import { availableFactions, factionGenerals } from '../sim/defs';
import { AI_PERSONALITIES } from '../sim/ai/ai';
import { DEFAULT_OPTIONS, FactionId, GameOptions, PlayerSetup, TEAM_COLORS } from '../sim/types';
import type { SessionSetup } from '../game/session';
import { bakeMapImage } from './mapimage';

type SlotType = 'human' | 'ai' | 'closed';

interface Slot {
  type: SlotType;
  name: string;
  faction: FactionId | 'random';
  general: string;
  color: number;
  team: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'brutal';
  personality: string;
}

const FACTION_NAMES: Record<string, string> = { usa: 'United States', china: 'China', iran: 'Iran', random: 'Random' };

function esc(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!); }

export class Lobby {
  private el: HTMLElement;
  private slots: Slot[] = [];
  private map: MapDef = MAPS[0];
  private opts: GameOptions = { ...DEFAULT_OPTIONS };
  private spectate = false;
  private factions: FactionId[] = availableFactions();
  private previews = new Map<string, HTMLCanvasElement>();

  constructor(root: HTMLElement, private onStart: (s: SessionSetup) => void, private onBack: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'menu-wrap';
    root.appendChild(this.el);
    for (let i = 0; i < 10; i++) {
      const f = this.factions[i % this.factions.length];
      this.slots.push({
        type: i === 0 ? 'human' : i < 2 ? 'ai' : 'closed', name: i === 0 ? 'Commander' : '', faction: i === 0 ? f : 'random', general: 'random',
        color: TEAM_COLORS[i], team: 0, difficulty: 'medium', personality: 'random',
      });
    }
    this.render();
  }

  destroy(): void { this.el.remove(); }

  private activeCount(): number { return this.slots.slice(0, this.map.maxPlayers).filter((s) => s.type !== 'closed').length; }

  private setMap(m: MapDef): void {
    this.map = m;
    // open default AI slots up to a sensible count, close extras
    this.slots.forEach((s, i) => { if (i >= m.maxPlayers) s.type = 'closed'; });
    let open = this.slots.slice(0, m.maxPlayers).filter((s) => s.type !== 'closed').length;
    for (let i = 0; open < m.minPlayers && i < m.maxPlayers; i++) if (this.slots[i].type === 'closed') { this.slots[i].type = 'ai'; open++; }
    this.render();
  }

  private preview(m: MapDef): HTMLCanvasElement {
    let c = this.previews.get(m.id);
    if (!c) { c = bakeMapImage(buildMap(m.id), 300); this.previews.set(m.id, c); }
    return c;
  }

  private drawPreview(canvas: HTMLCanvasElement): void {
    const m = this.map;
    canvas.width = canvas.height = 300;
    const g = canvas.getContext('2d')!;
    g.drawImage(this.preview(m), 0, 0);
    const active = this.slots.slice(0, m.maxPlayers).filter((s) => s.type !== 'closed');
    const n = active.length;
    // spawn markers
    m.spawns.forEach(([x, z]) => {
      const px = (x / m.size + 0.5) * 300, py = (z / m.size + 0.5) * 300;
      g.beginPath(); g.arc(px, py, 5, 0, 7);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
    });
    active.forEach((s, k) => {
      const [x, z] = m.spawns[spawnIndex(m, n, k)];
      const px = (x / m.size + 0.5) * 300, py = (z / m.size + 0.5) * 300;
      g.beginPath(); g.arc(px, py, 9, 0, 7);
      g.fillStyle = '#' + s.color.toString(16).padStart(6, '0'); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#000'; g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), px, py + 0.5);
    });
    m.derricks.forEach(([x, z]) => { g.fillStyle = '#fff'; g.fillRect((x / m.size + 0.5) * 300 - 1, (z / m.size + 0.5) * 300 - 1, 2.5, 2.5); });
    m.depots.forEach(([x, z]) => { g.fillStyle = '#ffd34a'; g.fillRect((x / m.size + 0.5) * 300 - 1.5, (z / m.size + 0.5) * 300 - 1.5, 3, 3); });
  }

  private render(): void {
    const m = this.map;
    const rows = this.slots.slice(0, m.maxPlayers).map((s, i) => this.slotRow(s, i)).join('');
    const mapOpts = MAPS.map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${x.name} (${x.minPlayers}-${x.maxPlayers})</option>`).join('');
    const sel = (id: string, vals: [string, string][], cur: string) => `<select id="${id}">${vals.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    this.el.innerHTML = `
      <div class="lobby">
        <div class="panel"><h2>SKIRMISH</h2>
          <table class="slots"><tr><th></th><th>Slot</th><th>Name</th><th>Army</th><th>General</th><th title="Same number = allies. 0 = alone">Team</th><th>AI level</th><th>AI style</th></tr>${rows}</table>
          <div class="helptext">Players with the same <b>team number</b> fight together. Leave it at <b>0</b> to play alone (free-for-all). Up to 10 players on the biggest map.</div>
        </div>
        <div class="panel"><h2>MAP</h2>
          <select id="map" style="width:100%;margin-bottom:8px;background:#0c1218;color:#dfe8f0;border:1px solid rgba(160,200,230,.2);padding:6px;font-size:16px">${mapOpts}</select>
          <canvas class="preview" id="pv"></canvas>
          <div class="mapdesc">${esc(m.desc)}</div>
          <div class="opt">
            <label>Starting credits</label>${sel('o-cr', [['5000', '$5,000'], ['10000', '$10,000'], ['20000', '$20,000'], ['50000', '$50,000']], String(this.opts.startCredits))}
            <label>Game speed</label>${sel('o-sp', [['0.75', 'Slow'], ['1', 'Normal'], ['1.5', 'Fast'], ['2', 'Very fast']], String(this.opts.speed))}
            <label>Unit cap (per player)</label>${sel('o-cap', [['0', 'Unlimited'], ['100', '100'], ['200', '200'], ['400', '400']], String(this.opts.unitCap))}
            <label>Fog of war</label><input id="o-fog" type="checkbox" ${this.opts.fog ? 'checked' : ''}>
            <label>Superweapons</label><input id="o-sw" type="checkbox" ${this.opts.superweapons ? 'checked' : ''}>
            <label>Start with base</label><input id="o-ts" type="checkbox" ${this.opts.techStart ? 'checked' : ''}>
            <label>Spectate (AI vs AI)</label><input id="o-spec" type="checkbox" ${this.spectate ? 'checked' : ''}>
          </div>
          <div class="row-btns"><button class="big" id="bk">Back</button><button class="big" id="go">Start</button></div>
        </div>
      </div>`;
    const q = <T extends HTMLElement>(id: string) => this.el.querySelector(id) as T;
    this.drawPreview(q<HTMLCanvasElement>('#pv'));
    q<HTMLSelectElement>('#map').onchange = (e) => this.setMap(MAPS.find((x) => x.id === (e.target as HTMLSelectElement).value)!);
    q('#bk').onclick = () => this.onBack();
    q('#go').onclick = () => this.start();
    const bind = (id: string, fn: (v: string, c: boolean) => void) => { const e = q<HTMLInputElement>(id); e.onchange = () => { fn(e.value, e.checked); }; };
    bind('#o-cr', (v) => (this.opts.startCredits = Number(v)));
    bind('#o-sp', (v) => (this.opts.speed = Number(v)));
    bind('#o-cap', (v) => (this.opts.unitCap = Number(v)));
    bind('#o-fog', (_v, c) => (this.opts.fog = c));
    bind('#o-sw', (_v, c) => (this.opts.superweapons = c));
    bind('#o-ts', (_v, c) => (this.opts.techStart = c));
    bind('#o-spec', (_v, c) => { this.spectate = c; this.render(); });
    this.el.querySelectorAll<HTMLElement>('[data-slot]').forEach((row) => {
      const i = Number(row.dataset.slot);
      const s = this.slots[i];
      const on = (sel: string, fn: (v: string) => void, rerender = true) => {
        const e = row.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
        if (e) e.onchange = () => { fn(e.value); if (rerender) this.render(); else this.drawPreview(q<HTMLCanvasElement>('#pv')); };
      };
      on('.s-type', (v) => {
        s.type = v as SlotType;
        if (s.type === 'human') this.slots.forEach((o, j) => { if (j !== i && o.type === 'human') o.type = 'ai'; });
        if (this.activeCount() < 2) { /* keep at least two */ }
      });
      on('.s-name', (v) => (s.name = v.slice(0, 18)), false);
      on('.s-fac', (v) => { s.faction = v as FactionId; s.general = 'random'; });
      on('.s-gen', (v) => (s.general = v), false);
      on('.s-team', (v) => (s.team = Math.max(0, Math.min(10, Number(v) || 0))), false);
      on('.s-dif', (v) => (s.difficulty = v as Slot['difficulty']), false);
      on('.s-per', (v) => (s.personality = v), false);
      (row.querySelector('.sw') as HTMLElement | null)?.addEventListener('click', () => {
        let c = TEAM_COLORS.indexOf(s.color);
        for (let k = 1; k <= TEAM_COLORS.length; k++) {
          const cand = TEAM_COLORS[(c + k) % TEAM_COLORS.length];
          if (!this.slots.some((o, j) => j !== i && o.type !== 'closed' && o.color === cand)) { s.color = cand; break; }
        }
        this.render();
      });
    });
  }

  private slotRow(s: Slot, i: number): string {
    const closed = s.type === 'closed';
    const facs = [...this.factions.map((f) => [f, FACTION_NAMES[f]] as [string, string]), ['random', 'Random'] as [string, string]];
    const opt = (list: [string, string][], cur: string) => list.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
    const gens = s.faction === 'random' ? [] : factionGenerals(s.faction);
    const genList: [string, string][] = [['random', 'Random'], ...gens.map((g) => [g.id, `${g.name} — ${g.title}`] as [string, string])];
    const types: [string, string][] = [['human', 'Human'], ['ai', 'AI'], ['closed', 'Closed']];
    const isAI = s.type === 'ai';
    const name = s.type === 'human' ? s.name : isAI ? 'Computer' : '';
    return `<tr class="${closed ? 'closed' : ''}" data-slot="${i}">
      <td><div class="sw" style="background:#${s.color.toString(16).padStart(6, '0')}"></div></td>
      <td><select class="s-type">${opt(types, s.type)}</select></td>
      <td>${s.type === 'human' ? `<input class="s-name" value="${esc(name)}">` : `<span style="color:var(--dim)">${name}</span>`}</td>
      <td>${closed ? '' : `<select class="s-fac">${opt(facs, s.faction)}</select>`}</td>
      <td>${closed ? '' : `<select class="s-gen">${opt(genList, s.general)}</select>`}</td>
      <td>${closed ? '' : `<input class="s-team" type="number" min="0" max="10" value="${s.team}">`}</td>
      <td>${isAI ? `<select class="s-dif">${opt([['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['brutal', 'Brutal']], s.difficulty)}</select>` : ''}</td>
      <td>${isAI ? `<select class="s-per">${opt([['random', 'Random'], ...AI_PERSONALITIES.map((p) => [p.id, p.name] as [string, string])], s.personality)}</select>` : ''}</td></tr>`;
  }

  private start(): void {
    const m = this.map;
    const active = this.slots.slice(0, m.maxPlayers).filter((s) => s.type !== 'closed');
    if (active.length < 2) { alert('Need at least two players.'); return; }
    const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const players: PlayerSetup[] = [];
    let viewer = -1;
    active.forEach((s, k) => {
      const faction = (s.faction === 'random' ? rnd(this.factions) : s.faction) as FactionId;
      const gens = factionGenerals(faction);
      const general = s.general === 'random' || !gens.find((g) => g.id === s.general) ? rnd(gens).id : s.general;
      const gname = gens.find((g) => g.id === general)!.name;
      const human = s.type === 'human' && !this.spectate;
      if (human) viewer = k;
      players.push({
        slot: k, name: human ? s.name || 'Commander' : gname + (s.type === 'human' ? '' : ''), faction, general, color: s.color, teamLabel: s.team,
        ai: human ? null : { difficulty: s.difficulty, personality: s.personality === 'random' || s.type === 'human' ? rnd(AI_PERSONALITIES).id : s.personality },
      });
    });
    this.onStart({ map: m.id, players, options: { ...this.opts, viewer } });
  }
}
