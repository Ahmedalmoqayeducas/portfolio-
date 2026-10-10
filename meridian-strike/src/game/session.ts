import * as THREE from 'three';
import { buildMap, BuiltMap, spawnIndex } from '../maps/maps';
import { DEF_LIST } from '../sim/defs';
import { VET_NAMES } from '../sim/skills';
import { DT, GameOptions, InitMsg, PlayerSetup, SimEvent, Snapshot, Command } from '../sim/types';
import { Terrain } from '../render/terrain';
import { Environment } from '../render/environment';
import { PostStack } from '../render/post';
import { makeProps } from '../render/props';
import { Vfx } from '../render/vfx';
import { EntityRenderer } from '../render/entities';
import { prebuildModels } from '../render/models';
import { setupFog, updateFog, fog } from '../render/fog';
import { RtsCamera } from '../engine/rtsCamera';
import { PerfOverlay } from '../ui/perf';
import { Engine } from './engine';
import { LocalHost, SimHost, WorkerHost } from './host';
import { InputController } from './input';
import { Hud } from '../ui/hud';
import { Weather } from '../render/weather';
import { AudioSystem } from '../audio/audio';

export interface SessionSetup {
  replay?: import('../sim/types').CommandLogEntry[];
  map: string;
  players: PlayerSetup[];
  options: GameOptions;
  seed?: number;
}

export class GameSession {
  readonly scene = new THREE.Scene();
  readonly built: BuiltMap;
  readonly terrain: Terrain;
  readonly env: Environment;
  readonly post: PostStack;
  readonly rts: RtsCamera;
  readonly vfx: Vfx;
  readonly entities: EntityRenderer;
  readonly weather: Weather;
  readonly audio: AudioSystem;
  readonly perf: PerfOverlay;
  host: SimHost;
  hud!: Hud;
  input!: InputController;
  snap: Snapshot | null = null;
  readonly selection = new Set<number>();
  hover = 0;
  hour: number;
  paused = false;
  speed: number;
  ended = false;
  private pixelRatio = 1;
  private running = false;
  private raf = 0;
  private lastT = 0;
  private time = 0;
  private lastBake = 0;
  private snapCount = 0;
  private warnRings: { x: number; z: number; r: number; until: number; next: number }[] = [];
  onExit: (() => void) | null = null;
  onEnd: ((snap: Snapshot) => void) | null = null;
  readonly viewer: number;
  simSeed = 0;

  constructor(readonly engine: Engine, readonly setup: SessionSetup, opts: { local?: boolean } = {}) {
    const r = engine.renderer;
    this.viewer = setup.options.viewer;
    this.built = buildMap(setup.map);
    const def = this.built.def;
    this.speed = setup.options.speed;
    this.hour = def.hour;
    this.terrain = new Terrain(this.built, r, engine.settings.quality);
    this.scene.add(this.terrain.group);
    if (this.terrain.water) this.scene.add(this.terrain.water);
    this.rts = new RtsCamera(engine.canvas, this.terrain);
    this.rts.edgePan = engine.settings.edgePan;
    this.env = new Environment(r, this.scene, this.rts.camera, def);
    this.env.setupMaterial(this.terrain.mesh.material as THREE.Material);
    if (this.terrain.water) this.env.setupMaterial(this.terrain.water.material as THREE.Material);
    const props = makeProps(this.built, this.terrain);
    this.scene.add(props.group);
    for (const m of props.materials) this.env.setupMaterial(m);
    this.vfx = new Vfx(this.terrain, this.scene);
    this.entities = new EntityRenderer(this.terrain, this.vfx, (m) => this.env.setupMaterial(m), this.scene);
    this.entities.viewer = this.viewer;
    this.entities.playerColors = setup.players.map((p) => p.color);
    this.weather = new Weather(this.scene, def.weather, this.rts.camera);
    this.post = new PostStack(r, this.scene, this.rts.camera);
    this.perf = new PerfOverlay(r);
    this.audio = new AudioSystem(engine.settings);
    this.audio.setViewer(this.viewer);
    this.audio.mood = setup.players[Math.max(0, this.viewer)]?.faction ?? 'usa';
    this.host = opts.local ? new LocalHost() : new WorkerHost();
    this.host.onSnapshot = (s) => this.onSnapshot(s);

    setupFog(def.size, Math.ceil(def.size / 8), setup.options.fog && this.viewer >= 0);

    // camera start
    const n = setup.players.length;
    const idx = this.viewer >= 0 ? spawnIndex(def, n, this.viewer) : -1;
    const [sx, sz] = idx >= 0 ? def.spawns[idx] : [0, 0];
    this.rts.target.set(sx, this.terrain.heightAt(sx, sz), sz);
    this.rts.setView(idx >= 0 ? 150 : 520, idx >= 0 ? Math.atan2(sx, sz) + Math.PI : 0.6);
    this.applyQuality();
    this.env.setHour(this.hour);
    this.vfx.setDaylight(this.env.daylight);
    this.vfx.setSun(this.env.sun, this.env.daylight);
    window.addEventListener('resize', this.onResize);
  }

  applyQuality(): void {
    const s = this.engine.settings;
    const r = this.post.setPreset(s.quality);
    this.vfx.setQuality(s.quality);
    this.env.setShadows(r.shadows && s.shadows, r.shadowSize);
    this.terrain.setQuality(s.quality);
    this.pixelRatio = Math.max(0.5, r.pixelRatio * s.resolution);
    this.onResize();
  }

  private onResize = (): void => {
    const w = window.innerWidth, h = window.innerHeight;
    this.rts.resize(w, h);
    this.post.setSize(w, h, this.pixelRatio);
    this.env.resize();
  };

  async start(): Promise<void> {
    this.simSeed = this.setup.seed ?? ((Math.random() * 1e9) | 0);
    const init: InitMsg = {
      map: this.setup.map, heights: this.built.hf.data, seed: this.simSeed,
      players: this.setup.players, options: this.setup.options, replay: this.setup.replay,
    };
    const fac = new Set<string>(['neutral']);
    for (const pl of this.setup.players) fac.add(pl.faction);
    await prebuildModels(DEF_LIST.filter((d) => fac.has(d.faction)));
    await this.host.start(init);
    this.hud = new Hud(this);
    this.input = new InputController(this);
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    window.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === 'KeyF' && e.shiftKey) this.perf.toggle();
    if (e.code === 'Backquote') this.perf.toggle();
  };

  command(cmd: Command): void {
    if (this.viewer < 0 || this.ended) return;
    this.host.command(this.viewer, cmd);
    this.acknowledge(cmd);
  }

  /** the first unit of the group answers over the radio */
  private acknowledge(cmd: Command): void {
    const ids = (cmd as { ids?: number[] }).ids;
    if (!ids?.length) return;
    let kind: string;
    switch (cmd.t) {
      case 'move': kind = cmd.attack ? 'attack' : 'move'; break;
      case 'attack': case 'cyber': kind = 'attack'; break;
      case 'capture': case 'garrison': case 'repair': case 'harvest': case 'build': kind = cmd.t; break;
      case 'patrol': kind = 'move'; break;
      default: return;
    }
    const v = this.entities.views.get(ids[0]);
    if (v) this.audio.ack(kind, v.def);
  }

  async saveReplay(): Promise<void> {
    const log = await this.host.getLog();
    const data = { version: 1, game: 'meridian-strike', map: this.setup.map, seed: this.simSeed, players: this.setup.players, options: { ...this.setup.options, viewer: -1 }, log, ticks: this.snap?.tick ?? 0 };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-replay-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  private slowTimer = 0;
  /** brief cinematic slow motion */
  slowmo(seconds: number): void {
    if (this.paused) return;
    this.host.setSpeed(this.speed * 0.3);
    clearTimeout(this.slowTimer);
    this.slowTimer = window.setTimeout(() => this.host.setSpeed(this.speed), seconds * 1000);
  }
  private focus: { x: number; z: number; d: number; t: number } | null = null;
  focusTo(x: number, z: number, d: number): void { this.focus = { x, z, d, t: 3.5 }; }

  setPaused(v: boolean): void { this.paused = v; this.host.setPaused(v); }
  setSpeed(v: number): void { this.speed = v; this.host.setSpeed(v); }

  // ------------------------------------------------------------------------- snapshots
  private onSnapshot(s: Snapshot): void {
    this.snap = s;
    this.snapCount++;
    const now = performance.now() / 1000;
    this.entities.onSnapshot(s, now);
    if (s.fog) updateFog(s.fog);
    // selection cleanup
    if (this.selection.size) for (const id of this.selection) if (!this.entities.views.has(id)) this.selection.delete(id);
    for (const ev of s.events) this.handleEvent(ev);
    this.hud?.onSnapshot(s);
    this.audio.onSnapshot(s);
    if (s.winner && !this.ended) {
      this.ended = true;
      this.slowmo(2.8);
      window.setTimeout(() => { this.hud?.showEnd(s); this.onEnd?.(s); }, 3000);
    }
  }

  private handleEvent(ev: SimEvent): void {
    const vfx = this.vfx;
    switch (ev.k) {
      case 'shot': {
        const dx = ev.tx - ev.x, dz = ev.tz - ev.z;
        const l = Math.hypot(dx, dz) || 1;
        vfx.muzzle(ev.x, ev.y, ev.z, dx / l, dz / l, ev.vfx, !!ev.big);
        if (!ev.p && (ev.vfx === 'bullet' || ev.vfx === 'cannon')) {
          vfx.tracer(ev.x, ev.y, ev.z, ev.tx, ev.ty, ev.tz, ev.vfx);
          if (Math.random() < 0.55) vfx.hit(ev.tx, ev.ty, ev.tz, ev.vfx === 'cannon');
        }
        this.audio.shot(ev, this.rts.target);
        break;
      }
      case 'boom':
        vfx.explosion(ev.x, ev.y, ev.z, ev.size, ev.kind);
        if (ev.kind === 'nuke') { this.slowmo(2.2); this.focusTo(ev.x, ev.z, 260); }
        this.audio.boom(ev, this.rts.target);
        break;
      case 'death': {
        this.entities.addWreck(ev.def, ev.x, ev.y, ev.z, ev.heading, ev.structure, performance.now() / 1000);
        const d = DEF_LIST.find((x) => x.id === ev.def);
        if (ev.structure) vfx.structureDeath(ev.x, this.terrain.heightAt(ev.x, ev.z), ev.z, d?.radius ?? 8);
        else if (d && d.move !== 'foot' && d.layer !== 'air') vfx.vehicleWreck(ev.x, ev.y, ev.z);
        else if (d?.layer === 'air') vfx.vehicleWreck(ev.x, this.terrain.heightAt(ev.x, ev.z), ev.z);
        break;
      }
      case 'flare':
        vfx.flares(ev.x, ev.y, ev.z);
        this.audio.flare(ev, this.rts.target);
        break;
      case 'promote': {
        vfx.promoteAt(ev.x, this.terrain.heightAt(ev.x, ev.z), ev.z, ev.vet);
        if (ev.owner === this.viewer) {
          const d = DEF_LIST.find((x) => x.id === ev.def);
          this.hud?.toast(`${d?.name ?? 'Unit'} promoted: ${VET_NAMES[ev.vet] ?? ''} ${'★'.repeat(ev.vet)}`);
          this.audio.promote(ev.vet);
        }
        break;
      }
      case 'strikeWarn':
        this.warnRings.push({ x: ev.x, z: ev.z, r: ev.r, until: performance.now() / 1000 + ev.t + 0.5, next: 0 });
        break;
      case 'alert':
        this.hud?.alert(ev);
        this.audio.alert(ev);
        break;
      case 'msg':
        if (ev.owner === this.viewer) this.hud?.toast(ev.text);
        break;
      case 'defeat':
        this.hud?.toast(`${this.setup.players[ev.player]?.name ?? 'Player'} has been defeated`);
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------- frame
  private frame = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.time += dt;
    const nowS = now / 1000;

    this.input?.frame(dt);
    if (this.focus) {
      const f = this.focus;
      f.t -= dt;
      this.rts.target.x += (f.x - this.rts.target.x) * Math.min(1, dt * 2.2);
      this.rts.target.z += (f.z - this.rts.target.z) * Math.min(1, dt * 2.2);
      if (f.d) { this.rts.setView(this.rts.distance + (f.d - this.rts.distance) * Math.min(1, dt * 1.6), this.rts.yaw); }
      if (f.t <= 0) this.focus = null;
    }
    this.rts.update(dt);
    // screen shake
    const sh = this.vfx.shakeValue(this.rts.target.x, this.rts.target.z);
    if (sh > 0.01) {
      this.rts.camera.position.x += (Math.random() - 0.5) * sh * 1.2;
      this.rts.camera.position.y += (Math.random() - 0.5) * sh * 1.2;
      this.rts.camera.lookAt(this.rts.target);
    }
    const def = this.built.def;
    if (def.cycle > 0 && !this.paused) {
      this.hour += (def.cycle * dt * this.speed) / 60;
      const bake = this.time - this.lastBake > 25;
      this.env.setHour(this.hour, bake);
      if (bake) this.lastBake = this.time;
      this.vfx.setDaylight(this.env.daylight);
    }
    this.entities.nightGlow = 0.1 + 1.5 * (1 - this.env.daylight) ** 1.5;
    this.env.update();
    this.terrain.update(this.time);
    this.weather.update(dt, this.rts.target, this.env.daylight);
    this.entities.camPos.copy(this.rts.camera.position);
    this.entities.frame(nowS, dt, this.selection, this.hover);
    for (let i = this.warnRings.length - 1; i >= 0; i--) {
      const w = this.warnRings[i];
      if (nowS > w.until) { this.warnRings.splice(i, 1); continue; }
      if (nowS >= w.next) { w.next = nowS + 0.7; this.vfx.shocks.add(w.x, this.terrain.heightAt(w.x, w.z) + 0.6, w.z, w.r, 0.7, 0xff5a3a); }
    }
    this.vfx.setSun(this.env.sun, this.env.daylight);
    this.vfx.update(dt);
    this.hud?.frame(dt);
    this.audio.listenerYaw = this.rts.yaw;
    this.audio.frame(dt, this.rts.target, this.rts.distance);
    this.renderFrame();
    this.perf.extra = `Preset ${this.engine.settings.quality}  Hour ${this.hour.toFixed(1)}  Ents ${this.snap?.n ?? 0}\nSim ${this.snap?.perf.tickMs.toFixed(2) ?? '-'} ms  Paths ${this.snap?.perf.paths ?? 0}`;
    this.perf.tick(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private renderFrame(): void {
    const r = this.engine.renderer;
    r.info.reset();
    this.post.render();
    if (this.vfx.flash > 0.01) {
      // full-screen flash is handled in the HUD via CSS
      this.hud?.flash(this.vfx.flash);
    }
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKey);
    this.host.dispose();
    this.hud?.dispose();
    this.input?.dispose();
    this.audio.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.env.csm.dispose();
    fog.on.value = 0;
    void DT;
  }
}
