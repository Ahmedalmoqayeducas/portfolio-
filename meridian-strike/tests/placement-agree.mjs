// Does the client's green/red placement preview agree with the simulation? (?local runs the sim on the main thread)
// node tests/placement-agree.mjs   (env MAP, FAC, PORT, OUT = dist dir)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT ?? 5210);
const server = spawn('npx', ['vite', 'preview', '--outDir', process.env.OUT ?? 'dist', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => { server.stdout.on('data', (d) => String(d).includes('Local') && res()); server.on('exit', rej); setTimeout(() => rej(new Error('vite timeout')), 30000); });
const kill = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', kill);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const maps = (process.env.MAP ?? 'highland_pass,red_mesa').split(',');
for (const map of maps) {
  await page.goto(`http://localhost:${PORT}/?auto=1&map=${map}&n=2&f0=${process.env.FAC ?? 'usa'}&q=low&speed=1&diff=easy&local=1&shot=1`);
  await page.waitForFunction(() => window.__session && window.__session.snap && window.__session.snap.tick > 20, null, { timeout: 170000 });
  const r = await page.evaluate(() => {
    const S = window.__session, DL = window.__mods.DEF_LIST, canPlace = window.__mods.canPlace, sim = S.host.sim;
    const mine = [...S.entities.views.values()].filter((v) => v.owner === S.viewer && DL[v.def].kind === 'structure');
    const cc = mine[0];
    const out = { clientOkSimNo: {}, clientNoSimOk: {}, bothOk: 0, bothNo: 0, samples: [] };
    for (const id of ['usa_reactor', 'usa_barracks', 'usa_factory', 'usa_airfield', 'usa_supply', 'usa_radar', 'usa_bunker', 'usa_darkeagle']) {
      const d = DL.find((q) => q.id === id);
      for (let dx = -120; dx <= 120; dx += 4) for (let dz = -120; dz <= 120; dz += 4) {
        const x = Math.round((cc.x + dx) / 2) * 2, z = Math.round((cc.z + dz) / 2) * 2;
        const c = S.input.placementWhy(id, x, z);
        const s = canPlace(sim, S.viewer, d, x, z);
        if (!c && s) { out.clientOkSimNo[s] = (out.clientOkSimNo[s] ?? 0) + 1; if (out.samples.length < 6) out.samples.push([id, x, z, s]); }
        else if (c && !s) { const k = c.replace(/Too close to .*/, 'Too close'); out.clientNoSimOk[k] = (out.clientNoSimOk[k] ?? 0) + 1; }
        else if (!c) out.bothOk++; else out.bothNo++;
      }
    }
    return out;
  });
  console.log(map, JSON.stringify(r));
}
await browser.close(); kill(); process.exit(0);
