import type { GameContext } from '../../core/loop';
import type { MergeModel } from './model';
export function createHUD({hud,player}:GameContext,model:MergeModel) {
  const submit=(input:string)=>{player.submitHumanInput(input);};
  const restart=hud.button('restart','Restart','restart',()=>submit('restart'));
  const undo=hud.button('undo','Undo','undo',()=>submit('undo'));
  hud.intro('2048','Swipe to merge matching tiles. On Mac, use arrow keys. Undo restores your last move; reaching 2048 keeps the game going.');
  return ()=>{const s=model.summary();hud.stats({Score:s.score,Best:s.best,Moves:s.moves,Next:s.milestone});
    undo.disabled=!s.undoCount||player.type==='ai';restart.disabled=player.type==='ai';
    if(model.mode==='over')hud.panel('No moves left',String(model.score)+' points');
    else if(model.mode==='paused')hud.panel('Paused','',[{label:'Resume',press:()=>player.resume()}]);else hud.panel('');
  };
}
