import { Group } from 'three';
import type { Stage } from '../../core/stage';
import type { MergeModel } from './model';
const colors=[0x96d5b5,0x8ed3ea,0xf2cd83,0xf2aa8b,0xa6bde8,0xcbb0ee];
const point=(cell:number)=>({x:(cell%4-1.5)*1.5,y:(1.5-Math.floor(cell/4))*1.5});
export function createView(stage:Stage,model:MergeModel) {
  stage.board(6.4,6.4,0x2a4355);stage.gridBounds(4,4,6,6);
  const tiles=Array.from({length:16},(_,cell)=>{
    const p=point(cell),well=stage.tile(p.x,p.y,1.39,1.39,0x1b3042,.12);well.position.z=-.15;
    const group=new Group(),body=stage.box(1.36,1.36,.26,colors[0],.1);group.add(body);
    const label=stage.label('',1.08,'#163344',.62);label.position.z=.17;group.add(label);stage.content.add(group);group.position.set(p.x,p.y,.02);
    return {group,body,label};
  });
  let signature='',epoch=-1;
  return (dt:number)=>{
    void dt;const next=model.grid.flat().join(',')+':'+model.moves+':'+model.epoch;if(next===signature)return;signature=next;
    tiles.forEach(({group,body,label},cell)=>{
      const value=model.grid[Math.floor(cell/4)][cell%4],p=point(cell);group.visible=!!value;if(!value)return;
      const color=colors[(Math.log2(value)-1)%colors.length];body.material=stage.material(color);stage.text(label,String(value));
      const change=epoch===model.epoch?model.changes.find(change=>change.target===cell):undefined;
      const from=change?point(change.sources[0]):p;group.position.set(from.x,from.y,.02);
      group.scale.setScalar(change?.merged?1.15:cell===model.spawned?.01:1);
      stage.tween(group,{x:p.x,y:p.y,scale:1},change?.merged?'score':change?'settle':'entry');
      if(change?.merged)stage.effect(p.x,p.y,color,'score');
    });epoch=model.epoch;
  };
}
