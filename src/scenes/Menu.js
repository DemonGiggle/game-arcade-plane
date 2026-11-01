import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { track } from '../analytics.js';

export default class Menu extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;
    this.bg = this.add.tileSprite(0, 0, width, height, 'ocean').setOrigin(0, 0);
    this.clouds = this.add.tileSprite(0, 0, width, height, 'clouds').setOrigin(0, 0);

    this.add
      .text(width / 2, 120, 'ARCADE PLANE', {
        fontFamily: 'Courier New',
        fontSize: '40px',
        color: '#ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 162, 'S H O O T E R', {
        fontFamily: 'Courier New',
        fontSize: '20px',
        color: '#8fd0ff'
      })
      .setOrigin(0.5);

    const plane = this.physics.add.sprite(width / 2, 280, 'player');
    plane.setScale(2);
    this.tweens.add({
      targets: plane,
      y: 300,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.add
      .text(
        width / 2,
        400,
        'Fly upward — the clouds scroll faster\nwhen you push UP.\n\nMove: Arrows / WASD\nShoot: SPACE (hold)\nPause: P   Mute: M\n\nClear Level 1 + 2, then beat the BOSS.',
        {
          fontFamily: 'Courier New',
          fontSize: '15px',
          color: '#dff0ff',
          align: 'center',
          lineSpacing: 6
        }
      )
      .setOrigin(0.5);

    this.add
      .text(width / 2, 570, 'Press ENTER or click to launch', {
        fontFamily: 'Courier New',
        fontSize: '17px',
        color: '#ffe14d'
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: this.children.getAt(this.children.length - 1),
      alpha: 0.2,
      duration: 600,
      yoyo: true,
      repeat: -1
    });

    const start = () => {
      Sfx.unlock();
      track('start');
      this.scene.start('Game');
    };
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);
  }

  update(time, delta) {
    const dt = delta / 1000;
    this.bg.tilePositionY -= 90 * dt;
    this.clouds.tilePositionY -= 150 * dt;
  }
}
