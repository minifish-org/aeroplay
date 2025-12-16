# AeroPlay — FlightMode Offline Game Hub

A lightweight, offline-first collection of mini games (Snake, Tetris, 2048, Flappy Bird, Maze, Match-3, Sudoku, Lights Out) built with HTML/CSS/TypeScript and Vite. Designed for mobile, touch-friendly play in airplane mode with add-to-homescreen support.

## Quick Start (desktop)
```bash
npm install
npm run dev          # start dev server
npm run build        # production build
npm run preview      # serve built files locally
```
Open the shown URL in a browser. For mobile testing, run with `--host 0.0.0.0` and open from your phone on the same Wi‑Fi.

## Playing on Phone in Flight Mode (PWA-style)
1) Build and preview on your machine (one-time online step):
```bash
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```
2) On your phone (same Wi‑Fi), open `http://<your-lan-ip>:4173/`.
3) Add to home screen:
   - iPhone Safari: Share → Add to Home Screen.
   - Android Chrome: Menu → Install app / Add to Home Screen.
4) Open the new icon once while online so the service worker caches assets.
5) Switch to flight mode; reopen via the icon. Games and saves work offline.

## Games & Controls
- Snake: Arrow buttons (or keys), slower pace for relaxed play.
- Tetris: On-screen arrows/rotate/drop; 10x20 well; mobile-friendly sizing.
- 2048: Swipe or on-screen arrow buttons; local best score.
- Flappy Bird: Tap to flap; slowed pace; offline-ready.
- Maze: Swipe to move; timer; random mazes.
- Match-3: Tap two adjacent tiles to swap; clears with gravity.
- Sudoku: Tap cells; toggles for numbers/notes; local save.
- Lights Out: Tap tiles to toggle neighbors; clear the board.

## Tech Notes
- Pure frontend: no external CDN/assets; all local.
- Offline: service worker + manifest; localStorage per-game saves.
- Mobile UX: touch controls, double-tap zoom disabled, overscroll reduced.

## Deploying to Cloudflare Pages
- Recommended: use the included workflow `.github/workflows/deploy-cloudflare-pages.yml`.
- In repo secrets add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Pages:Edit scope), and `CLOUDFLARE_PAGES_PROJECT` (your Pages project name).
- Trigger on push to `main` (or manual dispatch); the workflow runs `npm ci`, `npm run build`, and publishes `dist` via `cloudflare/pages-action@v1`.
- If configuring in the Cloudflare UI instead, set build command to `npm run build`, output directory to `dist`, and Node 20.

## Repo Structure (key parts)
- `src/core`: shared engine loop, UI helpers, storage wrapper.
- `src/games`: individual game modules.
- `styles`: base, hub, game styles.
- `public`: static assets, manifest, service worker.
