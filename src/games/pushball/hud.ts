import type { GameAudio } from '../../core/audio';
import type { HUD } from '../../core/hud';
import { joystick } from '../../core/input';
import { DASH_COOLDOWN, idleAction, normalizeAction, type Action, type PushballRun } from './model';
export function pushballHUD(hud:HUD,model:PushballRun,start:()=>void,pause:()=>void,retry:()=>void,audio:GameAudio,available=()=>true) {
  let action=idleAction(),lastDirection={x:0,y:-1};const held=new Set<string>();
  const bank=hud.bank('arena',150),stick=document.createElement('div');bank.append(stick);const pad=joystick(stick,(x,y)=>{action={...action,x,y};});
  const dash=hud.button('dash','Dash','boost',()=>{action.dash=true;},bank),pauseButton=hud.button('pause','Pause','pause',pause),retryButton=hud.button('retry-ai','Retry AI','restart',retry);const sound=hud.button('sound','Sound','sound',()=>audio.toggle());
  const charge=document.createElement('progress');charge.max=1;charge.setAttribute('aria-label','Dash charge');charge.style.cssText='width:28px;height:5px';dash.append(charge);
  const reset=()=>{held.clear();action=idleAction();pad.reset();};
  const down=(event:KeyboardEvent)=>{if(event.metaKey||event.ctrlKey||event.altKey||event.target instanceof HTMLElement&&event.target.closest('button,select,input'))return;const key=event.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)){event.preventDefault();held.add(key);}if(key===' '){event.preventDefault();if(!event.repeat)action.dash=true;}if((key==='p'||key==='escape')&&!event.repeat){event.preventDefault();pause();}};
  const up=(event:KeyboardEvent)=>{held.delete(event.key.toLowerCase());};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',reset);
  hud.intro('pushball','You are blue. Push the ball into the top goal. Use the stick or WASD to move; dash with Space. First to three wins against local TAMEV.');
  return {
    read:():Action=>{const keyboard=held.size>0,x=keyboard?Number(held.has('d')||held.has('arrowright'))-Number(held.has('a')||held.has('arrowleft')):action.x,y=keyboard?Number(held.has('s')||held.has('arrowdown'))-Number(held.has('w')||held.has('arrowup')):action.y,next=normalizeAction({x,y,dash:action.dash});if(Math.hypot(next.x,next.y)>.05)lastDirection={x:next.x,y:next.y};else if(next.dash){next.x=lastDirection.x;next.y=lastDirection.y;}action.dash=false;return next;},reset,
    refresh:(loading:boolean,error:string,opponentError:string)=>{
      const state=model.state,graphics=available();hud.label(sound,audio.enabled?'Sound on':'Sound off');sound.setAttribute('aria-pressed',String(audio.enabled));hud.stats({You:state.score[0],TAMEV:state.score[1],Record:model.wins+'/'+model.matches});pauseButton.disabled=!graphics||!['playing','paused'].includes(state.mode);hud.label(pauseButton,state.mode==='paused'?'Resume':'Pause');
      charge.value=Math.max(0,1-state.robots[0].cooldown/DASH_COOLDOWN);charge.setAttribute('aria-valuetext',state.robots[0].cooldown>0?state.robots[0].cooldown.toFixed(1)+' seconds to recharge':'Ready');dash.disabled=!graphics||state.mode!=='playing'||state.kickoff>0||state.robots[0].cooldown>0;hud.label(dash,state.robots[0].cooldown>0?state.robots[0].cooldown.toFixed(1)+'s':'Dash');retryButton.hidden=!opponentError||state.mode!=='playing';
      hud.notice(error||opponentError||(state.mode==='playing'&&state.kickoff>0?(state.goalSerial?'Goal!':'Get ready')+' · '+Math.ceil(state.kickoff):''));
      const title=loading?'Loading TAMEV…':state.mode==='ready'?'First to three':state.mode==='paused'?'Match paused':state.mode==='over'?state.winner===0?'You win!':'TAMEV wins':'';
      hud.panel(title,state.mode==='over'?state.score[0]+'–'+state.score[1]+' · '+model.wins+' wins / '+model.matches+' matches':state.mode==='ready'?'Local AI · Equal speed and dash cooldowns.':'',loading?[]:state.mode==='paused'?[{label:'New match',symbol:'restart',press:start}]:[{label:state.mode==='over'?'Play again':error?'Retry loading':'Start match',symbol:'play',press:start}]);
      if(!hud.helpOpen)hud.element.querySelectorAll<HTMLButtonElement>('.hud-panel button').forEach(button=>{button.disabled=loading||!graphics;});
    },
    dispose:()=>{reset();pad.dispose();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',reset);}
  };
}
