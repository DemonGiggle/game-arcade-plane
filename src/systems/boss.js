/**
 * Boss system (issue #11).
 *
 * Extracted from `Game.js` so boss lifecycle (spawn / fan shots / HP bar /
 * strafe / death cinematic) is documented in one place. Functions mutate
 * the scene's boss fields (`boss`, `bossHp`, `bossActive`, `bossBar*`,
 * `bossFireTimer`, `colliders`) and delegate HUD/sound/persistence to the
 * scene and existing modules.
 *
 * Rebased on main: keeps main's behavior exactly — reduced-motion branch,
 * collider tracking for shutdown cleanup (#2), `commitHighScore()` +
 * analytics `track()` events, timer nulling, and the `BOSS ♥ HP` label
 * (text + icon, never color-only).
 *
 * @module systems/boss
 */

import { BOSS } from '../levels.js';
import { GAME_W, DEPTHS, BOSS_BULLET_SPEED_Y, BOSS_SPREAD_STEP } from '../config.js';
import { announce } from './hud.js';
import { REDUCED_MOTION } from '../perf.js';
import { track } from '../analytics.js';
import { Sfx } from '../sfx.js';

/**
 * Spawn the boss gunship, show the HP bar, and wire bullet/ram overlaps.
 * Overlaps are pushed to `scene.colliders` so shutdown cleanup (#2) works.
 *
 * @param {Phaser.Scene} scene Game scene (needs groups, timers, tweens, HUD).
 * @returns {Phaser.GameObjects.Sprite} The boss sprite.
 */
export function startBoss(scene) {
  scene.bossActive = true;
  scene.enemies.clear(true, true);
  Sfx.bossWarn();
  // showBanner is a Game wrapper (hud + live region) kept for merge compat.
  if (typeof scene.showBanner === 'function') scene.showBanner('WARNING\nBOSS INCOMING');
  announce('Warning. Boss incoming.');
  scene.bossHp = BOSS.hp;
  const boss = scene.physics.add.sprite(GAME_W / 2, -80, 'boss');
  boss.setDepth(DEPTHS.enemy);
  boss.setScale(1.4);
  scene.boss = boss;
  // ISSUE-8: skip entrance tween under reduced-motion (place directly).
  if (REDUCED_MOTION) {
    boss.y = 130;
  } else {
    scene.tweens.add({
      targets: boss,
      y: 130,
      duration: 2000,
      ease: 'Sine.easeOut',
    });
  }
  scene.bossBarBg.setVisible(true);
  scene.bossBar.setVisible(true);
  scene.bossLabel.setText('BOSS ♥ HP').setVisible(true);
  scene.bossFireTimer = scene.time.addEvent({
    delay: BOSS.fireDelay,
    loop: true,
    callback: () => bossShoot(scene),
  });
  // Collide player bullets with the boss body directly.
  // NOTE: for group-vs-sprite overlaps Phaser passes (sprite, groupChild),
  // so the boss comes first and the bullet second. Using (b) alone here
  // used to disable/invisibilize the BOSS on first contact (boss never seen).
  scene.colliders.push(
    scene.physics.add.overlap(scene.playerBullets, boss, (_bossSprite, b) => {
      if (!b || !b.active || scene.gameOver) return;
      b.disableBody(true, true);
      b.setActive(false).setVisible(false);
      scene.bossHp -= 1;
      scene.score += 10;
      boss.setTintFill(0xffffff);
      scene.time.delayedCall(50, () => boss.clearTint());
      updateBossBar(scene);
      if (typeof scene.updateHud === 'function') scene.updateHud();
      if (scene.bossHp <= 0) killBoss(scene);
    })
  );
  // Ramming the boss hurts the player.
  scene.colliders.push(
    scene.physics.add.overlap(scene.player, boss, () => scene.hurtPlayer())
  );
  return boss;
}

/**
 * Refresh the boss HP bar scale from `scene.bossHp`.
 *
 * @param {Phaser.Scene} scene Game scene (needs `bossBar`).
 * @returns {void}
 */
export function updateBossBar(scene) {
  const frac = Math.max(0.0001, scene.bossHp / BOSS.hp);
  scene.bossBar.setScale(frac, 1);
}

/**
 * Fire one boss fan volley (spread of `BOSS.spreadCount` bullets).
 * No-op unless the boss is alive, unpaused, and the run is ongoing.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {void}
 */
export function bossShoot(scene) {
  if (
    !scene.bossActive ||
    !scene.boss ||
    !scene.boss.active ||
    scene.isPaused ||
    scene.gameOver
  ) {
    return;
  }
  const bx = scene.boss.x;
  const by = scene.boss.y + 40;
  for (let i = 0; i < BOSS.spreadCount; i++) {
    const b = scene.enemyBullets.get(bx, by, 'enemyBullet');
    if (!b) continue;
    b.enableBody(true, bx, by, true, true);
    const spread = (i - (BOSS.spreadCount - 1) / 2) * BOSS_SPREAD_STEP;
    b.setVelocity(spread, BOSS_BULLET_SPEED_Y);
    b.setDepth(DEPTHS.enemyBullet);
  }
  Sfx.enemyShoot();
}

/**
 * Sinusoidal strafe near the top of the screen. Called every frame.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @param {number} now Elapsed ms (scene clock) for the sine phase.
 * @returns {void}
 */
export function updateBossMovement(scene, now) {
  if (scene.bossActive && scene.boss && scene.boss.active) {
    scene.boss.x = GAME_W / 2 + Math.sin(now / 700) * 150;
    if (scene.boss.y < 130 && scene.boss.body) {
      scene.boss.setVelocityY(40);
    } else if (scene.boss.body) {
      scene.boss.setVelocity(0, 0);
    }
  }
}

/**
 * Kill the boss: score, high-score commit, analytics, explosion, shake
 * (skipped under reduced-motion), timer teardown, and queued Win scene.
 * Sets `gameOver` to freeze further damage/spawns during the death cinematic.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @returns {void}
 */
export function killBoss(scene) {
  scene.score += BOSS.score;
  if (typeof scene.commitHighScore === 'function') scene.commitHighScore();
  track('boss_kill', { score: scene.score });
  scene.explode(scene.boss.x, scene.boss.y, true);
  // ISSUE-8: no shake under reduced-motion (keep #2 timer nulling).
  if (!REDUCED_MOTION) scene.cameras.main.shake(400, 0.02);
  if (scene.bossFireTimer) {
    scene.bossFireTimer.remove();
    scene.bossFireTimer = null;
  }
  if (scene.boss) scene.boss.destroy();
  scene.boss = null;
  scene.bossActive = false;
  announce(`Boss destroyed. Score ${scene.score}.`);
  Sfx.win();
  scene.time.delayedCall(1200, () => {
    scene.scene.start('Win', { score: scene.score });
  });
  scene.gameOver = true; // freeze further damage/spawns during death cinematic
}
