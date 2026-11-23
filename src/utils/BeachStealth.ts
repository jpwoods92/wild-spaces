import { clamp } from '../systems/EpisodeUIManager.ts';

export interface LightPool {
  x: number;
  y: number;
  radius: number;
  strength: number;
  sourceX: number;
  sourceY: number;
}

export interface SweepingSpotlight {
  baseX: number;
  baseY: number;
  ampX: number;
  ampY: number;
  speedX: number;
  speedY: number;
  phase: number;
}

export interface ShadeZone {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

export interface LightPullResult {
  pullX: number;
  pullY: number;
  glare: number;
}

const MAX_LIGHT_PULL_SPEED = 115;

/** Computes the 2D beach coordinates of a moving coastal spotlight at `timeSec`. */
export function computeSpotlightPosition(
  spot: SweepingSpotlight,
  timeSec: number
): { x: number; y: number } {
  return {
    x: spot.baseX + Math.sin(timeSec * spot.speedX + spot.phase) * spot.ampX,
    y:
      spot.baseY +
      Math.cos(timeSec * spot.speedY + spot.phase * 1.3) * spot.ampY,
  };
}

/** Returns true when `(x, y)` lies inside any elliptical driftwood/dune shade zone. */
export function isPointInShade(
  x: number,
  y: number,
  shades: readonly ShadeZone[]
): boolean {
  for (const s of shades) {
    if (s.radiusX <= 0 || s.radiusY <= 0) continue;
    const nx = (x - s.x) / s.radiusX;
    const ny = (y - s.y) / s.radiusY;
    if (nx * nx + ny * ny <= 1) {
      return true;
    }
  }
  return false;
}

/**
 * Computes net artificial light-pollution pull vector and peak glare intensity (0..1)
 * acting on an exposed hatchling. Returns zero pull/glare when burrowed or shaded.
 */
export function computeLightPollutionPull(
  x: number,
  y: number,
  lights: readonly LightPool[],
  blocked: boolean
): LightPullResult {
  if (blocked) {
    return { pullX: 0, pullY: 0, glare: 0 };
  }

  let pullX = 0;
  let pullY = 0;
  let glare = 0;

  for (const light of lights) {
    if (light.radius <= 0) continue;
    const dist = Math.hypot(x - light.x, y - light.y);
    if (dist >= light.radius) continue;

    const f = clamp(1 - dist / light.radius, 0, 1);
    glare = Math.max(glare, f);

    const dx = light.sourceX - x;
    const dy = light.sourceY - y;
    const srcDist = Math.hypot(dx, dy);
    if (srcDist < 1e-4) continue;

    pullX += (dx / srcDist) * light.strength * f;
    pullY += (dy / srcDist) * light.strength * f;
  }

  const mag = Math.hypot(pullX, pullY);
  if (mag > MAX_LIGHT_PULL_SPEED) {
    const scale = MAX_LIGHT_PULL_SPEED / mag;
    pullX *= scale;
    pullY *= scale;
  }

  return { pullX, pullY, glare };
}

/**
 * Updates flash-blindness duration caused by stepping exposed into a coastal spotlight.
 * Stepping into bright glare sets/refreshes blindness for ~2.8-4.0s; otherwise decays cleanly.
 */
export function updateBlindnessTimer(
  currentTimer: number,
  glare: number,
  isBurrowed: boolean,
  inShade: boolean,
  dt: number
): number {
  const safeDt = Math.max(0, dt);
  if (!isBurrowed && !inShade && glare > 0.22) {
    const triggered = 2.6 + clamp(glare, 0, 1) * 1.4;
    return Math.max(currentTimer, triggered);
  }
  return Math.max(0, currentTimer - safeDt);
}

/**
 * Alpha multiplier (0..1) for rendering birds, crabs, and strike rings under spotlight blindness.
 * Predators are completely invisible until the final `fadeWindow` seconds of recovery.
 */
export function getPredatorVisibilityAlpha(
  blindnessTimer: number,
  fadeWindow = 0.85
): number {
  if (blindnessTimer <= 0) return 1;
  if (fadeWindow <= 0 || blindnessTimer >= fadeWindow) return 0;
  return clamp(1 - blindnessTimer / fadeWindow, 0, 1);
}

/** Recovers hatchling stamina while safely burrowed in sand, capped at `maxStamina`. */
export function recoverBurrowedStamina(
  stamina: number,
  maxStamina: number,
  dt: number,
  recoveryRate = 18
): number {
  const safeMax = Math.max(0, maxStamina);
  return Math.min(safeMax, Math.max(0, stamina) + recoveryRate * Math.max(0, dt));
}

/** Steep predator scaling across levels so higher difficulties swarm with crabs and seabirds. */
export function computeTurtlePredatorCounts(level: number): {
  crabCount: number;
  birdCount: number;
} {
  const safeLevel = Math.max(1, Math.floor(level));
  return {
    crabCount: Math.min(48, 6 + (safeLevel - 1) * 6),
    birdCount: Math.min(28, 3 + (safeLevel - 1) * 4),
  };
}

/** Effective seabird detection radius expanded by light glare, or 0 while concealed. */
export function computeBirdDetectRadius(
  baseRadius: number,
  glare: number,
  isBurrowed: boolean,
  inShade: boolean
): number {
  if (isBurrowed || inShade) return 0;
  return baseRadius + clamp(glare, 0, 1) * 140;
}

/** True only if the hatchling is exposed and inside the seabird dive strike radius. */
export function doesBirdDiveHit(
  turtleX: number,
  turtleY: number,
  strikeX: number,
  strikeY: number,
  strikeRadius: number,
  isBurrowed: boolean,
  inShade: boolean
): boolean {
  if (isBurrowed || inShade) return false;
  return Math.hypot(turtleX - strikeX, turtleY - strikeY) <= strikeRadius;
}
