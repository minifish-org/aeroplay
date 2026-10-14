import { games } from './games/registry';
import { mountHub } from './hub/hub';
import { getStage } from './core/stage';
import { HUD } from './core/hud';
import { Player, HumanPlayer, TamevPlayer } from './ai/player';
import { namespace, save, setPlayProfile, type PlayProfile } from './core/storage';
import '../styles/tokens.css';
import '../styles/hub.css';
import '../styles/game.css';
const root=document.querySelector<HTMLElement>('#app')!;
let dispose=()=>{},version=0;
async function route(profile:PlayProfile='human') {
  const ticket=++version;dispose();dispose=()=>{};
  const entry=games.find(game=>game.id===location.hash.slice(1));
  if(!entry){setPlayProfile('human');dispose=mountHub(root);return;}
  if(entry.id==='pushball')profile='human';
  const claim=setPlayProfile(profile);const player=new Player(profile==='ai'?new TamevPlayer():new HumanPlayer(),claim);
  const hud=new HUD(root,entry.name,()=>{location.hash='hub';});hud.element.style.setProperty('--accent',entry.accent);
  try {
    const stage=getStage();stage.mount(hud.element,hud.playArea);hud.notice('Opening game…');
    const module=await entry.load();if(ticket!==version){player.dispose();return;}
    hud.notice('');save('last-game',entry.id);document.title=entry.name+' · AeroPlay';
    const teardown=module.default({entry,stage,hud,store:namespace(entry.id==='2048'?'game2048':entry.id),player,
      returnPersonal:()=>{void route('human');},watchAgain:()=>{void route('ai');}});
    dispose=()=>{teardown();player.dispose();stage.clear();};if(profile==='ai')player.start();
  }catch(error){player.dispose();hud.panel('Could not open game','Please try again.',[{label:'Back',symbol:'back',press:()=>{location.hash='hub';}}]);console.error(error);}
}
if(import.meta.env.PROD&&'serviceWorker'in navigator)window.addEventListener('load',()=>{void navigator.serviceWorker.register('/service-worker.js').catch(error=>console.warn(error));});
window.addEventListener('hashchange',()=>{void route();});
window.addEventListener('keydown',event=>{if(event.key.toLowerCase()!=='f'||event.repeat||event.target instanceof HTMLElement&&event.target.closest('button,select,input'))return;if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen?.();});
void route();
