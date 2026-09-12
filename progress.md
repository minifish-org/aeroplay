Original prompt: Revisit all games in this project and make them more fun to play.

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
