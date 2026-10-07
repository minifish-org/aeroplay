# AeroPlay — FlightMode Offline Game Hub

A lightweight, offline-first collection of ten games (Sky Rush, Pocket Cargo, Snake, Tetris, 2048, Flappy Bird, Maze, Match-3, Sudoku, Lights Out) built with TypeScript, Vite, Phaser 4.2.1 (eight 2D games), and Three.js (two 3D games). Designed for mobile, touch-friendly play in airplane mode with add-to-homescreen support.

**Use this as a template:** In GitHub, click “Use this template” to bootstrap a new repo without inheriting issues or history. Keep `main` clean (no build artifacts) for easy forking.

## About
AeroPlay is an offline-first, mobile-first game hub optimized for flight-mode usage. All game assets are local and games save progress with `localStorage`. A service worker and manifest enable add-to-homescreen behavior and offline play. Optional Laya watch mode uses a separately configured online decision service; no external requests occur before one is configured.

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
3. Add to Home Screen, open it once, then enable flight mode. All ten games are precached, including games you have not opened yet, both shared renderers, all artwork and sound, and the Cargo hint worker.
4. Progress stays in local storage on that browser and device. Clearing website data clears saves.

For local layout testing only, use `npm run dev -- --host 0.0.0.0`. The development server does not install a service worker.

## Games & Controls
| Game | What's new | Controls |
| --- | --- | --- |
| Sky Rush | 3D lane flight, ring streaks, boost, shield, sector progression, optional sound | Swipe or ←/→ to steer; Space boosts; P pauses |
| Pocket Cargo | 12 solvable 3D Sokoban islands, worker hints, minimum-push targets, undo, stars | Swipe or arrows; Z undoes; level selector |
| Snake | Friendly garden art, default relaxed edge wrapping, classic challenge, golden stars, results | Swipe board, arrows, Start/Pause; Space or P |
| Tetris | Seven-bag pieces, three previews, hold, landing ghost, wall kicks, lock delay, combo scoring | Arrows; Space drops; C holds; P pauses; touch buttons |
| 2048 | Animated tile slides and merges, saved run, 20-step undo, milestone celebrations | Swipe board, arrows, Z to undo |
| Flappy Bird | Sunny scenery, default gentle speed/wider gaps, classic challenge, perfect-flight rings, medals | Tap board or Space; P pauses |
| Maze | Three optional stars, footprints, limited route hints, larger expeditions | Swipe board or arrows |
| Match-3 | Animated gem swaps and gravity, tap or swipe, cascades, hints, free dead-board shuffles | Tap two adjacent gems or swipe a gem |
| Sudoku | Varied unique puzzles, default 52-clue Starter mode, Classic mode, notes, undo, three hints, saved timer | Select cell, keypad or 1–9; N toggles notes; Z undoes |
| Lights Out | Sleepy-star theme, ripple feedback, solvable puzzles, optimal hints, undo, star results | Tap tiles to flip a cross |

Arcade games and Sudoku pause when the page is hidden. Press F for fullscreen where supported. Puzzle saves include 2048, Match-3 (after cascades settle), Sudoku, and Lights Out; Maze saves expedition progress.

## Gameplay verification
With Playwright available, run `node scripts/verify-games.mjs` against the development server. Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is installed outside the project. `TEST_BROWSER=webkit` selects WebKit, and `TEST_URL` changes the server address. The script exercises wins/losses, scoring, hints, undo, persistence, and 320/390/768px layouts, and writes screenshots to `output/`.

Run `node scripts/verify-offline.mjs` against `npm run preview` to verify production precaching, offline reload, all ten game mounts, saves and offline worker hints. It uses the same Playwright environment overrides. Chromium exercises native swipes; WebKit exercises native touch buttons.

The WebKit offline check starts its own preview from `dist` and shuts that server down after installation. This verifies cached responses without Playwright's offline override, which rejects service-worker navigations in this WebKit environment.

Run `node scripts/verify-script-policy.mjs` against the production preview to confirm that injected external scripts are blocked before network dispatch in Chromium and WebKit. The offline verifier rejects external network requests, including failed ones; only explicit browser CSP blocks are excluded.

Run `TEST_PAGES_REDIRECTS=1 node scripts/verify-offline.mjs` after building to start an isolated preview with Cloudflare Pages-style `/index.html` redirects and verify both online and offline reloads. The service worker uses the canonical `/` response for navigation; caching a redirected HTML response breaks browser reloads on Pages.

Run `node scripts/verify-phaser-models.mjs` for independent grid-rule checks, Sudoku uniqueness, maze connectivity, minimum Lights Out solutions and legal Tetris landing plans.

## 2D playground architecture
- All eight 2D games run inside Phaser Scenes. The hub, native touch controls, settings and Laya panel remain HTML.
- `src/core/phaser/pocket.ts` owns scene lifecycle, scaling, pointer gestures, keyboard routing, local sound, reduced-motion effects and inspection hooks. `board.ts` reuses tile containers across board games.
- Pure grid rules and solvers live in `src/games/models`; rendering helpers live in `src/games/views`. Grid games use discrete rules rather than unnecessary physics simulation.
- Phaser and Three.js are separate local chunks; the hub loads neither engine until its game is opened. The service worker precaches both for flight mode.
- Vector artwork and tiny local WAV cues require no external assets. Sound is optional and saved per device.
- Precache versions include page HTML and public asset contents, so page policies, artwork or audio updates alone refresh the offline installation.
- The page restricts scripts and workers to its own origin. This blocks hosting-injected external analytics while allowing locally bundled games, offline service workers, Cargo hints and the configured Laya decision connection.
- Human and Laya play share the same rules. Model observations contain visible state and legal outcomes; stale observations are rejected before applying actions.
- A new asynchronous mount is canceled when another navigation wins. Navigation releases the active scene, sound manager, renderer, gestures and callbacks.
- Sudoku permutes three validated unique templates and adds starter clues; transformations and extra clues preserve uniqueness. A new puzzle is saved with its own givens and solution. The Laya adapter never receives that stored solution.

## 3D games and architecture
- **Sky Rush** is a three-lane flight game. Golden rings grow a score multiplier, a full charge activates a three-second boost, and one shield absorbs a collision. Finish 1,000 meters to enter the next sector.
- **Pocket Cargo** has 12 small Sokoban boards. Every board has been solved and its minimum push count verified. Hints run in a worker so the scene stays responsive.
- The hub loads game modules on demand. Three.js is a shared chunk, loaded for the 3D games; the service worker precaches it for offline use.
- Renderer pixel ratio is capped at 1.5, runway markings use instancing, and geometry, materials, workers, audio contexts and renderers are released on navigation.
- Scenes use local geometry and synthesized sound. Sound is opt-in and the preference is saved.
- 3D requires WebGL 2, as specified by the [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html). Unsupported browsers can still use the classic games.

Run `node scripts/verify-3d.mjs` with the same Playwright environment overrides to check all 12 Cargo solutions, flight rules, a complete 3D flight, worker hints, undo, stars, saving and mobile rendering. Both Chromium and WebKit are supported by the verifier. Screenshots are saved to `output/3d-*`.

## Watching Laya play

1. Open **Laya settings** on the hub or inside any game. Enter the base HTTPS address of an [AeroPlay Laya service](services/laya/README.md), test the connection, then save it. One connection is shared by all ten games and saved on this device.
2. Open a game and select **Watch Laya**. The service must be reachable and report that it supports this game; browser online status alone does not enable watch mode.
3. Use **Pause**, **Resume**, or **Take over**. A connection failure pauses the game and keeps the board available for takeover. Switching back to **Play yourself** starts a personal run with your personal saves.

Laya and assisted runs use separate local saves and records. Taking over an AI run does not add its score to your personal best. Human controls are disabled while Laya is in charge. Clear the service address to return to a fully local installation.

Every AI action comes from the model's selected option; there is no rule-player fallback. Move planning supplies legal candidate moves and their visible outcomes. Sudoku and Lights Out additionally use visible-board constraint assistance, shown in the session label; Sudoku never provides its stored answer sheet to the AI adapter. Snake, Flappy Bird and Tetris run more slowly in watch mode to accommodate inference latency, while personal gameplay keeps its original speed. Connecting a game does not guarantee that the model will win it.

The static site is deployed by the existing Pages workflow; the Python model service runs separately. Self-hosting instructions, protocol, CORS and resource limits are in [services/laya/README.md](services/laya/README.md). A tailnet-only endpoint requires the player's device to be connected to that tailnet.

Browsers can require [local network permission](https://developer.chrome.com/blog/local-network-access) before a public site can reach a private service. CORS alone does not grant that permission. Some embedded browsers block private destinations; use a browser that permits the configured connection. A failed connection keeps personal play available and watch mode disabled.

Run `node scripts/verify-laya-core.mjs` for transport, cancellation, input validation, controller lifecycle and save isolation tests. These use fake transport to exercise failures and do not count as real-model gameplay verification.

Run `node scripts/verify-phaser-laya.mjs` against the development server to exercise all eight real Phaser adapters with controlled transport, including decisions, pause, late replies, takeover, save isolation and rapid navigation. It supports the same Playwright environment overrides, including WebKit. These checks verify integration, not model playing skill.

## Tech Notes
- Static frontend: Phaser and Three.js are bundled locally; no external CDN or remote game assets. Optional Laya inference is a separate service.
- Offline: service worker + manifest; localStorage per-game saves.
- Mobile UX: touch controls, double-tap zoom disabled, overscroll reduced.

## Deploying to Cloudflare Pages
- Recommended: use the included workflow `.github/workflows/deploy-cloudflare-pages.yml`.
- In repo secrets add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Pages:Edit scope), and `CLOUDFLARE_PAGES_PROJECT` (your Pages project name).
- Trigger on push to `main` (or manual dispatch); the workflow uses Node 22, runs `npm ci` and `npm run build`, and publishes `dist` to the main branch via `cloudflare/wrangler-action@v4` with a pinned Wrangler version. This follows the [Cloudflare CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
- If configuring in the Cloudflare UI instead, set build command to `npm run build`, output directory to `dist`, and Node 22.

## Repo Structure (key parts)
- `src/core`: shared engine loop, UI helpers, storage wrapper.
- `src/games`: individual game modules.
- `styles`: base, hub, game styles.
- `public`: static assets, manifest, service worker.
