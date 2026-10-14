# AeroPlay Page Review

Review date: 2026-10-15 (Asia/Singapore). Status: **confirmed by the user's full-rewrite and final-push instruction**.

This review was delivered with current screenshots before implementation, as required by task section 4. Its baseline describes the pre-rewrite checkout. Implementation and validation progress is recorded in `progress.md`; no partial rewrite is pushed.

## Scope and decision meanings

The target is the hub plus exactly eight games: 2048, Lights Out, Flappy Bird, Sudoku, Match-3, Pocket Cargo, Sky Rush, and Robot Pushball. Snake, Tetris, and Maze are removed after confirmation. Every surviving view is rewritten using Three.js; only the explicitly permitted pure gameplay logic is reusable. Existing level and puzzle data must remain available.

- **Keep** preserves a function, value, or meaningful feedback. Existing renderer/view code is still replaced.
- **Merge** preserves the function or information in the shared in-stage HUD, compact controls, a transient result/state panel, or a one-time hint.
- **Delete** removes redundant presentation or an explicitly retired implementation. Deleting a DOM board or old view never deletes the corresponding game rules, inputs, values, or feedback.

The shared review below applies to every game, with the documented Pushball exception. Each page table adds all of that page's specific elements, including source-defined hidden and result states. Screenshots show actual initial human/ready states; source inspection covers later states. No target mockups are presented as existing screens.

## Verified baseline

The reviewed checkout is local `main` at `2ee86c887447a3f495e8175adb9c4e9e91ae9688`, initially clean and one commit ahead of the local `origin/main` reference. The existing unpushed commit, `Rebuild the 2D play panels and drop Tetris hold`, is preserved. These screenshots describe that local checkout, not a verified production deployment.

| Metric | Current measurement | Rewrite target |
| --- | ---: | ---: |
| `src/**/*.ts` | 59 files; 10,016 lines | At most 6,000 lines |
| `styles/**/*.css` | 6 files; 2,017 lines | At most 900 lines |
| All `scripts/*.mjs` | 21 files; 3,476 lines | At most 2,000 lines, using the task's baseline denominator |
| Verifier-only `scripts/verify-*.mjs` | 19 files; 3,203 lines | Report separately to avoid hiding authoring/model-preparation scripts |
| Registry / candidate-planner games | 11 / 11 | 8 / 8 |
| Optional Watch pages / fixed-opponent pages | 10 / 1 | 7 / 1 |
| Render dependencies | `pixi.js`, `pixi-filters`, `three` | `three` only |
| Main renderer chunks, raw build output | Pixi scene 392.95 kB; Three 559.10 kB | One Three rendering dependency chain |

`npm run build` passed on the unchanged baseline. The new four-verifier suite has not been implemented or run; this review is not release acceptance.

## Current screenshots and measured layout

Captures use the existing local development server, Playwright WebKit, fresh temporary localStorage, service workers blocked, and DPR 1 at the exact CSS viewport sizes. No gameplay state, board, stylesheet, or control was injected. The capture-session directory is dated 2026-10-14, when this review began.

Evidence: [screenshot gallery](../output/playwright/aeroplay-before-2026-10-14/index.html), [raw page observations](../output/playwright/aeroplay-before-2026-10-14/observations.json), and [Cargo/Sky clipping and hit-target observations](../output/playwright/aeroplay-before-2026-10-14/control-observations.json). These are local review artifacts under the existing ignored `output/playwright/` directory.

| Page | iPhone portrait 390×844 | iPhone landscape 844×390 | MacBook 1512×982 |
| --- | --- | --- | --- |
| Hub | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-hub.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-hub.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-hub.png) |
| 2048 | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-2048.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-2048.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-2048.png) |
| Lights Out | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-lightsout.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-lightsout.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-lightsout.png) |
| Flappy Bird | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-flappy.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-flappy.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-flappy.png) |
| Sudoku | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-sudoku.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-sudoku.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-sudoku.png) |
| Match-3 | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-match3.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-match3.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-match3.png) |
| Pocket Cargo | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-cargo.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-cargo.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-cargo.png) |
| Sky Rush | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-sky.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-sky.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-sky.png) |
| Robot Pushball | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-pushball.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-pushball.png) | [Current screen](../output/playwright/aeroplay-before-2026-10-14/macbook-pushball.png) |

Additional evidence: hub full pages ([portrait](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-hub-full.png), [landscape](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-hub-full.png), [MacBook](../output/playwright/aeroplay-before-2026-10-14/macbook-hub-full.png)); the [shared AI settings dialog](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-2048-ai-settings.png); contact sheets ([portrait](../output/playwright/aeroplay-before-2026-10-14/iphone-portrait-overview.png), [landscape](../output/playwright/aeroplay-before-2026-10-14/iphone-landscape-overview.png), [MacBook](../output/playwright/aeroplay-before-2026-10-14/macbook-overview.png)). There are 27 viewport captures, three full-page hub captures, one dialog capture, and three derived contact sheets.

All nine pages opened in all three viewport sizes. The capture recorded no page exceptions or failed requests, and no document-width overflow. This is narrower than full gameplay or offline verification.

| Current issue | Live evidence | Review consequence |
| --- | --- | --- |
| Hub requires scrolling in all three layouts | Document heights: 2,357px portrait, 1,390px landscape, 2,329px MacBook | Remove the hero, filters, descriptions, featured spans, and footer; fit eight consistent cards in the viewport. |
| Sudoku landscape requires scrolling | Document height 510px in a 390px viewport; keypad falls below the captured viewport | Put board and all ten numeric/erase controls inside one stage with reserved input space. |
| Cargo D-pad, Undo, Hint, Restart, and Sound are clipped | All eight button centers are outside a clipping ancestor and cannot hit their buttons in all three sizes | Retain every action and place controls inside reserved stage regions. A positive DOM rectangle is insufficient proof of visibility. |
| Sky steer, Boost, Pause, and Sound are clipped | All five control centers fail the same clipping/hit check in all three sizes | Retain every action; position the control group inside the stage. Ready-state steer/pause disablement is separate from the clipping defect. |
| Existing verifier can miss these failures | `verify-layout.mjs:20-23` omits the hub; `:66-68` exempts Sudoku landscape scrolling; it never checks control hit targets | The replacement must test hub plus eight games without exemptions and check actual visible, reachable controls and playfield separation. |

Cargo/Sky clipping is also explained by source: `.three-view` clips overflow and `.three-canvas` fills its height (`styles/game.css:446-461`), while Cargo's status/controls and Sky's controls/utility remain in normal flow after the canvas (`src/games/cargo.ts:65-74,114-152`; `src/games/sky.ts:54,84-96`; `styles/game.css:582-616,668-690`). `mountGameSide` moves only direct area children, so it does not repair these descendants (`src/main.ts:142-154`). Pushball explicitly positions its control overlays (`styles/pushball.css:55-80`).

WebKit viewport captures are not physical iPhone/MacBook Safari certification. Real safe-area values, Safari chrome, touch ergonomics, DPR behavior, complete result paths, AI play, reduced motion, navigation teardown, and offline cache activation remain implementation-stage validation work.

## Shared game elements

Sources: `src/core/ui.ts:83-114`; `src/core/player-controls.ts:7-59`; `src/core/ai-settings.ts:3-23`; `src/core/audio.ts:4-25`; `src/main.ts:142-193,214-223`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Separate top bar, Back button, game title | Merge | Keep Back and compact title inside the stage's navigation/HUD area; remove the separate page row. |
| Top-right `⚙ AI player` button | Delete | Explicitly retired. It currently exists on the ten optional-Watch games, not the hub or Pushball. |
| AI dialog title, close ×, explanatory paragraph, model-status paragraph | Delete / Merge | Delete the entire dialog. Move useful first-use explanation into the one-time hint and actionable loading/error state into the HUD. |
| `Load TAMEV`, `Loading…`, `Ready on this device` preload control | Delete | Remove manual preload UI; first Watch loads inference. Preserve loading/ready/error feedback at the requesting control. |
| `Play yourself` / `Watch TAMEV` two-button picker | Merge | One icon + short-label mode control, initially Human. Human→TAMEV invokes existing Watch; TAMEV→Human invokes existing takeover of the same run. |
| `Human player` / `TAMEV + Planning · Offline · Same rules and speed` availability line | Merge | Mode identity belongs in the mode control. Remove implementation prose from persistent product UI. |
| Separate AI session panel and its status heading | Merge | One short HUD state for AI control, paused, finished, or takeover; retain accessible live announcements. |
| Long AI session explanation and record-ownership paragraph | Merge | First-use help explains ownership; real errors stay concise and actionable. No permanent explanatory panel. |
| AI Pause / Resume | Merge | Conditional shared HUD action. Where native game pause already exists, use one action controlling game and AI together. |
| Retry AI | Keep | Conditional HUD recovery only on actual AI error; remain distinct from game retry/restart. |
| Take over | Merge | AI→Human activation of the mode control continues the current run. It must cancel queued plans and release native inputs. |
| Watch again | Merge | Preserve a completed-watch replay action in the compact result controls, using an AI-owned run. |
| Personal-profile return currently provided by Play yourself | Merge | Preserve a conditional short-label `Your run` action within the compact controls after AI has been used. It remounts Human and restores the existing personal save; it does not inherently reset the game. Keep Restart, Retry, Next, and New puzzle separate. The single mode toggle still performs Watch/takeover; a continuing AI-owned run must never silently become a personal record. |
| `area.inert = ai` and gameplay-key guard | Keep behavior; replace mechanism | Lock human gameplay inputs while AI drives. Never make the entire new stage inert: Back, mode, Pause, Retry, and focused HUD controls must remain usable. |
| External `.game-side` and under-board `surfaceActions` row | Delete | All UI belongs inside the visible stage; remove the old relocation helper and independent action row. |
| Top/bottom score, hint, and control strips | Merge | One shared stage HUD layout with reserved regions. Preserve values while removing stacked independent panels. |
| Sound On/Off in games that already have audio | Merge | Speaker icon + short label with pressed state in the compact controls; retain the global saved preference and existing cues. |
| Persistent rules / input instructions | Merge | Once-only dismissible entry hint, then no permanent space. Contextual warnings and result information remain available when relevant. |
| Module-loading message | Keep | Transient loading state in the shared stage. Distinguish module loading from model loading. |
| Module-open error + Back to games | Keep | Compact recoverable error state, with Back available. |
| WebGL-unavailable / graphics-restored feedback | Merge | Shared stage error/recovery state. Delete the obsolete suggestion to return to classic renderers, since all retained games use Three. |
| MacBook `F` fullscreen keyboard action | Keep | Existing optional keyboard utility; no new persistent button required. |

DOM is retained for clear HUD text, native buttons/selects, progress semantics, labels, focus, and live status. DOM tile/cell/gem boards and transparent full-board input overlays are deleted. Board hit testing moves to the Three scene; keyboard navigation and meaningful accessible cell/value state must survive without recreating a hidden board.

HUD/control bounds must remain at least 12px inside the stage, additionally respecting `env(safe-area-inset-*)`. Playable board/arena bounds exclude reserved HUD and touch-control regions, so controls cannot cover cells, goals, or required navigation paths. One shared variable-driven layout sizes every game; no per-game media queries.

## Hub

Sources: `src/main.ts:27-140`; `src/games/registry.ts:9-113`.

| Current element | Decision | Result and reason |
| --- | --- | --- |
| `aeroplay ↗` brand | Keep | Compact wordmark; remove decorative arrow or use the shared SVG language. |
| `Your pocket arcade` / `Offline ready` badge | Merge | Show only truthful offline readiness when the cache is ready; remove the marketing fallback. |
| `YOUR OFFLINE ARCADE` eyebrow; `One more round. Anywhere.` headline; hero subtitle | Delete | Duplicated marketing content consumes the height needed for eight visible cards. |
| Hero last-game artwork and `Play [game] ↗` button | Merge | Emphasize the existing last-played card, retaining quick return and `aeroplay:last-game`, without a second large entry point. |
| `Find your next favorite` heading | Delete | The card grid already communicates selection. |
| All games, 3D, Arcade, Puzzles filter buttons | Delete | Eight fixed cards remain directly available; renderer/dimension promotion adds no useful selection step. |
| Eleven clickable cards | Keep / Delete | Keep the eight specified game navigation buttons; delete Snake/Tetris/Maze cards and their metadata/assets/load paths. |
| Card preview image | Keep | Real Three-rendered preview for every game; replace illustration-only previews such as the current Pushball SVG. |
| Emoji card icon | Delete | Use preview artwork and consistent SVG control icons. |
| Numeric index / 3D badge / trailing arrow | Delete | Redundant metadata on an already clickable card. |
| Game name | Keep | Required identity. |
| Description paragraph | Delete | The target card contains preview, name, and one record line. |
| Best/progress line and empty-state slogans | Keep / Merge | One useful local record/progress line; neutral empty-record state. Sudoku should read existing best time instead of `Take your time`. |
| Featured cards spanning two columns versus preview cards | Merge | One card component and equal sizing for all eight games. |
| `No ads. No accounts... Progress stays on this device.` footer | Delete | Remove persistent marketing text; offline operation and local saves remain functional requirements. |

**Final page:** compact brand/offline status plus eight preview/name/record cards. The last-played card provides quick return. No hero, category bar, descriptions, emoji, large footer, or special 3D card layout. All eight cards fit all three target viewports without scrolling.

## 2048

Sources: `src/games/game2048.ts:28-155,201-226,257-282`; `src/games/views/merge.ts:27-30,86-199`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Score and Best blocks | Merge | Retain both in the stage HUD. |
| Restart | Merge | Compact control; reset board/score/moves/history and preserve best. |
| Undo, disabled with no history; `Z` shortcut | Merge | Compact control retaining up to 20 in-memory moves of rollback and availability state. |
| 4×4 DOM tiles, digits, empty cells, CSS animation classes, underlying Pixi canvas | Delete implementation; Keep game | Rebuild cells, values, slide/spawn/merge feedback in Three; preserve swipe and Mac arrows. No transparent tile grid. |
| `Swipe the board to combine matching tiles` helper | Merge | Once-only entry hint. |
| Next milestone, move count, Undo available text | Merge | Milestone/moves in HUD; Undo's enabled state replaces the repeated availability text. |
| `2048 reached! Keep going...` | Merge | Brief milestone feedback; continue play after reaching 2048. This is not a forced game-over condition. |
| No legal moves message | Merge | Compact result state with Undo and Restart reachable. |
| Merge-value popup, bursts, tile transitions | Keep | Recreate bounded score feedback with the shared ≤400ms/reduced-motion rules. |
| AI paused state | Merge | Shared pause indication; board input remains blocked while paused. |

**Preserve:** spawn distribution, merge score, best, current board/score/moves restore, swipe/arrows, and Undo. The actual legacy namespace is **`aeroplay:game2048:*`**, despite route ID `2048`; do not rename it. Undo history is not currently persisted.

**Final page:** Three board with Score/Best/Milestone/Moves, Back/title/mode, Restart/Undo, and conditional AI controls inside the stage. No permanent instruction strip or DOM tiles.

## Lights Out

Sources: `src/games/lightsout.ts:25-150,190-203`; `src/games/views/puzzles.ts:12-30,65-112`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Puzzle, Moves, Perfect target, Lit count | Merge | Keep all four values in the compact HUD. |
| Undo | Merge | Retain move rollback and disabled state in the controls. |
| Hint | Merge | Retain solver outline and its effect on the perfect/star rating. |
| Retry | Merge | Same initial puzzle reset, distinct from loading a new puzzle or Retry AI. |
| Next puzzle, disabled until solved | Merge | Conditional completion action preserving level advancement. |
| 25 DOM light buttons, power glyphs, pressed/cell labels, hint classes, Pixi lamps | Delete implementation; Keep game | Three lamps and scene picking preserve on/off, selection, hint, cross-toggle rule, and accessible state. |
| Cross-toggle instruction and outlined-tile instruction | Merge | Once-only rule hint plus short contextual hint feedback. |
| One/two/three-star solved message, Next unlocked text, `LIGHTS OUT` scene popup/burst | Merge | One readable result with rating and Next; remove duplicate prose/popups. |
| AI paused state | Merge | Shared pause state, no additional panel. |

**Preserve:** solvable 5×5 generation, level progression, minimum-move target, same-board Retry, Undo, solver hint, and stars. `aeroplay:lightsout:state-v2` retains current/initial boards, moves, level, and hints used. Undo does not roll back hints used; history is not saved.

**Final page:** Three lamp board with puzzle/move/target/lit values and Undo/Hint/Retry; Next appears for completion. Shared navigation/mode/AI states stay inside the stage.

## Flappy Bird

Sources: `src/games/flappy.ts:23-158,203`; `src/games/views/flappy.ts:25-199,220-284`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Score, Best, Gates | Merge | Keep all values; Gates differs from score because a centered pass earns +2. |
| Take flight / Flap / Try again | Merge | One state-aware primary scene control; retain tap-sky and Space inputs. |
| Pause / Resume, `P`, hidden-page pause | Merge | One native/AI pause control and paused-state indication. |
| Bird, pipes, dotted gate-center cues, ground, scrolling backdrop | Keep | Rebuild in a Three orthographic view using the existing flight logic. |
| Tap/Space and center-bonus helper | Merge | Once-only input/rule hint. |
| Perfect +2 / gate +1 messages and duplicate scene score popups | Merge | One score popup per event, retaining both reward values. |
| Ready `SUNSET FLIGHT` title and repeated instruction | Delete / Merge | Delete decorative title; keep one short Start state. |
| Paused scene overlay and repeated Resume instruction | Merge | One compact pause state with Resume. |
| Failure points, retry instruction, failure burst | Merge | Result score/best plus retry and bounded failure feedback. |

**Preserve:** ready/playing/paused/over, pipe variation/narrowing, collisions, centered bonus, personal best, tap/Space, and pause. The existing death→ready→playing interaction requires two taps; any intentional simplification must keep ready/result states understandable. Only `aeroplay:flappy:best` is persisted; there is no saved mid-flight run.

**Final page:** flight scene, Score/Best/Gates, shared navigation/mode, state-aware Start/Flap/Retry and Pause. Ready, paused, and failed content appears only in its relevant state.

## Sudoku

Sources: `src/games/sudoku.ts:15-44,56-254,265-360,368-445,491-506`; `src/games/views/puzzles.ts:137-249`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Puzzle n/3, elapsed/best time, mistakes, filled count, solved text | Merge | Keep values in the HUD; solved state becomes one result. |
| New puzzle | Merge | Compact action cycling the existing three puzzles, not same-puzzle Restart. |
| Notes On/Off | Merge | Retain pressed input-mode state. |
| Undo, `Z`, disabled when empty/solved | Merge | Retain board-and-notes rollback; mistakes and elapsed time are not rolled back. |
| Hint count, initially 3; disabled when exhausted/solved | Merge | Keep count and reveal action in compact controls. |
| Separate tools group and 1–9 / Erase keypad | Delete container; Merge inputs | Keep all ten native touch inputs inside reserved stage space. Never substitute Mac keyboard input for iPhone controls. |
| 81 DOM cell buttons, values/notes, givens, peers, same-value/selected/invalid/conflict cues, 3×3 boundaries, Pixi board | Delete implementation; Keep game | Three geometry/labels and scene picking preserve every board cue and protected givens. View reads model state, not hidden DOM classes. |
| Choose cell / Notes helper | Merge | Once-only entry hint. |
| Revealed-cell explanatory text | Merge | Short contextual feedback, with visible revealed/selected cell. |
| `Solved!` / `Solved! Beautiful work.` | Merge | One result with time/best and New puzzle. |
| Hidden/pagehide timer save/pause and AI pause | Keep | Preserve timer, state save, and controller pause behavior. |

**Preserve:** all three puzzles, givens, notes, in-memory board-and-notes Undo, mistakes/conflicts, three hints, selection/navigation, keyboard digits/erase/arrows/shortcuts, timer/best, and current puzzle restore. Ordinary edits currently cap Undo history at 100; note-only edits do not enforce that cap. Existing `aeroplay:sudoku:state-v2` and `bestSeconds` remain readable, including optional notes/hints fields.

**Final page:** Three Sudoku board plus the ten-key input bank and Notes/Undo/Hint/New puzzle in one stage. Puzzle/time/best/mistakes/fill values remain legible. The current landscape scroll exemption is removed; keypad and controls must remain visible without covering cells.

## Match-3

Sources: `src/games/match3.ts:10-227,270-277`; `src/games/views/gems.ts:19-29,128-148`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Level, Score/target, Moves, Best | Merge | Keep all values in the stage HUD. |
| Standalone target progress bar | Merge | Slim accessible meter within the score/target HUD region. |
| Hint | Merge | Retain free two-gem outline and phase-disabled state. |
| Restart level / Next level / Try again | Merge | One state-aware action; retain level increment only after a win and transition lock during clearing/falling. |
| 8×8 DOM gem buttons, five types, coordinate labels, selected/hinted/clear/fall classes, Pixi gems | Delete implementation; Keep game | Three gems retain shape and color distinctions, scene picking, selection, hints, swap/clear/fall animation, and locked transitions. |
| Adjacent-swap/cascade helper | Merge | Once-only entry hint. |
| Free hint and invalid-swap messages | Merge | Short contextual feedback; neither action consumes a move. |
| Match score / big match / cascade multiplier text plus duplicate scene popup | Merge | One score event with chain multiplier and gain. |
| No-available-swaps free reshuffle message | Merge | Brief shuffle feedback; preserve remaining moves. |
| Win stars/moves spared and duplicate LEVEL CLEAR popup/burst | Merge | One result with rating, moves, and Next. |
| Loss target-deficit prose | Merge | Concise result with score deficit and Try again. |
| AI pause / clearing-and-falling suspension | Keep | Preserve phase, clock, and hidden-page suspension. |

**Preserve:** five gem types, adjacency, invalid-swap refund, 3+ matches, gravity/refill, cascades, 30 moves, target `1000 + 350 × (level - 1)`, free hint/reshuffle, stars, progression, best, and stable saved run. `aeroplay:match3:run` and `best` remain readable. The current game has no Undo; do not add it. Saves occur at stable boundaries, not during a falling animation.

**Final page:** Three gem board with Level/Score/Target/Moves/Best, compact meter, Hint and state-aware Restart/Next/Retry. Selection/cascade/result feedback stays in the scene.

## Pocket Cargo

Sources: `src/games/cargo.ts:33-157,194-322,337-449,509`; `src/games/cargo/levels.ts:4-156`; `src/games/cargo/model.ts:22-78`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Numbered/name level select with 12 options | Merge | Accessible compact in-stage selector; retain every island directly selectable. |
| Delivered/total, pushes, Perfect par | Merge | Keep all values in the HUD. |
| Up/Left/Right/Down D-pad | Keep | Visible, reachable in-stage touch controls; preserve swipe and Mac arrows. |
| Undo | Merge | Retain rollback of player/crates/pushes and move decrement, with availability state. |
| Hint | Merge | Keep asynchronous local solver, used-hint star effect, disabled state, and next-step marker. |
| Restart | Merge | Restart current island, clearing moves/pushes/hints/history while retaining saved achievements. |
| Sound in separate two-column action block | Merge | One compact shared control group; retain preference and cues. |
| Persistent level tip | Merge | One-time relevant entry/level guidance; no permanent prose block. |
| Finding route / next direction text | Merge | Short live loading/hint HUD state plus the Three marker. |
| Corner warning, no-route, unavailable-solver messages | Keep / Merge | Actionable state with Undo/Restart/Hint recovery immediately reachable. |
| External arrows/swipe/Z/dock instruction | Merge | Once-only touch/keyboard hint. |
| Completion stars and Delivered panel | Keep | Compact in-stage result with best-per-island rating. |
| Completion moves/pushes and collection-ending prose | Merge | Keep metrics and final-island state; shorten the explanation. |
| Next island / Play from the beginning | Keep | State-aware completion action; retain all 12 islands and wrap to island 1. |
| Island, walls, crates, glowing docks, robot, hint marker | Keep | Rebuild from model snapshots in the shared Three stage; discard old assembly/camera/view code. |

**Preserve:** all 12 level maps/names/par values, push-only rules, local solver/hints, corner warnings, Undo, level selection/progression, stars, sound, and current run restore. `aeroplay:cargo:run` preserves level/player/crates/moves/pushes/usedHint; `stars` preserves achievements. The allowed existing pure model/solver can be reused; old scene and worker wrappers are replaced.

**Final page:** complete visible island with selector/metrics and Undo/Hint/Restart/Sound; D-pad in a reserved control region. All currently clipped controls become usable without hiding docks or crates.

## Sky Rush

Sources: `src/games/sky.ts:43-101,255-359,362-454,485-517`; `src/games/skyState.ts:74-159`.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| Score and Best | Merge | Compact shared HUD values. |
| Sector number and biome | Merge | Retain progression and biome identity in short state text. |
| Rings, streak, shield ready/spent meta line | Merge | Keep all gameplay state in the HUD, without a separate bottom row. |
| Sector-distance progress | Keep | Accessible slim HUD meter inset from the scene edge; retain 1000m sector progress. |
| Score/streak/Boost/shield-saved messages | Merge | Short live event feedback. |
| Left/right steer | Keep | Visible in-stage touch controls, retaining swipe and Mac arrows/A/D. |
| Boost charge/ready/remaining time and charge fill | Keep | One Boost action with disabled/charge/duration state. |
| Native Pause/Resume and Sound utility | Merge | Compact shared controls; unify native and Watch pause behavior. |
| External swipe/arrows/Space/P instruction | Merge | Once-only entry hint. |
| Ready `AEROPLAY ORIGINAL · 3D` eyebrow and marketing heading | Delete | Remove promotional hierarchy from the game state panel. |
| Ready ring/barrier/streak/Boost/shield rules paragraph | Merge | Once-only teaching hint; preserve every rule. |
| Take flight | Keep | Compact Start action, retaining Space/Enter pathways. |
| Pause eyebrow/title/prose and Resume flight | Merge | One Paused state with Resume; remove decorative/repeated copy. |
| Sector-complete title / failure eyebrow and score title | Merge | Short distinct success/failure states. |
| Result rings, maximum streak, meters flown | Keep | Compact result metrics. |
| Next sector / Fly again | Keep | Preserve cumulative next-sector results; failure retry starts sector 1. |
| Flight, rings, barriers, shield, Boost particles, biome art | Keep | Rebuild view from pure `skyState` in the common stage; replace old renderer/camera/scene code. |

**Preserve:** three lanes, ring/streak scoring, one-hit shield then failure, three-second Boost/recharge/double points, 1000m sectors, cumulative next-sector score/rings/maxCombo, best, pause/retry, sound, and native/AI input parity. `aeroplay:sky:best` remains readable; there is no saved mid-flight state. Hidden/context-loss pause remains.

**Final page:** flight scene with compact Score/Best/Sector/Rings/Streak/Shield/distance HUD and reserved steer/Boost controls; Pause/Sound and state-specific Start/Resume/Next/Retry remain visible in the stage.

## Robot Pushball

Sources: `src/games/pushball.ts:18-64,102-202`; `src/games/pushball/input.ts:3-83`; `src/games/pushball/model.ts:1-8,61-195`; `src/games/pushball/policy.ts:60-63`; `src/main.ts:160,178-179`.

This page already has **no settings dialog and no generic Watch picker/session panel**. The human blue side stays human, and the coral opponent stays TAMEV. Do not add a Watch mode for the human side.

| Current element / state | Decision | Result and reason |
| --- | --- | --- |
| External Back/title | Merge | Shared in-stage navigation and identity. |
| YOU/BLUE and TAMEV/CORAL score blocks | Merge | Compact scoreboard retaining clear side ownership and both scores. |
| First to 3 | Keep / Merge | Retain the win condition as compact scoreboard information. |
| Push. Dash. Score. subtitle | Delete | Redundant slogan. |
| Get ready / You scored / TAMEV scored countdown banner | Keep | Brief in-stage goal/kickoff state; retain resets and countdown. |
| LOCAL AI DUEL eyebrow and Push your luck heading | Delete | Decorative marketing text. |
| Blue/top-goal/first-to-three/local-parity explanation | Merge | Once-only first-entry hint; preserve attack direction and rules. |
| Start match | Keep | First explicit match start requests the mandatory local opponent model. |
| Waking up TAMEV / Loading local model, disabled Start | Merge | One loading state and disabled primary control; prevent duplicate starts. |
| Load error and Retry loading | Keep | Short actionable state; never substitute a heuristic opponent. |
| Paused title/prose and Resume match | Merge | Compact pause state; stop both robots/planners and reset human input. |
| Graphics-interrupted state and disabled Resume | Keep | Explicit recovery; Resume waits for restored graphics. |
| Paused New match | Keep | Secondary action preserving fresh-match start. |
| Goal machine / Rematch result headings | Merge | Short won/lost state. |
| Final outcome, score, human wins/matches record | Keep | Compact result data and existing save updates. |
| Play again | Keep | Rematch with resident model reuse. |
| Result Back to games | Merge | Accessible stage Back action, without duplicate external navigation. |
| Joystick, knob/cross, MOVE caption | Keep / Merge | Retain movement, directional feedback, pointer capture/dead-zone/reset, and short accessible label. |
| DASH, Ready/cooldown text and charge fill | Keep | Visible in-stage Dash with cooldown/disabled state and last-direction behavior. |
| Utility Pause/Resume and Sound | Merge | Compact shared controls; retain P/Escape, hidden/blur/context-loss pause and audio. |
| Retry AI during opponent error | Keep | Conditional HUD recovery for TAMEV; no alternate opponent. |
| External TAMEV + Planning / On device label | Merge | Fixed opponent identity belongs in scoreboard/state. |
| Selected plan, waiting/finished text, decision count, inference milliseconds | Merge / Delete | Keep actionable opponent status; delete product-facing plan/count/latency diagnostics while retaining necessary `render_game_to_text` test/AI fields. |
| Opponent inference error and match-continuation warning | Keep | Short explicit state beside Retry AI. |
| External top-goal/joystick/WASD/arrows/Space/P instructions | Merge | Once-only input/rule hint. |
| Arena, robots, ball, goals, rounded bumpers, dash feedback | Keep | Rebuild from pure model snapshots in the one shared stage; discard old view/input/assembly wrappers. |

**Preserve:** fixed human-versus-TAMEV duel, goals/collisions/bumpers, first to three, equal movement/dash rules, kickoff/reset, Pause/Resume/New match/rematch, model-load/inference retry, sound, human wins/matches, reduced motion, and interruptions. `aeroplay:pushball:wins` and `matches` remain readable. The policy generates candidates; TAMEV must continue selecting them.

**Final page:** arena with compact scoreboard/status/navigation and Pause/Sound/conditional Retry; joystick and Dash in reserved edge regions. Start/loading/error/pause/result panels are short and contextual. No generic mode toggle or external diagnostic block.

## Explicit interpretations and preservation boundaries

### One phone breakpoint including landscape

The literal width rule `width <= 700px` excludes the required 844×390 iPhone landscape. This review proposes **one shared threshold on the shorter viewport side: <=700px**, expressed by one common query `@media (max-width: 700px), (max-height: 700px)`. It selects both phone orientations and leaves 1440×900 / 1512×982 in MacBook rules. This is an explicit interpretation for confirmation, not a claim of literal width-only compliance. No per-game media queries are introduced.

### AI counts and lazy initialization

Current source has 11 planner game cases (`src/core/ai-plans.ts:252-265`), not ten. Removing three produces **eight total planners: seven optional Watch games plus Pushball's fixed opponent**. The old ten optional Watch pages become seven. No AI capability is added.

The seven switchable pages initialize inference on first Watch. Pushball initializes on first Start match, because it must load its required opponent and has no Watch control (`src/games/pushball.ts:102-114`). The model remains resident and is shared after successful initialization. Service-worker precaching of model/WASM files remains: file caching is separate from initializing the inference session (`src/core/ai-model.ts:16-27`; `vite.config.ts:21-52`; `public/service-worker.js:1-17`).

Preserve asynchronous candidate planning, read-only snapshots, ordinary input application, stale-plan checks, cancellation on pause/takeover/navigation/hiding, and empty queued inputs after cancellation. Lock gameplay inputs without disabling the new in-stage HUD.

### Existing storage formats

The explicit old-record requirement overrides the old AGENTS instruction to ignore backward compatibility. Existing human data must remain readable with the same key names and shapes. AI-owned runs remain under `aeroplay:ai:<game>:*`; takeover does not convert them to personal records (`src/core/storage.ts:5-8,37-44`). Preserve return to the saved personal run separately from takeover and from game reset/progression actions (`src/core/player-controls.ts:43`; `src/main.ts:156-185`).

| Scope | Existing keys / payload |
| --- | --- |
| Global | `aeroplay:last-game`; `aeroplay:sound-enabled` |
| 2048 | `aeroplay:game2048:state` `{grid, score, moves}`; `best` |
| Lights Out | `aeroplay:lightsout:state-v2` `{board, initial, moves, level, hintsUsed}` |
| Flappy | `aeroplay:flappy:best` |
| Sudoku | `aeroplay:sudoku:state-v2` `{puzzleIndex, board, elapsedSeconds, mistakes, bestSeconds, notes?, hints?}`; `bestSeconds` |
| Match-3 | `aeroplay:match3:run` `{grid, score, moves, level}`; `best` |
| Cargo | `aeroplay:cargo:run` `{level, state:{player, crates}, moves, pushes, usedHint}`; `stars` |
| Sky | `aeroplay:sky:best` |
| Pushball | `aeroplay:pushball:wins`; `matches` |

Delete code that reads retired-game saves; do not erase unrelated old localStorage data. A removed `last-game` ID falls back to a surviving card. Sound/record/progress reads on the hub use human storage. Do not claim save restoration of unsupported data such as Flappy/Sky mid-flight state or unpersisted undo stacks.

### Validation and deployment remain gated

After confirmation, implementation follows P0, P1, one P2 commit per game in the requested order, P3, then P4. Work stays on local `main`. Each stage reports additions/deletions, current source/style counts, and build status. No P0–P3 push is permitted.

The existing pre-commit build remains (`.husky/pre-commit:2`; `package.json:8-13`). Deployment stays main push → GitHub Actions `build:decision` → Cloudflare Pages (`.github/workflows/deploy-cloudflare-pages.yml:3-6,25-33`); CSP, same-origin resources, and automatic service-worker fingerprint/update behavior remain intact. No deployment or infrastructure change is part of this review.

The replacement verifiers must preserve meaningful coverage from the current distributed scripts:

| Verifier | Required evidence |
| --- | --- |
| `verify-layout.mjs` | Hub + eight games × all three viewports; no scrolling/overflow; safe-area-aware reserved HUD/control regions; controls visible and reachable; playable bounds unobstructed. Check active and result states as relevant, including Sudoku keypad and Cargo/Sky controls. |
| `verify-games.mjs` | All eight games open and reach settlement through real game inputs; relevant scoring, Undo, hints, restart/next, sound/input states, and legacy-save restore. Retain native keyboard/touch coverage, phase locks, navigation disposal, and reduced motion. |
| `verify-ai.mjs` | Full existing Watch round, pause/retry where relevant, takeover on the same run with correct record ownership, and complete Pushball match with real local TAMEV. Preserve cancellation/stale-plan and resident-inference coverage. |
| `verify-offline.mjs` | Serve the production build, verify same-origin-only resources, complete precache, then cold browser/app restart from a previously prepared cache without network; games and local AI remain usable. A device with no previously obtained site/cache cannot acquire assets while disconnected. |

No assertions are relaxed to hide failures. The Safari/device checks and new verifier results are outstanding. Push remains gated on successful build, complete layout/game verification, and human confirmation that all nine pages open; all four requested verifier results must be reported at final delivery. After the single P4 push, verify successful Actions, matching deployed/local asset hashes, and changed service-worker CACHE fingerprint.

## Confirmation-stage completion

The hub and all eight pages now have explicit Keep/Merge/Delete decisions, functional preservation notes, source references, and current screenshots at every requested viewport. The shared settings dialog and hidden/result labels have also been reviewed.

The user has confirmed proceeding through the entire rewrite and pushing the verified final result. Local staged implementation now follows this review; game deletion, renderer migration, architecture documents, and tests are tracked by the phase commits and `progress.md`. Final push remains gated by the required checks.
