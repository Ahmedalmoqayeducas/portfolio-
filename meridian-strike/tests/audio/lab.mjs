// Offline-render synthesized sounds in headless Chromium and write stats + spectrogram PNGs: node tests/audio/lab.mjs [names...]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = new URL('../out/audio/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 5207);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => { server.stdout.on('data', (d) => String(d).includes('Local') && res()); server.on('exit', rej); setTimeout(() => rej(new Error('vite timeout')), 30000); });
const kill = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', kill);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text()); });
await page.goto(`http://localhost:${PORT}/tests/audio/lab.html`);
await page.waitForFunction(() => window.labReady, null, { timeout: 60000 });
const all = await page.evaluate(() => window.lab.names());
const want = process.argv.slice(2);
const names = want.length ? want : all;
const dur = { flame: 1.2, zap: 1, zap_big: 2.2, nuke: 8, squelch: 0.3, loop_tracked: 5, loop_wheeled: 5, loop_jet: 5, loop_jet_pass: 5, loop_heli: 5, loop_prop: 5, loop_wind: 8, tankgun: 3, howitzer: 3.5, rocket: 3, missile: 2.5, whistle: 2, boom_small: 3, boom_big: 4, boom_struct: 5, step: 0.5, impact_metal: 0.5, impact_dirt: 0.4, rifle: 1, rifle_iran: 1, mg50: 1.2, autocannon: 1, flare: 1.2 };
for (const n of names) {
  const r = await page.evaluate(([n, s]) => window.lab.run(n, s), [n, dur[n] ?? 4]);
  writeFileSync(`${out}${n}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  console.log(n.padEnd(14), JSON.stringify(r.stats));
}
await browser.close(); kill(); process.exit(0);
