import Phaser from 'phaser';
import {
  formatDuration,
  recordLevelCompletion,
} from '../utils/LeaderboardStore';
import { ShippingCorridorManager } from '../systems/ShippingCorridorManager';
import {
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager';
import { globalPauseManager } from '../systems/PauseManager';

interface CopepodBloom {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  consumed: boolean;
  revealTimer: number;
  pulsePhase: number;
  sprite: Phaser.GameObjects.Image;
  sonarRing: Phaser.GameObjects.Graphics;
}

interface GhostNetHazard {
  x: number;
  y: number;
  radius: number;
  vx: number;
  snagged: boolean;
  revealTimer: number;
  sprite: Phaser.GameObjects.Image;
  sonarRing: Phaser.GameObjects.Graphics;
}

interface SeismicBuoy {
  x: number;
  y: number;
  pulseTimer: number;
  pulseInterval: number;
  sprite: Phaser.GameObjects.Image;
}

interface AcousticWave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  kind: 'whale_call' | 'calf_echo' | 'noise_pulse';
  color: number;
}

interface EchoBeacon {
  angle: number;
  timer: number;
  maxTimer: number;
  isDecoy: boolean;
}

export interface WhaleSceneData {
  level?: number;
  cumulativeMeters?: number;
  cumulativeSwum?: number;
  cumulativeBlooms?: number;
  cumulativeEntanglements?: number;
  cumulativeTimeSeconds?: number;
}

export class WhaleScene extends Phaser.Scene {
  // World dimensions (2D open ocean in all 360 degrees)
  private readonly BASE_MIGRATION_METERS = 1000;
  private readonly METERS_PER_LEVEL_STEP = 300;
  private readonly PIXELS_PER_METER = 6.2;
  private readonly DECOY_CLEAR_DISTANCE_METERS = 420;

  private level = 1;
  private migrationDistanceMeters = 1000;
  private targetRadiusPx = 6200;
  private worldWidth = 15200;
  private worldHeight = 15200;
  private startX = 7600;
  private startY = 7600;
  private calfAngle = -Math.PI / 2;
  private goalX = 7600;
  private goalY = 1400;

  private cumulativeMetersBeforeLevel = 0;
  private cumulativeTimeBeforeLevel = 0;
  private levelElapsedSeconds = 0;
  private cumulativeSwumBeforeLevel = 0;
  private cumulativeBloomsBeforeLevel = 0;
  private cumulativeEntanglementsBeforeLevel = 0;

  // Player state
  private whale!: Phaser.GameObjects.Image;
  private whaleX = 7600;
  private whaleY = 7600;
  private whaleVx = 0;
  private whaleVy = 0;

  // Unified Stamina + Max Stamina system
  private stamina = 100;
  private maxStamina = 100;
  private entangledStacks = 0;
  private entangleStruggleProgress = 0;
  private noiseMaskingTimer = 0;
  private callCooldownTimer = 0;
  private callCooldownMax = 2.6;
  private echoBeacons: EchoBeacon[] = [];
  private announcedDecoyLock = false;
  private isEnding = false;

  // Stats
  private maxNorthMetersInLevel = 0;
  private currentMetersToCalf = 1000;
  private swimPixels = 0;
  private bloomsConsumed = 0;
  private entanglementsHit = 0;

  // World entities
  private blooms: CopepodBloom[] = [];
  private ghostNets: GhostNetHazard[] = [];
  private seismicBuoys: SeismicBuoy[] = [];
  private shippingManager!: ShippingCorridorManager;
  private acousticWaves: AcousticWave[] = [];
  private calfSprite!: Phaser.GameObjects.Image;

  // Visual layers & Shared Episode UI Manager
  private oceanCurrentGraphics!: Phaser.GameObjects.Graphics;
  private acousticGraphics!: Phaser.GameObjects.Graphics;
  private entangledRopeGraphics!: Phaser.GameObjects.Graphics;
  private darknessOverlayGraphics!: Phaser.GameObjects.Graphics;
  private uiManager!: EpisodeUIManager;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: 'WhaleScene' });
  }

  init(data?: WhaleSceneData): void {
    this.level = data?.level && data.level >= 1 ? Math.floor(data.level) : 1;
    this.cumulativeMetersBeforeLevel = data?.cumulativeMeters ?? 0;
    this.cumulativeTimeBeforeLevel = data?.cumulativeTimeSeconds ?? 0;
    this.levelElapsedSeconds = 0;
    this.cumulativeSwumBeforeLevel = data?.cumulativeSwum ?? 0;
    this.cumulativeBloomsBeforeLevel = data?.cumulativeBlooms ?? 0;
    this.cumulativeEntanglementsBeforeLevel = data?.cumulativeEntanglements ?? 0;

    this.migrationDistanceMeters =
      this.BASE_MIGRATION_METERS + (this.level - 1) * this.METERS_PER_LEVEL_STEP;
    this.targetRadiusPx = Math.round(
      this.migrationDistanceMeters * this.PIXELS_PER_METER
    );

    const worldSize = this.targetRadiusPx * 2 + 2800;
    this.worldWidth = worldSize;
    this.worldHeight = worldSize;
    this.startX = Math.round(worldSize / 2);
    this.startY = Math.round(worldSize / 2);

    // Choose a random 360-degree bearing for the Calf Sanctuary (with enough vertical component for shipping lane crossings)
    let angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    while (Math.abs(Math.sin(angle)) < 0.42) {
      angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    }
    this.calfAngle = angle;
    this.goalX = Math.round(
      this.startX + Math.cos(this.calfAngle) * this.targetRadiusPx
    );
    this.goalY = Math.round(
      this.startY + Math.sin(this.calfAngle) * this.targetRadiusPx
    );
  }

  create(): void {
    this.resetState();

    // Update topbar subtitle to reflect Episode 2
    const subtitleEl = document.querySelector('.brand-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent =
        'Episode 2: Drowned Echoes (North Atlantic Right Whale)';
    }

    // 1. Deep North Atlantic Ocean Backdrop
    this.createOceanBackdrop();

    // 2. Spawn Sanctuary at random 360° bearing, Copepod Blooms, Ghost Nets, Seismic Buoys & Shipping Lanes
    this.spawnSanctuary();
    this.spawnShippingCorridors();
    this.spawnOceanMigrationField();

    // 3. Acoustic wave & entangled rope layers
    this.acousticGraphics = this.add.graphics().setDepth(16);
    this.entangledRopeGraphics = this.add.graphics().setDepth(19);

    // 4. Spawn Player North Atlantic Right Whale at center with a random initial facing angle
    this.whaleX = this.startX;
    this.whaleY = this.startY;
    this.whale = this.add
      .image(this.whaleX, this.whaleY, 'whale_swim')
      .setDepth(20)
      .setRotation(Phaser.Math.FloatBetween(-Math.PI, Math.PI));

    // 5. Ambient marine snow particles
    this.add
      .particles(0, 0, 'snow_dot', {
        x: { min: 0, max: this.scale.width },
        y: { min: 0, max: this.scale.height },
        lifespan: 5200,
        speedY: { min: 12, max: 32 },
        speedX: { min: -10, max: 10 },
        scale: { start: 0.45, end: 0.1 },
        alpha: { start: 0.22, end: 0 },
        quantity: 1,
        frequency: 110,
      })
      .setScrollFactor(0)
      .setDepth(28);

    // 6. Acoustic Masking / Deep Darkness Vignette Overlay
    this.darknessOverlayGraphics = this.add.graphics().setDepth(25);

    // 7. Camera Setup (centered on whale for 360-degree navigation)
    this.cameras.main.setBounds(0, 0, this.worldWidth, this.worldHeight);
    this.cameras.main.startFollow(this.whale, true, 0.09, 0.09, 0, 0);

    // 8. Controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D,SPACE') as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
      SPACE: Phaser.Input.Keyboard.Key;
    };

    // 9. Shared Episode HUD & World-Space Bars
    this.uiManager = new EpisodeUIManager(this, {
      accentColor: 0x818cf8,
      accentHex: '#818cf8',
      bottomHint:
        'WASD / Arrows: Swim  •  SPACE: Sing (Reveal Food, Nets & Calf Bearing)  •  P / ESC: Pause',
      worldUiYOffset: 84,
      worldBarWidth: 78,
    });
    this.uiManager.redrawViewportBg(0x030b17);
    globalPauseManager.attachScene(this);

    // Emit an initial welcome sonar pulse so the player immediately sees the first bearing echo
    this.emitWhaleCall(true);

    this.scale.on('resize', () => {
      this.uiManager.handleResize(0x030b17);
    });
  }

  private resetState(): void {
    this.stamina = 100;
    this.maxStamina = 100;
    this.entangledStacks = 0;
    this.entangleStruggleProgress = 0;
    this.noiseMaskingTimer = 0;
    this.callCooldownTimer = 0;
    this.callCooldownMax = 2.6;
    this.echoBeacons = [];
    this.announcedDecoyLock = false;
    this.isEnding = false;
    this.levelElapsedSeconds = 0;
    this.maxNorthMetersInLevel = 0;
    this.currentMetersToCalf = this.migrationDistanceMeters;
    this.swimPixels = 0;
    this.bloomsConsumed = 0;
    this.entanglementsHit = 0;
    this.blooms = [];
    this.ghostNets = [];
    this.seismicBuoys = [];
    if (!this.shippingManager) {
      this.shippingManager = new ShippingCorridorManager(this);
    } else {
      this.shippingManager.clear();
    }
    this.acousticWaves = [];
    this.whaleVx = 0;
    this.whaleVy = 0;
  }

  /**
   * Infinite Mode 3-Factor Difficulty Scaling for Episode 2:
   * 1. Copepod Blooms become sparser each level down to a floor.
   * 2. Ghost fishing gear & seismic noise density increase up to a cap.
   * 3. Migration distance increases by +300m per level without cap.
   */
  private getDifficultyProfile(): {
    bloomSpacingY: number;
    bloomSpawnChance: number;
    ghostNetChance: number;
    routeBuoyCount: number;
    ambientBuoyCount: number;
    shipNoiseInterval: number;
    shipNoiseRadius: number;
    buoyNoiseRadius: number;
    maskingDuration: number;
    maskedCallRadius: number;
    maskedDecayMultiplier: number;
  } {
    const lvlOffset = this.level - 1;
    // Concentric rings are spaced wider apart (starting at 480px on Level 1 up to 720px)
    const bloomSpacingY = Math.min(720, 480 + lvlOffset * 55);
    // Only a fraction of sector nodes contain a Copepod Bloom (42% on Level 1 down to 20% floor)
    const bloomSpawnChance = Math.max(0.2, 0.42 - lvlOffset * 0.05);
    // Ghost net density increases up to a cap
    const ghostNetChance = Math.min(0.9, 0.55 + lvlOffset * 0.08);
    // Seismic survey buoys along the calf route start at 4 on Level 1 and increase by +3 per level (up to 19)
    const routeBuoyCount = Math.min(19, 4 + lvlOffset * 3);
    // Ambient 360° ocean seismic buoys start at 6 on Level 1 and increase by +4 per level (up to 26)
    const ambientBuoyCount = Math.min(26, 6 + lvlOffset * 4);

    // Acoustic noise intensity scales up gradually across levels instead of hitting hard on Level 1
    const shipNoiseInterval = Math.max(1.75, 3.2 - lvlOffset * 0.32);
    const shipNoiseRadius = Math.min(350, 210 + lvlOffset * 32);
    const buoyNoiseRadius = Math.min(430, 280 + lvlOffset * 32);
    const maskingDuration = Math.min(2.2, 1.0 + lvlOffset * 0.28);
    const maskedCallRadius = Math.max(420, 590 - lvlOffset * 38);
    const maskedDecayMultiplier = Math.min(2.0, 1.25 + lvlOffset * 0.18);

    return {
      bloomSpacingY,
      bloomSpawnChance,
      ghostNetChance,
      routeBuoyCount,
      ambientBuoyCount,
      shipNoiseInterval,
      shipNoiseRadius,
      buoyNoiseRadius,
      maskingDuration,
      maskedCallRadius,
      maskedDecayMultiplier,
    };
  }

  private createOceanBackdrop(): void {
    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x020813, 0x020813, 0x07192e, 0x051324, 1);
    bg.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // Subtle 2D bathymetric depth grid contours across the open ocean
    this.oceanCurrentGraphics = this.add.graphics().setDepth(1);
    this.oceanCurrentGraphics.lineStyle(1, 0x1e3a5f, 0.2);
    for (let y = 200; y < this.worldHeight; y += 260) {
      this.oceanCurrentGraphics.lineBetween(0, y, this.worldWidth, y);
    }
    for (let x = 200; x < this.worldWidth; x += 260) {
      this.oceanCurrentGraphics.lineBetween(x, 0, x, this.worldHeight);
    }
  }

  private spawnSanctuary(): void {
    // Warm bioluminescent Calving & Feeding Sanctuary at random 360° location (goalX, goalY)
    const sanctuaryGlow = this.add.graphics().setDepth(4);
    sanctuaryGlow.fillStyle(0x0ea5e9, 0.14);
    sanctuaryGlow.fillCircle(this.goalX, this.goalY, 320);
    sanctuaryGlow.fillStyle(0x38bdf8, 0.22);
    sanctuaryGlow.fillCircle(this.goalX, this.goalY, 210);
    sanctuaryGlow.lineStyle(2, 0x38bdf8, 0.55);
    sanctuaryGlow.strokeCircle(this.goalX, this.goalY, 210);

    // Waiting Right Whale Calf facing back toward the center
    const faceMotherAngle = this.calfAngle + Math.PI;
    this.calfSprite = this.add
      .image(this.goalX, this.goalY, 'whale_calf')
      .setDepth(18)
      .setRotation(faceMotherAngle);

    this.tweens.add({
      targets: this.calfSprite,
      x: this.goalX + Math.cos(faceMotherAngle) * 12,
      y: this.goalY + Math.sin(faceMotherAngle) * 12,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const bannerText =
      this.level === 1
        ? 'CALVING SANCTUARY — REUNITE WITH YOUR CALF'
        : `CALVING SANCTUARY (LEVEL ${this.level}) — REUNITE WITH YOUR CALF`;

    this.add
      .text(this.goalX, this.goalY - 88, bannerText, {
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#7dd3fc',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(18);
  }

  private spawnOceanMigrationField(): void {
    const {
      bloomSpacingY,
      bloomSpawnChance,
      ghostNetChance,
      routeBuoyCount,
      ambientBuoyCount,
    } = this.getDifficultyProfile();

    // Single nearby ghost net near spawn to teach sonar identification early
    const introAngle = this.calfAngle + 0.35;
    this.createGhostNet(
      this.startX + Math.cos(introAngle - 0.9) * 310,
      this.startY + Math.sin(introAngle - 0.9) * 310
    );

    const corridorPoints = this.getCorridorCenters();
    const isInsideCorridor = (y: number): boolean =>
      corridorPoints.some((c) => Math.abs(y - c.y) < 210);

    // Populate 360-degree concentric rings around the starting position with scarce food & traps
    for (
      let r = 520;
      r <= this.targetRadiusPx + 350;
      r += bloomSpacingY
    ) {
      const circumference = 2 * Math.PI * r;
      const sectorCount = Math.max(5, Math.round(circumference / 820));
      let spawnedBloomInRing = false;

      for (let s = 0; s < sectorCount; s++) {
        const theta =
          (s / sectorCount) * Math.PI * 2 +
          Phaser.Math.FloatBetween(-0.18, 0.18);
        const bx = this.startX + Math.cos(theta) * r;
        const by = this.startY + Math.sin(theta) * r;

        if (isInsideCorridor(by)) continue;
        if (Phaser.Math.Distance.Between(bx, by, this.goalX, this.goalY) < 260) {
          continue;
        }

        // Only spawn a copepod bloom in a subset of sectors (ensuring at least 1 per ring)
        const isLastSector = s === sectorCount - 1;
        if (
          Math.random() < bloomSpawnChance ||
          (!spawnedBloomInRing && isLastSector)
        ) {
          this.createCopepodBloom(bx, by);
          spawnedBloomInRing = true;
        }

        // Spawn 1-2 disguised ghost nets in the sector
        const netCount = Math.random() < ghostNetChance ? 2 : 1;
        for (let n = 0; n < netCount; n++) {
          const offsetAngle =
            theta +
            (n === 0 ? 1 : -1) * Phaser.Math.FloatBetween(0.08, 0.22);
          const netR = r + Phaser.Math.Between(-110, 110);
          const nx = this.startX + Math.cos(offsetAngle) * netR;
          const ny = this.startY + Math.sin(offsetAngle) * netR;
          if (!isInsideCorridor(ny)) {
            this.createGhostNet(nx, ny);
          }
        }
      }
    }

    const pulseInterval = Math.max(2.1, 3.8 - (this.level - 1) * 0.3);

    // 1. Spawn Seismic Survey Buoys directly along the route toward the calf (including an early one at ~14% distance)
    for (let i = 0; i < routeBuoyCount; i++) {
      const frac = 0.14 + (i / Math.max(1, routeBuoyCount - 1)) * 0.74;
      const baseBx = this.startX + (this.goalX - this.startX) * frac;
      let baseBy = this.startY + (this.goalY - this.startY) * frac;
      if (isInsideCorridor(baseBy)) {
        baseBy += 230;
      }
      const perpAngle = this.calfAngle + Math.PI / 2;
      // Keep the first buoy close to the direct bearing so the player always sees one early on Level 1
      const maxOffset = i === 0 ? 95 : 220;
      const sideOffset =
        (i % 2 === 0 ? 1 : -1) * Phaser.Math.Between(45, maxOffset);
      const buoyX = baseBx + Math.cos(perpAngle) * sideOffset;
      const buoyY = baseBy + Math.sin(perpAngle) * sideOffset;

      const sprite = this.add
        .image(buoyX, buoyY, 'seismic_buoy')
        .setDepth(14);

      this.seismicBuoys.push({
        x: buoyX,
        y: buoyY,
        pulseTimer: Phaser.Math.FloatBetween(0, pulseInterval),
        pulseInterval,
        sprite,
      });
    }

    // 2. Spawn Ambient Seismic Survey Buoys distributed across the 360° ocean (scales up with level)
    for (let j = 0; j < ambientBuoyCount; j++) {
      const ringFrac = (j + 0.5) / ambientBuoyCount;
      const r = 680 + ringFrac * (this.targetRadiusPx - 850);
      const theta =
        this.calfAngle +
        ((j + 1) / (ambientBuoyCount + 1)) * Math.PI * 1.85 +
        0.25;
      const buoyX = this.startX + Math.cos(theta) * r;
      let buoyY = this.startY + Math.sin(theta) * r;
      if (isInsideCorridor(buoyY)) {
        buoyY += 230;
      }

      const sprite = this.add
        .image(buoyX, buoyY, 'seismic_buoy')
        .setDepth(14);

      this.seismicBuoys.push({
        x: buoyX,
        y: buoyY,
        pulseTimer: Phaser.Math.FloatBetween(0, pulseInterval),
        pulseInterval,
        sprite,
      });
    }
  }

  private createCopepodBloom(x: number, y: number): void {
    // Disguised as 'sonar_mystery' until pinged by sonar
    const sprite = this.add
      .image(x, y, 'sonar_mystery')
      .setDepth(10)
      .setAlpha(0.18);
    const sonarRing = this.add.graphics().setDepth(11);

    this.blooms.push({
      x,
      y,
      radius: 34,
      vx: Phaser.Math.FloatBetween(-12, 12),
      vy: Phaser.Math.FloatBetween(-4, 4),
      consumed: false,
      revealTimer: 0,
      pulsePhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      sprite,
      sonarRing,
    });
  }

  private createGhostNet(x: number, y: number): void {
    // Identical 'sonar_mystery' silhouette until pinged by sonar
    const sprite = this.add
      .image(x, y, 'sonar_mystery')
      .setDepth(10)
      .setAlpha(0.18);
    const sonarRing = this.add.graphics().setDepth(13);

    this.ghostNets.push({
      x,
      y,
      radius: 34,
      vx: Phaser.Math.FloatBetween(-12, 12),
      snagged: false,
      revealTimer: 0,
      sprite,
      sonarRing,
    });
  }

  private getCorridorCenters(): { x: number; y: number }[] {
    const fracs = this.level === 1 ? [0.5] : [0.35, 0.68];
    return fracs.map((f) => ({
      x: Math.round(this.startX + (this.goalX - this.startX) * f),
      y: Math.round(this.startY + (this.goalY - this.startY) * f),
    }));
  }

  private spawnShippingCorridors(): void {
    const speedBoost = Math.min(48, (this.level - 1) * 12);
    const shipsPerLane = this.level === 1 ? 1 : 2;

    this.shippingManager.spawnCorridors({
      corridors: this.getCorridorCenters(),
      worldWidth: this.worldWidth,
      bannerText:
        '⚠ HIGH-DECIBEL SHIPPING CORRIDOR — NOISE MASKS SONAR • SHIP STRIKE IS FATAL ⚠',
      shipsPerLane,
      eastboundSpeed: 145 + speedBoost,
      westboundSpeed: 160 + speedBoost,
      fillColor: 0x7f1d1d,
      fillAlpha: 0.14,
      corridorDepth: 2,
      wakeDepth: 14,
      shipDepth: 15,
    });
  }

  private emitWhaleCall(isInitialFreeCall = false): void {
    if (!isInitialFreeCall) {
      // Singing/thrashing when entangled helps loosen 1 rope stack even if voice is recovering
      if (this.entangledStacks > 0) {
        this.entangleStruggleProgress += 0.38;
        if (this.entangleStruggleProgress >= 1) {
          this.entangledStacks = Math.max(0, this.entangledStacks - 1);
          this.entangleStruggleProgress = 0;
          this.uiManager.spawnFloatingNotice(
            this.whaleX,
            this.whaleY - 40,
            'SHED ENTANGLED LINE!',
            '#34d399'
          );
        }
      }

      if (this.callCooldownTimer > 0) {
        this.uiManager.spawnFloatingNotice(
          this.whaleX,
          this.whaleY - 44,
          this.noiseMaskingTimer > 0
            ? `SONAR DISRUPTED (${this.callCooldownTimer.toFixed(1)}s)`
            : `SONAR RECHARGING (${this.callCooldownTimer.toFixed(1)}s)`,
          this.noiseMaskingTimer > 0 ? '#fbbf24' : '#94a3b8'
        );
        return;
      }

      // Base sonar cooldown is 2.6s; acoustic noise disruption makes the cooldown significantly longer
      const baseCooldown = 2.6;
      const disruptedPenalty =
        this.noiseMaskingTimer > 0
          ? 1.6 + Math.min(1.2, (this.level - 1) * 0.25)
          : 0;
      this.callCooldownMax = baseCooldown + disruptedPenalty;
      this.callCooldownTimer = this.callCooldownMax;
      this.stamina = Math.max(0, this.stamina - 4.0);
    }

    // If masked by vessel noise, call range is reduced according to current level scaling
    const { maskedCallRadius } = this.getDifficultyProfile();
    const maxCallRadius =
      this.noiseMaskingTimer > 0 ? maskedCallRadius : 760;

    this.acousticWaves.push({
      x: this.whaleX,
      y: this.whaleY,
      radius: 24,
      maxRadius: maxCallRadius,
      speed: 520,
      kind: 'whale_call',
      color: 0x38bdf8,
    });

    const trueAngle = Phaser.Math.Angle.Between(
      this.whaleX,
      this.whaleY,
      this.calfSprite.x,
      this.calfSprite.y
    );
    const distToCalfMeters =
      Phaser.Math.Distance.Between(
        this.whaleX,
        this.whaleY,
        this.calfSprite.x,
        this.calfSprite.y
      ) / this.PIXELS_PER_METER;
    const beaconDuration = this.noiseMaskingTimer > 0 ? 1.6 : 3.8;

    // Clear previous beacons when starting a new call
    this.echoBeacons = [];

    // Schedule the true Calf's answering echo pulse after 420ms
    this.time.delayedCall(420, () => {
      if (this.isEnding || !this.scene.isActive()) return;

      // Spawn incoming wave from the calf's direction so player sees the wave washing toward them
      const waveOriginDist = Math.min(
        520,
        Phaser.Math.Distance.Between(
          this.whaleX,
          this.whaleY,
          this.calfSprite.x,
          this.calfSprite.y
        )
      );
      this.acousticWaves.push({
        x: this.whaleX + Math.cos(trueAngle) * waveOriginDist,
        y: this.whaleY + Math.sin(trueAngle) * waveOriginDist,
        radius: 20,
        maxRadius: 760,
        speed: 540,
        kind: 'calf_echo',
        color: 0xfbbf24,
      });

      this.echoBeacons.push({
        angle: trueAngle,
        timer: beaconDuration,
        maxTimer: beaconDuration,
        isDecoy: false,
      });
    });

    // On Level 2+, if beyond DECOY_CLEAR_DISTANCE_METERS (420m) from the calf, spawn false decoy echoes
    if (
      this.level >= 2 &&
      distToCalfMeters > this.DECOY_CLEAR_DISTANCE_METERS
    ) {
      const decoyCount = Math.min(3, this.level - 1);
      for (let d = 0; d < decoyCount; d++) {
        // Spread decoy angles away from the true calf direction
        const baseSide = d % 2 === 0 ? 1 : -1;
        const offsetRad =
          baseSide *
          Phaser.Math.FloatBetween(1.15 + d * 0.25, 2.35);
        const decoyAngle = trueAngle + offsetRad;
        const decoyDelay = d === 0 ? 330 : 510 + d * 70;

        this.time.delayedCall(decoyDelay, () => {
          if (this.isEnding || !this.scene.isActive()) return;
          this.acousticWaves.push({
            x: this.whaleX + Math.cos(decoyAngle) * 520,
            y: this.whaleY + Math.sin(decoyAngle) * 520,
            radius: 20,
            maxRadius: 720,
            speed: 520,
            kind: 'calf_echo',
            color: 0xf59e0b,
          });

          this.echoBeacons.push({
            angle: decoyAngle,
            timer: beaconDuration,
            maxTimer: beaconDuration,
            isDecoy: true,
          });
        });
      }

      if (!isInitialFreeCall) {
        this.uiManager.spawnFloatingNotice(
          this.whaleX,
          this.whaleY + 52,
          `DECOY ECHOES ACTIVE (>${this.DECOY_CLEAR_DISTANCE_METERS}m FROM CALF)`,
          '#fbbf24'
        );
      }
    }
  }

  update(_time: number, delta: number): void {
    if (this.isEnding || globalPauseManager.isPaused()) return;

    const dt = delta / 1000;
    this.levelElapsedSeconds += dt;

    if (this.callCooldownTimer > 0) {
      this.callCooldownTimer = Math.max(0, this.callCooldownTimer - dt);
    }
    if (this.noiseMaskingTimer > 0) {
      this.noiseMaskingTimer = Math.max(0, this.noiseMaskingTimer - dt);
    }
    for (let i = this.echoBeacons.length - 1; i >= 0; i--) {
      this.echoBeacons[i].timer -= dt;
      if (this.echoBeacons[i].timer <= 0) {
        this.echoBeacons.splice(i, 1);
      }
    }

    // Check SPACE for Echolocation Call
    if (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE)) {
      this.emitWhaleCall(false);
    }

    // 1. Update Blooms, Ghost Nets, Seismic Buoys & Shipping Vessels
    this.updateEntities(dt);

    // 2. Update Acoustic Waves & Sonar Illumination
    this.updateAcousticWaves(dt);

    // 3. Update Whale Movement & Entanglement Drag
    this.updateWhaleMovement(dt);

    // 4. Check Foraging, Ghost Net Entanglements, and Sanctuary Goal
    this.checkInteractions(dt);

    // 5. Update Stamina & Max Stamina Decay
    this.updateSurvivalMeters(dt);

    // 6. Render Dark Water Visibility, Entangled Lines, HUD & Over-the-Whale UI
    this.renderEntangledLines();
    this.renderDarknessAndBeaconOverlay();
    this.renderHUD();
    this.renderWhaleWorldUI();
  }

  private updateEntities(dt: number): void {
    const ambientSightRadius = this.noiseMaskingTimer > 0 ? 115 : 195;
    const {
      shipNoiseInterval,
      shipNoiseRadius,
      buoyNoiseRadius,
      maskedDecayMultiplier,
    } = this.getDifficultyProfile();

    // Helper for murky unrevealed alpha so food and traps look 100% identical without sonar
    const getUnrevealedMysteryAlpha = (distToWhale: number): number => {
      if (distToWhale < ambientSightRadius) {
        return Phaser.Math.Clamp(
          0.16 + (1 - distToWhale / ambientSightRadius) * 0.42,
          0.16,
          0.58
        );
      }
      return 0.14;
    };

    // Copepod blooms
    for (const bloom of this.blooms) {
      if (bloom.consumed) continue;
      bloom.x += bloom.vx * dt;
      bloom.y += bloom.vy * dt;
      bloom.pulsePhase += dt * 3;
      if (bloom.revealTimer > 0) {
        bloom.revealTimer = Math.max(
          0,
          bloom.revealTimer -
            (this.noiseMaskingTimer > 0 ? dt * maskedDecayMultiplier : dt)
        );
      }

      const distToWhale = Phaser.Math.Distance.Between(
        this.whaleX,
        this.whaleY,
        bloom.x,
        bloom.y
      );

      bloom.sprite.setPosition(bloom.x, bloom.y);
      bloom.sonarRing.clear();

      if (bloom.revealTimer > 0) {
        // Revealed by Sonar -> show true Copepod Bloom sprite + pink sonar ring
        if (bloom.sprite.texture.key !== 'copepod_bloom') {
          bloom.sprite.setTexture('copepod_bloom');
        }
        const sonarAlpha = Phaser.Math.Clamp(bloom.revealTimer / 1.6, 0.35, 1);
        bloom.sprite.setAlpha(sonarAlpha);

        const ringAlpha = Phaser.Math.Clamp(
          bloom.revealTimer / 3.5,
          0.2,
          0.8
        );
        bloom.sonarRing.lineStyle(2, 0xf472b6, ringAlpha);
        bloom.sonarRing.strokeCircle(
          bloom.x,
          bloom.y,
          bloom.radius + Math.sin(bloom.pulsePhase) * 4
        );
      } else {
        // Unrevealed -> disguised as murky silhouette, completely indistinguishable from a Ghost Net
        if (bloom.sprite.texture.key !== 'sonar_mystery') {
          bloom.sprite.setTexture('sonar_mystery');
        }
        bloom.sprite.setAlpha(getUnrevealedMysteryAlpha(distToWhale));
      }
    }

    // Ghost fishing nets
    for (const net of this.ghostNets) {
      if (net.snagged) continue;
      net.x += net.vx * dt;
      if (net.revealTimer > 0) {
        net.revealTimer = Math.max(
          0,
          net.revealTimer -
            (this.noiseMaskingTimer > 0 ? dt * maskedDecayMultiplier : dt)
        );
      }

      const distToWhale = Phaser.Math.Distance.Between(
        this.whaleX,
        this.whaleY,
        net.x,
        net.y
      );

      net.sprite.setPosition(net.x, net.y);
      net.sonarRing.clear();

      if (net.revealTimer > 0) {
        // Revealed by Sonar -> show true Ghost Net sprite + orange hazard sonar ring
        if (net.sprite.texture.key !== 'ghost_net') {
          net.sprite.setTexture('ghost_net');
        }
        const sonarAlpha = Phaser.Math.Clamp(net.revealTimer / 1.6, 0.35, 0.98);
        net.sprite.setAlpha(sonarAlpha);

        const ringAlpha = Phaser.Math.Clamp(net.revealTimer / 3.5, 0.25, 0.85);
        net.sonarRing.lineStyle(2, 0xf97316, ringAlpha);
        net.sonarRing.strokeCircle(net.x, net.y, net.radius + 4);
      } else {
        // Unrevealed -> disguised as murky silhouette, completely indistinguishable from a Copepod Bloom
        if (net.sprite.texture.key !== 'sonar_mystery') {
          net.sprite.setTexture('sonar_mystery');
        }
        net.sprite.setAlpha(getUnrevealedMysteryAlpha(distToWhale));
      }
    }

    // Seismic survey buoys
    for (const buoy of this.seismicBuoys) {
      buoy.pulseTimer += dt;
      if (buoy.pulseTimer >= buoy.pulseInterval) {
        buoy.pulseTimer = 0;
        this.acousticWaves.push({
          x: buoy.x,
          y: buoy.y,
          radius: 18,
          maxRadius: buoyNoiseRadius,
          speed: 280,
          kind: 'noise_pulse',
          color: 0xef4444,
        });
      }
    }

    // Shipping vessels — updated via shared ShippingCorridorManager
    const struckByShip = this.shippingManager.update(dt, {
      playerX: this.whaleX,
      playerY: this.whaleY,
      hitHalfWidth: 76,
      hitHalfHeight: 32,
      pulseInterval: shipNoiseInterval,
      onPeriodicPulse: (shipX, shipY) => {
        this.acousticWaves.push({
          x: shipX,
          y: shipY,
          radius: 24,
          maxRadius: shipNoiseRadius,
          speed: 255,
          kind: 'noise_pulse',
          color: 0xf59e0b,
        });
      },
    });

    if (struckByShip) {
      this.cameras.main.shake(360, 0.022);
      this.triggerEndState(false, 'ship');
      return;
    }
  }

  private updateAcousticWaves(dt: number): void {
    this.acousticGraphics.clear();

    for (let i = this.acousticWaves.length - 1; i >= 0; i--) {
      const wave = this.acousticWaves[i];
      wave.radius += wave.speed * dt;

      if (wave.radius >= wave.maxRadius) {
        this.acousticWaves.splice(i, 1);
        continue;
      }

      const lifePct = 1 - wave.radius / wave.maxRadius;
      const lineWidth = wave.kind === 'noise_pulse' ? 3 : 2.5;
      const alpha = lifePct * (wave.kind === 'noise_pulse' ? 0.65 : 0.8);

      this.acousticGraphics.lineStyle(lineWidth, wave.color, alpha);
      this.acousticGraphics.strokeCircle(wave.x, wave.y, wave.radius);

      if (wave.kind === 'whale_call') {
        // Reveal copepod blooms & ghost nets swept by the whale's echolocation ring
        for (const bloom of this.blooms) {
          if (bloom.consumed) continue;
          const d = Phaser.Math.Distance.Between(
            wave.x,
            wave.y,
            bloom.x,
            bloom.y
          );
          if (Math.abs(d - wave.radius) < 28) {
            bloom.revealTimer = 4.8;
          }
        }
        for (const net of this.ghostNets) {
          if (net.snagged) continue;
          const d = Phaser.Math.Distance.Between(wave.x, wave.y, net.x, net.y);
          if (Math.abs(d - wave.radius) < 28) {
            net.revealTimer = 4.8;
          }
        }
      } else if (wave.kind === 'noise_pulse') {
        // Check if noise wave hits the whale
        const distToWhale = Phaser.Math.Distance.Between(
          wave.x,
          wave.y,
          this.whaleX,
          this.whaleY
        );
        if (Math.abs(distToWhale - wave.radius) < 22) {
          const { maskingDuration } = this.getDifficultyProfile();
          const wasAlreadyMasked = this.noiseMaskingTimer > 0.2;
          this.noiseMaskingTimer = Math.max(
            this.noiseMaskingTimer,
            maskingDuration
          );
          // Acoustic disruption directly lengthens / adds delay to the sonar cooldown
          if (!wasAlreadyMasked) {
            const addedDelay = 1.25 + Math.min(1.0, (this.level - 1) * 0.2);
            this.callCooldownTimer = Math.min(
              6.0,
              this.callCooldownTimer + addedDelay
            );
            this.callCooldownMax = Math.max(
              this.callCooldownMax,
              this.callCooldownTimer
            );
          }
          // Chronic noise stress erodes max stamina slightly
          this.maxStamina = Math.max(20, this.maxStamina - 3.2 * dt);
          this.stamina = Math.min(this.stamina, this.maxStamina);
        }
      }
    }
  }

  private updateWhaleMovement(dt: number): void {
    let inputX = 0;
    let inputY = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) inputX -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) inputX += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) inputY -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) inputY += 1;

    const len = Math.hypot(inputX, inputY);
    if (len > 0) {
      inputX /= len;
      inputY /= len;
    }

    // Speed scales with maxStamina and is penalized by entangled fishing gear
    const staminaSpeedFactor = getStaminaSpeedMultiplier(
      this.maxStamina,
      0.54
    );
    const entanglementFactor = Math.max(
      0.42,
      1 - this.entangledStacks * 0.2
    );

    const baseSwimSpeed = 205 * staminaSpeedFactor * entanglementFactor;
    const targetVx = inputX * baseSwimSpeed;
    const targetVy = inputY * baseSwimSpeed;

    this.whaleVx = Phaser.Math.Linear(this.whaleVx, targetVx, 6.5 * dt);
    this.whaleVy = Phaser.Math.Linear(this.whaleVy, targetVy, 6.5 * dt);

    const prevX = this.whaleX;
    const prevY = this.whaleY;

    this.whaleX = Phaser.Math.Clamp(
      this.whaleX + this.whaleVx * dt,
      160,
      this.worldWidth - 160
    );
    this.whaleY = Phaser.Math.Clamp(
      this.whaleY + this.whaleVy * dt,
      160,
      this.worldHeight - 160
    );

    const stepDist = Phaser.Math.Distance.Between(
      prevX,
      prevY,
      this.whaleX,
      this.whaleY
    );
    this.swimPixels += stepDist;

    this.whale.setPosition(this.whaleX, this.whaleY);
    if (Math.hypot(this.whaleVx, this.whaleVy) > 12) {
      const targetAngle = Math.atan2(this.whaleVy, this.whaleVx);
      this.whale.setRotation(
        Phaser.Math.Angle.RotateTo(this.whale.rotation, targetAngle, 5.2 * dt)
      );
    }

    const distToCalfPx = Phaser.Math.Distance.Between(
      this.whaleX,
      this.whaleY,
      this.goalX,
      this.goalY
    );
    this.currentMetersToCalf = Math.max(
      0,
      Math.round(distToCalfPx / this.PIXELS_PER_METER)
    );

    // Notify on Level 2+ once the player gets close enough that decoy echoes drop out
    if (
      this.level >= 2 &&
      !this.announcedDecoyLock &&
      this.currentMetersToCalf <= this.DECOY_CLEAR_DISTANCE_METERS
    ) {
      this.announcedDecoyLock = true;
      this.uiManager.spawnFloatingNotice(
        this.whaleX,
        this.whaleY - 46,
        'WITHIN 420m — DECOY ECHOES CLEARED!',
        '#34d399'
      );
    }

    const metersClosed = Math.max(
      0,
      this.migrationDistanceMeters - this.currentMetersToCalf
    );
    if (metersClosed > this.maxNorthMetersInLevel) {
      this.maxNorthMetersInLevel = Math.min(
        this.migrationDistanceMeters,
        metersClosed
      );
    }
  }

  private checkInteractions(_dt: number): void {
    // 1. Filter-feeding on Copepod Blooms
    for (const bloom of this.blooms) {
      if (bloom.consumed) continue;
      const dist = Phaser.Math.Distance.Between(
        this.whaleX,
        this.whaleY,
        bloom.x,
        bloom.y
      );
      if (dist < bloom.radius + 32) {
        bloom.consumed = true;
        bloom.sonarRing.clear();
        this.bloomsConsumed++;

        // Recover Max Stamina & current Stamina
        this.maxStamina = Math.min(100, this.maxStamina + 18);
        this.stamina = Math.min(this.maxStamina, this.stamina + 36);

        // Feeding surge sheds 1 stack of entangled gear if snagged
        if (this.entangledStacks > 0) {
          this.entangledStacks = Math.max(0, this.entangledStacks - 1);
          this.entangleStruggleProgress = 0;
          this.uiManager.spawnFloatingNotice(
            bloom.x,
            bloom.y - 24,
            '+STAMINA & SHED FISHING LINE!',
            '#34d399'
          );
        } else {
          this.uiManager.spawnFloatingNotice(
            bloom.x,
            bloom.y - 24,
            '+STAMINA & +MAX STAMINA',
            '#f472b6'
          );
        }

        this.tweens.add({
          targets: bloom.sprite,
          scale: 1.5,
          alpha: 0,
          duration: 280,
          onComplete: () => bloom.sprite.destroy(),
        });
      }
    }

    // 2. Ghost Net & Lobster Line Entanglement
    for (const net of this.ghostNets) {
      if (net.snagged) continue;
      const dist = Phaser.Math.Distance.Between(
        this.whaleX,
        this.whaleY,
        net.x,
        net.y
      );
      if (dist < net.radius + 26) {
        net.snagged = true;
        net.sonarRing.clear();
        net.sprite.destroy();
        this.entanglementsHit++;
        this.entangledStacks = Math.min(3, this.entangledStacks + 1);
        this.stamina = Math.max(0, this.stamina - 10);
        this.cameras.main.shake(220, 0.01);

        this.uiManager.spawnFloatingNotice(
          this.whaleX,
          this.whaleY - 40,
          'ENTANGLED IN FISHING GEAR! (TAP SPACE OR FEED TO BREAK FREE)',
          '#f97316'
        );
      }
    }

    // 3. Reached Calving Sanctuary & Reunited with Calf
    const distToCalf = Phaser.Math.Distance.Between(
      this.whaleX,
      this.whaleY,
      this.calfSprite.x,
      this.calfSprite.y
    );
    if (distToCalf < 155) {
      this.maxNorthMetersInLevel = this.migrationDistanceMeters;
      this.triggerEndState(true);
    }
  }

  private updateSurvivalMeters(dt: number): void {
    const isMoving = Math.hypot(this.whaleVx, this.whaleVy) > 18;

    // Base stamina burn + extra drag from entangled fishing lines
    const baseDrain = isMoving ? 2.4 : 1.1;
    const entangleDrain = this.entangledStacks * 2.1;
    this.stamina = Math.max(0, this.stamina - (baseDrain + entangleDrain) * dt);

    // Max stamina ceiling erodes slowly over open-water migration, and faster when entangled or in loud noise
    const maxDecayRate =
      0.55 +
      this.entangledStacks * 0.95 +
      (this.noiseMaskingTimer > 0 ? 0.85 : 0);
    this.maxStamina = Math.max(20, this.maxStamina - maxDecayRate * dt);

    if (this.stamina > this.maxStamina) {
      this.stamina = this.maxStamina;
    }

    if (this.stamina <= 0) {
      this.triggerEndState(false, 'exhaustion');
    }
  }

  private renderEntangledLines(): void {
    this.entangledRopeGraphics.clear();
    if (this.entangledStacks <= 0) return;

    const tailAngle = this.whale.rotation + Math.PI;
    for (let i = 0; i < this.entangledStacks; i++) {
      const spread = (i - (this.entangledStacks - 1) / 2) * 0.28;
      const angle = tailAngle + spread;
      const startX = this.whaleX + Math.cos(angle) * 26;
      const startY = this.whaleY + Math.sin(angle) * 26;
      const endX = this.whaleX + Math.cos(angle) * (88 + i * 18);
      const endY = this.whaleY + Math.sin(angle) * (88 + i * 18);

      this.entangledRopeGraphics.lineStyle(2.5, 0xcbd5e1, 0.85);
      this.entangledRopeGraphics.lineBetween(startX, startY, endX, endY);

      // Trailing orange lobster-pot buoy
      this.entangledRopeGraphics.fillStyle(0xf97316, 0.95);
      this.entangledRopeGraphics.fillCircle(endX, endY, 5.5);
    }
  }

  private renderDarknessAndBeaconOverlay(): void {
    this.darknessOverlayGraphics.clear();

    // Directional Echo Beacon Arc(s) around the whale when calf (and any Level 2+ decoys) answer
    for (const beacon of this.echoBeacons) {
      const alpha = Phaser.Math.Clamp(
        beacon.timer / Math.max(0.1, beacon.maxTimer * 0.65),
        0.18,
        0.92
      );
      this.darknessOverlayGraphics.lineStyle(
        4,
        beacon.isDecoy ? 0xf59e0b : 0xfbbf24,
        alpha
      );
      this.darknessOverlayGraphics.beginPath();
      this.darknessOverlayGraphics.arc(
        this.whaleX,
        this.whaleY,
        62,
        beacon.angle - 0.38,
        beacon.angle + 0.38,
        false
      );
      this.darknessOverlayGraphics.strokePath();
    }
  }

  private renderHUD(): void {
    const progressPct = Phaser.Math.Clamp(
      this.maxNorthMetersInLevel / this.migrationDistanceMeters,
      0,
      1
    );

    const headerPrefix =
      this.level > 1 ? `EPISODE 02 • LEVEL ${this.level}` : 'EPISODE 02';

    this.uiManager.renderTopHUD({
      headerPrefix,
      elapsedSeconds: this.levelElapsedSeconds,
      heroValueText: `${this.maxNorthMetersInLevel}m`,
      subValueText: `/ ${this.migrationDistanceMeters}m (${this.currentMetersToCalf}m to calf)`,
      progressPct,
      stamina: this.stamina,
      secondaryVignetteColor: 0xf59e0b,
      secondaryVignetteAlpha:
        this.noiseMaskingTimer > 0
          ? Math.min(0.35, this.noiseMaskingTimer * 0.16)
          : 0,
    });
  }

  private renderWhaleWorldUI(): void {
    const fillCol =
      this.stamina < 28
        ? 0xef4444
        : this.entangledStacks > 0
        ? 0xf97316
        : 0x38bdf8;

    let secondaryBar:
      | {
          pct: number;
          fillColor: number;
          tagText: string;
          tagColor: string;
        }
      | undefined;

    if (this.entangledStacks > 0) {
      secondaryBar = {
        pct: this.entangledStacks / 3,
        fillColor: 0xf97316,
        tagText: `ENTANGLED ×${this.entangledStacks} (SPACE / FEED)`,
        tagColor: '#fb923c',
      };
    } else if (this.callCooldownTimer > 0) {
      const isDisrupted = this.noiseMaskingTimer > 0;
      const cooldownPct = Phaser.Math.Clamp(
        this.callCooldownTimer / Math.max(0.1, this.callCooldownMax),
        0,
        1
      );
      secondaryBar = {
        pct: cooldownPct,
        fillColor: isDisrupted ? 0xf59e0b : 0x818cf8,
        tagText: isDisrupted
          ? `SONAR DISRUPTED • ${this.callCooldownTimer.toFixed(1)}s`
          : `SONAR COOLDOWN • ${this.callCooldownTimer.toFixed(1)}s`,
        tagColor: isDisrupted ? '#fbbf24' : '#a5b4fc',
      };
    } else if (this.noiseMaskingTimer > 0) {
      secondaryBar = {
        pct: Phaser.Math.Clamp(this.noiseMaskingTimer / 2.2, 0, 1),
        fillColor: 0xf59e0b,
        tagText: 'NOISE MASKING SONAR',
        tagColor: '#fbbf24',
      };
    }

    this.uiManager.renderWorldBars({
      x: this.whaleX,
      y: this.whaleY,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      primaryFillColor: fillCol,
      secondaryBar,
    });
  }

  private triggerEndState(
    won: boolean,
    deathReason?: 'exhaustion' | 'ship'
  ): void {
    if (this.isEnding) return;
    this.isEnding = true;
    globalPauseManager.setGameEnded(true);

    const totalSwimMeters =
      this.cumulativeSwumBeforeLevel +
      Math.round(this.swimPixels / this.PIXELS_PER_METER);
    const totalMetersMigrated =
      this.cumulativeMetersBeforeLevel + this.maxNorthMetersInLevel;
    const totalBlooms = this.cumulativeBloomsBeforeLevel + this.bloomsConsumed;
    const totalEntanglements =
      this.cumulativeEntanglementsBeforeLevel + this.entanglementsHit;
    const totalTimeSeconds =
      this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds;

    const nextLevelData: WhaleSceneData = {
      level: this.level + 1,
      cumulativeMeters: totalMetersMigrated,
      cumulativeSwum: totalSwimMeters,
      cumulativeBlooms: totalBlooms,
      cumulativeEntanglements: totalEntanglements,
      cumulativeTimeSeconds: totalTimeSeconds,
    };

    const winState = window as unknown as {
      wildSpacesInfiniteMode?: boolean;
      showWhaleImpactModal?: (payload: {
        won: boolean;
        deathReason?: 'exhaustion' | 'ship';
        level: number;
        levelTargetMeters: number;
        metersInLevel: number;
        totalMetersMigrated: number;
        nextLevelMeters: number;
        bloomsConsumed: number;
        entanglementsHit: number;
        levelTimeSeconds: number;
        totalTimeSeconds: number;
        nextLevelData: WhaleSceneData;
      }) => void;
    };

    if (won && winState.wildSpacesInfiniteMode) {
      const res = recordLevelCompletion({
        episodeId: 'WhaleScene',
        level: this.level,
        levelTimeSeconds: this.levelElapsedSeconds,
        totalTimeSeconds,
        totalMeters: totalMetersMigrated,
      });
      const pbSuffix = res.isNewBest
        ? ` (NEW BEST ${formatDuration(this.levelElapsedSeconds)}!)`
        : ` (${formatDuration(this.levelElapsedSeconds)})`;
      this.uiManager.spawnFloatingNotice(
        this.whaleX,
        this.whaleY - 40,
        `★ LEVEL ${this.level} COMPLETE${pbSuffix}`,
        '#34d399'
      );

      this.cameras.main.fadeOut(700, 4, 13, 23);
      this.time.delayedCall(720, () => {
        this.scene.restart(nextLevelData);
      });
      return;
    }

    this.time.delayedCall(350, () => {
      if (typeof winState.showWhaleImpactModal === 'function') {
        winState.showWhaleImpactModal({
          won,
          deathReason,
          level: this.level,
          levelTargetMeters: this.migrationDistanceMeters,
          metersInLevel: this.maxNorthMetersInLevel,
          totalMetersMigrated,
          nextLevelMeters:
            this.migrationDistanceMeters + this.METERS_PER_LEVEL_STEP,
          bloomsConsumed: totalBlooms,
          entanglementsHit: totalEntanglements,
          levelTimeSeconds: this.levelElapsedSeconds,
          totalTimeSeconds,
          nextLevelData,
        });
      }
    });
  }
}
