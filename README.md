# AeroPlay — FlightMode Offline Game Hub

A lightweight, offline-first collection of ten games (Sky Rush, Pocket Cargo, Snake, Tetris, 2048, Flappy Bird, Maze, Match-3, Sudoku, Lights Out) built with TypeScript, Vite, PixiJS, and Three.js. Designed for mobile, touch-friendly play in airplane mode with add-to-homescreen support.

**Use this as a template:** In GitHub, click “Use this template” to bootstrap a new repo without inheriting issues or history. Keep `main` clean (no build artifacts) for easy forking.

## About
AeroPlay is an offline-first, mobile-first game hub optimized for flight-mode usage. All game assets are local and games save progress with `localStorage`. A service worker and manifest enable add-to-homescreen behavior and offline play. Optional AI watch mode uses TAMEV with controller-owned planning, entirely on the device. The player makes no external requests.

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
3. Add to Home Screen, open it once, then enable flight mode. All ten games are precached, including games you have not opened yet, the shared 3D renderer, and the Cargo hint worker.
4. Progress stays in local storage on that browser and device. Clearing website data clears saves.

For local layout testing only, use `npm run dev -- --host 0.0.0.0`. The development server does not install a service worker.

## Games & Controls
| Game | What's new | Controls |
| --- | --- | --- |
| Sky Rush | 3D lane flight, ring streaks, boost, shield, sector progression, optional sound | Swipe or ←/→ to steer; Space boosts; P pauses |
| Pocket Cargo | 12 solvable 3D Sokoban islands, worker hints, minimum-push targets, undo, stars | Swipe or arrows; Z undoes; level selector |
| Snake | Classic acceleration, relaxed edge wrapping, timed golden crystals, results | Swipe board, arrows, Start/Pause; Space or P |
| Tetris | Seven-bag pieces, three previews, hold, landing ghost, wall kicks, lock delay, combo scoring | Arrows; Space drops; C holds; P pauses; touch buttons |
| 2048 | Saved run, 20-step undo, milestones, game-over detection | Swipe board, arrows, Z to undo |
| Flappy Bird | Fair pipe spacing, progressive gaps, perfect-flight bonus, medals | Tap board or Space; P pauses |
| Maze | Three optional stars, footprints, limited route hints, larger expeditions | Swipe board or arrows |
| Match-3 | 30-move target levels, cascade multipliers, free hints and dead-board shuffles | Tap two adjacent gems |
| Sudoku | Validated puzzles, notes, peer highlights, undo, three hints, saved timer | Select cell, keypad or 1–9; N toggles notes; Z undoes |
| Lights Out | Progressive solvable puzzles, optimal hints, undo, star results | Tap tiles to flip a cross |

Arcade games pause when the page is hidden. Press F for fullscreen where supported. Puzzle saves include 2048, Match-3 (after cascades settle), Sudoku, and Lights Out; Maze saves expedition progress.

## Gameplay verification
Eight 2D games use PixiJS presentation classes in `src/games/views`, separated from their existing gameplay, controls, save data and Laya adapters. The shared scene in `src/core/pixi` provides reusable materials, bounded particles, temporary glow and shockwave filters, deterministic animation time, and reduced-motion behavior. Grid puzzles retain native buttons above their canvas for touch, keyboard focus and accessibility.

Actions use the scene clock for continuous transitions: 2048 keeps source numbers while sliding, merges on contact and then introduces the new tile; Match-3 swaps before clearing and dropping gems; Tetris lands, clears and collapses rows before resuming gravity. Maze follows queued steps around corners, Snake travels between cells, and Flappy eases its pitch and wingbeat. Lamps blend their brightness, Sudoku animates selection and number changes, and game overlays fade in. Rapid input catches up in order; undo, restart and navigation cancel pending transitions. Reduced motion resolves directly to the final state.

One Pixi renderer is reused across 2D scenes to avoid WebKit's context exhaustion when repeatedly creating and losing WebGL contexts. Navigation destroys the scene, textures, filters and event listeners; the renderer sleeps on the hub and is destroyed when leaving the page. Pixel density is capped at 2. Human play uses local dependencies and procedurally generated materials. The Canvas backend keeps the 2D games playable without GPU acceleration, with GPU filters omitted.

With Playwright available, run `node scripts/verify-games.mjs` against the development server. Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is installed outside the project. `TEST_BROWSER=webkit` selects WebKit, and `TEST_URL` changes the server address. The script exercises wins/losses, scoring, hints, undo, persistence, and 320/390/768px layouts, and writes screenshots to `output/`.

Run `node scripts/verify-pixi.mjs` to verify visible rendering after native input, cascades, merges, notes, idle and paused rendering, reduced motion and rapid navigation with a bounded GPU context count. `node scripts/capture-previews.mjs` captures representative synthetic boards from the actual presentation classes, plus live Maze and 3D scenes, on the development server into the local hub artwork.

Run `node scripts/verify-motion.mjs` with the same browser and server overrides to inspect intermediate animation frames for all eight 2D games. It verifies action ordering, visible positions and fades, rapid input, undo, paused gravity, real animation-frame completion and reduced motion, and saves screenshots with their visual state to `output/motion-*`.

Run `node scripts/verify-offline.mjs` against `npm run preview` to verify production precaching, offline reload, all ten game mounts, and touch swipes. It uses the same Playwright environment overrides, including `TEST_BROWSER=webkit`. The WebKit check installs an isolated preview and then stops the server to verify cached reload and play without Playwright's service-worker offline override.

Run `TEST_PAGES_REDIRECTS=1 node scripts/verify-offline.mjs` after building to start an isolated preview with Cloudflare Pages-style `/index.html` redirects and verify both online and offline reloads. The service worker uses the canonical `/` response for navigation; caching a redirected HTML response breaks browser reloads on Pages.

Run `node scripts/verify-script-policy.mjs` against the production preview to confirm that injected external scripts are blocked before network dispatch in Chromium and WebKit. The offline verifier rejects external network requests, including failed ones; only explicit browser CSP blocks are excluded.

## 3D games and architecture
- **Sky Rush** is a three-lane flight game. Golden rings grow a score multiplier, a full charge activates a three-second boost, and one shield absorbs a collision. Finish 1,000 meters to enter the next sector.
- **Pocket Cargo** has 12 small Sokoban boards. Every board has been solved and its minimum push count verified. Hints run in a worker so the scene stays responsive.
- The hub loads game modules on demand. Three.js is a shared chunk, loaded for the 3D games; the service worker precaches it for offline use.
- Renderer pixel ratio is capped at 1.5, runway markings use instancing, and geometry, materials, workers, audio contexts and renderers are released on navigation.
- Scenes use local geometry and synthesized sound. Sound is opt-in and the preference is saved.
- 3D requires WebGL 2, as specified by the [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html). Unsupported browsers can still use the classic games.

Run `node scripts/verify-3d.mjs` with the same Playwright environment overrides to check all 12 Cargo solutions, flight rules, a complete 3D flight, worker hints, undo, stars, saving and mobile rendering. Both Chromium and WebKit are supported by the verifier. Screenshots are saved to `output/3d-*`.

## Players and offline AI

TAMEV is the active AI player. Human and AI players share the same game instance, rules, speed, physics and native input handler across all ten games. Select **Watch TAMEV** to hand over the current round without resetting the board or difficulty. **Take over** returns control to the human in that same round. AI runs retain separate saves and records after takeover.

Run `npm run build:decision` to prepare the pinned, checksum-verified TAMEV-Nano INT8 model and include it in the static offline build. Preparation downloads files at build time; browser inference uses bundled, same-origin resources through ONNX Runtime Web and one WASM thread. No Python conversion is required. Model binaries are ignored by Git, so a fresh checkout needs preparation before AI play. Deployment builds must explicitly include this preparation.

Open **AI player** and load the model, or start **Watch TAMEV**. Wait for model readiness and the hub's **Offline ready** indicator before disconnecting. The model and tokenizer stay resident in one dedicated worker across game navigation. Personal play does not initialize the model.

Games keep advancing while planning and inference are pending. A dedicated controller worker calculates candidate plans from read-only visible snapshots; TAMEV selects a plan. The controller executes one ordinary input at a time, validates every step, and discards expired or divergent plans. Inference errors leave the game running. Explicit **Pause**, **Resume**, **Retry** and **Take over** remain available. There is no remote or rule-player fallback. The model can miss a timing window or lose a round.

Flappy Bird, Snake and Tetris keep their normal human speeds. Flappy prefetches the next trajectory while the current plan executes. Snake plans future direction inputs; Tetris searches reachable placements but performs each move, rotation and drop through the native controls. Maze and Cargo routes, Lights Out toggle sequences, Sudoku constraint completions, Match-3 swaps and 2048 lookahead are computed inside the AI controller. Sudoku uses only the displayed board, never its stored answer. Unknown spawns are not read or predicted from RNG. Plans cannot move a character or change a board directly. TAMEV receives concise plan summaries within its 128-token state/question and 48-token option limits.

The shared contract is in `src/core/player.ts`; read-only planning data and guards are in `ai-planning-state.ts`, and the bounded searches are in the dedicated `ai-planning.worker.ts`. `verify-ai-planning.mjs` checks all ten planners and timed trajectory guards. `verify-player-core.mjs` covers ownership, cancellation and stale replies; `verify-player-fairness.mjs` compares game clocks with a held decision; `verify-player-inputs.mjs` compares identical human/AI inputs across all ten games. `verify-ai-planning-browser.mjs` exercises real TAMEV planning and takeover in normal-frame flight. Browser scripts accept the same `PLAYWRIGHT_MODULE` override described above. Historical model comparisons predate this shared-player implementation and do not measure its current gameplay performance. The earlier Laya service remains in source for reference; the active interface uses TAMEV only.

## Tech Notes
- Static frontend: PixiJS, its filters, Three.js, the optional WASM runtime and tokenizer are bundled locally and loaded on demand; no external CDN or remote game assets. TAMEV inference runs in a resident local worker.
- Offline: service worker + manifest; localStorage per-game saves. Cache versions include built page HTML and public asset contents, so policy and artwork changes refresh installed copies.
- The page restricts scripts and workers to its own origin. Hosting-injected analytics cannot run or make external requests; AI inference uses only bundled local resources.
- Mobile UX: touch controls, double-tap zoom disabled, overscroll reduced.

## Deploying to Cloudflare Pages
- Recommended: use the included workflow `.github/workflows/deploy-cloudflare-pages.yml`.
- In repo secrets add `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Pages:Edit scope), and `CLOUDFLARE_PAGES_PROJECT` (your Pages project name).
- Trigger on push to `main` (or manual dispatch); the workflow uses Node 22, runs `npm ci` and `npm run build:decision` to bundle the pinned local model, and publishes `dist` to the main branch via `cloudflare/wrangler-action@v4` with a pinned Wrangler version. This follows the [Cloudflare CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
- If configuring in the Cloudflare UI instead, set build command to `npm run build`, output directory to `dist`, and Node 22.

## Repo Structure (key parts)
- `src/core`: shared engine loop, UI helpers, storage wrapper.
- `src/games`: individual game modules.
- `styles`: base, hub, game styles.
- `public`: static assets, manifest, service worker.
