import './ui/styles.css';
import { Engine, saveSettings } from './game/engine';
import { GameSession, SessionSetup } from './game/session';
import { Lobby } from './ui/lobby';
import { availableFactions, factionGenerals } from './sim/defs';
import { DEFAULT_OPTIONS, FactionId, PlayerSetup, TEAM_COLORS } from './sim/types';
import { AI_PERSONALITIES } from './sim/ai/ai';
import { MAP_BY_ID } from './maps/maps';
import { DEF_LIST } from './sim/defs';

const params = new URLSearchParams(location.search);
const engine = new Engine(document.body, params.has('shot'));
engine.canvas.style.visibility = 'hidden';

const screen = document.createElement('div');
screen.id = 'screen';
document.body.appendChild(screen);
const hud = document.createElement('div');
hud.id = 'hud';
document.body.appendChild(hud);
const perfEl = document.createElement('div');
perfEl.id = 'perf';
document.body.appendChild(perfEl);

import { runGallery } from './gallery';
let session: GameSession | null = null;
let lobby: Lobby | null = null;

function showLoading(text = 'LOADING'): () => void {
  const d = document.createElement('div');
  d.className = 'loading';
  d.textContent = text;
  document.body.appendChild(d);
  return () => d.remove();
}

function menuHtml(): string {
  return `<div class="menu-bg"></div><div class="menu-grid"></div>
    <div class="menu-wrap">
      <h1 class="logo">MERIDIAN <span>STRIKE</span></h1>
      <div class="tag">MODERN COMBINED-ARMS WARFARE · 2026</div>
      <div class="menu-btns">
        <button id="m-skirmish">SKIRMISH</button>
        <button id="m-quick">QUICK MATCH</button>
        <button id="m-watch">WATCH AI BATTLE</button>
        <button id="m-controls">CONTROLS</button>
      </div>
      <div class="foot">Local build · original assets · procedural graphics &amp; audio</div>
    </div>`;
}

function showMenu(): void {
  session?.dispose();
  session = null;
  lobby?.destroy();
  lobby = null;
  engine.canvas.style.visibility = 'hidden';
  hud.innerHTML = '';
  perfEl.textContent = '';
  screen.className = 'on';
  screen.innerHTML = menuHtml();
  (screen.querySelector('#m-skirmish') as HTMLElement).onclick = showLobby;
  (screen.querySelector('#m-quick') as HTMLElement).onclick = () => startGame(quickMatch(false));
  (screen.querySelector('#m-watch') as HTMLElement).onclick = () => startGame(quickMatch(true));
  (screen.querySelector('#m-controls') as HTMLElement).onclick = showControls;
}

function showControls(): void {
  screen.innerHTML = `<div class="menu-bg"></div><div class="menu-wrap"><div class="panel" style="max-width:760px;line-height:1.7">
    <h2 style="margin-top:0;color:var(--acc);letter-spacing:.2em">CONTROLS</h2>
    <b>Camera</b> — WASD / arrows / screen edge · Q E or middle mouse: rotate · wheel: zoom · Shift: fast · Space: last alert · Alt+H: base<br>
    <b>Select</b> — click, drag box, double-click = same type on screen, Shift add/remove · Ctrl+1-9 assign group, 1-9 recall (twice = centre) · Ctrl+A all units<br>
    <b>Orders</b> — right-click: move / attack / capture / garrison / harvest / repair · A + click: attack-move · S stop · D scatter · F patrol · Q capture · W garrison · E deploy · Z X C V stances<br>
    <b>Build</b> — select a Dozer, pick a structure from the command card, click to place (Shift = keep placing)<br>
    <b>Production</b> — select a structure: Q W E R / A S D F / Z X C V on the command card · Shift = ×5 · right-click an item to cancel · Y = rally<br>
    <b>Powers</b> — unlock with command points (★) on the right panel, then click the target; superweapon buttons appear when charged<br>
    <b>Misc</b> — Esc: menu / cancel · ~ : performance overlay · Delete: sell<br>
    <div class="row-btns"><button class="big" id="c-back">Back</button></div></div></div>`;
  (screen.querySelector('#c-back') as HTMLElement).onclick = showMenu;
}

function showLobby(): void {
  screen.innerHTML = '<div class="menu-bg"></div><div class="menu-grid"></div>';
  lobby = new Lobby(screen, (s) => startGame(s), showMenu);
}

function quickMatch(spectate: boolean): SessionSetup {
  const facs = availableFactions();
  const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const mapIds = ['red_mesa', 'harbor_line', 'oasis_crown'];
  const map = rnd(mapIds);
  const n = 4;
  const players: PlayerSetup[] = [];
  for (let i = 0; i < n; i++) {
    const f = (i === 0 ? rnd(facs) : facs[(i + Math.floor(Math.random() * 3)) % facs.length]) as FactionId;
    const g = rnd(factionGenerals(f));
    const human = i === 0 && !spectate;
    players.push({
      slot: i, name: human ? 'Commander' : g.name, faction: f, general: g.id, color: TEAM_COLORS[i], teamLabel: 0,
      ai: human ? null : { difficulty: 'medium', personality: rnd(AI_PERSONALITIES).id },
    });
  }
  return { map, players, options: { ...DEFAULT_OPTIONS, viewer: spectate ? -1 : 0 } };
}

async function startGame(setup: SessionSetup): Promise<void> {
  const done = showLoading('DEPLOYING');
  await new Promise((r) => setTimeout(r, 30));
  lobby?.destroy();
  lobby = null;
  try {
    session?.dispose();
    session = new GameSession(engine, setup, { local: params.has('local') });
    session.onExit = showMenu;
    await session.start();
    screen.className = '';
    screen.innerHTML = '';
    engine.canvas.style.visibility = 'visible';
    (window as unknown as Record<string, unknown>).__session = session;
    (window as unknown as Record<string, unknown>).__mods = { DEF_LIST };
  } catch (e) {
    console.error(e);
    alert('Failed to start: ' + (e as Error).message);
    showMenu();
  } finally {
    done();
  }
}

// ---- URL shortcuts for testing: ?auto=1&map=red_mesa&n=4&spectate=1&q=low&speed=4&t=12&human=1
if (params.has('q')) { engine.settings.quality = params.get('q') as typeof engine.settings.quality; saveSettings(engine.settings); }
if (params.has('gallery')) {
  engine.canvas.style.visibility = 'visible';
  runGallery(engine, params.get('gallery') || 'usa', 0x3d7bff);
} else if (params.has('auto')) {
  const facs = availableFactions();
  const map = params.get('map') ?? 'red_mesa';
  const def = MAP_BY_ID[map];
  const n = Math.min(def.maxPlayers, Number(params.get('n') ?? 2));
  const spectate = params.has('spectate');
  const teams = (params.get('teams') ?? '').split(',').map(Number);
  const players: PlayerSetup[] = [];
  for (let i = 0; i < n; i++) {
    const f = (params.get('f' + i) as FactionId) ?? facs[i % facs.length];
    const gens = factionGenerals(f);
    const human = i === 0 && !spectate;
    players.push({
      slot: i, name: human ? 'Commander' : gens[i % gens.length].name, faction: f, general: gens[i % gens.length].id, color: TEAM_COLORS[i], teamLabel: teams[i] || 0,
      ai: human ? null : { difficulty: (params.get('diff') as 'easy') ?? 'hard', personality: AI_PERSONALITIES[i % AI_PERSONALITIES.length].id },
    });
  }
  void startGame({
    map, players, seed: Number(params.get('seed') ?? 7),
    options: { ...DEFAULT_OPTIONS, viewer: spectate ? -1 : 0, speed: Number(params.get('speed') ?? 1), fog: !params.has('nofog'), techStart: params.has('base'), startCredits: Number(params.get('cr') ?? 10000) },
  });
} else showMenu();
