import Phaser from 'phaser';
import {
  formatDuration,
  recordLevelCompletion,
} from '../utils/LeaderboardStore';
import {
  getFoodScarcityProfile,
  shouldSpawnFoodAtNode,
} from '../utils/FoodScarcitySchedule';
import { ShippingCorridorManager } from '../systems/ShippingCorridorManager';
import {
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager';
import { globalPauseManager } from '../systems/PauseManager';

interface IceFloe {
  id: number;
  container: Phaser.GameObjects.Container;
  underwaterGraphics: Phaser.GameObjects.Graphics;
  surfaceGraphics: Phaser.GameObjects.Graphics;
  crackGraphics: Phaser.GameObjects.Graphics;
  points: Phaser.Math.Vector2[];
  baseX: number;
  baseY: number;
  baseRadius: number;
  currentScale: number;
  standTimer: number; // seconds bear has stood on this floe
  standTimeLimit: number; // breaks apart when standTimer >= standTimeLimit
  vx: number; // horizontal ocean drift
  minX: number;
  maxX: number;
  isSanctuary?: boolean;
  crackStage: number;
}

interface SealPrey {
  sprite: Phaser.GameObjects.Image;
  alertText: Phaser.GameObjects.Text;
  floe: IceFloe;
  offsetX: number;
  offsetY: number;
  alertLevel: number; // 0 to 100
  state: 'resting' | 'spooked' | 'caught';
}

export interface PolarBearSceneData {
  level?: number;
  carryMaxStamina?: number;
  cumulativeMeters?: number;
  totalSwimMeters?: number;
  sealsCaught?: number;
  floesCollapsed?: number;
  cumulativeTimeSeconds?: number;
}

export class PolarBearScene extends Phaser.Scene {
  private readonly WORLD_WIDTH = 2400;
  private readonly SANCTUARY_Y = 380;
  private readonly PIXELS_PER_METER = 3.54;
  private readonly BASE_LEVEL_METERS = 1000;
  private readonly METERS_PER_LEVEL_INCREMENT = 300; // Unbounded distance increase per level

  // Dynamic per-level world dimensions & difficulty parameters
  private level = 1;
  private levelTargetMeters = 1000;
  private startY = 3920;
  private worldHeight = 4200;
  private iceGapMin = 310;
  private iceGapMax = 380;
  private twoFloeChance = 0.38;
  private sealSpawnChance = 0.28;

  private bear!: Phaser.GameObjects.Sprite;
  private cub!: Phaser.GameObjects.Image;
  private bearX = 1200;
  private bearY = 3920;
  private bearVx = 0;
  private bearVy = 0;
  private bearAngle = -Math.PI / 2; // facing North

  // Single unified Stamina meter (0 - 100) with decaying Max Stamina in water
  private stamina = 100;
  private maxStamina = 100;
  private isOnIce = true;
  private currentFloe: IceFloe | null = null;

  // Lunge / Dash state
  private lungeTimer = 0;
  private lungeCooldown = 0;
  private lungeDirX = 0;
  private lungeDirY = 0;

  // Entities
  private shippingCorridorCenters: number[] = [];
  private shippingManager!: ShippingCorridorManager;
  private floes: IceFloe[] = [];
  private seals: SealPrey[] = [];

  // Run telemetry (persists across levels in Infinite Mode)
  private cumulativeMetersBeforeLevel = 0;
  private cumulativeTimeBeforeLevel = 0;
  private levelElapsedSeconds = 0;
  private totalSwimMeters = 0;
  private sealsCaught = 0;
  private floesCollapsed = 0;
  private gameEnded = false;
  private rippleTimer = 0;
  private stepWobbleTime = 0;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
  };

  // Shared Episode UI Manager (Fixed HUD + World-Space Bear Overlay + Vignette)
  private uiManager!: EpisodeUIManager;

  constructor() {
    super({ key: 'PolarBearScene' });
  }

  init(data?: PolarBearSceneData): void {
    this.level = data?.level && data.level >= 1 ? data.level : 1;

    // 1. Distance needed to reach next level increases by a fixed +300m per level WITHOUT a cap
    this.levelTargetMeters =
      this.BASE_LEVEL_METERS +
      (this.level - 1) * this.METERS_PER_LEVEL_INCREMENT;
    this.startY =
      this.SANCTUARY_Y +
      Math.round(this.levelTargetMeters * this.PIXELS_PER_METER);
    this.worldHeight = this.startY + 280;

    // 2. Fewer and fewer ice patches down to a minimum density (max gap ceiling at Level 6+)
    this.iceGapMin = Math.min(440, 310 + (this.level - 1) * 26);
    this.iceGapMax = Math.min(510, 380 + (this.level - 1) * 26);
    this.twoFloeChance = Math.max(0.06, 0.38 - (this.level - 1) * 0.065);

    // 3. Shared food/prey scarcity schedule across all episodes (28% on Level 1 down to 12% floor)
    this.sealSpawnChance = getFoodScarcityProfile(this.level).foodSpawnChance;

    // Carry over run telemetry if advancing to Level 2+
    this.cumulativeMetersBeforeLevel = data?.cumulativeMeters ?? 0;
    this.cumulativeTimeBeforeLevel = data?.cumulativeTimeSeconds ?? 0;
    this.levelElapsedSeconds = 0;
    this.totalSwimMeters = data?.totalSwimMeters ?? 0;
    this.sealsCaught = data?.sealsCaught ?? 0;
    this.floesCollapsed = data?.floesCollapsed ?? 0;
    this.maxStamina = data?.carryMaxStamina
      ? Phaser.Math.Clamp(data.carryMaxStamina, 25, 100)
      : 100;
    this.stamina = this.maxStamina;
  }

  create(): void {
    this.resetLevelEntities();

    const subtitleEl = document.querySelector('.brand-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent =
        'Episode 1: The Thinning North (Polar Bear)';
    }

    // 1. World Ocean Background & Currents
    this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.worldHeight);
    this.drawOceanBackdrop();

    // 2. Generate Ice Floe Stepping Stones & Northern Sanctuary
    this.generateMigrationRoute();

    // 3. Spawn Industrial Shipping Lanes along the migration route
    this.spawnShippingLane();

    // 4. Spawn Waiting Polar Bear Cub on the Northern Sanctuary
    this.cub = this.add
      .image(this.WORLD_WIDTH / 2, this.SANCTUARY_Y - 60, 'bear_cub')
      .setDepth(15)
      .setAngle(90);

    // 5. Spawn Player Polar Bear
    this.bear = this.add
      .sprite(this.bearX, this.bearY, 'bear_walk')
      .setDepth(20)
      .setRotation(this.bearAngle);

    this.cameras.main.startFollow(this.bear, true, 0.09, 0.09);

    // 6. Atmospheric Snowfall
    this.add
      .particles(0, 0, 'snow_dot', {
        x: { min: 0, max: this.scale.width },
        y: -10,
        lifespan: 5500,
        speedY: { min: 35, max: 75 },
        speedX: { min: -25, max: 25 },
        scale: { start: 0.55, end: 0.15 },
        alpha: { start: 0.45, end: 0 },
        quantity: 1,
        frequency: 90,
      })
      .setScrollFactor(0)
      .setDepth(90);

    // 7. Controls
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT') as {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
        SPACE: Phaser.Input.Keyboard.Key;
        SHIFT: Phaser.Input.Keyboard.Key;
      };
    }

    // 8. Build Shared Episode HUD & World-Space Bars
    this.uiManager = new EpisodeUIManager(this, {
      accentColor: 0x38bdf8,
      accentHex: '#38bdf8',
      bottomHint:
        'WASD / Arrows: Move   •   SPACE: Lunge   •   Eat seals to restore Max Stamina   •   P / ESC: Pause',
      autoFadeHintMs: 5500,
      worldUiYOffset: 64,
      worldBarWidth: 72,
    });
    this.uiManager.redrawViewportBg(0x040d17);
    globalPauseManager.attachScene(this);

    if (this.level > 1) {
      this.uiManager.spawnFloatingNotice(
        this.bearX,
        this.bearY - 30,
        `LEVEL ${this.level} — ${this.levelTargetMeters}m TO NEXT SANCTUARY`,
        '#38bdf8'
      );
    }

    // Handle window resize cleanly
    this.scale.on('resize', () => {
      this.uiManager.handleResize(0x040d17);
    });
  }

  private resetLevelEntities(): void {
    this.bearX = this.WORLD_WIDTH / 2;
    this.bearY = this.startY;
    this.bearVx = 0;
    this.bearVy = 0;
    this.bearAngle = -Math.PI / 2;
    this.isOnIce = true;
    this.currentFloe = null;
    this.lungeTimer = 0;
    this.lungeCooldown = 0;
    this.shippingCorridorCenters = [];
    if (!this.shippingManager) {
      this.shippingManager = new ShippingCorridorManager(this);
    } else {
      this.shippingManager.clear();
    }
    this.floes = [];
    this.seals = [];
    this.gameEnded = false;

    const totalRoutePx = this.startY - this.SANCTUARY_Y;
    const numCorridors = Math.max(1, Math.floor(totalRoutePx / 1950));
    for (let c = 1; c <= numCorridors; c++) {
      const centerCorridorY = Math.round(
        this.SANCTUARY_Y + (totalRoutePx * c) / (numCorridors + 1)
      );
      this.shippingCorridorCenters.push(centerCorridorY);
    }
  }

  private drawOceanBackdrop(): void {
    const bg = this.add.graphics().setDepth(0);
    // Deep Arctic bathyal gradient across world
    bg.fillGradientStyle(0x071e34, 0x071e34, 0x030b14, 0x030b14, 1);
    bg.fillRect(0, 0, this.WORLD_WIDTH, this.worldHeight);

    // Subtle horizontal current bands
    bg.lineStyle(2, 0x38bdf8, 0.06);
    for (let y = 200; y < this.worldHeight; y += 140) {
      bg.beginPath();
      for (let x = 0; x <= this.WORLD_WIDTH; x += 80) {
        const waveY = y + Math.sin(x * 0.008 + y * 0.01) * 18;
        if (x === 0) bg.moveTo(x, waveY);
        else bg.lineTo(x, waveY);
      }
      bg.strokePath();
    }
  }

  private canPlaceFloe(x: number, y: number, radius: number): boolean {
    for (const existing of this.floes) {
      const minSeparation =
        (existing.baseRadius + radius) * 1.28 + 85;
      const dist = Phaser.Math.Distance.Between(
        x,
        y,
        existing.baseX,
        existing.baseY
      );
      if (dist < minSeparation) {
        return false;
      }
    }
    return true;
  }

  private generateMigrationRoute(): void {
    let nextId = 1;

    // 1. Starting Southern Floe (gives you ~7.5s to orient before it cracks & shatters)
    this.createIceFloe(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.startY,
      125,
      7.5,
      0
    );

    // 2. Stepping-stone floes from South (`this.startY - 340`) to North (`Y = 740`)
    // Ice density and seal spawn rate scale down with `this.level` to their minimum floors,
    // while `this.startY` grows without bound by +300m per level.
    let yCursor = this.startY - 340;
    let prevX = this.WORLD_WIDTH / 2;
    let floesSinceLastSeal = 0;

    // Stand time limit tightens slightly per level down to a minimum floor (2.7s..4.0s)
    const minStandTime = Math.max(2.7, 3.6 - (this.level - 1) * 0.16);
    const maxStandTime = Math.max(4.0, 5.2 - (this.level - 1) * 0.2);

    while (yCursor > 740) {
      // Check if yCursor falls inside any ice-free shipping corridor (`±175px`)
      const blockingCorridorY = this.shippingCorridorCenters.find(
        (cy) => Math.abs(yCursor - cy) < 175
      );

      if (blockingCorridorY !== undefined) {
        // Ensure there is at least one staging floe just south of the shipping corridor
        const hasSouthStaging = this.floes.some(
          (f) =>
            f.baseY >= blockingCorridorY + 170 &&
            f.baseY <= blockingCorridorY + 290
        );
        if (!hasSouthStaging) {
          const stageX = Phaser.Math.Clamp(
            prevX + Phaser.Math.Between(-160, 160),
            this.WORLD_WIDTH / 2 - 360,
            this.WORLD_WIDTH / 2 + 360
          );
          const stageFloe = this.createIceFloe(
            nextId++,
            stageX,
            blockingCorridorY + 205,
            96,
            maxStandTime + 0.6,
            Phaser.Math.FloatBetween(-14, 14)
          );
          prevX = stageX;
          if (Math.random() < this.sealSpawnChance) {
            this.spawnSealOnFloe(stageFloe);
          }
        }
        // Jump across the ice-free shipping lane to the north edge (`blockingCorridorY - 205`)
        yCursor = blockingCorridorY - 205;
        if (yCursor <= 740) break;
      }

      const floesInBand = Math.random() < this.twoFloeChance ? 2 : 1;

      for (let i = 0; i < floesInBand; i++) {
        const baseRadius = Phaser.Math.Between(74, 112);
        const standTimeLimit = Phaser.Math.Linear(
          minStandTime,
          maxStandTime,
          (baseRadius - 74) / (112 - 74)
        );

        const centerX = this.WORLD_WIDTH / 2;
        let placedFloe: IceFloe | null = null;
        for (let attempt = 0; attempt < 16; attempt++) {
          const candidateX =
            floesInBand === 1
              ? Phaser.Math.Clamp(
                  prevX + Phaser.Math.Between(-310, 310),
                  centerX - 420,
                  centerX + 420
                )
              : i === 0
              ? Phaser.Math.Between(centerX - 440, centerX - 150)
              : Phaser.Math.Between(centerX + 150, centerX + 440);

          const candidateY = yCursor + Phaser.Math.Between(-30, 30);

          if (this.canPlaceFloe(candidateX, candidateY, baseRadius)) {
            const driftVx = Phaser.Math.FloatBetween(-24, 24);
            placedFloe = this.createIceFloe(
              nextId++,
              candidateX,
              candidateY,
              baseRadius,
              standTimeLimit,
              driftVx
            );
            prevX = candidateX;
            break;
          }
        }

        // Shared food/prey scarcity check + pity guarantee across episodes
        if (placedFloe) {
          floesSinceLastSeal++;
          if (shouldSpawnFoodAtNode(this.level, floesSinceLastSeal)) {
            this.spawnSealOnFloe(placedFloe);
            floesSinceLastSeal = 0;
          }
        }
      }

      yCursor -= Phaser.Math.Between(this.iceGapMin, this.iceGapMax);
    }

    // 3. Permanent Northern Pack Ice Sanctuary (Top of map)
    const sanctuary = this.createIceFloe(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.SANCTUARY_Y - 30,
      360,
      99999,
      0,
      true
    );

    this.add
      .text(
        this.WORLD_WIDTH / 2,
        this.SANCTUARY_Y - 140,
        `★ LEVEL ${this.level} NORTHERN PACK ICE SANCTUARY ★`,
        {
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#38bdf8',
          letterSpacing: 2,
        }
      )
      .setOrigin(0.5)
      .setDepth(16);

    this.currentFloe = sanctuary; // Updated on first frame
  }

  private createIceFloe(
    id: number,
    x: number,
    y: number,
    radius: number,
    standTimeLimit: number,
    vx: number,
    isSanctuary = false
  ): IceFloe {
    const container = this.add.container(x, y).setDepth(5);
    const underwaterGraphics = this.add.graphics();
    const surfaceGraphics = this.add.graphics();
    const crackGraphics = this.add.graphics();

    const points: Phaser.Math.Vector2[] = [];
    const numVertices = isSanctuary ? 22 : 12;
    for (let i = 0; i < numVertices; i++) {
      const angle = (i / numVertices) * Math.PI * 2;
      const jitter = isSanctuary
        ? Phaser.Math.FloatBetween(0.9, 1.12)
        : Phaser.Math.FloatBetween(0.76, 1.16);
      const rx = Math.cos(angle) * radius * jitter * (isSanctuary ? 1.85 : 1.15);
      const ry = Math.sin(angle) * radius * jitter * (isSanctuary ? 0.65 : 0.88);
      points.push(new Phaser.Math.Vector2(rx, ry));
    }

    // Draw submerged cyan shelf
    underwaterGraphics.fillStyle(0x38bdf8, 0.24);
    underwaterGraphics.beginPath();
    points.forEach((pt, idx) => {
      const ux = pt.x * 1.1;
      const uy = pt.y * 1.1 + 8;
      if (idx === 0) underwaterGraphics.moveTo(ux, uy);
      else underwaterGraphics.lineTo(ux, uy);
    });
    underwaterGraphics.closePath();
    underwaterGraphics.fillPath();

    // Draw crisp white/ice-blue surface polygon
    surfaceGraphics.fillStyle(isSanctuary ? 0xe0f2fe : 0xf1f5f9, 0.96);
    surfaceGraphics.lineStyle(3, 0xbae6fd, 0.9);
    surfaceGraphics.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) surfaceGraphics.moveTo(pt.x, pt.y);
      else surfaceGraphics.lineTo(pt.x, pt.y);
    });
    surfaceGraphics.closePath();
    surfaceGraphics.fillPath();
    surfaceGraphics.strokePath();

    // Inner snow highlight
    surfaceGraphics.fillStyle(0xffffff, 0.7);
    surfaceGraphics.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) surfaceGraphics.moveTo(pt.x * 0.72, pt.y * 0.72 - 3);
      else surfaceGraphics.lineTo(pt.x * 0.72, pt.y * 0.72 - 3);
    });
    surfaceGraphics.closePath();
    surfaceGraphics.fillPath();

    container.add([underwaterGraphics, surfaceGraphics, crackGraphics]);

    const floe: IceFloe = {
      id,
      container,
      underwaterGraphics,
      surfaceGraphics,
      crackGraphics,
      points,
      baseX: x,
      baseY: y,
      baseRadius: radius,
      currentScale: 1,
      standTimer: 0,
      standTimeLimit,
      vx,
      minX: this.WORLD_WIDTH / 2 - 480,
      maxX: this.WORLD_WIDTH / 2 + 480,
      isSanctuary,
      crackStage: 0,
    };

    this.floes.push(floe);
    return floe;
  }

  private drawFloeCracks(floe: IceFloe, stage: number): void {
    floe.crackGraphics.clear();
    if (stage <= 0) return;

    floe.crackGraphics.lineStyle(
      stage >= 3 ? 3.2 : 2.2,
      stage >= 3 ? 0x0369a1 : 0x0284c7,
      0.88
    );

    const count = stage * 3;
    for (let i = 0; i < count; i++) {
      const p1 = floe.points[(i * 2) % floe.points.length];
      floe.crackGraphics.beginPath();
      floe.crackGraphics.moveTo(p1.x * 0.94, p1.y * 0.94);
      floe.crackGraphics.lineTo(
        p1.x * 0.45 + (i % 2 === 0 ? 14 : -14),
        p1.y * 0.45 + (i % 3 === 0 ? -10 : 10)
      );
      floe.crackGraphics.lineTo(0, 0);
      floe.crackGraphics.strokePath();
    }
  }

  private shatterIceFloe(floe: IceFloe): void {
    const cx = floe.container.x;
    const cy = floe.container.y;
    this.spawnSplashRing(cx, cy, 1.5);
    this.uiManager.spawnFloatingNotice(cx, cy, 'ICE BROKE APART!', '#f87171');

    // Spawn 5 breaking ice chunks that drift outward and sink
    const shardCount = 5;
    for (let i = 0; i < shardCount; i++) {
      const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.4;
      const dist = floe.baseRadius * floe.currentScale * 0.38;
      const shard = this.add
        .graphics({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
        })
        .setDepth(5);

      shard.fillStyle(0xe2e8f0, 0.9);
      shard.lineStyle(2, 0x38bdf8, 0.8);
      const r = floe.baseRadius * floe.currentScale * 0.34;
      shard.beginPath();
      shard.moveTo(-r * 0.8, -r * 0.5);
      shard.lineTo(r * 0.9, -r * 0.3);
      shard.lineTo(r * 0.5, r * 0.8);
      shard.lineTo(-r * 0.6, r * 0.6);
      shard.closePath();
      shard.fillPath();
      shard.strokePath();

      this.tweens.add({
        targets: shard,
        x: shard.x + Math.cos(angle) * 55,
        y: shard.y + Math.sin(angle) * 55,
        scaleX: 0.15,
        scaleY: 0.15,
        alpha: 0,
        rotation: (i % 2 === 0 ? 1 : -1) * 0.9,
        duration: 750,
        onComplete: () => shard.destroy(),
      });
    }

    floe.container.destroy();
  }

  private spawnSealOnFloe(floe: IceFloe): void {
    // Pick a point near the edge of the floe
    const edgePt = floe.points[Phaser.Math.Between(0, floe.points.length - 1)];
    const offsetX = edgePt.x * 0.62;
    const offsetY = edgePt.y * 0.62;

    const sprite = this.add
      .image(floe.container.x + offsetX, floe.container.y + offsetY, 'seal_rest')
      .setDepth(12)
      .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));

    const alertText = this.add
      .text(sprite.x, sprite.y - 26, '', {
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#fbbf24',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);

    this.seals.push({
      sprite,
      alertText,
      floe,
      offsetX,
      offsetY,
      alertLevel: 0,
      state: 'resting',
    });
  }

  private spawnShippingLane(): void {
    const centerX = this.WORLD_WIDTH / 2;
    const speedBoost = Math.min(36, (this.level - 1) * 8);

    this.shippingManager.spawnCorridors({
      corridors: this.shippingCorridorCenters.map((y) => ({
        x: centerX,
        y,
      })),
      worldWidth: this.WORLD_WIDTH,
      bannerText:
        '⚠ LETHAL ARCTIC SHIPPING CORRIDOR — VESSEL IMPACT IS FATAL ⚠',
      shipsPerLane: 3,
      eastboundSpeed: 175 + speedBoost,
      westboundSpeed: 195 + speedBoost,
      fillColor: 0x451a03,
      fillAlpha: 0.28,
      corridorDepth: 1,
      wakeDepth: 13,
      shipDepth: 14,
    });
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameEnded || globalPauseManager.isPaused()) return;

    const dt = Math.min(deltaMs / 1000, 0.05);
    this.levelElapsedSeconds += dt;

    // 1. Update Drifting & Melting Ice Floes
    this.updateIceFloes(dt);

    // 2. Check if Bear is currently on an Ice Floe
    this.checkIceSupport(dt);

    // 3. Handle Player Movement & Lunge
    this.updateBearMovement(dt);

    // 4. Update Survival Meters (Warmth & Stamina)
    this.updateSurvivalMeters(dt);

    // 5. Update Seals (Stealth / Spook / Catch)
    this.updateSeals(dt);

    // 6. Update Industrial Ships & Wake Turbulence
    this.updateShips(dt);

    // 7. Animate waiting Cub on Sanctuary
    this.cub.rotation =
      Math.PI / 2 + Math.sin(this.time.now * 0.004) * 0.25;

    // 8. Check Win / Loss Conditions
    this.checkWinLoss();

    // 9. Redraw HUD
    this.renderHUD();
  }

  private updateIceFloes(dt: number): void {
    // 1. Move floes horizontally & bounce off world boundaries
    for (const floe of this.floes) {
      if (floe.isSanctuary) continue;
      floe.baseX += floe.vx * dt;
      if (floe.baseX < floe.minX) {
        floe.baseX = floe.minX;
        floe.vx = Math.abs(floe.vx);
      } else if (floe.baseX > floe.maxX) {
        floe.baseX = floe.maxX;
        floe.vx = -Math.abs(floe.vx);
      }
    }

    // 2. Prevent any two ice floes from intersecting while drifting
    for (let i = 0; i < this.floes.length; i++) {
      const a = this.floes[i];
      if (a.isSanctuary) continue;
      for (let j = i + 1; j < this.floes.length; j++) {
        const b = this.floes[j];
        if (b.isSanctuary) continue;

        const dy = Math.abs(a.baseY - b.baseY);
        const minYDist =
          (a.baseRadius * a.currentScale + b.baseRadius * b.currentScale) *
            0.88 +
          24;
        if (dy >= minYDist) continue;

        const dx = b.baseX - a.baseX;
        const minXDist =
          (a.baseRadius * a.currentScale + b.baseRadius * b.currentScale) *
            1.18 +
          32;

        if (Math.abs(dx) < minXDist) {
          const overlap = (minXDist - Math.abs(dx)) * 0.5;
          const sign = dx >= 0 ? 1 : -1;
          a.baseX -= sign * overlap;
          b.baseX += sign * overlap;
          // Bounce horizontal velocities away from each other
          const speedA = Math.abs(a.vx) || 16;
          const speedB = Math.abs(b.vx) || 16;
          a.vx = -sign * speedA;
          b.vx = sign * speedB;
        }
      }
    }

    // 3. Apply standing stress, cracking, shudder, and breaking apart
    for (let i = this.floes.length - 1; i >= 0; i--) {
      const floe = this.floes[i];
      if (floe.isSanctuary) continue;

      const bearOnThis = this.currentFloe?.id === floe.id;
      if (bearOnThis) {
        floe.standTimer += dt;
      }

      const stressRatio = Phaser.Math.Clamp(
        floe.standTimer / floe.standTimeLimit,
        0,
        1
      );

      // Shrink slightly as cracks widen under the bear's weight
      floe.currentScale = 1.0 - stressRatio * 0.38;
      floe.container.setScale(floe.currentScale);

      // Shudder when close to breaking apart (>65% stress)
      const shudderX =
        bearOnThis && stressRatio > 0.65
          ? Math.sin(this.time.now * 0.055) * 3.5
          : 0;
      floe.container.x = floe.baseX + shudderX;
      floe.container.y = floe.baseY;

      // Progressive visible cracking
      const targetCrackStage =
        stressRatio >= 0.72
          ? 3
          : stressRatio >= 0.44
          ? 2
          : stressRatio >= 0.16
          ? 1
          : 0;

      if (targetCrackStage !== floe.crackStage) {
        floe.crackStage = targetCrackStage;
        this.drawFloeCracks(floe, targetCrackStage);
      }

      // Break apart completely after standing on it for too long
      if (floe.standTimer >= floe.standTimeLimit) {
        this.shatterIceFloe(floe);
        this.floes.splice(i, 1);
        this.floesCollapsed++;
        if (this.currentFloe?.id === floe.id) {
          this.currentFloe = null;
          this.isOnIce = false;
        }
      }
    }
  }

  private checkIceSupport(dt: number): void {
    let foundFloe: IceFloe | null = null;

    for (const floe of this.floes) {
      const dx = this.bearX - floe.container.x;
      const dy = this.bearY - floe.container.y;
      const rx =
        floe.baseRadius *
        floe.currentScale *
        (floe.isSanctuary ? 1.75 : 1.05);
      const ry =
        floe.baseRadius *
        floe.currentScale *
        (floe.isSanctuary ? 0.6 : 0.82);

      const normDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (normDist <= 1.0) {
        foundFloe = floe;
        break;
      }
    }

    const wasOnIce = this.isOnIce;
    this.currentFloe = foundFloe;
    this.isOnIce = foundFloe !== null;

    // Carry the bear with the drifting ice floe
    if (foundFloe && !foundFloe.isSanctuary) {
      this.bearX += foundFloe.vx * dt;
    }

    // Splash effect on water entry
    if (wasOnIce && !this.isOnIce) {
      this.spawnSplashRing(this.bearX, this.bearY, 1.1);
    }
  }

  private updateBearMovement(dt: number): void {
    this.lungeCooldown = Math.max(0, this.lungeCooldown - dt);

    let inputX = 0;
    let inputY = 0;

    if (this.cursors) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) inputX -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) inputX += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) inputY -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) inputY += 1;
    }

    // Also allow pointer/mouse hold steering for convenience
    if (this.input.activePointer.isDown && inputX === 0 && inputY === 0) {
      const worldPt = this.cameras.main.getWorldPoint(
        this.input.activePointer.x,
        this.input.activePointer.y
      );
      const pdx = worldPt.x - this.bearX;
      const pdy = worldPt.y - this.bearY;
      if (Math.hypot(pdx, pdy) > 20) {
        inputX = pdx;
        inputY = pdy;
      }
    }

    const len = Math.hypot(inputX, inputY);
    if (len > 0) {
      inputX /= len;
      inputY /= len;
      this.bearAngle = Phaser.Math.Angle.RotateTo(
        this.bearAngle,
        Math.atan2(inputY, inputX),
        10 * dt
      );
    }

    // Trigger Lunge / Dash on SPACE or SHIFT
    const lungePressed =
      this.wasd &&
      (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE) ||
        Phaser.Input.Keyboard.JustDown(this.wasd.SHIFT));

    if (lungePressed && this.lungeCooldown <= 0 && this.stamina >= 14) {
      this.lungeTimer = 0.26;
      this.lungeCooldown = 0.75;
      this.stamina = Math.max(0, this.stamina - 14);
      this.lungeDirX = Math.cos(this.bearAngle);
      this.lungeDirY = Math.sin(this.bearAngle);
      this.spawnSplashRing(this.bearX, this.bearY, 0.9);
    }

    // Lower Max Stamina directly slows down movement & lunge speed (1.0x at 100% down to 0.52x at 20%)
    const maxStaminaSpeedFactor = getStaminaSpeedMultiplier(
      this.maxStamina,
      0.52
    );

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      const lungeSpeed =
        (this.isOnIce ? 390 : 265) * maxStaminaSpeedFactor;
      this.bearVx = this.lungeDirX * lungeSpeed;
      this.bearVy = this.lungeDirY * lungeSpeed;
      this.bear.setTexture('bear_lunge');
    } else {
      const rawSpeed = this.isOnIce
        ? 195
        : this.stamina > 5
        ? 130
        : 78;
      const baseSpeed = rawSpeed * maxStaminaSpeedFactor;
      this.bearVx = inputX * baseSpeed;
      this.bearVy = inputY * baseSpeed;
      this.bear.setTexture(this.isOnIce ? 'bear_walk' : 'bear_swim');
    }

    const prevX = this.bearX;
    const prevY = this.bearY;

    this.bearX = Phaser.Math.Clamp(
      this.bearX + this.bearVx * dt,
      45,
      this.WORLD_WIDTH - 45
    );
    this.bearY = Phaser.Math.Clamp(
      this.bearY + this.bearVy * dt,
      180,
      this.worldHeight - 60
    );

    const frameDist = Math.hypot(this.bearX - prevX, this.bearY - prevY);
    if (!this.isOnIce) {
      this.totalSwimMeters += frameDist / 3.52;
      this.rippleTimer += dt;
      if (this.rippleTimer > 0.28 && frameDist > 0.2) {
        this.rippleTimer = 0;
        this.spawnSplashRing(this.bearX, this.bearY, 0.65);
      }
    }

    // Subtle organic walking/swimming wobble
    if (frameDist > 0.3) {
      this.stepWobbleTime += dt * (this.isOnIce ? 12 : 7);
    }
    const wobble = Math.sin(this.stepWobbleTime) * 0.06;

    this.bear.setPosition(this.bearX, this.bearY);
    this.bear.setRotation(this.bearAngle + wobble);
  }

  private updateSurvivalMeters(dt: number): void {
    const isMoving = Math.hypot(this.bearVx, this.bearVy) > 10;

    if (this.isOnIce) {
      // On ice, Stamina recovers rapidly up to your current `maxStamina` ceiling
      this.stamina = Math.min(this.maxStamina, this.stamina + 22 * dt);
    } else {
      // Staying in open water steadily reduces your Maximum Stamina ceiling
      this.maxStamina = Math.max(20, this.maxStamina - 2.5 * dt);

      // Draining Stamina while in freezing open water
      const swimDrain = isMoving ? 6.5 : 3.2;
      this.stamina = Math.min(
        this.maxStamina,
        Math.max(0, this.stamina - swimDrain * dt)
      );
    }
  }

  private updateSeals(dt: number): void {
    for (const seal of this.seals) {
      if (seal.state !== 'resting') continue;

      // If the seal's floe broke apart, the seal swims away
      if (!this.floes.some((f) => f.id === seal.floe.id)) {
        seal.state = 'spooked';
        seal.sprite.setVisible(false);
        seal.alertText.setVisible(false);
        continue;
      }

      // Keep seal anchored to its drifting/shrinking floe
      seal.sprite.x =
        seal.floe.container.x + seal.offsetX * seal.floe.currentScale;
      seal.sprite.y =
        seal.floe.container.y + seal.offsetY * seal.floe.currentScale;
      seal.alertText.setPosition(seal.sprite.x, seal.sprite.y - 26);

      const dist = Phaser.Math.Distance.Between(
        this.bearX,
        this.bearY,
        seal.sprite.x,
        seal.sprite.y
      );

      // Catch condition: Bear is within 46px (or 64px while lunging!)
      const catchRadius = this.lungeTimer > 0 ? 64 : 44;
      if (dist <= catchRadius) {
        seal.state = 'caught';
        seal.sprite.setVisible(false);
        seal.alertText.setVisible(false);
        this.sealsCaught++;
        // Eating a seal restores your Maximum Stamina ceiling!
        this.maxStamina = Math.min(100, this.maxStamina + 30);
        this.stamina = Math.min(this.maxStamina, this.stamina + 45);
        this.uiManager.spawnFloatingNotice(
          seal.sprite.x,
          seal.sprite.y,
          '+30% MAX STAMINA!',
          '#34d399'
        );
        continue;
      }

      // Stealth / Awareness check within 210px
      if (dist < 210) {
        const bearSpeed = Math.hypot(this.bearVx, this.bearVy);
        // Approaching in water or sprinting without lunging spooks the seal faster
        const noiseRate =
          this.lungeTimer > 0
            ? 25
            : !this.isOnIce
            ? 65
            : bearSpeed > 150
            ? 48
            : 18;

        seal.alertLevel += noiseRate * dt;
        if (seal.alertLevel >= 100) {
          seal.state = 'spooked';
          this.spawnSplashRing(seal.sprite.x, seal.sprite.y, 1.0);
          this.uiManager.spawnFloatingNotice(
            seal.sprite.x,
            seal.sprite.y,
            'Seal dove away!',
            '#fbbf24'
          );
          seal.sprite.setVisible(false);
          seal.alertText.setVisible(false);
        } else if (seal.alertLevel > 35) {
          seal.alertText.setText(
            seal.alertLevel > 70 ? '! (SPACE to Lunge)' : '?'
          );
        }
      } else {
        seal.alertLevel = Math.max(0, seal.alertLevel - 30 * dt);
        seal.alertText.setText('');
      }
    }
  }

  private updateShips(dt: number): void {
    const struck = this.shippingManager.update(dt, {
      playerX: this.bearX,
      playerY: this.bearY,
      hitHalfWidth: 74,
      hitHalfHeight: 28,
      onWakeOverlap: (shipVx, stepDt) => {
        this.bearX += shipVx * stepDt * 0.85;
        this.stamina = Math.max(0, this.stamina - 18 * stepDt);
      },
    });

    if (struck) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.cameras.main.shake(320, 0.014);
      this.spawnSplashRing(this.bearX, this.bearY, 1.8);
      this.uiManager.spawnFloatingNotice(
        this.bearX,
        this.bearY,
        'STRUCK BY ARCTIC VESSEL!',
        '#ef4444'
      );
      this.time.delayedCall(500, () => {
        this.triggerImpactOverlay(false, 'ship');
      });
    }
  }

  private spawnSplashRing(x: number, y: number, maxScale: number): void {
    const ring = this.add
      .image(x, y, 'water_ring')
      .setDepth(4)
      .setScale(0.25)
      .setAlpha(0.75);

    this.tweens.add({
      targets: ring,
      scale: maxScale,
      alpha: 0,
      duration: 650,
      onComplete: () => ring.destroy(),
    });
  }

  public getNextLevelData(): PolarBearSceneData {
    return {
      level: this.level + 1,
      carryMaxStamina: Math.min(100, this.maxStamina + 20),
      cumulativeMeters:
        this.cumulativeMetersBeforeLevel + this.levelTargetMeters,
      totalSwimMeters: Math.round(this.totalSwimMeters),
      sealsCaught: this.sealsCaught,
      floesCollapsed: this.floesCollapsed,
      cumulativeTimeSeconds:
        this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds,
    };
  }

  private checkWinLoss(): void {
    // Win: Reached the Northern Sanctuary near the Cub
    if (this.bearY <= this.SANCTUARY_Y + 75 && this.isOnIce) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);

      const isInfiniteMode = Boolean(
        (window as unknown as { wildSpacesInfiniteMode?: boolean })
          .wildSpacesInfiniteMode
      );

      if (isInfiniteMode) {
        const totalTime =
          this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds;
        const totalMeters =
          this.cumulativeMetersBeforeLevel + this.levelTargetMeters;
        const res = recordLevelCompletion({
          episodeId: 'PolarBearScene',
          level: this.level,
          levelTimeSeconds: this.levelElapsedSeconds,
          totalTimeSeconds: totalTime,
          totalMeters,
        });

        const nextLevel = this.level + 1;
        const nextMeters =
          this.BASE_LEVEL_METERS +
          (nextLevel - 1) * this.METERS_PER_LEVEL_INCREMENT;
        const pbSuffix = res.isNewBest
          ? ` (NEW BEST ${formatDuration(this.levelElapsedSeconds)}!)`
          : ` (${formatDuration(this.levelElapsedSeconds)})`;
        this.uiManager.spawnFloatingNotice(
          this.bearX,
          this.bearY - 24,
          `★ LEVEL ${this.level} COMPLETE${pbSuffix} → LEVEL ${nextLevel} (${nextMeters}m)`,
          '#34d399'
        );
        this.renderHUD();
        this.time.delayedCall(1500, () => {
          this.scene.restart(this.getNextLevelData());
        });
      } else {
        this.triggerImpactOverlay(true);
      }
      return;
    }

    // Loss: Exhaustion / Drowning (Stamina hit 0)
    if (this.stamina <= 0) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.triggerImpactOverlay(false);
    }
  }

  private triggerImpactOverlay(
    won: boolean,
    deathReason: 'exhaustion' | 'ship' = 'exhaustion'
  ): void {
    const metersInCurrentLevel = Math.min(
      this.levelTargetMeters,
      Math.max(
        0,
        Math.round(
          ((this.startY - this.bearY) / (this.startY - this.SANCTUARY_Y)) *
            this.levelTargetMeters
        )
      )
    );

    const totalMetersMigrated =
      this.cumulativeMetersBeforeLevel +
      (won ? this.levelTargetMeters : metersInCurrentLevel);

    const nextLevelMeters =
      this.BASE_LEVEL_METERS +
      this.level * this.METERS_PER_LEVEL_INCREMENT;

    const openOverlay = (window as unknown as {
      showPolarBearImpactModal?: (payload: {
        won: boolean;
        deathReason?: 'exhaustion' | 'ship';
        level: number;
        levelTargetMeters: number;
        metersInLevel: number;
        totalMetersMigrated: number;
        nextLevelMeters: number;
        swimMeters: number;
        sealsCaught: number;
        floesCollapsed: number;
        levelTimeSeconds: number;
        totalTimeSeconds: number;
        nextLevelData: PolarBearSceneData;
      }) => void;
    }).showPolarBearImpactModal;

    if (openOverlay) {
      openOverlay({
        won,
        deathReason,
        level: this.level,
        levelTargetMeters: this.levelTargetMeters,
        metersInLevel: won ? this.levelTargetMeters : metersInCurrentLevel,
        totalMetersMigrated,
        nextLevelMeters,
        swimMeters: Math.round(this.totalSwimMeters),
        sealsCaught: this.sealsCaught,
        floesCollapsed: this.floesCollapsed,
        levelTimeSeconds: this.levelElapsedSeconds,
        totalTimeSeconds:
          this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds,
        nextLevelData: this.getNextLevelData(),
      });
    }
  }

  private renderHUD(): void {
    const metersRemaining = Math.max(
      0,
      Math.round(
        ((this.bearY - this.SANCTUARY_Y) / (this.startY - this.SANCTUARY_Y)) *
          this.levelTargetMeters
      )
    );
    const progressPct = Phaser.Math.Clamp(
      1 - metersRemaining / this.levelTargetMeters,
      0,
      1
    );

    this.uiManager.renderTopHUD({
      headerPrefix: `EPISODE 01 • LEVEL ${this.level}`,
      elapsedSeconds: this.levelElapsedSeconds,
      heroValueText: `${metersRemaining}m`,
      subValueText: 'to Sanctuary',
      progressPct,
      stamina: this.stamina,
    });

    const onCrackingFloe =
      this.isOnIce && this.currentFloe && !this.currentFloe.isSanctuary;
    let secondaryBar:
      | {
          pct: number;
          fillColor: number;
          tagText: string;
          tagColor: string;
        }
      | undefined;

    if (onCrackingFloe && this.currentFloe) {
      const secsLeft = Math.max(
        0,
        this.currentFloe.standTimeLimit - this.currentFloe.standTimer
      );
      const lifePct = Phaser.Math.Clamp(
        secsLeft / this.currentFloe.standTimeLimit,
        0,
        1
      );
      secondaryBar = {
        pct: lifePct,
        fillColor: secsLeft < 1.5 ? 0xef4444 : 0xf59e0b,
        tagText: `${secsLeft.toFixed(1)}s`,
        tagColor: secsLeft < 1.5 ? '#f87171' : '#fbbf24',
      };
    }

    const fillCol =
      this.stamina < 28
        ? 0xef4444
        : this.isOnIce
        ? 0x34d399
        : 0x38bdf8;

    this.uiManager.renderWorldBars({
      x: this.bearX,
      y: this.bearY,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      primaryFillColor: fillCol,
      secondaryBar,
    });
  }
}
