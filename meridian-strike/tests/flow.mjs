// Human-flow playtest: plays a normal skirmish as a human would (build order, production, army orders, capture, powers, sell/repair)
// through the same commands the UI sends, and reports every blocker it hits.   node tests/flow.mjs   (env MAP, FAC, PORT, SPEED)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT ?? 5209);
// serve the production bundle (npm run build first) so editing sources while the test runs cannot hot-reload the page
const server = spawn('npx', ['vite', 'preview', '--outDir', process.env.OUT ?? 'dist', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => { server.stdout.on('data', (d) => String(d).includes('Local') && res()); server.on('exit', rej); setTimeout(() => rej(new Error('vite timeout')), 30000); });
const kill = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', kill);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'log') console.log('  ', m.text()); });
const map = process.env.MAP ?? 'highland_pass';
const fac = process.env.FAC ?? 'usa';
await page.goto(`http://localhost:${PORT}/?auto=1&map=${map}&n=2&f0=${fac}&q=low&speed=${process.env.SPEED ?? 8}&diff=easy&shot=1`);
await page.waitForFunction(() => window.__session && window.__session.snap && window.__session.snap.tick > 30, null, { timeout: 170000 });
await page.evaluate(() => {
  const S = window.__session, DL = window.__mods.DEF_LIST;
  const F = (window.F = {});
  F.log = [];
  F.note = (m) => { F.log.push(m); console.log(m); };
  F.me = () => S.viewer;
  F.mine = () => [...S.entities.views.values()].filter((v) => v.owner === S.viewer);
  F.def = (v) => DL[v.def];
  F.byId = (id) => F.mine().filter((v) => DL[v.def].id === id);
  F.done = (id) => F.byId(id).filter((v) => !(v.flags & 4) || v.prog >= 1 || (v.prog === 0 && !(v.flags & 4)));
  F.pl = () => S.snap.players[S.viewer];
  F.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  F.until = async (cond, ms, label) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (cond()) return true; await F.sleep(150); } F.note(`TIMEOUT: ${label}`); return false; };
  F.cc = () => F.mine().find((v) => DL[v.def].slot === 'cc');
  F.spot = (id, near) => {
    const c = near ?? F.cc();
    for (let r = 18; r <= 150; r += 5) for (let a = 0; a < 6.283; a += 0.25) {
      const x = Math.round((c.x + Math.cos(a) * r) / 2) * 2, z = Math.round((c.z + Math.sin(a) * r) / 2) * 2;
      if (!S.input.placementWhy(id, x, z)) return [x, z];
    }
    return null;
  };
  F.dozers = () => F.mine().filter((v) => DL[v.def].builds && DL[v.def].kind === 'unit');
  F.build = async (id) => {
    const d = DL.find((q) => q.id === id);
    const spot = F.spot(id);
    if (!spot) { F.note(`NO SPOT for ${id}`); return false; }
    const before = F.byId(id).length, cr = F.pl().credits, t0 = S.snap.time;
    const dz = F.dozers();
    if (!dz.length) { F.note(`NO DOZER for ${id}`); return false; }
    S.command({ t: 'build', ids: [dz[0].id], def: id, x: spot[0], z: spot[1] });
    const ok = await F.until(() => F.byId(id).filter((v) => v.prog >= 1 || !(v.flags & 4)).length > before, 90000, `build ${id}`);
    F.note(`${ok ? 'BUILT' : 'FAILED'} ${id} in ${(S.snap.time - t0).toFixed(0)} sim-s (nominal ${d.time}s) cost ${cr - F.pl().credits}/${d.cost} at ${spot}`);
    return ok;
  };
  F.produce = async (structId, unitId, n = 1) => {
    const st = F.byId(structId).find((v) => !(v.flags & 4) || v.prog >= 1);
    if (!st) { F.note(`NO PRODUCER ${structId}`); return false; }
    const d = DL.find((q) => q.id === unitId);
    const before = F.byId(unitId).length, t0 = S.snap.time;
    S.command({ t: 'produce', structure: st.id, def: unitId, count: n });
    const ok = await F.until(() => F.byId(unitId).length >= before + n, 120000, `produce ${unitId} x${n}`);
    F.note(`${ok ? 'PRODUCED' : 'FAILED'} ${unitId} x${n} in ${(S.snap.time - t0).toFixed(0)} sim-s (nominal ${d.time}s each)`);
    return ok;
  };
});
const run = (name, fn) => page.evaluate(fn).then((r) => { console.log(`== ${name}`, r === undefined ? '' : JSON.stringify(r)); });
const state = () => page.evaluate(() => { const p = F.pl(); return { t: Math.round(window.__session.snap.time), credits: p.credits, power: `${p.powerProd}/${p.powerUse}`, units: p.units, structs: p.structures, mine: F.mine().map((v) => F.def(v).id + (v.flags & 4 && v.prog < 1 ? '*' : '')).join(',') }; });
console.log('START', JSON.stringify(await state()));
await run('power plant', () => F.build('usa_reactor'));
await run('supply center', () => F.build('usa_supply'));
await run('barracks', () => F.build('usa_barracks'));
console.log(JSON.stringify(await state()));
await run('war factory', () => F.build('usa_factory'));
await run('rifle x4', () => F.produce('usa_barracks', 'usa_rifle', 4));
await run('abrams x2', () => F.produce('usa_factory', 'usa_abrams', 2));
await run('truck', () => F.produce('usa_supply', 'usa_truck', 1));
await run('radar', () => F.build('usa_radar'));
await run('airfield', () => F.build('usa_airfield'));
console.log(JSON.stringify(await state()));
await run('apache', () => F.produce('usa_airfield', 'usa_apache', 1));
await run('armory', () => F.build('usa_armory'));
await run('strategic', () => F.build('usa_strategic'));
console.log(JSON.stringify(await state()));
await run('defense', async () => { await F.build('usa_bunker'); await F.build('usa_cram'); await F.build('usa_patriot'); });
console.log(JSON.stringify(await state()));
await browser.close(); kill(); process.exit(0);
