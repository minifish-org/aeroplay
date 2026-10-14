import { games } from '../games/registry';
import { load, namespace } from '../core/storage';
export function mountHub(root:HTMLElement) {
  root.innerHTML='<main class="hub"><header><h1>aero<span>play</span></h1><span class="offline-state" role="status"></span></header><div class="hub-grid"></div></main>';
  document.title='AeroPlay';const grid=root.querySelector<HTMLElement>('.hub-grid')!,last=load('last-game','2048');
  function layout(){const phone=Math.min(innerWidth,innerHeight)<=700,columns=phone&&innerHeight>innerWidth?2:4;grid.style.setProperty('--columns',String(columns));grid.style.setProperty('--rows',String(8/columns));}
  layout();window.addEventListener('resize',layout);
  function record(id:string){const store=namespace(id==='2048'?'game2048':id);
    if(id==='cargo')return Object.keys(store.load<Record<string,number>>('stars',{})).length+'/12 delivered';
    if(id==='pushball')return store.load('wins',0)+' wins';
    if(id==='lightsout')return 'Puzzle '+store.load('state-v2',{level:1}).level;
    if(id==='sudoku'){const best=store.load<number|null>('bestSeconds',null);return best===null?'No record yet':Math.floor(best/60)+':'+String(Math.floor(best%60)).padStart(2,'0')+' best';}
    const best=store.load<number>('best',0);return best?'Best '+best.toLocaleString():'No record yet';
  }
  for(const entry of games){const card=document.createElement('button');card.className='hub-card';card.dataset.game=entry.id;card.style.setProperty('--accent',entry.accent);
    const image=document.createElement('img');image.src='/assets/previews/'+entry.id+(entry.id==='pushball'?'.svg':'.jpg');image.alt='';image.className='card-preview';
    const title=document.createElement('strong');title.textContent=entry.name;const value=document.createElement('span');value.textContent=record(entry.id);
    card.append(image,title,value);if(entry.id===last)card.dataset.last='true';card.addEventListener('click',()=>{location.hash=entry.id;});grid.append(card);
  }
  if(import.meta.env.PROD&&'serviceWorker'in navigator)void navigator.serviceWorker.ready.then(()=>{const state=root.querySelector('.offline-state');if(state)state.textContent='Offline ready';});
  return ()=>{window.removeEventListener('resize',layout);};
}
