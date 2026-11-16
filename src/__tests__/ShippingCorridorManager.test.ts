import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import {
  computeOffscreenWrapHalfSpan,
  isShipHullCollision,
  isSternWakeOverlap,
  ShippingCorridorManager,
  wrapShipXToCamera,
} from '../systems/ShippingCorridorManager.ts';

function createMockShippingScene(viewportWidth = 1440, scrollX = 6880) {
  const imageTextures: string[] = [];
  const wakeFillColors: number[] = [];

  const scene = {
    scale: { width: viewportWidth, height: 900 },
    cameras: {
      main: {
        scrollX,
        width: viewportWidth,
      },
    },
    add: {
      graphics: () => ({
        setDepth() {
          return this;
        },
        fillStyle(color: number) {
          wakeFillColors.push(color);
          return this;
        },
        fillRect() {
          return this;
        },
        lineStyle() {
          return this;
        },
        lineBetween() {
          return this;
        },
        clear() {
          return this;
        },
        fillTriangle() {
          return this;
        },
        destroy() {},
      }),
      text: () => ({
        setOrigin() {
          return this;
        },
        setAlpha() {
          return this;
        },
        setDepth() {
          return this;
        },
      }),
      image: (x: number, y: number, key: string) => {
        imageTextures.push(key);
        return {
          x,
          y,
          destroyed: false,
          setDepth() {
            return this;
          },
          setFlipX() {
            return this;
          },
          setPosition(nx: number, ny: number) {
            this.x = nx;
            this.y = ny;
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
      },
    },
  };

  return {
    scene: scene as unknown as Phaser.Scene,
    imageTextures,
    wakeFillColors,
  };
}

describe('ShippingCorridorManager & off-screen vessel helpers', () => {
  describe('computeOffscreenWrapHalfSpan', () => {
    it('enforces a minimum 1350px half-span on standard viewports', () => {
      assert.equal(computeOffscreenWrapHalfSpan(1280), 1350);
      assert.equal(computeOffscreenWrapHalfSpan(1920), 1350);
    });

    it('expands dynamically on ultra-wide viewports so the wrap boundary stays 380px off-screen', () => {
      const viewportWidth = 2560;
      const halfSpan = computeOffscreenWrapHalfSpan(viewportWidth);
      assert.equal(halfSpan, 2560 * 0.5 + 380);
      assert.ok(halfSpan - viewportWidth * 0.5 >= 380);
    });
  });

  describe('wrapShipXToCamera', () => {
    it('wraps an eastbound ship from right off-screen boundary to left off-screen boundary', () => {
      const camCenterX = 7600;
      const halfSpan = 1350;
      const wrappedX = wrapShipXToCamera(
        camCenterX + halfSpan + 15,
        camCenterX,
        halfSpan
      );
      assert.equal(wrappedX, camCenterX - halfSpan + 15);
    });

    it('wraps a westbound ship from left off-screen boundary to right off-screen boundary', () => {
      const camCenterX = 7600;
      const halfSpan = 1350;
      const wrappedX = wrapShipXToCamera(
        camCenterX - halfSpan - 20,
        camCenterX,
        halfSpan
      );
      assert.equal(wrappedX, camCenterX + halfSpan - 20);
    });

    it('leaves ships inside the active span untouched', () => {
      assert.equal(wrapShipXToCamera(7400, 7600, 1350), 7400);
    });
  });

  describe('isShipHullCollision & isSternWakeOverlap', () => {
    it('detects direct hull collision within hitHalfWidth and hitHalfHeight', () => {
      assert.equal(isShipHullCollision(500, 300, 540, 315, 74, 30), true);
      assert.equal(isShipHullCollision(500, 300, 620, 315, 74, 30), false);
      assert.equal(isShipHullCollision(500, 300, 540, 345, 74, 30), false);
    });

    it('detects stern wake overlap behind eastbound (vx > 0) and westbound (vx < 0) vessels', () => {
      // Eastbound ship at x = 1000 has stern at 938 and wake extending left to 773
      assert.equal(isSternWakeOverlap(850, 400, 1000, 400, 180), true);
      // In front of eastbound ship -> not in stern wake
      assert.equal(isSternWakeOverlap(1100, 400, 1000, 400, 180), false);

      // Westbound ship at x = 1000 has stern at 1062 and wake extending right to 1227
      assert.equal(isSternWakeOverlap(1140, 400, 1000, 400, -180), true);
      assert.equal(isSternWakeOverlap(900, 400, 1000, 400, -180), false);
    });
  });

  describe('ShippingCorridorManager lifecycle', () => {
    it('spawns 2 opposing lanes per corridor, wraps ships off-screen, fires pulses, and detects collisions', () => {
      const { scene } = createMockShippingScene(1440, 6880); // camCenterX = 6880 + 720 = 7600
      const manager = new ShippingCorridorManager(scene);

      manager.spawnCorridors({
        corridors: [{ x: 7600, y: 4000 }],
        worldWidth: 15200,
        bannerText: 'TEST CORRIDOR',
        shipsPerLane: 2,
        eastboundSpeed: 180,
        westboundSpeed: 200,
      });

      assert.equal(manager.getShips().length, 4);

      // Step update and verify periodic pulse callback fires
      let pulsesFired = 0;
      const collidedSafe = manager.update(3.0, {
        playerX: 100,
        playerY: 100,
        pulseInterval: 2.0,
        onPeriodicPulse: () => {
          pulsesFired++;
        },
      });
      assert.equal(collidedSafe, false);
      assert.ok(pulsesFired > 0);

      // Verify all ships remain within [camCenterX - halfSpan, camCenterX + halfSpan]
      const halfSpan = computeOffscreenWrapHalfSpan(1440);
      for (const ship of manager.getShips()) {
        assert.ok(ship.x >= 7600 - halfSpan && ship.x <= 7600 + halfSpan);
      }

      // Place player directly on top of first ship to verify collision detection
      const targetShip = manager.getShips()[0];
      const collidedHit = manager.update(0, {
        playerX: targetShip.x,
        playerY: targetShip.y,
      });
      assert.equal(collidedHit, true);

      manager.clear();
      assert.equal(manager.getShips().length, 0);
    });

    it('supports custom terrestrial textureKey and dust wakeStyle for logging haul roads', () => {
      const { scene, imageTextures, wakeFillColors } = createMockShippingScene(
        1440,
        480
      );
      const manager = new ShippingCorridorManager(scene);

      manager.spawnCorridors({
        corridors: [{ x: 1200, y: 2000 }],
        worldWidth: 2400,
        bannerText: 'LOGGING HAUL ROAD',
        shipsPerLane: 1,
        eastboundSpeed: 190,
        westboundSpeed: 210,
        textureKey: 'logging_truck',
        wakeStyle: 'dust',
      });

      assert.deepEqual(imageTextures, ['logging_truck', 'logging_truck']);
      assert.equal(manager.getShips()[0].wakeStyle, 'dust');

      wakeFillColors.length = 0;
      manager.update(0.1, { playerX: 0, playerY: 0 });
      assert.ok(wakeFillColors.includes(0xd97706));

      manager.clear();
    });

    it('skips hull collision when checkCollision is false while still moving and wrapping trucks', () => {
      const { scene } = createMockShippingScene(1440, 480);
      const manager = new ShippingCorridorManager(scene);

      manager.spawnCorridors({
        corridors: [{ x: 1200, y: 2000 }],
        worldWidth: 2400,
        bannerText: 'LOGGING HAUL ROAD',
        shipsPerLane: 1,
        eastboundSpeed: 200,
        westboundSpeed: 200,
        textureKey: 'logging_truck',
        wakeStyle: 'none',
      });

      const truck = manager.getShips()[0];
      assert.equal(truck.wakeStyle, 'none');

      const prevX = truck.x;
      // Player is directly over the truck's future position, but airborne (checkCollision: false)
      const hitWhileLeaping = manager.update(0.1, {
        playerX: prevX + 20,
        playerY: truck.y,
        checkCollision: false,
      });
      assert.equal(hitWhileLeaping, false);
      assert.ok(Math.abs(truck.x - (prevX + 20)) < 1e-6);

      // Once landed on the truck (checkCollision defaults to true), impact is detected
      const hitAfterLanding = manager.update(0, {
        playerX: truck.x,
        playerY: truck.y,
      });
      assert.equal(hitAfterLanding, true);

      manager.clear();
    });
  });
});
