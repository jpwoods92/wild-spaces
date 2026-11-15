import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearLeaderboardStorage,
  formatDuration,
  formatHudClock,
  getAllEpisodeBestByLevel,
  getLeaderboardEntries,
  recordLevelCompletion,
} from '../utils/LeaderboardStore.ts';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

describe('LeaderboardStore shared utilities', () => {
  beforeEach(() => {
    clearLeaderboardStorage();
  });

  describe('formatDuration', () => {
    it('formats durations under 60 seconds with two decimals and "s" suffix', () => {
      assert.equal(formatDuration(0), '0.00s');
      assert.equal(formatDuration(9.456), '9.46s');
      assert.equal(formatDuration(42.1), '42.10s');
    });

    it('formats durations of 60+ seconds as M:SS.dd with leading zero on seconds < 10', () => {
      assert.equal(formatDuration(60), '1:00.00');
      assert.equal(formatDuration(65.4), '1:05.40');
      assert.equal(formatDuration(135.789), '2:15.79');
    });

    it('clamps negative inputs to 0.00s', () => {
      assert.equal(formatDuration(-12.5), '0.00s');
    });
  });

  describe('formatHudClock', () => {
    it('formats live HUD clock as MM:SS.d with zero-padded minutes and seconds', () => {
      assert.equal(formatHudClock(0), '00:00.0');
      assert.equal(formatHudClock(7.24), '00:07.2');
      assert.equal(formatHudClock(64.89), '01:04.9');
      assert.equal(formatHudClock(612.3), '10:12.3');
    });

    it('clamps negative values to 00:00.0', () => {
      assert.equal(formatHudClock(-5), '00:00.0');
    });
  });

  describe('recordLevelCompletion & leaderboard queries', () => {
    it('records first completion as a new personal best at rank #1', () => {
      const result = recordLevelCompletion({
        episodeId: 'PolarBearScene',
        level: 1,
        levelTimeSeconds: 48.25,
        totalTimeSeconds: 48.25,
        totalMeters: 1000,
      });

      assert.equal(result.isNewBest, true);
      assert.equal(result.rank, 1);
      assert.equal(result.entries.length, 1);
      assert.equal(result.entries[0].levelTimeSeconds, 48.25);
    });

    it('sorts runs ascending by completion time and caps each level bucket at 5 entries', () => {
      const times = [55.0, 42.5, 61.2, 39.8, 50.1, 47.3];
      for (const t of times) {
        recordLevelCompletion({
          episodeId: 'WhaleScene',
          level: 1,
          levelTimeSeconds: t,
          totalTimeSeconds: t,
          totalMeters: 1000,
        });
      }

      const topEntries = getLeaderboardEntries('WhaleScene', 1);
      assert.equal(topEntries.length, 5);
      assert.deepEqual(
        topEntries.map((e) => e.levelTimeSeconds),
        [39.8, 42.5, 47.3, 50.1, 55.0]
      );
    });

    it('flags isNewBest only when beating the fastest existing time for that episode and level', () => {
      const first = recordLevelCompletion({
        episodeId: 'PolarBearScene',
        level: 2,
        levelTimeSeconds: 50.0,
        totalTimeSeconds: 100.0,
        totalMeters: 2300,
      });
      assert.equal(first.isNewBest, true);

      const slower = recordLevelCompletion({
        episodeId: 'PolarBearScene',
        level: 2,
        levelTimeSeconds: 54.2,
        totalTimeSeconds: 104.2,
        totalMeters: 2300,
      });
      assert.equal(slower.isNewBest, false);
      assert.equal(slower.rank, 2);

      const faster = recordLevelCompletion({
        episodeId: 'PolarBearScene',
        level: 2,
        levelTimeSeconds: 46.9,
        totalTimeSeconds: 96.9,
        totalMeters: 2300,
      });
      assert.equal(faster.isNewBest, true);
      assert.equal(faster.rank, 1);
    });

    it('returns the fastest run per level in ascending level order via getAllEpisodeBestByLevel', () => {
      recordLevelCompletion({
        episodeId: 'WhaleScene',
        level: 2,
        levelTimeSeconds: 72.4,
        totalTimeSeconds: 130.0,
        totalMeters: 2300,
      });
      recordLevelCompletion({
        episodeId: 'WhaleScene',
        level: 1,
        levelTimeSeconds: 51.2,
        totalTimeSeconds: 51.2,
        totalMeters: 1000,
      });
      recordLevelCompletion({
        episodeId: 'WhaleScene',
        level: 1,
        levelTimeSeconds: 44.8,
        totalTimeSeconds: 44.8,
        totalMeters: 1000,
      });
      recordLevelCompletion({
        episodeId: 'PolarBearScene',
        level: 1,
        levelTimeSeconds: 35.0,
        totalTimeSeconds: 35.0,
        totalMeters: 1000,
      });

      const whaleBests = getAllEpisodeBestByLevel('WhaleScene');
      assert.equal(whaleBests.length, 2);
      assert.equal(whaleBests[0].level, 1);
      assert.equal(whaleBests[0].levelTimeSeconds, 44.8);
      assert.equal(whaleBests[1].level, 2);
      assert.equal(whaleBests[1].levelTimeSeconds, 72.4);
    });
  });
});
