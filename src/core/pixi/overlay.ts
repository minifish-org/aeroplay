import { Container, Graphics, Text } from 'pixi.js';
import { PixiScene } from './scene';

export class GameOverlay {
  private readonly root = new Container();
  private readonly title: Text;
  private readonly subtitle: Text;
  constructor(scene: PixiScene) {
    const y = scene.height * 0.42;
    const bg = new Graphics()
      .rect(0, y - 16, scene.width, 104)
      .fill({ color: 0x081226, alpha: 0.9 });
    bg.moveTo(0, y - 16)
      .lineTo(scene.width, y - 16)
      .stroke({ color: 0x6cdcff, alpha: 0.45, width: 1 });
    this.title = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: scene.width < 300 ? 19 : 24,
        fontWeight: '800',
        fill: 0xf0f7ff
      }
    });
    this.subtitle = new Text({
      text: '',
      style: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: scene.width < 300 ? 10 : 12,
        fill: 0xb8ccdf,
        wordWrap: true,
        wordWrapWidth: scene.width - 28,
        align: 'center'
      }
    });
    this.title.anchor.set(0.5);
    this.subtitle.anchor.set(0.5);
    this.title.position.set(scene.width / 2, y + 16);
    this.subtitle.position.set(scene.width / 2, y + 51);
    this.root.addChild(bg, this.title, this.subtitle);
    scene.hud.addChild(this.root);
  }
  set(title: string, subtitle = '') {
    this.root.visible = !!title;
    this.title.text = title;
    this.subtitle.text = subtitle;
  }
}
