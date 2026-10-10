// Live audio smoke test: AI-vs-AI battle in headless Chromium with a tap on the audio output.
// node tests/audio/live.mjs   (env MAP, PORT, SECS)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const PORT = Number(process.env.PORT ?? 5208);
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((res, rej) => { server.stdout.on('data', (d) => String(d).includes('Local') && res()); server.on('exit', rej); setTimeout(() => rej(new Error('vite timeout')), 30000); });
const kill = () => { try { process.kill(-server.pid); } catch {} };
process.on('exit', kill);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 200)); });
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (t, ...a) {
    if (t instanceof AudioDestinationNode && !window.__an) {
      const an = t.context.createAnalyser(); an.fftSize = 2048; window.__an = an; window.__anBuf = new Float32Array(2048);
      orig.call(this, an);
    } else if (t instanceof AudioDestinationNode && window.__an) orig.call(this, window.__an);
    return orig.call(this, t, ...a);
  };
});
const map = process.env.MAP ?? 'highland_pass';
await page.goto(`http://localhost:${PORT}/?auto=1&map=${map}&n=2&spectate=1&q=low&speed=${process.env.SPEED ?? 6}&base=1&nofog=1&shot=1`);
await page.waitForFunction(() => window.__session && window.__session.snap && window.__session.snap.tick > 30, null, { timeout: 170000 });
await page.mouse.click(300, 200); // unlock audio (gesture)
const secs = Number(process.env.SECS ?? 60);
const t0 = Date.now();
const log = [];
while ((Date.now() - t0) / 1000 < secs) {
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const s = window.__session, a = s.audio;
    // aim the camera at the busiest firing cluster so the mix is exercised
    const E = s.snap.ents; let best = null, bestN = 0;
    for (let i = 0; i < s.snap.n; i += 3) { const o = i * 16; if (!((E[o + 9] | 0) & 2)) continue; let n = 0; for (let j = 0; j < s.snap.n; j += 2) { const p = j * 16; if (Math.abs(E[p + 3] - E[o + 3]) < 40 && Math.abs(E[p + 5] - E[o + 5]) < 40 && ((E[p + 9] | 0) & 2)) n++; } if (n > bestN) { bestN = n; best = [E[o + 3], E[o + 5]]; } }
    if (best) s.rts.target.set(best[0], s.rts.target.y, best[1]);
    window.__an.getFloatTimeDomainData(window.__anBuf);
    let pk = 0, sum = 0; for (const v of window.__anBuf) { pk = Math.max(pk, Math.abs(v)); sum += v * v; }
    return { tick: s.snap.tick, ents: s.snap.n, firing: bestN, state: a.ctx && a.ctx.state, loops: a.loops.size, voices: a.active.length, pk: +pk.toFixed(3), rms: +Math.sqrt(sum / 2048).toFixed(4) };
  });
  log.push(r);
  if (log.length % 5 === 0) console.log(JSON.stringify(r));
}
const peak = Math.max(...log.map((l) => l.pk));
console.log('SUMMARY peak', peak, 'maxLoops', Math.max(...log.map((l) => l.loops)), 'maxVoices', Math.max(...log.map((l) => l.voices)), 'state', log[log.length - 1].state);
await browser.close(); kill(); process.exit(0);
