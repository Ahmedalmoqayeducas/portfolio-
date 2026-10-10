// Headless-Chromium smoke test: boots the dev server, runs scenarios, takes screenshots, reports console errors + frame stats.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 5199);
const VW = Number(process.env.VW ?? 1600), VH = Number(process.env.VH ?? 900);
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
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); if (process.env.VERBOSE) console.log('console:', m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const scenarios = JSON.parse(process.env.SCEN ?? '[]');
const defaults = [
  { name: 'm1-spectate', url: '?auto=1&spectate=1&map=red_mesa&n=2&q=low&speed=6&base=1&shot=1', wait: 25000 },
];
for (const s of scenarios.length ? scenarios : defaults) {
  await page.goto(`http://localhost:${PORT}/${s.url}`);
  await page.waitForFunction(() => window.__session && window.__session.snap && window.__session.snap.tick > 30, null, { timeout: 180000 });
  await page.waitForTimeout(s.wait ?? 5000);
  if (s.js) { const r = await page.evaluate(s.js); console.log('js ->', JSON.stringify(r)); await page.waitForTimeout(s.after ?? 2500); }
  // software GL renders frames very slowly: block until the GPU is idle and two frames were presented before grabbing pixels
  await page.evaluate(async () => { const gl = document.querySelector('canvas')?.getContext('webgl2'); gl?.finish(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); gl?.finish(); });
  await page.screenshot({ path: `${out}${s.name}.png`, timeout: 150000 });
  if (process.env.TWICE) { await page.waitForTimeout(4000); await page.screenshot({ path: `${out}${s.name}-b.png`, timeout: 150000 }); }
  const info = await page.evaluate(() => { const ss = window.__session; return { tick: ss.snap.tick, ents: ss.snap.n, simMs: ss.snap.perf.tickMs, players: ss.snap.players.map((p) => `${p.name}:${p.units}u/${p.structures}s/$${p.credits}`) }; });
  console.log('shot', s.name, JSON.stringify(info));
}
console.log(errors.length ? `console issues:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : 'no console errors');
await browser.close();
try { process.kill(-server.pid); } catch {}
process.exit(errors.some((e) => e.startsWith('[pageerror]')) ? 1 : 0);
