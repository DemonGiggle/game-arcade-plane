/**
 * Central game tuning + accessibility constants (issue #11).
 *
 * Goal: eliminate magic numbers scattered in `Game.js` / `main.js` so
 * gameplay pacing, HUD sizing, and a11y strings live in one documented place.
 * Level/enemy/boss numbers stay in `levels.js`; this file holds
 * cross-cutting constants plus the shared Phaser boot config (which keeps
 * main's P1 perf flags, VisibilityHandler wiring, and scale tuning).
 *
 * Rebased on top of main (touch #1, auto-pause #2, persistence #4, audio #5,
 * pause-menu #6, SEO #9, perf #8): all gameplay values below match main's
 * current Game.js so the extraction is behavior-preserving.
 *
 * @module config
 */

import Phaser from 'phaser';

/** Logical canvas width (matches Phaser FIT scale width). */
export const GAME_W = 480;
/** Logical canvas height (matches Phaser FIT scale height). */
export const GAME_H = 640;

/** Player movement speed in px/s. */
export const PLAYER_SPEED = 320;
/** Minimum ms between player shots (autofire hold). */
export const FIRE_DELAY = 180;
/** Player bullet vertical velocity (px/s, negative = up). */
export const PLAYER_BULLET_SPEED = -520;
/** Tank enemy bullet vertical velocity (px/s). */
export const TANK_BULLET_SPEED = 260;
/** Boss bullet base vertical velocity (px/s). */
export const BOSS_BULLET_SPEED_Y = 240;
/** Boss spread step in px/s between fan shots. */
export const BOSS_SPREAD_STEP = 70;
/** Upward background boost while holding UP/W. */
export const BOOST_SPEED = 230;
/** Extra scroll speed added during boss fight. */
export const BOSS_SCROLL_BONUS = 30;

/** Physics group pool caps. */
export const POOL_SIZES = Object.freeze({
  playerBullets: 60,
  enemyBullets: 80,
  enemies: 30,
  powerups: 10,
});

/** Power-up tuning (durations kept as MS aliases for main compat). */
export const POWERUP = Object.freeze({
  /** Drop chance per enemy kill (0-1). */
  dropChance: 0.12,
  /** Probability the drop is double-shot (else shield). */
  doubleWeight: 0.55,
  /** Fall speed in px/s. */
  fallSpeed: 130,
  /** Double-shot duration in ms. */
  doubleDurationMs: 10000,
  /** Shield duration in ms. */
  shieldDurationMs: 9000,
  /** Score bonus on pickup. */
  pickupScore: 50,
});

/** Legacy aliases matching main's Game.js names (same values as POWERUP). */
export const POWER_DOUBLE_MS = POWERUP.doubleDurationMs;
export const POWER_SHIELD_MS = POWERUP.shieldDurationMs;

/** Bomb (ultimate) tuning: ENTER / right-click clears the screen. */
export const BOMB = Object.freeze({
  /** Bombs granted at run start. */
  start: 2,
  /** Max bombs held; level-clear refills +1 up to this cap. */
  max: 3,
  /** Damage dealt to the boss (regular enemies die outright). */
  bossDamage: 20,
  /** Minimum ms between bombs (also blocks held-ENTER key repeat). */
  cooldownMs: 800,
});

/** Invulnerability windows in ms. */
export const INVULN = Object.freeze({
  /** Brief grace after shield absorbs a hit. */
  afterShieldMs: 1000,
  /** Grace after taking a hull hit. */
  afterHitMs: 1500,
});

/** Render depths for Game scene layers. */
export const DEPTHS = Object.freeze({
  enemy: 5,
  powerup: 6,
  powerupLabel: 7,
  enemyBullet: 7,
  playerBullet: 8,
  flame: 9,
  player: 10,
  shieldRing: 11,
  explosion: 20,
  hud: 30,
  bossBar: 31,
  banner: 40,
  pause: 50,
});

/** Canvas text colors (checked for contrast on dark ocean bg). */
export const COLORS = Object.freeze({
  hudScore: '#ffffff',
  hudHighScore: '#ffe14d',
  hudLevel: '#8fd0ff',
  hudLives: '#ff8fa0',
  hudProgress: '#eaf6ff',
  banner: '#ffe14d',
  bossLabel: '#ff8fa0',
  mute: '#8fa3c7',
  powerupDouble: '#ffe14d',
  powerupShield: '#35e0ff',
  hudBomb: '#ffd166',
});

/** Canvas font family (monospace stack for arcade feel + readability). */
export const HUD_FONT = 'Courier New, monospace';

/**
 * HUD font sizes in px at 1x scale.
 * Large-HUD mode multiplies these.
 */
export const HUD_SIZES = Object.freeze({
  score: 18,
  highScore: 13,
  level: 18,
  lives: 18,
  progress: 13,
  banner: 36,
  pause: 28,
  mute: 12,
  bossLabel: 12,
  powerupStatus: 12,
  powerupLabel: 11,
  bomb: 13,
});

/** Scale factor applied when the larger-HUD option is on. */
export const HUD_LARGE_MULTIPLIER = 1.35;

/** localStorage key for the larger-HUD preference. */
export const STORAGE_KEYS = Object.freeze({
  largeHud: 'wt-arcade:large-hud',
});

/**
 * Text+icon labels for power-ups (never color-only).
 * Icons are canvas emoji/symbols paired with a short text code.
 */
export const POWERUP_META = Object.freeze({
  double: Object.freeze({
    texture: 'powerDouble',
    /** Short code drawn above the sprite. */
    code: '2X',
    /** Icon + text shown in HUD/banner/live region. */
    icon: '✚',
    name: 'DOUBLE SHOT',
  }),
  shield: Object.freeze({
    texture: 'powerShield',
    code: 'SH',
    icon: '◈',
    name: 'SHIELD',
  }),
});

/**
 * Format lives as text + icons (never emoji-only) for screen readers
 * and low-vision players. Example: `LIVES 2 ♥♥`.
 *
 * @param {number} lives Remaining lives (may be 0).
 * @returns {string} Accessible lives string.
 */
export function formatLives(lives) {
  const n = Math.max(0, Math.floor(lives || 0));
  if (n <= 0) return 'LIVES 0 —';
  return `LIVES ${n} ${'♥'.repeat(n)}`;
}

/**
 * Read the larger-HUD preference. Safe when localStorage is unavailable.
 *
 * @returns {boolean} True when larger HUD was previously enabled.
 */
export function isLargeHudEnabled() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(STORAGE_KEYS.largeHud) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist the larger-HUD preference. Safe when localStorage is unavailable.
 *
 * @param {boolean} enabled Whether larger HUD should be on.
 * @returns {void}
 */
export function setLargeHudEnabled(enabled) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEYS.largeHud, enabled ? '1' : '0');
  } catch {
    /* storage unavailable (private mode) — HUD still toggles for session */
  }
}

/**
 * Shared Phaser boot config (keeps main's P1 perf flags, VisibilityHandler
 * wiring for auto-pause #2, and scale tuning for touch #1).
 *
 * @param {Array<Function|object>} scenes Scene classes in boot order.
 * @returns {object} Phaser.Game configuration object.
 */
export function createPhaserConfig(scenes) {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#071a3a',
    pixelArt: true,
    // Keep Phaser's VisibilityHandler enabled so game.events emits
    // 'hidden'/'blur' — Game scene uses them for auto-pause (issue #2).
    disableVisibilityChange: false,
    // ISSUE-8 (P1 perf): cap step cost, smooth micro-hitches, cheaper canvas path.
    fps: {
      target: 60,
      smoothStep: true,
    },
    render: {
      antialias: false,
      roundPixels: true,
      powerPreference: 'high-performance',
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      autoRound: true,
      fullscreenTarget: 'game',
      disableContextMenu: true,
    },
    scene: scenes,
  };
}
