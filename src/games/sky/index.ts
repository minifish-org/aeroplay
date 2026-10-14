import { mountRun, type GameContext } from '../../core/loop';
import { GameAudio } from '../../core/audio';
import { SkyRun } from './model';
import { SkyView } from './view';
import { skyHUD } from './hud';
export default function mount(context:GameContext) {
  const {stage,hud,store}=context;stage.mount(hud.element,hud.playArea,'flight',12,10,0x203d51);
  const model=new SkyRun(store.load('best',0)),view=new SkyView(stage),audio=new GameAudio();const refresh=skyHUD(context,model,audio);let savedBest=model.best,lastBoost=false;
  return mountRun(context,{model,continuous:true,start:()=>model.start(),render:dt=>{view.render(model,dt);if(model.state.boost>0&&!lastBoost)audio.play('boost');lastBoost=model.state.boost>0;for(const event of model.events.splice(0))audio.play(event);if(model.best!==savedBest){savedBest=model.best;store.save('best',savedBest);}},refresh,
    keys:key=>({ArrowLeft:'left',ArrowRight:'right',ArrowUp:'boost',' ':'boost',a:'left',d:'right',p:'pause',Enter:model.mode==='ready'?'start':model.mode==='won'?'next':model.mode==='over'?'restart':undefined} as Record<string,string|undefined>)[key],
    swipe:true,pick:()=>model.mode==='ready'?'start':undefined,persist:()=>{audio.unlock();store.save('best',model.best);},dispose:()=>audio.dispose()});
}
