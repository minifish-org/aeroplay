# AeroPlay — FlightMode Offline Game Hub

A lightweight, offline-first collection of mini games (Snake, Tetris, 2048, Flappy Bird, Maze, Match-3, Sudoku, Lights Out) built with HTML/CSS/TypeScript and Vite. Designed for mobile, touch-friendly play in airplane mode with add-to-homescreen support.

**Use this as a template:** In GitHub, click “Use this template” to bootstrap a new repo without inheriting issues or history. Keep `main` clean (no build artifacts) for easy forking.

## About
AeroPlay is a pure-frontend, mobile-first game hub optimized for flight-mode usage. All assets are local, no network calls, and games save progress with `localStorage`. A service worker and manifest enable add-to-homescreen behavior and offline play.

## Quick Start (desktop)
```bash
npm install
npm run dev          # start dev server
npm run build        # production build
npm run preview      # serve built files locally
```
Open the shown URL in a browser. For mobile testing, run with `--host 0.0.0.0` and open from your phone on the same Wi‑Fi.

## Playing on Phone in Flight Mode
1. Run `npm run build` and serve `dist` over HTTPS. Service workers require a secure origin; plain HTTP on a LAN address does not enable offline installation. `localhost` works for desktop preview.
2. Open the site in Safari or Chrome while online and wait for **Offline ready** in the hub.
3. Add to Home Screen, open it once, then enable flight mode. All eight games are precached, including games you have not opened yet.
4. Progress stays in local storage on that browser and device. Clearing website data clears saves.

For local layout testing only, use `npm run dev -- --host 0.0.0.0`. The development server does not install a service worker.

## Games & Controls
| Game | What's new | Controls |
| --- | --- | --- |
| Snake | Classic acceleration, relaxed edge wrapping, timed golden fruit, results | Swipe board, arrows, Start/Pause; Space or P |
| Tetris | Seven-bag pieces, three previews, hold, landing ghost, wall kicks, lock delay, combo scoring | Arrows; Space drops; C holds; P pauses; touch buttons |
| 2048 | Saved run, 20-step undo, milestones, game-over detection | Swipe board, arrows, Z to undo |
| Flappy Bird | Fair pipe spacing, progressive gaps, perfect-flight bonus, medals | Tap board or Space; P pauses |
| Maze | Three optional stars, footprints, limited route hints, larger expeditions | Swipe board or arrows |
| Match-3 | 30-move target levels, cascade multipliers, free hints and dead-board shuffles | Tap two adjacent gems |
| Sudoku | Validated puzzles, notes, peer highlights, undo, three hints, saved timer | Select cell, keypad or 1–9; N toggles notes; Z undoes |
| Lights Out | Progressive solvable puzzles, optimal hints, undo, star results | Tap tiles to flip a cross |

Arcade games pause when the page is hidden. Press F for fullscreen where supported. Puzzle saves include 2048, Match-3 (after cascades settle), Sudoku, and Lights Out; Maze saves expedition progress.

## Gameplay verification
With Playwright available, run `node scripts/verify-games.mjs` against the development server. Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is installed outside the project. `TEST_BROWSER=webkit` selects WebKit, and `TEST_URL` changes the server address. The script exercises wins/losses, scoring, hints, undo, persistence, and 320/390/768px layouts, and writes screenshots to `output/`.

Run `node scripts/verify-offline.mjs` against `npm run preview` to verify production precaching, offline reload, all eight game mounts, and touch swipes. It uses the same `PLAYWRIGHT_MODULE` override.

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
