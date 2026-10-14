import {
  ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, Fog, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry,
  Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer, BufferGeometry, Material
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export type Preset = 'board' | 'island' | 'flight' | 'arena';
export type Easing = 'entry' | 'score' | 'failure' | 'settle';
type Target = { x?: number; y?: number; z?: number; scale?: number };
type Tween = { object: Object3D; from: {x:number;y:number;z:number;scale:number}; target: Target; time: number; easing: Easing };
const durations = { entry: .32, score: .24, failure: .28, settle: .36 };
const ease = (t:number, type:Easing) => type === 'score' ? 1 + 2.1 * (t-1)**3 + 1.1 * (t-1)**2 : type === 'failure' ? t*t : 1-(1-t)**3;
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene(); readonly content = new Group(); readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ortho = new OrthographicCamera(-5,5,5,-5,.1,100);
  private perspective = new PerspectiveCamera(48,1,.1,180);
  private camera: OrthographicCamera | PerspectiveCamera = this.ortho;
  private ray = new Raycaster(); private pointer = new Vector2(); private host: HTMLElement | null = null; private play: HTMLElement | null = null;
  private observer: ResizeObserver; private geometry = new Map<string,BufferGeometry>(); private materials = new Map<string,MeshStandardMaterial>();
  private tweens: Tween[] = []; private particles: { mesh: Mesh; velocity: Vector3; life: number }[] = [];
  private world = {width:8,height:8}; private preset: Preset = 'board'; private frames = 0; private mounts = 0; private lost = false;
  private grid: { cols:number; rows:number; width:number; height:number } | null = null;
  private size={width:0,height:0};
  readonly lights = new Group();
  constructor() {
    this.renderer = new WebGLRenderer({ antialias:true, alpha:false, preserveDrawingBuffer:true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.dataset.renderer = 'three'; this.renderer.domElement.setAttribute('aria-label','Game scene'); this.renderer.domElement.tabIndex=0;
    for(const [color,intensity,x,y,z] of [[0xfff0db,3.1,5,9,12],[0xd0e9ff,1.6,-7,4,8],[0xcdf6eb,2.1,0,-5,6]]) {
      const light = new DirectionalLight(color,intensity); light.position.set(x,y,z);
      if(!this.lights.children.length) { light.castShadow = true; light.shadow.mapSize.set(1024,1024); light.shadow.camera.left=-20; light.shadow.camera.right=20; light.shadow.camera.top=20; light.shadow.camera.bottom=-20; light.shadow.bias=-.0004; light.shadow.normalBias=.04; }
      this.lights.add(light);
    }
    this.scene.add(this.content,this.lights);
    this.observer = new ResizeObserver(() => { this.resize(); this.render(); });
    this.renderer.domElement.addEventListener('webglcontextlost',event => { event.preventDefault(); this.lost=true; this.releaseGPU(); this.host?.dispatchEvent(new Event('stage-lost')); });
    this.renderer.domElement.addEventListener('webglcontextrestored',() => { this.lost=false; this.resize(); this.render(); this.host?.dispatchEvent(new Event('stage-restored')); });
  }
  mount(host:HTMLElement, play:HTMLElement, preset:Preset='board', width=8, height=8, background=0x20374b) {
    this.clear(); this.host=host; this.play=play; this.preset=preset; this.world={width,height}; this.mounts++;
    host.prepend(this.renderer.domElement); this.scene.background=new Color(background); this.scene.fog=preset==='flight' ? new Fog(background,35,120) : null;
    this.camera=preset==='flight' ? this.perspective : this.ortho;
    this.camera.position.set(...(preset==='board' ? [0,0,20] : preset==='island' ? [8,11,10] : preset==='arena' ? [0,18,15] : [0,4.1,9]) as [number,number,number]);
    this.camera.lookAt(preset==='flight' ? new Vector3(0,1,-18) : new Vector3());
    this.observer.observe(host); this.observer.observe(play); this.resize();
  }
  framing(preset:Preset,width:number,height:number) { this.preset=preset; this.world={width,height}; this.resize(); }
  private viewport() {
    const h=this.host?.getBoundingClientRect(),p=this.play?.getBoundingClientRect();
    return h&&p ? {x:p.x-h.x,y:p.y-h.y,width:p.width,height:p.height} : {x:0,y:0,width:1,height:1};
  }
  resize() {
    if(!this.host || !this.play) return;
    const wide=String(innerWidth>innerHeight&&Math.min(innerWidth,innerHeight)<=700);
    if(this.host.dataset.wide!==wide)this.host.dataset.wide=wide;
    const h=this.host.getBoundingClientRect(),p=this.viewport(),aspect=p.width/Math.max(1,p.height);
    if(this.size.width!==h.width||this.size.height!==h.height) {
      this.size={width:h.width,height:h.height};this.renderer.setSize(Math.max(1,h.width),Math.max(1,h.height),false);
    }
    if(this.camera===this.ortho) {
      const height=Math.max(this.world.height,this.world.width/aspect); this.ortho.left=-height*aspect/2; this.ortho.right=height*aspect/2; this.ortho.top=height/2; this.ortho.bottom=-height/2;
    } else this.perspective.aspect=aspect;
    this.camera.updateProjectionMatrix();
  }
  material(color:number|string,emissive=0) {
    const key=String(color)+':'+emissive;
    if(!this.materials.has(key)) this.materials.set(key,new MeshStandardMaterial({color,roughness:.48,metalness:.12,emissive,emissiveIntensity:.35}));
    return this.materials.get(key)!;
  }
  box(width:number,height:number,depth:number,color:number|string,radius=Math.min(width,height,depth)*.22) {
    const key=[width,height,depth,radius].join(':');
    if(!this.geometry.has(key)) this.geometry.set(key,new RoundedBoxGeometry(width,height,depth,3,radius));
    const mesh=new Mesh(this.geometry.get(key)!,this.material(color)); mesh.castShadow=true; mesh.receiveShadow=true; return mesh;
  }
  tile(x:number,y:number,width:number,height:number,color:number|string,depth=.24,input?:unknown) {
    const mesh=this.box(width,height,depth,color,.11*Math.min(width,height)); mesh.position.set(x,y,0);
    if(input!==undefined) mesh.userData.input=input; this.content.add(mesh); return mesh;
  }
  board(width:number,height:number,color:number|string=0x243b50) {
    const mesh=this.box(width,height,.26,color,.18); mesh.position.z=-.32; this.content.add(mesh); return mesh;
  }
  shape(kind:'sphere'|'ring'|'gem',size:number,color:number|string,input?:unknown) {
    const key=kind+':'+size;
    if(!this.geometry.has(key)) this.geometry.set(key,kind==='sphere' ? new SphereGeometry(size,24,16) : kind==='ring' ? new TorusGeometry(size,size*.16,10,32) : new SphereGeometry(size,kind==='gem'?4:12,2));
    const mesh=new Mesh(this.geometry.get(key)!,this.material(color)); mesh.castShadow=true; if(input!==undefined) mesh.userData.input=input; this.content.add(mesh); return mesh;
  }
  label(text:string,width=1,color='#eef5f8',height=width*.42) {
    const mesh=new Mesh(new PlaneGeometry(width,height),new MeshBasicMaterial({transparent:true,depthWrite:false}));
    mesh.userData.label={width,height,color}; this.text(mesh,text); mesh.position.z=.2; this.content.add(mesh); return mesh;
  }
  text(mesh:Mesh,text:string) {
    if(mesh.userData.text===text) return; mesh.userData.text=text;
    const {width,height,color}=mesh.userData.label as {width:number;height:number;color:string};
    const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=Math.max(128,Math.round(512*height/width));
    const ctx=canvas.getContext('2d')!; ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle';
    const lines=text.split('\n'); ctx.font='700 '+Math.min(canvas.height/(lines.length+0.5),512/Math.max(1,...lines.map(line=>line.length)) *1.5)+'px system-ui';
    lines.forEach((line,i)=>ctx.fillText(line,256,canvas.height*(i+.5)/lines.length));
    const material=mesh.material as MeshBasicMaterial; material.map?.dispose(); material.map=new CanvasTexture(canvas); material.map.colorSpace=SRGBColorSpace; material.needsUpdate=true;
  }
  gridBounds(cols:number,rows:number,width:number,height:number) { this.grid={cols,rows,width,height}; }
  project(x:number,y:number,z=0) {
    const p=new Vector3(x,y,z).project(this.camera),r=this.play!.getBoundingClientRect(); return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};
  }
  pick(x:number,y:number) {
    const r=this.play!.getBoundingClientRect(); if(x<r.left||x>r.right||y<r.top||y>r.bottom) return undefined;
    this.pointer.set((x-r.x)/r.width*2-1,1-(y-r.y)/r.height*2); this.ray.setFromCamera(this.pointer,this.camera);
    for(const hit of this.ray.intersectObjects(this.content.children,true)) if(hit.object.userData.input!==undefined) return hit.object.userData.input;
    return undefined;
  }
  tween(object:Object3D,target:Target,easing:Easing='settle') {
    this.tweens=this.tweens.filter(tween=>tween.object!==object);
    const tween={object,from:{x:object.position.x,y:object.position.y,z:object.position.z,scale:object.scale.x},target,time:0,easing};
    if(this.reducedMotion) this.applyTween(tween,1); else this.tweens.push(tween);
  }
  private applyTween(tween:Tween,t:number) {
    const value=ease(t,tween.easing),{object,from,target}=tween;
    for(const axis of ['x','y','z'] as const) if(target[axis]!==undefined) object.position[axis]=from[axis]+(target[axis]!-from[axis])*value;
    if(target.scale!==undefined) object.scale.setScalar(from.scale+(target.scale-from.scale)*value);
  }
  effect(x:number,y:number,color:number|string,type:Easing='score') {
    if(this.reducedMotion) return;
    for(let i=0;i<8&&this.particles.length<48;i++) {
      const mesh=this.shape('sphere',.055,color); mesh.position.set(x,y,.45);
      const a=i*Math.PI/4; this.particles.push({mesh,velocity:new Vector3(Math.cos(a)*2,Math.sin(a)*2,0),life:durations[type]});
    }
  }
  advance(dt:number) {
    this.tweens=this.tweens.filter(tween=>{tween.time+=dt;const t=Math.min(1,tween.time/durations[tween.easing]);this.applyTween(tween,t);return t<1;});
    this.particles=this.particles.filter(p=>{p.life-=dt;if(p.life<=0){p.mesh.removeFromParent();return false;}p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.scale.setScalar(p.life/.24);return true;});
  }
  get animating() { return this.tweens.length>0||this.particles.length>0; }
  get available() { return !this.lost; }
  render() {
    if(!this.host||this.lost) return; this.resize(); const p=this.viewport(),h=this.host.getBoundingClientRect();
    this.renderer.setScissorTest(false); this.renderer.setViewport(0,0,h.width,h.height); this.renderer.clear();
    this.renderer.setViewport(p.x,h.height-p.y-p.height,p.width,p.height); this.renderer.setScissor(p.x,h.height-p.y-p.height,p.width,p.height); this.renderer.setScissorTest(true);
    this.renderer.render(this.scene,this.camera); this.renderer.setScissorTest(false); this.renderer.domElement.dataset.ready='true'; this.frames++;
  }
  inspect() {
    const r=this.play?.getBoundingClientRect(); const bounds=r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;
    const picks:{input:unknown;x:number;y:number}[]=[];
    this.content.traverse(object=>{if(object.userData.input!==undefined){const world=object.getWorldPosition(new Vector3());picks.push({input:object.userData.input,...this.project(world.x,world.y,world.z)});}});
    const grid=this.grid; let boardBounds=null;
    if(grid&&this.preset==='board') {const a=this.project(-grid.width/2,grid.height/2),b=this.project(grid.width/2,-grid.height/2);boardBounds={x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y,cols:grid.cols,rows:grid.rows};}
    return {playBounds:bounds,boardBounds,picks,renderer:{mounts:this.mounts,frames:this.frames,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,drawCalls:this.renderer.info.render.calls,contexts:1,pixelRatio:this.renderer.getPixelRatio()},motion:{reduced:this.reducedMotion,tweens:this.tweens.length,particles:this.particles.length,maxParticles:48}};
  }
  private releaseGPU() {
    // Release old context listeners before restoration; retain CPU shapes for upload.
    const geometries=new Set<BufferGeometry>(this.geometry.values()),materials=new Set<Material>(this.materials.values());
    this.content.traverse(object=>{if(object instanceof Mesh){geometries.add(object.geometry);const list=Array.isArray(object.material)?object.material:[object.material];list.forEach(material=>materials.add(material));}});
    geometries.forEach(geometry=>geometry.dispose()); materials.forEach(material=>{const textured=material as MeshBasicMaterial; textured.map?.dispose(); material.dispose();});
    this.lights.children.forEach(light=>{if(light instanceof DirectionalLight)light.shadow.map?.dispose();});
  }
  clear() {
    this.observer?.disconnect(); this.releaseGPU();
    this.content.clear(); this.geometry.clear(); this.materials.clear(); this.tweens=[];this.particles=[];this.grid=null;this.host=null;this.play=null;
  }
}
let shared:Stage|null=null;
export const getStage = () => shared ??= new Stage();
