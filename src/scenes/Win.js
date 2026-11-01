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
    // Hint keeps main's keymap: R/ENTER replay, ESC menu, M mute.
    this.add
      .text(width / 2, 375, 'R / ENTER play again  •  ESC menu  •  M mute', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#06281a',
        align: 'center',
        backgroundColor: '#ffffffaa',
        padding: { x: 8, y: 4 }
      })
      .setOrigin(0.5);

    // Issue-6: proper buttons with generous hit-areas (touch + mouse).
    // No catch-all pointerdown: background taps must NOT restart the game,
    // so Menu stays reachable on touch. Navigation only via buttons + keys.
    this.makeButton(width / 2, 425, 'PLAY AGAIN  (R / ENTER)', () => this.scene.start('Game'), '#ffffff', 0x0f5132);
    this.makeButton(width / 2, 485, 'MENU  (ESC)', () => this.scene.start('Menu'), '#06281a', 0xffffff);

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
    Sfx.installUnlock();
  }

  makeButton(x, y, label, cb, color, bgColor) {
    const bg = this.add
      .rectangle(x, y, 280, 44, bgColor)
      .setStrokeStyle(2, 0x06281a)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, {
        fontFamily: 'Courier New',
        fontSize: '16px',
        color
      })
      .setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x2a4a7a));
    bg.on('pointerout', () => bg.setFillStyle(bgColor));
    bg.on('pointerdown', () => cb());
    // Make the label itself clickable too for a forgiving hit-area.
    txt.setInteractive({ useHandCursor: true });
    txt.on('pointerdown', () => cb());
    return { bg, txt };
  }
}
