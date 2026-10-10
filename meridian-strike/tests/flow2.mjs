// Human-flow playtest part 2: army, combat, capture, powers, sell/repair, aircraft sortie, on a pre-built base (techStart).
//   node tests/flow2.mjs   (env MAP, FAC, PORT, SPEED, OUT = dist dir)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT ?? 5211);
const server = spawn('npx', ['vite', 'preview', '--outDir', process.env.OUT ?? 'dist', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => { server.stdout.on('data', (d) => String(d).includes('Local') && res()); server.on('exit', rej); setTimeout(() => rej(new Error('vite timeout')), 30000); });
const kill = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', kill);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'log') console.log('  ', m.text()); });
const map = process.env.MAP ?? 'highland_pass';
await page.goto(`http://localhost:${PORT}/?auto=1&map=${map}&n=2&f0=${process.env.FAC ?? 'usa'}&q=low&speed=${process.env.SPEED ?? 8}&diff=${process.env.DIFF ?? 'easy'}&base=1&shot=1`);
await page.waitForFunction(() => window.__session && window.__session.snap && window.__session.snap.tick > 30, null, { timeout: 170000 });
await page.evaluate(() => {
  const S = window.__session, DL = window.__mods.DEF_LIST;
  const F = (window.F = {});
  F.note = (m) => console.log(m);
  F.mine = () => [...S.entities.views.values()].filter((v) => v.owner === S.viewer);
  F.byId = (id) => F.mine().filter((v) => DL[v.def].id === id);
  F.pl = () => S.snap.players[S.viewer];
  F.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  F.until = async (cond, ms, label) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (cond()) return true; await F.sleep(200); } F.note(`TIMEOUT: ${label}`); return false; };
  F.units = () => F.mine().filter((v) => DL[v.def].kind === 'unit' && DL[v.def].weapons?.length && !(v.flags & 2048));
  F.cc = () => F.mine().find((v) => DL[v.def].slot === 'cc');
  F.enemySpawn = () => { const sp = S.built.def.spawns, cc = F.cc(); return sp.map(([x, z]) => ({ x, z, d: Math.hypot(x - cc.x, z - cc.z) })).sort((a, b) => b.d - a.d)[0]; };
  F.produce = async (structId, unitId, n) => {
    const st = F.byId(structId).find((v) => !(v.flags & 4) || v.prog >= 1);
    if (!st) { F.note(`NO PRODUCER ${structId}`); return false; }
    const before = F.byId(unitId).length, t0 = S.snap.time;
    S.command({ t: 'produce', structure: st.id, def: unitId, count: n });
    const ok = await F.until(() => F.byId(unitId).length >= before + n, 120000, `produce ${unitId} x${n}`);
    F.note(`${ok ? 'PRODUCED' : 'FAILED'} ${unitId} x${n} in ${(S.snap.time - t0).toFixed(0)} sim-s`);
    return ok;
  };
});
const run = async (name, fn) => { const r = await page.evaluate(fn); console.log(`== ${name}`, r === undefined ? '' : JSON.stringify(r)); };
const state = () => page.evaluate(() => { const p = F.pl(); return { t: Math.round(window.__session.snap.time), cr: p.credits, power: `${p.powerProd}/${p.powerUse}`, units: p.units, structs: p.structures, kills: p.kills, cp: p.cp, rank: p.rank }; });
console.log('START', JSON.stringify(await state()));
await run('economy (idle 60 sim-s, no orders)', async () => {
  const S = window.__session, t0 = S.snap.time, c0 = F.pl().credits;
  await F.until(() => S.snap.time - t0 >= 60, 90000, 'wait 60s');
  return { income: F.pl().credits - c0, perSec: +((F.pl().credits - c0) / (S.snap.time - t0)).toFixed(1), trucks: F.byId('usa_truck').length };
});
await run('inventory', () => F.mine().map((v) => window.__mods.DEF_LIST[v.def].id).reduce((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {}));
await run('army', async () => { await F.produce('usa_barracks', 'usa_rifle', 6); await F.produce('usa_factory', 'usa_abrams', 5); await F.produce('usa_airfield', 'usa_apache', 2); await F.produce('usa_airfield', 'usa_f35', 2); });
console.log('ARMY', JSON.stringify(await state()));
// attack-move on the enemy base
await run('attack-move', async () => {
  const S = window.__session;
  const e = F.enemySpawn();
  const ids = F.units().map((v) => v.id);
  S.command({ t: 'move', ids, x: e.x, z: e.z, attack: true });
  F.note(`ordered ${ids.length} units to ${e.x},${e.z}`);
  const t0 = S.snap.time;
  let last = { units: ids.length, kills: 0 };
  for (let i = 0; i < 40; i++) {
    await F.sleep(4000);
    const p = F.pl();
    const my = F.units();
    const moving = my.filter((v) => v.flags & 1).length, firing = my.filter((v) => v.flags & 2).length;
    const vets = my.filter((v) => v.vet > 0).length;
    F.note(`t+${(S.snap.time - t0).toFixed(0)}s units=${my.length} moving=${moving} firing=${firing} vets=${vets} kills=${p.kills} enemyStructs=${S.snap.players.filter((q) => q.id !== S.viewer).map((q) => q.structures).join('/')}`);
    if (S.snap.winner) { F.note('WINNER ' + JSON.stringify(S.snap.winner)); break; }
    if (!my.length) { F.note('ARMY WIPED'); break; }
  }
});
console.log('AFTER ATTACK', JSON.stringify(await state()));
await run('sell + repair', async () => {
  const S = window.__session, DL = window.__mods.DEF_LIST;
  const st = F.mine().filter((v) => DL[v.def].kind === 'structure' && DL[v.def].slot === 'radar')[0] ?? F.mine().filter((v) => DL[v.def].kind === 'structure' && !DL[v.def].slot?.startsWith('cc'))[0];
  const before = F.pl().credits;
  if (st) { S.command({ t: 'sell', id: st.id }); await F.sleep(4000); F.note(`sold ${DL[st.def].id}: credits ${before} -> ${F.pl().credits}, still present=${S.entities.views.has(st.id)}`); }
});
await run('powers', async () => {
  const S = window.__session;
  const p = F.pl();
  F.note(`cp=${p.cp} rank=${p.rank} unlocked=${p.unlocked}`);
  const gen = window.__mods.POWERS;
  return p.unlocked;
});
console.log('END', JSON.stringify(await state()));
await browser.close(); kill(); process.exit(0);
