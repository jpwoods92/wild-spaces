import Phaser from 'phaser';
import {
  LEMUR_ASSETS,
  POLAR_BEAR_ASSETS,
  TURTLE_ASSETS,
  WHALE_ASSETS,
} from '../config/AssetManifest';
import { getActiveSession } from '../utils/SessionStore';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load any external artist files that have been flipped to `useExternalFile: true`
    for (const asset of [
      ...POLAR_BEAR_ASSETS,
      ...WHALE_ASSETS,
      ...LEMUR_ASSETS,
      ...TURTLE_ASSETS,
    ]) {
      if (asset.useExternalFile) {
        this.load.image(asset.key, asset.filePath);
      }
    }
  }

  create(): void {
    this.generatePolarBearTextures();
    this.generateCubTexture();
    this.generateSealTextures();
    this.generateEnvironmentTextures();
    this.generateWhaleTextures();
    this.generateLemurTextures();
    this.generateTurtleTextures();

    // Resume an in-progress episode if one was saved; otherwise open the Habitat Map home page
    const activeSession = getActiveSession();
    if (activeSession) {
      this.scene.start(activeSession.episodeId, activeSession.sceneData);
    } else {
      this.scene.start('HubScene');
    }
  }

  private generatePolarBearTextures(): void {
    if (!this.textures.exists('bear_walk')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // 64x48 top-down polar bear facing right (0 radians)
      // Subtle drop shadow
      g.fillStyle(0x091e30, 0.35);
      g.fillEllipse(30, 25, 48, 32);

      // Paws (extended slightly for walking)
      g.fillStyle(0xe2e8f0, 1);
      g.fillEllipse(16, 9, 12, 8);
      g.fillEllipse(16, 39, 12, 8);
      g.fillEllipse(44, 10, 13, 8);
      g.fillEllipse(44, 38, 13, 8);

      // Main torso & fur contour
      g.fillStyle(0xf8fafc, 1);
      g.fillEllipse(26, 24, 40, 28);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(29, 24, 34, 23);

      // Shoulders & neck
      g.fillStyle(0xf1f5f9, 1);
      g.fillEllipse(41, 24, 22, 22);

      // Ears
      g.fillStyle(0xe2e8f0, 1);
      g.fillCircle(46, 15, 3.8);
      g.fillCircle(46, 33, 3.8);

      // Head & snout
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(51, 24, 18, 14);
      g.fillStyle(0xf1f5f9, 1);
      g.fillEllipse(57, 24, 10, 8);

      // Nose & eyes
      g.fillStyle(0x1e293b, 1);
      g.fillCircle(61, 24, 2.5);
      g.fillCircle(52, 19.5, 1.4);
      g.fillCircle(52, 28.5, 1.4);

      // Tiny tail
      g.fillStyle(0xe2e8f0, 1);
      g.fillCircle(6, 24, 3.5);

      g.generateTexture('bear_walk', 66, 48);
      g.destroy();
    }

    if (!this.textures.exists('bear_swim')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Submerged body wake glow
      g.fillStyle(0x38bdf8, 0.28);
      g.fillEllipse(28, 24, 48, 30);

      // Submerged back (tinted aqua)
      g.fillStyle(0xbae6fd, 0.65);
      g.fillEllipse(24, 24, 34, 22);

      // Paddling front paws underwater
      g.fillStyle(0xe0f2fe, 0.75);
      g.fillEllipse(45, 10, 12, 7);
      g.fillEllipse(45, 38, 12, 7);

      // Head & upper shoulders above water
      g.fillStyle(0xf8fafc, 1);
      g.fillEllipse(40, 24, 18, 18);
      g.fillStyle(0xe2e8f0, 1);
      g.fillCircle(45, 16, 3.4);
      g.fillCircle(45, 32, 3.4);

      g.fillStyle(0xffffff, 1);
      g.fillEllipse(51, 24, 17, 13);
      g.fillStyle(0x1e293b, 1);
      g.fillCircle(60, 24, 2.4);
      g.fillCircle(51, 20, 1.4);
      g.fillCircle(51, 28, 1.4);

      g.generateTexture('bear_swim', 66, 48);
      g.destroy();
    }

    if (!this.textures.exists('bear_lunge')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Outstretched pouncing bear
      g.fillStyle(0xe2e8f0, 1);
      g.fillEllipse(54, 11, 16, 8);
      g.fillEllipse(54, 37, 16, 8);
      g.fillEllipse(12, 14, 14, 7);
      g.fillEllipse(12, 34, 14, 7);

      g.fillStyle(0xffffff, 1);
      g.fillEllipse(30, 24, 44, 24);
      g.fillEllipse(52, 24, 19, 14);
      g.fillStyle(0x1e293b, 1);
      g.fillCircle(62, 24, 2.5);
      g.fillCircle(53, 19.5, 1.5);
      g.fillCircle(53, 28.5, 1.5);

      g.generateTexture('bear_lunge', 68, 48);
      g.destroy();
    }
  }

  private generateCubTexture(): void {
    if (!this.textures.exists('bear_cub')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x091e30, 0.3);
      g.fillEllipse(20, 16, 26, 18);

      g.fillStyle(0xf8fafc, 1);
      g.fillEllipse(18, 16, 22, 16);
      g.fillCircle(26, 10, 2.8);
      g.fillCircle(26, 22, 2.8);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(29, 16, 12, 10);
      g.fillStyle(0x1e293b, 1);
      g.fillCircle(35, 16, 1.8);
      g.fillCircle(29, 13, 1.2);
      g.fillCircle(29, 19, 1.2);

      g.generateTexture('bear_cub', 40, 32);
      g.destroy();
    }
  }

  private generateSealTextures(): void {
    if (!this.textures.exists('seal_rest')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Drop shadow
      g.fillStyle(0x091e30, 0.3);
      g.fillEllipse(22, 16, 34, 18);

      // Tail flippers
      g.fillStyle(0x475569, 1);
      g.fillTriangle(2, 10, 12, 15, 4, 16);
      g.fillTriangle(2, 22, 12, 17, 4, 16);

      // Side flippers
      g.fillEllipse(24, 7, 10, 5);
      g.fillEllipse(24, 25, 10, 5);

      // Seal plump body
      g.fillStyle(0x64748b, 1);
      g.fillEllipse(22, 16, 28, 16);
      g.fillStyle(0x94a3b8, 1);
      g.fillEllipse(24, 16, 22, 12);

      // Ringed spots
      g.fillStyle(0x475569, 0.7);
      g.fillCircle(18, 14, 2);
      g.fillCircle(23, 18, 2.2);
      g.fillCircle(15, 18, 1.6);

      // Head & eyes
      g.fillStyle(0x64748b, 1);
      g.fillCircle(34, 16, 6.5);
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(36, 13.5, 1.5);
      g.fillCircle(36, 18.5, 1.5);
      g.fillCircle(40, 16, 1.6);

      g.generateTexture('seal_rest', 44, 32);
      g.destroy();
    }
  }

  private generateEnvironmentTextures(): void {
    // Soft snow particle
    if (!this.textures.exists('snow_dot')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(4, 4, 3.5);
      g.generateTexture('snow_dot', 8, 8);
      g.destroy();
    }

    // Water ripple ring
    if (!this.textures.exists('water_ring')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.lineStyle(2, 0x7dd3fc, 0.65);
      g.strokeCircle(24, 24, 20);
      g.generateTexture('water_ring', 48, 48);
      g.destroy();
    }

    // Industrial cargo/whaling vessel obstacle in the shipping lane
    if (!this.textures.exists('industrial_ship')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Hull shadow
      g.fillStyle(0x020617, 0.55);
      g.fillRoundedRect(4, 8, 132, 44, 14);

      // Steel hull
      g.fillStyle(0x334155, 1);
      g.fillRoundedRect(2, 4, 115, 42, 8);
      // Bow point (facing right)
      g.fillTriangle(110, 4, 110, 46, 142, 25);

      // Rust-red deck
      g.fillStyle(0x991b1b, 1);
      g.fillRect(10, 9, 98, 32);

      // Bridge & smokestack
      g.fillStyle(0xe2e8f0, 1);
      g.fillRect(16, 12, 26, 26);
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(28, 25, 5);

      // Cargo containers / fuel tanks
      g.fillStyle(0xd97706, 1);
      g.fillRect(50, 12, 24, 12);
      g.fillStyle(0x2563eb, 1);
      g.fillRect(50, 26, 24, 12);
      g.fillStyle(0x475569, 1);
      g.fillRect(78, 12, 24, 26);

      g.generateTexture('industrial_ship', 146, 52);
      g.destroy();
    }
  }

  private generateWhaleTextures(): void {
    // 1. Adult Whale (top-down, facing right / 0 rad, 136x80 — long tapering body with pronounced fins)
    if (!this.textures.exists('whale_swim')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 40;

      // Sweeping, pronounced pectoral flippers angling backward from the chest
      g.fillStyle(0x0f172a, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(92, cy - 13),
          new Phaser.Geom.Point(74, 4),
          new Phaser.Geom.Point(64, 7),
          new Phaser.Geom.Point(75, cy - 11),
        ],
        true
      );
      g.fillPoints(
        [
          new Phaser.Geom.Point(92, cy + 13),
          new Phaser.Geom.Point(74, 76),
          new Phaser.Geom.Point(64, 73),
          new Phaser.Geom.Point(75, cy + 11),
        ],
        true
      );
      g.lineStyle(1.5, 0x64748b, 0.65);
      g.strokePoints(
        [
          new Phaser.Geom.Point(92, cy - 13),
          new Phaser.Geom.Point(74, 4),
          new Phaser.Geom.Point(64, 7),
          new Phaser.Geom.Point(75, cy - 11),
        ],
        true
      );
      g.strokePoints(
        [
          new Phaser.Geom.Point(92, cy + 13),
          new Phaser.Geom.Point(74, 76),
          new Phaser.Geom.Point(64, 73),
          new Phaser.Geom.Point(75, cy + 11),
        ],
        true
      );

      // Broad, sweeping crescent tail flukes at x=4..26
      g.fillStyle(0x0f172a, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(26, cy - 3),
          new Phaser.Geom.Point(6, cy - 24),
          new Phaser.Geom.Point(3, cy - 19),
          new Phaser.Geom.Point(13, cy),
          new Phaser.Geom.Point(3, cy + 19),
          new Phaser.Geom.Point(6, cy + 24),
          new Phaser.Geom.Point(26, cy + 3),
        ],
        true
      );
      g.lineStyle(1.2, 0x64748b, 0.6);
      g.lineBetween(24, cy - 3, 6, cy - 23);
      g.lineBetween(24, cy + 3, 6, cy + 23);

      // Long streamlined body tapering smoothly from broad head/shoulders (x=96) to narrow tail stock (x=22)
      const bodyPts = [
        new Phaser.Geom.Point(130, cy),
        new Phaser.Geom.Point(124, cy - 10),
        new Phaser.Geom.Point(108, cy - 16),
        new Phaser.Geom.Point(86, cy - 17),
        new Phaser.Geom.Point(60, cy - 12),
        new Phaser.Geom.Point(38, cy - 6),
        new Phaser.Geom.Point(20, cy - 3),
        new Phaser.Geom.Point(20, cy + 3),
        new Phaser.Geom.Point(38, cy + 6),
        new Phaser.Geom.Point(60, cy + 12),
        new Phaser.Geom.Point(86, cy + 17),
        new Phaser.Geom.Point(108, cy + 16),
        new Phaser.Geom.Point(124, cy + 10),
      ];
      g.fillStyle(0x0f172a, 1);
      g.fillPoints(bodyPts, true);
      g.lineStyle(1.2, 0x475569, 0.7);
      g.strokePoints(bodyPts, true);

      // Inner dorsal contour highlight (tapering toward tail)
      g.fillStyle(0x1e293b, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(124, cy),
          new Phaser.Geom.Point(116, cy - 8),
          new Phaser.Geom.Point(92, cy - 13),
          new Phaser.Geom.Point(62, cy - 9),
          new Phaser.Geom.Point(34, cy - 3.5),
          new Phaser.Geom.Point(34, cy + 3.5),
          new Phaser.Geom.Point(62, cy + 9),
          new Phaser.Geom.Point(92, cy + 13),
          new Phaser.Geom.Point(116, cy + 8),
        ],
        true
      );

      // Pronounced dorsal fin & dorsal ridge along the posterior back (x=42..64)
      g.fillStyle(0x020617, 0.85);
      g.fillEllipse(53, cy + 2, 22, 7);
      g.fillStyle(0x475569, 0.95);
      g.fillPoints(
        [
          new Phaser.Geom.Point(64, cy),
          new Phaser.Geom.Point(50, cy - 3.5),
          new Phaser.Geom.Point(41, cy),
          new Phaser.Geom.Point(50, cy + 3.5),
        ],
        true
      );
      g.lineStyle(1.5, 0x94a3b8, 0.85);
      g.lineBetween(63, cy, 42, cy);

      // Head callosities & rostrum ridge
      g.fillStyle(0xe2e8f0, 0.9);
      g.fillEllipse(116, cy, 11, 5.5);
      g.fillCircle(107, cy - 7, 2.2);
      g.fillCircle(107, cy + 7, 2.2);

      // Blowholes behind head
      g.fillStyle(0x64748b, 0.95);
      g.fillCircle(97, cy - 2.2, 1.5);
      g.fillCircle(97, cy + 2.2, 1.5);

      g.generateTexture('whale_swim', 136, 80);
      g.destroy();
    }

    // 2. Whale Calf (top-down, facing right / 0 rad, 84x52 — sleek tapering body & fins)
    if (!this.textures.exists('whale_calf')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 26;

      // Sweeping pectoral flippers
      g.fillStyle(0x1e293b, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(56, cy - 8),
          new Phaser.Geom.Point(44, 3),
          new Phaser.Geom.Point(38, 5),
          new Phaser.Geom.Point(45, cy - 7),
        ],
        true
      );
      g.fillPoints(
        [
          new Phaser.Geom.Point(56, cy + 8),
          new Phaser.Geom.Point(44, 49),
          new Phaser.Geom.Point(38, 47),
          new Phaser.Geom.Point(45, cy + 7),
        ],
        true
      );

      // Tail flukes
      g.fillPoints(
        [
          new Phaser.Geom.Point(16, cy - 2),
          new Phaser.Geom.Point(4, cy - 15),
          new Phaser.Geom.Point(2, cy - 12),
          new Phaser.Geom.Point(8, cy),
          new Phaser.Geom.Point(2, cy + 12),
          new Phaser.Geom.Point(4, cy + 15),
          new Phaser.Geom.Point(16, cy + 2),
        ],
        true
      );

      // Streamlined tapering body
      g.fillStyle(0x1e293b, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(78, cy),
          new Phaser.Geom.Point(72, cy - 7),
          new Phaser.Geom.Point(54, cy - 11),
          new Phaser.Geom.Point(34, cy - 7),
          new Phaser.Geom.Point(13, cy - 2),
          new Phaser.Geom.Point(13, cy + 2),
          new Phaser.Geom.Point(34, cy + 7),
          new Phaser.Geom.Point(54, cy + 11),
          new Phaser.Geom.Point(72, cy + 7),
        ],
        true
      );

      // Pronounced dorsal fin ridge on calf
      g.fillStyle(0x64748b, 0.95);
      g.fillPoints(
        [
          new Phaser.Geom.Point(40, cy),
          new Phaser.Geom.Point(31, cy - 2.5),
          new Phaser.Geom.Point(25, cy),
          new Phaser.Geom.Point(31, cy + 2.5),
        ],
        true
      );

      // Calf head callosity
      g.fillStyle(0xf1f5f9, 0.9);
      g.fillEllipse(69, cy, 7, 3.5);

      g.generateTexture('whale_calf', 84, 52);
      g.destroy();
    }

    // 3. Bioluminescent Copepod / Krill Bloom (64x64)
    if (!this.textures.exists('copepod_bloom')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xf472b6, 0.18);
      g.fillCircle(32, 32, 28);
      g.fillStyle(0xfb7185, 0.28);
      g.fillCircle(30, 30, 20);

      // Individual glowing zooplankton specks
      const pts = [
        [22, 24],
        [36, 20],
        [42, 30],
        [28, 38],
        [18, 34],
        [34, 42],
        [26, 28],
        [38, 34],
        [31, 23],
        [45, 25],
        [20, 41],
      ];
      for (const [px, py] of pts) {
        g.fillStyle(0xfda4af, 0.9);
        g.fillCircle(px, py, 2.2);
        g.fillStyle(0xfef08a, 0.95);
        g.fillCircle(px + 1, py - 1, 1.1);
      }

      g.generateTexture('copepod_bloom', 64, 64);
      g.destroy();
    }

    // 4. Drifting Ghost Fishing Net & Lobster Pot Buoys (76x56)
    if (!this.textures.exists('ghost_net')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Tangled synthetic mesh webbing
      g.lineStyle(1.5, 0x94a3b8, 0.65);
      for (let x = 10; x <= 64; x += 9) {
        g.lineBetween(x, 10, x + 6, 46);
      }
      for (let y = 12; y <= 44; y += 8) {
        g.lineBetween(10, y, 66, y + 4);
      }
      // Heavy leadline border rope
      g.lineStyle(2.5, 0xcbd5e1, 0.85);
      g.strokeRoundedRect(10, 12, 56, 32, 8);

      // High-visibility orange/red commercial trap buoys
      g.fillStyle(0xf97316, 1);
      g.fillCircle(14, 16, 6);
      g.fillCircle(62, 38, 6);
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(38, 12, 4.5);

      g.generateTexture('ghost_net', 76, 56);
      g.destroy();
    }

    // 5. Industrial Seismic Survey / Sonar Buoy (48x48)
    if (!this.textures.exists('seismic_buoy')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xef4444, 0.25);
      g.fillCircle(24, 24, 22);
      g.fillStyle(0x334155, 1);
      g.fillCircle(24, 24, 14);
      g.lineStyle(2.5, 0xf59e0b, 1);
      g.strokeCircle(24, 24, 14);
      g.fillStyle(0xef4444, 1);
      g.fillCircle(24, 24, 5);
      g.generateTexture('seismic_buoy', 48, 48);
      g.destroy();
    }

    // 6. Ambiguous Unidentified Deep-Water Silhouette (shared by both Food & Traps until pinged by Sonar)
    if (!this.textures.exists('sonar_mystery')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      // Outer murky shadow cloud
      g.fillStyle(0x1e293b, 0.55);
      g.fillCircle(34, 34, 28);
      g.fillStyle(0x334155, 0.65);
      g.fillEllipse(34, 34, 42, 34);
      // Faint ambiguous inner core
      g.fillStyle(0x475569, 0.5);
      g.fillCircle(32, 33, 11);
      // Subtle dashed unknown ring
      g.lineStyle(1.5, 0x64748b, 0.45);
      g.strokeCircle(34, 34, 24);
      g.generateTexture('sonar_mystery', 68, 68);
      g.destroy();
    }
  }

  private generateLemurTextures(): void {
    // 1. Adult Ring-Tailed Lemur walking/scampering (68x44 px, facing right / 0 rad)
    if (!this.textures.exists('lemur_walk')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 22;

      // Iconic long black-and-white banded tail trailing left (x = 4..34)
      for (let i = 0; i < 6; i++) {
        const segX = 4 + i * 5;
        g.fillStyle(i % 2 === 0 ? 0x0f172a : 0xf8fafc, 1);
        g.fillRoundedRect(segX, cy - 2.6, 5.4, 5.2, 2);
      }

      // Shadow under body
      g.fillStyle(0x020617, 0.32);
      g.fillEllipse(44, cy + 2, 28, 18);

      // Paws
      g.fillStyle(0xcbd5e1, 1);
      g.fillEllipse(37, cy - 8, 8, 4.5);
      g.fillEllipse(37, cy + 8, 8, 4.5);
      g.fillEllipse(51, cy - 7, 7, 4);
      g.fillEllipse(51, cy + 7, 7, 4);

      // Torso (warm grey-agouti back)
      g.fillStyle(0x94a3b8, 1);
      g.fillEllipse(44, cy, 24, 15);
      g.fillStyle(0x64748b, 1);
      g.fillEllipse(43, cy, 17, 10);

      // Pale shoulders & white ears
      g.fillStyle(0xe2e8f0, 1);
      g.fillCircle(53, cy - 6.5, 3.2);
      g.fillCircle(53, cy + 6.5, 3.2);

      // Head with white cheeks and dark triangular eye masks
      g.fillStyle(0xf8fafc, 1);
      g.fillEllipse(58, cy, 13, 11);
      g.fillStyle(0x0f172a, 1);
      g.fillEllipse(59, cy - 3.2, 4.5, 3.2);
      g.fillEllipse(59, cy + 3.2, 4.5, 3.2);
      g.fillCircle(64.5, cy, 2); // black muzzle nose

      g.generateTexture('lemur_walk', 68, 44);
      g.destroy();
    }

    // 2. Ring-Tailed Lemur mid-leap (76x48 px, outstretched limbs)
    if (!this.textures.exists('lemur_leap')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 24;

      // Streaming banded tail
      for (let i = 0; i < 7; i++) {
        const segX = 2 + i * 5;
        g.fillStyle(i % 2 === 0 ? 0x0f172a : 0xf8fafc, 1);
        g.fillRoundedRect(segX, cy - 2.4, 5.4, 4.8, 2);
      }

      // Outstretched hind & fore legs
      g.fillStyle(0xe2e8f0, 1);
      g.fillEllipse(35, cy - 11, 13, 4.5);
      g.fillEllipse(35, cy + 11, 13, 4.5);
      g.fillEllipse(60, cy - 10, 13, 4.5);
      g.fillEllipse(60, cy + 10, 13, 4.5);

      // Sleek elongated leaping torso
      g.fillStyle(0x94a3b8, 1);
      g.fillEllipse(48, cy, 28, 13);
      g.fillStyle(0x64748b, 1);
      g.fillEllipse(47, cy, 20, 8.5);

      // Head
      g.fillStyle(0xf8fafc, 1);
      g.fillEllipse(64, cy, 13, 10.5);
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(65, cy - 3, 2.2);
      g.fillCircle(65, cy + 3, 2.2);
      g.fillCircle(70.5, cy, 2);

      g.generateTexture('lemur_leap', 76, 48);
      g.destroy();
    }

    // 3. Waiting Troop Juvenile at Ancient Baobab Sanctuary (44x32 px)
    if (!this.textures.exists('lemur_troop')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 16;

      for (let i = 0; i < 4; i++) {
        g.fillStyle(i % 2 === 0 ? 0x0f172a : 0xf8fafc, 1);
        g.fillRoundedRect(3 + i * 4.5, cy - 2, 4.8, 4, 1.5);
      }
      g.fillStyle(0x94a3b8, 1);
      g.fillEllipse(26, cy, 16, 11);
      g.fillStyle(0xf8fafc, 1);
      g.fillCircle(35, cy, 6);
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(36, cy - 2.2, 1.6);
      g.fillCircle(36, cy + 2.2, 1.6);
      g.fillCircle(40, cy, 1.5);

      g.generateTexture('lemur_troop', 44, 32);
      g.destroy();
    }

    // 4. Ripe Tamarind Pods & Fig Cluster (44x44 px)
    if (!this.textures.exists('tamarind_fruit')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xfbbf24, 0.22);
      g.fillCircle(22, 22, 19);
      g.fillStyle(0x16a34a, 0.45);
      g.fillCircle(22, 22, 13);

      // Golden-amber & warm brown tamarind pods
      g.fillStyle(0xd97706, 1);
      g.fillEllipse(18, 19, 13, 6.5);
      g.fillEllipse(26, 25, 13, 6.5);
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(25, 16, 4.5);
      g.fillCircle(17, 27, 4);
      g.fillStyle(0xfef08a, 0.95);
      g.fillCircle(26, 15, 1.8);

      g.generateTexture('tamarind_fruit', 44, 44);
      g.destroy();
    }

    // 5. Fossa Ground Ambush Predator (68x36 px, facing right / 0 rad)
    if (!this.textures.exists('fossa_predator')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 18;

      // Shadow
      g.fillStyle(0x020617, 0.35);
      g.fillEllipse(34, cy + 2, 40, 18);

      // Long muscular tail trailing left
      g.fillStyle(0x7c2d12, 1);
      g.fillRoundedRect(2, cy - 2.5, 24, 5, 2.5);

      // Paws
      g.fillStyle(0x9a3412, 1);
      g.fillEllipse(27, cy - 8, 9, 4);
      g.fillEllipse(27, cy + 8, 9, 4);
      g.fillEllipse(46, cy - 8, 9, 4);
      g.fillEllipse(46, cy + 8, 9, 4);

      // Sleek reddish-brown predatory body
      g.fillStyle(0x9a3412, 1);
      g.fillEllipse(37, cy, 30, 15);
      g.fillStyle(0xb45309, 0.85);
      g.fillEllipse(39, cy, 22, 10);

      // Ears & predatory snout
      g.fillStyle(0x7c2d12, 1);
      g.fillCircle(51, cy - 6, 3);
      g.fillCircle(51, cy + 6, 3);
      g.fillStyle(0x9a3412, 1);
      g.fillEllipse(56, cy, 14, 10);

      // Amber predator eyes & dark nose
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(57, cy - 2.8, 1.7);
      g.fillCircle(57, cy + 2.8, 1.7);
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(63, cy, 2);

      g.generateTexture('fossa_predator', 68, 36);
      g.destroy();
    }

    // 6. Industrial Logging Timber Truck (146x52 px, facing right / 0 rad)
    if (!this.textures.exists('logging_truck')) {
      const g = this.make.graphics({ x: 0, y: 0 });

      // Ground shadow
      g.fillStyle(0x020617, 0.45);
      g.fillRoundedRect(4, 8, 138, 40, 8);

      // Tires
      g.fillStyle(0x0f172a, 1);
      for (const wx of [18, 40, 84, 122]) {
        g.fillRoundedRect(wx, 2, 14, 6, 2);
        g.fillRoundedRect(wx, 44, 14, 6, 2);
      }

      // Steel flatbed trailer (left/rear)
      g.fillStyle(0x334155, 1);
      g.fillRoundedRect(4, 6, 98, 40, 4);

      // Stacked felled hardwood logs on trailer
      g.fillStyle(0x78350f, 1);
      g.fillRoundedRect(8, 9, 90, 10, 3);
      g.fillRoundedRect(8, 21, 90, 10, 3);
      g.fillRoundedRect(8, 33, 90, 10, 3);
      g.fillStyle(0x92400e, 1);
      g.fillRoundedRect(10, 11, 86, 6, 2);
      g.fillRoundedRect(10, 23, 86, 6, 2);
      g.fillRoundedRect(10, 35, 86, 6, 2);

      // Heavy industrial yellow cab (right/front)
      g.fillStyle(0xd97706, 1);
      g.fillRoundedRect(104, 7, 36, 38, 6);
      // Windshield
      g.fillStyle(0x0f172a, 1);
      g.fillRoundedRect(126, 11, 10, 30, 3);
      // Headlight beam cones
      g.fillStyle(0xfef08a, 0.85);
      g.fillRect(139, 11, 4, 6);
      g.fillRect(139, 35, 4, 6);

      g.generateTexture('logging_truck', 146, 52);
      g.destroy();
    }

    // 7. Canopy Leaf Drift Particle (8x8 px)
    if (!this.textures.exists('leaf_dot')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x4ade80, 0.85);
      g.fillEllipse(4, 4, 7, 4);
      g.generateTexture('leaf_dot', 8, 8);
      g.destroy();
    }
  }

  private generateTurtleTextures(): void {
    // 1. Hatchling Loggerhead Sea Turtle crawling (44x36 px, facing right / 0 rad)
    if (!this.textures.exists('turtle_crawl')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 18;

      // Soft ground shadow
      g.fillStyle(0x020617, 0.35);
      g.fillEllipse(21, cy + 1.5, 26, 19);

      // Rear flippers
      g.fillStyle(0x3f4f3c, 1);
      g.fillEllipse(9, cy - 8, 9, 4.5);
      g.fillEllipse(9, cy + 8, 9, 4.5);

      // Broad front swimming/crawling flippers
      g.fillStyle(0x4d6046, 1);
      g.fillEllipse(25, cy - 13, 13, 5.5);
      g.fillEllipse(25, cy + 13, 13, 5.5);

      // Carapace oval with ridge scutes
      g.fillStyle(0x3b4d36, 1);
      g.fillEllipse(20, cy, 22, 16);
      g.fillStyle(0x556b49, 1);
      g.fillEllipse(20, cy, 15, 11);
      g.fillStyle(0x6e875d, 0.9);
      g.fillEllipse(20, cy, 9, 4);

      // Head facing right + dark eyes
      g.fillStyle(0x4d6046, 1);
      g.fillEllipse(34, cy, 10, 7.5);
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(36.5, cy - 2.3, 1.3);
      g.fillCircle(36.5, cy + 2.3, 1.3);

      g.generateTexture('turtle_crawl', 44, 36);
      g.destroy();
    }

    // 2. Hatchling tucked & camouflaged in sand mound (44x36 px)
    if (!this.textures.exists('turtle_burrow')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 18;

      // Disturbed sand rim & mound
      g.fillStyle(0x334155, 0.85);
      g.fillEllipse(22, cy, 34, 24);
      g.fillStyle(0x475569, 0.95);
      g.fillEllipse(22, cy, 27, 19);

      // Subtle half-buried shell outline & sand grains
      g.fillStyle(0x3b4d36, 0.65);
      g.fillEllipse(22, cy, 16, 12);
      g.fillStyle(0x64748b, 0.9);
      g.fillCircle(17, cy - 4, 2.2);
      g.fillCircle(26, cy + 4, 2.4);
      g.fillCircle(24, cy - 5, 1.8);
      g.fillCircle(18, cy + 5, 2.0);

      g.generateTexture('turtle_burrow', 44, 36);
      g.destroy();
    }

    // 3. Nocturnal Ghost Crab predator (40x34 px, facing right / 0 rad)
    if (!this.textures.exists('ghost_crab')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 17;

      // Shadow
      g.fillStyle(0x020617, 0.35);
      g.fillEllipse(19, cy + 1.5, 22, 18);

      // Scuttling legs (3 per side)
      g.lineStyle(2.2, 0xcbd5e1, 1);
      for (const offset of [-5, 0, 5]) {
        g.lineBetween(18 + offset, cy - 7, 16 + offset * 1.3, cy - 14);
        g.lineBetween(18 + offset, cy + 7, 16 + offset * 1.3, cy + 14);
      }

      // Front pincers reaching right
      g.fillStyle(0xf1f5f9, 1);
      g.fillEllipse(31, cy - 7, 10, 4.5);
      g.fillEllipse(31, cy + 7, 10, 4.5);

      // Pale square-oval carapace
      g.fillStyle(0xe2e8f0, 1);
      g.fillRoundedRect(10, cy - 9, 17, 18, 5);
      g.fillStyle(0xcbd5e1, 1);
      g.fillRoundedRect(13, cy - 6, 11, 12, 3);

      // Dark eye stalks
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(26, cy - 3.5, 1.8);
      g.fillCircle(26, cy + 3.5, 1.8);

      g.generateTexture('ghost_crab', 40, 34);
      g.destroy();
    }

    // 4. Overhead coastal seabird silhouette (72x52 px, facing right / 0 rad)
    if (!this.textures.exists('seabird_shadow')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      const cy = 26;

      // Swept wings
      g.fillStyle(0x0f172a, 0.92);
      g.fillTriangle(44, cy, 18, 3, 24, cy);
      g.fillTriangle(44, cy, 18, 49, 24, cy);

      // Pale wingtips
      g.fillStyle(0xcbd5e1, 0.85);
      g.fillCircle(19, 6, 3);
      g.fillCircle(19, 46, 3);

      // Tapered fuselage & tail feathers
      g.fillStyle(0x1e293b, 0.96);
      g.fillEllipse(36, cy, 34, 10);
      g.fillTriangle(20, cy, 7, cy - 6, 7, cy + 6);

      // Beak
      g.fillStyle(0xf59e0b, 0.95);
      g.fillTriangle(52, cy - 2.5, 52, cy + 2.5, 65, cy);

      g.generateTexture('seabird_shadow', 72, 52);
      g.destroy();
    }

    // 5. Tangled beach plastic debris snare (58x46 px)
    if (!this.textures.exists('plastic_debris')) {
      const g = this.make.graphics({ x: 0, y: 0 });

      // Translucent crumpled plastic bag sheet
      g.fillStyle(0xbae6fd, 0.34);
      g.fillRoundedRect(6, 9, 34, 26, 8);
      g.fillStyle(0xe0f2fe, 0.28);
      g.fillEllipse(36, 23, 26, 20);

      // Six-pack plastic rings
      g.lineStyle(2, 0xf8fafc, 0.8);
      g.strokeCircle(20, 20, 6.5);
      g.strokeCircle(31, 20, 6.5);
      g.strokeCircle(25, 29, 6.5);

      // Discarded bottle caps
      g.fillStyle(0xef4444, 0.9);
      g.fillCircle(44, 17, 4.5);
      g.fillStyle(0x3b82f6, 0.9);
      g.fillCircle(14, 33, 4);

      g.generateTexture('plastic_debris', 58, 46);
      g.destroy();
    }

    // 6. Cool damp tide-pool kelp patch (52x52 px)
    if (!this.textures.exists('wet_kelp')) {
      const g = this.make.graphics({ x: 0, y: 0 });

      // Cool moisture puddle aura
      g.fillStyle(0x0d9488, 0.32);
      g.fillCircle(26, 26, 23);
      g.fillStyle(0x2dd4bf, 0.28);
      g.fillCircle(26, 26, 16);

      // Tangled dark emerald & olive kelp ribbons
      g.fillStyle(0x065f46, 0.95);
      g.fillEllipse(20, 22, 22, 8);
      g.fillEllipse(31, 29, 22, 8);
      g.fillStyle(0x10b981, 0.9);
      g.fillEllipse(26, 24, 18, 7);
      g.fillStyle(0x5eead4, 0.85);
      g.fillCircle(24, 19, 2.2);
      g.fillCircle(31, 27, 2);

      g.generateTexture('wet_kelp', 52, 52);
      g.destroy();
    }

    // 7. Weathered driftwood cover casting dark shade (92x42 px)
    if (!this.textures.exists('driftwood_cover')) {
      const g = this.make.graphics({ x: 0, y: 0 });

      // Ground shadow
      g.fillStyle(0x020617, 0.45);
      g.fillEllipse(46, 24, 86, 30);

      // Main weathered driftwood trunk & fork
      g.fillStyle(0x574c41, 1);
      g.fillRoundedRect(6, 12, 78, 17, 7);
      g.fillStyle(0x786858, 1);
      g.fillRoundedRect(10, 14, 68, 11, 5);
      g.fillStyle(0x8c7a68, 0.8);
      g.fillRoundedRect(16, 17, 46, 4, 2);

      // Broken stub branch
      g.fillStyle(0x574c41, 1);
      g.fillRoundedRect(54, 5, 16, 10, 4);

      g.generateTexture('driftwood_cover', 92, 42);
      g.destroy();
    }

    // 8. Moonlit sand / sea spray speck particle (8x8 px)
    if (!this.textures.exists('sand_dot')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xcbd5e1, 0.7);
      g.fillCircle(4, 4, 2.5);
      g.generateTexture('sand_dot', 8, 8);
      g.destroy();
    }
  }
}
