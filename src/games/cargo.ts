import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry
} from 'three';
import { GameModule } from './gameTypes';
import { createGameShell, createTouchButton, bindSwipe } from '../core/ui';
import { directionPad, exposeGame } from '../core/play';
import { GameLoop } from '../core/engine';
import { GameAudio } from '../core/audio';
import { createStage, disposeObject } from '../core/three/stage';
import { namespace } from '../core/storage';
import { CARGO_LEVELS } from './cargo/levels';
import {
  CargoDirection,
  CargoState,
  cargoCorner,
  cargoSolved,
  moveCargo,
  neighbor,
  parseCargo
} from './cargo/model';

const storage = namespace('cargo');
type Save = {
  level: number;
  state: CargoState;
  moves: number;
  pushes: number;
  usedHint: boolean;
};
const cargo: GameModule = {
  id: 'cargo',
  name: 'Pocket Cargo',
  icon: '📦',
  description: 'A tiny island. A clever delivery. Twelve playful 3D puzzles.',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Pocket Cargo', goBack);
    area
      .closest('.game-shell')!
      .classList.add('immersive-shell', 'cargo-shell');
    const header = document.createElement('div');
    header.className = 'cargo-header';
    const selector = document.createElement('select');
    selector.className = 'level-select';
    selector.setAttribute('aria-label', 'Choose cargo puzzle');
    CARGO_LEVELS.forEach((level, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${String(index + 1).padStart(2, '0')} · ${level.name}`;
      selector.append(option);
    });
    const info = document.createElement('div');
    info.className = 'cargo-stats';
    header.append(selector, info);
    area.append(header);
    const view = document.createElement('div');
    view.className = 'three-view cargo-view';
    area.append(view);
    const camera = new PerspectiveCamera(43, 1, 0.1, 100);
    camera.position.set(0, 10.5, 9.5);
    camera.lookAt(0, 0, 0);
    const stage = createStage(view, camera, 0xd6e6df);
    if (!stage) return () => {};
    const audio = new GameAudio();
    const worker = new Worker(
      new URL('./cargo/solver.worker.ts', import.meta.url),
      { type: 'module' }
    );
    const saved = storage.load<Save | null>('run', null);
    let levelIndex = Math.max(
      0,
      Math.min(CARGO_LEVELS.length - 1, saved?.level ?? 0)
    );
    let board = parseCargo(CARGO_LEVELS[levelIndex].map),
      state = board.initial;
    let moves = 0,
      pushes = 0,
      usedHint = false,
      revision = 0,
      thinking = false;
    let best = storage.load<Record<string, number>>('stars', {});
    let hintDirection: CargoDirection | null = null;
    let history: { state: CargoState; pushes: number }[] = [];
    let time = 0;
    if (
      saved &&
      saved.level === levelIndex &&
      saved.state.crates.length === board.initial.crates.length &&
      saved.state.crates.every((c) => board.floor.includes(c)) &&
      new Set(saved.state.crates).size === saved.state.crates.length &&
      board.floor.includes(saved.state.player) &&
      !saved.state.crates.includes(saved.state.player)
    ) {
      state = saved.state;
      moves = saved.moves;
      pushes = saved.pushes;
      usedHint = saved.usedHint;
    }
    const status = document.createElement('div');
    status.className = 'cargo-status';
    status.setAttribute('role', 'status');
    area.append(status);
    const overlay = document.createElement('div');
    overlay.className = 'cargo-complete';
    view.append(overlay);
    const controls = document.createElement('div');
    controls.className = 'cargo-controls';
    const pad = document.createElement('div');
    controls.append(pad);
    directionPad(pad, (x, y) =>
      move(x < 0 ? 'left' : x > 0 ? 'right' : y < 0 ? 'up' : 'down')
    );
    const actions = document.createElement('div');
    actions.className = 'cargo-actions';
    const undo = createTouchButton('Undo', () => {
      const previous = history.pop();
      if (!previous) return;
      state = previous.state;
      pushes = previous.pushes;
      moves--;
      invalidateHint();
      syncUI();
      persist();
    });
    const retry = createTouchButton('Restart', () => loadLevel(levelIndex));
    const hint = createTouchButton('Hint', () => {
      if (thinking || cargoSolved(board, state)) return;
      thinking = true;
      usedHint = true;
      hint.disabled = true;
      status.textContent = 'Finding a route for your next delivery…';
      worker.postMessage({ id: ++revision, board, state });
      persist();
    });
    actions.append(undo, hint, retry, audio.button);
    controls.append(actions);
    area.append(controls);
    const instructions = document.createElement('div');
    instructions.className = 'three-instruction';
    instructions.textContent =
      'Arrows or swipe to move · Z to undo · Push every crate onto a glowing dock';
    area.append(instructions);
    let island = new Group(),
      robot = new Group();
    let crateViews: Group[] = [],
      goalViews: Mesh[] = [];
    let hintMarker = new Mesh();
    const sea = new Mesh(
      new PlaneGeometry(100, 100),
      new MeshStandardMaterial({ color: 0xa6c9cd, roughness: 0.9 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.45;
    stage.scene.add(sea);
    const ripples: Mesh[] = [];
    const rippleGeo = new TorusGeometry(4, 0.018, 4, 64),
      rippleMaterial = new MeshBasicMaterial({ color: 0xc8e1de });
    for (let i = 0; i < 5; i++) {
      const ripple = new Mesh(rippleGeo, rippleMaterial);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = -1.42;
      ripple.scale.setScalar(1 + i * 0.45);
      stage.scene.add(ripple);
      ripples.push(ripple);
    }
    function mat(color: number) {
      return new MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: 0.8
      });
    }
    function position(cell: number) {
      return {
        x: (cell % board.width) - (board.width - 1) / 2,
        z: Math.floor(cell / board.width) - (board.height - 1) / 2
      };
    }
    function buildScene() {
      stage!.scene.remove(island);
      disposeObject(island);
      island = new Group();
      stage!.scene.add(island);
      const foundation = new Mesh(
        new BoxGeometry(board.width + 0.25, 0.6, board.height + 0.25),
        mat(0x77999a)
      );
      foundation.position.y = -0.42;
      island.add(foundation);
      const floorGeo = new BoxGeometry(0.96, 0.16, 0.96),
        tileMats = [mat(0xe9e7d2), mat(0xe0dfca)],
        wallGeo = new BoxGeometry(0.98, 0.5, 0.98),
        wallMat = mat(0x9fb9a1);
      const goalMat = new MeshStandardMaterial({
        color: 0x64baa9,
        emissive: 0x267e68,
        emissiveIntensity: 0.25,
        roughness: 0.6
      });
      goalViews = [];
      for (let y = 0; y < board.height; y++)
        for (let x = 0; x < board.width; x++) {
          const cell = y * board.width + x,
            p = position(cell),
            floor = board.floor.includes(cell);
          const tile = new Mesh(
            floor ? floorGeo : wallGeo,
            floor ? tileMats[(x + y) % 2] : wallMat
          );
          tile.position.set(p.x, floor ? -0.06 : 0.13, p.z);
          island.add(tile);
          if (board.goals.includes(cell)) {
            const goal = new Mesh(
              new TorusGeometry(0.34, 0.035, 6, 28),
              goalMat
            );
            goal.rotation.x = -Math.PI / 2;
            goal.position.set(p.x, 0.038, p.z);
            island.add(goal);
            goalViews.push(goal);
            const disc = new Mesh(
              new CircleGeometry(0.28, 24),
              new MeshBasicMaterial({ color: 0xb4dace })
            );
            disc.rotation.x = -Math.PI / 2;
            disc.position.set(p.x, 0.029, p.z);
            island.add(disc);
          }
        }
      crateViews = state.crates.map(() => {
        const group = new Group();
        const box = new Mesh(new BoxGeometry(0.7, 0.68, 0.7), mat(0xdfa069));
        box.position.y = 0.37;
        group.add(box);
        const strapMat = mat(0xffe4ad);
        const strap = new Mesh(new BoxGeometry(0.12, 0.69, 0.71), strapMat);
        strap.position.y = 0.37;
        group.add(strap);
        const stripe = new Mesh(new BoxGeometry(0.71, 0.69, 0.12), strapMat);
        stripe.position.y = 0.37;
        group.add(stripe);
        const stamp = new Mesh(
          new BoxGeometry(0.22, 0.18, 0.015),
          mat(0x90623f)
        );
        stamp.position.set(0.17, 0.4, 0.36);
        group.add(stamp);
        island.add(group);
        return group;
      });
      robot = new Group();
      const body = new Mesh(
        new CylinderGeometry(0.2, 0.25, 0.35, 10),
        mat(0x579f9b)
      );
      body.position.y = 0.29;
      robot.add(body);
      const head = new Mesh(new SphereGeometry(0.27, 12, 10), mat(0xf6f0d9));
      head.position.y = 0.61;
      robot.add(head);
      const visor = new Mesh(new BoxGeometry(0.33, 0.11, 0.08), mat(0x284b5c));
      visor.position.set(0, 0.64, 0.23);
      robot.add(visor);
      const hat = new Mesh(new ConeGeometry(0.3, 0.12, 12), mat(0xe6af65));
      hat.position.y = 0.84;
      robot.add(hat);
      island.add(robot);
      hintMarker = new Mesh(
        new TorusGeometry(0.4, 0.055, 5, 24),
        new MeshBasicMaterial({ color: 0xf0b36c })
      );
      hintMarker.rotation.x = -Math.PI / 2;
      hintMarker.position.y = 0.06;
      island.add(hintMarker);
      syncPositions(1);
      stage!.render();
    }
    function invalidateHint() {
      revision++;
      thinking = false;
      hintDirection = null;
    }
    function loadLevel(index: number) {
      levelIndex = index;
      board = parseCargo(CARGO_LEVELS[index].map);
      state = {
        player: board.initial.player,
        crates: [...board.initial.crates]
      };
      moves = 0;
      pushes = 0;
      usedHint = false;
      history = [];
      invalidateHint();
      buildScene();
      syncUI();
      persist();
    }
    function persist() {
      storage.save<Save>('run', {
        level: levelIndex,
        state,
        moves,
        pushes,
        usedHint
      });
    }
    function move(direction: CargoDirection) {
      if (cargoSolved(board, state)) return;
      audio.unlock();
      const result = moveCargo(board, state, direction);
      if (!result) return;
      history.push({
        state: { player: state.player, crates: [...state.crates] },
        pushes
      });
      state = result.state;
      moves++;
      if (result.pushed) pushes++;
      invalidateHint();
      audio.play(result.pushed ? 'collect' : 'move');
      if (cargoSolved(board, state)) {
        const stars =
          pushes <= CARGO_LEVELS[levelIndex].par && !usedHint
            ? 3
            : pushes <= CARGO_LEVELS[levelIndex].par + 3
              ? 2
              : 1;
        best[levelIndex] = Math.max(best[levelIndex] ?? 0, stars);
        storage.save('stars', best);
        audio.play('win');
      }
      syncUI();
      persist();
    }
    function syncUI() {
      selector.value = String(levelIndex);
      info.textContent = `${state.crates.filter((c) => board.goals.includes(c)).length}/${board.goals.length} delivered · ${pushes} pushes · Perfect ${CARGO_LEVELS[levelIndex].par}`;
      undo.disabled = !history.length;
      hint.disabled = thinking || cargoSolved(board, state);
      const stuck = state.crates.some((c) => cargoCorner(board, c));
      status.textContent = hintDirection
        ? `Next step: ${hintDirection.toUpperCase()}. Keep a path open behind each crate.`
        : stuck
          ? 'That crate is in a corner. Undo gives you another way in.'
          : CARGO_LEVELS[levelIndex].tip;
      overlay.hidden = !cargoSolved(board, state);
      overlay.innerHTML = '';
      if (cargoSolved(board, state)) {
        const title = document.createElement('strong');
        title.textContent = `${'★'.repeat(best[levelIndex] ?? 1)} Delivered!`;
        const detail = document.createElement('span');
        detail.textContent = `${moves} moves · ${pushes} pushes. ${levelIndex === CARGO_LEVELS.length - 1 ? 'Every island explored.' : 'Your next island awaits.'}`;
        const next = createTouchButton(
          levelIndex === CARGO_LEVELS.length - 1
            ? 'Play from the beginning'
            : 'Next island →',
          () => loadLevel((levelIndex + 1) % CARGO_LEVELS.length),
          'primary-action'
        );
        overlay.append(title, detail, next);
      }
    }
    worker.onmessage = (
      event: MessageEvent<{
        id: number;
        result: { moves: CargoDirection[] } | null;
      }>
    ) => {
      if (event.data.id !== revision) return;
      thinking = false;
      hintDirection = event.data.result?.moves[0] ?? null;
      syncUI();
      if (!event.data.result)
        status.textContent =
          'No delivery route found. Undo a few moves or restart this island.';
    };
    worker.onerror = () => {
      thinking = false;
      hint.disabled = false;
      status.textContent =
        'Hint unavailable. You can keep playing or use Undo.';
    };
    function syncPositions(amount: number) {
      const p = position(state.player);
      robot.position.x += (p.x - robot.position.x) * amount;
      robot.position.z += (p.z - robot.position.z) * amount;
      robot.position.y = Math.sin(time * 4) * 0.018;
      crateViews.forEach((crate, index) => {
        const target = position(state.crates[index]);
        crate.position.x += (target.x - crate.position.x) * amount;
        crate.position.z += (target.z - crate.position.z) * amount;
        const box = crate.children[0] as Mesh;
        (box.material as MeshStandardMaterial).color.setHex(
          board.goals.includes(state.crates[index]) ? 0x7cbea4 : 0xdfa069
        );
      });
      hintMarker.visible = hintDirection !== null;
      if (hintDirection) {
        const next = position(neighbor(board, state.player, hintDirection));
        hintMarker.position.x = next.x;
        hintMarker.position.z = next.z;
        hintMarker.scale.setScalar(1 + Math.sin(time * 5) * 0.1);
      }
      goalViews.forEach((goal) => {
        goal.scale.setScalar(1 + Math.sin(time * 3) * 0.05);
      });
    }
    selector.addEventListener('change', () =>
      loadLevel(Number(selector.value))
    );
    const swipeOff = bindSwipe(stage.canvas, (direction) => move(direction));
    const key = (event: KeyboardEvent) => {
      if (event.target === selector) return;
      const direction = (
        {
          ArrowUp: 'up',
          ArrowRight: 'right',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          w: 'up',
          d: 'right',
          s: 'down',
          a: 'left'
        } as Record<string, CargoDirection>
      )[event.key];
      if (direction) {
        event.preventDefault();
        move(direction);
      }
      if (event.key.toLowerCase() === 'z') undo.click();
    };
    window.addEventListener('keydown', key);
    const loop = new GameLoop((dt) => {
      if (document.hidden) return;
      time += dt;
      syncPositions(1 - Math.exp(-18 * dt));
      ripples.forEach((r, i) => {
        r.position.y = -1.42 + Math.sin(time + i) * 0.01;
      });
      stage.render();
    });
    buildScene();
    syncUI();
    stage.resize();
    loop.start();
    const off = exposeGame(
      () => ({
        game: 'cargo',
        mode: cargoSolved(board, state) ? 'won' : 'playing',
        level: levelIndex + 1,
        name: CARGO_LEVELS[levelIndex].name,
        board,
        state,
        moves,
        pushes,
        par: CARGO_LEVELS[levelIndex].par,
        usedHint,
        hintDirection,
        thinking,
        stars: best,
        coordinates:
          'Row-major grid cells. x right, y down. Arrows move in these grid directions.',
        renderer: 'WebGL2'
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      loop.stop();
      off();
      swipeOff();
      worker.terminate();
      audio.dispose();
      window.removeEventListener('keydown', key);
      stage.dispose();
    };
  }
};
export default cargo;
