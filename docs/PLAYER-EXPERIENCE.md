# AeroPlay player experience review

Review date: 2026-10-15 (Asia/Singapore).

This pass started by playing all eight games from the hub and judging the rendered scenes. The work enlarged the playing areas, simplified recurring controls, clarified feedback and repaired recovery across navigation, reload and Watch. The game rules, original content and local TAMEV capabilities remain in place.

The “Before” observations below describe the first Three.js version encountered during this polish pass. The older pre-rewrite inventory and the three-size page comparisons are in [PAGES.md](PAGES.md). Release, offline and deployment acceptance are recorded separately in [DELIVERY.md](DELIVERY.md).

## How the games were reviewed

- Initial understanding and move choices came from real screenshots and ordinary visible controls. Source, model snapshots, solvers and verifier scripts did not teach or steer those initial sessions. Built-in Hint and Watch were used as player features and are identified below.
- Browser viewports were 390×844, 844×390 and 1512×982. Final phone flows used genuine browser touchscreen taps; sustained 2048 swipes and additional drag, swipe and two-finger checks used trusted Chromium touch events. Desktop flows used keyboard and mouse. WebKit and Chromium were both exercised.
- Screenshots were opened between adaptive input bursts. Action games were paused or advanced in short browser-clock bursts between observations. This checks readable gameplay and complete flows; it does not measure human reaction timing or physical-device frame performance.
- The broad replay used immutable production builds. After later changes, the affected visuals, controls and recovery paths were replayed on the next immutable build. Unchanged rules and earlier progression were not represented as newly replayed on every build.
- Focused model checks, state comparisons, seeded presentation fixtures and the official web-game client supplemented native play after issues had been observed. They are engineering evidence, not additional human victories. Physical iPhone Safari, Home Screen installation and native Mac Safari were not tested in this review.

## Shared changes observed during play

The header now keeps only the current useful values and frequent controls. Sound, restart and occasional actions live in More; short tips no longer repeatedly block entry. Pause, retry, next and result actions appear where the player needs them. Human tools disappear during Watch, while Pause, Take over and returning to the personal run remain available. AI completion offers Watch again and Your run.

The first action-game Watch holds the flight while the local model loads. A focused cold-load check deliberately delayed the model resource by two seconds: Loading TAMEV was visible, and time/distance remained zero at the 500 ms observation before normal play began after readiness.

Board framing uses the available stage space. Touch controls reserve their own areas, including split thumb controls in landscape. Opening More pauses action games and watched runs; human puzzles retain a Pause action in More. A confirmed touch defect, where closing More also flapped the bird, was repaired: a held 180 ms dismissal gesture now only closes the menu, and the following tap still flaps. Resume and Take over have the appropriate play and human icons. Scene transforms reset between games. A final cold-entry fix also keeps More/Pause available after continuing from a saved won puzzle; it was reproduced in Cargo and protected by a permanent Lights regression.

Leaving and reloading now preserve bounded Undo history for 2048, Lights Out, Sudoku and Cargo. Existing saves without that optional history remain readable. Flappy and Sky also preserve the active personal flight, so Watch and takeover cannot replace it or contaminate personal records.

## 2048

**Before.** The phone board occupied about 300 pixels of width, with large margins, four permanent statistics and repeated tools. New high tiles had little feedback. Long play exposed silent blocked swipes, and leaving the game lost available Undo.

**Improved.** The board and digits are larger, with Score and Best retained in the header. Sliding and tile pulse remain; per-merge confetti was removed after it obscured digits. A short 128+ milestone notice keeps play moving. A blocked direction gives a small board nudge, respecting reduced motion. No-moves results offer adjacent Undo and New game. Undo survives return and reload.

**Replayed.** Sustained native swipes in both phone orientations continued into desktop keyboard play. The final long run reached a 128 tile, ended naturally at 1,136 points, recovered with Undo and ended again at 1,264. New game, Pause/Resume, ignored paused input, hub return, reload, Watch, takeover, a manual move and exact personal-run restoration were exercised. An earlier initial run reached a 256 tile and 2,940 points. A human 2048-tile win was not achieved; separate labelled fixtures verified the 2048 notice, continued play, expiry and four-digit readability. Final nudge checks verified no board/counter change and no displaced next scene.

[Real desktop no-moves result with recovery controls](screenshots/player-review/2048-human-full-board.png).

## Lights Out

**Before.** Results required a distant toolbar Next action, adding another phone row. Using Hint reduced stars without explanation. Lamp glass became spherical after a move and obscured the power rings, while unchanged lamps also appeared to animate.

**Improved.** Puzzle and Moves/target remain visible. Result Next/Retry actions sit beside the result and explain Hint used. A stable halo marks the suggested lamp. Only the changed cross animates; flattened glass and power rings retain their shape. Optional saved history preserves Undo.

**Replayed.** Puzzle 1 was personally solved in three moves on portrait touch after Hint/Undo/Retry learning, earning three stars on the clean retry. Puzzle 2 was personally solved in four moves in landscape with one Hint, and puzzle 3 in five moves with two Hints using desktop mouse input. Real local Watch then completed puzzles 4–10, reaching the generator's twelve-toggle difficulty cap; puzzle 6 was replayed through Watch again. Takeover and Your run restored untouched personal puzzle 4, followed by successful re-entry Undo. The final shared-control replay also verified a full Watch win, Watch again, exact personal recovery and the compact AI header. Puzzles 4–10 are watched completions, not claimed personal solutions.

[Final Watch completion with Watch again and Your run](screenshots/player-review/lights-watch-result.png).

## Flappy Bird

**Before.** The sky used a small fraction of portrait height and shrank further in landscape. Generic “Flight complete” hid the collision cause. Retry required a second start action, the bird stayed smaller after death and flap animation distorted the wing.

**Improved.** Portrait uses the controllable vertical range, while landscape adds lookahead with unchanged physics and pipe spacing. Score and Best remain visible. Grounded, Too high and Pipe hit explain failure. Try again resets and starts in one action. The bird and wing retain their intended proportions, and tap/Space provide the natural flap action.

**Replayed.** Actual phone taps passed six gates across portrait-to-landscape rotation, all Perfect, for 12 points. A deliberate coast reached Grounded, and touch retry immediately started a new full-size bird. Desktop P/Space verified pause, ignored paused flap, resume and flight. The later personal-flight replay restored the exact paused two-point run after real Watch, takeover and a manual flap, then preserved it through reload and hub re-entry; watched points did not replace personal Best. The latest native failure screenshot shows the contextual retry action.

[Real phone Grounded result and one-action retry](screenshots/player-review/flappy-human-grounded.png).

## Sudoku

**Before.** Heavy cell depth, small digits, dense statistics and weak selection/entry distinctions made the phone board harder to read. Pencil notes needed clearer spatial placement, and navigation discarded Undo.

**Improved.** A flatter, larger board separates given and entered digits by ink, highlights peers and matching values, and draws a clear selected-cell outline. Pencil notes use their actual 3×3 positions. Puzzle and Time remain in the header; mistakes and best time remain in the result. Next puzzle and Play again are contextual. Optional saved history preserves notes and board recovery.

**Replayed.** All three original puzzles were personally completed: portrait touch, landscape touch and desktop keyboard/mouse respectively. Wrong entry, protected givens, Notes, Erase, Hint, Undo, pause, rotation with selected notes, hub return and reload Undo were exercised. Real Watch Pause/Resume, takeover and personal restoration also passed. Undo restores the board and notes while retaining the intended mistake penalty. Final affected checks passed given/entered colors after Next puzzle, one working AI Resume, and reload of a solved save followed by Play again, More/Pause, Resume and a normal touch entry.

[Personal completion of the third original puzzle](screenshots/player-review/sudoku-human-third-puzzle.png).

## Match-3

**Before.** Several gem types depended too heavily on color, swaps and rejected moves were difficult to follow, and cascades/refills did not clearly show how the board changed. Persistent level/record information competed with current score and moves.

**Improved.** Gems have distinct silhouettes, larger shapes and a flatter board. Accepted swaps, rejected swaps, clears, falling/refill and cascade points have short readable feedback. Touch drag and neighboring taps use the same rules. Score/target and Moves remain prominent; Next level and Try again sit in the result. Transient score feedback clears on Next and Restart.

**Replayed.** A personal phone run cleared level 1 with 1,100/1,000 points and 23 moves left. A later desktop continuation on the final immutable build cleared it with 1,050 points and 19 moves left: the unchanged 810-point save from six genuine earlier mouse turns was transferred to the new build, then five normal mouse/drag turns earned the win. Native drag checks covered both phone orientations, canceled drags and boundary rejection without spending a move. Neighbor taps, mouse drag, nonadjacent selection, invalid swap, cross clear, cascades, Hint and pause were exercised. Watch cleared levels 2–4 and ran out of moves at level 5. After takeover, three real final moves also reached an out-of-moves result, followed by a clean retry. Your run restored the untouched personal level 2, and hub Best remained the personal 1,100. Final checks covered one working AI Resume, no stale score popup on Next/Restart, and a won-save reload followed by Next, Pause/Resume and a normal 60-point drag.

[Authentic desktop continuation to a level-clear result](screenshots/player-review/match3-human-desktop-win.png).

## Pocket Cargo

**Before.** Even after direction alignment, loose framing and tall walls/character details made destinations harder to see. Repeated teaching, persistent utilities and result placement obscured play. Blocked moves had little feedback, and leaving or reloading lost Undo.

**Improved.** The high, screen-aligned view matches up/down/left/right directly. Tight framing, low walls, visible teal player/docks and short nonblocking tips clarify the puzzle. The delivered layout remains visible beside the result. Next island is contextual, blocked moves nudge briefly and optional saved history preserves Undo. All twelve islands, pars and Hint penalties remain.

**Replayed.** All twelve original islands were personally delivered from rendered boards and ordinary input: portrait touch on 1–3, landscape touch on 4–6 and desktop keyboard on 7–12. Eleven earned three stars; island 11 earned two after the actual built-in Hint, with Hint used explained. Hub showed 12/12. Wall moves, a dead-corner mistake and Undo, multiple Undo after victory, re-entry/reload Undo, pause, rotation and returning to the first island were exercised. Latest trusted touch swipes, real Watch victory, takeover/manual movement and Your run restored the exact personal layouts. The AI result no longer offers an unusable Next island.

[Personal delivery of island 12](screenshots/player-review/cargo-human-twelfth-island.png).

## Sky Rush

**Before.** Six permanent statistics and clustered controls crowded portrait; landscape left a narrow shifted runway and stacked steering controls. Barriers resembled scenery, shield loss could hide the ship, and crashes were labelled “Flight complete.” Active personal progress was lost after Watch.

**Improved.** Score, Sector and distance progress lead during play. Marked warm barriers contrast with gold lane rings. Shield broken gives a brief cue while the ship stays visible; boost trails show acceleration. Barrier hit and Sector cleared distinguish failure from success. The responsive scene and split phone controls use the stage width. Validated active-run persistence restores personal flight and records across Watch and navigation.

**Replayed.** A phone run collected 37 rings through 858 m, exercised four boosts and recharge, lost its shield at 647 m, recovered and later ended with Barrier hit. Another run started by phone touch, rotated to desktop and personally cleared the full 1,000 m sector with 46 rings, 30,900 points and an intact shield; Next sector retained the score and entered Amber Heights. More paused a live run through a 1,200 ms clock burst. The latest native Watch/takeover/Boost/Your run flow restored the exact paused 100-point, 40 m personal flight and retained it through reload and hub return, without leaking the watched score into personal Best. A separate real-time WebKit Watch completed sector 1 with 4,400 points and 36 rings; visible Watch again started a fresh AI flight despite a terminal saved run, reusing the single model initialization without errors.

Final progression continued sector 2 in Watch to 730 m, then took over and manually flew the last 270 m to a full 1,000 m result with 11,900 points and 78 rings. Next sector entered Blue Horizon. Manual boost, lane changes and ring collection continued to 231 m, including shield loss and recovery; sector 3 was not completed. Final trusted touch swipes in both phone orientations moved the visible ship to the expected left and right lanes.

[Personal full-sector clear](screenshots/player-review/sky-human-sector-cleared.png).

## Robot Pushball

**Before.** The long pitch was small in landscape, diagonal depth and pale robots weakened identification, and movement did not adapt to a rotated field. Persistent record/action chrome consumed space.

**Improved.** The near-top field remains fully visible and rotates in landscape with screen-relative human controls. Blue and coral robots match their goals. Split joystick/Dash controls reserve their own space. Current score remains prominent; ready, pause and result actions are contextual, and results retain personal match records. Physics, opponent strategies and the first-to-three challenge are unchanged.

**Replayed.** Genuine desktop WASD/Space play contested both corners, drove the ball along the wing and scored a human goal. The opponent recovered and won the complete match 1–3; the result correctly showed 0 wins / 1 match. Pause/Continue separated visual observations. Phone joystick play retained the paused score and positions through rotation, then moved the blue robot right relative to the rotated landscape field. Both thumb controls and the full pitch were visible.

A final live two-finger check exposed a click-only Dash defect: Chromium delivered the second finger's trusted pointer press without a click, so the earlier movement screenshots had not actually proved a Dash. The button now acts on primary-button pointer press, including a second finger, while preserving native keyboard activation. The permanent cold-offline regression failed before the fix and passed afterward with the original movement and cooldown assertions. Fresh native touch replay visibly showed the cooldown; real mouse press, long hold/release, Tab focus, focused Space and Enter also passed without duplicate release actions. More now respects native summary Space/Enter instead of consuming Space as a Dash.

[Complete personal 1–3 match and recorded result](screenshots/player-review/pushball-human-complete-match.png).

[Genuine second-finger Dash with visible cooldown](screenshots/player-review/pushball-two-finger-dash.png).

## Evidence and qualification

The nine linked images are tracked under [screenshots/player-review/](screenshots/player-review/), so the central replay evidence is available with the repository. They capture actual played states, not injected victory fixtures. Some record the broad replay before later shared-control refinements; [PAGES.md](PAGES.md) supplies the refreshed three-size page captures.

The replay does not establish a personal 2048 win, personal solutions to watched Lights puzzles 4–10, a completed Sky sector 3, or exhaustive coverage of unbounded generated levels. Sky sector 2 used Watch followed by manual takeover. A naturally occurring Match-3 automatic reshuffle was not encountered. Action-game clock pauses limit reaction-time and performance conclusions. Browser-size emulation does not certify physical Safari or Home Screen behavior. Final build, layout, games, AI, offline, CI and deployed-asset checks remain separately auditable delivery gates.
