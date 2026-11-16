import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  areTreesBackToBack,
  resolveCircleObstacleMovement,
} from '../utils/ObstacleAvoidance.ts';

describe('ObstacleAvoidance shared circle steering helper', () => {
  it('moves unobstructed at desired velocity when no trunk is nearby', () => {
    const res = resolveCircleObstacleMovement(100, 200, 120, 0, 0.1, [
      { x: 500, y: 500, radius: 60 },
    ]);

    assert.ok(Math.abs(res.x - 112) < 1e-6);
    assert.ok(Math.abs(res.y - 200) < 1e-6);
    assert.equal(res.actualVx, 120);
    assert.equal(res.actualVy, 0);
  });

  it('steers smoothly around a tree trunk instead of walking through it', () => {
    const trunk = { x: 200, y: 200, radius: 60 };
    let x = 115;
    let y = 195;

    for (let step = 0; step < 30; step++) {
      const next = resolveCircleObstacleMovement(x, y, 100, 0, 0.1, [trunk]);
      x = next.x;
      y = next.y;

      const distToCenter = Math.hypot(x - trunk.x, y - trunk.y);
      assert.ok(
        distToCenter >= trunk.radius - 1e-6,
        `step ${step}: penetrated trunk (${distToCenter} < ${trunk.radius})`
      );
    }

    // Should have curved around the trunk and progressed eastward past trunk.x
    assert.ok(x > trunk.x);
  });

  it('pushes an overlapping agent cleanly outside the trunk radius even at zero speed', () => {
    const trunk = { x: 400, y: 400, radius: 64 };
    const res = resolveCircleObstacleMovement(410, 400, 0, 0, 0, [trunk]);
    const dist = Math.hypot(res.x - trunk.x, res.y - trunk.y);
    assert.ok(Math.abs(dist - trunk.radius) < 1e-6);
    assert.ok(res.x >= trunk.x + trunk.radius - 1e-6);
  });

  it('flags trees in the same or consecutive vertical bands as back-to-back', () => {
    // Same horizontal row / close vertical band
    assert.equal(areTreesBackToBack(600, 1200, 1100, 1200), true);
    // Consecutive vertical band without a clear band in between
    assert.equal(areTreesBackToBack(600, 1200, 720, 820), true);
    // Separated by at least one clear band and sufficient distance
    assert.equal(areTreesBackToBack(600, 1200, 720, 520), false);
  });
});
