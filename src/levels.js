// Level tuning: kill targets, spawn pacing, enemy speed, scroll speed.

export const LEVELS = [
  {
    name: 'LEVEL 1',
    killsToClear: 12,
    spawnDelay: 1100,
    enemySpeed: 110,
    scrollSpeed: 90,
    tint: 0xffffff,
    weights: { scout: 0.6, weaver: 0.3, tank: 0.1 }
  },
  {
    name: 'LEVEL 2',
    killsToClear: 16,
    spawnDelay: 750,
    enemySpeed: 160,
    scrollSpeed: 140,
    tint: 0xd8ecff,
    weights: { scout: 0.4, weaver: 0.35, tank: 0.25 }
  },
  {
    name: 'LEVEL 3 — BOSS',
    killsToClear: 0, // boss instead of kill target
    spawnDelay: 900,
    enemySpeed: 170,
    scrollSpeed: 170,
    tint: 0xffd9d9,
    weights: { scout: 0.45, weaver: 0.3, tank: 0.25 }
  }
];

export const ENEMY_STATS = {
  scout: { key: 'enemy1', hp: 1, score: 100, vy: 1.0, fireRate: 0 },
  weaver: { key: 'enemy2', hp: 2, score: 200, vy: 0.85, fireRate: 0 },
  tank: { key: 'enemy3', hp: 3, score: 300, vy: 0.6, fireRate: 2200 }
};

export const BOSS = {
  hp: 60,
  score: 2000,
  fireDelay: 1100,
  spreadCount: 5
};
