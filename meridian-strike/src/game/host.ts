import { Sim } from '../sim/sim';
import { HeightField } from '../maps/heightfield';
import { MAP_BY_ID } from '../maps/maps';
import { Command, CommandLogEntry, DT, InitMsg, SimEvent, Snapshot } from '../sim/types';

export interface SimHost {
  start(init: InitMsg): Promise<void>;
  command(pid: number, cmd: Command): void;
  setSpeed(v: number): void;
  setPaused(v: boolean): void;
  setViewer(v: number): void;
  getLog(): Promise<CommandLogEntry[]>;
  onSnapshot: ((s: Snapshot) => void) | null;
  dispose(): void;
}

export class WorkerHost implements SimHost {
  onSnapshot: ((s: Snapshot) => void) | null = null;
  private worker: Worker;
  private ready: (() => void) | null = null;
  private logWaiters: ((l: CommandLogEntry[]) => void)[] = [];
  constructor() {
    this.worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'ready') this.ready?.();
      else if (m.t === 'snap') this.onSnapshot?.(m.snap as Snapshot);
      else if (m.t === 'log') { for (const w of this.logWaiters.splice(0)) w(m.log as CommandLogEntry[]); }
    };
  }
  start(init: InitMsg): Promise<void> {
    return new Promise((res) => {
      this.ready = res;
      this.worker.postMessage({ t: 'init', init: { ...init, heights: init.heights.slice() } });
    });
  }
  command(pid: number, cmd: Command): void { this.worker.postMessage({ t: 'cmd', pid, cmd }); }
  setSpeed(v: number): void { this.worker.postMessage({ t: 'speed', v }); }
  setPaused(v: boolean): void { this.worker.postMessage({ t: 'pause', v }); }
  setViewer(v: number): void { this.worker.postMessage({ t: 'viewer', v }); }
  getLog(): Promise<CommandLogEntry[]> { return new Promise((res) => { this.logWaiters.push(res); this.worker.postMessage({ t: 'getLog' }); }); }
  dispose(): void { this.worker.terminate(); }
}

/** Same protocol on the main thread (debugging / fallback: ?local). */
export class LocalHost implements SimHost {
  onSnapshot: ((s: Snapshot) => void) | null = null;
  sim: Sim | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private speed = 1;
  private paused = false;
  private accum = 0;
  private last = 0;
  private events: SimEvent[] = [];
  private post = 0;
  private log: CommandLogEntry[] = [];
  private replay: CommandLogEntry[] | null = null;
  private replayIdx = 0;
  async start(init: InitMsg): Promise<void> {
    const def = MAP_BY_ID[init.map];
    this.sim = new Sim(init, new HeightField(def.size, def.res, init.heights));
    this.speed = init.options.speed;
    this.replay = init.replay ?? null;
    this.last = performance.now();
    this.timer = setInterval(() => this.loop(), 8);
  }
  private loop(): void {
    const sim = this.sim!;
    const now = performance.now();
    const el = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) return;
    this.accum += el * this.speed;
    let steps = 0;
    while (this.accum >= DT && steps < 6) {
      if (this.replay) while (this.replayIdx < this.replay.length && this.replay[this.replayIdx].t <= sim.tick + 1) { const c = this.replay[this.replayIdx++]; sim.queueCommand(c.pid, c.cmd); }
      sim.step(); this.events.push(...sim.events); this.accum -= DT; steps++; }
    if (this.accum > DT * 6) this.accum = 0;
    if (steps) {
      sim.events = this.events;
      const snap = sim.snapshot(1);
      if (this.post++ % 3 !== 0) delete snap.fog;
      this.events = []; sim.events = [];
      this.onSnapshot?.(snap);
    }
  }
  command(pid: number, cmd: Command): void { if (this.sim && !this.replay) { this.log.push({ t: this.sim.tick + 1, pid, cmd }); this.sim.queueCommand(pid, cmd); } }
  async getLog(): Promise<CommandLogEntry[]> { return this.log; }
  setSpeed(v: number): void { this.speed = v; }
  setPaused(v: boolean): void { this.paused = v; this.last = performance.now(); }
  setViewer(v: number): void { if (this.sim) { this.sim.options.viewer = v; this.sim.viewTeam = v >= 0 ? this.sim.players[v]?.team ?? 0 : -1; } }
  dispose(): void { if (this.timer) clearInterval(this.timer); }
}
