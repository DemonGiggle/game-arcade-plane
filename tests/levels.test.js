import { describe, it, expect } from 'vitest';
import { LEVELS, ENEMY_STATS, BOSS } from '../src/levels.js';

// Mirrors Game.js updateBossBar(): `Math.max(0.0001, this.bossHp / BOSS.hp)`
// Kept as a pure helper here so the test does not need Phaser or Game.js.
function bossBarFrac(bossHp) {
  return Math.max(0.0001, bossHp / BOSS.hp);
}

describe('levels.js tuning', () => {
  it('defines 3 levels with kill targets and pacing', () => {
    expect(LEVELS).toHaveLength(3);
    expect(LEVELS[0]).toMatchObject({ name: 'LEVEL 1', killsToClear: 12 });
    expect(LEVELS[1].killsToClear).toBe(16);
    // Boss level uses killsToClear: 0 (boss instead of kill target).
    expect(LEVELS[2].killsToClear).toBe(0);

    for (const level of LEVELS) {
      expect(level.spawnDelay).toBeGreaterThan(0);
      expect(level.enemySpeed).toBeGreaterThan(0);
      expect(level.scrollSpeed).toBeGreaterThan(0);
      const total = level.weights.scout + level.weights.weaver + level.weights.tank;
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it('defines enemy stats with hp/score', () => {
    expect(Object.keys(ENEMY_STATS)).toEqual(['scout', 'weaver', 'tank']);
    expect(ENEMY_STATS.scout.hp).toBe(1);
    expect(ENEMY_STATS.tank.hp).toBe(3);
    for (const stats of Object.values(ENEMY_STATS)) {
      expect(stats.score).toBeGreaterThan(0);
    }
  });

  it('defines boss tuning', () => {
    expect(BOSS.hp).toBeGreaterThan(0);
    expect(BOSS.score).toBe(2000);
    expect(BOSS.fireDelay).toBeGreaterThan(0);
    expect(BOSS.spreadCount).toBeGreaterThan(0);
  });
});

describe('boss HP bar fraction', () => {
  it('is 1 at full HP', () => {
    expect(bossBarFrac(BOSS.hp)).toBeCloseTo(1, 5);
  });

  it('halves at half HP', () => {
    expect(bossBarFrac(BOSS.hp / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps to a small positive value at 0 HP (bar never fully disappears)', () => {
    expect(bossBarFrac(0)).toBe(0.0001);
  });

  it('clamps negative HP the same way', () => {
    expect(bossBarFrac(-5)).toBe(0.0001);
  });
});
