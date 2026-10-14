import type { GameAudio } from '../../core/audio';
import type { HUD } from '../../core/hud';
import { joystick } from '../../core/input';
import { idleAction, type Action, type PushballRun } from './model';
export function pushballHUD(hud:HUD,model:PushballRun,start:()=>void,pause:()=>void,retry:()=>void,audio:GameAudio) {
  let action=idleAction();const held=new Set<string>();
  const bank=hud.bank('arena',150),stick=document.createElement('div');bank.append(stick);const pad=joystick(stick,(x,y)=>{action={...action,x,y};});
  const dash=hud.button('dash','Dash','boost',()=>{action.dash=true;},bank),pauseButton=hud.button('pause','Pause','pause',pause),retryButton=hud.button('retry-ai','Retry AI','restart',retry);const sound=hud.button('sound','Sound','sound',()=>audio.toggle());
  const reset=()=>{held.clear();action=idleAction();pad.reset();};
  const down=(event:KeyboardEvent)=>{if(event.target instanceof HTMLElement&&event.target.closest('button,select,input'))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',' '].includes(event.key)){event.preventDefault();held.add(event.key);if(event.key===' '&&!event.repeat)action.dash=true;}if(event.key.toLowerCase()==='p'&&!event.repeat)pause();};
  const up=(event:KeyboardEvent)=>{held.delete(event.key);};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',reset);
  hud.intro('pushball','You are blue. Push the ball into the top goal. Use the stick or WASD to move; dash with Space. First to three wins against local TAMEV.');
  return {
    read:():Action=>{const x=(Number(held.has('d')||held.has('ArrowRight'))-Number(held.has('a')||held.has('ArrowLeft')))||action.x,y=(Number(held.has('s')||held.has('ArrowDown'))-Number(held.has('w')||held.has('ArrowUp')))||action.y,next={x,y,dash:action.dash};action.dash=false;return next;},reset,
    refresh:(loading:boolean,error:string,opponentError:string)=>{
      const state=model.state;hud.label(sound,audio.enabled?'Sound on':'Sound off');sound.setAttribute('aria-pressed',String(audio.enabled));hud.stats({You:state.score[0],TAMEV:state.score[1],Record:model.wins+'/'+model.matches});pauseButton.disabled=!['playing','paused'].includes(state.mode);hud.label(pauseButton,state.mode==='paused'?'Resume':'Pause');
      dash.disabled=state.mode!=='playing'||state.kickoff>0||state.robots[0].cooldown>0;hud.label(dash,state.robots[0].cooldown>0?state.robots[0].cooldown.toFixed(1)+'s':'Dash');retryButton.hidden=!opponentError||state.mode!=='playing';
      hud.notice(error||opponentError||(state.mode==='playing'&&state.kickoff>0?(state.goalSerial?'Goal!':'Get ready')+' · '+Math.ceil(state.kickoff):''));
      const title=loading?'Loading TAMEV…':state.mode==='ready'?'First to three':state.mode==='paused'?'Match paused':state.mode==='over'?state.winner===0?'You win!':'TAMEV wins':'';
      hud.panel(title,state.mode==='over'?state.score[0]+'–'+state.score[1]+' · '+model.wins+' wins / '+model.matches+' matches':state.mode==='ready'?'Local AI · Equal speed and dash cooldowns.':'',loading||state.mode==='paused'?[]:[{label:state.mode==='over'?'Play again':error?'Retry loading':'Start match',symbol:'play',press:start}]);
    },
    dispose:()=>{reset();pad.dispose();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',reset);}
  };
}
