import Phaser from 'phaser';
import { Sfx } from '../sfx.js';
import { track } from '../analytics.js';
import { load, update as persistUpdate } from '../persistence.js';
// ISSUE-8 (P1 perf/a11y): reduced-motion skips ambient tweens/scroll.
import { REDUCED_MOTION, clampDeltaMs } from '../perf.js';

export default class Menu extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;
    // Restore persisted prefs (muted is already restored in sfx.js on import;
    // re-sync here so a stale AudioContext gain can't drift).
    const saved = load();
    try {
      Sfx.setMuted(saved.muted === true);
    } catch {
      // audio restore must never block the menu
    }
    this.highScore = saved.highScore || 0;
    const seenTutorial = saved.seenTutorial === true;

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

    if (this.highScore > 0) {
      this.add
        .text(width / 2, 192, `HI-SCORE  ${this.highScore}`, {
          fontFamily: 'Courier New',
          fontSize: '16px',
          color: '#ffe14d'
        })
        .setOrigin(0.5);
    }

    const plane = this.physics.add.sprite(width / 2, 280, 'player');
    plane.setScale(2);
    // ISSUE-8: no idle bob tween under reduced-motion.
    if (!REDUCED_MOTION) {
      this.tweens.add({
        targets: plane,
        y: 300,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    const tutorial = seenTutorial
      ? 'Move: Arrows / WASD\nShoot: SPACE (hold)\nPause: P   Mute: M   HUD size: H\n\nClear Level 1 + 2, then beat the BOSS.'
      : 'Fly upward — the clouds scroll faster\nwhen you push UP.\n\nMove: Arrows / WASD\nShoot: SPACE (hold)\nPause: P   Mute: M   HUD size: H\n\nClear Level 1 + 2, then beat the BOSS.';

    this.add
      .text(width / 2, 400, tutorial, {
        fontFamily: 'Courier New',
        fontSize: '15px',
        color: '#dff0ff',
        align: 'center',
        lineSpacing: 6
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 570, 'Press ENTER or click to launch', {
        fontFamily: 'Courier New',
        fontSize: '17px',
        color: '#ffe14d'
      })
      .setOrigin(0.5);

    // ISSUE-8: no prompt blink tween under reduced-motion.
    if (!REDUCED_MOTION) {
      this.tweens.add({
        targets: this.children.getAt(this.children.length - 1),
        alpha: 0.2,
        duration: 600,
        yoyo: true,
        repeat: -1
      });
    }

    const start = () => {
      Sfx.unlock();
      track('start');
      try {
        persistUpdate({ seenTutorial: true });
      } catch {
        // quota guard lives in persistence.js
      }
      this.scene.start('Game');
    };
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.keyboard.once('keydown-SPACE', start);

    // Visible mute toggle (mirrors Game HUD). M always = mute.
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
    // Click-to-start ignores clicks on the mute button (re-arm instead).
    this.input.once('pointerdown', (ptr) => {
      try {
        const b = this.muteText.getBounds();
        if (b && b.contains(ptr.x, ptr.y)) {
          this.input.once('pointerdown', start);
          return;
        }
      } catch {
        // Bounds unavailable — fall through to start.
      }
      start();
    });
    Sfx.installUnlock();
  }

  update(time, delta) {
    // ISSUE-8: clamp delta; freeze ambient scroll under reduced-motion.
    if (REDUCED_MOTION) return;
    const dt = clampDeltaMs(delta) / 1000;
    this.bg.tilePositionY -= 90 * dt;
    this.clouds.tilePositionY -= 150 * dt;
  }
}
