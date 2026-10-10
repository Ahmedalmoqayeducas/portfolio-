import type { GameSession } from '../game/session';
import type { Mode } from '../game/input';
import { Minimap } from './minimap';
import { skillClass, skillLines, VET_NAMES } from '../sim/skills';
import { getIcon } from './icons';
import { DEF_LIST, DEFS, GENERALS, POWERS, UPGRADES } from '../sim/defs';
import type { EntityDef, PlayerInfo, SimEvent, Snapshot, Stance } from '../sim/types';
import { saveSettings } from '../game/engine';
import type { EntView } from '../render/entities';

interface Card {
  key: string;
  label: string;
  icon?: string;
  glyph?: string;
  sub?: string;
  badge?: string;
  locked?: string;
  enabled: boolean;
  tip: string;
  active?: boolean;
  progress?: number;
  cb: (e: MouseEvent | null) => void;
  right?: () => void;
}

const GRID_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V', 'B', 'N'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const fmt = (n: number) => n.toLocaleString('en-US');
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hud {
  readonly root: HTMLDivElement;
  private top: HTMLDivElement;
  private alertsEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private selPanel: HTMLDivElement;
  private cmdPanel: HTMLDivElement;
  private queueEl: HTMLDivElement;
  private cardsEl: HTMLDivElement;
  private powersEl: HTMLDivElement;
  private tipEl: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private modal: HTMLDivElement | null = null;
  private minimap: Minimap;
  private cards: Card[] = [];
  private cardSig = '';
  private selSig = '';
  private snap: Snapshot | null = null;
  private me: PlayerInfo | null = null;
  private lastAlert: { x: number; z: number } | null = null;
  private lastRefresh = 0;
  private toastTimer = 0;
  private paused = false;
  private spectator: boolean;
  private mmWrap: HTMLDivElement;
  private powSig = '';
  private obsEl: HTMLDivElement | null = null;
  private intro = false;

  constructor(private s: GameSession) {
    this.spectator = s.viewer < 0;
    let root = document.getElementById('hud') as HTMLDivElement | null;
    if (!root) { root = el('div', '', document.body); root.id = 'hud'; }
    root.innerHTML = '';
    this.root = root;
    this.top = el('div', '', root); this.top.id = 'topbar';
    this.alertsEl = el('div', '', root); this.alertsEl.id = 'alerts';
    this.toastEl = el('div', '', root); this.toastEl.id = 'toast';
    this.mmWrap = el('div', '', root); this.mmWrap.id = 'mm-panel';
    this.minimap = new Minimap(s, this.mmWrap);
    this.selPanel = el('div', '', root); this.selPanel.id = 'sel-panel';
    this.cmdPanel = el('div', '', root); this.cmdPanel.id = 'cmd-panel';
    this.queueEl = el('div', '', this.cmdPanel); this.queueEl.id = 'queue-strip';
    this.cardsEl = el('div', '', this.cmdPanel); this.cardsEl.id = 'cards';
    this.powersEl = el('div', '', root); this.powersEl.id = 'powers-panel';
    this.tipEl = el('div', '', root); this.tipEl.id = 'tooltip';
    this.flashEl = el('div', '', root); this.flashEl.id = 'flash';
    if (this.spectator) {
      this.cmdPanel.style.display = 'none'; this.selPanel.style.display = 'none'; this.powersEl.style.display = 'none';
      this.obsEl = el('div', '', root); this.obsEl.id = 'obs-panel';
    }
    this.buildTop();
  }

  dispose(): void { this.root.innerHTML = ''; }

  // ------------------------------------------------------------------ top bar
  private buildTop(): void {
    const t = this.top;
    t.innerHTML = `
      <div class="tb-left"><span id="tb-name"></span></div>
      <div class="tb-mid">
        <div class="tb-cell" title="Credits"><span class="ico">$</span><b id="tb-cr">0</b><small id="tb-inc"></small></div>
        <div class="tb-cell" title="Power produced / used"><span class="ico">⚡</span><div class="pbar"><i id="tb-pw"></i></div><b id="tb-pwt">0/0</b></div>
        <div class="tb-cell" title="Command points"><span class="ico">★</span><b id="tb-cp">0</b><small id="tb-rank"></small></div>
      </div>
      <div class="tb-right">
        <span id="tb-time">0:00</span>
        <button id="tb-slow" title="Slower">−</button><span id="tb-speed">1.0x</span><button id="tb-fast" title="Faster">+</button>
        <button id="tb-pause">❚❚</button><button id="tb-menu">☰</button>
      </div>`;
    (t.querySelector('#tb-slow') as HTMLElement).onclick = () => this.changeSpeed(-1);
    (t.querySelector('#tb-fast') as HTMLElement).onclick = () => this.changeSpeed(1);
    (t.querySelector('#tb-pause') as HTMLElement).onclick = () => this.togglePause();
    (t.querySelector('#tb-menu') as HTMLElement).onclick = () => this.togglePause();
    if (this.spectator) (t.querySelector('.tb-mid') as HTMLElement).style.display = 'none';
  }

  private changeSpeed(dir: number): void {
    const steps = [0.5, 1, 1.5, 2, 3, 5, 8];
    let i = steps.findIndex((v) => Math.abs(v - this.s.speed) < 0.01);
    if (i < 0) i = 1;
    i = Math.max(0, Math.min(steps.length - 1, i + dir));
    this.s.setSpeed(steps[i]);
    (this.top.querySelector('#tb-speed') as HTMLElement).textContent = steps[i].toFixed(1) + 'x';
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.s.setPaused(this.paused);
    if (this.paused) this.openPauseMenu(); else this.closeModal();
  }

  // ------------------------------------------------------------------ snapshot
  onSnapshot(snap: Snapshot): void {
    this.snap = snap;
    if (!this.intro && !this.spectator && snap.n > 0) {
      const dz = [...this.s.entities.views.values()].find((v) => v.owner === this.s.viewer && DEF_LIST[v.def].builds);
      if (dz) {
        this.intro = true;
        this.s.selection.add(dz.id);
        this.selectionChanged();
        window.setTimeout(() => this.toast('Build with the selected Dozer. Select structures to train units. Esc = menu'), 800);
      }
    }
    this.me = this.s.viewer >= 0 ? snap.players[this.s.viewer] : null;
    this.updateTop(snap);
    const now = performance.now();
    if (now - this.lastRefresh > 160) {
      this.lastRefresh = now;
      this.refreshSelection();
      this.refreshPowers();
      if (this.spectator) this.refreshObs(snap);
    }
  }

  private updateTop(snap: Snapshot): void {
    const q = (id: string) => this.top.querySelector(id) as HTMLElement;
    q('#tb-time').textContent = mmss(snap.time);
    const me = this.me;
    if (!me) return;
    q('#tb-name').textContent = `${me.name} · ${me.faction.toUpperCase()}`;
    q('#tb-cr').textContent = fmt(me.credits);
    q('#tb-inc').textContent = me.income > 0 ? `+${me.income.toFixed(0)}/s` : '';
    const ratio = me.powerUse <= 0 ? 1 : Math.min(1, me.powerProd / me.powerUse);
    const pw = q('#tb-pw'); pw.style.width = Math.max(4, ratio * 100) + '%';
    pw.style.background = ratio < 1 ? '#ff4a3a' : '#5fe28a';
    q('#tb-pwt').textContent = `${me.powerUse}/${me.powerProd}`;
    q('#tb-cp').textContent = String(me.cp);
    q('#tb-rank').textContent = `Rank ${me.rank + 1}  ${me.xp}/${me.nextXp}`;
  }

  // ------------------------------------------------------------------ selection
  selectionChanged(): void { this.selSig = ''; this.cardSig = ''; this.refreshSelection(); this.updateTooltipHide(); }

  private views(): EntView[] {
    const out: EntView[] = [];
    for (const id of this.s.selection) { const v = this.s.entities.views.get(id); if (v) out.push(v); }
    return out;
  }

  private refreshSelection(): void {
    if (this.spectator) return;
    const vs = this.views();
    const me = this.me;
    const sig = vs.map((v) => `${v.id}:${Math.round(v.hp * 20)}:${v.flags & 4}`).join(',') + '|' + (me ? Math.floor(me.credits / 50) : 0);
    if (sig !== this.selSig) { this.selSig = sig; this.renderSelPanel(vs); }
    this.buildCards(vs);
  }

  private color(owner: number): number { return this.s.setup.players[owner]?.color ?? 0xffffff; }

  private renderSelPanel(vs: EntView[]): void {
    const p = this.selPanel;
    if (!vs.length) { p.innerHTML = '<div class="sel-empty">No selection</div>'; p.classList.add('empty'); return; }
    p.classList.remove('empty');
    const groups = new Map<number, EntView[]>();
    for (const v of vs) { const a = groups.get(v.def) ?? []; a.push(v); groups.set(v.def, a); }
    let html = '';
    if (vs.length === 1) {
      const v = vs[0], d = DEF_LIST[v.def];
      const own = v.owner === this.s.viewer;
      const owner = v.owner >= 0 ? this.s.setup.players[v.owner]?.name : 'Neutral';
      html += `<div class="sel-single"><img src="${getIcon(d.id, this.color(v.owner))}" /><div class="sel-info"><div class="sel-name">${d.name}${v.vet ? ' ' + '★'.repeat(v.vet) : ''}</div><div class="sel-owner">${owner}</div>`;
      html += `<div class="hpbar"><i style="width:${Math.max(2, v.hp * 100)}%;background:${v.hp > 0.5 ? '#5fe28a' : v.hp > 0.25 ? '#ffd24a' : '#ff4a3a'}"></i></div>`;
      html += `<div class="sel-stats">`;
      if (d.kind === 'unit') html += `<span>Speed ${d.speed}</span><span>Vision ${d.vision}</span>`;
      if (d.kind === 'structure' && d.power) html += `<span>Power ${d.power > 0 ? '+' : ''}${d.power}</span>`;
      if (d.garrison) html += `<span>Garrison ${v.cargo | 0}/${d.garrison}</span>`;
      if (d.cap) html += `<span>Cargo ${Math.round(v.cargo * d.cap)}/${d.cap}</span>`;
      if (v.ammo < 1 && d.rearm) html += `<span>Ammo ${Math.round(v.ammo * 100)}%</span>`;
      if (v.flags & 4) html += `<span>Building ${Math.round(v.prog * 100)}%</span>`;
      if (v.flags & 16) html += `<span style="color:#7ad2ff">DISABLED</span>`;
      html += `</div>`;
      if (d.kind === 'unit' && d.cost > 0) {
        const cls = skillClass(d), lines = skillLines(cls);
        const got = lines.slice(0, v.vet).map((l, i) => `<div><b>${'★'.repeat(i + 1)}</b> ${l}</div>`).join('');
        const next = v.vet < 3 ? `<div class="next">Next (${VET_NAMES[v.vet + 1]}): ${lines[v.vet]}</div>` : '';
        html += `<div class="sel-vet"><div class="rank">${VET_NAMES[v.vet]}</div>${got}${next}</div>`;
      }
      if (d.weapons && own) html += `<div class="sel-weapons">${d.weapons.map((w) => `${w.name}: ${w.damage} dmg · ${w.range}m`).join('<br>')}</div>`;
      html += `</div></div>`;
    } else {
      html += `<div class="sel-grid">`;
      for (const [defIdx, list] of groups) {
        const d = DEF_LIST[defIdx];
        const avg = list.reduce((s, v) => s + v.hp, 0) / list.length;
        html += `<div class="sel-tile" data-def="${defIdx}" title="${d.name}"><img src="${getIcon(d.id, this.color(list[0].owner))}" /><b>${list.length}</b><i style="width:${Math.max(3, avg * 100)}%;background:${avg > 0.5 ? '#5fe28a' : avg > 0.25 ? '#ffd24a' : '#ff4a3a'}"></i></div>`;
      }
      html += `</div>`;
    }
    p.innerHTML = html;
    p.querySelectorAll<HTMLElement>('.sel-tile').forEach((t) => {
      t.onclick = (e) => {
        const defIdx = Number(t.dataset.def);
        const ids = vs.filter((v) => v.def === defIdx).map((v) => v.id);
        if (e.shiftKey) for (const id of ids) this.s.selection.delete(id);
        else { this.s.selection.clear(); for (const id of ids) this.s.selection.add(id); }
        this.selectionChanged();
      };
    });
  }

  // ------------------------------------------------------------------ command card
  private queueFor(id: number) { return this.snap?.queues.find((q) => q.id === id); }

  private buildCards(vs: EntView[]): void {
    const me = this.me;
    if (!me || this.spectator) return;
    const own = vs.filter((v) => v.owner === this.s.viewer);
    const cards: Card[] = [];
    const structs = own.filter((v) => DEF_LIST[v.def].kind === 'structure');
    const units = own.filter((v) => DEF_LIST[v.def].kind === 'unit');
    const have = (id: string) => this.countHave(id);
    const color = this.color(this.s.viewer);

    const prodCard = (defId: string, i: number, sid: number): Card => {
      const up = UPGRADES.get(defId);
      const d = DEFS.get(defId);
      const queue = this.queueFor(sid);
      const inQ = queue ? queue.items.filter((q) => q.def === defId).reduce((n, q) => n + q.count, 0) : 0;
      let cost = up ? up.cost : this.costOf(d!);
      if (d?.batch && d.batch > 1) cost = Math.round(cost * d.batch * 0.9);
      let locked = '';
      if (up) { if (me.upgrades.includes(up.id)) locked = 'Researched'; }
      else if (d) {
        const miss = d.tech?.filter((t) => !have(t));
        if (miss && miss.length) locked = 'Requires ' + miss.map((t) => DEFS.get(t)?.name ?? t).join(', ');
      }
      const afford = me.credits >= cost;
      const name = up ? up.name : d!.name + (d?.batch && d.batch > 1 ? ` ×${d.batch}` : '');
      const tip = up
        ? `<b>${up.name}</b><br>${up.desc}<br>Cost $${cost} · ${up.time}s`
        : `<b>${name}</b><br>Cost $${cost} · ${d!.time}s${d!.weapons ? '<br>' + d!.weapons.map((w) => `${w.name} ${w.damage}dmg ${w.range}m`).join('<br>') : ''}<br>HP ${d!.hp} · ${d!.armor}${locked ? `<br><span style="color:#ff8a7a">${locked}</span>` : ''}`;
      return {
        key: GRID_KEYS[i] ?? '', label: name, icon: up ? undefined : getIcon(defId, color), glyph: up ? '⬆' : undefined, sub: '$' + fmt(cost), badge: inQ ? String(inQ) : undefined,
        locked: locked || undefined, enabled: !locked && afford, tip,
        cb: (e) => { this.s.command({ t: 'produce', structure: sid, def: defId, count: e?.shiftKey ? 5 : 1 }); this.s.audio.ui('click'); this.cardSig = ''; },
        right: () => { const q = this.queueFor(sid); if (!q) return; for (let k = q.items.length - 1; k >= 0; k--) if (q.items[k].def === defId) { this.s.command({ t: 'cancel', structure: sid, index: k }); break; } },
      };
    };

    const dozers = units.filter((v) => DEF_LIST[v.def].builds);
    if (structs.length === 1 && !units.length) {
      const sv = structs[0], sd = DEF_LIST[sv.def];
      if (sd.produces) sd.produces.forEach((id, i) => cards.push(prodCard(id, i, sv.id)));
      if (sd.produces) cards.push({ key: 'Y', label: 'Rally', glyph: '⚑', enabled: true, tip: '<b>Set rally point</b> (Y)<br>Or right-click the ground.', cb: () => this.s.input.setMode({ k: 'rally' }) });
      if (sd.superweapon) {
        const sw = this.snap?.supers.find((x) => x.id === sv.id);
        cards.push({ key: 'T', label: 'Launch', glyph: '☢', sub: sw ? (sw.ready ? 'READY' : Math.round(sw.charge * 100) + '%') : '', enabled: !!sw?.ready, tip: '<b>' + sd.name + '</b><br>Fire when charged.', progress: sw?.charge, cb: () => { const pd = POWERS.get(sd.superweapon!.power)!; this.s.input.setMode({ k: 'power', id: pd.id, radius: pd.effect.radius ?? 40 }); } });
      }
      if (sd.garrison && sv.cargo > 0) cards.push({ key: 'U', label: 'Evacuate', glyph: '⇥', enabled: true, tip: '<b>Evacuate garrison</b>', cb: () => this.s.command({ t: 'unload', id: sv.id }) });
      if (sd.prop !== true) cards.push({ key: 'Delete', label: 'Sell', glyph: '$', sub: '50%', enabled: true, tip: '<b>Sell structure</b><br>Refund 50% of its cost (Delete).', cb: () => { this.s.command({ t: 'sell', id: sv.id }); this.s.selection.clear(); this.selectionChanged(); } });
    } else if (dozers.length && dozers.length === units.length && !structs.length) {
      const bd = DEF_LIST[dozers[0].def];
      bd.builds!.forEach((id, i) => {
        const d = DEFS.get(id)!;
        const cost = this.costOf(d);
        const miss = d.tech?.filter((t) => !have(t)) ?? [];
        let locked = miss.length ? 'Requires ' + miss.map((t) => DEFS.get(t)?.name ?? t).join(', ') : '';
        if (d.unique && have(id)) locked = 'Limit reached';
        const tip = `<b>${d.name}</b><br>Cost $${cost} · ${d.time}s${d.power ? '<br>Power ' + (d.power > 0 ? '+' : '') + d.power : ''}<br>HP ${d.hp}${locked ? `<br><span style="color:#ff8a7a">${locked}</span>` : ''}`;
        cards.push({ key: GRID_KEYS[i] ?? '', label: d.name, icon: getIcon(id, color), sub: '$' + fmt(cost), enabled: !locked && me.credits >= cost, locked: locked || undefined, tip, cb: () => this.s.input.setMode({ k: 'place', def: id }), active: this.s.input.mode.k === 'place' && (this.s.input.mode as { def: string }).def === id });
      });
      cards.push({ key: 'T', label: 'Repair', glyph: '🔧', enabled: true, tip: '<b>Repair structure</b> (T)', cb: () => this.s.input.setMode({ k: 'repair' }) });
      cards.push({ key: 'G', label: 'Stop', glyph: '■', enabled: true, tip: '<b>Stop</b> (G)', cb: () => this.s.input.stop() });
    } else if (units.length) {
      const defs = units.map((v) => DEF_LIST[v.def]);
      const armed = defs.some((d) => d.weapons?.length);
      const air = defs.some((d) => d.layer === 'air');
      cards.push({ key: 'A', label: 'Attack Move', glyph: '⚔', enabled: armed, tip: '<b>Attack-move</b> (A)<br>Engage anything on the way.', active: this.s.input.mode.k === 'amove', cb: () => this.s.input.setMode({ k: 'amove' }) });
      cards.push({ key: 'S', label: 'Stop', glyph: '■', enabled: true, tip: '<b>Stop</b> (S)', cb: () => this.s.input.stop() });
      cards.push({ key: 'D', label: 'Scatter', glyph: '✳', enabled: !air, tip: '<b>Scatter</b> (D)', cb: () => this.s.command({ t: 'scatter', ids: units.map((v) => v.id) }) });
      cards.push({ key: 'F', label: 'Patrol', glyph: '↔', enabled: !air, tip: '<b>Patrol</b> (F)', cb: () => this.s.input.setMode({ k: 'patrol' }) });
      if (defs.some((d) => d.captures)) cards.push({ key: 'Q', label: 'Capture', glyph: '⚑', enabled: true, tip: '<b>Capture</b> (Q)<br>Click an enemy/neutral structure.', cb: () => this.s.input.setMode({ k: 'capture' }) });
      if (defs.some((d) => d.canGarrison)) cards.push({ key: 'W', label: 'Garrison', glyph: '⌂', enabled: true, tip: '<b>Garrison</b> (W)<br>Click a building.', cb: () => this.s.input.setMode({ k: 'garrison' }) });
      if (defs.some((d) => d.deploy)) cards.push({ key: 'E', label: defs.find((d) => d.deploy)!.deploy === 'stealth' ? 'Hide' : 'Dig in', glyph: '◐', enabled: true, tip: '<b>Deploy / Hide</b> (E)<br>Stealth, but cannot move.', cb: () => this.s.command({ t: 'deploy', ids: units.map((v) => v.id) }) });
      if (defs.some((d) => d.cyber)) cards.push({ key: 'R', label: 'Hack', glyph: '⌬', enabled: true, tip: '<b>Cyber intrusion</b> (R)<br>Right-click a vehicle or structure.', cb: () => this.s.input.setMode({ k: 'amove' }) });
      const st = (key: string, label: string, glyph: string, stance: Stance) => cards.push({ key, label, glyph, enabled: armed, tip: `<b>${label}</b> (${key})`, cb: () => this.s.input.stance(stance), active: false });
      st('Z', 'Aggressive', '▲', 'aggressive'); st('X', 'Guard', '◆', 'guard'); st('C', 'Hold Position', '▣', 'hold'); st('V', 'Hold Fire', '⊘', 'holdfire');
    }

    // signature to avoid DOM churn
    const sig = cards.map((c) => `${c.key}${c.label}${c.badge ?? ''}${c.enabled ? 1 : 0}${c.locked ?? ''}${c.active ? 1 : 0}${Math.round((c.progress ?? 0) * 100)}`).join('|');
    this.cards = cards;
    // queue strip for single production structure
    this.renderQueue(structs.length === 1 && !units.length ? structs[0] : null);
    if (sig === this.cardSig) return;
    this.cardSig = sig;
    this.renderCards();
  }

  private costOf(d: EntityDef): number {
    const g = this.me ? GENERALS.get(this.me.general) : undefined;
    let m = 1;
    if (g?.costMul) for (const r of d.roles) if (g.costMul[r] !== undefined) m = Math.min(m, g.costMul[r]);
    return Math.round(d.cost * m);
  }

  private countHave(id: string): number {
    let n = 0;
    for (const v of this.s.entities.views.values()) if (v.owner === this.s.viewer && DEF_LIST[v.def].id === id && !(v.flags & 4)) n++;
    return n;
  }

  private renderCards(): void {
    const box = this.cardsEl;
    box.innerHTML = '';
    for (const c of this.cards) {
      const b = el('button', 'card' + (c.enabled ? '' : ' disabled') + (c.locked ? ' locked' : '') + (c.active ? ' active' : ''), box);
      b.innerHTML = `${c.icon ? `<img src="${c.icon}"/>` : `<span class="glyph">${c.glyph ?? ''}</span>`}<span class="ck">${c.key === 'Delete' ? 'Del' : c.key}</span>${c.badge ? `<span class="cb">${c.badge}</span>` : ''}<span class="cs">${c.sub ?? ''}</span>${c.locked ? '<span class="lock">🔒</span>' : ''}${c.progress !== undefined ? `<i class="cprog" style="width:${c.progress * 100}%"></i>` : ''}`;
      b.onclick = (e) => { if (c.enabled) c.cb(e); else if (c.locked) this.s.audio.ui('error'); };
      b.oncontextmenu = (e) => { e.preventDefault(); c.right?.(); };
      b.onmouseenter = () => this.showTip(c.tip, b);
      b.onmouseleave = () => this.updateTooltipHide();
    }
  }

  private showTip(html: string, anchor: HTMLElement): void {
    const r = anchor.getBoundingClientRect();
    this.tipEl.innerHTML = html;
    this.tipEl.style.display = 'block';
    this.tipEl.style.left = Math.max(8, Math.min(window.innerWidth - 270, r.left - 120)) + 'px';
    this.tipEl.style.top = Math.max(8, r.top - this.tipEl.offsetHeight - 10) + 'px';
  }
  private updateTooltipHide(): void { this.tipEl.style.display = 'none'; }

  private renderQueue(sv: EntView | null): void {
    const q = this.queueEl;
    if (!sv) { q.innerHTML = ''; q.style.display = 'none'; return; }
    const info = this.queueFor(sv.id);
    if (!info || !info.items.length) { q.innerHTML = ''; q.style.display = 'none'; return; }
    q.style.display = 'flex';
    q.innerHTML = info.items.map((it, i) => {
      const d = DEFS.get(it.def);
      const up = UPGRADES.get(it.def);
      const icon = d ? getIcon(d.id, this.color(this.s.viewer)) : '';
      return `<div class="qi" data-i="${i}" title="Click to cancel"><img src="${icon}"/>${up ? '<span class="glyph">⬆</span>' : ''}<i style="width:${i === 0 ? it.p * 100 : 0}%"></i>${it.count > 1 ? `<b>×${it.count}</b>` : ''}</div>`;
    }).join('');
    q.querySelectorAll<HTMLElement>('.qi').forEach((n) => { n.onclick = () => { this.s.command({ t: 'cancel', structure: sv.id, index: Number(n.dataset.i) }); this.cardSig = ''; }; });
  }

  pressKey(code: string): boolean {
    if (this.paused) return false;
    const key = code === 'Delete' || code === 'Backspace' ? 'Delete' : code;
    const c = this.cards.find((cc) => cc.key.toUpperCase() === key.toUpperCase());
    if (!c) return false;
    if (c.enabled) c.cb(null); else this.s.audio.ui('error');
    return true;
  }

  modeChanged(_m: Mode): void { this.cardSig = ''; }

  // ------------------------------------------------------------------ generals' powers
  private refreshPowers(): void {
    if (this.spectator || !this.me) return;
    const me = this.me;
    const g = GENERALS.get(me.general);
    if (!g) return;
    const sig = `${me.cp}|${me.unlocked.join()}|${Object.entries(me.powerCd).map(([k, v]) => k + Math.ceil(v)).join()}|${this.snap?.supers.map((x) => `${x.id}${Math.round(x.charge * 50)}${x.ready}`).join()}|${this.s.input.mode.k}`;
    if (sig === this.powSig) return;
    this.powSig = sig;
    let html = `<div class="pw-head">${g.name}<small>${g.title}</small></div>`;
    for (const id of g.powers) {
      const pd = POWERS.get(id)!;
      const unlocked = me.unlocked.includes(id);
      const cd = me.powerCd[id] ?? 0;
      let state = '', cls = '';
      if (!unlocked) { state = me.cp >= pd.cost ? `Unlock ${pd.cost}★` : `${pd.cost}★`; cls = me.cp >= pd.cost ? 'unlockable' : 'locked'; }
      else if (cd > 0) { state = mmss(cd); cls = 'cooling'; }
      else { state = 'READY'; cls = 'ready'; }
      html += `<button class="pw ${cls}" data-id="${id}" data-t="${pd.tier}"><b>${pd.name}</b><small>T${pd.tier} · ${state}</small></button>`;
    }
    for (const sw of this.snap?.supers ?? []) {
      const pd = POWERS.get(sw.power)!;
      html += `<button class="pw super ${sw.ready ? 'ready' : 'cooling'}" data-id="${sw.power}" data-super="1"><b>${pd.name}</b><small>${sw.ready ? 'LAUNCH' : Math.round(sw.charge * 100) + '%'}</small><i style="width:${sw.charge * 100}%"></i></button>`;
    }
    this.powersEl.innerHTML = html;
    this.powersEl.querySelectorAll<HTMLButtonElement>('.pw').forEach((b) => {
      const id = b.dataset.id!;
      const pd = POWERS.get(id)!;
      b.onmouseenter = () => this.showTip(`<b>${pd.name}</b><br>${pd.desc}<br>Cooldown ${pd.cooldown}s`, b);
      b.onmouseleave = () => this.updateTooltipHide();
      b.onclick = () => {
        if (b.dataset.super) { if (b.classList.contains('ready')) this.s.input.setMode({ k: 'power', id, radius: pd.effect.radius ?? 60 }); return; }
        if (b.classList.contains('unlockable')) { this.s.command({ t: 'unlock', power: id }); this.powSig = ''; }
        else if (b.classList.contains('ready')) this.s.input.setMode({ k: 'power', id, radius: pd.effect.radius ?? 40 });
        else this.s.audio.ui('error');
      };
    });
  }

  // ------------------------------------------------------------------ observer
  private refreshObs(snap: Snapshot): void {
    if (!this.obsEl) return;
    let html = '<table><tr><th></th><th>Player</th><th>$</th><th>Units</th><th>Bldgs</th><th>Kills</th></tr>';
    for (const p of snap.players) {
      html += `<tr class="${p.alive ? '' : 'dead'}"><td><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i></td><td>${p.name}${p.teamLabel ? ' [' + p.teamLabel + ']' : ''}</td><td>${fmt(p.credits)}</td><td>${p.units}</td><td>${p.structures}</td><td>${p.kills}</td></tr>`;
    }
    this.obsEl.innerHTML = html + '</table>';
  }

  // ------------------------------------------------------------------ feed
  alert(ev: Extract<SimEvent, { k: 'alert' }>): void {
    if (ev.owner !== this.s.viewer && ev.type !== 'super') return;
    const colors: Record<string, string> = { attack: '#ff6a5a', built: '#7dff9a', ready: '#9ad0ff', lost: '#ff9a4a', capture: '#ffd24a', super: '#ff4aff', power: '#ffd24a', low: '#ffd24a' };
    const msg: Record<string, string> = { attack: 'Under attack!', built: `${ev.text ?? 'Structure'} complete`, ready: `${ev.text ?? 'Unit'} ready`, lost: `${ev.text ?? 'Structure'} destroyed`, capture: `${ev.text ?? 'Structure'} captured`, super: ev.text ?? 'Superweapon', power: `${ev.text ?? 'Rank up'} — command points available`, low: 'Low power' };
    if (ev.type === 'ready' && Math.random() < 0.5) return;
    const d = el('div', 'al', this.alertsEl, msg[ev.type] ?? ev.type);
    d.style.color = colors[ev.type] ?? '#fff';
    setTimeout(() => d.remove(), 6000);
    while (this.alertsEl.children.length > 5) this.alertsEl.firstChild?.remove();
    if (ev.x || ev.z) {
      if (ev.type === 'attack' || ev.type === 'lost') { this.lastAlert = { x: ev.x, z: ev.z }; this.minimap.ping(ev.x, ev.z); }
      if (ev.type === 'super') this.minimap.ping(ev.x, ev.z, '#ff4aff');
    }
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.opacity = '0'), 2200);
  }

  flash(v: number): void { this.flashEl.style.opacity = String(Math.min(1, v)); }

  jumpToAlert(): void {
    if (this.lastAlert) { this.s.rts.target.x = this.lastAlert.x; this.s.rts.target.z = this.lastAlert.z; }
  }
  centerOnBase(): void {
    const me = this.me; if (!me) return;
    for (const v of this.s.entities.views.values()) if (v.owner === this.s.viewer && DEF_LIST[v.def].slot === 'cc') { this.s.rts.target.set(v.x, v.y, v.z); return; }
  }

  frame(dt: number): void { this.minimap.update(dt); if (this.snap && this.s.hover === 0 && false) this.flash(0); }

  // ------------------------------------------------------------------ modals
  private closeModal(): void { this.modal?.remove(); this.modal = null; }

  private openPauseMenu(): void {
    this.closeModal();
    const m = el('div', 'modal', this.root);
    this.modal = m;
    const st = this.s.engine.settings;
    m.innerHTML = `<div class="mbox"><h2>Paused</h2>
      <div class="mrow"><button id="pm-resume" class="big">Resume</button></div>
      <div class="mrow"><label>Graphics</label><select id="pm-q"><option>low</option><option>medium</option><option>high</option><option>ultra</option></select></div>
      <div class="mrow"><label>Resolution scale</label><input id="pm-res" type="range" min="0.5" max="1.25" step="0.05" value="${st.resolution}"></div>
      <div class="mrow"><label>Shadows</label><input id="pm-sh" type="checkbox" ${st.shadows ? 'checked' : ''}></div>
      <div class="mrow"><label>Master volume</label><input id="pm-mv" type="range" min="0" max="1" step="0.05" value="${st.masterVolume}"></div>
      <div class="mrow"><label>Music</label><input id="pm-mu" type="range" min="0" max="1" step="0.05" value="${st.musicVolume}"></div>
      <div class="mrow"><label>Effects</label><input id="pm-sf" type="range" min="0" max="1" step="0.05" value="${st.sfxVolume}"></div>
      <div class="mrow"><label>Voice lines</label><input id="pm-vo" type="checkbox" ${st.voice ? 'checked' : ''}></div>
      <div class="mrow"><label>Edge scrolling</label><input id="pm-ep" type="checkbox" ${st.edgePan ? 'checked' : ''}></div>
      <div class="mrow"><button id="pm-replay" class="big">Save replay</button></div>
      <div class="mrow"><button id="pm-quit" class="big danger">Quit to menu</button></div></div>`;
    const q = (id: string) => m.querySelector(id) as HTMLInputElement;
    (q('#pm-q') as unknown as HTMLSelectElement).value = st.quality;
    const apply = () => {
      st.quality = (q('#pm-q') as unknown as HTMLSelectElement).value as typeof st.quality;
      st.resolution = Number(q('#pm-res').value); st.shadows = q('#pm-sh').checked;
      st.masterVolume = Number(q('#pm-mv').value); st.musicVolume = Number(q('#pm-mu').value); st.sfxVolume = Number(q('#pm-sf').value);
      st.voice = q('#pm-vo').checked; st.edgePan = q('#pm-ep').checked;
      this.s.rts.edgePan = st.edgePan;
      this.s.applyQuality(); this.s.audio.applySettings(st); saveSettings(st);
    };
    m.querySelectorAll('input,select').forEach((n) => n.addEventListener('change', apply));
    q('#pm-resume').onclick = () => this.togglePause();
    q('#pm-replay').onclick = () => { void this.s.saveReplay(); };
    q('#pm-quit').onclick = () => { this.s.onExit?.(); };
  }

  showEnd(snap: Snapshot): void {
    this.closeModal();
    const me = this.s.viewer;
    const won = !!snap.winner?.includes(me);
    const m = el('div', 'modal', this.root);
    this.modal = m;
    let rows = '';
    for (const p of snap.players) rows += `<tr class="${snap.winner?.includes(p.id) ? 'win' : ''}"><td><i style="background:#${p.color.toString(16).padStart(6, '0')}"></i>${p.name}</td><td>${p.kills}</td><td>${p.losses}</td><td>${fmt(p.spent)}</td><td>${p.rank + 1}</td></tr>`;
    m.innerHTML = `<div class="mbox end ${won ? 'victory' : 'defeat'}"><h1>${me < 0 ? 'Match over' : won ? 'VICTORY' : 'DEFEAT'}</h1><div class="sub">${mmss(snap.time)}</div>
      <table><tr><th>Player</th><th>Kills</th><th>Losses</th><th>Spent</th><th>Rank</th></tr>${rows}</table>
      <div class="mrow"><button id="en-watch" class="big">Keep watching</button><button id="en-replay" class="big">Save replay</button><button id="en-quit" class="big">Main menu</button></div></div>`;
    (m.querySelector('#en-replay') as HTMLElement).onclick = () => { void this.s.saveReplay(); };
    (m.querySelector('#en-watch') as HTMLElement).onclick = () => this.closeModal();
    (m.querySelector('#en-quit') as HTMLElement).onclick = () => this.s.onExit?.();
  }
}
