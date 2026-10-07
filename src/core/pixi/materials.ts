import { Texture } from 'pixi.js';
import { PALETTE, PixiScene } from './scene';
function color(value: number) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

export function gemTextures(scene: PixiScene): Texture[] {
  const outlines = [
    [32, 13, 96, 13, 115, 34, 110, 99, 91, 116, 33, 113, 14, 91, 13, 35],
    [64, 5, 118, 57, 64, 121, 9, 57],
    [35, 8, 94, 8, 117, 63, 94, 119, 35, 119, 12, 63],
    [27, 14, 101, 14, 114, 27, 114, 101, 101, 114, 27, 114, 14, 101, 14, 27],
    [64, 7, 122, 106, 108, 118, 20, 118, 6, 106]
  ];
  return outlines.map((points, index) =>
    scene.texture((ctx) => {
      ctx.save();
      ctx.translate(0, 4);
      path(ctx, points);
      ctx.shadowColor = '#000000cc';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#050a18';
      ctx.fill();
      ctx.restore();
      path(ctx, points);
      ctx.save();
      ctx.clip();
      const gradient = ctx.createLinearGradient(16, 7, 108, 123);
      gradient.addColorStop(0, '#f8ffff');
      gradient.addColorStop(0.14, color(PALETTE[index]));
      gradient.addColorStop(0.65, color(PALETTE[index]));
      gradient.addColorStop(1, '#192445');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < points.length; i += 2) {
        const j = (i + 2) % points.length;
        path(ctx, [points[i], points[i + 1], points[j], points[j + 1], 62, 58]);
        ctx.fillStyle = [
          '#ffffff44',
          '#ffffff0a',
          '#00000013',
          '#00000042',
          '#ffffff12'
        ][(i / 2) % 5];
        ctx.fill();
        ctx.strokeStyle = '#ffffff20';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'screen';
      const shine = ctx.createRadialGradient(38, 30, 0, 38, 30, 70);
      shine.addColorStop(0, '#ffffff99');
      shine.addColorStop(0.25, '#ffffff30');
      shine.addColorStop(1, '#ffffff00');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, 128, 128);
      ctx.restore();
      path(ctx, points);
      ctx.strokeStyle = '#e8faff88';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(34, 23);
      ctx.lineTo(69, 18);
      ctx.strokeStyle = '#ffffffbb';
      ctx.lineWidth = 2;
      ctx.stroke();
    })
  );
}
function path(ctx: CanvasRenderingContext2D, points: number[]) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2)
    ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
}

export function starTexture(scene: PixiScene) {
  return scene.texture((ctx) => {
    const points = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5,
        radius = i % 2 ? 22 : 51;
      return [64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius];
    }).flat();
    path(ctx, points);
    const gold = ctx.createLinearGradient(25, 15, 100, 118);
    gold.addColorStop(0, '#fff5bc');
    gold.addColorStop(0.45, '#ffd263');
    gold.addColorStop(1, '#b86f26');
    ctx.shadowColor = '#ffd16288';
    ctx.shadowBlur = 9;
    ctx.fillStyle = gold;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff3b5';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < points.length; i += 2) {
      const next = (i + 2) % points.length;
      path(ctx, [
        points[i],
        points[i + 1],
        points[next],
        points[next + 1],
        64,
        62
      ]);
      ctx.fillStyle = i % 4 ? '#00000016' : '#ffffff44';
      ctx.fill();
    }
  });
}
export function tileTexture(scene: PixiScene, tint: number, radius = 14) {
  return scene.texture((ctx, size) => {
    ctx.shadowColor = '#00000077';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.roundRect(5, 4, size - 10, size - 12, radius);
    const gradient = ctx.createLinearGradient(10, 5, size - 5, size);
    gradient.addColorStop(0, '#e9ffff');
    gradient.addColorStop(0.08, color(tint));
    gradient.addColorStop(0.67, color(tint));
    gradient.addColorStop(1, '#152740');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(11, 10, size - 22, size - 24, Math.max(2, radius - 5));
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff30';
    ctx.beginPath();
    ctx.roundRect(15, 13, size - 30, 3, 2);
    ctx.fill();
  });
}
