/**
 * Enemy + power-up spawning system (issue #11).
 *
 * Extracted from `Game.js` so spawn pacing, pooling, and power-up labels
 * live outside the scene. All functions take the scene as an explicit
 * parameter and only touch documented Game fields.
 *
 * Accessibility note: every world power-up gets a text-code label
 * (`2X` / `SH`) with a contrasting pill background, so pickups are never
 * color-only. Labels are attached to their sprite and synced each frame.
 * Rebased on main: spawn numbers, pool caps, and velocities match main's
 * Game.js exactly (behavior-preserving); power-up despawn also clears its
 * label (main leaked the Text object).
 *
 * @module systems/spawning
 */

import Phaser from 'phaser';
import { LEVELS, ENEMY_STATS } from '../levels.js';
import {
  GAME_W,
  GAME_H,
  DEPTHS,
  HUD_SIZES,
  COLORS,
  HUD_FONT,
  POWERUP,
  POWERUP_META,
} from '../config.js';
import { hudSize } from './hud.js';

/**
 * Weighted random enemy type for the current level.
 *
 * @param {{ scout: number, weaver: number, tank: number }} weights Level weights (sum ~1).
 * @returns {'scout'|'weaver'|'tank'} Chosen enemy type.
 */
export function pickEnemyType(weights) {
  const r = Math.random();
  if (r < weights.scout) return 'scout';
  if (r < weights.scout + weights.weaver) return 'weaver';
  return 'tank';
}

/**
 * Spawn one enemy at a random x above the screen (pooled).
 * No-op while paused / over / boss-active, or when the pool is exhausted.
 *
 * @param {Phaser.Scene} scene Game scene (needs `enemies`, `levelIndex`, flags).
 * @returns {Phaser.GameObjects.GameObject|null} The spawned enemy or null.
 */
export function spawnEnemy(scene) {
  if (scene.isPaused || scene.gameOver || scene.bossActive) return null;
  const type = pickEnemyType(LEVELS[scene.levelIndex].weights);
  const stats = ENEMY_STATS[type];
  const level = LEVELS[scene.levelIndex];
  const x = Phaser.Math.Between(30, GAME_W - 30);
  const enemy = scene.enemies.get(x, -40, stats.key);
  if (!enemy) return null;
  // Re-enable physics body on pooled reuse (disableBody turns it off).
  enemy.enableBody(true, x, -40, true, true);
  enemy.setTexture(stats.key);
  enemy.setData('type', type);
  enemy.setData('hp', stats.hp);
  enemy.setData('t', Math.random() * 10);
  enemy.setData('baseX', x);
  enemy.setData('lastShot', 0);
  enemy.setVelocity(0, level.enemySpeed * stats.vy + 30);
  enemy.setDepth(DEPTHS.enemy);
  enemy.clearTint();
  return enemy;
}

/**
 * Create (or refresh) the text-code label attached above a power-up sprite.
 *
 * @param {Phaser.Scene} scene Game scene.
 * @param {Phaser.GameObjects.Sprite} powerup Active power-up sprite.
 * @param {'double'|'shield'} kind Power-up kind.
 * @returns {void}
 */
export function attachPowerupLabel(scene, powerup, kind) {
  const meta = POWERUP_META[kind];
  let label = powerup.getData('label');
  const size = hudSize(scene, HUD_SIZES.powerupLabel);
  if (!label || !label.active) {
    label = scene.add
      .text(powerup.x, powerup.y - 22, meta.code, {
        fontFamily: HUD_FONT,
        fontSize: `${size}px`,
        color: kind === 'double' ? COLORS.powerupDouble : COLORS.powerupShield,
        fontStyle: 'bold',
        backgroundColor: '#06121fdd',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTHS.powerupLabel);
    powerup.setData('label', label);
  } else {
    label.setText(meta.code);
    label.setColor(kind === 'double' ? COLORS.powerupDouble : COLORS.powerupShield);
    label.setFontSize(size);
    label.setVisible(true);
    label.setPosition(powerup.x, powerup.y - 22);
  }
}

/**
 * Destroy the label attached to a power-up (if any) and clear the reference.
 *
 * @param {Phaser.GameObjects.Sprite} powerup Power-up sprite.
 * @returns {void}
 */
export function clearPowerupLabel(powerup) {
  const label = powerup.getData && powerup.getData('label');
  if (label) {
    label.destroy();
    powerup.setData('label', null);
  }
}

/**
 * Keep every active power-up label glued above its sprite.
 *
 * @param {Phaser.Scene} scene Game scene (needs `powerups`).
 * @returns {void}
 */
export function syncPowerupLabels(scene) {
  if (!scene.powerups) return;
  const children = scene.powerups.getChildren();
  for (let i = 0; i < children.length; i++) {
    const p = children[i];
    if (!p.active) continue;
    const label = p.getData('label');
    if (label) label.setPosition(p.x, p.y - 22);
  }
}

/**
 * Roll for a power-up drop on enemy kill (pooled, with text+icon label).
 *
 * @param {Phaser.Scene} scene Game scene (needs `powerups`).
 * @param {number} x Drop x in world coordinates.
 * @param {number} y Drop y in world coordinates.
 * @param {string} [forcedKind] Optional 'double'|'shield' for tests.
 * @returns {'double'|'shield'|null} Spawned kind or null when no drop.
 */
export function maybeDropPowerup(scene, x, y, forcedKind) {
  if (!forcedKind && Math.random() > POWERUP.dropChance) return null;
  const kind = forcedKind || (Math.random() < POWERUP.doubleWeight ? 'double' : 'shield');
  const meta = POWERUP_META[kind];
  const p = scene.powerups.get(x, y, meta.texture);
  if (!p) return null;
  p.enableBody(true, x, y, true, true);
  p.setTexture(meta.texture);
  p.setData('kind', kind);
  p.setVelocity(0, POWERUP.fallSpeed);
  p.setDepth(DEPTHS.powerup);
  attachPowerupLabel(scene, p, kind);
  return kind;
}

/**
 * Despawn offscreen bullets / power-ups (clearing orphan labels) / enemies.
 * Pooled objects are disabled, not destroyed (labels are lightweight Texts).
 * Uses indexed loops over cached arrays (no per-frame iterator alloc, #8).
 *
 * @param {Phaser.Scene} scene Game scene with pooled groups.
 * @returns {void}
 */
export function cleanupOffscreen(scene) {
  const pBullets = scene.playerBullets.getChildren();
  for (let i = 0; i < pBullets.length; i++) {
    const b = pBullets[i];
    if (b.active && b.y < -30) {
      b.disableBody(true, true);
      b.setActive(false).setVisible(false);
    }
  }
  const eBullets = scene.enemyBullets.getChildren();
  for (let i = 0; i < eBullets.length; i++) {
    const b = eBullets[i];
    if (b.active && (b.y > GAME_H + 30 || b.x < -30 || b.x > GAME_W + 30)) {
      b.disableBody(true, true);
      b.setActive(false).setVisible(false);
    }
  }
  const powers = scene.powerups.getChildren();
  for (let i = 0; i < powers.length; i++) {
    const p = powers[i];
    if (p.active && p.y > GAME_H + 30) {
      clearPowerupLabel(p);
      p.disableBody(true, true);
      p.setActive(false).setVisible(false);
    }
  }
  const foes = scene.enemies.getChildren();
  for (let i = 0; i < foes.length; i++) {
    const enemy = foes[i];
    if (enemy.active && enemy.y > GAME_H + 60) {
      enemy.disableBody(true, false);
      enemy.setActive(false).setVisible(false);
    }
  }
}
