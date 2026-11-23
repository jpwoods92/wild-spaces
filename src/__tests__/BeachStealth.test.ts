import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBirdDetectRadius,
  computeLightPollutionPull,
  doesBirdDiveHit,
  isPointInShade,
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
