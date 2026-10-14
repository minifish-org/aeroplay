import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { getHint, planningSignature } from '../../ai/player';
import { CargoRun, type CargoSave, type CargoDirection } from './model';
import { CargoView } from './view';
import { cargoHUD } from './hud';
export default function mount(context:GameContext) {
  const {stage,hud,store,player}=context;stage.mount(hud.element,hud.playArea,'island',11,10,0x233f4b);
  const model=new CargoRun(store.load<CargoSave|null>('run',null),store.load('stars',{}));const view=new CargoView(stage),audio=new GameAudio();
  let thinking=false,message='',job:AbortController|null=null,lastKey='',lastMoves=model.moves,lastPushes=model.pushes;
  const refresh=cargoHUD(context,model,()=>{if(thinking||player.type!=='human')return;const state=model.planning();if(!state)return;
    job?.abort();job=new AbortController();const ticket=job,key=planningSignature(state);thinking=true;message='';model.usedHint=true;persist();
    void getHint(state,ticket.signal).then(plan=>{if(ticket.signal.aborted||key!==planningSignature(model.planning()??state))return;model.hintDirection=plan?.steps[0]?.input as CargoDirection??null;message=plan?'':'No delivery route found · Undo or restart.';})
      .catch(error=>{if(!ticket.signal.aborted)message=error instanceof Error?error.message:'Hint unavailable.';})
      .finally(()=>{if(job===ticket){thinking=false;refresh(thinking,message);hud.onChange();}});
  },audio);
  function persist(){store.save('run',model.save());store.save('stars',model.stars);}
  return mountRun(context,{model,render:()=>{const key=model.planning()?planningSignature(model.planning()!):model.mode;if(lastKey&&lastKey!==key&&thinking){job?.abort();thinking=false;message='';}lastKey=key;if(model.moves!==lastMoves){audio.unlock();audio.play(model.mode==='won'?'win':model.pushes>lastPushes?'collect':'move');lastMoves=model.moves;lastPushes=model.pushes;}view.render(model);},refresh:()=>refresh(thinking,message),persist,swipe:true,
    keys:key=>({ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',w:'up',d:'right',s:'down',a:'left',z:'undo'} as Record<string,string>)[key],dispose:()=>{job?.abort();audio.dispose();}});
}
