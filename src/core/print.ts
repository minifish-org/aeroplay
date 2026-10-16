import { CanvasTexture, CircleGeometry, Color, Group, Mesh, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace } from 'three';
import type { Stage } from './stage';

export const INK = {
  paper: 0xe9ddc4, white: 0xf5f0e2, black: 0x172326,
  red: 0xc43c2f, blue: 0x194d83, yellow: 0xd9a641,
  green: 0x397866, purple: 0x775a7b, muted: 0xa29478,
  night: 0x152d46,
} as const;
export type PrintKind = 'numbers' | 'night' | 'wind' | 'measure' | 'pattern' | 'harbor' | 'air' | 'sport';

/** One deterministic paper plate, multiplied by each opaque ink color. */
export function paperTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(512, 512);
  let seed = 42917;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = 239 + (seed >>> 28);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = grain;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.fillStyle = '#1016160b';
  for (let i = 0; i < 1100; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = seed & 511, y = (seed >>> 9) & 511;
    context.fillRect(x, y, 1 + (seed >>> 29), 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Graphic margins share the game's camera; their marks never receive input. */
export function printBackdrop(stage: Stage, kind: PrintKind) {
  const group = new Group();
  group.name = 'print-' + kind;
  stage.content.add(group);
  const dark = kind === 'night' || kind === 'wind' || kind === 'air' || kind === 'harbor';
  const background = kind === 'night' ? INK.night : dark ? INK.blue : INK.paper;
  (stage.scene.background as Color).setHex(background);
  if (stage.scene.fog) stage.scene.fog.color.setHex(background);
  if (kind === 'air') return group;

  const plane = new Mesh(new PlaneGeometry(160, 160), stage.material(background));
  plane.position.z = -.68;
  plane.receiveShadow = true;
  group.add(plane);
  function polygon(points: [number, number][], color: number, z = -.66) {
    const shape = new Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const mesh = new Mesh(new ShapeGeometry(shape), stage.material(color));
    mesh.position.z = z;
    group.add(mesh);
    return mesh;
  }
  function disk(x: number, y: number, radius: number, color: number, z = -.66) {
    const mesh = new Mesh(new CircleGeometry(radius, 72), stage.material(color));
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  function numeral(value: string, x: number, y: number, width: number, color = INK.black) {
    const label = stage.label(value, width, '#' + color.toString(16).padStart(6, '0'), width * 1.35);
    label.position.set(x, y, -.64);
    group.add(label);
  }
  if (kind === 'numbers') {
    disk(-4.0, 2.4, 1.7, INK.red);
    numeral('8', 4.3, -1.7, 2.5);
  } else if (kind === 'measure') {
    for (const x of [-4.8, 4.8]) {
      polygon([[x - .16, 4.85], [x + .16, 4.85], [x + .16, 4.88], [x - .16, 4.88]], INK.red);
      polygon([[x - .015, 4.7], [x + .015, 4.7], [x + .015, 5.02], [x - .015, 5.02]], INK.red);
    }
  }
  if (kind === 'harbor' || kind === 'sport') group.rotation.x = -Math.PI / 2;
  return group;
}

export function disposePrintBackdrop(group: Group) {
  group.removeFromParent();
  group.traverse(object => {
    if (object instanceof Mesh) object.geometry.dispose();
  });
}
