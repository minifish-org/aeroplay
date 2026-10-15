import { GameLoop, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { Player, TamevPlayer, prepareTamev, getLocalDecisionDiagnostics, type PlayerGame } from '../../ai/player';
import { PushballRun, idleAction, type Action, type Side } from './model';
import { PushballView } from './view';
import { pushballHUD } from './hud';
export function pushballContext(side: Side) {
  return 'Robot pushball. You attack ' + (side === 0 ? 'top' : 'bottom') + ' and defend ' + (side === 0 ? 'bottom' : 'top') + '. First to 3 goals. Forecasts assume opponent keeps current velocity; replan when it changes.';
}

export default function mount(context: GameContext) {
  const { stage, hud, store, player: human } = context;
  stage.mount(hud.element, hud.playArea, 'arena', 14.6, 22.8, 0x203d50);
  const model = new PushballRun(store.load('wins', 0), store.load('matches', 0)), view = new PushballView(stage), audio = new GameAudio(), opponent = new Player(new TamevPlayer());
  let disposed = false, loading = false, modelReady = false, error = '', selectedPlan = 'Waiting for kickoff', goal = 0, storedMatches = model.matches;
  const controls = pushballHUD(hud, model, () => { void startMatch(); }, togglePause, () => opponent.retry(), audio, () => stage.available, (x, y) => stage.groundDirection(x, y));
  const render = (dt = 0) => { view.render(model.state, dt); controls.refresh(loading, error, opponent.error); hud.enforceGraphics(); stage.advance(dt); stage.render(); };
  const loop = new GameLoop(dt => {
    if (hud.helpOpen || document.hidden || model.mode !== 'playing')
      return;
    humanPort.human(controls.read());
    model.step(dt);
    if (model.state.goalSerial !== goal) {
      goal = model.state.goalSerial;
      controls.reset();
      selectedPlan = 'Waiting for kickoff';
      audio.play(model.state.lastScorer === 0 ? 'collect' : 'hit');
    }
    if (model.matches !== storedMatches) {
      storedMatches = model.matches;
      store.save('matches', model.matches);
      store.save('wins', model.wins);
      void opponent.tick();
      if (model.state.winner === 0)
        audio.play('win');
    }
  }, render, () => !disposed && !document.hidden && model.mode === 'playing' && !hud.helpOpen || stage.animating);
  const wake = () => { if (disposed)
    return; render(); if (model.mode === 'playing' || stage.animating)
    loop.start(); };
  function port(side: Side): PlayerGame<Action> {
    const key = () => model.version + ':' + model.state.goalSerial + ':' + side + ':' + Math.floor(model.state.elapsed / .14);
    return { game: 'pushball', planning: () => model.planning(side), observe: () => {
        if (!model.planning(side))
          return null;
        return { key: key(), context: pushballContext(side), question: 'Which ordinary movement helps score or defend?', choices: { wait: 'Stop' }, inputs: { wait: idleAction() } };
      }, isCurrent: value => value === key(), apply: action => model.act(side, action), clearInput: () => model.clear(side), onPlanSelected: plan => { if (side === 1)
        selectedPlan = plan.label.split(':')[0]; },
      start: () => { model.start(); wake(); }, pause: () => { model.pause(); loop.stop(); wake(); }, resume: () => { model.resume(); wake(); }, isFinished: () => model.mode === 'over', isPaused: () => model.mode === 'paused' };
  }
  const humanPort = human.connect(port(0)), opponentPort = opponent.connect(port(1));
  async function startMatch() {
    if (loading || disposed || hud.helpOpen || !stage.available)
      return;
    human.pause();
    opponent.pause();
    controls.reset();
    model.reset();
    goal = 0;
    error = '';
    selectedPlan = 'Waiting for kickoff';
    loading = true;
    const ticket = model.version;
    audio.unlock();
    render();
    try {
      await prepareTamev();
      if (disposed || ticket !== model.version)
        return;
      loading = false;
      modelReady = true;
      if (document.hidden || !stage.available) {
        render();
        return;
      }
      human.start();
      opponent.start();
      wake();
    }
    catch (failure) {
      if (disposed || ticket !== model.version)
        return;
      loading = false;
      modelReady = false;
      error = failure instanceof Error ? failure.message : 'The local player could not load.';
      render();
    }
  }
  function togglePause() { if (model.mode === 'playing') {
    human.pause();
    opponent.pause();
    controls.reset();
    model.clear();
    loop.stop();
    render();
  }
  else if (model.mode === 'paused' && modelReady && !document.hidden && stage.available) {
    controls.reset();
    human.resume();
    opponent.resume();
    wake();
  } }
  const off = opponent.subscribe(wake), hidden = () => { if (document.hidden && model.mode === 'playing')
    togglePause(); }, blur = () => { if (model.mode === 'playing')
    togglePause(); };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('blur', blur);
  hud.element.addEventListener('stage-lost', blur);
  hud.onChange = wake;
  let menuPaused = false;
  hud.onMenuChange = open => {
    if (open && model.mode === 'playing') { menuPaused = true; togglePause(); }
    else if (!open && menuPaused) { menuPaused = false; if (model.mode === 'paused') togglePause(); }
  };
  window.render_game_to_text = () => { const local = getLocalDecisionDiagnostics() as {
    info: {
      initializations: number;
    } | null;
    lastDecision: unknown;
    pending: number;
  }; return JSON.stringify({ ...model.snapshot(), coordinates: 'Field center origin; x right, y down. Blue attacks top, coral bottom.', ...stage.inspect(), player: human.diagnostics(), ai: { ...local, provider: 'TAMEV + Planning', ...opponent.diagnostics(), plan: selectedPlan, modelReady, loading, modelInitializations: local.info?.initializations ?? 0, lastDecision: local.lastDecision, pending: local.pending, controllerPending: opponent.diagnostics().pending } }); };
  window.advanceTime = ms => { loop.advance(ms); };
  wake();
  return () => { disposed = true; model.version++; loop.stop(); off(); humanPort.dispose(); opponentPort.dispose(); opponent.dispose(); controls.dispose(); audio.dispose(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur); hud.element.removeEventListener('stage-lost', blur); delete window.render_game_to_text; delete window.advanceTime; };
}
