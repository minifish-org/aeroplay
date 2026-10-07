Original prompt: Revisit all games in this project and make them more fun to play.

## Optional Laya play modes (2026-10-02)
- User selected the in-game mode switch preview, a single shared Laya settings entry, offline human play, and online human/Laya play across all ten games.
- Keep the hub's game cards unchanged; add connection settings globally and player controls inside each game.
- Add an optional external decision service. The authorized online mode extends the original local-only constraint; human gameplay and all game assets stay offline-ready.
- Separate Laya/assisted records and saves from personal records. Never use a deterministic player as a silent Laya fallback.
- Implemented one shared connection dialog, in-game watch controls, cancellation on pause/navigation, disconnect/retry/takeover, and captured per-run storage ownership across all ten games.
- The separate, resource-limited Laya service is ready on the GMK tailnet endpoint (port 8448). The existing Sky experiment on 8447 remains separate.
- Production build, 17 pure core cases, 11 service boundary cases, and independent source review passed. Browser checks exercised real model actions in all ten games, keyboard pause/resume, takeover, connection failure/recovery, and 320/390px layouts.
- Observed examples: Sky collected 34 rings before takeover, Maze escaped with three stars, 2048 reached score 68, Match-3 reached 680, Sudoku made 12 placements without mistakes, and solver-assisted Lights Out completed in three moves. Flappy ended before its first gate; these checks verify integration, not reliable winning strategies.
- Fixed a static precache lookup mismatch caused by `Vary: Origin` on preview module responses. The worker ignores request-header variation only within its same-origin static cache; canonical navigation and external/non-GET request boundaries remain covered by `scripts/verify-offline-cache.mjs`.
- Actual production browser verification passed after stopping the preview server: hub reload, all ten game mounts, disabled watch mode without configuration, and human Sky gameplay. Static precache completeness and the offline handler regression checks also passed.
- Publication will use the existing push-to-main Pages workflow. Physical iPhone/Safari testing has not been performed for this change.
- The feature commit `a1bac8c` was pushed to main. Its first deployment failed before checkout because `cloudflare/pages-action` could not be resolved. Updated the workflow to the current Wrangler action, pinned the CLI, and used its required Node 22 environment; existing project secrets and main-branch deployment target are preserved.
- Workflow repair `cb62735` built and published successfully in run `36977646617`; the production hub shows the shared settings entry. Production IAB requests to the private service timed out without reaching the backend, and direct private navigation returned `ERR_BLOCKED_BY_CLIENT`. The service's production CORS/PNA responses are correct. Local real-model integration passed, but production cross-network watch is not verified in this embedded browser; added tailnet connection guidance and documented browser permissions.

## Direction
- Improve all eight existing games, preserving the lightweight, local-only architecture.
- Arcade: intentional start/pause/results, fair pacing, progressive challenge, stronger feedback.
- Puzzles: useful hints/undo, meaningful goals, saved progress, readable mobile boards.
- Repair production offline precaching and verify gameplay in a browser.

## Findings
- Snake and Tetris silently reset on death; Snake can reject legal tail moves.
- Flappy uses a distance-like constant as milliseconds, spawning overlapping pipes.
- Match-3 double-counts intersecting matches and can strand players without moves.
- Maze starts duplicate animation loops and never cancels them on navigation.
- Production service worker precaches source CSS paths, omitting built bundles.
- Existing package-lock.json has user changes; leave it untouched.

## Implemented
- Snake: buffered swipe turns, relaxed/classic modes, progressive pace, golden fruit, legal tail movement, explicit results.
- Flappy: distance-based pipe spacing, proper hitbox, gradual difficulty, perfect-gate bonus, pause/results.
- Tetris: seven-bag randomizer, hold/three previews/ghost, wall kicks, lock delay, combo and level scoring.
- 2048: saved run, 20-step undo, milestone and dead-board feedback.
- Match-3: 30-move levels, cascade multipliers, distinct gem shapes, hints, free dead-board reshuffle, unique match scoring.
- Maze: star collection, growing expeditions, trail, limited hints, one cleaned-up timer.
- Sudoku: notes/undo/hints/keyboard/peer highlights, timer persistence, repaired invalid puzzles.
- Lights Out: progressive solvable puzzles, minimum-move solver hints, undo/retry and star results.

## Validation so far
- Production builds pass after each feature group.
- Required browser client exercised Snake, Flappy, Tetris, 2048 and Match-3; screenshots inspected.
- Found two invalid Sudoku solutions and one unsolvable puzzle; replaced bad puzzle and recomputed unique solutions.
- Remaining: responsive visual pass, full gameplay regression suite, production offline test.

## Final verification
- Production build passes; current bundle is approximately 45 KB JavaScript (17 KB gzip) and 10 KB CSS (3 KB gzip).
- `scripts/verify-games.mjs` passes in Chromium and WebKit with mobile touch contexts.
- Covered scoring, food/bonus generation, six Flappy gates, pauses, Tetris hold/line clears/top-out, 2048 merge/undo/save/dead board, Match-3 cascades/level result, Maze stars/exit/progression, Sudoku notes/hints/solve, and minimum-move Lights Out hints.
- No horizontal overflow at 320, 390, or 768 pixels; no browser page errors; teardown removes game inspection hooks.
- `scripts/verify-offline.mjs` passes against the production preview: all six build resources precached, all eight games mount after an offline reload, saved scores survive, real touch swipes work for Snake and 2048, and no external requests occur.
- Required game skill browser client executed across all eight games. Gameplay, result, mobile, desktop, and WebKit screenshots were opened and visually reviewed.
- Independently solved all three Sudoku fixtures: each has exactly one solution matching its reference answer.
- `git diff --check` passes. Existing package-lock.json user change is preserved.

## Handoff
- Local production preview: http://127.0.0.1:4173/
- No deployment or commit performed.
- Remaining external QA: physical iPhone Safari and Home Screen installation. WebKit mobile emulation was tested, but does not replace device testing.
- Optional future work: additional Sudoku puzzle packs and more game modes after player feedback.

## Second pass: 3D expansion
- User authorized committing/pushing the first pass, breaking compatibility, adding frameworks and new games.
- First pass committed and pushed to main as 52510b5.
- Add Three.js-based Sky Rush (arcade flight) and Pocket Cargo (Sokoban diorama puzzles).
- Add lazy game loading, shared 3D resource management, synthesized optional audio, game-specific goals and feedback.
- Keep all runtime resources bundled and precached for offline play.

### 3D implementation and early checks
- Added Three.js 0.186, lazy registry and versioned precaching of all output/public assets, including the solver worker.
- Sky Rush: smooth lane steering, reachable ring routes, boost meter, combo multipliers, shield, sector progression, local record, synthesized optional sound, and pause/results.
- Pocket Cargo: twelve solver-validated levels, minimum-push par, animated diorama, undo/restart, corner warnings, background-worker hints, star records and saved runs.
- Shared renderer caps pixel ratio and disposes scene geometry/materials/context on navigation.
- Required browser client rendered both 3D games; first screenshots were opened and inspected.
- Optimized runway markings with instanced rendering.
- Updated browser test polling to support asynchronous game imports while deterministic animation frames are paused.


### 3D final validation
- Chromium and WebKit pass the complete 3D suite: a full flight sector, ring/boost scoring, pauses, next sector, crashes/retry, all 12 Cargo levels, worker hints, undo, star records, save/reload, and mobile layouts.
- Simulated graphics context loss pauses Sky Rush; context restoration and resume were verified.
- The eight original games pass the existing regression suite after lazy-loading migration.
- Offline production suite passes with 23 precached resources, all ten game mounts, worker hints, and real touch swipes in Snake, 2048, Sky Rush, and Pocket Cargo. No external requests or browser errors.
- Required browser client rerun for both final 3D games. Gameplay, hints, results, mobile and WebKit screenshots were inspected.
- Hub entry JavaScript is about 9 KB (4 KB gzip); Three.js is a separate approximately 529 KB chunk (132 KB gzip), precached for offline use. The build's 500 KB chunk advisory refers to this intentionally shared renderer.
- Physical iPhone Safari/Home Screen testing remains external QA; WebKit mobile testing passed.
- Latest local production preview: http://127.0.0.1:4174/

## Production navigation repair (2026-09-12)
- User reported that https://games.minifish.org/ could not open.
- DNS, TLS, deployment status, and all 23 deployed resources were healthy. A fresh deployment URL loaded once, then failed on reload with Chrome ERR_FAILED.
- Root cause: Pages redirects /index.html to / with HTTP 308. The service worker cached the redirected response and returned it for navigations, which Chromium rejects.
- Added a Pages-redirect mode to the offline verifier and reproduced ERR_FAILED against the unchanged production build.
- Navigation now uses the canonical cached / response; /index.html is excluded from precaching.
- Production build and the Pages-redirect offline suite pass: 22 cached resources, online/offline reload, all ten games, saved scores, touch controls, and offline worker hints, with no page errors or external requests.
- Required browser client verified Snake gameplay; the screenshot and game state were inspected.
- Production publication and existing-session recovery verification follow this commit.

## Phaser playground migration (2026-10-07)
- User authorized updating constraints, breaking changes, all eight 2D games in Phaser, appealing child-friendly visuals, preserved Laya, and shared-code refactoring. Offline human play is mandatory.
- Use Phaser 4.2.1 as one locally bundled, lazy-loaded renderer. Keep both Three.js games.
- Extract pure rules from rendering; centralize scene/input/scale/sound/lifecycle and deterministic browser hooks.
- Validate native touch, puzzle saves, arcade outcomes, Laya cancellation/takeover, repeated navigation and production offline reload in Chromium and WebKit. No publication requested.
- Implemented all eight Phaser games, shared scene/board views, six pure rule modules, local illustrated hub cards and four opt-in audio cues. Starter modes include relaxed Snake, gentle Flappy and varied 52-clue Sudoku; native Phaser tweens, particles and input drive the 2D experience.
- Removed obsolete 2D DOM styles and duplicated loop/tap/overlay helpers. Snake and Tetris redraw only on visible state changes; score DOM updates are memoized.
- Fixed pointer coordinates after the Laya panel shifts the canvas. A captured native touch-start refreshes Phaser bounds before coordinate conversion.
- Fixed rapid-navigation cancellation in WebKit: Phaser marks the game booted before its system scene exists. Destruction now waits for a started game and the end of the current frame, including when automated or hidden loops have stopped.
- Independent model verification passed for 2048 merges, 100 Match-3 starts, 30 perfect mazes, 60 unique generated Sudoku puzzles, 100 independently checked minimum Lights Out solutions, and all Tetris landing paths.
- Both browser engines passed the eight-game gameplay and Laya adapter suites. Laya verification uses controlled transport and does not claim current real-model performance. The 17 shared Laya core cases and static offline-cache boundary checks passed.
- The production offline suite passed with 39 cached resources, all ten games, saves, touch input, Cargo worker hints and no external requests. Chromium also passed Pages-style redirects. Playwright WebKit's network-offline override rejects SW reloads internally; shutting down an isolated preview verifies its real cached reload and gameplay instead.
- Made the inspection clock drive native Phaser tweens as well as simulation, and render the first frame after scene creation even with a stopped loop. Screenshot review now shows complete boards and the maze explorer at the exit.
- Public artwork/audio contents now participate in the offline cache fingerprint. An isolated build-plugin fixture verified that artwork-only edits invalidate the cache while identical content keeps its version. The final production build and both offline browser suites passed; production dependencies have no reported audit vulnerabilities.
- Both original Three.js games passed their complete Chromium/WebKit suites after shared-style and helper cleanup. No physical iPhone/Home Screen check or current real-model session is claimed.
- Local production preview: http://127.0.0.1:4181/. Follow-up QA is a physical iPhone Home Screen flight-mode session and configured-service model gameplay.
- User subsequently authorized committing and pushing the completed migration to main. The existing push workflow performs the production build and Pages publication.
- Migration commit 282ef3d was pushed to main and its Pages workflow succeeded. Live production checks passed all ten offline games, saves, swipes and worker hints, but detected an injected Cloudflare analytics script as an external request. Added a same-origin script/worker page policy and included HTML content in cache fingerprints so this policy reaches installed offline copies.
- The policy passes Chromium/WebKit checks with zero intercepted network dispatches and no injected-script execution. Both offline browser suites and the Laya adapter suite still pass. Build fixtures verify HTML-only and artwork-only cache invalidation. Chromium's synthetic CSP request events are classified by their explicit CSP failure; all actual external network requests remain rejected.

## Restore pre-Phaser games (2026-10-08)
- User rejected the Phaser rewrite and requested a return to the previous version. They clarified that future visual work should enhance existing 2D renderers with PixiJS and target ages 11 and 13.
- Archived unfinished teen-style changes in a local Git stash. Reverted the Phaser migration without rewriting published Git history.
- Restored the eight original Canvas/DOM games and their Laya adapters, touch controls, saves and shared helpers. The two Three.js games and configured Laya service remain.
- Preserve the later same-origin script policy and content-based offline cache invalidation. No PixiJS migration is part of this rollback.
- Validation passed: production build; eight-game Chromium/WebKit gameplay outcomes, touch controls, saves and 320/390/768px layouts; all ten games offline with cached reload and Cargo worker hints; seventeen Laya core cases; ten restored Laya adapters in both browser engines using controlled transport (decisions, pause, late replies, separate saves and takeover); script policy and content-based cache checks.
- Confirmed game sources, shared helpers, styles, public gameplay assets, dependency manifests and AGENTS.md match pre-migration commit 984b8d5. Only offline safeguards, their verification and documentation remain newer.
- Reviewed restored hub and gameplay screenshots. Future PixiJS work should enhance rendering and effects around the existing mechanics, with a visual direction appropriate for ages 11 and 13.
