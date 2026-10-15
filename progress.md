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

## PixiJS rendering enhancement (2026-10-08)
- User authorized implementing PixiJS on the restored pre-Phaser baseline. Preserve game rules, input, storage and Laya; improve rendering, animation and effects for ages 11 and 13.
- Start with a faceted Match-3 presentation, then extend reusable rendering/effects infrastructure across the eight 2D games. Keep both Three.js games.
- Use local dependencies/assets, deterministic visual time, reduced-motion support and explicit asynchronous renderer teardown. No automatic model or network dependency in human play.
- Implemented the default refined arcade direction: navy surfaces, bright readable elements, faceted gems and beveled tiles. The Laya settings button has explicit high-contrast colors.
- Added separate Pixi presentation classes for all eight restored 2D games. Native game rules, input, saves and Laya adapters remain; both Three.js game implementations are unchanged.
- Shared rendering provides pooled board sprites, locally generated materials, bounded GPU particles, temporary glow/shockwave filters, floating score feedback, interpolation and reduced-motion support. 2048 and Sudoku numbers stay above effects for readability.
- Reuse one canvas and renderer across 2D navigation. Dispose each scene's textures, filters and listeners, cancel pending initialization safely, sleep while idle or paused, and destroy the renderer on page exit. This avoids WebKit context exhaustion on repeated navigation. Canvas fallback omits GPU filters.
- Replaced hub emoji illustrations with local screenshots of the presentation classes and live Maze/3D scenes. Ten JPEG previews total about 712 KiB. Adjusted Tetris sizing so its touch controls fit common phone viewports.
- Validation passed in Chromium and WebKit: all eight gameplay suites (scores, outcomes, hints, undo, saves and 320/390/768px layouts); Pixi visual feedback, notes, cascades, merges, reduced motion, GPU-free fallback, idle/paused rendering and rapid navigation with one GPU context; both full Three.js suites; and all ten Laya UI adapters using controlled transport (pause, late replies, save isolation and takeover).
- The production build and both offline browser suites passed with 44 cached resources, all ten games, cached reload, local saves and offline Cargo worker hints. Script-policy checks passed in both engines. Seventeen Laya core cases and cache-boundary/content-fingerprint fixtures also passed during this implementation.
- Reviewed the required development-client screenshots and state output for every 2D presentation. No physical iPhone/Home Screen check or current real-model gameplay session is claimed.

## Continuous 2D animation (2026-10-08)
- User found the presentation attractive but requested visible transitions between actions instead of abrupt state replacement.
- Implement sequential slide/merge/spawn and swap/clear/fall actions, readable motion for arcade and Maze movement, soft lamp and Sudoku transitions, and animated overlays. Preserve rules, saves, offline assets and Laya.
- Verify intermediate frames and rapid consecutive input, in addition to final gameplay state, reduced motion, paused rendering and offline reload.
- Added reusable scene-clock delays, easing and independent tween channels, with cancellation on disposal and immediate reduced-motion resolution. Animated board reveal and game overlays retain readable pause screens.
- 2048 retains source tile identities through movement, merges after contact and introduces new tiles afterward; queued input catches up in order and undo cancels the sequence. Split its presentation into a dedicated view module.
- Match-3 completes swaps before fade/shrink and staggered falling; invalid swaps travel fully and return. Tetris animates landing, fading lines and row collapse, pausing next-piece gravity until the sequence finishes.
- Maze follows queued waypoints and delays star collection until arrival. Snake moves across cells and eases turns; Flappy eases pitch and adds flap compression. Lights blend brightness and Sudoku moves selection, introduces numbers and fades erased text.
- New intermediate-frame verification passes in Chromium and WebKit for all eight presentations, including rapid input, undo, animation pause, real frame completion, navigation cancellation and reduced motion. Reviewed sliding/contact, gem clear/fall and row-collapse screenshots.
- Final validation passed: production build; eight-game gameplay and 320/390/768px layouts; Pixi idle/paused rendering, repeated navigation, reduced motion and Canvas fallback in both engines; all ten Laya UI adapters with controlled transport; seventeen Laya core cases; Pages-style offline reload and all ten game mounts with 44 cached resources in both engines; script policy and cache-boundary/content-fingerprint checks. Reviewed every required development-client screenshot/state output without browser errors. Physical iPhone/Home Screen and real-model sessions remain unverified.

## Reliable Laya flight control (2026-10-09)
- User requested making Flappy Bird play normally under Laya after diagnosing poor action choices and expired real-time observations.
- Live model probes reproduced incorrect flap/wait choices with the original prompt and roughly 0.59–0.66-second round trips. The original 0.12-game-second observation buckets expired during inference despite 18% watch speed.
- Plan short, collision-checked flight actions with explicit predicted outcomes; keep the decision state stable while waiting, and let the real model choose each action. Preserve human physics, input, records and all other adapters. Verify real-model flights rather than only transport integration.
- Implemented pure shared flight constants, collision checks and candidate forecasts, including the full upward arc and approaching pipes. Model inputs use concise outcome summaries with simple action labels; putting comparison details only in choice descriptions remained unreliable in live probes.
- Replaced expiring time buckets with bounded 0.16-second flight steps. Bird and pipes hold at decision boundaries; each accepted model answer starts exactly one step. User pause, cancellation and takeover keep their existing controller lifecycle.
- Real-model Chromium flights passed 12, 25 and 25 gates across seeds 1, 42 and 2026, scoring 20, 46 and 43 points. Every applied action came from the service response; the two longer flights reached minimum-gap difficulty. Browser requests were relayed through Node to the actual configured service, so these checks do not claim physical-device private-network permission coverage.
- A real-model WebKit flight using normal browser animation frames passed six gates and scored twelve points across 81 decisions. The real service used the pinned `convaiinnovations/laya` model; median Chromium decision round trips were approximately 0.33 seconds.
- Local verification passed: production build; both human gameplay suites; seventeen Laya core cases; all ten fake-transport Laya adapters in Chromium and WebKit; flight planning/lifecycle checks in both engines; production Pages-style offline reload, all ten games and 44 cached resources in both engines; cache-boundary/content-fingerprint and script-policy checks. Held inference, full upward arcs, approaching pipes, pause/resume, rejected late replies, takeover, loss/retry, save isolation and navigation are covered. The required game-development client screenshot and state were inspected without browser errors.

## Q8 Vulkan deployment and asynchronous flight (2026-10-11)
- User authorized replacing GMK Laya with Q8 Vulkan, removing inference-induced flight pauses, testing and publishing.
- Added the bounded native backend and a two-container deployment with private inference networking, verified artifacts, GPU permissions, readiness and explicit failures. GMK now serves Laya Q8 at the existing 8448/18771 endpoint; stopped PyTorch rollback container and script retained. Candidate and production probes checked all ten adapters, CORS and private-network preflight. Native failure/readiness/recovery was exercised before switching.
- Flappy predicts the next action boundary during continuous fixed-step flight. Responses are queued, applied only at the matching boundary and revalidated; missed or expired replies do not pause flight or synthesize a rule action. Accepted queues survive user pause; outstanding replies are invalidated, and takeover discards machine plans. The shared controller detects game end while a request is outstanding.
- Build, 17 API/native boundary tests and 18 shared core cases passed. Continuous-flight lifecycle and all ten Laya UI fixtures passed in Chromium and WebKit, including late replies, queue boundaries, pause/takeover, model failure/recovery and pending cancellation at game over.
- Fixture flights passed 12 gates for seeds 1, 42 and 2026. Normal browser-frame GMK Q8 flights passed 6 gates for all three seeds; seed 42 passed 25 gates with 267 applied actions and no missed boundaries. WebKit passed 6 gates. Official game client showed a completed gate and continued flight without errors. Human controls, narrow layouts, offline reloads/saves/all ten games, cache invalidation and script policy passed in both browser engines. API/Compose source hashes match deployed files.
- Commit 22e3f750b846a2d04cc034b937b4bfbf2b7c78c1 pushed to main. Cloudflare workflow 38128021980 succeeded; public index, service worker, main JS and Flappy JS match local build bytes. Desktop Chrome loaded the new continuous-flight copy and directly reached GMK via its configured tailnet endpoint; 8 gates, score 14, 96 decisions observed at gate 7, normal pause and no console errors. Physical iPhone/Home Screen validation remains outside this desktop run.

## Browser-local Decision Model experiment (2026-10-12)
- User requested TypeScript, offline browser inference, WASM first, a resident lightweight Decision Model, unchanged game logic, and switchable Laya benchmarking.
- Selected pinned TAMEV-Nano 14.4M current INT8 graph; ONNX Runtime Web runs in a resident dedicated worker with local tokenizer files. Model preparation verifies hashes; no runtime Hub/CDN downloads.
- Kept all game modules and existing observation/action contracts unchanged. Added provider selection in shared AI settings, preserving the Laya address and assisted save ownership.
- Real Chromium/WebKit WASM probes pass. Production Chromium cold reload offline, model residency across navigation, pause/takeover, save isolation and provider switching pass.
- Initial 120-observation corpus: short Flappy plans perform well; several other games select poor moves, and Match-3/Sudoku/Cargo initial states exceed the 128-token budget. Strict failures have no fallback or silent truncation. Further validation and measured report are in progress.

- Found and excluded stale upstream model_int8_web.onnx (September 27 weights). Current model_int8.onnx runs directly in WASM. Final corpus and report use only its October 2 weights at pinned repository revision.
- Final 120-observation/two-repeat comparison: local accepts 222/240 (18 explicit input-budget errors), 210 correct; paired Laya 206/222 correct. Flappy dominates this small corpus; per-game limits and proxy labels are documented in services/decision/README.md.
- Local Chromium/WebKit p50/p95: 32.8/110.1 ms and 21/99 ms; Laya paired HTTP path: 93.8/236.5 ms on a different machine. WASM linear-memory capacity after corpus: 83.06 MiB, excluding browser overhead.
- Current real-time Flappy seed 1 passed eight gates with 104 requests and zero missed boundaries. Both production browser offline/residency/switching verifiers pass; native basic-optimization top-1 agrees on 111 observations, with nonidentical probabilities.
- No game logic/renderer changes, commit, push or deployment. Remaining external QA: physical iPhone Safari/Home Screen and WebGPU; model quality and larger input support need further work before a ten-game replacement.
- Final build:decision, all-ten-game offline regression in Chromium/WebKit (53 cached resources), existing Laya UI regression in both engines, local runtime boundaries and script-policy checks passed. Added a portable measured JSON summary beside the report.

## TinyDecide comparison (2026-10-12)
- User authorized TinyDecide's built-in JavaScript engine, keeping game logic unchanged and comparing the same corpus against TAMEV and Laya.
- Pinned upstream release aa745b73a2db9a43bce731f0e8e5c90a6899fe2c, copied the official JS engine/types unchanged, and verified Q4 model/meta hashes. Engine expands weights to 39.71 MiB of Float32 tensors; model file is 5.90 MiB.
- Added a dedicated resident TinyDecide worker through a shared bounded RPC/lifecycle helper. Preserve state/question/options; reject native 127-state/192-question token overflows and unsupported one-option requests explicitly. Three-way measurements and offline validation are in progress.
- Final same-corpus results (120 observations, two repeats): TinyDecide accepts 214/240, TAMEV 222/240, Laya 240/240. Common 214-request accuracy: 28.0%, 95.3%, 94.4%; Chromium p50/p95: 303.2/874.6 ms, 36.0/106.3 ms, 92.7/192.6 ms.
- Chromium worker retained allocation estimates after GC: TinyDecide 41.43 MiB, TAMEV 88.34 MiB; these exclude browser overhead and are not physical RSS. Laya CPU RSS is ~143.34 MiB, GPU memory unmeasured.
- TinyDecide Chromium/WebKit picks and input errors agree for all 240 requests; Node parity checks 107 accepted observations. Both production offline/residency/switching proofs pass; Sky game-client screenshots inspected. A real-time Flappy seed-1 run reached zero gates and paused on a single-option input after seven requests; this is a failed strategy target, not an integration pass.
- Added frozen corpus and portable three-model comparison. New report: services/decision/tinydecide-comparison.md. Game modules and engines remain unchanged. No commit/push/deployment. Physical iPhone testing remains outstanding.


## TinyDecide Q4 ONNX/WASM conversion (2026-10-12)
- User stopped further native JS testing and requested an optimized WASM/ONNX version. Converted the pinned ELECTRA choice path directly in ONNX without torch, retraining or new activation quantization; preserve source Q4 values/scales through MatMulNBits, decode only selected embedding rows.
- Graph: 6,955,425 bytes, 73 Q4 projections, SHA-256 22a0d446964890745c1f6f5ced38369e1bfb3388922409feb6ed52aa55124aa7. Build preparation generated the same hash in a fresh converter environment. Source binary stays in a build cache; model/runtime/meta/license are bundled offline.
- Same frozen 120 observations, two repeats, final browser runs sequential: Chromium p50/p95 20.7/47.2 ms; WebKit 22/48 ms. Compare captured JS 303.2/874.6 ms; no JS inference rerun. Choices agree on every 214 accepted request in each engine; maximum probability drift 7.500536887139475e-7.
- Coverage remains 89.2%, common-input reference accuracy remains 28.0%; TAMEV/Laya archived same-corpus common accuracy 95.3%/94.4%. Runtime conversion does not improve checkpoint policy or one-option/long-input support.
- WASM linear capacity 27.75 MiB; after-GC worker allocation estimate including heap/backing 31.70 MiB versus JS 41.43 MiB and TAMEV 88.34 MiB. Whole-browser loaded RSS delta was larger than JS, so no lower total physical-RAM claim. Physical iPhone not measured.
- Production offline Chromium/WebKit proof and runtime boundaries passed, including cold reload, resident model, provider switching, cancellation, pause/takeover, isolated records and 320px layout. Required game-client Sky screenshots inspected. Real-time seed-1 Flappy still reaches zero gates and pauses on one-option input (six decisions / seven requests).
- Report: services/decision/tinydecide-wasm.md; portable comparison and frozen JS parity outputs committed-ready. Game/engine modules unchanged. No commit/push/deployment.


## Shared player and fair simulation (2026-10-12)
- User selected TAMEV only and requested identical human/AI game mechanics and smoothness, with players differing only in control. Supersedes earlier watch-speed and assisted-route behavior.
- Added a permanent deterministic browser regression; captured failing one-second human/AI clock comparisons for Flappy, Snake and Tetris before fixing their gameplay branches. Baseline evidence is in output/player-fairness/clock-before-refactor-chromium.json.
- Added Player, HumanPlayer and TamevPlayer. The player owns input authority, cancellation and asynchronous decisions; games own physics, timing, rules and one typed input handler. Failed inference never pauses the game.
- Switching to AI now keeps the same board, difficulty and current state; that run's record ownership becomes AI permanently, including later human takeover. New mounts retain isolated ownership for delayed saves.
- Flappy now has one normal-speed update path and immediate flap/wait inputs; Snake and Tetris speed scaling removed. Tetris AI receives one native control per decision rather than an instant placement macro. Remaining game ports and validation in progress.

- Completed all ten game ports. Human and TAMEV inputs reach the same typed handler; removed AI placement/walking macros, solver-only candidate assistance and watch-speed branches. Match-3 and Sudoku use the same selection steps as human input.
- The active UI uses TAMEV only. One shared loading promise and resident worker avoid repeated initialization. Standard decision preparation bundles only TAMEV; previous TinyDecide binaries were moved to the ignored experiment archive.
- Permanent core checks passed eight lifecycle/ownership cases. Identical-input comparisons passed all ten games in Chromium and WebKit; held-decision clock comparisons passed Flappy, Snake and Tetris in both engines. Existing human gameplay, responsive layout and 3D suites passed in both engines. The required game client showed continuous real-TAMEV flight; screenshots and state were inspected without browser errors.
- Final build:decision passed after all code changes. README now describes the shared player contract; historical benchmark reports are explicitly archived. No commit, push or deployment performed.
- User requested a quick finish and no repeated verification. Stopped additional testing after the completed checks and build.

## Controller-owned AI planning (2026-10-13)
- User authorized restoring planning in the AI controller, keeping human rules, speed and native operations identical, never waiting for AI, and limiting repeated verification.
- Added an isolated planning worker and visible-state snapshot contract for all ten games. TAMEV selects concise candidate-plan summaries; the controller sends one native input at a time and validates state/trajectory before every step. Physics, game clocks, RNG, scores, hints and input handlers remain unchanged.
- Added bounded flight beam search and trajectory prefetch, future Snake routes, reachable Tetris placements, Maze routes, Cargo push search, Lights Out sequences, visible-board Sudoku constraint search, Match-3 selection sequences and 2048 spawn-aware lookahead. Planner calculations do not access stored Sudoku answers or future random state.
- Extracted existing Tetris, Lights Out and 2048 pure rules without changing their implementation, so controller predictions share the game rules. Accepted and prefetched plans are cleared on pause, takeover, backgrounding and navigation. No remote or rule-player fallback was added.
- Eleven core lifecycle/plan cases and all ten pure planner/guard cases passed. Initial normal-frame real-TAMEV check produced seven native inputs and one Flappy gate with continuous flight and successful takeover, but several trajectory replies expired; increased prefetch lead before the focused recheck. Required game-client screenshots were inspected.
- Final focused real-TAMEV flight after increasing prefetch lead: 27 native inputs, one gate and distance 506 over 4.5 seconds, successful takeover and no browser errors. Final production build and whitespace check passed; latest gameplay screenshot inspected. This is an execution check, not a win-rate benchmark. Stopped further validation as requested. No commit, push or deployment.

## Robot Pushball prototype (2026-10-13)
- User selected a fixed human-versus-AI robot ball-pushing game and clarified that the existing TAMEV + controller-owned planning architecture must be reused. Added a lazy Three.js game with a fixed orthographic arena, shared planar physics, momentum-based ball pushing, equal dash cooldowns, first-to-three scoring, pause/results/replay, synthesized optional audio and personal match records. No multiplayer or network service.
- Two shared Player instances control separate robots. Added five forecast alternatives, a lightweight planner worker using AIPlanner lifecycle, timed trajectory/goal-epoch guards and expiring native controls. TAMEV selects the plan; no rule opponent or model failure fallback. The hub skips watch/takeover controls for versus games. Initial rule-only drafts were converted to planning/controller integration.
- Rules, equal-speed/collision/dash/scoring cases, guarded native plan replay, the ten existing pure planners and eleven shared Player cases passed. Added a focused imminent-winning-goal regression: predicted scoring during inference lead produces a bounded model-selectable stop, not a false no-plan error. Updated existing hub/category/offline assertions for eleven games and three 3D games; the entire older browser suite was not rerun.
- Chromium passed real-model native inputs, keyboard/dash, simultaneous touch joystick/dash, pause/resume, graphics interruption, teardown/remount, 320/390/768px layouts and zero external requests. Production offline proof covered 57 cached resources, cold local inference, resident remount, scoring/results/replay and personal records. A sideline-human execution finished 0-3 in about 16 game seconds with 79 real TAMEV inputs; this is not a win-rate benchmark. Final focused production endgame and cold-offline reload passed without AI errors. Screenshots were inspected.
- Fixed phone-height overflow and a first-install ERR_CACHE_WRITE_FAILURE reproduced while graph loading overlapped precaching. TAMEV local-file requests bypass HTTP disk cache while retaining service-worker Cache Storage offline reads. Final production build passed. Local preview: http://127.0.0.1:4193/#pushball. No commit, push or deployment. Physical iPhone Safari/Home Screen, WebKit for this new game, sustained performance and competitive model quality remain unverified.

### Corner dead-ball repair
- User reported that balls at all four square corners could not be retrieved. Reproduced the unreachable pocket with a failing pure regression before changing the rules. Replaced square corner pockets with 2.4-unit curved bumpers, disc-radius-aware projection and normal-based ball reflection. Rendering, robot target constraints and forecast physics share the same arena geometry; no idle rescue impulse, reset, teleport or AI-only force.
- Added an optional wall-release candidate for TAMEV, based on tangential ordinary movement. Thirteen pure cases pass, including all four corners, both robots, both tangential directions, guarded corner-plan replay, walls, goals, dash, pause and normal plan expiry. Chromium native-control regression and production build passed; inspected the curved arena screenshot. Stabilized the multi-touch test with a fresh kickoff so a goal cannot reset its joystick or cooldown mid-gesture. This repair has not been committed or deployed.
- User authorized committing and pushing Robot Pushball and its corner repair. Stage only this feature and its required shared integration; preserve unrelated Laya/model experiments and earlier uncommitted progress notes. Verify the staged release snapshot before pushing main.

## Laptop and phone layout pass (2026-10-14)
- User asked for macOS Safari and iPhone support: landscape where it fits, boards as large as the screen allows. The first attempt (widening columns) was rejected: the real problem was button chrome, so the rules became "no button where swipe or keyboard already works" and "controls that belong to play live inside the play area".
- Audited all eleven games in WebKit at 1512x982, 390x844 and 844x390 first: portrait overflowed by 11-41px on four games, landscape stacked 646-1020px of content into a 390px viewport, and laptops showed 240-420px boards inside a phone-width column.
- 2D games now own one square `.game-surface` (width-driven with a height cap), so the board keeps its aspect everywhere and never stretches. Occasional actions sit in one compact row under the board on phones and beside it on laptops and landscape phones.
- Removed the redundant arrow pads from Snake, 2048 and Maze plus the Flappy control row, because swipe, taps and keyboard already drive those games. Tetris keeps move and rotate in the surface's left gutter, Drop and Hold in the right gutter, and its previews overlaid top-right.
- 3D controls moved into their scenes: Pushball's score line, stick, dash and pause pills ride on the pitch; Cargo overlays the level header, status, D-pad and actions on the island; Sky docks steer, boost and pause inside the flight view. Each scene now fills the whole game area.
- 3D cameras follow the viewport aspect: Sky 38-58 and Cargo 31-43 degrees, so wide short viewports no longer shrink the subject. Pushball stays orthographic with a contain fit, and its letterboxed margins are capped by a narrower view.
- Fixed on the way: the shared sidebar rule also matched `.pushball-view` and pushed the pitch into the control column; `mountGameSide` had to learn about the new surface wrapper; percentage-width surfaces need a non-auto grid track.
- Landscape phones compact the game bar, the player switch and the 3D start panels, and hide diagnostic text lines so the scene keeps the available height.
- Added `scripts/verify-layout.mjs`: it asserts that no game scrolls or overflows horizontally at the three reference viewports and writes screenshots to `output/layout-*`.
- Validation: verify-layout (3 viewports x 11 games), verify-games (8 games plus the 320/390/768 layouts), verify-3d (Sky's full flight, Cargo's twelve boards, responsive layouts) and verify-pixi (rendering, one reusable GPU context, reduced motion, Canvas fallback) all pass, and `npm run build` passes.
- Sudoku's keypad deliberately keeps two rows of digit keys: they are the game's primary input and have to stay at touch size.


## Play-panel pass: control chrome (2026-10-14)
- Review found two layout faults: the desktop snake board was stretched and the tetris panel scattered its controls across the screen. The fix direction was "no button that a swipe or a key already covers, and every remaining control inside the play area".
- Each 2D game is now one panel: a status strip on top (score plus its action pills), the board with a fixed aspect ratio, and a hint strip below. The strips and the board share one width variable (`--panel-cap`), so phone, landscape and laptop only differ by one number.
- The board is only ever sized by width, never by max-height, which is what had stretched the snake grid into a flat rectangle.
- Tetris lost its Hold slot entirely (input type, key binding, AI candidate, preview column and button) and now keeps previews plus Start on the top strip, move on the left rail and rotate/drop on the right rail, both hugging the well.
- 3D scenes and the sudoku keypad keep their own overlays; the arrow pads stay deleted.
- Bugs fixed on the way: the panel CSS had made `.pixi-board` static, so the DOM grids anchored to the panel and covered the buttons (match3, sudoku); grid cells inherited a 44px touch minimum that overflowed the board in landscape; percentage widths inside auto grid tracks collapsed the surface to zero.
- Sudoku on a landscape phone is the one documented exception: a 9x9 grid plus ten keys cannot fit 390px of height, so `verify-layout.mjs` allows that single route to scroll.
- Validation: verify-layout (3 viewports x 11 games), verify-games (8 games plus 320/390/768), verify-3d and verify-pixi all pass.


## Three-only eight-game rewrite (2026-10-15)
- User request: destructive rewrite to one Three.js framework, eight games, in-stage HUD/controls, iPhone/MacBook only, existing local TAMEV capability; local staged main commits and one verified final push.
- Page review and 27 before viewport screenshots completed; user authorized the complete rewrite and direct final push.
- P0 removes the eleven-game presentation/AI assembly, Pixi stack, DOM boards, settings, old CSS and old verifier entrypoints; preserves reusable pure source snapshots for migration and model preparation/deployment assets.
- New eight-game directory skeleton, styles/tokens and architecture documents created. Functional game/AI migration and consolidated verifier coverage follow P1-P4.
- P0 committed as 90451be: +552/-15931 text lines; source110/CSS26; build passed; removed render/game/verifier code is replaced in later stages, not considered validated coverage.
- P1 adds the shared persistent Three stage (three-point lights, ACES, shadows, bounded effects), accessible in-stage HUD, reserved input/play bounds, common input/clock/storage/audio and compact eight-card hub. Build and required browser client passed after refreshing Vite optimized dependencies; the fresh stage screenshot was visually inspected.
- P1 committed as85f01dc: +516/-63 text lines; source533/CSS54; build passed.
- P2 2048: new pure model + fresh Three tiles/HUD; native merge,20-stepundo,restart,oldsave restoration and dead-board settlement passed inWebKit. Shared fixes keep SVG button clicks separate from board pointercapture, restore boardkeyboardfocus, size Safariselects explicitly, and release stale GPU objects on context loss while retaining CPUscene/one renderer. Three-view before/after screenshots are in docs/screenshots/2048.
- P2 Lights Out: fresh Three lamps and compact HUD preserve minimum-tap targets,Undo,localhints,same-boardRetry,star rating,next puzzle and legacy state-v2. Native WebKit fullsolve/undo/retry/next/reload passed; before/after screenshots cover all3targetviewports. Build passed.
- P2 Flappy: fresh Three view and in-stage controls preserve the existing game; native Space flight through two gates, P pause/resume, collision/retry and best restoration. Build passed; three before/after screenshot pairs saved in docs/screenshots/flappy.
- P2 Sudoku: fresh Three view and in-stage controls preserve the existing game; all three puzzles, real mesh selection and digit-center taps, notes/undo/hints/timer and legacy restore. Build passed; three before/after screenshot pairs saved in docs/screenshots/sudoku.
- P2 Match-3: fresh Three view and in-stage controls preserve the existing game; full native round to settlement, cascades/scoring/hints/restart/next and stable save restoration. Build passed; three before/after screenshot pairs saved in docs/screenshots/match3.
- P2 Cargo: fresh Three view and in-stage controls preserve the existing game; all twelve minimum-push puzzles, native delivery/undo, stars and legacy restore; worker hint awaits P3. Build passed; three before/after screenshot pairs saved in docs/screenshots/cargo.
- P2 Sky: fresh Three view and in-stage controls preserve the existing game; full native sector, ring/streak/boost/shield/pause and cumulative next sector. Build passed; three before/after screenshot pairs saved in docs/screenshots/sky.
- P2 Pushball: fresh Three view and in-stage controls preserve the existing game; unchanged physics, native held inputs/joystick/dash, pause and records; full TAMEV match awaits P3. Build passed; three before/after screenshot pairs saved in docs/screenshots/pushball.
- P2 aggregate: +2050/-72 text lines across the eight requested game commits; source 2502/CSS 54 lines. Each P0/P1/P2 committed snapshot also builds independently from git archive with only the dependency directory shared.
- P3 restores eight immutable planners and genuine resident local TAMEV inference. Actual WebKit evidence includes a complete watched Lights Out round, pause/resume, takeover and personal-save restoration, runtime budgets/cancellation, cross-navigation initialization reuse, and a complete first-to-three Pushball match. Build:decision verifies all five pinned model resources and builds successfully.
- P3 preservation repairs retain the human Cargo Hint's original 20,000-node solver without AI fallback or model initialization, paused Pushball New match, last-direction idle dash, Escape/WASD controls, Sky upward-swipe boost and keyboard start/resume, and Flappy's repeat guards. Paused Sudoku/Match-3 panels resume the correct owner; paused static games stop drawing; AI loading/errors survive ordinary HUD refresh. Sudoku selection is announced accessibly without a DOM board.
- P3 graphics interruption pauses simulation, rejects native inputs, disables recovery until graphics return, and keeps Back reachable. The one renderer retains CPU scene resources and resumes only after an explicit user action.
- P4 working tree: readable formatting yields source 5183/CSS 481 lines; all seven scripts total 1752 lines, and every model+view+HUD is at most 430 lines. Eight actual Three preview images replace old artwork; unused SVG assets are removed. All 27 requested final page captures and tracked hub comparisons are complete. README, page decisions and delivery measurements are updated; build:decision passes.
- Final layout and AI suites pass. Seven solo gameplay paths pass, but mandatory real Pushball completion can stall on the inherited Defend choice; complete gameplay/offline suites remain failed. A dropped prompt word was restored with a permanent actual-WASM regression. The second fixed point reproduces identically in the baseline. An outside-repository stationary-plan-filter prototype oscillates and was not applied.
- Production Chromium cold-cache play, actual local inference/residency, and independent cache update/removal/cold reload checks pass with 33 cached resources and the server stopped. Automated WebKit CacheStorage returns empty entries even for an independent two-resource worker; controlled Chromium comparison passes. Physical iPhone/Home Screen testing remains outstanding.
- P4 is not committed or pushed. Final logs retain failing and passing trajectories separately; the old production deployment remains unchanged. User clarification was requested before changing inherited AI selection behavior beyond the preservation boundary.
- Delivery audit confirmed all source/style/script and per-game line budgets, all 54 screenshot sizes, local document targets, eleven phase deltas, and 33 precache resources. The metrics snapshot now reflects 1752 script lines. The unpublished baseline commit is identified as local instead of linked to an unavailable GitHub tree. The updated offline harness is explicitly marked for a complete recheck; its archived failure and separately verified remainder remain distinct.
- A second bounded outside-repository diagnosis tested only the Defend half-field comparison, with the exact pinned WASM argmax, mounted context/question, original guards and held-control lifetime. The condition flip cleared the second fixed point but stalled at 0–2, and regressed the first corner into stationary Wall release/Defend. Neither 150-choice replay produced a winner. Mirrored defense inputs remained symmetric. The experiment was rejected as a sufficient repair; production AI source and release gates remain unchanged.
- Scope audit clarified that the request forbids new AI capabilities, not fixes to existing selection behavior. The earlier clarification prerequisite was an overly conservative interpretation and was withdrawn. A bounded correction to existing candidate validity and unreachable geometry is being evaluated with the same pinned model, six strategies, native input, clocks and strict completion assertions.
- P4 final correction adds 19 source lines for threat-based eligibility of existing Defend and stationary forecast rejection. Steering, physics, geometry, pinned model, question/context, clocks and input guards are unchanged. Captured mirrored regressions fail before the correction and pass after it using genuine ONNX, including singleton dispatch; no new strategy or model fallback is introduced.
- Final complete gates pass on frozen source: WebKit layout 131.475 seconds, games 44.45 seconds, AI 24.84 seconds; Chromium cold-offline 51.26 seconds including real first-to-three and cache update/removal/cold reload. Full matches preserve the 90-second deadline, winner 1 and score 3. The Dash touch subtest uses a fresh native New match to avoid a scoring/kickoff race; its cooldown assertion is unchanged. Prior failures remain archived.
- Final source is 5202 lines in 44 files; CSS 481 lines in 3 files; scripts 1855 lines in 7 files. The largest model+view+HUD is 430 lines. Build:decision passes with all five pinned resources; build bytes 31134791, 33 precache entries and cache fingerprint aeroplay-e9f93392bdeb. The native Mac Safari inspection could not run while the Mac was locked; physical iPhone/Home Screen validation remains a stated device limitation.
- P4 final staging contains 99 task files, +5686/-1628 text lines, with no unrelated or remaining unstaged/untracked paths. Source/test fingerprints independently match all four full PASS results. The required browser client was rerun after the correction; active gameplay, native movement/dash, one resident model and no console errors were verified and its latest screenshot inspected. Publication follows the single authorized main push and post-push verification.

## Pocket Cargo screen-aligned camera (2026-10-15)
- User reported that the diagonal view made cardinal controls ambiguous. The Cargo-only island preset now looks straight along the board columns from a higher angle, keeping Three geometry and depth while aligning Up/Down vertically and Left/Right horizontally. Input mappings, saves, hint directions and game rules are unchanged.
- Before/after browser projection confirms the old diagonal drift and zero cross-axis drift after the camera adjustment. WebKit checks pass four native directions, Undo, phone swipes and all twelve level layouts at portrait phone, landscape phone and MacBook sizes. The required game client also exercised a four-direction keyboard sequence; its screenshot and state were inspected with no browser errors. Refreshed the Cargo hub preview and three current page screenshots.
- Final build and complete layout/gameplay/AI/offline verifiers pass: the first three use WebKit, and cold offline/cache-update verification uses Chromium on the freshly built assets. Source/test fingerprints remain frozen throughout; the earlier offline run against the previous dist is retained separately as pre-build evidence. No assertion or game-rule changes were needed.
