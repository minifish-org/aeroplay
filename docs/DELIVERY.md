# AeroPlay rewrite acceptance

Updated on 2026-10-15 after the eight-game player experience polish. The original rewrite phases and their historical evidence remain below. [Player experience review](PLAYER-EXPERIENCE.md) records the current phone/MacBook gameplay findings, changes and genuine replays. Current release gates and publication evidence are recorded separately from the earlier P4 measurements.

## Pages and screenshots

[PAGES.md](PAGES.md) contains the baseline element inventory, final Keep/Merge/Delete decisions, current source links, and all tracked comparisons. [Screenshot gallery](screenshots/index.html) shows the hub and all eight games with before/after captures.

| Page | iPhone portrait 390×844 | iPhone landscape 844×390 | MacBook 1512×982 |
| --- | --- | --- | --- |
| Hub | [Picture](screenshots/hub/after-iphone-portrait.png) | [Picture](screenshots/hub/after-iphone-landscape.png) | [Picture](screenshots/hub/after-macbook.png) |
| 2048 | [Picture](screenshots/2048/after-iphone-portrait.png) | [Picture](screenshots/2048/after-iphone-landscape.png) | [Picture](screenshots/2048/after-macbook.png) |
| Lights Out | [Picture](screenshots/lightsout/after-iphone-portrait.png) | [Picture](screenshots/lightsout/after-iphone-landscape.png) | [Picture](screenshots/lightsout/after-macbook.png) |
| Flappy Bird | [Picture](screenshots/flappy/after-iphone-portrait.png) | [Picture](screenshots/flappy/after-iphone-landscape.png) | [Picture](screenshots/flappy/after-macbook.png) |
| Sudoku | [Picture](screenshots/sudoku/after-iphone-portrait.png) | [Picture](screenshots/sudoku/after-iphone-landscape.png) | [Picture](screenshots/sudoku/after-macbook.png) |
| Match-3 | [Picture](screenshots/match3/after-iphone-portrait.png) | [Picture](screenshots/match3/after-iphone-landscape.png) | [Picture](screenshots/match3/after-macbook.png) |
| Pocket Cargo | [Picture](screenshots/cargo/after-iphone-portrait.png) | [Picture](screenshots/cargo/after-iphone-landscape.png) | [Picture](screenshots/cargo/after-macbook.png) |
| Sky Rush | [Picture](screenshots/sky/after-iphone-portrait.png) | [Picture](screenshots/sky/after-iphone-landscape.png) | [Picture](screenshots/sky/after-macbook.png) |
| Robot Pushball | [Picture](screenshots/pushball/after-iphone-portrait.png) | [Picture](screenshots/pushball/after-iphone-landscape.png) | [Picture](screenshots/pushball/after-macbook.png) |

All nine pages were opened and the 27 requested captures were inspected. Additional layout checks cover 1440×900, rotation, active AI, pause, results, GPU interruptions, resource teardown, and reduced motion.

## Structure

```text
src/
  main.ts
  core/
    stage.ts hud.ts input.ts storage.ts loop.ts audio.ts
  ai/
    player.ts tamev.ts planner.worker.ts
  hub/
    hub.ts
  games/
    registry.ts
    2048/ lightsout/ flappy/ sudoku/ match3/ cargo/ sky/ pushball/
      index.ts model.ts view.ts hud.ts
styles/
  tokens.css hub.css game.css
scripts/
  prepare-decision-model.mjs capture-previews.mjs
  verify-lib.mjs verify-layout.mjs verify-games.mjs verify-ai.mjs verify-offline.mjs
```

One shared renderer owns the camera/light authority. Game models have no Three imports. There are no Pixi packages, retired game modules/planners/save readers, DOM boards, AI settings dialogs, or runtime external services. Native controls, existing saves, three Sudoku puzzles, and twelve Cargo islands are retained.

## Measurements

Line counts include readable source formatting and every `.mjs` file in `scripts`, including model preparation and preview capture.

| Metric | Baseline | Current | Target |
| --- | ---: | ---: | ---: |
| TypeScript | 10,016 lines / 59 files | 5,583 lines / 44 files | ≤6,000 |
| CSS | 2,017 lines / 6 files | 391 lines / 3 files | ≤900 |
| Scripts | 3,476 lines / 21 files | 1,938 lines / 7 files | ≤2,000 |
| Games | 11 | 8 | 8 |
| Rendering libraries | Pixi + Three | Three | Three |
| Rendering chunks, raw decimal kB | 392.95 + 559.10 | 552.48 | One Three chain |
| Largest model + view + HUD | 500–900 lines | 432 lines | ≤450 |

| Game | Model + view + HUD lines |
| --- | ---: |
| 2048 | 312 |
| Lights Out | 269 |
| Flappy Bird | 381 |
| Sudoku | 367 |
| Match-3 | 391 |
| Pocket Cargo | 321 |
| Sky Rush | 374 |
| Robot Pushball | 432 |

The current production build is 31,278,965 bytes including the pinned 14,872,474-byte model and 14,239,897-byte WASM. Its service worker precaches 33 resources. Current cache fingerprint: `aeroplay-3d642862081e`; the preceding Cargo camera release used `aeroplay-99bc0be4862c`.

## Phase commits

| Phase | Commit | Added / deleted text lines | Validation |
| --- | --- | ---: | --- |
| P0 skeleton and removal | `90451be` | +552 / −15,931 | Build; source 110 / CSS 26 |
| P1 shared core | `85f01dc` | +516 / −63 | Build; source 533 / CSS 54 |
| P2 2048 | `0113744` | +241 / −16 | Build and native checks |
| P2 Lights Out | `f206874` | +190 / −8 | Build and native checks |
| P2 Flappy Bird | `516c160` | +309 / −8 | Build and native checks |
| P2 Sudoku | `0d65e46` | +269 / −8 | Build and native checks |
| P2 Match-3 | `92fd513` | +260 / −8 | Build and native checks |
| P2 Pocket Cargo | `a7eb5b9` | +211 / −8 | Build and native checks |
| P2 Sky Rush | `3a9257b` | +246 / −8 | Build and native checks |
| P2 Robot Pushball | `6b0e0e2` | +324 / −8 | Build and native checks |
| P3 local AI and preservation | `5afcda9` | +1,172 / −79 | Build:decision, genuine Watch/takeover/match evidence |
| P4 documentation, cleanup and final checks | Commit containing this report | +5,686 / −1,628 | Build:decision and all four complete gates pass |

The pre-existing `2ee86c8`, unpublished at the start of the rewrite, is preserved. Each of the ten P0/P1/P2 snapshots independently built from `git archive` with only dependencies shared; no pending source was borrowed. No phase used a failed-build bypass, branch, worktree or force push.

## Current player polish acceptance

The complete frozen acceptance run passed with unchanged source/runtime/test fingerprint `bab4db9441b8124435ddd0bc433f2763a3ab50ce04d9dee1b089d6e60e2711e1`.

| Check | Result | Current coverage |
| --- | --- | --- |
| TypeScript/Vite build and pinned model preparation | PASS | Existing five local model resources verified; no new runtime dependency |
| Layout, WebKit | PASS · 76.36 s | 36 initial layouts and open menus, rotation, active/paused AI, all settlements, scene-transform reset, menu-dismiss input, idle/GPU teardown/recovery and reduced motion |
| Games, WebKit | PASS · 49.20 s | All eight game flows, original Cargo/Sudoku content, persistent Undo, full paused flight/sector reload, contextual Next/Pause and real first-to-three Pushball completion |
| AI, WebKit | PASS · 23.11 s | Original guards/planners, delayed real-WASM cold Watch freeze, resident reuse, exact personal flight restoration, fresh Watch again, cancellation/takeover and complete Pushball match |
| Offline, Chromium | PASS · 28.65 s | All 33 resources, cold browser restart with stopped server, native controls, real TAMEV, cache activation/removal and new-asset offline reload |

The original full-match deadline, winner and three-goal assertions remain. Hidden menus are excluded from the visible-control measurement; open menus and their summary controls are now checked explicitly in all viewports. Desktop checks use the actual keyboard/mouse paths where phone control banks are intentionally absent. No remaining failure is counted as a pass. New flight reload assertions preserve every durable field and explicitly check that transient boost messages clear on re-entry.

Current logs, fingerprints and metrics are retained locally under `output/player-review/final-acceptance.json`, `acceptance-*.log` and `final-metrics.json`. The earlier failing assertion on intentionally expired boost text is preserved in `before-contextual-phase-fix/`; it was corrected to assert durable fields exactly plus cleared transient text. The gameplay issue found through saved-win Next/Pause has a permanent regression and native replay proof. The tracked [player review](PLAYER-EXPERIENCE.md) and images contain the readable experience evidence. CI and live resource/cache checks follow publication and are reported with the pushed commit.

### Hosting response policy

The first published player-polish commit was `f3c8de1`; its CI deployment succeeded and both domains matched all local resource bytes. A fresh browser on the custom domain exposed Cloudflare's automatically inserted analytics beacon, which the existing CSP correctly blocked. The page-only `public, max-age=0, must-revalidate, no-transform` response policy prevents that injected external script using [Cloudflare's documented mechanism](https://developers.cloudflare.com/web-analytics/get-started/). Hashed game/model/WASM responses retain their existing compression/cache behavior.

[Pages treats `_headers` as deployment configuration](https://developers.cloudflare.com/pages/configuration/headers/), so `_headers` and `_redirects` are excluded from the precache URLs while their contents still participate in the cache version. Permanent build regression checks verify that a policy change changes the version and that unserved configuration is never requested offline. Fresh production browser/cache checks follow this narrow policy publication; CSP and zero-error assertions remain unchanged.

## Historical rewrite acceptance evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Build:decision | PASS | Five pinned model files verified; TypeScript and Vite build pass |
| Layout, WebKit | PASS · 131.5 s | 36 layouts, rotations, all settlement HUDs, active/paused AI, one GPU context, teardown, loss recovery, reduced motion |
| Games, WebKit | PASS · 44.5 s | All eight settlements, twelve Cargo islands, three Sudoku puzzles, native controls/undo/hints/restarts/legacy saves, and a genuine 0–3 TAMEV match in 12.543 simulated seconds / 56 decisions |
| AI, WebKit | PASS · 24.8 s | Eight immutable planners, input/clock/cancellation/ownership/budget guards, real frozen-context and four mirrored captured-state regressions, Watch/pause/retry/takeover/residency, and a genuine 0–3 match in 16.532 simulated seconds / 83 decisions |
| Offline, Chromium | PASS · 51.3 s | Hub-only preparation, closed/restarted browser with stopped server, all eight cold loads and native paths, a genuine 0–3 match in 37.726 simulated seconds / 228 decisions, full watched Lights with the same resident model, cache activation/removal and new-asset offline reload |
| Offline, automated WebKit | Environment limitation | Independent 350-byte service-worker probe also creates an empty cache; identical Chromium probe stores both resources |

Every full match keeps the original 90-second wall deadline, winner 1 and three actual AI goals. Each uses one real resident model initialization with no AI error. The complete offline script also passed its cache-update tail; no partial run is counted as a complete gate.

The Pushball correction changes eligibility of existing Defend to visible own-half threats and rejects stationary forecasts. All six strategy implementations, physics, geometry, model revision, context/question and input guards remain. Permanent regressions first reproduced both fixed points on both sides, then proved guarded progress with actual resident ONNX argmax. A sole viable candidate still dispatches genuine model inference. The original Left flank now has filtered key 0; its label, context and actual ball-movement assertions remain exact. Native Dash testing starts a fresh match to avoid a goal/kickoff resetting cooldown during the tap; its original cooldown assertion is retained.

Final logs, source/test fingerprints and snapshots are retained under `output/final-verifiers.json` and `output/final-*.log`. Earlier failing runs are preserved under `output/pre-planner-fix-final-*`, `output/pushball-failure-*`, `output/offline-pushball-failure-*`, and the captured red/green regression artifacts. These are local QA evidence rather than shipped game assets.

## Remaining risks and device checks

1. Physical iPhone Safari/Home Screen validation is outstanding. Native Mac Safari inspection was attempted while the Mac was locked and could not run. Automated WebKit gameplay/layout and Chromium offline proof are identified separately.
2. The pinned small model can choose slow routes on unusual positions. An isolated first-corner replay made progress and scored but was still moving after 150 choices; it is not claimed as a completed match. The mandatory native and cold-offline full-match paths all passed without changing their assertions.
3. The Three chunk is 552.48 raw kB; Vite reports its existing size warning. The locally cached model/WASM dominate the 31.28 MB offline download. No rendering or physics dependency was added.
4. The existing Actions/Pages deployment is unchanged. Post-push checks must identify the release SHA, compare deployed/local asset bytes and confirm the current release cache fingerprint above; their results are recorded in the release message rather than inferred from local tests.
