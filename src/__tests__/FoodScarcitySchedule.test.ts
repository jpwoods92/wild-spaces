import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFoodScarcityProfile,
  shouldSpawnFoodAtNode,
} from '../utils/FoodScarcitySchedule.ts';

describe('FoodScarcitySchedule shared utility', () => {
  it('starts scarce on Level 1 (28% spawn chance, 8-node pity interval, 560px ring spacing)', () => {
    const lvl1 = getFoodScarcityProfile(1);
    assert.equal(lvl1.foodSpawnChance, 0.28);
    assert.equal(lvl1.pityIntervalNodes, 8);
    assert.equal(lvl1.bandSpacingPx, 560);
    assert.equal(lvl1.sectorArcSpacingPx, 980);
  });

  it('scales food scarcity progressively across levels and clamps at the 12% floor', () => {
    const lvl2 = getFoodScarcityProfile(2);
    const lvl3 = getFoodScarcityProfile(3);
    const lvl8 = getFoodScarcityProfile(8);

    assert.ok(lvl2.foodSpawnChance < 0.28);
    assert.ok(lvl3.foodSpawnChance < lvl2.foodSpawnChance);
    assert.equal(lvl8.foodSpawnChance, 0.12);
    assert.equal(lvl8.pityIntervalNodes, 13);
    assert.equal(lvl8.bandSpacingPx, 800);
    assert.equal(lvl8.sectorArcSpacingPx, 1260);
  });

  it('evaluates shouldSpawnFoodAtNode using deterministic roll and pity threshold', () => {
    // Roll below 0.28 on Level 1 -> spawns food
    assert.equal(shouldSpawnFoodAtNode(1, 1, 0.15), true);
    // Roll above 0.28 on Level 1 before pity threshold -> does not spawn food
    assert.equal(shouldSpawnFoodAtNode(1, 3, 0.55), false);
    // Reaching pity threshold (8 on Level 1) -> guaranteed food spawn even with high roll
    assert.equal(shouldSpawnFoodAtNode(1, 8, 0.99), true);
  });
});
