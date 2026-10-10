// Diagnose building placement: node tests/placement.mjs  (env MAP, PORT, FOG=1)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT ?? 5206);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => { server.stdout.on('data', (d) => String(d).includes('Local') && res()); server.on('exit', rej); setTimeout(() => rej(new Error('vite timeout')), 30000); });
const kill = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', kill);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
const map = process.env.MAP ?? 'highland_pass';
await page.goto(`http://localhost:${PORT}/?auto=1&map=${map}&n=2&q=low&speed=1${process.env.FOG ? '' : '&nofog=1'}&shot=1`);
await page.waitForFunction(() => window.__session && window.__session.snap && window.__session.snap.tick > 60, null, { timeout: 170000 });
const r = await page.evaluate(() => {
  const s = window.__session;
  const views = [...s.entities.views.values()];
  const defs = window.__mods.DEF_LIST;
  const mine = views.filter((v) => v.owner === s.viewer && defs[v.def].kind === 'structure');
  const cc = mine[0];
  const out = { viewer: s.viewer, structures: mine.map((v) => `${defs[v.def].id}@${v.x.toFixed(0)},${v.z.toFixed(0)} prog=${v.prog} flags=${v.flags}`), tally: {}, samples: [] };
  const ids = ['usa_barracks', 'usa_reactor', 'usa_supply'];
  for (const id of ids) {
    const t = {};
    let ok = 0, n = 0;
    for (let dx = -110; dx <= 110; dx += 6) for (let dz = -110; dz <= 110; dz += 6) {
      const x = Math.round((cc.x + dx) / 2) * 2, z = Math.round((cc.z + dz) / 2) * 2;
      const why = s.input.placementWhy(id, x, z);
      n++; if (!why) { ok++; if (out.samples.length < 6) out.samples.push([id, x, z]); } else { const k = why.replace(/Too close to .*/, 'Too close to structure'); t[k] = (t[k] ?? 0) + 1; }
    }
    out.tally[id] = { ok, n, fail: t };
  }
  out.sim = null;
  return out;
});
console.log(JSON.stringify(r, null, 1));
// end-to-end: order a barracks at a position the client says is fine and see whether the sim builds it
const e2e = await page.evaluate(async () => {
  const s = window.__session; const defs = window.__mods.DEF_LIST;
  const views = [...s.entities.views.values()];
  const dozers = views.filter((v) => v.owner === s.viewer && defs[v.def].builds && defs[v.def].kind === 'unit').map((v) => v.id);
  const cc = views.find((v) => v.owner === s.viewer && defs[v.def].kind === 'structure');
  let pick = null;
  for (let r = 20; r <= 110 && !pick; r += 6) for (let a = 0; a < 6.28 && !pick; a += 0.3) {
    const x = Math.round((cc.x + Math.cos(a) * r) / 2) * 2, z = Math.round((cc.z + Math.sin(a) * r) / 2) * 2;
    if (!s.input.placementWhy('usa_barracks', x, z)) pick = [x, z];
  }
  const before = [...s.entities.views.values()].filter((v) => v.owner === s.viewer && defs[v.def].kind === 'structure').length;
  const msgs = [];
  const prev = s.hud.toast.bind(s.hud); s.hud.toast = (t) => { msgs.push(t); prev(t); };
  if (pick) s.command({ t: 'build', ids: dozers, def: 'usa_barracks', x: pick[0], z: pick[1], queue: false });
  await new Promise((r) => setTimeout(r, 6000));
  const after = [...s.entities.views.values()].filter((v) => v.owner === s.viewer && defs[v.def].kind === 'structure').length;
  return { dozers: dozers.length, pick, before, after, msgs, credits: s.snap.players[s.viewer].credits };
});
console.log('E2E', JSON.stringify(e2e));
await browser.close(); kill(); process.exit(0);
