# AGENTS.md - FlightMode Games Project

AGENT: FlightMode Games Project

This project builds a pure frontend offline game collection optimized for iPhone flight-mode usage, using HTML, TypeScript, CSS, and locally bundled game libraries such as Three.js. No backend or external runtime requests. All games share a unified Game Hub UI.

Goal: produce a lightweight, responsive, mobile-friendly experience that runs entirely offline and can be added to Home Screen.

----------------------------------------------------------------

## Critical Requirements

### 1. Language Requirements

- **ALL code must be written in English**
- **ALL commit messages must be in English**
- **ALL comments, variable names, function names, and documentation must be in English**
- No exceptions to this rule

### 2. Backward Compatibility

- **DO NOT consider backward compatibility**
- You are free to make breaking changes
- Focus on correctness and maintainability over compatibility
- Update all affected code paths when making changes

----------------------------------------------------------------

## PROJECT SCOPE

Included Games
Difficulty A (must implement)
- Snake (Canvas)
- Tetris (Canvas)
- 2048 (DOM)
- Flappy Bird (Canvas)
- Maze Escape (random maze generator + movement)

Difficulty B (must implement)
- Match-3 
- Pocket Cargo (3D Sokoban)
- Sky Rush (3D flight arcade)
- Sudoku
- Lights Out

Additional Requirements
- Unified Game Hub with responsive grid of icons
- Each game runs in its own page or dynamically loaded view
- Mobile touch controls required
- All assets local, no network dependency
- Use localStorage for save data
- Optional: PWA support (service worker + manifest)

----------------------------------------------------------------

## RECOMMENDED PROJECT STRUCTURE

/public
  /assets
    /common
    /snake
    /tetris
    /2048
    /flappy
    /maze
    /match3
    /sokoban
  index.html (Game Hub)
  game.html (optional dynamic loader)
  manifest.json (optional PWA)
  service-worker.js (optional PWA)

/src
  /core
    ui.ts (shared UI helpers)
    storage.ts (localStorage wrapper)
    engine.ts (game loop helpers)
  /games
    snake.ts
    tetris.ts
    2048.ts
    flappy.ts
    maze.ts
    match3.ts
    sokoban.ts
  main.ts (hub logic)

/styles
  base.css
  hub.css
  game.css

tsconfig.json
package.json
vite.config.ts (recommended)

----------------------------------------------------------------

## UI / UX REQUIREMENTS

Game Hub
- Grid layout of game cards
- Each card has title + icon
- Tapping card loads the game
- Full-screen and mobile-responsive

In-Game Layout
- Minimal top bar with back button and title
- Canvas or DOM game area centered
- Touch controls where needed
  - Swipe (Snake, Maze)
  - Tap (Flappy Bird)
  - On-screen arrows (Sokoban)

----------------------------------------------------------------

## TECH REQUIREMENTS

General
- Use TypeScript
- Use Canvas or Three.js for animation-heavy games
- Load game modules on demand and bundle all dependencies locally
- Dispose 3D resources, workers, audio contexts, and event handlers on navigation
- No external CDN
- Target 60 FPS

localStorage
storage.ts must expose:
- save(key, value)
- load(key, fallback)
- Support per-game namespace

Engine Helpers (engine.ts)
- Basic game loop abstraction
- Timing utilities

----------------------------------------------------------------

## GAME REQUIREMENTS

Snake
- Canvas rendering
- Swipe control
- Score tracking

Tetris
- Classic tetromino implementation
- Rotate / left / right / drop mobile controls

2048
- DOM grid
- Touch swipe
- Smooth animations

Flappy Bird
- Canvas
- Tap to jump
- Random pipes
- Score + best score

Maze
- Random maze generator (DFS or Kruskal)
- Player movement
- Track completion time

Match-3
- Swap adjacent tiles
- Detect and clear 3+ matches
- Drop-down gravity
- Score system

Sokoban
- Tile-based maps
- Multiple levels
- Push rules
- Touch directional buttons
- Optional undo

----------------------------------------------------------------

## BUILD & TOOLING

Use Vite for dev and build.
Commands: npm install, npm run dev, npm run build

Output must run 100% offline.

----------------------------------------------------------------

## MOBILE OPTIMIZATION

- Disable double-tap zoom
- Disable text selection
- Proper viewport meta
- Canvas resize logic
- Swipe + tap gestures

----------------------------------------------------------------

## PERFORMANCE

- Minimize DOM reflow
- Prefer Canvas for animations
- Cap FPS if needed
- No network usage at all

----------------------------------------------------------------

## QA REQUIREMENTS

Test on:
- iPhone Safari
- Chrome mobile
- Must work in Flight Mode
- All resources load locally
- Touch controls reliable

----------------------------------------------------------------

## WHAT AGENTS SHOULD DO

1. Scaffold full folder structure
2. Implement Game Hub UI
3. Implement each game in /src/games
4. Implement core helpers
5. Ensure mobile touch UX
6. Add optional PWA
7. Produce final offline build

----------------------------------------------------------------

## ACCEPTANCE CRITERIA

Project is complete when:
- All 10 games are playable offline
- Hub UI loads each game
- No network requests
- Saves stored locally
- Touch controls fully functional
- Build outputs static files runnable anywhere

END OF AGENTS.md
