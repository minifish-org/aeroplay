# AeroPlay

Eight offline-first games for iPhone Safari and MacBook Safari: 2048, Lights Out, Flappy Bird, Sudoku, Match-3, Pocket Cargo, Sky Rush, and Robot Pushball. Three.js presents every game; TAMEV selects local AI inputs through a resident ONNX/WASM worker.

## Run and build

Use Node.js 22 and npm.

```sh
npm install
npm run build:decision
npm run dev -- --host 127.0.0.1
```

`build:decision` prepares the pinned TAMEV files, verifies their checksums, and builds the static site. This build-time download is the only model acquisition step. Once those files are present, `npm run build` creates `dist/` without a model download.

Preview the production build with `npm run preview -- --host 127.0.0.1`. Service-worker installation runs in the production build; the development server does not install its offline cache. The HTML-only Pages headers prevent intermediary script injection. Deployment policy files affect the cache version but are not precached as runtime assets.

## Play and controls

Choose a preview card on the hub. The scene fills the available screen, with scores and core actions above it. More holds occasional actions and Watch. Brief first-play tips disappear after input; the first three Cargo islands introduce their mechanics. Results sit below or beside the visible board. Phone controls reserve their own space; MacBook uses keyboard and mouse.

| Game | iPhone | MacBook | Game actions |
| --- | --- | --- | --- |
| 2048 | Swipe | Arrow keys; Z to undo | Undo, Restart |
| Lights Out | Tap a lamp | Click a lamp | Undo, Hint, Retry, Next |
| Flappy Bird | Tap to flap | Space to flap; P to pause | Start, Pause/Resume, Retry, Sound |
| Sudoku | Tap a cell, then a digit | Arrows select; digits enter; Backspace/Delete/0 erase; N notes; Z undo | Notes, Undo, Hint, New puzzle |
| Match-3 | Tap adjacent gems or drag between them | Click adjacent gems or drag | Hint, Restart, Next, Sound |
| Pocket Cargo | D-pad or swipe | Arrows/WASD; Z to undo | Level selector, Undo, Hint, Restart, Next island, Sound |
| Sky Rush | Steer, swipe, and Boost | Left/Right or A/D steer; Space/Up start or boost; P pause; Enter start/resume/next/retry | Start, Pause/Resume, Boost, Restart, Next sector, Sound |
| Robot Pushball | Joystick and Dash; landscape rotates the pitch and controls together | Arrows/WASD move in screen directions; Space dashes in the last direction; P/Escape pause | Start match, Pause/Resume, paused New match, Play again, Retry AI, Sound |

MacBook also supports F to enter or exit fullscreen. Buttons retain keyboard focus cues. Sound is optional and its on/off preference is saved globally.

The seven solo games provide **Watch TAMEV** in More and a contextual **Take over** control while watching. First Watch pauses the action clock until the local model is ready; takeover continues the same run and cancels queued AI inputs. AI Pause/Resume, Retry AI, Watch again, and Your run appear when relevant. **Your run** returns to the saved personal profile. Robot Pushball always pairs a human blue robot with a TAMEV coral opponent; Start match loads that required opponent.

## Architecture

```text
src/
  main.ts
  core/                  stage.ts, hud.ts, input.ts, storage.ts, loop.ts, audio.ts
  ai/                    player.ts, tamev.ts, planner.worker.ts
  hub/                   hub.ts
  games/
    registry.ts
    <game>/              index.ts, model.ts, view.ts, hud.ts
styles/                  tokens.css, hub.css, game.css
public/                  local assets, model files, manifest, service worker
scripts/                 model preparation and four verifiers
```

- `core/stage.ts` owns the single shared Three renderer, cameras, lights, materials, geometry helpers, hit testing, and bounded effects. Game navigation releases scene resources while retaining the renderer.
- Each `model.ts` contains pure gameplay state and rules, without Three, DOM, or storage. `view.ts` presents snapshots, `hud.ts` defines accessible in-stage controls, and `index.ts` wires input, persistence, and lifecycle.
- `ai/player.ts` owns human/AI input authority, cancellation, stale-plan guards, model loading state, and resident client diagnostics. The eight planners read public snapshots in `planner.worker.ts`; `tamev.ts` performs checked local inference.
- Presentation uses shared three-point lighting, soft shadows, ACES tone mapping, pixel ratio at most 2, and effects at most 400 ms. Reduced motion applies final states directly. DOM is used for HUD text and controls; playable cells and gems are Three objects.

The shared layout targets 390×844 and 844×390 iPhone viewports, and MacBook viewports from 1440×900, with 1512×982 as the main acceptance size. One short-side threshold of 700 pixels selects phone layout in both orientations. Safe-area padding remains active.

## Saves and records

Records and supported run state stay in localStorage under the existing `aeroplay:<game>:*` names. The 2048 route retains its `aeroplay:game2048:*` namespace. Existing record and save shapes remain readable.

All seven solo games restore saved personal runs. Flappy and Sky reopen an active flight paused, including after Watch/takeover; best scores remain separate. Pushball retains wins and completed matches. Bounded Undo history survives navigation and reload in 2048, Lights Out, Sudoku, and Cargo. All three Sudoku puzzles and twelve Cargo maps, names, par values, and achievements are retained.

AI-owned records use `aeroplay:ai:<game>:*` (including `ai:game2048`). A takeover keeps that ownership for the current run; it does not convert AI results into personal records. Your run remounts the saved personal profile. Human Cargo hints use the original 20,000-node solver budget and report an unsolvable board without initializing TAMEV.

## Prepare offline use

1. Open the production site while connected and wait for **Offline ready** on the hub. This completes the service-worker cache, including game modules, previews, TAMEV, and WASM.
2. On iPhone, optionally add the site to Home Screen. Once cached, return to the site or Home Screen app in Flight Mode.
3. Play normally or select Watch TAMEV. The cached model initializes locally when requested. Pushball initializes its opponent on Start match.

A device must obtain the site once before disconnected use. A previously cached site can cold-start without the server. Runtime resources are same-origin; there is no remote model, CDN, or external service. Each build fingerprints the precache; activation replaces old cache entries.

## Verification

Provide an installed Playwright ESM entry and its WebKit browser binary. The module is supplied externally rather than added as a game dependency. With the development server on port 5173:

```sh
export PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs
export TEST_BROWSER=webkit
export TEST_URL=http://127.0.0.1:5173
node scripts/verify-layout.mjs
node scripts/verify-games.mjs
node scripts/verify-ai.mjs
npm run build:decision
TEST_BROWSER=chromium node scripts/verify-offline.mjs
```

The layout verifier covers the hub and eight games in all three target viewports, including reachable controls and reserved playable bounds. The game verifier covers rules, native input, complete results, hints/undo/progression, save restoration, and rendering lifecycle. The AI verifier uses the real local model for Watch, takeover, cancellation, residency, and a full Pushball match. The offline verifier serves `dist/`, prepares its cache, stops the server, restarts the browser profile, and checks games, real AI, cache updates, CSP, and same-origin requests.

The bundled automated WebKit build leaves CacheStorage empty even in an independent two-resource service-worker probe. The cold-cache verifier therefore uses Chromium; layout, gameplay and AI acceptance use WebKit. Physical Safari/Home Screen checks remain a separate device validation.

`render_game_to_text()` exposes public game state and diagnostics; `advanceTime()` advances the ordinary simulation for browser checks. Verifiers use native UI inputs for gameplay and retain assertions for actual rendering and input behavior.

## Review and delivery

[Player experience review](docs/PLAYER-EXPERIENCE.md) records the eight-game play coverage, improvements, replay evidence and device limits. [Page decisions](docs/PAGES.md) preserve the baseline element inventory and link the implemented pages and tracked before/after screenshots. [Delivery acceptance](docs/DELIVERY.md) records measurements, phase commits, verifier results, screenshots and remaining risks. [Progress](progress.md) records phase commits and validation evidence.

A push to `main` triggers GitHub Actions, which runs `npm run build:decision` and deploys `dist/` to Cloudflare Pages. Release acceptance requires a successful build, all four verifiers, and opening the hub plus every game. Post-push checks verify successful Actions, matching local/deployed asset hashes, and the service-worker cache fingerprint.
