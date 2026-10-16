import { assert, bundle, models, launch, context, harness, mechanics, fullMatch } from './verify-lib.mjs';
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const m = await models();
const source = await bundle("export * from './src/ai/player.ts'; export * from './src/core/storage.ts';", { format: 'iife', globalName: 'api' });
let now = 0, timer = 0; const timers = new Map(), listeners = new Set(), stored = new Map();
const env = {
  AbortController, DOMException, Error, console, URL, structuredClone, performance,
  Date: class extends Date {
    static now() {
      return now;
    }
  },
  document: { hidden: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) },
  window: {
    setInterval: fn => {
      timers.set(++timer, fn);
      return timer;
    }, clearInterval: id => timers.delete(id), setTimeout: () => 0, clearTimeout() { }
  },
  localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
};
vm.createContext(env); vm.runInContext(source, env); const { Player, HumanPlayer, planningSignature, inspectPlannedInput } = env.api;
const flush = async () => {
  for (let i = 0;i < 12;i++)await Promise.resolve();
};
function fixture(ai = true, planned = false) {
  const replies = [], calls = [], state = { revision: 0, value: 0, paused: false, finished: false, pauses: 0 };
  const controller = ai ? { type: 'ai', choose: (observation, signal) => new Promise((resolve, reject) => replies.push({ observation, signal, resolve, reject })) } : new HumanPlayer();
  const player = new Player(controller), port = player.connect({
    game: 'fixture', planning: planned ? () => ({ game: 'lightsout', epoch: 'fixture', board: [state.value] }) : undefined,
    observe: () => ({ key: String(state.revision), context: 'Visible value', question: 'Choose a control', choices: { go: 'Increase' }, inputs: { go: { amount: 1 } } }), isCurrent: key => key === String(state.revision),
    apply: input => {
      if (state.paused || state.finished) return false;
      calls.push(input);
      state.value += input.amount;
      state.revision++;
      return true;
    },
    start() { }, pause: () => {
      state.paused = true;
      state.pauses++;
    }, resume: () => {
      state.paused = false;
    }, isFinished: () => state.finished, isPaused: () => state.paused
  });
  player.start();
  return { player, port, replies, calls, state };
}
{
  const human = fixture(false), ai = fixture();
  assert(human.port.human({ amount: 1 }));
  assert.equal(ai.port.human({ amount: 10 }), false);
  ai.replies[0].resolve('go');
  await flush();
  assert.equal(ai.state.value, human.state.value);
  assert.deepEqual(ai.calls, human.calls);
  assert.equal(ai.player.decisions, 1);
  human.player.dispose();
  ai.player.dispose();
  const bounded = fixture();
  void bounded.player.tick();
  void bounded.player.tick();
  assert.equal(bounded.replies.length, 1);
  assert.equal(bounded.state.pauses, 0);
  bounded.replies[0].reject(new Error('Model failure'));
  await flush();
  void bounded.player.tick();
  assert.equal(bounded.replies.length, 1);
  assert.match(bounded.player.error, /failure/);
  assert.equal(bounded.player.status, 'playing');
  bounded.player.retry();
  assert.equal(bounded.replies.length, 2);
  bounded.player.dispose();
  const stale = fixture();
  stale.state.revision++;
  stale.replies[0].resolve('go');
  await flush();
  assert.equal(stale.state.value, 0);
  assert.equal(stale.player.discarded, 1);
  stale.player.dispose();
  const invalid = fixture();
  invalid.replies[0].resolve('unknown');
  await flush();
  assert.equal(invalid.state.value, 0);
  assert.equal(invalid.state.pauses, 0);
  invalid.player.dispose();
  const paused = fixture();
  paused.player.pause();
  assert(paused.replies[0].signal.aborted);
  assert.equal(paused.state.pauses, 1);
  paused.player.resume();
  paused.replies[0].resolve('go');
  paused.replies[1].resolve('go');
  await flush();
  assert.equal(paused.state.value, 1);
  paused.player.dispose();
  const takeover = fixture();
  takeover.state.value = 7;
  takeover.player.takeOver();
  assert(takeover.replies[0].signal.aborted);
  assert(takeover.port.human({ amount: 2 }));
  takeover.replies[0].resolve('go');
  await flush();
  assert.equal(takeover.state.value, 9);
  takeover.player.dispose();
  for (const reason of ['finished', 'hidden', 'disposed']) {
    const f = fixture();
    if (reason === 'finished') {
      f.state.finished = true;
      await f.player.tick();
    } else if (reason === 'hidden') {
      env.document.hidden = true;
      for (const fn of listeners) fn();
    } else f.player.dispose();
    f.replies[0].resolve('go');
    await flush();
    assert.equal(f.state.value, 0);
    f.player.dispose();
    env.document.hidden = false;
  }
  const expected = value => planningSignature({ game: 'lightsout', epoch: 'fixture', board: [value] });
  const paced = fixture(true, true);
  paced.replies[0].resolve({ label: 'Two ordinary controls', steps: [{ input: { amount: 1 }, expected: expected(0) }, { input: { amount: 1 }, expected: expected(1) }] });
  await flush();
  assert.equal(paced.state.value, 0);
  void paced.player.tick();
  assert.equal(paced.state.value, 1);
  void paced.player.tick();
  assert.equal(paced.state.value, 1);
  now += 80;
  void paced.player.tick();
  await flush();
  assert.equal(paced.state.value, 2);
  paced.player.dispose();
  for (const reason of ['divergent', 'takeover']) {
    const f = fixture(true, true);
    f.replies[0].resolve({ label: 'One ordinary control', steps: [{ input: { amount: 1 }, expected: expected(0) }] });
    await flush();
    if (reason === 'divergent') f.state.value = 9; else f.player.takeOver();
    now += 100;
    void f.player.tick();
    await flush();
    assert.equal(f.state.value, reason === 'divergent' ? 9 : 0);
    if (reason === 'divergent') assert.equal(f.player.discarded, 1);
    f.player.dispose();
  }
  const claim = env.api.setPlayProfile('human'), runStore = env.api.namespace('fixture');
  runStore.save('score', 3);
  const owner = new Player(new HumanPlayer(), claim);
  owner.watchAI();
  runStore.save('score', 7);
  owner.takeOver();
  runStore.save('score', 8);
  env.api.setPlayProfile('human');
  env.api.namespace('fixture').save('score', 4);
  runStore.save('score', 9);
  assert.equal(stored.get('aeroplay:fixture:score'), '4');
  assert.equal(stored.get('aeroplay:ai:fixture:score'), '9');
  owner.dispose();
}
assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
const builders = [
  ['2048', () => m.g2048.create2048Model({ grid: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0, moves: 0 }), 'left'],
  ['lightsout', () => m.glightsout.createLightsOutModel(), 12], ['flappy', () => {
    const model = m.gflappy.createFlappyModel();
    model.act('flap');
    return model;
  }, 'flap'],
  ['sudoku', () => {
    const model = m.gsudoku.createSudokuModel();
    model.act({ type: 'select', index: 2 });
    return model;
  }, { type: 'value', value: 4 }],
  ['match3', () => m.gmatch3.createMatch3Model(), { x: 0, y: 0 }], ['cargo', () => new m.gcargo.CargoRun(), 'right'],
  ['sky', () => {
    const model = new m.gsky.SkyRun();
    model.act('start');
    return model;
  }, 'right'],
  ['pushball', () => {
    const model = new m.gpushball.PushballRun();
    model.start();
    for (let i = 0;i < 240;i++)model.step(1 / 120);
    return { snapshot: () => model.snapshot(), step: dt => model.step(dt), act: input => model.act(0, input) };
  }, { x: 1, y: 0, dash: false }],
];
for (const [game, create, input] of builders) {
  async function run(ai) {
    const originalRandom = Math.random;
    let seed = 314;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const model = create(), before = structuredClone(model.snapshot());
    let reply;
    const controller = ai ? {
      type: 'ai', choose: () => new Promise(resolve => {
        reply = resolve;
      })
    } : new HumanPlayer(), player = new Player(controller);
    const port = player.connect({
      game, observe: () => ({ key: 'input', context: 'Visible game', question: 'Choose ordinary input', choices: { go: 'Go' }, inputs: { go: input } }),
      isCurrent: key => key === 'input', apply: value => {
        const accepted = model.act(value);
        assert(accepted, `${game}: a genuine native input is accepted`);
        return accepted;
      }, start() { }, pause() { }, resume() { }, isFinished: () => false, isPaused: () => false
    });
    player.start();
    for (let i = 0;i < 30;i++)model.step(1 / 120);
    const pending = structuredClone(model.snapshot());
    if (ai) {
      reply('go');
      await flush();
    } else port.human(input);
    for (let i = 0;i < 12;i++)model.step(1 / 120);
    const after = structuredClone(model.snapshot());
    player.dispose();
    Math.random = originalRandom;
    return { before, pending, after };
  }
  const human = await run(false), ai = await run(true);
  assert.deepEqual(ai.before, human.before, `${game}: identical initial mechanics`);
  assert.deepEqual(ai.pending, human.pending, `${game}: pending inference never changes simulation speed`);
  assert.deepEqual(ai.after, human.after, `${game}: AI and human use identical ordinary input rules and clocks`);
}
assert.equal(timers.size, 0); assert.equal(listeners.size, 0);
const planner = await import(`data:text/javascript;base64,${Buffer.from(await bundle("export * from './src/ai/planner.worker.ts';")).toString('base64')}`);
const lights = Array(25).fill(0); m.glightsout.applyToggle(lights, 0, 0); m.glightsout.applyToggle(lights, 2, 2);
const cargo = m.gcargo.parseCargo(m.gcargo.cargoLevel(1).map), sudoku = [...m.gsudoku.sudokuPuzzle(1).puzzle].map(Number), match = m.gmatch3.createMatchBoard();
const humanHint={game:'cargo',epoch:'hint',board:cargo,state:cargo.initial};
const generatedHints=planner.createHintPlans(humanHint);
assert(generatedHints.length,'A generated island yields a real delivery hint');
assert(['up','down','left','right'].includes(generatedHints[0].steps[0].input),'The first hint step is an ordinary direction');
let hintedState=cargo.initial;
for (const step of generatedHints[0].steps) { const next=m.gcargo.moveCargo(cargo,hintedState,step.input); assert(next,'Every hinted step is legal on the generated island'); hintedState=next.state; }
assert(m.gcargo.cargoSolved(cargo,hintedState),'Following the whole hint delivers every generated crate');
const trappedHint={...humanHint,state:{player:cargo.initial.player,crates:[cargo.floor.find(cell=>m.gcargo.cargoCorner(cargo,cell))]}};
const untouchedHint=structuredClone(trappedHint);assert.deepEqual(planner.createHintPlans(trappedHint),[],'A trapped human crate yields no fabricated AI fallback hint');assert.deepEqual(trappedHint,untouchedHint);
const fixtures = [
  { game: 'flappy', epoch: '0', time: 0, y: 220, velocity: -100, pipes: [{ x: 300, gapY: 155, gap: 145, scored: false }], passed: 0 },
  { game: 'cargo', epoch: '1', board: cargo, state: cargo.initial }, { game: 'lightsout', epoch: '1', board: lights },
  { game: 'sudoku', epoch: '1', board: sudoku, givens: sudoku.flatMap((v, i) => v ? [i] : []), selected: null, notes: true },
  { game: '2048', epoch: '1', board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  { game: 'match3', epoch: '1', board: match, selected: null }, { game: 'sky', epoch: '1', row: 0, lane: 0, target: 2, obstacles: [0, 1] },
  { game: 'pushball', epoch: '1', side: 1, snapshot: m.gpushball.observeMatch(m.gpushball.createMatch()), control: m.gpushball.idleAction(), controlUntil: 0 },
];
for (const original of fixtures) {
  const untouched = structuredClone(original), plans = planner.createInputPlans(original);
  assert.deepEqual(original, untouched);
  assert(plans.length);
  assert(plans.every(plan => plan.steps.length && plan.label.length < 220));
  const state = structuredClone(original), plan = plans[0];
  assert.equal(inspectPlannedInput({ ...state, epoch: 'other-round' }, plan.steps[0]), 'invalid');
  for (const input of plan.steps) {
    if (['flappy', 'pushball'].includes(state.game)) break;
    assert.equal(inspectPlannedInput(state, input), 'ready');
    if (state.game === 'cargo') {
      const move = m.gcargo.moveCargo(state.board, state.state, input.input);
      assert(move);
      state.state = move.state;
    }
    if (state.game === 'lightsout') m.glightsout.applyToggle(state.board, input.input % 5, Math.floor(input.input / 5));
    if (state.game === 'sudoku') {
      if (input.input.type === 'notes') state.notes = !state.notes;
      if (input.input.type === 'select') state.selected = input.input.index;
      if (input.input.type === 'value') {
        assert(!state.givens.includes(state.selected));
        state.board[state.selected] = input.input.value;
      }
    }
    if (state.game === 'match3') state.selected = state.selected && state.selected.x === input.input.x && state.selected.y === input.input.y ? null : input.input;
    if (state.game === 'sky') state.lane += input.input === 'right' ? 1 : input.input === 'left' ? -1 : 0;
  }
  if (state.game === 'cargo') assert(m.gcargo.cargoSolved(state.board, state.state));
  if (state.game === 'lightsout') assert(m.glightsout.isSolved(state.board));
  if (state.game === 'sudoku') assert(state.board.every(Boolean));
  if (state.game === 'sky') assert.equal(state.lane, state.target);
}
const flappy = fixtures[0], timed = planner.createInputPlans(flappy)[0].steps[0]; assert.equal(inspectPlannedInput(flappy, timed), 'wait'); assert.equal(inspectPlannedInput({ ...flappy, time: timed.at, y: timed.y, velocity: timed.velocity }, timed), 'ready'); assert.equal(inspectPlannedInput({ ...flappy, time: timed.until + .01 }, timed), 'invalid'); assert.equal(inspectPlannedInput({ ...flappy, time: timed.at, y: timed.y + 100 }, timed), 'invalid');
const outcome = (plan, choice) => plan.outcomes.find(item => item.choice === choice), ceiling = m.gflappy.planFlight(40, 80, [], 0), ground = m.gflappy.planFlight(430, 90, [], 0), pipe = { x: 82, gapY: 60, gap: 180, scored: false };
assert.deepEqual(Object.keys(ceiling.choices), ['0', '1']); assert.equal(outcome(ceiling, '0').safe, false); assert.equal(outcome(ceiling, '1').safe, true); assert.match(ceiling.context, /Flap: unsafe/); assert.equal(outcome(ground, '0').safe, true); assert.equal(outcome(ground, '1').safe, false);
for (const p of [pipe, { ...pipe, x: 124 }]) {
  const plan = m.gflappy.planFlight(112, p.x === 82 ? -160 : 0, [p], 0);
  assert.equal(outcome(plan, '1').safe, true);
  assert.equal(outcome(plan, '0').safe, false);
} const originalPipe = structuredClone(pipe); m.gflappy.planFlight(160, 120, [pipe], 0); assert.deepEqual(pipe, originalPipe); assert.equal(m.gflappy.flightCollision(440, []), false); assert.equal(m.gflappy.flightCollision(441, []), true);
const pb = fixtures.at(-1), matchState = m.gpushball.createMatch(); matchState.mode = 'playing'; matchState.kickoff = 0; const snap = () => ({ ...pb, snapshot: m.gpushball.observeMatch(matchState) }), plans = planner.createPushballPlans(snap()); assert.deepEqual(plans.map(plan => plan.label.split(':')[0]), ['Intercept', 'Left flank', 'Right flank', 'Dash shot'], 'Central attacking state excludes the ineligible defensive hold'); assert(plans.every(plan => plan.steps.length <= 4 && plan.steps.every(step => Math.hypot(step.input.x, step.input.y) <= 1.00001)));
const first = plans[0].steps[0], exact = snap(); exact.snapshot.elapsed = first.at; Object.assign(exact.snapshot.robots[1], first.pushball.robot); Object.assign(exact.snapshot.robots[0], first.pushball.opponent); exact.snapshot.ball = { ...first.pushball.ball }; assert.equal(inspectPlannedInput(snap(), first), 'wait'); assert.equal(inspectPlannedInput(exact, first), 'ready'); assert.equal(inspectPlannedInput({ ...exact, epoch: 'next-goal' }, first), 'invalid'); exact.snapshot.ball.x += 4; assert.equal(inspectPlannedInput(exact, first), 'invalid'); exact.snapshot.ball = { ...first.pushball.ball }; exact.snapshot.elapsed = first.until + .001; assert.equal(inspectPlannedInput(exact, first), 'invalid');
matchState.score[1] = 2; matchState.ball = { x: 0, y: 9.3, vx: 0, vy: 8 }; const stop = planner.createPushballPlans(snap()); assert.equal(stop.length, 1); assert.deepEqual(stop[0].steps[0].input, m.gpushball.idleAction()); assert.equal(inspectPlannedInput(snap(), stop[0].steps[0]), 'ready');
for (const side of [0, 1]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
  const p = m.gpushball, radius = p.FIELD.cornerRadius, cx = p.FIELD.width / 2 - radius, cy = p.FIELD.length / 2 - radius, ballOrbit = radius - p.BALL_RADIUS, robotOrbit = radius - p.ROBOT_RADIUS;
  const angle = Math.PI / 4, offset = Math.acos((ballOrbit ** 2 + robotOrbit ** 2 - (p.BALL_RADIUS + p.ROBOT_RADIUS) ** 2) / (2 * ballOrbit * robotOrbit)), s = p.createMatch();
  s.mode = 'playing';
  s.kickoff = 0;
  s.ball = { x: sx * (cx + ballOrbit / Math.sqrt(2)), y: sy * (cy + ballOrbit / Math.sqrt(2)), vx: 0, vy: 0 };
  const start = { ...s.ball }, attack = side === 0 ? -1 : 1, gx = -s.ball.x, gy = attack * (p.FIELD.length / 2 + 1) - s.ball.y, direction = -sx * Math.sin(angle) * gx + sy * Math.cos(angle) * gy >= 0 ? 1 : -1, from = angle - direction * offset;
  s.robots[side].x = sx * (cx + robotOrbit * Math.cos(from));
  s.robots[side].y = sy * (cy + robotOrbit * Math.sin(from));
  const snapshot = () => ({ game: 'pushball', epoch: 'wall', side, snapshot: p.observeMatch(s), control: p.idleAction(), controlUntil: 0 }), plan = planner.createPushballPlans(snapshot()).find(plan => plan.label.startsWith('Wall release:'));
  assert(plan, 'Every side and curved corner offers an ordinary wall-release plan');
  function advance(action, duration) {
    for (let time = 0;time < duration - .000001;time += 1 / 120)p.stepMatch(s, side === 0 ? [action, p.idleAction()] : [p.idleAction(), action], Math.min(1 / 120, duration - time));
  }
  advance(p.idleAction(), plan.steps[0].at);
  for (const input of plan.steps) {
    assert.equal(inspectPlannedInput(snapshot(), input), 'ready');
    advance(input.input, .14);
  }
  assert(Math.hypot(s.ball.x - start.x, s.ball.y - start.y) > .4, 'Replayed guarded wall release moves actual trapped ball');
}
// Captured Pushball validity and goal-mouth regressions use real model physics.
const capturedPushball = [
  { name: 'defend-fixed-point', snapshot: {
    robots: [
      { x: 3.914599999999996, y: 5.5, vx: 0, vy: 0, facingX: 1, facingY: 0, cooldown: 0, dashLeft: 0 },
      { x: .005222358905803151, y: -5.800000000000002, vx: 0, vy: 0, facingX: .0005268237810366038, facingY: .9999998612283423, cooldown: 0, dashLeft: 0 }
    ], ball: { x: .00803439831662024, y: 8.616293751887774, vx: 5.051118731973506e-29, vy: 5.416948607130321e-26 }, score: [0, 1], elapsed: 90.26966666667498
  } },
  { name: 'unreachable-goal-mouth', snapshot: {
    robots: [
      { x: .5755253566750009, y: 6.740625053631863, vx: 0, vy: 0, facingX: 0, facingY: -1, cooldown: 0, dashLeft: 0 },
      { x: .03445663152111877, y: -8.28, vx: 0, vy: 0, facingX: -.3450223261422805, facingY: -.9385944781764753, cooldown: 0, dashLeft: 0 }
    ], ball: { x: 1.9344566315211187, y: -8.55649650514015, vx: -3.818585870409439e-21, vy: 2.080182180017714e-22 }, score: [0, 2], elapsed: 178.6696666666578
  } }
];
function capturedStates() {
  return capturedPushball.flatMap(({ name, snapshot }) => [1, 0].map(side => {
    const mirrored = structuredClone(snapshot);
    if (side === 0) {
      mirrored.robots.reverse(); mirrored.score.reverse();
      for (const body of [...mirrored.robots, mirrored.ball]) {
        body.y *= -1; body.vy *= -1;
        if ('facingY' in body) body.facingY *= -1;
      }
    }
    return { name, source: { game: 'pushball', epoch: name + ':' + side, side, snapshot: mirrored, control: m.gpushball.idleAction(), controlUntil: mirrored.elapsed + .24 } };
  }));
}
function replayCaptured(source, plan) {
  const p = m.gpushball, state = p.createMatch(), start = source.snapshot;
  Object.assign(state, structuredClone(start), { mode: 'playing', kickoff: 0 });
  const own = source.side, other = own === 0 ? 1 : 0;
  function advance(action, duration) {
    const opponent = p.normalizeAction({ x: start.robots[other].vx / p.MOVE_SPEED, y: start.robots[other].vy / p.MOVE_SPEED, dash: false });
    for (let time = 0; time < duration - .000001; time += 1 / 120) {
      const input = { ...action, dash: time === 0 && action.dash };
      p.stepMatch(state, own === 0 ? [input, opponent] : [opponent, input], Math.min(1 / 120, duration - time));
    }
  }
  const held = Math.max(0, Math.min(.16, source.controlUntil - state.elapsed));
  advance(source.control, held); advance(p.idleAction(), .16 - held);
  for (const step of plan.steps) {
    assert.equal(inspectPlannedInput({ ...source, snapshot: p.observeMatch(state) }, step), 'ready', 'Captured native controls satisfy exact timed geometry guards');
    assert(Math.hypot(step.input.x, step.input.y) <= 1.000001);
    advance(step.input, .14);
  }
  return { state, robotMovement: Math.hypot(state.robots[own].x - start.robots[own].x, state.robots[own].y - start.robots[own].y), ballMovement: Math.hypot(state.ball.x - start.ball.x, state.ball.y - start.ball.y), conceded: state.score[other] > start.score[other] };
}
function verifyCapturedPlans(name, source) {
  const plans = planner.createPushballPlans(source);
  assert(plans.length && plans.every(plan => plan.steps.length <= 4));
  const stopped = plans.filter(plan => {
    const result = replayCaptured(source, plan);
    return result.robotMovement < .05 && result.ballMovement < .05;
  });
  assert.deepEqual(stopped.map(plan => plan.label.split(':')[0]), [], `${name} side${source.side}: a stationary forecast cannot offer a permanently stalled control`);
  if (name === 'unreachable-goal-mouth') assert(plans.some(plan => {
    const result = replayCaptured(source, plan);
    return result.ballMovement > .25 && !result.conceded;
  }), 'Existing guarded ordinary controls physically dislodge the goal-mouth ball without conceding');
}
function verifyCapturedChoice(name, source, chosen) {
  const result = replayCaptured(source, chosen.plan);
  assert(result.robotMovement > .4 || result.ballMovement > .4, `${name} side${source.side}: actual resident WASM must choose physical progress rather than the captured fixed point`);
  assert(!result.conceded);
  assert.equal(chosen.diagnostics.info.initializations, 1);
  assert.equal(chosen.modelCalls, 1, 'Every selected plan, including singletons, sends one genuine resident model decision');
  const probabilities = chosen.diagnostics.lastDecision.probabilities;
  assert.equal(probabilities.length, planner.createPushballPlans(source).length, 'Even a singleton viable plan invokes the actual pinned model');
  assert.equal(chosen.diagnostics.lastDecision.choice, String(probabilities.indexOf(Math.max(...probabilities))), 'The corrected candidates retain genuine pinned-model argmax');
  return result;
}
// End captured Pushball regression helpers.
for (const { name, source } of capturedStates()) verifyCapturedPlans(name, source);
console.log('PASS player authority, clock independence, bounds, failure/retry, abort/stale replies, plan pacing, ownership and all8 immutable guarded planners');

const browser = await launch();
try {
  const cold = await context(browser), coldRun = await harness(cold);
  let releaseModel, requestedModel;
  const modelGate = new Promise(resolve => { releaseModel = resolve; }), modelRequest = new Promise(resolve => { requestedModel = resolve; });
  await cold.route(/\.wasm(?:\?|$)/, async route => { requestedModel(); await modelGate; await route.continue(); });
  await coldRun.open('sky');
  await coldRun.button('Watch TAMEV').click();
  await modelRequest;
  const loadingRun = mechanics(await coldRun.state());
  await coldRun.page.waitForTimeout(700);
  assert.deepEqual(mechanics(await coldRun.state()), loadingRun, 'Cold Watch freezes the action game while its real WASM model loads');
  releaseModel();
  await coldRun.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.info?.initializations === 1 && JSON.parse(window.render_game_to_text()).distance > 0, null, { timeout: 120000 });
  await coldRun.action('ai-pause').click();
  coldRun.clean(); await cold.close();
  const ctx = await context(browser, { audit: true }), h = await harness(ctx), requests = [];
  h.page.on('request', r => requests.push(r.url()));
  await ctx.addInitScript(() => {
    window.__modelDecisionCalls = 0;
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(data, ...rest) {
      if (data?.type === 'decide') window.__modelDecisionCalls++;
      return send.call(this, data, ...rest);
    };
  });
  await h.open('lightsout');
  await h.page.waitForTimeout(300);
  assert.equal(requests.filter(url => /models\/tamev|\.wasm/.test(url)).length, 0, 'Human play does not preload ONNX/WASM');
  const human = await h.state();
  await h.button('Watch TAMEV').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).ai.info?.initializations === 1, null, { timeout: 120000 });
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.decisions > 0);
  await h.action('ai-pause').click();
  const paused = mechanics(await h.state());
  await h.page.waitForTimeout(250);
  assert.deepEqual(mechanics(await h.state()), paused);
  assert.equal((await h.state()).player.status, 'paused');
  await h.action('ai-pause').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'won', null, { timeout: 30000 });
  const won = await h.state();
  assert(won.player.decisions > 0);
  assert.equal(won.player.error, '');
  assert.deepEqual(human.initial, won.initial);
  await h.shot('watch-lights-full-round');
  await h.button('Watch again').click();
  await h.page.waitForFunction(() => window.render_game_to_text && JSON.parse(window.render_game_to_text()).player.type === 'ai');
  await h.button('Take over').click();
  const takeover = await h.state();
  assert.equal(takeover.player.type, 'human');
  await h.page.waitForTimeout(200);
  assert.deepEqual((await h.state()).board, takeover.board);
  await h.pick(12);
  assert.equal((await h.state()).moves, takeover.moves + 1);
  await h.button('Your run').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.type === 'human');
  assert.deepEqual((await h.state()).board, human.board);
  await h.open('sky');
  await h.button('Start flight').click(); await h.action('left').click(); await h.button('Pause').click();
  const personalFlight = mechanics(await h.state());
  await h.button('Watch TAMEV').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.decisions >= 3, null, { timeout: 20000 });
  const live = await h.state();
  assert(live.distance > 0);
  assert.equal(live.ai.info.initializations, 1);
  assert.equal(live.player.error, '');
  await h.button('Take over').click();
  assert.equal((await h.state()).player.type, 'human');
  await h.button('Your run').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.type === 'human' && JSON.parse(window.render_game_to_text()).mode === 'paused');
  assert.deepEqual(mechanics(await h.state()), personalFlight, 'Watch and takeover do not replace the saved personal flight');
  await h.open('flappy'); await h.button('Watch TAMEV').click(); await h.advance(6000);
  assert.equal((await h.state()).mode, 'over');
  await h.button('Watch again').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).player.type === 'ai' && JSON.parse(window.render_game_to_text()).mode === 'playing');
  assert.equal((await h.state()).score, 0, 'Watch again starts a fresh flight instead of restoring the prior AI terminal save');
  await h.open('lightsout');
  const workerRoute = /\/src\/ai\/planner\.worker\.ts(?:\?|$)/;
  await ctx.route(workerRoute, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: 'self.close();' }));
  await h.button('Watch TAMEV').click();
  await h.page.waitForFunction(() => !!JSON.parse(window.render_game_to_text()).player.error, null, { timeout: 12000 });
  const failed = await h.state();
  assert.match(failed.player.error, /timed out|stopped/i);
  assert.equal(failed.player.decisions, 0);
  await h.page.waitForTimeout(300);
  assert.equal((await h.state()).player.decisions, 0, 'A failed worker does not spin or invent inputs');
  await ctx.unroute(workerRoute);
  await h.action('ai-retry').click();
  await h.page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === 'won', null, { timeout: 30000 });
  assert.equal((await h.state()).player.error, '');
  assert((await h.state()).player.decisions > 0, 'Native Retry AI restarts genuine worker planning');
  await h.open('hub');
  const playerURLs=[...new Set(requests.filter(url=>/\/src\/ai\/player\.ts(?:\?|$)/.test(url)))];
  assert.equal(playerURLs.length,1,'Runtime probe imports the exact module instance used by this stable page');
  const runtime = await h.page.evaluate(async moduleURL => {
    const api = await import(moduleURL), [first, second] = await Promise.all([api.prepareLocalDecision(), api.prepareLocalDecision()]);
    const observation = { key: 'probe', context: 'The golden ring is in the right lane. The middle lane has a barrier.', question: 'Which lane contains the golden ring?', choices: { left: 'left', middle: 'middle', right: 'right' } };
    const errorOf = async call => {
      try {
        await call();
        return '';
      } catch (error) {
        return error.name + ': ' + error.message;
      }
    };
    const original = await api.requestLocalDecision(observation, new AbortController().signal), reordered = await api.requestLocalDecision({ ...observation, choices: { right: 'right', left: 'left', middle: 'middle' } }, new AbortController().signal);
    const overBudget = await errorOf(() => api.requestLocalDecision({ ...observation, context: 'word '.repeat(150) }, new AbortController().signal));
    const single = await api.requestLocalDecision({ ...observation, choices: { right: 'right' } }, new AbortController().signal);
    const optionBudget = await errorOf(() => api.requestLocalDecision({ ...observation, choices: { left: 'word '.repeat(100), right: 'right' } }, new AbortController().signal));
    const noOptions = await errorOf(() => api.requestLocalDecision({ ...observation, choices: {} }, new AbortController().signal));
    const aborted = new AbortController();
    aborted.abort();
    const preAborted = await errorOf(() => api.requestLocalDecision(observation, aborted.signal));
    const signal = new AbortController(), cancelled = errorOf(() => api.requestLocalDecision(observation, signal.signal));
    signal.abort();
    const next = api.requestLocalDecision(observation, new AbortController().signal), busy = await errorOf(() => api.requestLocalDecision(observation, new AbortController().signal));
    await next;
    await new Promise(resolve => setTimeout(resolve, 100));
    return { first, second, original, reordered, single, optionBudget, noOptions, overBudget, preAborted, cancelled: await cancelled, busy, diagnostics: api.getLocalDecisionDiagnostics() };
  },playerURLs[0]);
  assert.equal(runtime.first.initializations, 1);
  assert.equal(runtime.second.initializations, 1);
  for (const [value, keys] of [[runtime.original, ['left', 'middle', 'right']], [runtime.reordered, ['right', 'left', 'middle']]]) assert.equal(value.choice, keys[value.probabilities.indexOf(Math.max(...value.probabilities))]);
  assert.match(runtime.overBudget, /token budget exceeded/);
  assert.match(runtime.preAborted, /AbortError/);
  assert.match(runtime.cancelled, /AbortError/);
  assert.match(runtime.busy, /busy/);
  assert.equal(runtime.diagnostics.pending, 0);
  assert.equal(runtime.diagnostics.info.initializations, 1);
  assert.equal(runtime.single.choice, 'right');
  assert.equal(runtime.single.probabilities.length, 1);
  assert.match(runtime.optionBudget, /limits|token budget exceeded/);
  assert.match(runtime.noOptions, /limits/);
  if (process.env.ORT_NODE_MODULE) {
    const ort = await import(pathToFileURL(process.env.ORT_NODE_MODULE).href), { Tokenizer } = await import('@huggingface/tokenizers'), directory = 'public/models/tamev-nano/';
    const json = async name => JSON.parse(await readFile(directory + name, 'utf8')), tokenizer = new Tokenizer(await json('tokenizer.json'), await json('tokenizer_config.json')), config = await json('config.json');
    const session = await ort.InferenceSession.create(directory + 'model_int8.onnx', { intraOpNumThreads: 1, graphOptimizationLevel: 'basic' });
    const tensors = (rows, option = false) => {
      const width = Math.max(...rows.map(row => row.length)), ids = new BigInt64Array(rows.length * width), mask = new BigInt64Array(ids.length);
      rows.forEach((row, i) => row.forEach((value, j) => {
        ids[i * width + j] = BigInt(value);
        mask[i * width + j] = 1n;
      }));
      const dims = option ? [1, rows.length, width] : [1, width];
      return [new ort.Tensor('int64', ids, dims), new ort.Tensor('int64', mask, dims)];
    };
    try {
      for (const [browser, keys] of [[runtime.original, ['left', 'middle', 'right']], [runtime.reordered, ['right', 'left', 'middle']]]) {
        const [ctx, ctxMask] = tensors([tokenizer.encode('The golden ring is in the right lane. The middle lane has a barrier.\nWhich lane contains the golden ring?').ids]), [opts, optMask] = tensors(keys.map(key => tokenizer.encode(key).ids), true), feeds = { ctx_input_ids: ctx, ctx_attention_mask: ctxMask, opt_input_ids: opts, opt_attention_mask: optMask }, out = await session.run(feeds);
        const probabilities = Array.from(out.probs.data, value => Math.max(value, 1e-12) ** (config.calibration_by_k[keys.length] ?? 1));
        assert.equal(browser.choice, keys[probabilities.indexOf(Math.max(...probabilities))], 'WASM/native basic optimization retains calibrated choice');
        Object.values(feeds).forEach(tensor => tensor.dispose());
        Object.values(out).forEach(tensor => tensor.dispose());
      }
    } finally {
      await session.release();
    }
    console.log('PASS optional WASM/native calibrated choice parity');
  }
  await h.open('pushball');
  // Captured ordinary state from a real match that stalled when one context word changed.
  const frozen = {
    game: 'pushball', epoch: '1:1', side: 1,
    snapshot: {
      robots: [
        { x: 3.6204870615964464, y: 5.6979908777375, vx: 0, vy: 0, facingX: 1, facingY: 0, cooldown: 0, dashLeft: 0 },
        { x: -3.111257968871475, y: 6.517162991789214, vx: -0.0000016715655526411338, vy: -0.000001664601789741475, facingX: -0.8175009881953511, facingY: -0.5759271953117203, cooldown: 0, dashLeft: 0 }
      ],
      ball: { x: -5.011257901754958, y: 8.017163058625995, vx: -0.0000017364820904899968, vy: -0.0000017292462624059448 },
      score: [0, 1], elapsed: 90.06666666667485
    },
    control: { x: -3.6338391931875236e-7, y: -3.61869792313159e-7, dash: false }, controlUntil: 90.27366666667483
  };
  const pushballURLs = [...new Set(requests.filter(url => /\/src\/games\/pushball\/index\.ts(?:\?|$)/.test(url)))];
  assert.equal(pushballURLs.length, 1, 'Frozen regression uses the actual mounted game context formatter');
  const frozenChoice = await h.page.evaluate(async ({ playerURL, gameURL, state }) => {
    const api = await import(playerURL), { pushballContext } = await import(gameURL), controller = new api.TamevPlayer(), context = pushballContext(state.side), before = window.__modelDecisionCalls;
    try {
      const plan = await controller.choose({ key: 'frozen', context, question: 'Which ordinary movement helps score or defend?', choices: { wait: 'Stop' }, planning: state }, new AbortController().signal);
      return { context, plan, modelCalls: window.__modelDecisionCalls - before, diagnostics: api.getLocalDecisionDiagnostics() };
    } finally { controller.cancel(); }
  }, { playerURL: playerURLs[0], gameURL: pushballURLs[0], state: frozen });
  assert.match(frozenChoice.plan.label, /^Left flank:/);
  const frozenOptions = planner.createPushballPlans(frozen);
  assert.deepEqual(frozenOptions.map(plan => plan.label.split(':')[0]), ['Left flank'], 'Only the original productive corner alternative survives forecast validation');
  assert.match(frozenChoice.context, /^Robot pushball\. You attack bottom and defend top\./, 'The preserved production context keeps its attack/defend wording');
  const comparablePlan = plan => JSON.parse(JSON.stringify(plan, (_, value) => typeof value === 'number' ? Number(value.toFixed(10)) : value));
  assert.deepEqual(comparablePlan(frozenChoice.plan), comparablePlan(frozenOptions[0]), 'Node/WebKit plans match within1e-10 floating precision with exact structure and guards');
  assert.equal(frozenChoice.diagnostics.lastDecision.choice, '0', 'Filtered key0 maps exactly to the original Left flank, previously key1');
  assert.equal(frozenChoice.diagnostics.lastDecision.probabilities.length, 1, 'The singleton still enters real pinned ONNX inference');
  assert.equal(frozenChoice.diagnostics.lastDecision.choice, String(frozenChoice.diagnostics.lastDecision.probabilities.indexOf(Math.max(...frozenChoice.diagnostics.lastDecision.probabilities))));
  assert.equal(frozenChoice.diagnostics.info.initializations, 1);
  assert.equal(frozenChoice.modelCalls, 1, 'The productive singleton still dispatches real resident ONNX inference');
  assert(Math.hypot(frozenChoice.plan.steps[0].input.x, frozenChoice.plan.steps[0].input.y) > .9, 'Real WASM chooses productive ordinary movement');
  const replay = m.gpushball.createMatch();
  Object.assign(replay, structuredClone(frozen.snapshot), { mode: 'playing', kickoff: 0 });
  function advanceFrozen(action, duration) {
    for (let time = 0; time < duration - .000001; time += 1 / 120) m.gpushball.stepMatch(replay, [m.gpushball.idleAction(), { ...action, dash: time === 0 && action.dash }], Math.min(1 / 120, duration - time));
  }
  const held = Math.max(0, Math.min(.16, frozen.controlUntil - replay.elapsed));
  advanceFrozen(frozen.control, held); advanceFrozen(m.gpushball.idleAction(), .16 - held);
  for (const step of frozenChoice.plan.steps) {
    assert.equal(inspectPlannedInput({ ...frozen, snapshot: m.gpushball.observeMatch(replay) }, step), 'ready');
    advanceFrozen(step.input, .14);
  }
  assert(Math.hypot(replay.ball.x - frozen.snapshot.ball.x, replay.ball.y - frozen.snapshot.ball.y) > .4, 'Chosen guarded inputs move the actual trapped ball');
  await writeFile('output/verification-' + (process.env.TEST_BROWSER ?? 'webkit') + '/frozen-pushball-choice.json', JSON.stringify({ ...frozenChoice, candidateMapping: Object.fromEntries(frozenOptions.map((plan, index) => [String(index), plan.label])) }, null, 2));
  console.log('PASS frozen real-match context, resident WASM selection and productive guarded corner replay');
  for (const { name, source } of capturedStates()) {
    const chosen = await h.page.evaluate(async ({ playerURL, gameURL, state }) => {
      const api = await import(playerURL), { pushballContext } = await import(gameURL), controller = new api.TamevPlayer(), before = window.__modelDecisionCalls;
      try {
        const plan = await controller.choose({ key: state.epoch, context: pushballContext(state.side), question: 'Which ordinary movement helps score or defend?', choices: { wait: 'Stop' }, planning: state }, new AbortController().signal);
        return { plan, modelCalls: window.__modelDecisionCalls - before, diagnostics: api.getLocalDecisionDiagnostics() };
      } finally { controller.cancel(); }
    }, { playerURL: playerURLs[0], gameURL: pushballURLs[0], state: source });
    const result = verifyCapturedChoice(name, source, chosen);
    await writeFile(`output/verification-${process.env.TEST_BROWSER ?? 'webkit'}/${name}-side${source.side}.json`, JSON.stringify({ chosen, robotMovement: result.robotMovement, ballMovement: result.ballMovement }, null, 2));
  }

  await fullMatch(h);
  assert.equal((await h.state()).ai.info.initializations, 1);
  await h.shot('real-tamev-full-match');
  await h.open('hub');
  const workerAudit=await h.page.evaluate(()=>window.__gpuAudit);
  if(workerAudit.workers!==1)console.log('Unexpected live workers',workerAudit.workerLog.filter(worker=>worker.alive));
  assert.equal((await h.page.evaluate(() => window.__gpuAudit)).workers, 1);
  h.clean();
  await ctx.close();
  console.log('PASS real local TAMEV full watched round, pause, takeover, personal save, resident reuse, budgets/cancellation and complete Pushball match');
} finally {
  await browser.close();
}
