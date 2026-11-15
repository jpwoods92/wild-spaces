import Phaser from 'phaser';
import { POLAR_BEAR_ASSETS } from '../config/AssetManifest';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load any external artist files that have been flipped to `useExternalFile: true`
    for (const asset of POLAR_BEAR_ASSETS) {
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

    // Start on the PolarBearScene directly so the user can test gameplay right away,
    // while keeping HubScene one click away via "World Habitat Map".
    this.scene.start('PolarBearScene');
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
}
