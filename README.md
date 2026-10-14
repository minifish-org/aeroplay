# AeroPlay

An offline-first arcade for iPhone and MacBook Safari. The collection contains 2048, Lights Out, Flappy Bird, Sudoku, Match-3, Pocket Cargo, Sky Rush, and Robot Pushball.

## Rewrite status

The Three.js rewrite is in progress on local main. P0 removes the old renderers and retired games and establishes the directory skeleton. Game implementation and release acceptance are still outstanding; the production site remains on its previous release until final verification.

## Development

`npm install`, `npm run dev`, `npm run build`. `npm run build:decision` obtains the pinned TAMEV model during build preparation; runtime inference uses local bundled files.

## Structure

`src/core` owns the shared stage, HUD, input, storage, loop, and audio. `src/ai` owns the human/AI contract, resident inference, and eight-game planner. `src/hub` owns the card grid. Every game has index/model/view/hud files; pure models never import Three. Styles are tokens/hub/game.

## Review and validation

See [page review](docs/PAGES.md) for every retained/deleted element and the before screenshots. Final validation covers all eight games, iPhone portrait/landscape and MacBook layouts, real local AI, legacy saves, teardown, reduced motion, and offline restarts.

Personal records remain in existing `aeroplay:<game>:*` namespaces (2048 uses `game2048`). AI-owned runs remain separate after takeover. The first Watch initializes local TAMEV; Robot Pushball initializes its mandatory opponent on Start match. There are no settings dialogs or remote runtime services.

Main push triggers GitHub Actions and Cloudflare Pages. Only the fully verified P4 state is pushed. Model/WASM and assets are same-origin and service-worker cached.
