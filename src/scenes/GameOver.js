import Phaser from 'phaser';
import { load, update as persistUpdate } from '../persistence.js';
import { Sfx } from '../sfx.js';

export default class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.finalScore = data.score || 0;
    this.finalLevel = data.level || 1;
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
      .text(
        width / 2,
        270,
        `SCORE  ${this.finalScore}\nHI-SCORE  ${this.highScore}` +
          (this.isNewBest ? '\nNEW BEST!' : '') +
          `\nREACHED LEVEL ${this.finalLevel}`,
        {
          fontFamily: 'Courier New',
          fontSize: '18px',
          color: '#ffffff',
          align: 'center',
          lineSpacing: 8
        }
      )
      .setOrigin(0.5);
    // Hint keeps main's keymap: R/ENTER retry, ESC menu, M mute.
    this.add
      .text(width / 2, 355, 'R / ENTER retry  •  ESC menu  •  M mute', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#8fd0ff',
        align: 'center'
      })
      .setOrigin(0.5);

    // Issue-6: proper buttons with generous hit-areas (touch + mouse).
    // No catch-all pointerdown: background taps must NOT start the game,
    // so Menu stays reachable on touch. Navigation only via buttons + keys.
    this.makeButton(width / 2, 405, 'RETRY  (R / ENTER)', () => this.scene.start('Game'), '#ffffff', 0x1b2a4a);
    this.makeButton(width / 2, 465, 'MENU  (ESC)', () => this.scene.start('Menu'), '#8fd0ff', 0x0f1c33);

    // M is reserved for mute everywhere (fixes Game mute vs menu conflict).
    this.muteText = this.add
      .text(width - 10, height - 24, '', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#8fa3c7'
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

    const retry = () => this.scene.start('Game');
    this.input.keyboard.once('keydown-R', retry);
    this.input.keyboard.once('keydown-ENTER', retry);
    this.input.keyboard.once('keydown-ESC', () => this.scene.start('Menu'));
    Sfx.installUnlock();
  }

  makeButton(x, y, label, cb, color, bgColor) {
    const bg = this.add
      .rectangle(x, y, 260, 44, bgColor)
      .setStrokeStyle(2, 0x8fd0ff)
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
