# MERIDIAN STRIKE

Modern-day RTS (browser, desktop). Design: [docs/GDD.md](docs/GDD.md).

```bash
npm install
npm run dev        # http://localhost:5173 (also on LAN: --host)
npm run typecheck
npm run shot       # headless Chromium screenshots -> tests/out/
```

Controls: WASD/edge pan, Q/E or MMB rotate, wheel zoom, Shift fast, 1-4 graphics preset, T time of day, F perf overlay.
URL params: `?q=low|medium|high|ultra&t=<hour>&d=<distance>&yaw=<rad>`.

Status: **M0** (renderer foundation). See GDD roadmap.
