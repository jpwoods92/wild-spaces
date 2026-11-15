import Phaser from 'phaser';
import { POLAR_BEAR_ASSETS, WHALE_ASSETS } from '../config/AssetManifest';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Load any external artist files that have been flipped to `useExternalFile: true`
    for (const asset of [...POLAR_BEAR_ASSETS, ...WHALE_ASSETS]) {
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

    // Start on WhaleScene (Episode 2) directly so the user can test the new game right away,
    // while keeping HubScene & Episode 1 one click away via "World Habitat Map".
    this.scene.start('WhaleScene');
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
    // 1. Adult North Atlantic Right Whale (top-down, facing right / 0 rad, 112x64)
    if (!this.textures.exists('whale_swim')) {
      const g = this.make.graphics({ x: 0, y: 0 });

      // Subtle bioluminescent / deep water aura
      g.fillStyle(0x38bdf8, 0.14);
      g.fillEllipse(60, 32, 92, 48);

      // Broad tail flukes (left side, x=2..24)
      g.fillStyle(0x0f172a, 1);
      g.fillTriangle(4, 8, 26, 29, 12, 32);
      g.fillTriangle(4, 56, 26, 35, 12, 32);
      // Tail notch highlight
      g.lineStyle(1.5, 0x475569, 0.7);
      g.lineBetween(4, 8, 22, 28);
      g.lineBetween(4, 56, 22, 36);

      // Tail stock (peduncle)
      g.fillStyle(0x1e293b, 1);
      g.fillEllipse(32, 32, 30, 16);

      // Paddle-shaped pectoral flippers
      g.fillStyle(0x0f172a, 1);
      g.fillEllipse(66, 10, 22, 11);
      g.fillEllipse(66, 54, 22, 11);
      g.lineStyle(1, 0x64748b, 0.5);
      g.strokeEllipse(66, 10, 22, 11);
      g.strokeEllipse(66, 54, 22, 11);

      // Rotund dark slate-black body (Right Whales have broad backs and no dorsal fin)
      g.fillStyle(0x0f172a, 1);
      g.fillEllipse(64, 32, 68, 36);
      g.fillStyle(0x1e293b, 1);
      g.fillEllipse(66, 32, 58, 28);

      // Broad arched head / rostrum
      g.fillStyle(0x0f172a, 1);
      g.fillEllipse(90, 32, 34, 26);

      // Distinctive pale/rough callosity patches on rostrum & brow (signature of Right Whales)
      g.fillStyle(0xe2e8f0, 0.92);
      g.fillEllipse(98, 32, 11, 7); // Bonnet callosity
      g.fillCircle(91, 25, 2.5); // Brow callosities
      g.fillCircle(91, 39, 2.5);
      g.fillCircle(103, 28, 2);
      g.fillCircle(103, 36, 2);

      // V-shaped blowholes behind head
      g.fillStyle(0x64748b, 0.9);
      g.fillCircle(80, 29.5, 1.6);
      g.fillCircle(80, 34.5, 1.6);

      g.generateTexture('whale_swim', 112, 64);
      g.destroy();
    }

    // 2. Right Whale Calf (top-down, facing right / 0 rad, 64x38)
    if (!this.textures.exists('whale_calf')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x38bdf8, 0.22);
      g.fillEllipse(34, 19, 52, 28);

      // Tail flukes
      g.fillStyle(0x1e293b, 1);
      g.fillTriangle(3, 6, 16, 17, 8, 19);
      g.fillTriangle(3, 32, 16, 21, 8, 19);

      // Flippers
      g.fillEllipse(38, 6, 13, 6);
      g.fillEllipse(38, 32, 13, 6);

      // Body
      g.fillStyle(0x1e293b, 1);
      g.fillEllipse(36, 19, 40, 21);
      g.fillStyle(0x334155, 1);
      g.fillEllipse(38, 19, 32, 16);

      // Calf head callosities
      g.fillStyle(0xf1f5f9, 0.9);
      g.fillEllipse(54, 19, 7, 4.5);
      g.fillCircle(49, 15, 1.6);
      g.fillCircle(49, 23, 1.6);

      g.generateTexture('whale_calf', 64, 38);
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
  }
}
