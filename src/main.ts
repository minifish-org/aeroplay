import { games } from './games/registry';
import { mountHub } from './hub/hub';
import '../styles/tokens.css';
import '../styles/hub.css';
import '../styles/game.css';
const root = document.querySelector<HTMLElement>('#app')!;
let dispose = () => {}; let version = 0;
async function route() {
  const ticket = ++version; dispose(); dispose = () => {};
  const entry = games.find(game => game.id === location.hash.slice(1));
  if(!entry) { mountHub(root); return; }
  const game = await entry.load(); if(ticket !== version) return;
  dispose = game.default(root, () => { location.hash = 'hub'; });
}
if(import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('/service-worker.js'); });
window.addEventListener('hashchange', () => { void route(); });
void route();
