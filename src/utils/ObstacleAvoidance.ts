import { clamp } from '../systems/EpisodeUIManager.ts';

export interface CircleObstacle {
  x: number;
  y: number;
  /** Minimum solid collision radius around obstacle center (e.g. trunkRadius + entityRadius) */
  radius: number;
}

export interface ObstacleSteerResult {
  x: number;
  y: number;
  actualVx: number;
  actualVy: number;
}

/**
 * Steers an agent around circular obstacles (such as tree trunks) using tangential
 * deflection and hard radius separation so the agent smoothly walks around trunks
 * rather than clipping through them.
 */
export function resolveCircleObstacleMovement(
  x: number,
  y: number,
  desiredVx: number,
  desiredVy: number,
  dt: number,
  obstacles: readonly CircleObstacle[]
): ObstacleSteerResult {
  const speed = Math.hypot(desiredVx, desiredVy);
  let steerVx = desiredVx;
  let steerVy = desiredVy;

  if (speed > 1e-4) {
    const dirX = desiredVx / speed;
    const dirY = desiredVy / speed;
    let bestWeight = 0;
    let tangentX = dirX;
    let tangentY = dirY;

    for (const obs of obstacles) {
      const solidRadius = obs.radius;
      const avoidRadius = solidRadius + 30;
      const toObsX = obs.x - x;
      const toObsY = obs.y - y;
      const dist = Math.hypot(toObsX, toObsY);

      if (dist >= avoidRadius || dist < 1e-4) continue;

      // Forward distance along movement ray to obstacle center
      const proj = toObsX * dirX + toObsY * dirY;
      // Only steer if obstacle is in front or right beside us
      if (proj < -solidRadius * 0.35) continue;

      // Signed perpendicular offset from forward ray to obstacle center
      const cross = dirX * toObsY - dirY * toObsX;
      if (Math.abs(cross) >= solidRadius + 10) continue;

      // Pick the shorter tangent around the trunk
      const rx = (x - obs.x) / dist;
      const ry = (y - obs.y) / dist;
      const ccwX = -ry;
      const ccwY = rx;
      const cwX = ry;
      const cwY = -rx;

      const ccwDot = ccwX * dirX + ccwY * dirY;
      const cwDot = cwX * dirX + cwY * dirY;

      let chosenX: number;
      let chosenY: number;
      if (Math.abs(ccwDot - cwDot) < 0.05) {
        // Nearly head-on: break symmetry deterministically using cross sign
        const useCcw = cross >= 0;
        chosenX = useCcw ? ccwX : cwX;
        chosenY = useCcw ? ccwY : cwY;
      } else if (ccwDot > cwDot) {
        chosenX = ccwX;
        chosenY = ccwY;
      } else {
        chosenX = cwX;
        chosenY = cwY;
      }

      const proximityWeight = clamp(
        (avoidRadius - dist) / (avoidRadius - solidRadius),
        0.4,
        1.0
      );
      if (proximityWeight > bestWeight) {
        bestWeight = proximityWeight;
        tangentX = chosenX;
        tangentY = chosenY;
      }
    }

    if (bestWeight > 0) {
      const blendX = dirX * (1 - bestWeight * 0.72) + tangentX * bestWeight;
      const blendY = dirY * (1 - bestWeight * 0.72) + tangentY * bestWeight;
      const blendLen = Math.hypot(blendX, blendY) || 1;
      steerVx = (blendX / blendLen) * speed;
      steerVy = (blendY / blendLen) * speed;
    }
  }

  let nextX = x + steerVx * dt;
  let nextY = y + steerVy * dt;

  // Hard separation guarantee against all trunk circles
  for (const obs of obstacles) {
    const dx = nextX - obs.x;
    const dy = nextY - obs.y;
    const dist = Math.hypot(dx, dy);
    if (dist < obs.radius) {
      if (dist < 1e-4) {
        nextX = obs.x + obs.radius;
        nextY = obs.y;
      } else {
        nextX = obs.x + (dx / dist) * obs.radius;
        nextY = obs.y + (dy / dist) * obs.radius;
      }
    }
  }

  return {
    x: nextX,
    y: nextY,
    actualVx: steerVx,
    actualVy: steerVy,
  };
}

/**
 * Returns true if two canopy trees are considered back-to-back (within the same
 * horizontal band or consecutive vertical bands without at least one clear band
 * or sufficient horizontal separation between them).
 */
export function areTreesBackToBack(
  xA: number,
  yA: number,
  xB: number,
  yB: number,
  minVerticalGap = 620,
  minDistance = 650
): boolean {
  const dy = Math.abs(yA - yB);
  if (dy < minVerticalGap) {
    return true;
  }
  return Math.hypot(xA - xB, yA - yB) < minDistance;
}
