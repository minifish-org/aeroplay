import type { Stage } from '../../core/stage';
import type { LightsModel } from './model';
const point=(cell:number)=>({x:(cell%5-2)*1.12,y:(2-Math.floor(cell/5))*1.12});
export function createView(stage:Stage,model:LightsModel) {
  stage.board(6.3,6.3,0x263e50);stage.gridBounds(5,5,5.6,5.6);
  const lamps=Array.from({length:25},(_,cell)=>{
    const p=point(cell),base=stage.tile(p.x,p.y,1.03,1.03,0x334c61,.2,cell);
    const glass=stage.shape('sphere',.37,0x385166);glass.position.set(p.x,p.y,.03);glass.scale.z=.55;
    const ring=stage.shape('ring',.22,0x8099ac);ring.position.set(p.x,p.y,.27);
    const stem=stage.box(.055,.18,.03,0x8099ac,.01);stem.position.set(p.x,p.y+.19,.29);stage.content.add(stem);
    return {base,glass,ring,stem};
  });
  let signature='',moves=-1;
  return (dt:number)=>{
    void dt;const next=model.board.join('')+':'+model.hinted+':'+model.epoch;if(signature===next)return;signature=next;
    lamps.forEach(({base,glass,ring,stem},cell)=>{
      const lit=!!model.board[cell],hinted=model.hinted===cell;color(base,hinted?0x96d5b5:0x334c61);
      glass.material=stage.material(lit?0xf2cd83:0x294053,lit?0xdb8e1d:0);const line=stage.material(lit?0xfff1c0:0x708ba1);ring.material=line;stem.material=line;
      if(moves>=0&&model.moves!==moves){glass.scale.set(1.08,1.08,.55);stage.tween(glass,{scale:1},'score');}
    });if(model.hinted>=0){const p=point(model.hinted);stage.effect(p.x,p.y,0x96d5b5);}
    if(moves!==model.moves&&model.mode==='won')stage.effect(0,0,0xf2cd83,'settle');moves=model.moves;
  };
  function color(mesh:typeof lamps[number]['base'],value:number){mesh.material=stage.material(value);}
}
