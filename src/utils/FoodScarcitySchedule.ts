import { clamp } from '../systems/EpisodeUIManager.ts';

export interface FoodScarcityProfile {
  /** Probability (0..1) that a candidate habitat node spawns food/prey */
  foodSpawnChance: number;
  /** Maximum consecutive empty nodes before a guaranteed food spawn */
  pityIntervalNodes: number;
  /** Radial spacing (px) between foraging bands/rings in open-world episodes */
  bandSpacingPx: number;
  /** Arc/lateral spacing (px) between candidate nodes within a band */
  sectorArcSpacingPx: number;
}

/**
 * Shared food/prey scarcity curve used across all Wild Spaces episodes.
 * Starts at a balanced 46% spawn chance per candidate node on Level 1 and scales
 * down progressively on higher levels to a 24% minimum floor.
 */
export function getFoodScarcityProfile(level: number): FoodScarcityProfile {
  const safeLevel = Math.max(1, Math.floor(level));
  const lvlOffset = safeLevel - 1;

  // Starts at 46% on Level 1 and drops by 4% per level down to a 24% floor
  const foodSpawnChance = Number(
    clamp(0.46 - lvlOffset * 0.04, 0.24, 0.46).toFixed(3)
  );

  // Guaranteed pity threshold grows from every 5 candidate nodes on Level 1 up to 8
  const pityIntervalNodes = Math.min(8, 5 + Math.floor(lvlOffset * 0.75));

  // Radial band spacing starts at 440px on Level 1 up to 640px
  const bandSpacingPx = Math.min(640, 440 + lvlOffset * 45);

  // Lateral/circumferential arc spacing starts at 720px on Level 1 up to 920px
  const sectorArcSpacingPx = Math.min(920, 720 + lvlOffset * 45);

  return {
    foodSpawnChance,
    pityIntervalNodes,
    bandSpacingPx,
    sectorArcSpacingPx,
  };
}

/**
 * Shared decision helper determining whether a candidate node should spawn food/prey,
 * combining the level's `foodSpawnChance` with the pity counter.
 */
export function shouldSpawnFoodAtNode(
  level: number,
  nodesSinceLastFood: number,
  randomRoll = Math.random()
): boolean {
  const { foodSpawnChance, pityIntervalNodes } = getFoodScarcityProfile(level);
  if (nodesSinceLastFood >= pityIntervalNodes) {
    return true;
  }
  return randomRoll < foodSpawnChance;
}
