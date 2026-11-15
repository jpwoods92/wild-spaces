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
 * Keeps Level 1 food genuinely scarce (~28% per candidate node) and scales
 * scarcity progressively on higher levels down to a 12% floor.
 */
export function getFoodScarcityProfile(level: number): FoodScarcityProfile {
  const safeLevel = Math.max(1, Math.floor(level));
  const lvlOffset = safeLevel - 1;

  // Starts scarce on Level 1 (28%) and drops by 3.5% per level down to a 12% floor
  const foodSpawnChance = Number(
    clamp(0.28 - lvlOffset * 0.035, 0.12, 0.28).toFixed(3)
  );

  // Guaranteed pity threshold grows from every 8 candidate nodes on Level 1 up to 13
  const pityIntervalNodes = Math.min(13, 8 + lvlOffset);

  // Radial band spacing widens from 560px on Level 1 up to 800px
  const bandSpacingPx = Math.min(800, 560 + lvlOffset * 60);

  // Lateral/circumferential arc spacing widens from 980px on Level 1 up to 1260px
  const sectorArcSpacingPx = Math.min(1260, 980 + lvlOffset * 70);

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
