import { ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight, Fog, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer, BufferGeometry, Material } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paperTexture } from './print';
export type Preset = 'board' | 'island' | 'flight' | 'arena';
export type Easing = 'entry' | 'score' | 'failure' | 'settle';
type Target = {
  x?: number;
  y?: number;
  z?: number;
  scale?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
};
type Tween = {
  object: Object3D;
  from: Target;
  target: Target;
  time: number;
  easing: Easing;
};
const durations = { entry: .32, score: .24, failure: .28, settle: .36 };
const ease = (t: number, type: Easing) => type === 'score' ? 1 + 2.1 * (t - 1) ** 3 + 1.1 * (t - 1) ** 2 : type === 'failure' ? t * t : 1 - (1 - t) ** 3;
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly content = new Group();
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ortho = new OrthographicCamera(-5, 5, 5, -5, .1, 100);
  private perspective = new PerspectiveCamera(48, 1, .1, 180);
  private camera: OrthographicCamera | PerspectiveCamera = this.ortho;
  private ray = new Raycaster();
  private pointer = new Vector2();
  private host: HTMLElement | null = null;
  private play: HTMLElement | null = null;
  private observer: ResizeObserver;
  private geometry = new Map<string, BufferGeometry>();
  private materials = new Map<string, MeshStandardMaterial>();
  private paper: CanvasTexture | null = null;
  private tweens: Tween[] = [];
  private particles: {
    mesh: Mesh;
    velocity: Vector3;
    life: number;
  }[] = [];
  private world = { width: 8, height: 8 };
  private anchor?: { x: number; screen: number };
  private horizontal = false;
  private preset: Preset = 'board';
  private frames = 0;
  private mounts = 0;
  private lost = false;
  private grid: {
    cols: number;
    rows: number;
    width: number;
    height: number;
  } | null = null;
  private size = { width: 0, height: 0 };
  readonly lights = new Group();
  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .94;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.domElement.dataset.renderer = 'three';
    this.renderer.domElement.setAttribute('aria-label', 'Game scene');
    this.renderer.domElement.tabIndex = 0;
    for (const [color, intensity, x, y, z] of [[0xfff5e2, 2.8, -6, 9, 12], [0xdce8ff, .7, 7, 4, 8], [0xffe7c6, .6, 0, -5, 6]]) {
      const light = new DirectionalLight(color, intensity);
      light.position.set(x, y, z);
      if (!this.lights.children.length) {
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.camera.left = -20;
        light.shadow.camera.right = 20;
        light.shadow.camera.top = 20;
        light.shadow.camera.bottom = -20;
        light.shadow.bias = -.00015;
        light.shadow.normalBias = .02;
      }
      this.lights.add(light);
    }
    this.scene.add(this.content, this.lights);
    this.observer = new ResizeObserver(() => { this.resize(); this.render(); });
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; this.releaseGPU(); this.host?.dispatchEvent(new Event('stage-lost')); });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.lost = false; this.resize(); this.render(); this.host?.dispatchEvent(new Event('stage-restored')); });
  }
  mount(host: HTMLElement, play: HTMLElement, preset: Preset = 'board', width = 8, height = 8, background = 0x20374b) {
    this.clear();
    this.host = host;
    this.play = play;
    this.preset = preset;
    this.host.dataset.preset = preset;
    this.world = { width, height };
    this.anchor = undefined;
    this.mounts++;
    host.prepend(this.renderer.domElement);
    this.scene.background = new Color(background);
    this.scene.fog = preset === 'flight' ? new Fog(background, 35, 120) : null;
    this.camera = preset === 'flight' ? this.perspective : this.ortho;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(...(preset === 'board' ? [0, 0, 20] : preset === 'island' ? [0, 18, 8] : preset === 'arena' ? [0, 30, 7] : [0, 4.1, 9]) as [
      number,
      number,
      number
    ]);
    this.camera.lookAt(preset === 'flight' ? new Vector3(0, 1, -18) : new Vector3());
    this.observer.observe(host);
    this.observer.observe(play);
    this.resize();
  }
  framing(preset: Preset, width: number, height: number, anchor?: { x: number; screen: number }) {
    this.preset = preset;
    this.world = { width, height };
    this.anchor = anchor;
    const key = this.lights.children[0] as DirectionalLight;
    const span = preset === 'flight' ? 20 : Math.max(width, height) * .72 + 1.5;
    Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
    key.shadow.camera.updateProjectionMatrix();
    this.resize();
  }
  bounds() {
    const { left, right, top, bottom } = this.ortho, x = this.ortho.position.x;
    return { left: left + x, right: right + x, top, bottom, width: right - left, height: top - bottom };
  }
  groundDirection(x: number, y: number) { return this.preset === 'arena' && this.horizontal ? { x: y, y: -x } : { x, y }; }
  private viewport() {
    const h = this.host?.getBoundingClientRect(), p = this.play?.getBoundingClientRect();
    return h && p ? { x: p.x - h.x, y: p.y - h.y, width: p.width, height: p.height } : { x: 0, y: 0, width: 1, height: 1 };
  }
  resize() {
    if (!this.host || !this.play)
      return;
    const wide = String(innerWidth > innerHeight && Math.min(innerWidth, innerHeight) <= 700);
    if (this.host.dataset.wide !== wide)
      this.host.dataset.wide = wide;
    const h = this.host.getBoundingClientRect(), p = this.viewport(), aspect = p.width / Math.max(1, p.height);
    this.horizontal = aspect > 1;
    this.host.dataset.horizontal = String(this.horizontal);
    if (this.size.width !== h.width || this.size.height !== h.height) {
      this.size = { width: h.width, height: h.height };
      this.renderer.setSize(Math.max(1, h.width), Math.max(1, h.height), false);
    }
    if (this.camera === this.ortho) {
      const arenaHorizontal = this.preset === 'arena' && this.horizontal;
      const width = arenaHorizontal ? this.world.height : this.world.width;
      const height = Math.max(arenaHorizontal ? this.world.width : this.world.height, width / aspect);
      this.ortho.left = -height * aspect / 2;
      this.ortho.right = height * aspect / 2;
      this.ortho.top = height / 2;
      this.ortho.bottom = -height / 2;
      if (this.preset === 'board')
        this.ortho.position.x = this.anchor ? this.anchor.x + (.5 - this.anchor.screen) * height * aspect : 0;
      if (this.preset === 'arena') {
        this.ortho.up.set(arenaHorizontal ? -1 : 0, arenaHorizontal ? 0 : 1, 0);
        this.ortho.lookAt(0, 0, 0);
      }
    }
    else {
      this.perspective.aspect = aspect;
      this.perspective.fov = aspect < 1 ? 58 : 48;
      const distance = Math.max(9, this.world.width / (2 * Math.tan(this.perspective.fov * Math.PI / 360) * aspect) + 2);
      this.perspective.position.set(0, 4.1 + (distance - 9) * .65, distance);
      this.perspective.lookAt(0, 1, -18);
    }
    this.camera.updateProjectionMatrix();
  }
  material(color: number | string, emissive = 0) {
    const key = String(color) + ':' + emissive;
    if (!this.materials.has(key))
      this.materials.set(key, new MeshStandardMaterial({ color, map: this.paper ??= paperTexture(), roughness: .96, metalness: 0, emissive, emissiveIntensity: .55 }));
    return this.materials.get(key)!;
  }
  box(width: number, height: number, depth: number, color: number | string, radius = Math.min(width, height, depth) * .04) {
    const key = [width, height, depth, radius].join(':');
    if (!this.geometry.has(key))
      this.geometry.set(key, new RoundedBoxGeometry(width, height, depth, 3, radius));
    const mesh = new Mesh(this.geometry.get(key)!, this.material(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  tile(x: number, y: number, width: number, height: number, color: number | string, depth = .24, input?: unknown) {
    const mesh = this.box(width, height, depth, color, .025 * Math.min(width, height));
    mesh.position.set(x, y, 0);
    if (input !== undefined)
      mesh.userData.input = input;
    this.content.add(mesh);
    return mesh;
  }
  board(width: number, height: number, color: number | string = 0x243b50) {
    const mesh = this.box(width, height, .26, color, .035);
    mesh.position.z = -.32;
    this.content.add(mesh);
    return mesh;
  }
  shape(kind: 'sphere' | 'ring' | 'gem', size: number, color: number | string, input?: unknown) {
    const key = kind + ':' + size;
    if (!this.geometry.has(key))
      this.geometry.set(key, kind === 'sphere' ? new SphereGeometry(size, 24, 16) : kind === 'ring' ? new TorusGeometry(size, size * .16, 10, 32) : new SphereGeometry(size, kind === 'gem' ? 4 : 12, 2));
    const mesh = new Mesh(this.geometry.get(key)!, this.material(color));
    mesh.castShadow = true;
    if (input !== undefined)
      mesh.userData.input = input;
    this.content.add(mesh);
    return mesh;
  }
  label(text: string, width = 1, color = '#eef5f8', height = width * .42) {
    const mesh = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ transparent: true, depthWrite: false }));
    mesh.userData.label = { width, height, color };
    this.text(mesh, text);
    mesh.position.z = .2;
    this.content.add(mesh);
    return mesh;
  }
  text(mesh: Mesh, text: string) {
    if (mesh.userData.text === text)
      return;
    mesh.userData.text = text;
    const { width, height, color } = mesh.userData.label as {
      width: number;
      height: number;
      color: string;
    };
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.max(128, Math.round(512 * height / width));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = text.split('\n');
    ctx.font = '700 ' + Math.min(canvas.height / (lines.length + 0.5), 512 / Math.max(1, ...lines.map(line => line.length)) * 1.5) + 'px system-ui';
    lines.forEach((line, i) => ctx.fillText(line, 256, canvas.height * (i + .5) / lines.length));
    const material = mesh.material as MeshBasicMaterial;
    material.map?.dispose();
    material.map = new CanvasTexture(canvas);
    material.map.colorSpace = SRGBColorSpace;
    material.needsUpdate = true;
  }
  gridBounds(cols: number, rows: number, width: number, height: number) { this.grid = { cols, rows, width, height }; }
  project(x: number, y: number, z = 0) {
    const p = new Vector3(x, y, z).project(this.camera), r = this.play!.getBoundingClientRect();
    return { x: r.x + (p.x + 1) * r.width / 2, y: r.y + (1 - p.y) * r.height / 2 };
  }
  pick(x: number, y: number) {
    const r = this.play!.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom)
      return undefined;
    this.pointer.set((x - r.x) / r.width * 2 - 1, 1 - (y - r.y) / r.height * 2);
    this.ray.setFromCamera(this.pointer, this.camera);
    for (const hit of this.ray.intersectObjects(this.content.children, true))
      if (hit.object.userData.input !== undefined)
        return hit.object.userData.input;
    return undefined;
  }
  tween(object: Object3D, target: Target, easing: Easing = 'settle') {
    const { scale, ...channels } = target;
    const resolved: Target = scale === undefined ? channels : { sx: scale, sy: scale, sz: scale, ...channels };
    const keys = Object.keys(resolved) as (keyof Target)[];
    for (const tween of this.tweens) if (tween.object === object) for (const key of keys) {
      delete tween.target[key];
      delete tween.from[key];
    }
    this.tweens = this.tweens.filter(tween => Object.keys(tween.target).length > 0);
    const from: Target = {};
    for (const key of keys) from[key] = key === 'scale' ? object.scale.x : key[0] === 'r' ? object.rotation[key[1] as 'x' | 'y' | 'z'] : key[0] === 's' ? object.scale[key[1] as 'x' | 'y' | 'z'] : object.position[key as 'x' | 'y' | 'z'];
    const tween = { object, from, target: resolved, time: 0, easing };
    if (this.reducedMotion)
      this.applyTween(tween, 1);
    else
      this.tweens.push(tween);
  }
  private applyTween(tween: Tween, t: number) {
    const value = ease(t, tween.easing), { object, from, target } = tween;
    for (const key of Object.keys(target) as (keyof Target)[]) {
      const next = from[key]! + (target[key]! - from[key]!) * value;
      if (key === 'scale') object.scale.setScalar(next);
      else if (key[0] === 'r') object.rotation[key[1] as 'x' | 'y' | 'z'] = next;
      else if (key[0] === 's') object.scale[key[1] as 'x' | 'y' | 'z'] = next;
      else object.position[key as 'x' | 'y' | 'z'] = next;
    }
  }
  effect(x: number, y: number, color: number | string, type: Easing = 'score') {
    if (this.reducedMotion)
      return;
    for (let i = 0; i < 8 && this.particles.length < 48; i++) {
      const mesh = this.shape('sphere', .055, color);
      mesh.position.set(x, y, .45);
      const a = i * Math.PI / 4;
      this.particles.push({ mesh, velocity: new Vector3(Math.cos(a) * 2, Math.sin(a) * 2, 0), life: durations[type] });
    }
  }
  advance(dt: number) {
    this.tweens = this.tweens.filter(tween => { tween.time += dt; const t = Math.min(1, tween.time / durations[tween.easing]); this.applyTween(tween, t); return t < 1; });
    this.particles = this.particles.filter(p => { p.life -= dt; if (p.life <= 0) {
      p.mesh.removeFromParent();
      return false;
    } p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.scale.setScalar(p.life / .24); return true; });
  }
  get animating() { return this.tweens.length > 0 || this.particles.length > 0; }
  get available() { return !this.lost; }
  render() {
    if (!this.host || this.lost)
      return;
    this.resize();
    const p = this.viewport(), h = this.host.getBoundingClientRect();
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, h.width, h.height);
    this.renderer.clear();
    this.renderer.setViewport(p.x, h.height - p.y - p.height, p.width, p.height);
    this.renderer.setScissor(p.x, h.height - p.y - p.height, p.width, p.height);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setScissorTest(false);
    this.renderer.domElement.dataset.ready = 'true';
    this.frames++;
  }
  inspect() {
    const r = this.play?.getBoundingClientRect();
    const bounds = r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    const picks: {
      input: unknown;
      x: number;
      y: number;
    }[] = [];
    this.content.traverse(object => { if (object.userData.input !== undefined) {
      const world = object.getWorldPosition(new Vector3());
      picks.push({ input: object.userData.input, ...this.project(world.x, world.y, world.z) });
    } });
    const grid = this.grid;
    let boardBounds = null;
    if (grid && this.preset === 'board') {
      const a = this.project(-grid.width / 2, grid.height / 2), b = this.project(grid.width / 2, -grid.height / 2);
      boardBounds = { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, cols: grid.cols, rows: grid.rows };
    }
    return { playBounds: bounds, boardBounds, picks, renderer: { mounts: this.mounts, frames: this.frames, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, drawCalls: this.renderer.info.render.calls, contexts: 1, pixelRatio: this.renderer.getPixelRatio(), available: this.available }, motion: { reduced: this.reducedMotion, tweens: this.tweens.length, particles: this.particles.length, maxParticles: 48 } };
  }
  private releaseGPU() {
    // Release old context listeners before restoration; retain CPU shapes for upload.
    const geometries = new Set<BufferGeometry>(this.geometry.values()), materials = new Set<Material>(this.materials.values());
    this.content.traverse(object => { if (object instanceof Mesh) {
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach(material => materials.add(material));
    } });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => { const textured = material as MeshBasicMaterial; textured.map?.dispose(); material.dispose(); });
    this.lights.children.forEach(light => { if (light instanceof DirectionalLight)
      light.shadow.map?.dispose(); });
  }
  clear() {
    this.observer?.disconnect();
    this.releaseGPU();
    this.content.clear();
    this.content.position.set(0, 0, 0);
    this.content.rotation.set(0, 0, 0);
    this.content.scale.setScalar(1);
    this.geometry.clear();
    this.materials.clear();
    this.paper = null;
    this.tweens = [];
    this.particles = [];
    this.grid = null;
    this.host = null;
    this.play = null;
  }
}
let shared: Stage | null = null;
export const getStage = () => shared ??= new Stage();
