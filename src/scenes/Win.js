import Phaser from 'phaser';

export default class Win extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  init(data) {
    this.finalScore = data.score || 0;
  }

  create() {
    const { width, height } = this.scale;
    this.add.tileSprite(0, 0, width, height, 'ocean').setOrigin(0, 0).setTint(0xaaffaa);
    this.add.tileSprite(0, 0, width, height, 'clouds').setOrigin(0, 0);

    this.add
      .text(width / 2, 200, 'YOU WIN!', {
        fontFamily: 'Courier New',
        fontSize: '48px',
        color: '#2eff7a',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 270, `BOSS DESTROYED!\nFINAL SCORE  ${this.finalScore}`, {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#06281a',
        align: 'center',
        lineSpacing: 8,
        backgroundColor: '#ffffffaa',
        padding: { x: 16, y: 12 }
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 400, 'Press R or ENTER to play again\nPress M for menu', {
        fontFamily: 'Courier New',
        fontSize: '16px',
        color: '#06281a',
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
