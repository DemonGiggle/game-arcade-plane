import Phaser from 'phaser';

export default class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.finalScore = data.score || 0;
    this.finalLevel = data.level || 1;
  }

  create() {
    const { width, height } = this.scale;
    this.add.tileSprite(0, 0, width, height, 'ocean').setOrigin(0, 0).setTint(0x885555);

    this.add
      .text(width / 2, 200, 'GAME OVER', {
        fontFamily: 'Courier New',
        fontSize: '44px',
        color: '#ff5555',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 270, `SCORE  ${this.finalScore}\nREACHED LEVEL ${this.finalLevel}`, {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 8
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 380, 'Press R or ENTER to retry\nPress M for menu', {
        fontFamily: 'Courier New',
        fontSize: '16px',
        color: '#8fd0ff',
        align: 'center',
        lineSpacing: 6
      })
      .setOrigin(0.5);

    this.input.keyboard.once('keydown-R', () => this.scene.start('Game'));
    this.input.keyboard.once('keydown-ENTER', () => this.scene.start('Game'));
    this.input.keyboard.once('keydown-M', () => this.scene.start('Menu'));
    this.input.once('pointerdown', () => this.scene.start('Game'));
  }
}
