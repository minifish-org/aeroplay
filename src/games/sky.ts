import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  Color,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Fog,
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
import { GameAudio } from '../core/audio';
import { GameLoop } from '../core/engine';
import { exposeGame } from '../core/play';
import { namespace } from '../core/storage';
import { createStage } from '../core/three/stage';
import {
  boostFlight,
  createFlight,
  LANE_WIDTH,
  SECTOR_LENGTH,
  steerFlight,
  stepFlight
} from './skyState';

const storage = namespace('sky');
const sky: GameModule = {
  id: 'sky',
  name: 'Sky Rush',
  icon: '✈️',
  description:
    'Bank through the clouds. Chase rings, build a streak, hit the boost.',
  mount(root, goBack) {
    const { area } = createGameShell(root, 'Sky Rush', goBack);
    area.closest('.game-shell')!.classList.add('immersive-shell');
    const view = document.createElement('div');
    view.className = 'three-view sky-view';
    area.append(view);
    const camera = new PerspectiveCamera(57, 1, 0.1, 260);
    camera.position.set(0, 5.2, 9.4);
    camera.lookAt(0, 1.1, -18);
    const stage = createStage(view, camera, 0xbde3e8);
    if (!stage) return () => {};
    stage.scene.fog = new Fog(0xbde3e8, 65, 175);
    const audio = new GameAudio();
    let state = createFlight();
    let best = storage.load('best', 0),
      visualTime = 0,
      shake = 0;
    const hud = document.createElement('div');
    hud.className = 'flight-hud';
    hud.innerHTML =
      '<div><span class="hud-label">SCORE</span><strong class="flight-score">0</strong></div><div class="flight-sector">SECTOR 01<br><span>Cloud Coast</span></div><div><span class="hud-label">BEST</span><strong class="flight-best">0</strong></div>';
    const message = document.createElement('div');
    message.className = 'flight-message';
    message.setAttribute('role', 'status');
    const distance = document.createElement('progress');
    distance.className = 'flight-progress';
    distance.max = SECTOR_LENGTH;
    distance.setAttribute('aria-label', 'Sector distance');
    const overlay = document.createElement('div');
    overlay.className = 'three-overlay';
    const panel = document.createElement('div');
    panel.className = 'three-panel';
    overlay.append(panel);
    const meta = document.createElement('div');
    meta.className = 'flight-meta';
    view.append(hud, message, distance, meta, overlay);
    const controls = document.createElement('div');
    controls.className = 'flight-controls';
    const left = createTouchButton('←', () => turn(-1));
    left.setAttribute('aria-label', 'Steer left');
    const right = createTouchButton('→', () => turn(1));
    right.setAttribute('aria-label', 'Steer right');
    const boost = createTouchButton('BOOST', activateBoost, 'boost-button');
    controls.append(left, boost, right);
    area.append(controls);
    const utility = document.createElement('div');
    utility.className = 'flight-utility';
    const pause = createTouchButton('Pause', togglePause);
    utility.append(pause, audio.button);
    area.append(utility);
    const instruction = document.createElement('div');
    instruction.className = 'three-instruction';
    instruction.textContent =
      'Swipe or ← → to steer · Space to boost · P to pause';
    area.append(instruction);
    function material(color: number, emissive = 0) {
      return new MeshStandardMaterial({
        color,
        roughness: 0.75,
        flatShading: true,
        emissive,
        emissiveIntensity: 0.35
      });
    }
    const road = new Mesh(new PlaneGeometry(10.8, 360), material(0x325e73));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.2, -145);
    stage.scene.add(road);
    const railGeometry = new BoxGeometry(0.12, 0.14, 360),
      railMaterial = material(0x91f0d0, 0x2c997b);
    for (const x of [-5.5, 5.5]) {
      const rail = new Mesh(railGeometry, railMaterial);
      rail.position.set(x, 0, -145);
      stage.scene.add(rail);
    }
    const lineGeometry = new BoxGeometry(0.05, 0.015, 2.8),
      lineMaterial = new MeshBasicMaterial({ color: 0x9abcc6 });
    const dashes = new InstancedMesh(lineGeometry, lineMaterial, 84);
    stage.scene.add(dashes);
    const dashMatrix = new Matrix4();
    const ship = new Group();
    const body = new Mesh(new ConeGeometry(0.43, 1.8, 6), material(0xf3f1db));
    body.rotation.x = -Math.PI / 2;
    ship.add(body);
    const wings = new Mesh(
      new BoxGeometry(2.15, 0.1, 0.55),
      material(0xf4c572)
    );
    wings.position.z = 0.35;
    ship.add(wings);
    const tail = new Mesh(new BoxGeometry(0.75, 0.08, 0.3), material(0xf6c774));
    tail.position.set(0, 0.06, 0.8);
    ship.add(tail);
    const cockpit = new Mesh(
      new SphereGeometry(0.26, 12, 8),
      material(0x1c485a)
    );
    cockpit.scale.set(0.8, 0.6, 1.8);
    cockpit.position.set(0, 0.24, -0.02);
    ship.add(cockpit);
    const flame = new Mesh(
      new ConeGeometry(0.2, 0.85, 6),
      new MeshBasicMaterial({ color: 0x8ceee8 })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.z = 1.15;
    ship.add(flame);
    const shield = new Mesh(
      new SphereGeometry(1.35, 16, 12),
      new MeshBasicMaterial({
        color: 0xadf4e5,
        wireframe: true,
        transparent: true,
        opacity: 0.1
      })
    );
    ship.add(shield);
    ship.position.y = 1.2;
    stage.scene.add(ship);
    const shadow = new Mesh(
      new CircleGeometry(1, 20),
      new MeshBasicMaterial({
        color: 0x173f51,
        transparent: true,
        opacity: 0.45
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1.15, 0.5, 1);
    shadow.position.y = -0.17;
    stage.scene.add(shadow);
    const ringGeometry = new TorusGeometry(1.12, 0.085, 8, 32),
      ringMaterial = material(0xffdb87, 0xcda02f);
    const hazardGeometry = new BoxGeometry(2.15, 2.7, 0.9),
      hazardMaterial = material(0xe77578);
    const stripeGeometry = new BoxGeometry(1.75, 0.11, 0.94),
      stripeMaterial = new MeshBasicMaterial({ color: 0xffd7be });
    const rowViews = Array.from({ length: 14 }, () => {
      const group = new Group();
      const ring = new Mesh(ringGeometry, ringMaterial);
      ring.position.y = 1.3;
      group.add(ring);
      const hazards = [0, 1, 2].map((lane) => {
        const block = new Group();
        const wall = new Mesh(hazardGeometry, hazardMaterial);
        wall.position.y = 1.15;
        block.add(wall);
        for (const y of [0.65, 1.15, 1.65]) {
          const stripe = new Mesh(stripeGeometry, stripeMaterial);
          stripe.position.y = y;
          stripe.rotation.z = -0.2;
          block.add(stripe);
        }
        block.position.x = (lane - 1) * LANE_WIDTH;
        group.add(block);
        return block;
      });
      stage.scene.add(group);
      return { group, ring, hazards };
    });
    const islands: Group[] = [];
    const rockGeometry = new ConeGeometry(4, 7, 5),
      rockMaterial = material(0x6d8592),
      grassMaterial = material(0x81c6ae),
      cloudMaterial = material(0xf0f3e5);
    const capGeometry = new CylinderGeometry(4, 4, 0.45, 5),
      cloudGeometry = new DodecahedronGeometry(2.5);
    for (let i = 0; i < 18; i++) {
      const island = new Group();
      const rock = new Mesh(rockGeometry, rockMaterial);
      rock.rotation.z = Math.PI;
      rock.position.y = -3.5;
      island.add(rock);
      const cap = new Mesh(capGeometry, grassMaterial);
      island.add(cap);
      const cloud = new Mesh(cloudGeometry, cloudMaterial);
      cloud.position.set(2, -5, 1);
      cloud.scale.set(2.5, 0.55, 1.3);
      island.add(cloud);
      island.position.set(
        (i % 2 ? -1 : 1) * (12 + (i % 4) * 5),
        -3 - (i % 3),
        -i * 17
      );
      island.rotation.y = i;
      stage.scene.add(island);
      islands.push(island);
    }
    const particles = new Group();
    stage.scene.add(particles);
    const particleGeometry = new SphereGeometry(0.055, 4, 4),
      particleMaterial = new MeshBasicMaterial({ color: 0xc4ffff });
    for (let i = 0; i < 20; i++) {
      const p = new Mesh(particleGeometry, particleMaterial);
      p.position.set(
        (Math.random() - 0.5) * 10,
        Math.random() * 5,
        -Math.random() * 30
      );
      particles.add(p);
    }
    let lastPanel = '';
    function begin() {
      if (!stage!.available) return;
      audio.unlock();
      state.mode = 'playing';
      syncUI();
    }
    function restart(nextSector = false) {
      const previous = state;
      state = createFlight(Math.random, nextSector ? previous.sector + 1 : 1);
      if (nextSector) {
        state.score = previous.score;
        state.rings = previous.rings;
        state.maxCombo = previous.maxCombo;
      }
      const skyColors = [0xbde3e8, 0xf0d7b8, 0xcbd8ed];
      const skyColor = skyColors[(state.sector - 1) % 3];
      (stage!.scene.background as Color).setHex(skyColor);
      (stage!.scene.fog as Fog).color.setHex(skyColor);
      shake = 0;
      begin();
    }
    function turn(direction: number) {
      audio.unlock();
      steerFlight(state, direction);
    }
    function activateBoost() {
      audio.unlock();
      if (boostFlight(state)) audio.play('boost');
      syncUI();
    }
    function togglePause() {
      if (state.mode === 'playing') state.mode = 'paused';
      else if (state.mode === 'paused' && stage!.available)
        state.mode = 'playing';
      syncUI();
    }
    function text(el: Element, value: string) {
      if (el.textContent !== value) el.textContent = value;
    }
    function syncUI() {
      text(hud.querySelector('.flight-score')!, state.score.toLocaleString());
      text(hud.querySelector('.flight-best')!, best.toLocaleString());
      const biomes = ['Cloud Coast', 'Amber Heights', 'Blue Horizon'];
      text(
        hud.querySelector('.flight-sector')!,
        `SECTOR ${String(state.sector).padStart(2, '0')} · ${biomes[(state.sector - 1) % 3]}`
      );
      text(
        meta,
        `${state.rings} RINGS  ·  STREAK ${state.combo}  ·  ${state.shield ? 'SHIELD READY' : 'SHIELD SPENT'}`
      );
      text(message, state.messageTime > 0 ? state.message : '');
      distance.value = state.distance;
      boost.textContent =
        state.boost > 0
          ? `BOOST ${state.boost.toFixed(1)}s`
          : state.charge >= 100
            ? 'BOOST READY ↑'
            : `BOOST ${state.charge}%`;
      boost.style.setProperty('--charge', `${state.charge}%`);
      boost.disabled =
        state.mode !== 'playing' || state.charge < 100 || state.boost > 0;
      left.disabled = right.disabled = state.mode !== 'playing';
      pause.disabled = state.mode !== 'playing' && state.mode !== 'paused';
      pause.textContent = state.mode === 'paused' ? 'Resume' : 'Pause';
      overlay.hidden = state.mode === 'playing';
      if (state.mode !== lastPanel) {
        lastPanel = state.mode;
        panel.innerHTML = '';
        const eyebrow = document.createElement('div');
        eyebrow.className = 'panel-eyebrow';
        eyebrow.textContent =
          state.mode === 'ready'
            ? 'AEROPLAY ORIGINAL · 3D'
            : state.mode === 'paused'
              ? 'A MOMENT IN THE CLOUDS'
              : state.mode === 'won'
                ? 'SECTOR COMPLETE'
                : 'UNTIL NEXT FLIGHT';
        const title = document.createElement('h2');
        title.textContent =
          state.mode === 'ready'
            ? 'Catch your second wind.'
            : state.mode === 'paused'
              ? 'Flight paused.'
              : state.mode === 'won'
                ? 'A sky-high finish.'
                : `${state.score.toLocaleString()} points.`;
        const copy = document.createElement('p');
        copy.textContent =
          state.mode === 'ready'
            ? 'Follow the golden rings. Dodge coral barriers. Collect a streak, then boost for double points. Your shield forgives one hit.'
            : state.mode === 'paused'
              ? 'Your flight is right where you left it.'
              : `${state.rings} rings · best streak ${state.maxCombo} · ${Math.floor(state.distance)}m flown`;
        const action = createTouchButton(
          state.mode === 'ready'
            ? 'Take flight →'
            : state.mode === 'paused'
              ? 'Resume flight'
              : state.mode === 'won'
                ? 'Next sector →'
                : 'Fly again →',
          () => {
            if (state.mode === 'ready' || state.mode === 'paused') begin();
            else restart(state.mode === 'won');
          },
          'primary-action'
        );
        panel.append(eyebrow, title, copy, action);
      }
    }
    function render(dt: number) {
      if (state.mode === 'playing' || state.mode === 'ready') visualTime += dt;
      const travel = state.distance;
      for (let index = 0; index < 84; index++) {
        dashMatrix.makeTranslation(
          index % 2 ? 1.6 : -1.6,
          -0.18,
          -Math.floor(index / 2) * 6 + (travel % 6)
        );
        dashes.setMatrixAt(index, dashMatrix);
      }
      dashes.instanceMatrix.needsUpdate = true;
      islands.forEach((island, index) => {
        island.position.z = 15 - ((index * 17 - travel * 0.8 + 10000) % 306);
      });
      rowViews.forEach((rowView, index) => {
        const row = state.rows[index];
        rowView.group.position.z = -row.distance;
        rowView.ring.position.x = (row.safeLane - 1) * LANE_WIDTH;
        rowView.ring.visible = !row.passed;
        rowView.ring.rotation.z = visualTime * 0.45;
        rowView.hazards.forEach((hazard, lane) => {
          hazard.visible = row.obstacles.includes(lane);
        });
      });
      ship.position.x = state.x;
      ship.position.y = 1.2 + Math.sin(visualTime * 4) * 0.04;
      ship.rotation.z = -(state.lane - 1 - state.x / LANE_WIDTH) * 0.38;
      ship.visible =
        state.invincible <= 0 || Math.floor(visualTime * 15) % 2 === 0;
      flame.scale.y =
        state.boost > 0 ? 2.8 : 0.7 + Math.sin(visualTime * 30) * 0.1;
      shield.visible = state.shield > 0;
      shadow.position.x = state.x;
      particles.visible = state.boost > 0;
      particles.children.forEach((p, i) => {
        p.position.z = 5 - ((i * 2 - travel * 1.8 + 10000) % 38);
      });
      shake = Math.max(0, shake - dt * 2);
      camera.position.x =
        state.x * 0.15 + Math.sin(visualTime * 75) * shake * 0.14;
      camera.fov +=
        ((state.boost > 0 ? 66 : 57) - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
      stage!.render();
    }
    const loop = new GameLoop((dt) => {
      const events = stepFlight(state, dt);
      for (const event of events) {
        audio.play(event);
        if (event === 'hit') shake = 0.7;
      }
      if (state.score > best) {
        best = state.score;
        storage.save('best', best);
      }
      syncUI();
      render(dt);
    });
    const swipeOff = bindSwipe(stage.canvas, (direction) => {
      if (direction === 'left') turn(-1);
      if (direction === 'right') turn(1);
      if (direction === 'up') activateBoost();
    });
    const key = (event: KeyboardEvent) => {
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', ' ', 'Enter'].includes(event.key)
      )
        event.preventDefault();
      if (event.repeat) return;
      if (event.key === 'ArrowLeft' || event.key === 'a') turn(-1);
      if (event.key === 'ArrowRight' || event.key === 'd') turn(1);
      if (event.code === 'Space' || event.key === 'ArrowUp') {
        if (state.mode === 'ready') begin();
        else activateBoost();
      }
      if (event.key === 'Enter' && state.mode !== 'playing')
        panel.querySelector('button')?.click();
      if (event.key === 'p') togglePause();
    };
    const hidden = () => {
      if (document.hidden && state.mode === 'playing') {
        state.mode = 'paused';
        syncUI();
      }
    };
    const contextLost = () => {
      if (state.mode === 'playing') {
        state.mode = 'paused';
        syncUI();
      }
    };
    stage.canvas.addEventListener('webglcontextlost', contextLost);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    syncUI();
    stage.resize();
    render(0);
    loop.start();
    const off = exposeGame(
      () => ({
        game: 'sky',
        ...state,
        coordinates:
          'Lanes 0 left, 1 center, 2 right. Row distance in meters ahead; collision at 0.',
        renderer: 'WebGL2',
        drawCalls: stage.renderer.info.render.calls
      }),
      (ms) => loop.advance(ms)
    );
    return () => {
      loop.stop();
      off();
      swipeOff();
      audio.dispose();
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
      stage.canvas.removeEventListener('webglcontextlost', contextLost);
      stage.dispose();
    };
  }
};
export default sky;
