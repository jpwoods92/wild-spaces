import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFoodScarcityProfile,
  shouldSpawnFoodAtNode,
} from '../utils/FoodScarcitySchedule.ts';

describe('FoodScarcitySchedule shared utility', () => {
  it('starts at a balanced 46% spawn chance on Level 1 (5-node pity interval, 440px ring spacing)', () => {
    const lvl1 = getFoodScarcityProfile(1);
    assert.equal(lvl1.foodSpawnChance, 0.46);
    assert.equal(lvl1.pityIntervalNodes, 5);
    assert.equal(lvl1.bandSpacingPx, 440);
    assert.equal(lvl1.sectorArcSpacingPx, 720);
  });

  it('scales food scarcity progressively across levels and clamps at the higher 24% floor', () => {
    const lvl2 = getFoodScarcityProfile(2);
    const lvl3 = getFoodScarcityProfile(3);
    const lvl8 = getFoodScarcityProfile(8);

    assert.ok(lvl2.foodSpawnChance < 0.46);
    assert.ok(lvl3.foodSpawnChance < lvl2.foodSpawnChance);
    assert.equal(lvl8.foodSpawnChance, 0.24);
    assert.equal(lvl8.pityIntervalNodes, 8);
    assert.equal(lvl8.bandSpacingPx, 640);
    assert.equal(lvl8.sectorArcSpacingPx, 920);
  });

  it('evaluates shouldSpawnFoodAtNode using deterministic roll and pity threshold', () => {
    // Roll below 0.46 on Level 1 -> spawns food
    assert.equal(shouldSpawnFoodAtNode(1, 1, 0.35), true);
    // Roll above 0.46 on Level 1 before pity threshold -> does not spawn food
    assert.equal(shouldSpawnFoodAtNode(1, 3, 0.65), false);
    // Reaching pity threshold (5 on Level 1) -> guaranteed food spawn even with high roll
    assert.equal(shouldSpawnFoodAtNode(1, 5, 0.99), true);
  });
});
