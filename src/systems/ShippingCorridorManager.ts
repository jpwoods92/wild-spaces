import Phaser from 'phaser';

export interface ManagedShip {
  x: number;
  y: number;
  vx: number;
  pulseTimer: number;
  sprite: Phaser.GameObjects.Image;
  wakeGraphics: Phaser.GameObjects.Graphics;
}

export interface ShippingCorridorConfig {
  corridors: { x: number; y: number }[];
  worldWidth: number;
  bannerText: string;
  shipsPerLane: number;
  eastboundSpeed: number;
  westboundSpeed: number;
  fillColor?: number;
  fillAlpha?: number;
  corridorDepth?: number;
  wakeDepth?: number;
  shipDepth?: number;
}

export interface ShippingUpdateOptions {
  playerX: number;
  playerY: number;
  hitHalfWidth?: number;
  hitHalfHeight?: number;
  pulseInterval?: number;
  onPeriodicPulse?: (shipX: number, shipY: number) => void;
  onWakeOverlap?: (shipVx: number, dt: number) => void;
}

/**
 * Shared Shipping Corridor & Vessel Traffic system used across Wild Spaces episodes.
 * Guarantees consistent off-screen spawning/despawning relative to the live camera viewport,
 * wake rendering, optional acoustic/wake pulses, and hull collision detection.
 */
export class ShippingCorridorManager {
  private scene: Phaser.Scene;
  private ships: ManagedShip[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public clear(): void {
    for (const ship of this.ships) {
      ship.sprite.destroy();
      ship.wakeGraphics.destroy();
    }
    this.ships = [];
  }

  public spawnCorridors(config: ShippingCorridorConfig): void {
    this.clear();

    const {
      corridors,
      worldWidth,
      bannerText,
      shipsPerLane,
      eastboundSpeed,
      westboundSpeed,
      fillColor = 0x451a03,
      fillAlpha = 0.24,
      corridorDepth = 2,
      wakeDepth = 13,
      shipDepth = 14,
    } = config;

    // Initial loop half-span covers even ultra-wide viewports plus a 380px off-screen buffer
    const initialHalfSpan = Math.max(
      1350,
      this.scene.scale.width * 0.5 + 380
    );
    const totalLoopWidth = initialHalfSpan * 2;

    for (const corridor of corridors) {
      const centerCorridorX = corridor.x;
      const centerCorridorY = corridor.y;

      const laneGraphics = this.scene.add.graphics().setDepth(corridorDepth);
      laneGraphics.fillStyle(fillColor, fillAlpha);
      laneGraphics.fillRect(
        -1000,
        centerCorridorY - 152,
        worldWidth + 2000,
        304
      );
      laneGraphics.lineStyle(2, 0xf59e0b, 0.44);
      laneGraphics.lineBetween(
        -1000,
        centerCorridorY - 152,
        worldWidth + 1000,
        centerCorridorY - 152
      );
      laneGraphics.lineBetween(
        -1000,
        centerCorridorY + 152,
        worldWidth + 1000,
        centerCorridorY + 152
      );

      // Center lane divider between the 2 opposing shipping channels
      laneGraphics.lineStyle(1, 0xfbbf24, 0.2);
      laneGraphics.lineBetween(
        -1000,
        centerCorridorY,
        worldWidth + 1000,
        centerCorridorY
      );

      this.scene.add
        .text(centerCorridorX, centerCorridorY - 132, bannerText, {
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#fbbf24',
          letterSpacing: 1.5,
        })
        .setOrigin(0.5)
        .setAlpha(0.85)
        .setDepth(corridorDepth + 1);

      const lanes = [
        {
          y: centerCorridorY - 60,
          vx: Math.abs(eastboundSpeed),
          phaseOffset: 0,
        },
        {
          y: centerCorridorY + 60,
          vx: -Math.abs(westboundSpeed),
          phaseOffset: totalLoopWidth * 0.25,
        },
      ];

      for (const lane of lanes) {
        const spacing = totalLoopWidth / shipsPerLane;
        for (let s = 0; s < shipsPerLane; s++) {
          const startX =
            centerCorridorX -
            initialHalfSpan +
            ((s * spacing + lane.phaseOffset) % totalLoopWidth);

          const wakeGraphics = this.scene.add.graphics().setDepth(wakeDepth);
          const sprite = this.scene.add
            .image(startX, lane.y, 'industrial_ship')
            .setDepth(shipDepth)
            .setFlipX(lane.vx < 0);

          this.ships.push({
            x: startX,
            y: lane.y,
            vx: lane.vx,
            pulseTimer: s * 0.9,
            sprite,
            wakeGraphics,
          });
        }
      }
    }
  }

  /**
   * Advances all vessels, wraps them strictly off-screen relative to the live camera viewport,
   * renders wakes, triggers optional periodic pulses, and returns `true` if the player collided with a hull.
   */
  public update(dt: number, options: ShippingUpdateOptions): boolean {
    const {
      playerX,
      playerY,
      hitHalfWidth = 74,
      hitHalfHeight = 30,
      pulseInterval,
      onPeriodicPulse,
      onWakeOverlap,
    } = options;

    const cam = this.scene.cameras.main;
    const camCenterX = cam.scrollX + cam.width * 0.5;
    // Always keep the wrap boundary at least 380px beyond the left and right edges of the screen
    const dynamicHalfSpan = Math.max(1350, cam.width * 0.5 + 380);
    const dynamicSpan = dynamicHalfSpan * 2;

    for (const ship of this.ships) {
      ship.x += ship.vx * dt;

      if (ship.x > camCenterX + dynamicHalfSpan) {
        ship.x -= dynamicSpan;
      } else if (ship.x < camCenterX - dynamicHalfSpan) {
        ship.x += dynamicSpan;
      }
      ship.sprite.setPosition(ship.x, ship.y);

      // Optional periodic acoustic / wake pulse callback
      if (pulseInterval && onPeriodicPulse) {
        ship.pulseTimer += dt;
        if (ship.pulseTimer >= pulseInterval) {
          ship.pulseTimer = 0;
          onPeriodicPulse(ship.x, ship.y);
        }
      }

      // Render churning V-wake behind the vessel
      ship.wakeGraphics.clear();
      const dir = ship.vx > 0 ? -1 : 1;
      const sternX = ship.x + dir * 62;

      ship.wakeGraphics.fillStyle(0xbae6fd, 0.16);
      ship.wakeGraphics.fillTriangle(
        sternX,
        ship.y,
        sternX + dir * 150,
        ship.y - 28,
        sternX + dir * 150,
        ship.y + 28
      );

      ship.wakeGraphics.lineStyle(2, 0x94a3b8, 0.38);
      ship.wakeGraphics.lineBetween(
        sternX,
        ship.y,
        sternX + dir * 155,
        ship.y - 34
      );
      ship.wakeGraphics.lineBetween(
        sternX,
        ship.y,
        sternX + dir * 155,
        ship.y + 34
      );

      // Direct hull collision check
      const dx = Math.abs(playerX - ship.x);
      const dy = Math.abs(playerY - ship.y);
      if (dx < hitHalfWidth && dy < hitHalfHeight) {
        return true;
      }

      // Optional stern wake turbulence callback
      if (onWakeOverlap) {
        const wakeDeltaX = (playerX - sternX) * dir;
        if (wakeDeltaX > 0 && wakeDeltaX < 165 && dy < 34) {
          onWakeOverlap(ship.vx, dt);
        }
      }
    }

    return false;
  }
}
