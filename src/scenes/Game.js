import Phaser from 'phaser';
import { LEVELS, ENEMY_STATS } from '../levels.js';
import { Sfx } from '../sfx.js';
import { track } from '../analytics.js';
import { load, update as persistUpdate } from '../persistence.js';
import { attachTouchControls } from '../input/touch.js';
// ISSUE-8 (P1 perf/a11y): shared flags only; keep #1 (touch) + #2 (pause/cleanup) wiring intact.
import { REDUCED_MOTION, clampDeltaMs } from '../perf.js';
// ISSUE-11 (P2 refactor+a11y): constants + extracted systems. Game keeps the
// same public method names as thin wrappers so other waves still apply.
import {
  GAME_W,
  GAME_H,
  PLAYER_SPEED,
  FIRE_DELAY,
  PLAYER_BULLET_SPEED,
  TANK_BULLET_SPEED,
  BOOST_SPEED,
  BOSS_SCROLL_BONUS,
  POOL_SIZES,
  POWERUP,
  INVULN,
  DEPTHS,
  POWERUP_META,
  setLargeHudEnabled,
} from '../config.js';
import {
  createHud,
  updateHud as refreshHud,
  showBanner as renderBanner,
  applyHudScale,
  refreshMuteUi as refreshMuteUiSystem,
  announce,
  announceProgress,
} from '../systems/hud.js';
import {
  pickEnemyType as pickWeightedType,
  spawnEnemy as spawnEnemySystem,
  maybeDropPowerup as dropPowerupSystem,
  clearPowerupLabel,
  syncPowerupLabels,
  cleanupOffscreen,
} from '../systems/spawning.js';
import {
  startBoss as startBossSystem,
  bossShoot as bossShootSystem,
  updateBossBar as refreshBossBar,
  killBoss as killBossSystem,
  updateBossMovement,
} from '../systems/boss.js';

// Dimensions / speeds sourced from src/config.js (issue #11 extraction).
// Local aliases keep the touch/perf call-sites below unchanged.
const W = GAME_W;
const H = GAME_H;
const POWER_DOUBLE_MS = POWERUP.doubleDurationMs;
const POWER_SHIELD_MS = POWERUP.shieldDurationMs;

/**
 * Main arcade scroller scene: player, enemies, power-ups, levels, boss, HUD.
 *
 * Orchestration layer: combat/spawn/boss/HUD details live in
 * `src/config.js` + `src/systems/{spawning,hud,boss}.js`. Method names are
 * kept stable so concurrent waves still apply; bodies delegate to systems
 * where noted. Keeps main's touch (#1), auto-pause (#2), persistence (#4),
 * audio (#5), pause overlay (#6), perf flags (#8), and analytics (#10).
 *
 * @extends Phaser.Scene
 */
export default class Game extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  /** Reset run state. */
  init() {
    this.score = 0;
    this.highScore = 0;
    this.lives = 3;
    this.levelIndex = 0;
    this.kills = 0;
    this.bossActive = false;
    this.boss = null;
    this.bossHp = 0;
    this.isPaused = false;
    this.gameOver = false;
    this.doubleShotUntil = 0;
    this.shieldUntil = 0;
    this.invulnUntil = 0;
    this.lastFired = 0;
    this.elapsed = 0;
    this.spawnTimer = null;
    this.bossFireTimer = null;
    this.colliders = [];
    this.touch = null; // touch controls (issue #1), attached in create()
    this.largeHud = false; // larger-HUD a11y option (issue #11, H key)
  }

  /** Build world, groups, input, HUD, timers, and auto-pause wiring. */
  create() {
    this.attempt = (Game.attempts = (Game.attempts || 0) + 1);
    if (this.attempt > 1) track('retry', { attempt: this.attempt });
    const level = LEVELS[this.levelIndex];

    // Restore persisted prefs: high-score for HUD, muted for audio.
    try {
      const saved = load();
      this.highScore = saved.highScore || 0;
      Sfx.setMuted(saved.muted === true);
    } catch {
      this.highScore = this.highScore || 0;
    }

    // --- Scrolling background: two parallax TileSprites ---
    // tilePositionY is decreased every frame so the world appears to
    // fly downward while the plane flies upward. Holding UP boosts speed.
    this.bg = this.add.tileSprite(0, 0, W, H, 'ocean').setOrigin(0, 0);
    this.clouds = this.add.tileSprite(0, 0, W, H, 'clouds').setOrigin(0, 0);
    this.bg.setTint(level.tint);

    // --- Player ---
    this.player = this.physics.add.sprite(W / 2, H - 100, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(DEPTHS.player);

    // Shield ring (hidden unless shield active)
    this.shieldRing = this.add.circle(0, 0, 30);
    this.shieldRing.setStrokeStyle(3, 0x35e0ff, 0.9);
    this.shieldRing.setVisible(false);
    this.shieldRing.setDepth(DEPTHS.shieldRing);

    // Engine flame particles
    this.flame = this.add.particles(0, 0, 'spark', {
      speed: { min: 40, max: 120 },
      angle: { min: 80, max: 100 },
      lifespan: 300,
      quantity: 1,
      frequency: 40,
      scale: { start: 0.6, end: 0 },
      tint: [0xffa126, 0xffe14d, 0x3aa0ff],
      follow: this.player,
      followOffset: { x: 0, y: 20 }
    });
    this.flame.setDepth(DEPTHS.flame);

    // --- Groups (pooled; caps from src/config.js) ---
    this.playerBullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: POOL_SIZES.playerBullets
    });
    this.enemyBullets = this.physics.add.group({
      defaultKey: 'enemyBullet',
      maxSize: POOL_SIZES.enemyBullets
    });
    this.enemies = this.physics.add.group({ maxSize: POOL_SIZES.enemies });
    this.powerups = this.physics.add.group({ maxSize: POOL_SIZES.powerups });

    // Explosion particles (one emitter, explode on demand)
    this.boom = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 260 },
      lifespan: { min: 200, max: 500 },
      scale: { start: 1.2, end: 0 },
      tint: [0xffffff, 0xffe14d, 0xff6b2e, 0xff2222],
      emitting: false
    });
    this.boom.setDepth(DEPTHS.explosion);

    // --- Collisions (stored for shutdown cleanup) ---
    this.colliders.push(
      this.physics.add.overlap(
        this.playerBullets,
        this.enemies,
        this.onBulletHitsEnemy,
        null,
        this
      )
    );
    this.colliders.push(
      this.physics.add.overlap(
        this.enemyBullets,
        this.player,
        this.onEnemyBulletHitsPlayer,
        null,
        this
      )
    );
    this.colliders.push(
      this.physics.add.overlap(
        this.enemies,
        this.player,
        this.onEnemyRamsPlayer,
        null,
        this
      )
    );
    this.colliders.push(
      this.physics.add.overlap(
        this.powerups,
        this.player,
        this.onCollectPowerup,
        null,
        this
      )
    );

    // --- Input (guarded: keyboard plugin may be absent) ---
    // Keep main's guard + auto-pause/mute wiring; add issue-6 ESC pause
    // and paused-M = Menu (mute suppressed while paused); issue-11 adds H.
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D,P,M,H,SPACE');
      this.input.keyboard.on('keydown-P', () => this.togglePause());
      this.input.keyboard.on('keydown-ESC', () => this.togglePause());
      this.input.keyboard.on('keydown-H', () => this.toggleLargeHud());
      this.input.keyboard.on('keydown-M', () => {
        if (this.isPaused) return; // paused M = Menu (overlay handler below)
        this.toggleMuteUi();
      });
    }
    Sfx.installUnlock();
    Sfx.startMusic();

    // --- Touch controls (issue #1, P0): drag-to-move + autofire + buttons ---
    this.touch = attachTouchControls(this);

    // --- HUD (extracted to src/systems/hud.js; same layout as main) ---
    createHud(this);
    this.muteText.on('pointerdown', () => this.toggleMuteUi());
    this.refreshMuteUi();

    // --- Pause overlay (dim + resume/restart/menu buttons) ---
    this.createPauseOverlay();

    this.showBanner(LEVELS[0].name + '\nShoot everything!');
    this.updateHud();
    announce(`Game start. ${LEVELS[0].name}. 3 lives. Score 0.`);

    // --- Enemy spawn loop ---
    this.spawnTimer = this.time.addEvent({
      delay: level.spawnDelay,
      loop: true,
      callback: () => this.spawnEnemy()
    });

    // --- Auto-pause on blur/hidden (tab switch, minimize) ---
    this._autoPauseHandler = () => this.autoPause();
    this._visibilityHandler = () => {
      if (typeof document !== 'undefined' && document.hidden) this.autoPause();
    };
    this.game.events.on('hidden', this._autoPauseHandler, this);
    this.game.events.on('blur', this._autoPauseHandler, this);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('blur', this._autoPauseHandler);
    }
    this.events.once('shutdown', this.handleShutdown, this);
  }

  // ---------- helpers (HUD delegates to src/systems/hud.js) ----------

  /**
   * Show a center banner and mirror it to the screen-reader live region.
   * @param {string} msg Banner text.
   */
  showBanner(msg) {
    renderBanner(this, msg);
  }

  /** Refresh score/hi/lives/level/progress/power-up HUD. */
  updateHud() {
    refreshHud(this);
  }

  /**
   * Toggle pause (optionally forced).
   * @param {boolean} [force] Force paused/unpaused when boolean.
   */
  togglePause(force) {
    if (this.gameOver) return;
    const next = typeof force === 'boolean' ? force : !this.isPaused;
    if (next === this.isPaused) return;
    this.setPaused(next);
  }

  /**
   * Apply paused state: overlay, physics, timers + live announcement.
   * @param {boolean} paused Next paused state.
   */
  setPaused(paused) {
    if (this.gameOver) return;
    if (this.isPaused === paused && this.pauseOverlay && this.pauseOverlay.visible === paused) return;
    this.isPaused = paused;
    // Legacy pauseText object is kept (issue #2 auto-pause builds on it)
    // but hidden: the overlay is the visible pause UI, and showing both
    // would overlap the RESUME button / ghost through the dim.
    if (this.pauseText) this.pauseText.setVisible(false);
    if (this.pauseOverlay) this.pauseOverlay.setVisible(paused);
    if (paused) {
      this.physics.world.pause();
      if (this.spawnTimer) this.spawnTimer.paused = true;
      if (this.bossFireTimer) this.bossFireTimer.paused = true;
      announce('Paused. Press P to resume.');
    } else {
      this.physics.world.resume();
      if (this.spawnTimer) this.spawnTimer.paused = false;
      if (this.bossFireTimer) this.bossFireTimer.paused = false;
      announce('Resumed.');
    }
  }

  /**
   * Toggle the larger-HUD accessibility option (H key, persisted).
   */
  toggleLargeHud() {
    this.largeHud = !this.largeHud;
    setLargeHudEnabled(this.largeHud);
    applyHudScale(this);
    this.updateHud();
    announce(this.largeHud ? 'Large HUD on.' : 'Large HUD off.');
  }

  createPauseOverlay() {
    const overlay = this.add.container(0, 0).setDepth(60).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setOrigin(0, 0);
    const title = this.add
      .text(W / 2, H / 2 - 110, 'PAUSED', {
        fontFamily: 'Courier New',
        fontSize: '36px',
        color: '#ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(W / 2, H / 2 - 76, 'P / ESC to resume', {
        fontFamily: 'Courier New',
        fontSize: '14px',
        color: '#8fd0ff'
      })
      .setOrigin(0.5);
    overlay.add([dim, title, hint]);
    this.pauseButtons = [];
    const defs = [
      { label: 'RESUME (P)', cb: () => this.resumeGame() },
      { label: 'RESTART (R)', cb: () => this.restartGame() },
      { label: 'MENU (M)', cb: () => this.quitToMenu() }
    ];
    defs.forEach((d, i) => {
      const y = H / 2 - 10 + i * 56;
      const btn = this.makePauseButton(W / 2, y, d.label, d.cb);
      overlay.add([btn.bg, btn.label]);
      this.pauseButtons.push(btn);
    });
    // Keyboard shortcuts while paused (P/ESC handled globally).
    // Guarded: keyboard plugin may be absent (boot fallback tests).
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-R', () => {
        if (this.isPaused) this.restartGame();
      });
      this.input.keyboard.on('keydown-M', () => {
        if (this.isPaused) this.quitToMenu();
      });
    }
    this.pauseOverlay = overlay;
  }

  makePauseButton(x, y, label, cb) {
    const bg = this.add.rectangle(x, y, 230, 42, 0x182a4a, 0.95).setStrokeStyle(2, 0x8fd0ff);
    const txt = this.add
      .text(x, y, label, {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x2a4a7a, 1));
    bg.on('pointerout', () => bg.setFillStyle(0x182a4a, 0.95));
    bg.on('pointerdown', () => cb());
    return { bg, label: txt };
  }

  resumeGame() {
    this.setPaused(false);
  }

  restartGame() {
    // Unpause before restart so the fresh scene starts running.
    this.isPaused = false;
    if (this.pauseText) this.pauseText.setVisible(false);
    if (this.pauseOverlay) this.pauseOverlay.setVisible(false);
    this.physics.world.resume();
    if (this.spawnTimer) this.spawnTimer.paused = false;
    if (this.bossFireTimer) this.bossFireTimer.paused = false;
    this.scene.restart();
  }

  quitToMenu() {
    this.isPaused = false;
    if (this.pauseText) this.pauseText.setVisible(false);
    if (this.pauseOverlay) this.pauseOverlay.setVisible(false);
    this.physics.world.resume();
    if (this.spawnTimer) this.spawnTimer.paused = false;
    if (this.bossFireTimer) this.bossFireTimer.paused = false;
    this.scene.start('Menu');
  }

  updatePowerupHud(now) {
    if (!this.doubleLabel || !this.shieldLabel) return;
    const t = typeof now === 'number' ? now : this.elapsed;
    const dRemain = this.doubleShotUntil - t;
    if (dRemain > 0) {
      const frac = Phaser.Math.Clamp(dRemain / POWER_DOUBLE_MS, 0, 1);
      this.doubleLabel.setText(`2X ${(dRemain / 1000).toFixed(1)}s`).setVisible(true);
      this.doubleBarBg.setVisible(true);
      this.doubleBar.setVisible(true).setScale(frac, 1);
    } else {
      this.doubleLabel.setVisible(false);
      this.doubleBarBg.setVisible(false);
      this.doubleBar.setVisible(false);
    }
    const sRemain = this.shieldUntil - t;
    if (sRemain > 0) {
      const frac = Phaser.Math.Clamp(sRemain / POWER_SHIELD_MS, 0, 1);
      this.shieldLabel.setText(`SHIELD ${(sRemain / 1000).toFixed(1)}s`).setVisible(true);
      this.shieldBarBg.setVisible(true);
      this.shieldBar.setVisible(true).setScale(frac, 1);
    } else {
      this.shieldLabel.setVisible(false);
      this.shieldBarBg.setVisible(false);
      this.shieldBar.setVisible(false);
    }
  }

  autoPause() {
    if (!this.isPaused && !this.gameOver) this.togglePause();
  }

  toggleMuteUi() {
    Sfx.unlock();
    Sfx.toggleMute();
    this.refreshMuteUi();
  }

  refreshMuteUi() {
    refreshMuteUiSystem(this);
  }

  handleShutdown() {
    Sfx.stopMusic();
    if (this.game && this.game.events) {
      this.game.events.off('hidden', this._autoPauseHandler, this);
      this.game.events.off('blur', this._autoPauseHandler, this);
    }
    if (typeof document !== 'undefined' && document.removeEventListener && this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    if (typeof window !== 'undefined' && window.removeEventListener && this._autoPauseHandler) {
      window.removeEventListener('blur', this._autoPauseHandler);
    }
    if (this.input && this.input.keyboard) {
      this.input.keyboard.off('keydown-P');
      this.input.keyboard.off('keydown-ESC');
      this.input.keyboard.off('keydown-M');
      this.input.keyboard.off('keydown-R');
      this.input.keyboard.off('keydown-H');
    }
    if (this.spawnTimer) {
      this.spawnTimer.remove(false);
      this.spawnTimer = null;
    }
    if (this.bossFireTimer) {
      this.bossFireTimer.remove(false);
      this.bossFireTimer = null;
    }
    if (this.colliders && this.physics && this.physics.world) {
      for (const collider of this.colliders) {
        if (collider) this.physics.world.removeCollider(collider);
      }
      this.colliders = [];
    }
    this._autoPauseHandler = null;
    this._visibilityHandler = null;
  }

  /**
   * Weighted random enemy type for the current level.
   * @returns {'scout'|'weaver'|'tank'}
   */
  pickEnemyType() {
    return pickWeightedType(LEVELS[this.levelIndex].weights);
  }

  /**
   * Spawn one pooled enemy (delegates to src/systems/spawning.js).
   * @returns {Phaser.GameObjects.GameObject|null}
   */
  spawnEnemy() {
    const enemy = spawnEnemySystem(this);
    if (enemy) this.updateHud();
    return enemy;
  }

  /**
   * Fire player bullet(s) respecting FIRE_DELAY; double-shot fires a pair.
   * @param {number} time Scene elapsed ms (this.elapsed clock).
   */
  firePlayer(time) {
    if (time - this.lastFired < FIRE_DELAY) return;
    this.lastFired = time;
    const double = time < this.doubleShotUntil;
    const mkBullet = (dx) => {
      const b = this.playerBullets.get(this.player.x + dx, this.player.y - 24, double ? 'bullet2' : 'bullet');
      if (!b) return;
      b.enableBody(true, this.player.x + dx, this.player.y - 24, true, true);
      b.setTexture(double ? 'bullet2' : 'bullet');
      b.setVelocity(0, PLAYER_BULLET_SPEED);
      b.setDepth(DEPTHS.playerBullet);
    };
    if (double) {
      mkBullet(-10);
      mkBullet(10);
    } else {
      mkBullet(0);
    }
    Sfx.laser();
  }

  /**
   * Explosion burst + sound.
   * @param {number} x World x.
   * @param {number} y World y.
   * @param {boolean} [big=false] Larger burst + bigger sound.
   */
  explode(x, y, big = false) {
    this.boom.explode(big ? 40 : 16, x, y);
    if (big) Sfx.bigExplosion();
    else Sfx.explosion();
  }

  /**
   * Damage an enemy, flash it white, and handle kill rewards.
   * @param {Phaser.GameObjects.Sprite} enemy Enemy sprite.
   * @param {number} dmg Damage dealt.
   */
  damageEnemy(enemy, dmg) {
    const hp = (enemy.getData('hp') || 1) - dmg;
    enemy.setData('hp', hp);
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (enemy.active) enemy.clearTint();
    });
    if (hp <= 0) {
      const type = enemy.getData('type');
      const stats = ENEMY_STATS[type] || { score: 100 };
      this.score += stats.score;
      this.kills += 1;
      this.explode(enemy.x, enemy.y, type === 'tank');
      enemy.disableBody(true, false);
      enemy.setActive(false).setVisible(false);
      this.maybeDropPowerup(enemy.x, enemy.y);
      this.updateHud();
      this.checkLevelProgress();
    }
  }

  /**
   * Roll for a power-up drop with text+icon label.
   * @param {number} x Drop x.
   * @param {number} y Drop y.
   * @returns {'double'|'shield'|null}
   */
  maybeDropPowerup(x, y) {
    return dropPowerupSystem(this, x, y);
  }

  /** Damage the player unless invulnerable/shielded; handles death. */
  hurtPlayer() {
    const now = this.elapsed;
    if (now < this.invulnUntil || this.gameOver) return;
    if (now < this.shieldUntil) {
      // Shield absorbs the hit.
      this.shieldUntil = 0;
      this.invulnUntil = now + INVULN.afterShieldMs;
      Sfx.hit();
      this.showBanner(`${POWERUP_META.shield.icon} SHIELD DOWN!`);
      this.updateHud();
      return;
    }
    this.lives -= 1;
    this.invulnUntil = now + INVULN.afterHitMs;
    Sfx.hit();
    // ISSUE-8: no shake/flash under reduced-motion.
    if (!REDUCED_MOTION) {
      this.cameras.main.shake(220, 0.012);
      this.cameras.main.flash(120, 255, 60, 60);
    }
    this.explode(this.player.x, this.player.y, false);
    this.updateHud();
    announce(`Hit. ${this.lives <= 0 ? 'No lives left.' : `Lives left ${this.lives}.`}`);
    if (this.lives <= 0) {
      this.doGameOver();
    }
  }

  /** Advance level or trigger the boss when the kill target is met. */
  checkLevelProgress() {
    const level = LEVELS[this.levelIndex];
    if (this.bossActive) return;
    if (this.kills >= level.killsToClear) {
      if (this.levelIndex === 0) {
        this.levelIndex = 1;
        this.kills = 0;
        this.applyLevelConfig();
        Sfx.levelClear();
        track('level_clear', { level: 1, score: this.score });
        this.showBanner('LEVEL 2\nFaster!');
      } else if (this.levelIndex === 1) {
        this.levelIndex = 2;
        this.kills = 0;
        this.applyLevelConfig();
        track('level_clear', { level: 2, score: this.score });
        this.startBoss();
      }
      this.updateHud();
      announceProgress(this);
    }
  }

  /** Re-tint background and reset the spawn timer for the new level. */
  applyLevelConfig() {
    const level = LEVELS[this.levelIndex];
    this.bg.setTint(level.tint);
    if (!this.spawnTimer) return;
    this.spawnTimer.delay = level.spawnDelay;
    this.spawnTimer.reset({
      delay: level.spawnDelay,
      loop: true,
      callback: () => this.spawnEnemy()
    });
  }

  /** Spawn the boss + HP bar + overlaps (delegates to src/systems/boss.js). */
  startBoss() {
    startBossSystem(this);
  }

  /** Refresh boss HP bar scale. */
  updateBossBar() {
    refreshBossBar(this);
  }

  /** Fire one boss fan volley. */
  bossShoot() {
    bossShootSystem(this);
  }

  commitHighScore() {
    try {
      if (this.score > (this.highScore || 0)) {
        this.highScore = this.score;
        persistUpdate({ highScore: this.highScore });
      }
    } catch {
      // quota guard lives in persistence.js
    }
    this.updateHud();
  }

  /** Kill the boss and queue the Win scene. */
  killBoss() {
    killBossSystem(this);
  }

  /** Player death cinematic then GameOver scene. */
  doGameOver() {
    this.gameOver = true;
    this.commitHighScore();
    track('game_over', { score: this.score, level: this.levelIndex + 1 });
    announce(`Game over. Final score ${this.score}.`);
    this.explode(this.player.x, this.player.y, true);
    this.player.setVisible(false);
    this.flame.stop();
    // ISSUE-8: no shake under reduced-motion.
    if (!REDUCED_MOTION) this.cameras.main.shake(350, 0.02);
    this.time.delayedCall(1200, () => {
      this.scene.start('GameOver', { score: this.score, level: this.levelIndex + 1 });
    });
  }

  // ---------- overlap handlers ----------

  /**
   * Player bullet vs enemy.
   * @param {Phaser.GameObjects.Sprite} bullet Bullet sprite.
   * @param {Phaser.GameObjects.Sprite} enemy Enemy sprite.
   */
  onBulletHitsEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active || this.gameOver) return;
    bullet.disableBody(true, true);
    bullet.setActive(false).setVisible(false);
    this.damageEnemy(enemy, 1);
  }

  /**
   * Enemy bullet vs player.
   * @param {Phaser.GameObjects.Sprite} player Player sprite.
   * @param {Phaser.GameObjects.Sprite} bullet Bullet sprite.
   */
  onEnemyBulletHitsPlayer(player, bullet) {
    if (!bullet.active || this.gameOver) return;
    bullet.disableBody(true, true);
    bullet.setActive(false).setVisible(false);
    this.hurtPlayer();
  }

  /**
   * Enemy ram vs player: both take a hit.
   * @param {Phaser.GameObjects.Sprite} player Player sprite.
   * @param {Phaser.GameObjects.Sprite} enemy Enemy sprite.
   */
  onEnemyRamsPlayer(player, enemy) {
    if (!enemy.active || this.gameOver) return;
    this.explode(enemy.x, enemy.y, false);
    enemy.disableBody(true, false);
    enemy.setActive(false).setVisible(false);
    this.hurtPlayer();
  }

  /**
   * Power-up pickup: grants double-shot or shield with text+icon banner.
   * @param {Phaser.GameObjects.Sprite} player Player sprite.
   * @param {Phaser.GameObjects.Sprite} power Power-up sprite.
   */
  onCollectPowerup(player, power) {
    if (!power.active || this.gameOver) return;
    const kind = power.getData('kind');
    clearPowerupLabel(power);
    power.disableBody(true, true);
    power.setActive(false).setVisible(false);
    Sfx.powerup();
    if (kind === 'double') {
      this.doubleShotUntil = this.elapsed + POWERUP.doubleDurationMs;
      this.showBanner(`${POWERUP_META.double.icon} ${POWERUP_META.double.name}!`);
      this.score += POWERUP.pickupScore;
    } else {
      this.shieldUntil = this.elapsed + POWERUP.shieldDurationMs;
      this.showBanner(`${POWERUP_META.shield.icon} ${POWERUP_META.shield.name}!`);
      this.score += POWERUP.pickupScore;
    }
    this.updateHud();
  }

  // ---------- main loop ----------

  /**
   * Per-frame update: scroll, movement, shield blink, autofire, enemy
   * patterns, offscreen cleanup, power-up labels, boss strafe.
   * @param {number} _time Raw clock (unused; this.elapsed is authoritative).
   * @param {number} delta Ms since last frame.
   */
  update(_time, delta) {
    if (this.isPaused) return;
    // ISSUE-8 (overlaps #2): clamp hitch/tab-return spikes to 50ms via shared
    // helper so tunneling is prevented without per-frame alloc.
    const clampedDelta = clampDeltaMs(delta);
    if (this.gameOver) {
      // Death / win cinematic: keep the background drifting, freeze combat.
      const dt0 = clampedDelta / 1000;
      this.bg.tilePositionY -= LEVELS[this.levelIndex].scrollSpeed * dt0;
      this.clouds.tilePositionY -= LEVELS[this.levelIndex].scrollSpeed * 1.6 * dt0;
      return;
    }

    const dt = clampedDelta / 1000;
    this.elapsed += clampedDelta;
    const now = this.elapsed;
    const level = LEVELS[this.levelIndex];

    // --- Background scroll: always drifts (upward flight bias),
    // --- and speeds up while the player pushes UP/W. ---
    const hasKeyboard = !!(this.input && this.input.keyboard && this.cursors && this.keys);
    const upPressed = hasKeyboard && (this.cursors.up.isDown || this.keys.W.isDown);
    const boost = upPressed ? BOOST_SPEED : 0;
    const base = level.scrollSpeed + (this.bossActive ? BOSS_SCROLL_BONUS : 0);
    this.bg.tilePositionY -= (base + boost) * dt;
    this.clouds.tilePositionY -= (base * 1.6 + boost * 1.3) * dt;

    // --- Player movement (keyboard + touch drag, see src/input/touch.js) ---
    let vx = 0;
    let vy = 0;
    if (hasKeyboard) {
      if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
    }
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);
    // Bank/tilt when strafing.
    this.player.setAngle(Phaser.Math.Linear(this.player.angle, vx * 12, 0.25));
    // Touch drag overrides keyboard velocity while a gameplay touch is held.
    if (this.touch) this.touch.applyMovement(this.player, PLAYER_SPEED);

    // Shield ring follows player.
    const shielded = now < this.shieldUntil;
    this.shieldRing.setVisible(shielded);
    if (shielded) {
      this.shieldRing.setPosition(this.player.x, this.player.y);
      this.shieldRing.setAlpha(0.6 + Math.sin(now / 150) * 0.3);
    }
    this.updatePowerupHud(now);

    // Invulnerability blink.
    if (now < this.invulnUntil) {
      this.player.setAlpha(0.35 + Math.abs(Math.sin(now / 90)) * 0.65);
    } else {
      this.player.setAlpha(1);
    }

    // --- Shooting (Space, hold to autofire; touch autofires while touching) ---
    if ((hasKeyboard && (this.cursors.space.isDown || this.keys.SPACE.isDown)) || (this.touch && this.touch.isFiring())) {
      this.firePlayer(now);
    }

    // --- Enemies drift + patterns ---
    // ISSUE-8: indexed loop over cached array (no per-frame iterator alloc).
    const foes = this.enemies.getChildren();
    for (let i = 0; i < foes.length; i++) {
      const enemy = foes[i];
      if (!enemy.active) continue;
      const type = enemy.getData('type');
      let t = (enemy.getData('t') || 0) + dt;
      enemy.setData('t', t);
      if (type === 'weaver') {
        const baseX = enemy.getData('baseX') || W / 2;
        enemy.x = Phaser.Math.Clamp(baseX + Math.sin(t * 3) * 110, 20, W - 20);
      }
      // Tanks shoot downward.
      if (type === 'tank') {
        const last = enemy.getData('lastShot') || 0;
        if (now - last > ENEMY_STATS.tank.fireRate && enemy.y > 0 && enemy.y < H - 200) {
          enemy.setData('lastShot', now);
          const b = this.enemyBullets.get(enemy.x, enemy.y + 20, 'enemyBullet');
          if (b) {
            b.enableBody(true, enemy.x, enemy.y + 20, true, true);
            b.setVelocity(0, TANK_BULLET_SPEED);
            b.setDepth(DEPTHS.enemyBullet);
            Sfx.enemyShoot();
          }
        }
      }
    }

    // Pooled offscreen cleanup (bullets / power-ups + orphan labels / enemies).
    cleanupOffscreen(this);
    // Keep text+icon power-up labels glued to their sprites.
    syncPowerupLabels(this);

    // --- Boss movement: sinusoidal strafe near the top ---
    updateBossMovement(this, now);
  }
}
