// Meridian Strike – desktop shell. Serves the built game from a tiny local HTTP server (so module workers,
// fetch and localStorage behave exactly like a web origin) and opens it in a GPU-accelerated Chromium window.
const { app, BrowserWindow, Menu, shell, globalShortcut } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// ---- performance switches: always use the discrete GPU, never throttle, ignore driver blocklists
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.MS_NO_VSYNC === '1') { app.commandLine.appendSwitch('disable-frame-rate-limit'); app.commandLine.appendSwitch('disable-gpu-vsync'); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.map': 'application/json', '.txt': 'text/plain',
};

function distDir() {
  // packaged: resources/app.asar/dist ; dev: ../dist
  return path.join(__dirname, '..', 'dist');
}

function startServer(root, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || '/').split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = path.normalize(path.join(root, p));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function serve(root) {
  // fixed port first so localStorage (settings, replays) survives between launches; fall back to the next ones
  for (let port = 47811; port < 47830; port++) {
    try { const s = await startServer(root, port); return { server: s, port }; } catch { /* port busy */ }
  }
  const s = await startServer(root, 0);
  return { server: s, port: s.address().port };
}

let win = null;

/** CI check (MS_SMOKE=1, MS_QUERY='?auto=1&spectate=1&n=2&q=low&speed=4'): the game must boot and the sim worker must tick */
function runSmokeTest(w) {
  const errors = [];
  w.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  const started = Date.now();
  const poll = async () => {
    try {
      const r = await w.webContents.executeJavaScript('({ canvas: !!document.querySelector("canvas"), tick: window.__session && window.__session.snap ? window.__session.snap.tick : -1, gl2: !!document.createElement("canvas").getContext("webgl2") })');
      console.log('SMOKE', JSON.stringify(r), 'errors', errors.length);
      if (r.canvas && r.tick > 60) { console.log('SMOKE OK'); app.exit(0); return; }
    } catch (e) { console.log('SMOKE poll failed', e.message); }
    if (Date.now() - started > 120000) { console.log('SMOKE TIMEOUT', errors.slice(0, 5).join(' | ')); app.exit(2); return; }
    setTimeout(poll, 3000);
  };
  setTimeout(poll, 5000);
}

async function createWindow() {
  const { port } = await serve(distDir());
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 650,
    backgroundColor: '#05080c', show: false, autoHideMenuBar: true, title: 'MERIDIAN STRIKE',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.show(); if (!process.env.MS_WINDOWED) win.setFullScreen(true); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  const q = process.env.MS_QUERY || '';
  if (process.env.MS_SMOKE) runSmokeTest(win);
  await win.loadURL(`http://127.0.0.1:${port}/${q}`);
  // F11 = fullscreen, Ctrl+Shift+I = devtools, Ctrl+R = reload
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    else if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) win.webContents.toggleDevTools();
    else if (input.control && input.key.toLowerCase() === 'r') win.webContents.reload();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => { globalShortcut.unregisterAll(); app.quit(); });
}
