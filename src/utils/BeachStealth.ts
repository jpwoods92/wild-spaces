import { clamp } from '../systems/EpisodeUIManager.ts';

export interface LightPool {
  x: number;
  y: number;
  radius: number;
  strength: number;
  sourceX: number;
  sourceY: number;
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
