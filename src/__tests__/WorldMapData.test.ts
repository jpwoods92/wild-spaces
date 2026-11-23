import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCardPopoverPosition,
  computeMapBounds,
  MAP_ASPECT_RATIO,
  MAP_MAX_LAT,
  MAP_MAX_LON,
  MAP_MIN_LAT,
  MAP_MIN_LON,
  projectLonLat,
  WORLD_LANDMASSES,
} from '../utils/WorldMapData.ts';

describe('WorldMapData habitat map geometry, projection & popover helpers', () => {
  it('computes centered map bounds preserving 2.15 aspect ratio on wide and compact viewports', () => {
    const wide = computeMapBounds(1440, 840);
    assert.ok(Math.abs(wide.width / wide.height - MAP_ASPECT_RATIO) < 1e-6);
    assert.ok(wide.x >= 32 - 1e-6);
    assert.ok(wide.y >= 128 - 1e-6);
    assert.ok(wide.x + wide.width <= 1440 - 32 + 1e-6);
    assert.ok(wide.y + wide.height <= 840 - 44 + 1e-6);

    const compact = computeMapBounds(800, 600);
    assert.ok(Math.abs(compact.width / compact.height - MAP_ASPECT_RATIO) < 1e-6);
    assert.ok(compact.x >= 32 - 1e-6);
    assert.ok(compact.y >= 128 - 1e-6);
    assert.ok(compact.x + compact.width <= 800 - 32 + 1e-6);
    assert.ok(compact.y + compact.height <= 600 - 44 + 1e-6);
  });

  it('projects geographic coordinates onto bounds and preserves relative episode locations', () => {
    const bounds = { x: 100, y: 150, width: 1000, height: 500 };

    const topLeft = projectLonLat(MAP_MIN_LON, MAP_MAX_LAT, bounds);
    const bottomRight = projectLonLat(MAP_MAX_LON, MAP_MIN_LAT, bounds);
    assert.deepEqual(topLeft, { x: 100, y: 150 });
    assert.deepEqual(bottomRight, { x: 1100, y: 650 });

    const arctic = projectLonLat(-142, 71.5, bounds);
    const northAtlantic = projectLonLat(-66.5, 42.5, bounds);
    const florida = projectLonLat(-80.2, 27.5, bounds);
    const madagascar = projectLonLat(45.2, -24.2, bounds);

    // Beaufort Sea sits north and west of North Atlantic; Florida south-west of North Atlantic
    assert.ok(arctic.x < northAtlantic.x && arctic.y < northAtlantic.y);
    assert.ok(florida.x < northAtlantic.x && florida.y > northAtlantic.y);
    // Madagascar sits southeast and south of Florida
    assert.ok(madagascar.x > northAtlantic.x && madagascar.y > florida.y);
  });

  it('provides valid landmass polygons covering major continents and Madagascar', () => {
    const names = new Set(WORLD_LANDMASSES.map((m) => m.name));
    for (const required of [
      'North America',
      'Greenland',
      'South America',
      'Europe',
      'Africa',
      'Madagascar',
      'Asia',
      'Australia',
    ]) {
      assert.equal(names.has(required), true, `Missing landmass ${required}`);
    }

    for (const land of WORLD_LANDMASSES) {
      assert.ok(land.points.length >= 3, `${land.name} has too few vertices`);
      for (const [lon, lat] of land.points) {
        assert.ok(
          lon >= MAP_MIN_LON && lon <= MAP_MAX_LON,
          `${land.name} lon out of range: ${lon}`
        );
        assert.ok(
          lat >= MAP_MIN_LAT && lat <= MAP_MAX_LAT,
          `${land.name} lat out of range: ${lat}`
        );
      }
    }
  });

  it('opens hover card right on western pins, flips left on eastern pins, and clamps inside viewport', () => {
    const vw = 1280;
    const vh = 760;
    const cardW = 315;
    const cardH = 300;

    const leftPin = computeCardPopoverPosition(280, 320, cardW, cardH, vw, vh);
    assert.equal(leftPin.side, 'right');
    assert.ok(leftPin.x > 280);
    assert.ok(leftPin.x + cardW <= vw - 18);
    assert.ok(leftPin.y >= 104 && leftPin.y + cardH <= vh - 18);

    const rightPin = computeCardPopoverPosition(1150, 700, cardW, cardH, vw, vh);
    assert.equal(rightPin.side, 'left');
    assert.ok(rightPin.x + cardW < 1150);
    assert.ok(rightPin.x >= 18);
    assert.ok(rightPin.y >= 104 && rightPin.y + cardH <= vh - 18);
  });
});
