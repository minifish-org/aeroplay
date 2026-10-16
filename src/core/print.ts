import { CanvasTexture, CircleGeometry, Color, Group, Mesh, PlaneGeometry, Shape, ShapeGeometry, SRGBColorSpace } from 'three';
import type { Stage } from './stage';

export const INK = {
  paper: 0xeee0bf, white: 0xfaf0d8, black: 0x151a1b,
  red: 0xda3726, blue: 0x174d91, yellow: 0xe9b340,
  green: 0x287354, purple: 0x78528b, muted: 0xa29478,
  night: 0x102d53,
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
  plane.position.z = -2.4;
  group.add(plane);
  function polygon(points: [number, number][], color: number, z = -1.8) {
    const shape = new Shape();
    points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const mesh = new Mesh(new ShapeGeometry(shape), stage.material(color));
    mesh.position.z = z;
    group.add(mesh);
    return mesh;
  }
  function disk(x: number, y: number, radius: number, color: number, z = -1.9) {
    const mesh = new Mesh(new CircleGeometry(radius, 72), stage.material(color));
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  function numeral(value: string, x: number, y: number, width: number, color = INK.black) {
    const label = stage.label(value, width, '#' + color.toString(16).padStart(6, '0'), width * 1.35);
    label.position.set(x, y, -1.5);
    group.add(label);
  }
  if (kind === 'numbers') {
    disk(-3.5, 2.9, 5.8, INK.red);
    disk(-3.5, 2.9, 4.65, INK.paper, -1.85);
    polygon([[2.7, 7], [5.5, 7], [-5.5, -7], [-8, -7]], INK.black);
    numeral('8', 6.1, -.9, 4.6);
    numeral('2', -5.6, -2.8, 3.4);
  } else if (kind === 'night') {
    disk(5.3, 4.9, 3, INK.paper);
    for (let i = 0; i < 18; i++) {
      const x = -8 + (i * 3.37) % 16, y = -6 + (i * 2.17) % 12;
      disk(x, y, .027 + i % 3 * .011, INK.paper, -1.7);
    }
    polygon([[3.4, -6], [3.4, -3.7], [4, -3.7], [4, -2.6], [4.4, -2.6], [4.4, -4], [5.3, -4], [5.3, -1.8], [5.7, -1.3], [6.1, -1.8], [6.1, -3], [8, -2.6], [10, -6]], INK.black);
  } else if (kind === 'measure') {
    disk(8.5, 3.7, 4.7, INK.black);
    disk(8.5, 3.7, 3.6, INK.paper, -1.85);
    polygon([[-8, -5.7], [8, -5.7], [8, -5.65], [-8, -5.65]], INK.red);
    for (const x of [-5.8, 5.8]) polygon([[x, -8], [x + .018, -8], [x + .018, 8], [x, 8]], INK.muted);
  } else if (kind === 'pattern') {
    disk(-5.1, 3, 3.8, INK.red);
    disk(-5.1, 3, 2.8, INK.yellow, -1.85);
    disk(-5.1, 3, 1.8, INK.blue, -1.8);
    polygon([[4.2, 8], [8, 8], [4.2, 1], [8, -3], [8, -8], [3.7, -2]], INK.black);
    polygon([[5.3, 4], [8, 1.5], [5.8, -1], [4.1, 1]], INK.red, -1.7);
  } else if (kind === 'sport') {
    polygon([[-20, -16], [-7, -16], [-7, 16], [-20, 16]], INK.blue);
    polygon([[7, -16], [20, -16], [20, 16], [7, 16]], INK.red);
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
