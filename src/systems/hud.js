/**
 * HUD system for the Game scene (issue #11).
 *
 * Owns canvas HUD creation/refresh plus DOM live-region announcements.
 * Accessibility rules enforced here:
 * - lives are text + icons via `formatLives()` (never emoji-only),
 * - power-up state uses text + bars/labels (`2X`/`SHIELD`, never color-only),
 * - an optional larger-HUD mode (H key, persisted) scales every HUD font,
 * - score/lives/boss events are mirrored to `#a11y-status` (falls back to
 *   main's `#game-status` live region).
 *
 * Rebased on main: HUD layout (high-score, power-up timer bars, mute button,
 * boss bar, pause overlay ownership) matches main's Game.js exactly — only
 * the lives format, H hint, scaling, and announcements are added.
 *
 * Functions operate on the Game scene (`score`, `highScore`, `lives`,
 * `levelIndex`, `kills`, `bossActive`, `bossHp`, `largeHud`, ...).
 *
 * @module systems/hud
 */

import { LEVELS, BOSS } from '../levels.js';
import {
  GAME_W,
  GAME_H,
  HUD_FONT,
  HUD_SIZES,
  HUD_LARGE_MULTIPLIER,
  COLORS,
  DEPTHS,
  POWERUP_META,
  formatLives,
  isLargeHudEnabled,
} from '../config.js';
import { Sfx } from '../sfx.js';
import { REDUCED_MOTION } from '../perf.js';

/**
 * Announce a message to screen readers. Prefers issue-11's `#a11y-status`,
 * falls back to main's `#game-status`. No-op when neither exists.
 *
 * @param {string} msg Message to announce.
 * @returns {void}
 */
export function announce(msg) {
  if (typeof document === 'undefined') return;
  const el =
    document.getElementById('a11y-status') ||
    document.getElementById('game-status');
  if (!el) return;
  // Clear-then-set forces re-announcement of repeated strings.
  el.textContent = '';
  const set = () => {
    el.textContent = msg;
  };
  if (typeof window !== 'undefined' && window.requestAnimationFrame) {
    window.requestAnimationFrame(set);
  } else {
    set();
  }
}

/**
 * Current HUD scale factor (1 or HUD_LARGE_MULTIPLIER).
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {number} Active scale multiplier.
 */
export function hudScale(scene) {
  return scene.largeHud ? HUD_LARGE_MULTIPLIER : 1;
}

/**
 * Resolve a base HUD font size to the active (possibly enlarged) size.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @param {number} base Base size in px.
 * @returns {number} Rounded scaled size.
 */
export function hudSize(scene, base) {
  return Math.round(base * hudScale(scene));
}

/**
 * Suffix appended to the mute line documenting the large-HUD toggle.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {string} Hint suffix, e.g. `  [H: HUD large]`.
 */
export function hudHintSuffix(scene) {
  return scene.largeHud ? '  [H: HUD std]' : '  [H: HUD large]';
}

/**
 * Create all HUD texts + boss bar + power-up timer bars (main's layout).
 * Respects the persisted larger-HUD preference. Called once from
 * `Game.create()`; the pause overlay itself stays owned by Game.
 *
 * @param {Phaser.Scene} scene Game scene (mutated: adds text fields).
 * @returns {void}
 */
export function createHud(scene) {
  scene.largeHud = isLargeHudEnabled();

  const font = (base) => ({
    fontFamily: HUD_FONT,
    fontSize: `${hudSize(scene, base)}px`,
  });

  scene.scoreText = scene.add
    .text(10, 8, 'SCORE 0', { ...font(HUD_SIZES.score), color: COLORS.hudScore })
    .setDepth(DEPTHS.hud);
  scene.highScoreText = scene.add
    .text(10, 30, 'HI 0', { ...font(HUD_SIZES.highScore), color: COLORS.hudHighScore })
    .setDepth(DEPTHS.hud);
  scene.levelText = scene.add
    .text(GAME_W / 2, 8, LEVELS[0].name, { ...font(HUD_SIZES.level), color: COLORS.hudLevel })
    .setOrigin(0.5, 0)
    .setDepth(DEPTHS.hud);
  // Text + icons (never emoji-only) so SRs read "LIVES 3 ...".
  scene.livesText = scene.add
    .text(GAME_W - 10, 8, formatLives(3), {
      ...font(HUD_SIZES.lives),
      color: COLORS.hudLives,
    })
    .setOrigin(1, 0)
    .setDepth(DEPTHS.hud);
  scene.progressText = scene.add
    .text(GAME_W / 2, 32, '', { ...font(HUD_SIZES.progress), color: COLORS.hudProgress })
    .setOrigin(0.5, 0)
    .setDepth(DEPTHS.hud);
  scene.bannerText = scene.add
    .text(GAME_W / 2, GAME_H / 2 - 40, '', {
      ...font(HUD_SIZES.banner),
      color: COLORS.banner,
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(DEPTHS.banner)
    .setAlpha(0);
  scene.pauseText = scene.add
    .text(GAME_W / 2, GAME_H / 2, 'PAUSED\nPress P to resume', {
      ...font(HUD_SIZES.pause),
      color: '#ffffff',
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(DEPTHS.pause)
    .setVisible(false);
  scene.muteText = scene.add
    .text(GAME_W - 10, GAME_H - 24, '', {
      ...font(HUD_SIZES.mute),
      color: COLORS.mute,
    })
    .setOrigin(1, 0)
    .setDepth(DEPTHS.hud)
    .setInteractive({ useHandCursor: true });

  // Boss HP bar (hidden until boss).
  scene.bossBarBg = scene.add
    .rectangle(GAME_W / 2, 56, 400, 14, 0x330a12)
    .setDepth(DEPTHS.hud)
    .setVisible(false);
  scene.bossBar = scene.add
    .rectangle(GAME_W / 2 - 196, 56, 392, 8, 0xff3355)
    .setDepth(DEPTHS.bossBar)
    .setOrigin(0, 0.5)
    .setVisible(false);
  scene.bossLabel = scene.add
    .text(GAME_W / 2, 66, '', { ...font(HUD_SIZES.bossLabel), color: COLORS.bossLabel })
    .setOrigin(0.5, 0)
    .setDepth(DEPTHS.hud)
    .setVisible(false);

  // --- Power-up timers HUD (top-left, below score; hidden when inactive) ---
  scene.doubleLabel = scene.add
    .text(10, 82, '', { ...font(HUD_SIZES.powerupStatus), color: COLORS.powerupDouble })
    .setDepth(DEPTHS.hud)
    .setVisible(false);
  scene.doubleBarBg = scene.add
    .rectangle(10, 98, 112, 8, 0x222233, 0.9)
    .setOrigin(0, 0.5)
    .setDepth(DEPTHS.hud)
    .setVisible(false);
  scene.doubleBar = scene.add
    .rectangle(11, 98, 110, 5, 0xffe14d)
    .setOrigin(0, 0.5)
    .setDepth(DEPTHS.bossBar)
    .setVisible(false);
  scene.shieldLabel = scene.add
    .text(10, 108, '', { ...font(HUD_SIZES.powerupStatus), color: COLORS.powerupShield })
    .setDepth(DEPTHS.hud)
    .setVisible(false);
  scene.shieldBarBg = scene.add
    .rectangle(10, 124, 112, 8, 0x222233, 0.9)
    .setOrigin(0, 0.5)
    .setDepth(DEPTHS.hud)
    .setVisible(false);
  scene.shieldBar = scene.add
    .rectangle(11, 124, 110, 5, 0x35e0ff)
    .setOrigin(0, 0.5)
    .setDepth(DEPTHS.bossBar)
    .setVisible(false);
}

/**
 * Re-apply font sizes after toggling larger-HUD mode.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {void}
 */
export function applyHudScale(scene) {
  if (!scene.scoreText) return;
  const s = (base) => `${hudSize(scene, base)}px`;
  scene.scoreText.setFontSize(s(HUD_SIZES.score));
  if (scene.highScoreText) scene.highScoreText.setFontSize(s(HUD_SIZES.highScore));
  scene.levelText.setFontSize(s(HUD_SIZES.level));
  scene.livesText.setFontSize(s(HUD_SIZES.lives));
  scene.progressText.setFontSize(s(HUD_SIZES.progress));
  scene.bannerText.setFontSize(s(HUD_SIZES.banner));
  scene.pauseText.setFontSize(s(HUD_SIZES.pause));
  scene.muteText.setFontSize(s(HUD_SIZES.mute));
  scene.bossLabel.setFontSize(s(HUD_SIZES.bossLabel));
  if (scene.doubleLabel) scene.doubleLabel.setFontSize(s(HUD_SIZES.powerupStatus));
  if (scene.shieldLabel) scene.shieldLabel.setFontSize(s(HUD_SIZES.powerupStatus));
  refreshMuteUi(scene);
  // Sync world power-up labels too.
  if (scene.powerups) {
    for (const p of scene.powerups.getChildren()) {
      const label = p.getData('label');
      if (label) label.setFontSize(s(HUD_SIZES.powerupLabel));
    }
  }
}

/**
 * Refresh the mute/HUD hint line (main's 🔊/🔇 icons + H hint suffix).
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {void}
 */
export function refreshMuteUi(scene) {
  if (!scene.muteText) return;
  scene.muteText.setText(
    (Sfx.isMuted() ? '🔇 MUTED (M)' : '🔊 SOUND (M)') + hudHintSuffix(scene)
  );
}

/**
 * Show a center banner (with main's reduced-motion branch) and mirror it
 * to the live region.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @param {string} msg Banner text (may contain \n).
 * @returns {void}
 */
export function showBanner(scene, msg) {
  scene.bannerText.setText(msg);
  scene.tweens.killTweensOf(scene.bannerText);
  // ISSUE-8: skip banner tween under reduced-motion (plain show/hide only).
  if (REDUCED_MOTION) {
    scene.bannerText.setAlpha(1).setScale(1);
    scene.time.delayedCall(2200, () => scene.bannerText.setAlpha(0));
  } else {
    scene.bannerText.setAlpha(1).setScale(0.7);
    scene.tweens.add({
      targets: scene.bannerText,
      alpha: 0,
      scale: 1.15,
      duration: 2200,
      ease: 'Cubic.easeOut',
    });
  }
  announce(msg.replace(/\n/g, ' '));
}

/**
 * Describe the active power-up state as text + icon (for live announcements).
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {string} Empty when no power-up is active.
 */
export function powerStatusText(scene) {
  const now = scene.elapsed || 0;
  const parts = [];
  if (now < scene.doubleShotUntil) {
    const s = Math.ceil((scene.doubleShotUntil - now) / 1000);
    parts.push(`${POWERUP_META.double.icon} ${POWERUP_META.double.name} ${s}s`);
  }
  if (now < scene.shieldUntil) {
    const s = Math.ceil((scene.shieldUntil - now) / 1000);
    parts.push(`${POWERUP_META.shield.icon} ${POWERUP_META.shield.name} ${s}s`);
  }
  return parts.join('  ');
}

/**
 * Refresh score / hi-score / lives / level / progress texts (no live-region
 * spam; call `announceProgress()` only on major events).
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {void}
 */
export function updateHud(scene) {
  scene.scoreText.setText('SCORE ' + scene.score);
  if (scene.highScoreText) {
    scene.highScoreText.setText('HI ' + Math.max(scene.highScore || 0, scene.score));
  }
  scene.livesText.setText(formatLives(scene.lives));
  scene.levelText.setText(LEVELS[scene.levelIndex].name);
  if (scene.bossActive) {
    scene.progressText.setText('DESTROY THE BOSS!');
  } else {
    const target = LEVELS[scene.levelIndex].killsToClear;
    scene.progressText.setText(`KILLS ${scene.kills}/${target}`);
  }
  if (scene.updatePowerupHud) scene.updatePowerupHud(scene.elapsed);
}

/**
 * Mirror major progress events to the live region (call on level change,
 * boss start, boss kill — never per-kill to avoid SR spam).
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {void}
 */
export function announceProgress(scene) {
  if (scene.bossActive) {
    announce(`Boss HP ${Math.max(0, scene.bossHp)} of ${BOSS.hp}. Score ${scene.score}.`);
  } else {
    const target = LEVELS[scene.levelIndex].killsToClear;
    announce(
      `${LEVELS[scene.levelIndex].name}. Kills ${scene.kills} of ${target}. ` +
        `${formatLives(scene.lives)}. Score ${scene.score}.`
    );
  }
}
