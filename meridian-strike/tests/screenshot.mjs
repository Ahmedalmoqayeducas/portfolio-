// Headless-Chromium smoke test: boots the dev server, takes screenshots, reports console errors + frame stats.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const PORT = 5199;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && res());
  server.on('exit', rej);
  setTimeout(() => rej(new Error('vite start timeout')), 30000);
});

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errors.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const shots = [
  { name: 'm0-dusk', q: 'ultra', t: 17.2, d: 110, yaw: 0.8 },
  { name: 'm0-noon-close', q: 'ultra', t: 12, d: 45, yaw: 2.2 },
  { name: 'm0-night', q: 'high', t: 22, d: 150, yaw: 0.8 },
];
for (const s of shots) {
  await page.goto(`http://localhost:${PORT}/?shot=1&q=${s.q}&t=${s.t}&d=${s.d}&yaw=${s.yaw}`);
  await page.waitForFunction(() => window.__game && window.__game.frames > 4, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}${s.name}.png` });
  console.log('overlay:', JSON.stringify(await page.evaluate(() => document.getElementById('perf').textContent)));
  console.log('shot', s.name, JSON.stringify(await page.evaluate(() => window.__game.info())));
}
console.log(errors.length ? `console issues:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
server.kill();
process.exit(errors.some((e) => e.startsWith('[pageerror]')) ? 1 : 0);
