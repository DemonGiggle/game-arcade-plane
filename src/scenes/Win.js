import Phaser from 'phaser';
import { load, update as persistUpdate } from '../persistence.js';
import { Sfx } from '../sfx.js';

export default class Win extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  init(data) {
    this.finalScore = data.score || 0;
    // Persist a new high-score (quota-guarded in persistence.js).
    const saved = load();
    this.highScore = saved.highScore || 0;
    this.isNewBest = this.finalScore > this.highScore;
    if (this.isNewBest) {
      this.highScore = this.finalScore;
      try {
        persistUpdate({ highScore: this.highScore });
      } catch {
        // ignore persistence failure
      }
    }
  }

  create() {
    const { width, height } = this.scale;
    this.add.tileSprite(0, 0, width, height, 'ocean').setOrigin(0, 0).setTint(0xaaffaa);
    this.add.tileSprite(0, 0, width, height, 'clouds').setOrigin(0, 0);

    this.add
      .text(width / 2, 180, 'YOU WIN!', {
        fontFamily: 'Courier New',
        fontSize: '48px',
        color: '#2eff7a',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(
        width / 2,
        270,
        `BOSS DESTROYED!\nFINAL SCORE  ${this.finalScore}\nHI-SCORE  ${this.highScore}` +
          (this.isNewBest ? '\nNEW BEST!' : ''),
        {
          fontFamily: 'Courier New',
          fontSize: '18px',
          color: '#06281a',
          align: 'center',
          lineSpacing: 8,
          backgroundColor: '#ffffffaa',
          padding: { x: 16, y: 12 }
        }
      )
      .setOrigin(0.5);
    this.add
      .text(width / 2, 400, 'Press R or ENTER to play again\nPress ESC for menu   M: mute', {
        fontFamily: 'Courier New',
        fontSize: '16px',
        color: '#06281a',
        align: 'center',
        lineSpacing: 6
      })
      .setOrigin(0.5);

    // M is reserved for mute everywhere (fixes Game mute vs menu conflict).
    this.muteText = this.add
      .text(width - 10, height - 24, '', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#06281a',
        backgroundColor: '#ffffffaa',
        padding: { x: 6, y: 3 }
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    const refreshMute = () => {
      this.muteText.setText(Sfx.isMuted() ? '🔇 MUTED (M)' : '🔊 SOUND (M)');
    };
    refreshMute();
    this.muteText.on('pointerdown', (ptr, x, y, event) => {
      if (event) event.stopPropagation();
      Sfx.unlock();
      Sfx.toggleMute();
      refreshMute();
    });
    this.input.keyboard.on('keydown-M', () => {
      Sfx.unlock();
      Sfx.toggleMute();
      refreshMute();
    });

    const again = () => this.scene.start('Game');
    this.input.keyboard.once('keydown-R', again);
    this.input.keyboard.once('keydown-ENTER', again);
    this.input.keyboard.once('keydown-ESC', () => this.scene.start('Menu'));
    // Click (outside the mute button) replays; mute clicks re-arm.
    this.input.once('pointerdown', (ptr) => {
      try {
        const b = this.muteText.getBounds();
        if (b && b.contains(ptr.x, ptr.y)) {
          this.input.once('pointerdown', again);
          return;
        }
      } catch {
        // Bounds unavailable — fall through to replay.
      }
      again();
    });
    Sfx.installUnlock();
  }
}
