// Gallery screenshot helper: node tests/gshot.mjs   env: PORT, VW, VH, SHOTS='[{"name":"x","url":"?gallery=usa&only=usa_abrams","wait":4000}]'
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 5203);
const VW = Number(process.env.VW ?? 1400), VH = Number(process.env.VH ?? 800);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && res());
  server.on('exit', rej);
  setTimeout(() => rej(new Error('vite start timeout')), 30000);
});
const killServer = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', killServer);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
try {
  for (const s of JSON.parse(process.env.SHOTS ?? '[]')) {
    await page.goto(`http://localhost:${PORT}/${s.url}`);
    await page.waitForTimeout(s.wait ?? 5000);
    await page.screenshot({ path: `${out}${s.name}.png` });
    console.log('shot', s.name);
  }
} catch (e) { console.log('error', e.message); }
console.log(errors.length ? `console issues:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'no console errors');
await browser.close();
killServer();
process.exit(0);
