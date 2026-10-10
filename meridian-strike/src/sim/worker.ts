/// <reference lib="webworker" />
import { Sim } from './sim';
import { HeightField } from '../maps/heightfield';
import { MAP_BY_ID } from '../maps/maps';
import { Command, CommandLogEntry, DT, InitMsg, SimEvent } from './types';

type In =
  | { t: 'init'; init: InitMsg }
  | { t: 'cmd'; pid: number; cmd: Command }
  | { t: 'speed'; v: number }
  | { t: 'pause'; v: boolean }
  | { t: 'viewer'; v: number }
  | { t: 'getLog' };

let sim: Sim | null = null;
let speed = 1;
let paused = false;
let accum = 0;
let last = 0;
let postCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let events: SimEvent[] = [];
let log: CommandLogEntry[] = [];
let replay: CommandLogEntry[] | null = null;
let replayIdx = 0;

function loop(): void {
  if (!sim) return;
  const now = performance.now();
  const elapsed = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (paused) return;
  accum += elapsed * speed;
  let steps = 0;
  while (accum >= DT && steps < 8) {
    if (replay) while (replayIdx < replay.length && replay[replayIdx].t <= sim.tick + 1) { const c = replay[replayIdx++]; sim.queueCommand(c.pid, c.cmd); }
    sim.step();
    for (const e of sim.events) events.push(e);
    accum -= DT;
    steps++;
  }
  if (accum > DT * 8) accum = 0;
  if (steps > 0) {
    sim.events = events;
    const snap = sim.snapshot(1);
    // include fog every third post to save bandwidth
    if (postCount++ % 3 !== 0) delete snap.fog;
    const transfer: Transferable[] = [snap.ents.buffer as ArrayBuffer, snap.proj.buffer as ArrayBuffer];
    if (snap.fog) transfer.push(snap.fog.buffer as ArrayBuffer);
    (self as unknown as Worker).postMessage({ t: 'snap', snap }, transfer);
    events = [];
    sim.events = [];
  }
}

self.onmessage = (e: MessageEvent<In>) => {
  const m = e.data;
  switch (m.t) {
    case 'init': {
      const def = MAP_BY_ID[m.init.map];
      const hf = new HeightField(def.size, def.res, m.init.heights);
      sim = new Sim(m.init, hf);
      log = []; replay = m.init.replay ?? null; replayIdx = 0;
      speed = m.init.options.speed;
      last = performance.now();
      if (timer) clearInterval(timer);
      timer = setInterval(loop, 8);
      (self as unknown as Worker).postMessage({ t: 'ready' });
      break;
    }
    case 'cmd': if (sim && !replay) { log.push({ t: sim.tick + 1, pid: m.pid, cmd: m.cmd }); sim.queueCommand(m.pid, m.cmd); } break;
    case 'getLog': (self as unknown as Worker).postMessage({ t: 'log', log, tick: sim?.tick ?? 0 }); break;
    case 'speed': speed = m.v; break;
    case 'pause': paused = m.v; last = performance.now(); break;
    case 'viewer': if (sim) { sim.options.viewer = m.v; sim.viewTeam = m.v >= 0 ? sim.players[m.v]?.team ?? 0 : -1; } break;
  }
};
