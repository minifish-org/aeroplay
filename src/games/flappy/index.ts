import type { GameContext } from "../../core/loop";
export default function mount({stage,hud}:GameContext) {
  stage.board(6,6);const tile=stage.tile(0,0,2,2,0x96d5b5);tile.rotation.z=.08;
  const label=stage.label("Flappy Bird",3);label.position.set(0,-2,.3);stage.render();
  hud.notice("Getting ready for your next round.");return ()=>{};
}
