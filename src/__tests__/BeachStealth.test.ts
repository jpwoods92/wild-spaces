import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBirdDetectRadius,
  computeLightPollutionPull,
  computeSpotlightPosition,
  computeTurtlePredatorCounts,
  doesBirdDiveHit,
  getPredatorVisibilityAlpha,
  isPointInShade,
  recoverBurrowedStamina,
  updateBlindnessTimer,
} from '../utils/BeachStealth.ts';

describe('BeachStealth pure hatchling stealth & light-pollution helpers', () => {
  it('checks elliptical driftwood and dune shade containment accurately', () => {
    const shades = [{ x: 400, y: 600, radiusX: 72, radiusY: 48 }];
    assert.equal(isPointInShade(400, 600, shades), true);
    assert.equal(isPointInShade(472, 600, shades), true);
    assert.equal(isPointInShade(400, 648, shades), true);
    assert.equal(isPointInShade(460, 640, shades), false);
    assert.equal(isPointInShade(500, 600, shades), false);
  });

  it('moves spotlights smoothly in 2D across the beach over time', () => {
    const spot = {
      baseX: 500,
      baseY: 1200,
      ampX: 220,
      ampY: 140,
      speedX: 1,
      speedY: 1,
      phase: 0,
    };
    const p0 = computeSpotlightPosition(spot, 0);
    const p1 = computeSpotlightPosition(spot, Math.PI / 2);
    assert.ok(Math.abs(p0.x - 500) < 1e-6);
    assert.ok(Math.abs(p0.y - 1340) < 1e-6);
    assert.ok(Math.abs(p1.x - 720) < 1e-6);
    assert.ok(Math.abs(p1.y - 1200) < 1e-6);
  });

  it('pulls exposed hatchlings toward light sources, suppresses pull when blocked, and caps total speed', () => {
    const lights = [
      { x: 260, y: 500, radius: 200, strength: 85, sourceX: 80, sourceY: 500 },
    ];

    const exposed = computeLightPollutionPull(260, 500, lights, false);
    assert.ok(exposed.pullX < -80);
    assert.ok(Math.abs(exposed.pullY) < 1e-6);
    assert.equal(exposed.glare, 1);

    const shadedOrBurrowed = computeLightPollutionPull(260, 500, lights, true);
    assert.deepEqual(shadedOrBurrowed, { pullX: 0, pullY: 0, glare: 0 });

    const overlapping = [
      { x: 200, y: 500, radius: 300, strength: 100, sourceX: 40, sourceY: 500 },
      { x: 200, y: 500, radius: 300, strength: 100, sourceX: 40, sourceY: 500 },
    ];
    const capped = computeLightPollutionPull(200, 500, overlapping, false);
    assert.ok(Math.abs(Math.hypot(capped.pullX, capped.pullY) - 115) < 1e-6);
  });

  it('triggers spotlight blindness when exposed to glare and hides predators until night vision recovers', () => {
    const blinded = updateBlindnessTimer(0, 0.8, false, false, 0.016);
    assert.ok(blinded >= 3.5);
    assert.equal(getPredatorVisibilityAlpha(blinded), 0);

    // Shaded or burrowed does not trigger new blindness and decays normally
    const afterDecay = updateBlindnessTimer(blinded, 0.9, true, false, 3.2);
    assert.ok(afterDecay < blinded);

    // Partial visibility during final recovery window
    const partial = getPredatorVisibilityAlpha(0.425, 0.85);
    assert.ok(Math.abs(partial - 0.5) < 1e-6);
    assert.equal(getPredatorVisibilityAlpha(0), 1);
  });

  it('recovers stamina while burrowed without exceeding maxStamina', () => {
    assert.equal(recoverBurrowedStamina(40, 85, 1.0, 18), 58);
    assert.equal(recoverBurrowedStamina(80, 85, 1.0, 18), 85);
  });

  it('scales crab and seabird counts aggressively across higher levels', () => {
    const l1 = computeTurtlePredatorCounts(1);
    const l3 = computeTurtlePredatorCounts(3);
    const l5 = computeTurtlePredatorCounts(5);
    assert.equal(l1.crabCount, 6);
    assert.equal(l1.birdCount, 3);
    assert.ok(l3.crabCount >= 18 && l3.birdCount >= 11);
    assert.ok(l5.crabCount > l3.crabCount && l5.birdCount > l3.birdCount);
  });

  it('expands bird detection radius under glare and drops to zero when burrowed or shaded', () => {
    assert.equal(computeBirdDetectRadius(235, 0, false, false), 235);
    assert.equal(computeBirdDetectRadius(235, 0.5, false, false), 305);
    assert.equal(computeBirdDetectRadius(235, 1, false, false), 375);
    assert.equal(computeBirdDetectRadius(235, 1, true, false), 0);
    assert.equal(computeBirdDetectRadius(235, 1, false, true), 0);
  });

  it('evaluates bird dive strikes only against exposed hatchlings inside strike radius', () => {
    assert.equal(doesBirdDiveHit(300, 300, 320, 310, 42, false, false), true);
    assert.equal(doesBirdDiveHit(300, 300, 360, 300, 42, false, false), false);
    assert.equal(doesBirdDiveHit(300, 300, 305, 305, 42, true, false), false);
    assert.equal(doesBirdDiveHit(300, 300, 305, 305, 42, false, true), false);
  });
});
