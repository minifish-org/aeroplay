import type { GameModule } from './gameTypes';
import type { PlayerGame } from '../core/player';
import type { PlanningState } from '../core/ai-planning-state';
import { prepareTamev } from '../core/ai-model';
import { getLocalDecisionDiagnostics } from '../core/local-decision';
import { GameLoop } from '../core/engine';
import { GameAudio } from '../core/audio';
import { exposeGame } from '../core/play';
import { namespace } from '../core/storage';
import { createGameShell, createTouchButton } from '../core/ui';
import { createMatch, idleAction, normalizeAction, observeMatch, stepMatch, CONTROL_LIFETIME, type Action, type Side } from './pushball/model';
import { connectOpponent } from './pushball/opponent';
import { bindPushballInput } from './pushball/input';
import { createPushballView } from './pushball/view';
import '../../styles/pushball.css';

const pushball: GameModule = {
  id: 'pushball', name: 'Robot Pushball', icon: '🤖', playMode: 'versus-ai',
  description: 'Outsmart a local AI. Get behind the ball, dash, and push it home.',
  mount(root, goBack, human) {
    const { area } = createGameShell(root, 'Robot Pushball', goBack);
    const shell = area.closest<HTMLElement>('.game-shell')!;
    shell.classList.add('pushball-shell');
    const store = namespace('pushball');
    let wins = store.load('wins', 0), matches = store.load('matches', 0);
    let state = createMatch(), version = 0, disposed = false, loading = false, modelReady = false;
    let modelError = '', selectedPlan = 'Waiting for kickoff', goalSerial = 0;
    const controls: [Action, Action] = [idleAction(), idleAction()];
    const until: [number, number] = [0, 0];
    const hud = document.createElement('div'); hud.className = 'pushball-hud';
    hud.innerHTML = '<div class="pushball-team human-team"><span>YOU · BLUE</span><strong>0</strong></div><div class="pushball-match-label">FIRST TO 3<span>Push. Dash. Score.</span></div><div class="pushball-team ai-team"><span>TAMEV · CORAL</span><strong>0</strong></div>';
    const host = document.createElement('div'); host.className = 'pushball-view';
    host.append(hud);
    area.append(host);
    const view = createPushballView(host);
    if (!view) return () => {};
    const banner = document.createElement('div'); banner.className = 'pushball-banner';
    banner.setAttribute('role', 'status'); host.append(banner);
    const overlay = document.createElement('div'); overlay.className = 'pushball-overlay';
    overlay.innerHTML = '<div class="pushball-panel"><span class="panel-eyebrow">LOCAL AI DUEL</span><h2>Push your luck.</h2><p></p><div class="pushball-panel-actions"></div></div>';
    const heading = overlay.querySelector('h2')!, copy = overlay.querySelector('p')!;
    const primary = createTouchButton('Start match', () => {
      if (state.mode === 'paused') resumeMatch();
      else void startMatch();
    }, 'pushball-primary');
    const secondary = createTouchButton('New match', () => {
      if (state.mode === 'over') goBack();
      else void startMatch();
    });
    overlay.querySelector('.pushball-panel-actions')!.append(primary, secondary);
    host.append(overlay);
    const nativeControls = document.createElement('div'); nativeControls.className = 'pushball-controls';
    const input = bindPushballInput(nativeControls, togglePause);
    const audio = new GameAudio();
    const utility = document.createElement('div'); utility.className = 'pushball-utility';
    const pause = createTouchButton('Pause', togglePause);
    const retry = createTouchButton('Retry AI', () => opponent.player.retry()); retry.hidden = true;
    utility.append(pause, audio.button, retry);
    const ai = document.createElement('div'); ai.className = 'pushball-ai';
    ai.innerHTML = '<strong>TAMEV + Planning · On device</strong><span></span>';
    const instructions = document.createElement('p'); instructions.className = 'pushball-instructions';
    instructions.textContent = 'Push into the TOP goal · Joystick / WASD / arrows · Space to dash · P to pause';
    host.append(nativeControls, utility);
    area.append(ai, instructions);
    const loop = new GameLoop(update, 0.05, dt => render(dt));
    function clearControl(side: Side) { controls[side] = idleAction(); until[side] = 0; }
    function planning(side: Side): PlanningState | null {
      if (state.mode !== 'playing' || state.kickoff > 0) return null;
      return { game: 'pushball', epoch: `${version}:${state.goalSerial}`, side,
        snapshot: observeMatch(state), control: { ...controls[side] }, controlUntil: until[side] };
    }
    function port(side: Side): PlayerGame<Action> {
      const key = () => `${version}:${state.goalSerial}:${side}:${Math.floor(state.elapsed / 0.14)}`;
      return {
        game: 'pushball', planning: () => planning(side),
        observe: () => {
          if (state.mode !== 'playing' || state.kickoff > 0 || side === 1 && opponent.player.error) return null;
          return { key: key(), context: `Robot pushball. You attack ${side === 1 ? 'bottom' : 'top'} and defend ${side === 1 ? 'top' : 'bottom'}. First to 3 goals. Forecasts assume opponent keeps current velocity; replan when it changes.`,
            question: 'Which ordinary movement helps score or defend?',
            choices: { wait: 'Stop', up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right' },
            inputs: { wait: idleAction(), up: { x: 0, y: -1, dash: false }, down: { x: 0, y: 1, dash: false },
              left: { x: -1, y: 0, dash: false }, right: { x: 1, y: 0, dash: false } } };
        },
        isCurrent: value => value === key(),
        apply: action => {
          if (state.mode !== 'playing' || state.kickoff > 0) return false;
          const next = normalizeAction(action);
          controls[side] = next; until[side] = state.elapsed + CONTROL_LIFETIME;
          if (side === 0 && next.dash && state.robots[0].cooldown === 0) audio.play('boost');
          return true;
        },
        clearInput: () => clearControl(side),
        onPlanSelected: plan => { if (side === 1) selectedPlan = plan.label.split(':')[0]; },
        start: () => { if (state.mode === 'ready') state.mode = 'playing'; loop.start(); },
        pause: () => { if (state.mode === 'playing') state.mode = 'paused'; loop.stop(); },
        resume: () => { if (state.mode === 'paused') state.mode = 'playing'; loop.start(); },
        isFinished: () => state.mode === 'over', isPaused: () => state.mode === 'paused'
      };
    }
    const humanPort = human.connect(port(0));
    const opponent = connectOpponent(port(1));
    async function startMatch() {
      if (loading || disposed) return;
      human.pause(); opponent.player.pause(); input.reset();
      ++version; const ticket = version;
      state = createMatch(); goalSerial = 0; selectedPlan = 'Waiting for kickoff';
      clearControl(0); clearControl(1); loading = true; modelError = '';
      render(); audio.unlock();
      try {
        await prepareTamev();
        if (disposed || ticket !== version) return;
        modelReady = true; loading = false;
        if (document.hidden || !view!.available) { render(); return; }
        human.start(); opponent.player.start(); render();
      } catch (error) {
        if (disposed || ticket !== version) return;
        loading = false; modelReady = false;
        modelError = error instanceof Error ? error.message : 'The local model could not load.';
        render();
      }
    }
    function pauseMatch() {
      if (state.mode !== 'playing') return;
      human.pause(); opponent.player.pause(); input.reset();
      clearControl(0); clearControl(1); render();
    }
    function resumeMatch() {
      if (state.mode !== 'paused' || document.hidden || !view!.available || !modelReady) return;
      input.reset(); human.resume(); opponent.player.resume(); render();
    }
    function togglePause() {
      if (state.mode === 'playing') pauseMatch(); else if (state.mode === 'paused') resumeMatch();
    }
    function update(dt: number) {
      if (state.mode !== 'playing') return;
      humanPort.human(input.read());
      const current = controls.map((control, side) => state.elapsed <= until[side] ? control : idleAction()) as [Action, Action];
      stepMatch(state, current, dt);
      controls[0].dash = false; controls[1].dash = false;
      if (state.goalSerial !== goalSerial) {
        goalSerial = state.goalSerial; clearControl(0); clearControl(1); input.reset();
        audio.play(state.lastScorer === 0 ? 'collect' : 'hit');
        selectedPlan = 'Waiting for kickoff';
      }
      if (state.winner !== null) {
        selectedPlan = 'Match finished';
        matches++; if (state.winner === 0) { wins++; audio.play('win'); }
        store.save('matches', matches); store.save('wins', wins);
        loop.stop(); void opponent.player.tick();
      }
    }
    function setText(element: Element, value: string) { if (element.textContent !== value) element.textContent = value; }
    function render(dt = 0) {
      view!.render(state, dt);
      setText(hud.querySelector('.human-team strong')!, String(state.score[0]));
      setText(hud.querySelector('.ai-team strong')!, String(state.score[1]));
      const kickoffText = state.goalSerial ? state.lastScorer === 0 ? 'You scored!' : 'TAMEV scored!' : 'Get ready';
      setText(banner, state.mode === 'playing' && state.kickoff > 0 ? `${kickoffText} · ${Math.ceil(state.kickoff)}` : '');
      input.updateCooldown(state.robots[0].cooldown, state.mode === 'playing' && state.kickoff === 0);
      pause.disabled = state.mode !== 'playing' && state.mode !== 'paused';
      pause.textContent = state.mode === 'paused' ? 'Resume' : 'Pause';
      overlay.hidden = state.mode === 'playing';
      secondary.hidden = state.mode === 'ready';
      primary.disabled = loading || state.mode === 'paused' && !view!.available;
      if (state.mode === 'ready') {
        heading.textContent = loading ? 'Waking up TAMEV…' : 'Push your luck.';
        copy.textContent = modelError ? `${modelError} No rule opponent is substituted. Retry loading to play.`
          : 'You are blue. Push into the top goal. First to three wins. TAMEV chooses its plans locally, with the same speed and dash cooldown as you.';
        primary.textContent = loading ? 'Loading local model…' : modelError ? 'Retry loading' : 'Start match';
      } else if (state.mode === 'paused') {
        heading.textContent = 'Take a breather.';
        copy.textContent = view!.available ? 'Match paused. Both robots and the AI planner are stopped.' : 'Graphics interrupted. Resume after the scene is restored.';
        primary.textContent = 'Resume match'; secondary.textContent = 'New match';
      } else if (state.mode === 'over') {
        heading.textContent = state.winner === 0 ? 'Goal machine.' : 'Rematch?';
        copy.textContent = `${state.winner === 0 ? 'You beat TAMEV!' : 'TAMEV wins this match.'} ${state.score[0]}–${state.score[1]} · Your record: ${wins} wins / ${matches} matches.`;
        primary.textContent = 'Play again'; secondary.textContent = 'Back to games';
      }
      const diagnostics = getLocalDecisionDiagnostics().lastDecision;
      const detail = diagnostics ? ` · ${Math.round(diagnostics.inferenceMs)} ms inference` : '';
      setText(ai.querySelector('span')!, state.mode === 'playing' && opponent.player.error
        ? `AI error: ${opponent.player.error} Match continues without new AI input.`
        : `${selectedPlan} · ${opponent.player.decisions} inputs${detail}`);
      retry.hidden = !opponent.player.error || state.mode !== 'playing';
    }
    const offOpponent = opponent.player.subscribe(() => { if (!disposed) render(); });
    const visibility = () => { if (document.hidden) pauseMatch(); };
    const blur = () => pauseMatch();
    const lost = () => pauseMatch();
    const restored = () => { if (!disposed) render(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    view.canvas.addEventListener('webglcontextlost', lost);
    view.canvas.addEventListener('webglcontextrestored', restored);
    const unexpose = exposeGame(() => ({ game: 'pushball', mode: state.mode,
      coordinates: 'Field center origin; x right, y down. Blue attacks top; coral attacks bottom.',
      score: state.score, winner: state.winner, kickoff: state.kickoff, elapsed: state.elapsed,
      robots: state.robots, ball: state.ball, record: { wins, matches },
      ai: { provider: 'TAMEV + Planning', status: opponent.player.status, decisions: opponent.player.decisions,
        discarded: opponent.player.discarded, thinking: opponent.player.thinking, error: opponent.player.error,
        plan: selectedPlan, modelReady, loading,
        modelInitializations: getLocalDecisionDiagnostics().info?.initializations ?? 0 }, controls: structuredClone(controls) }), ms => loop.advance(ms));
    render();
    return () => {
      disposed = true; ++version; loop.stop(); offOpponent();
      humanPort.dispose(); opponent.dispose(); input.dispose(); audio.dispose(); unexpose();
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
      view.canvas.removeEventListener('webglcontextlost', lost);
      view.canvas.removeEventListener('webglcontextrestored', restored);
      view.dispose();
    };
  }
};
export default pushball;
