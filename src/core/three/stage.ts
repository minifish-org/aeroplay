import {
  Camera,
  PerspectiveCamera,
  Color,
  DirectionalLight,
  HemisphereLight,
  Material,
  Mesh,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  BufferGeometry
} from 'three';

export function createStage(
  host: HTMLElement,
  camera: Camera,
  background: number
) {
  const canvas = document.createElement('canvas');
  canvas.className = 'three-canvas';
  canvas.setAttribute('aria-label', '3D game scene');
  const context = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true
  });
  if (!context) {
    const fallback = document.createElement('div');
    fallback.className = 'three-unavailable';
    fallback.textContent =
      '3D is unavailable in this browser. Try a browser with WebGL 2, or return to the classic games.';
    host.append(fallback);
    return null;
  }
  const renderer = new WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new Scene();
  scene.background = new Color(background);
  scene.add(new HemisphereLight(0xffffff, 0x527687, 2.6));
  const sun = new DirectionalLight(0xfff2d6, 3.2);
  sun.position.set(-8, 15, 6);
  scene.add(sun);
  host.append(canvas);
  let disposed = false;
  const resize = () => {
    if (disposed) return;
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    if (camera instanceof PerspectiveCamera) {
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  let lost = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    lost = false;
    resize();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return {
    scene,
    renderer,
    canvas,
    resize,
    get available() {
      return !lost && !disposed;
    },
    render() {
      if (!disposed && !lost) renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    }
  };
}

export function disposeObject(object: Scene | import('three').Object3D) {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    geometries.add(child.geometry);
    const list = Array.isArray(child.material)
      ? child.material
      : [child.material];
    list.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
