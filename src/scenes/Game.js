import Phaser from 'phaser';
import { LEVELS, ENEMY_STATS, BOSS } from '../levels.js';
import { Sfx } from '../sfx.js';
import { track } from '../analytics.js';
import { load, update as persistUpdate } from '../persistence.js';
import { attachTouchControls } from '../input/touch.js';

const W = 480;
const H = 640;
const PLAYER_SPEED = 320;
const FIRE_DELAY = 180;
const POWER_DOUBLE_MS = 10000;
const POWER_SHIELD_MS = 9000;

export default class Game extends Phaser.Scene {
  constructor() {
    super('Game');
  }

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
  }

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
    this.player.setDepth(10);

    // Shield ring (hidden unless shield active)
    this.shieldRing = this.add.circle(0, 0, 30);
    this.shieldRing.setStrokeStyle(3, 0x35e0ff, 0.9);
    this.shieldRing.setVisible(false);
    this.shieldRing.setDepth(11);

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
    this.flame.setDepth(9);

    // --- Groups (pooled) ---
    this.playerBullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 60
    });
    this.enemyBullets = this.physics.add.group({
      defaultKey: 'enemyBullet',
      maxSize: 80
    });
    this.enemies = this.physics.add.group({ maxSize: 30 });
    this.powerups = this.physics.add.group({ maxSize: 10 });

    // Explosion particles (one emitter, explode on demand)
    this.boom = this.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 260 },
      lifespan: { min: 200, max: 500 },
      scale: { start: 1.2, end: 0 },
      tint: [0xffffff, 0xffe14d, 0xff6b2e, 0xff2222],
      emitting: false
    });
    this.boom.setDepth(20);

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
    // and paused-M = Menu (mute suppressed while paused).
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D,P,M,SPACE');
      this.input.keyboard.on('keydown-P', () => this.togglePause());
      this.input.keyboard.on('keydown-ESC', () => this.togglePause());
      this.input.keyboard.on('keydown-M', () => {
        if (this.isPaused) return; // paused M = Menu (overlay handler below)
        this.toggleMuteUi();
      });
    }
    Sfx.installUnlock();
    Sfx.startMusic();

    // --- Touch controls (issue #1, P0): drag-to-move + autofire + buttons ---
    this.touch = attachTouchControls(this);

    // --- HUD ---
    this.scoreText = this.add
      .text(10, 8, 'SCORE 0', {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#ffffff'
      })
      .setDepth(30);
    this.highScoreText = this.add
      .text(10, 30, 'HI 0', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#ffe14d'
      })
      .setDepth(30);
    this.levelText = this.add
      .text(W / 2, 8, LEVELS[0].name, {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#8fd0ff'
      })
      .setOrigin(0.5, 0)
      .setDepth(30);
    this.livesText = this.add
      .text(W - 10, 8, '♥♥♥', {
        fontFamily: 'Courier New',
        fontSize: '18px',
        color: '#ff6b81'
      })
      .setOrigin(1, 0)
      .setDepth(30);
    this.progressText = this.add
      .text(W / 2, 32, '', {
        fontFamily: 'Courier New',
        fontSize: '13px',
        color: '#dff0ff'
      })
      .setOrigin(0.5, 0)
      .setDepth(30);
    this.bannerText = this.add
      .text(W / 2, H / 2 - 40, '', {
        fontFamily: 'Courier New',
        fontSize: '36px',
        color: '#ffe14d',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setAlpha(0);
    this.pauseText = this.add
      .text(W / 2, H / 2, 'PAUSED\nPress P to resume', {
        fontFamily: 'Courier New',
        fontSize: '28px',
        color: '#ffffff',
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setVisible(false);
    this.muteText = this.add
      .text(W - 10, H - 24, Sfx.isMuted() ? 'MUTED (M)' : '', {
        fontFamily: 'Courier New',
        fontSize: '12px',
        color: '#8fa3c7'
      })
      .setOrigin(1, 0)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    this.muteText.on('pointerdown', () => this.toggleMuteUi());
    this.refreshMuteUi();

    // Boss HP bar
    this.bossBarBg = this.add.rectangle(W / 2, 56, 400, 14, 0x330a12).setDepth(30).setVisible(false);
    this.bossBar = this.add.rectangle(W / 2 - 196, 56, 392, 8, 0xff3355).setDepth(31).setOrigin(0, 0.5).setVisible(false);
    this.bossLabel = this.add
      .text(W / 2, 66, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#ff8fa0' })
      .setOrigin(0.5, 0)
      .setDepth(30)
      .setVisible(false);

    // --- Power-up timers HUD (top-left, below score; hidden when inactive) ---
    this.doubleLabel = this.add
      .text(10, 82, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#ffe14d' })
      .setDepth(30)
      .setVisible(false);
    this.doubleBarBg = this.add.rectangle(10, 98, 112, 8, 0x222233, 0.9).setOrigin(0, 0.5).setDepth(30).setVisible(false);
    this.doubleBar = this.add.rectangle(11, 98, 110, 5, 0xffe14d).setOrigin(0, 0.5).setDepth(31).setVisible(false);
    this.shieldLabel = this.add
      .text(10, 108, '', { fontFamily: 'Courier New', fontSize: '12px', color: '#35e0ff' })
      .setDepth(30)
      .setVisible(false);
    this.shieldBarBg = this.add.rectangle(10, 124, 112, 8, 0x222233, 0.9).setOrigin(0, 0.5).setDepth(30).setVisible(false);
    this.shieldBar = this.add.rectangle(11, 124, 110, 5, 0x35e0ff).setOrigin(0, 0.5).setDepth(31).setVisible(false);

    // --- Pause overlay (dim + resume/restart/menu buttons) ---
    this.createPauseOverlay();

    this.showBanner(LEVELS[0].name + '\nShoot everything!');
    this.updateHud();

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

  // ---------- helpers ----------

  showBanner(msg) {
    this.bannerText.setText(msg);
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setAlpha(1).setScale(0.7);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      scale: 1.15,
      duration: 2200,
      ease: 'Cubic.easeOut'
    });
  }

  updateHud() {
    this.scoreText.setText('SCORE ' + this.score);
    if (this.highScoreText) {
      this.highScoreText.setText('HI ' + Math.max(this.highScore || 0, this.score));
    }
    this.livesText.setText('♥'.repeat(Math.max(0, this.lives)) || '—');
    this.levelText.setText(LEVELS[this.levelIndex].name);
    if (this.bossActive) {
      this.progressText.setText('DESTROY THE BOSS!');
    } else {
      const target = LEVELS[this.levelIndex].killsToClear;
      this.progressText.setText(`KILLS ${this.kills}/${target}`);
    }
    if (this.doubleLabel) this.updatePowerupHud(this.elapsed);
  }

  togglePause(force) {
    if (this.gameOver) return;
    const next = typeof force === 'boolean' ? force : !this.isPaused;
    if (next === this.isPaused) return;
    this.setPaused(next);
  }

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
    } else {
      this.physics.world.resume();
      if (this.spawnTimer) this.spawnTimer.paused = false;
      if (this.bossFireTimer) this.bossFireTimer.paused = false;
    }
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
    if (!this.muteText) return;
    this.muteText.setText(Sfx.isMuted() ? '🔇 MUTED (M)' : '🔊 SOUND (M)');
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

  pickEnemyType() {
    const w = LEVELS[this.levelIndex].weights;
    const r = Math.random();
    if (r < w.scout) return 'scout';
    if (r < w.scout + w.weaver) return 'weaver';
    return 'tank';
  }

  spawnEnemy() {
    if (this.isPaused || this.gameOver || this.bossActive) return;
    const type = this.pickEnemyType();
    const stats = ENEMY_STATS[type];
    const level = LEVELS[this.levelIndex];
    const x = Phaser.Math.Between(30, W - 30);
    const enemy = this.enemies.get(x, -40, stats.key);
    if (!enemy) return;
    // Re-enable physics body on pooled reuse (disableBody turns it off).
    enemy.enableBody(true, x, -40, true, true);
    enemy.setTexture(stats.key);
    enemy.setData('type', type);
    enemy.setData('hp', stats.hp);
    enemy.setData('t', Math.random() * 10);
    enemy.setData('baseX', x);
    enemy.setData('lastShot', 0);
    enemy.setVelocity(0, level.enemySpeed * stats.vy + 30);
    enemy.setDepth(5);
    enemy.clearTint();
    this.updateHud();
  }

  firePlayer(time) {
    if (time - this.lastFired < FIRE_DELAY) return;
    this.lastFired = time;
    const double = time < this.doubleShotUntil;
    const mkBullet = (dx) => {
      const b = this.playerBullets.get(this.player.x + dx, this.player.y - 24, double ? 'bullet2' : 'bullet');
      if (!b) return;
      b.enableBody(true, this.player.x + dx, this.player.y - 24, true, true);
      b.setTexture(double ? 'bullet2' : 'bullet');
      b.setVelocity(0, -520);
      b.setDepth(8);
    };
    if (double) {
      mkBullet(-10);
      mkBullet(10);
    } else {
      mkBullet(0);
    }
    Sfx.laser();
  }

  explode(x, y, big = false) {
    this.boom.explode(big ? 40 : 16, x, y);
    if (big) Sfx.bigExplosion();
    else Sfx.explosion();
  }

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

  maybeDropPowerup(x, y) {
    if (Math.random() > 0.12) return;
    const kind = Math.random() < 0.55 ? 'double' : 'shield';
    const p = this.powerups.get(x, y, kind === 'double' ? 'powerDouble' : 'powerShield');
    if (!p) return;
    p.enableBody(true, x, y, true, true);
    p.setTexture(kind === 'double' ? 'powerDouble' : 'powerShield');
    p.setData('kind', kind);
    p.setVelocity(0, 130);
    p.setDepth(6);
  }

  hurtPlayer() {
    const now = this.elapsed;
    if (now < this.invulnUntil || this.gameOver) return;
    if (now < this.shieldUntil) {
      // Shield absorbs the hit.
      this.shieldUntil = 0;
      this.invulnUntil = now + 1000;
      Sfx.hit();
      this.showBanner('SHIELD DOWN!');
      this.updateHud();
      return;
    }
    this.lives -= 1;
    this.invulnUntil = now + 1500;
    Sfx.hit();
    this.cameras.main.shake(220, 0.012);
    this.cameras.main.flash(120, 255, 60, 60);
    this.explode(this.player.x, this.player.y, false);
    this.updateHud();
    if (this.lives <= 0) {
      this.doGameOver();
    }
  }

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
    }
  }

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

  startBoss() {
    this.bossActive = true;
    this.enemies.clear(true, true);
    Sfx.bossWarn();
    this.showBanner('WARNING\nBOSS INCOMING');
    this.bossHp = BOSS.hp;
    const boss = this.physics.add.sprite(W / 2, -80, 'boss');
    boss.setDepth(5);
    boss.setScale(1.4);
    this.boss = boss;
    this.tweens.add({
      targets: boss,
      y: 130,
      duration: 2000,
      ease: 'Sine.easeOut'
    });
    this.bossBarBg.setVisible(true);
    this.bossBar.setVisible(true);
    this.bossLabel.setText('BOSS').setVisible(true);
    this.bossFireTimer = this.time.addEvent({
      delay: BOSS.fireDelay,
      loop: true,
      callback: () => this.bossShoot()
    });
    // Collide player bullets with the boss body directly.
    this.colliders.push(
      this.physics.add.overlap(this.playerBullets, boss, (b) => {
        if (!b.active || this.gameOver) return;
        b.disableBody(true, true);
        b.setActive(false).setVisible(false);
        this.bossHp -= 1;
        this.score += 10;
        boss.setTintFill(0xffffff);
        this.time.delayedCall(50, () => boss.clearTint());
        this.updateBossBar();
        this.updateHud();
        if (this.bossHp <= 0) this.killBoss();
      })
    );
    // Ramming the boss hurts the player.
    this.colliders.push(
      this.physics.add.overlap(this.player, boss, () => this.hurtPlayer())
    );
  }

  updateBossBar() {
    const frac = Math.max(0.0001, this.bossHp / BOSS.hp);
    this.bossBar.setScale(frac, 1);
  }

  bossShoot() {
    if (!this.bossActive || !this.boss || !this.boss.active || this.isPaused || this.gameOver) return;
    const bx = this.boss.x;
    const by = this.boss.y + 40;
    for (let i = 0; i < BOSS.spreadCount; i++) {
      const b = this.enemyBullets.get(bx, by, 'enemyBullet');
      if (!b) continue;
      b.enableBody(true, bx, by, true, true);
      const spread = (i - (BOSS.spreadCount - 1) / 2) * 70;
      b.setVelocity(spread, 240);
      b.setDepth(7);
    }
    Sfx.enemyShoot();
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

  killBoss() {
    this.score += BOSS.score;
    this.commitHighScore();
    track('boss_kill', { score: this.score });
    this.explode(this.boss.x, this.boss.y, true);
    this.cameras.main.shake(400, 0.02);
    if (this.bossFireTimer) {
      this.bossFireTimer.remove();
      this.bossFireTimer = null;
    }
    if (this.boss) this.boss.destroy();
    this.boss = null;
    this.bossActive = false;
    Sfx.win();
    this.time.delayedCall(1200, () => {
      this.scene.start('Win', { score: this.score });
    });
    this.gameOver = true; // freeze further damage/spawns during death cinematic
  }

  doGameOver() {
    this.gameOver = true;
    this.commitHighScore();
    track('game_over', { score: this.score, level: this.levelIndex + 1 });
    this.explode(this.player.x, this.player.y, true);
    this.player.setVisible(false);
    this.flame.stop();
    this.cameras.main.shake(350, 0.02);
    this.time.delayedCall(1200, () => {
      this.scene.start('GameOver', { score: this.score, level: this.levelIndex + 1 });
    });
  }

  // ---------- overlap handlers ----------

  onBulletHitsEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active || this.gameOver) return;
    bullet.disableBody(true, true);
    bullet.setActive(false).setVisible(false);
    this.damageEnemy(enemy, 1);
  }

  onEnemyBulletHitsPlayer(player, bullet) {
    if (!bullet.active || this.gameOver) return;
    bullet.disableBody(true, true);
    bullet.setActive(false).setVisible(false);
    this.hurtPlayer();
  }

  onEnemyRamsPlayer(player, enemy) {
    if (!enemy.active || this.gameOver) return;
    this.explode(enemy.x, enemy.y, false);
    enemy.disableBody(true, false);
    enemy.setActive(false).setVisible(false);
    this.hurtPlayer();
  }

  onCollectPowerup(player, power) {
    if (!power.active || this.gameOver) return;
    const kind = power.getData('kind');
    power.disableBody(true, true);
    power.setActive(false).setVisible(false);
    Sfx.powerup();
    if (kind === 'double') {
      this.doubleShotUntil = this.elapsed + POWER_DOUBLE_MS;
      this.showBanner('DOUBLE SHOT!');
      this.score += 50;
    } else {
      this.shieldUntil = this.elapsed + POWER_SHIELD_MS;
      this.showBanner('SHIELD!');
      this.score += 50;
    }
    this.updateHud();
  }

  // ---------- main loop ----------

  update(time, delta) {
    if (this.isPaused) return;
    // Clamp delta to 50ms so tab-return spikes can't tunnel through colliders.
    const clampedDelta = Math.min(delta, 50);
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
    const boost = upPressed ? 230 : 0;
    const base = level.scrollSpeed + (this.bossActive ? 30 : 0);
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
    for (const enemy of this.enemies.getChildren()) {
      if (!enemy.active) continue;
      const type = enemy.getData('type');
      let t = (enemy.getData('t') || 0) + dt;
      enemy.setData('t', t);
      if (type === 'weaver') {
        const baseX = enemy.getData('baseX') || W / 2;
        enemy.x = Phaser.Math.Clamp(baseX + Math.sin(t * 3) * 110, 20, W - 20);
      }
      if (enemy.y > H + 60) {
        enemy.disableBody(true, false);
        enemy.setActive(false).setVisible(false);
      }
      // Tanks shoot downward.
      if (type === 'tank') {
        const last = enemy.getData('lastShot') || 0;
        if (now - last > ENEMY_STATS.tank.fireRate && enemy.y > 0 && enemy.y < H - 200) {
          enemy.setData('lastShot', now);
          const b = this.enemyBullets.get(enemy.x, enemy.y + 20, 'enemyBullet');
          if (b) {
            b.enableBody(true, enemy.x, enemy.y + 20, true, true);
            b.setVelocity(0, 260);
            b.setDepth(7);
            Sfx.enemyShoot();
          }
        }
      }
    }

    // Cleanup offscreen bullets.
    for (const b of this.playerBullets.getChildren()) {
      if (b.active && b.y < -30) {
        b.disableBody(true, true);
        b.setActive(false).setVisible(false);
      }
    }
    for (const b of this.enemyBullets.getChildren()) {
      if (b.active && (b.y > H + 30 || b.x < -30 || b.x > W + 30)) {
        b.disableBody(true, true);
        b.setActive(false).setVisible(false);
      }
    }
    for (const p of this.powerups.getChildren()) {
      if (p.active && p.y > H + 30) {
        p.disableBody(true, true);
        p.setActive(false).setVisible(false);
      }
    }

    // --- Boss movement: sinusoidal strafe near the top ---
    if (this.bossActive && this.boss && this.boss.active) {
      this.boss.x = W / 2 + Math.sin(now / 700) * 150;
      if (this.boss.y < 130 && this.boss.body) {
        this.boss.setVelocityY(40);
      } else if (this.boss.body) {
        this.boss.setVelocity(0, 0);
      }
    }
  }
}
