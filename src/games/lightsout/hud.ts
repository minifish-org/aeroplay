import type { GameContext } from '../../core/loop';
import type { LightsModel } from './model';
export function createHUD({hud,player}:GameContext,model:LightsModel) {
  const submit=(input:string)=>{player.submitHumanInput(input);};
  const undo=hud.button('undo','Undo','undo',()=>submit('undo')),hint=hud.button('hint','Hint','hint',()=>submit('hint'));
  const retry=hud.button('restart','Retry','restart',()=>submit('retry')),next=hud.button('next','Next puzzle','next',()=>submit('next'));
  hud.intro('lightsout','Tap a lamp to flip it and its four neighbors. Turn every lamp off. Hint outlines a useful tap; Retry restores this puzzle.');
  return ()=>{const s=model.summary();hud.stats({Puzzle:s.level,Moves:s.moves,Perfect:s.par,Lit:s.lit});
    undo.disabled=!s.undoCount||player.type==='ai';hint.disabled=model.mode!=='playing'||player.type==='ai';retry.disabled=player.type==='ai';next.hidden=model.mode!=='won';next.disabled=player.type==='ai';
    if(model.mode==='won')hud.panel('Lights out',s.stars+' stars · '+s.moves+' moves');
    else if(model.mode==='paused')hud.panel('Paused','',[{label:'Resume',press:()=>player.resume()}]);else hud.panel('');
  };
}
