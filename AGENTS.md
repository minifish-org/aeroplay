# AeroPlay

Build an offline-first collection for iPhone Safari and MacBook Safari using TypeScript and Three.js. All code, comments, documentation, and commit messages are English.

## Scope

Exactly eight games: 2048, Lights Out, Flappy Bird, Sudoku, Match-3, Pocket Cargo, Sky Rush, Robot Pushball. There is no Snake, Tetris, Maze, Pixi, DOM game board, or remote runtime service. Keep all existing non-AI game functions and only the existing local TAMEV capabilities.

## Architecture

- `src/core/`: stage.ts, hud.ts, input.ts, storage.ts, loop.ts, audio.ts. One persistent Three renderer and shared camera/light authority.
- `src/ai/`: player.ts, tamev.ts, planner.worker.ts. Read-only snapshots; ordinary shared inputs; resident local ONNX inference.
- `src/hub/hub.ts`: eight preview/name/local-record cards.
- `src/games/<game>/`: index.ts assembles; model.ts is pure logic with no Three/DOM/storage; view.ts presents; hud.ts defines in-stage controls. Registry changes by one line per new game.
- `styles/`: tokens.css, hub.css, game.css only.

Allowed old logic reuse: mergeLogic, flappyFlight, lightsLogic, puzzleSolvers, skyState, Cargo model/solver, Pushball model/policy. Never reuse old view/assembly code.

Sudoku and Pocket Cargo generate their content on device instead of shipping level tables. Both derive everything from the level number as a deterministic seed, so a saved game always regenerates exactly the same board: Sudoku digs a unique puzzle that naked and hidden singles finish, and Cargo scrambles a delivered island and accepts it only when the shipped solver proves it deliverable inside the in-stage hint budget. No fixed puzzle list, no fixed level list, and every level autoplays into the next generated one after a solve. Match-3 keeps rising score targets with no move budget at all, so an endless run can never settle into a failed state.

## Presentation and input

Use three-point lighting, soft shadows, ACES tone mapping, consistent materials, and pixel ratio <=2. Orthographic games use shaped geometry and lighting. Bounded particles; entry/score/failure/result easing <=400ms; reduced motion applies final states directly. DOM is for accessible HUD text/controls, never boards or transparent grid overlays. HUD and touch inputs stay inside the stage, >=12px from its edges and outside reserved playable bounds. Keep keyboard focus cues.

One shared short-side threshold <=700px selects both iPhone orientations; no per-game media queries. Required viewports: 390x844, 844x390, 1512x982; MacBook lower bound 1440x900. No scrolling, horizontal overflow, clipped controls, or obstructed playfield. Only touch/in-stage controls on iPhone; keyboard/mouse on MacBook.

The mode control combines Human/Watch/takeover. Remove settings/dialog/preload UI. Initialize TAMEV on first Watch; Pushball's mandatory opponent initializes on first Start match. Pause/retry/replay/return-to-personal-run remain contextual in-stage actions. Cancel queued plans on pause/takeover/navigation/hiding; never disable HUD recovery controls when locking AI-owned play input.

## Storage and offline

Keep existing key names and saved shapes readable, including `aeroplay:game2048:*`. Sudoku saves store their generated puzzle number; older saves carrying `puzzleIndex` are still read and regenerate the puzzle they belong to. Human and AI runs stay separate; takeover never makes AI records personal. Preserve global sound/last-game values. No runtime external resources: model, WASM, assets, and scripts share the origin. Keep build:decision, CSP, SW precache/version updates, and the deployment pipeline.

## Delivery gates

Work directly on local main. P0 skeleton, P1 core, P2 one game commit each (2048, Lights, Flappy, Sudoku, Match3, Cargo, Sky, Pushball), P3 AI, P4 cleanup. Each stage builds and reports added/deleted lines plus current source/style counts. Commit messages describe change and validation. Pre-commit runs tsc -b and Vite build. Never push incomplete or unverified stages. No force push.

Before the single final push: npm run build, verify-layout.mjs, verify-games.mjs, verify-ai.mjs, verify-offline.mjs, and manual browser opening of hub/all eight games. Do not relax assertions. Preserve existing meaningful coverage, render_game_to_text, advanceTime, and PLAYWRIGHT_MODULE support. After push verify successful GitHub Actions, deployed/local asset hashes, and updated SW CACHE.

Keep code readable.

## Workflow and communication

Use rg and targeted reads for discovery. Prefer RTK for supported shell commands and rtk proxy when exact output is needed; follow /Users/yusp/.codex/RTK.md. Never commit plans or intermediate thinking. Keep progress.md append-only. Default concise ADHD-friendly communication: next action/outcome first, bounded numbered steps, at most five items per group, factual errors, concrete progress, and one short next action when work remains. Explain fully on request. Explicit destructive authorization already covers this rewrite.
