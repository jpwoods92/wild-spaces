import Phaser from 'phaser';
import {
  formatDuration,
  recordLevelCompletion,
} from '../utils/LeaderboardStore';
import { shouldSpawnFoodAtNode } from '../utils/FoodScarcitySchedule';
import { ShippingCorridorManager } from '../systems/ShippingCorridorManager';
import {
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager';
import { globalPauseManager } from '../systems/PauseManager';

interface CanopyTree {
  id: number;
  container: Phaser.GameObjects.Container;
  shadowGraphics: Phaser.GameObjects.Graphics;
  canopyGraphics: Phaser.GameObjects.Graphics;
  stressGraphics: Phaser.GameObjects.Graphics;
  points: Phaser.Math.Vector2[];
  baseX: number;
  baseY: number;
  baseRadius: number;
  currentScale: number;
  swayPhase: number;
  standTimer: number;
  standTimeLimit: number;
  isSanctuary?: boolean;
  stressStage: number;
}

interface TamarindFruit {
  sprite: Phaser.GameObjects.Image;
  tree: CanopyTree;
  offsetX: number;
  offsetY: number;
  collected: boolean;
}

interface FossaPredator {
  sprite: Phaser.GameObjects.Image;
  alertText: Phaser.GameObjects.Text;
  patrolY: number;
  minX: number;
  maxX: number;
  vx: number;
  chaseSpeed: number;
  attackCooldown: number;
  isChasing: boolean;
}

export interface LemurSceneData {
  level?: number;
  carryMaxStamina?: number;
  cumulativeMeters?: number;
  totalGroundMeters?: number;
  fruitCollected?: number;
  treesFelled?: number;
  cumulativeTimeSeconds?: number;
}

export class LemurScene extends Phaser.Scene {
  private readonly WORLD_WIDTH = 2400;
  private readonly SANCTUARY_Y = 380;
  private readonly PIXELS_PER_METER = 3.54;
  private readonly BASE_LEVEL_METERS = 1000;
  private readonly METERS_PER_LEVEL_INCREMENT = 300;

  // Dynamic per-level world & difficulty parameters
  private level = 1;
  private levelTargetMeters = 1000;
  private startY = 3920;
  private worldHeight = 4200;
  private treeGapMin = 310;
  private treeGapMax = 380;
  private twoTreeChance = 0.42;

  // Player Lemur state
  private lemur!: Phaser.GameObjects.Sprite;
  private troopMember!: Phaser.GameObjects.Image;
  private lemurX = 1200;
  private lemurY = 3920;
  private lemurVx = 0;
  private lemurVy = 0;
  private lemurAngle = -Math.PI / 2;

  // Survival & Canopy Leap state
  private stamina = 100;
  private maxStamina = 100;
  private isInCanopy = true;
  private currentTree: CanopyTree | null = null;
  private leapTimer = 0;
  private leapCooldown = 0;
  private leapDirX = 0;
  private leapDirY = 0;
  private stepWobbleTime = 0;
  private dustStepTimer = 0;

  // Entities
  private haulRoadCenters: number[] = [];
  private shippingManager!: ShippingCorridorManager;
  private trees: CanopyTree[] = [];
  private fruits: TamarindFruit[] = [];
  private fossas: FossaPredator[] = [];

  // Run telemetry
  private cumulativeMetersBeforeLevel = 0;
  private cumulativeTimeBeforeLevel = 0;
  private levelElapsedSeconds = 0;
  private totalGroundMeters = 0;
  private fruitCollected = 0;
  private treesFelled = 0;
  private gameEnded = false;

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

  // Shared Episode UI Manager
  private uiManager!: EpisodeUIManager;

  constructor() {
    super({ key: 'LemurScene' });
  }

  init(data?: LemurSceneData): void {
    this.level = data?.level && data.level >= 1 ? Math.floor(data.level) : 1;

    this.levelTargetMeters =
      this.BASE_LEVEL_METERS +
      (this.level - 1) * this.METERS_PER_LEVEL_INCREMENT;
    this.startY =
      this.SANCTUARY_Y +
      Math.round(this.levelTargetMeters * this.PIXELS_PER_METER);
    this.worldHeight = this.startY + 280;

    // Wider clear-cut deforestation gaps as level increases (up to cap)
    this.treeGapMin = Math.min(440, 310 + (this.level - 1) * 26);
    this.treeGapMax = Math.min(510, 380 + (this.level - 1) * 26);
    this.twoTreeChance = Math.max(0.08, 0.42 - (this.level - 1) * 0.068);

    this.cumulativeMetersBeforeLevel = data?.cumulativeMeters ?? 0;
    this.cumulativeTimeBeforeLevel = data?.cumulativeTimeSeconds ?? 0;
    this.levelElapsedSeconds = 0;
    this.totalGroundMeters = data?.totalGroundMeters ?? 0;
    this.fruitCollected = data?.fruitCollected ?? 0;
    this.treesFelled = data?.treesFelled ?? 0;
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
        'Episode 3: Fractured Canopy (Ring-Tailed Lemur)';
    }

    // 1. Spiny Forest Red-Earth Backdrop
    this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.worldHeight);
    this.drawForestFloorBackdrop();

    // 2. Generate Canopy Stepping Stones & Ancient Baobab Sanctuary
    this.generateCanopyRoute();

    // 3. Spawn Active Clear-Cut Logging Haul Roads via Shared ShippingCorridorManager
    this.spawnLoggingHaulRoads();

    // 4. Spawn Ground Ambush Fossa Predators in clearings
    this.spawnFossaPredators();

    // 5. Spawn Waiting Juvenile Lemur Troop at Northern Baobab Sanctuary
    this.troopMember = this.add
      .image(this.WORLD_WIDTH / 2, this.SANCTUARY_Y - 62, 'lemur_troop')
      .setDepth(15)
      .setAngle(90);

    // 6. Spawn Player Ring-Tailed Lemur
    this.lemur = this.add
      .sprite(this.lemurX, this.lemurY, 'lemur_walk')
      .setDepth(20)
      .setRotation(this.lemurAngle);

    this.cameras.main.startFollow(this.lemur, true, 0.09, 0.09);

    // 7. Ambient Canopy Leaves Drifting in the Wind
    this.add
      .particles(0, 0, 'leaf_dot', {
        x: { min: 0, max: this.scale.width },
        y: -10,
        lifespan: 6200,
        speedY: { min: 25, max: 55 },
        speedX: { min: -28, max: 28 },
        rotate: { min: 0, max: 360 },
        scale: { start: 0.75, end: 0.35 },
        alpha: { start: 0.5, end: 0 },
        quantity: 1,
        frequency: 140,
      })
      .setScrollFactor(0)
      .setDepth(90);

    // 8. Controls
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

    // 9. Build Shared Episode HUD & World-Space Bars
    this.uiManager = new EpisodeUIManager(this, {
      accentColor: 0x34d399,
      accentHex: '#34d399',
      bottomHint:
        'WASD / Arrows: Move  •  SPACE: Canopy Leap  •  Eat Tamarind Fruit to Restore Max Stamina  •  P / ESC: Pause',
      autoFadeHintMs: 5500,
      worldUiYOffset: 64,
      worldBarWidth: 74,
    });
    this.uiManager.redrawViewportBg(0x160e08);
    globalPauseManager.attachScene(this);

    if (this.level > 1) {
      this.uiManager.spawnFloatingNotice(
        this.lemurX,
        this.lemurY - 30,
        `LEVEL ${this.level} — ${this.levelTargetMeters}m TO BAOBAB SANCTUARY`,
        '#34d399'
      );
    }

    this.scale.on('resize', () => {
      this.uiManager.handleResize(0x160e08);
    });
  }

  private resetLevelEntities(): void {
    this.lemurX = this.WORLD_WIDTH / 2;
    this.lemurY = this.startY;
    this.lemurVx = 0;
    this.lemurVy = 0;
    this.lemurAngle = -Math.PI / 2;
    this.isInCanopy = true;
    this.currentTree = null;
    this.leapTimer = 0;
    this.leapCooldown = 0;
    this.stepWobbleTime = 0;
    this.dustStepTimer = 0;
    this.haulRoadCenters = [];
    if (!this.shippingManager) {
      this.shippingManager = new ShippingCorridorManager(this);
    } else {
      this.shippingManager.clear();
    }
    this.trees = [];
    this.fruits = [];
    this.fossas = [];
    this.gameEnded = false;

    const totalRoutePx = this.startY - this.SANCTUARY_Y;
    const numCorridors = Math.max(1, Math.floor(totalRoutePx / 1950));
    for (let c = 1; c <= numCorridors; c++) {
      const centerRoadY = Math.round(
        this.SANCTUARY_Y + (totalRoutePx * c) / (numCorridors + 1)
      );
      this.haulRoadCenters.push(centerRoadY);
    }
  }

  private drawForestFloorBackdrop(): void {
    const bg = this.add.graphics().setDepth(0);
    // Baked Madagascar red laterite soil & scorched clearing gradient
    bg.fillGradientStyle(0x28170e, 0x28170e, 0x1b0f09, 0x1b0f09, 1);
    bg.fillRect(0, 0, this.WORLD_WIDTH, this.worldHeight);

    // Dry scrub contours & sun-cracked laterite tracks across the forest floor
    bg.lineStyle(2, 0x78350f, 0.24);
    for (let y = 180; y < this.worldHeight; y += 160) {
      bg.beginPath();
      for (let x = 0; x <= this.WORLD_WIDTH; x += 90) {
        const waveY = y + Math.sin(x * 0.007 + y * 0.013) * 16;
        if (x === 0) bg.moveTo(x, waveY);
        else bg.lineTo(x, waveY);
      }
      bg.strokePath();
    }

    // Scattered cleared tree stumps & brush patches on the scorched floor
    for (let i = 0; i < 65; i++) {
      const sx = Phaser.Math.Between(180, this.WORLD_WIDTH - 180);
      const sy = Phaser.Math.Between(520, this.worldHeight - 160);
      if (this.haulRoadCenters.some((ry) => Math.abs(sy - ry) < 175)) continue;

      bg.fillStyle(0x451a03, 0.55);
      bg.fillCircle(sx, sy, Phaser.Math.Between(10, 16));
      bg.fillStyle(0x92400e, 0.75);
      bg.fillCircle(sx, sy, Phaser.Math.Between(6, 10));
    }
  }

  private canPlaceTree(x: number, y: number, radius: number): boolean {
    for (const existing of this.trees) {
      const minSeparation = (existing.baseRadius + radius) * 1.24 + 80;
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

  private generateCanopyRoute(): void {
    let nextId = 1;

    // 1. Starting Baobab & Spiny Crown (gives ~7.5s before chainsaws reach it)
    this.createCanopyTree(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.startY,
      126,
      7.5
    );

    // 2. Stepping-stone canopy crowns from South (`startY - 340`) to North (`Y = 740`)
    let yCursor = this.startY - 340;
    let prevX = this.WORLD_WIDTH / 2;
    let treesSinceLastFruit = 0;

    // Time before logging saws fell a tree tightens slightly on higher levels (down to 2.7s..4.0s)
    const minStandTime = Math.max(2.7, 3.8 - (this.level - 1) * 0.16);
    const maxStandTime = Math.max(4.0, 5.4 - (this.level - 1) * 0.2);

    while (yCursor > 740) {
      const blockingRoadY = this.haulRoadCenters.find(
        (cy) => Math.abs(yCursor - cy) < 175
      );

      if (blockingRoadY !== undefined) {
        const hasSouthStaging = this.trees.some(
          (t) =>
            t.baseY >= blockingRoadY + 170 && t.baseY <= blockingRoadY + 290
        );
        if (!hasSouthStaging) {
          const stageX = Phaser.Math.Clamp(
            prevX + Phaser.Math.Between(-160, 160),
            this.WORLD_WIDTH / 2 - 360,
            this.WORLD_WIDTH / 2 + 360
          );
          const stageTree = this.createCanopyTree(
            nextId++,
            stageX,
            blockingRoadY + 205,
            96,
            maxStandTime + 0.6
          );
          prevX = stageX;
          treesSinceLastFruit++;
          if (shouldSpawnFoodAtNode(this.level, treesSinceLastFruit)) {
            this.spawnFruitOnTree(stageTree);
            treesSinceLastFruit = 0;
          }
        }
        yCursor = blockingRoadY - 205;
        if (yCursor <= 740) break;
      }

      const treesInBand = Math.random() < this.twoTreeChance ? 2 : 1;

      for (let i = 0; i < treesInBand; i++) {
        const baseRadius = Phaser.Math.Between(76, 114);
        const standTimeLimit = Phaser.Math.Linear(
          minStandTime,
          maxStandTime,
          (baseRadius - 76) / (114 - 76)
        );

        const centerX = this.WORLD_WIDTH / 2;
        let placedTree: CanopyTree | null = null;
        for (let attempt = 0; attempt < 16; attempt++) {
          const candidateX =
            treesInBand === 1
              ? Phaser.Math.Clamp(
                  prevX + Phaser.Math.Between(-310, 310),
                  centerX - 420,
                  centerX + 420
                )
              : i === 0
              ? Phaser.Math.Between(centerX - 440, centerX - 150)
              : Phaser.Math.Between(centerX + 150, centerX + 440);

          const candidateY = yCursor + Phaser.Math.Between(-28, 28);

          if (this.canPlaceTree(candidateX, candidateY, baseRadius)) {
            placedTree = this.createCanopyTree(
              nextId++,
              candidateX,
              candidateY,
              baseRadius,
              standTimeLimit
            );
            prevX = candidateX;
            break;
          }
        }

        if (placedTree) {
          treesSinceLastFruit++;
          if (shouldSpawnFoodAtNode(this.level, treesSinceLastFruit)) {
            this.spawnFruitOnTree(placedTree);
            treesSinceLastFruit = 0;
          }
        }
      }

      yCursor -= Phaser.Math.Between(this.treeGapMin, this.treeGapMax);
    }

    // 3. Permanent Northern Ancient Baobab Sanctuary
    const sanctuary = this.createCanopyTree(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.SANCTUARY_Y - 30,
      360,
      99999,
      true
    );

    this.add
      .text(
        this.WORLD_WIDTH / 2,
        this.SANCTUARY_Y - 140,
        `★ LEVEL ${this.level} ANCIENT BAOBAB SANCTUARY ★`,
        {
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#34d399',
          letterSpacing: 2,
        }
      )
      .setOrigin(0.5)
      .setDepth(16);

    this.currentTree = sanctuary;
  }

  private createCanopyTree(
    id: number,
    x: number,
    y: number,
    radius: number,
    standTimeLimit: number,
    isSanctuary = false
  ): CanopyTree {
    const container = this.add.container(x, y).setDepth(6);
    const shadowGraphics = this.add.graphics();
    const canopyGraphics = this.add.graphics();
    const stressGraphics = this.add.graphics();

    const points: Phaser.Math.Vector2[] = [];
    const numVertices = isSanctuary ? 22 : 14;
    for (let i = 0; i < numVertices; i++) {
      const angle = (i / numVertices) * Math.PI * 2;
      const jitter = isSanctuary
        ? Phaser.Math.FloatBetween(0.92, 1.1)
        : Phaser.Math.FloatBetween(0.8, 1.14);
      const rx =
        Math.cos(angle) * radius * jitter * (isSanctuary ? 1.85 : 1.08);
      const ry = Math.sin(angle) * radius * jitter * (isSanctuary ? 0.65 : 0.94);
      points.push(new Phaser.Math.Vector2(rx, ry));
    }

    // Forest-floor canopy shadow
    shadowGraphics.fillStyle(0x090502, 0.36);
    shadowGraphics.beginPath();
    points.forEach((pt, idx) => {
      const sx = pt.x * 1.04 + 10;
      const sy = pt.y * 1.04 + 14;
      if (idx === 0) shadowGraphics.moveTo(sx, sy);
      else shadowGraphics.lineTo(sx, sy);
    });
    shadowGraphics.closePath();
    shadowGraphics.fillPath();

    // Base trunk center visible underneath outer boughs
    canopyGraphics.fillStyle(0x78350f, 0.95);
    canopyGraphics.fillCircle(0, 4, isSanctuary ? 38 : 16);

    // Rich Spiny-Forest Emerald Crown
    canopyGraphics.fillStyle(isSanctuary ? 0x15803d : 0x166534, 0.96);
    canopyGraphics.lineStyle(3, 0x22c55e, 0.65);
    canopyGraphics.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) canopyGraphics.moveTo(pt.x, pt.y);
      else canopyGraphics.lineTo(pt.x, pt.y);
    });
    canopyGraphics.closePath();
    canopyGraphics.fillPath();
    canopyGraphics.strokePath();

    // Sunlit inner foliage crown layer
    canopyGraphics.fillStyle(isSanctuary ? 0x22c55e : 0x16a34a, 0.78);
    canopyGraphics.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) canopyGraphics.moveTo(pt.x * 0.72, pt.y * 0.72 - 4);
      else canopyGraphics.lineTo(pt.x * 0.72, pt.y * 0.72 - 4);
    });
    canopyGraphics.closePath();
    canopyGraphics.fillPath();

    // Highlighted top leaves
    canopyGraphics.fillStyle(0x4ade80, 0.42);
    canopyGraphics.fillCircle(-radius * 0.16, -radius * 0.14, radius * 0.28);

    container.add([shadowGraphics, canopyGraphics, stressGraphics]);

    const tree: CanopyTree = {
      id,
      container,
      shadowGraphics,
      canopyGraphics,
      stressGraphics,
      points,
      baseX: x,
      baseY: y,
      baseRadius: radius,
      currentScale: 1,
      swayPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      standTimer: 0,
      standTimeLimit,
      isSanctuary,
      stressStage: 0,
    };

    this.trees.push(tree);
    return tree;
  }

  private drawTreeSawStress(tree: CanopyTree, stage: number): void {
    tree.stressGraphics.clear();
    if (stage <= 0) return;

    tree.stressGraphics.lineStyle(
      stage >= 3 ? 3 : 2,
      stage >= 3 ? 0xef4444 : 0xf59e0b,
      0.85
    );

    const cutCount = stage * 3;
    for (let i = 0; i < cutCount; i++) {
      const pt = tree.points[(i * 2) % tree.points.length];
      tree.stressGraphics.beginPath();
      tree.stressGraphics.moveTo(pt.x * 0.85, pt.y * 0.85);
      tree.stressGraphics.lineTo(
        pt.x * 0.35 + (i % 2 === 0 ? 10 : -10),
        pt.y * 0.35 + (i % 3 === 0 ? -8 : 8)
      );
      tree.stressGraphics.strokePath();
    }
  }

  private fellTree(tree: CanopyTree): void {
    const cx = tree.container.x;
    const cy = tree.container.y;
    this.uiManager.spawnFloatingNotice(cx, cy, 'TREE FELLED!', '#ef4444');

    // Leave a freshly sawed stump behind on the red-earth forest floor
    const stump = this.add.graphics({ x: cx, y: cy }).setDepth(3);
    stump.fillStyle(0x78350f, 0.9);
    stump.fillCircle(0, 0, 18);
    stump.fillStyle(0xd97706, 0.85);
    stump.fillCircle(0, 0, 12);
    stump.lineStyle(1.5, 0x92400e, 0.8);
    stump.strokeCircle(0, 0, 7);

    // Scatter falling branches & leaf clusters outward as the tree falls
    const shardCount = 6;
    for (let i = 0; i < shardCount; i++) {
      const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.4;
      const dist = tree.baseRadius * tree.currentScale * 0.35;
      const leafChunk = this.add
        .graphics({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
        })
        .setDepth(6);

      leafChunk.fillStyle(i % 2 === 0 ? 0x16a34a : 0x78350f, 0.9);
      const r = tree.baseRadius * tree.currentScale * 0.28;
      leafChunk.fillEllipse(0, 0, r * 1.4, r);

      this.tweens.add({
        targets: leafChunk,
        x: leafChunk.x + Math.cos(angle) * 60,
        y: leafChunk.y + Math.sin(angle) * 60,
        scaleX: 0.15,
        scaleY: 0.15,
        alpha: 0,
        rotation: (i % 2 === 0 ? 1 : -1) * 1.1,
        duration: 750,
        onComplete: () => leafChunk.destroy(),
      });
    }

    tree.container.destroy();
  }

  private spawnFruitOnTree(tree: CanopyTree): void {
    const pt = tree.points[Phaser.Math.Between(0, tree.points.length - 1)];
    const offsetX = pt.x * 0.56;
    const offsetY = pt.y * 0.56;

    const sprite = this.add
      .image(tree.baseX + offsetX, tree.baseY + offsetY, 'tamarind_fruit')
      .setDepth(13);

    this.tweens.add({
      targets: sprite,
      scale: 1.12,
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.fruits.push({
      sprite,
      tree,
      offsetX,
      offsetY,
      collected: false,
    });
  }

  private spawnLoggingHaulRoads(): void {
    const centerX = this.WORLD_WIDTH / 2;
    const speedBoost = Math.min(44, (this.level - 1) * 10);

    this.shippingManager.spawnCorridors({
      corridors: this.haulRoadCenters.map((y) => ({
        x: centerX,
        y,
      })),
      worldWidth: this.WORLD_WIDTH,
      bannerText: '⚠ ACTIVE LOGGING HAUL ROAD — TIMBER TRUCK IMPACT IS FATAL ⚠',
      shipsPerLane: 3,
      eastboundSpeed: 185 + speedBoost,
      westboundSpeed: 205 + speedBoost,
      textureKey: 'logging_truck',
      wakeStyle: 'dust',
      fillColor: 0x78350f,
      fillAlpha: 0.34,
      corridorDepth: 2,
      wakeDepth: 13,
      shipDepth: 14,
    });
  }

  private spawnFossaPredators(): void {
    const fossaCount = Math.min(18, 5 + (this.level - 1) * 3);
    const chaseSpeed = Math.min(175, 118 + (this.level - 1) * 12);
    const patrolSpeed = Math.min(115, 72 + (this.level - 1) * 8);

    const routeSpan = this.startY - 340 - (this.SANCTUARY_Y + 320);
    for (let i = 0; i < fossaCount; i++) {
      const frac = (i + 0.5) / fossaCount;
      let patrolY = Math.round(
        this.SANCTUARY_Y + 320 + routeSpan * frac + Phaser.Math.Between(-50, 50)
      );

      // Keep predators out of the haul roads so they patrol forest-floor clearings
      const nearRoad = this.haulRoadCenters.find(
        (ry) => Math.abs(patrolY - ry) < 195
      );
      if (nearRoad !== undefined) {
        patrolY = nearRoad + (patrolY >= nearRoad ? 215 : -215);
      }

      const startX = Phaser.Math.Between(
        this.WORLD_WIDTH / 2 - 380,
        this.WORLD_WIDTH / 2 + 380
      );
      const dir = i % 2 === 0 ? 1 : -1;

      const sprite = this.add
        .image(startX, patrolY, 'fossa_predator')
        .setDepth(16)
        .setRotation(dir > 0 ? 0 : Math.PI);

      const alertText = this.add
        .text(startX, patrolY - 26, '', {
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#ef4444',
          stroke: '#041019',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(30);

      this.fossas.push({
        sprite,
        alertText,
        patrolY,
        minX: this.WORLD_WIDTH / 2 - 480,
        maxX: this.WORLD_WIDTH / 2 + 480,
        vx: dir * patrolSpeed,
        chaseSpeed,
        attackCooldown: 0,
        isChasing: false,
      });
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameEnded || globalPauseManager.isPaused()) return;

    const dt = Math.min(deltaMs / 1000, 0.05);
    this.levelElapsedSeconds += dt;

    // 1. Update Canopy Trees (wind sway & active logging collapse)
    this.updateTrees(dt);

    // 2. Check if Lemur is safely inside a Canopy Crown
    this.checkCanopySupport();

    // 3. Handle Player Movement & Canopy Leap
    this.updateLemurMovement(dt);

    // 4. Update Survival Meters (Stamina recovery in canopy / ground burn)
    this.updateSurvivalMeters(dt);

    // 5. Update Tamarind Fruit Foraging & Fossa Ground Predators
    this.updateFruits();
    this.updateFossas(dt);

    // 6. Update Logging Haul Road Trucks via Shared ShippingCorridorManager
    this.updateLoggingTrucks(dt);

    // 7. Animate waiting Troop Juvenile at Ancient Baobab Sanctuary
    this.troopMember.rotation =
      Math.PI / 2 + Math.sin(this.time.now * 0.0045) * 0.25;

    // 8. Check Win / Loss Conditions
    this.checkWinLoss();

    // 9. Redraw Shared HUD & World Bars
    this.renderHUD();
  }

  private updateTrees(dt: number): void {
    for (let i = this.trees.length - 1; i >= 0; i--) {
      const tree = this.trees[i];
      if (tree.isSanctuary) continue;

      const lemurOnThis = this.currentTree?.id === tree.id;
      if (lemurOnThis) {
        tree.standTimer += dt;
      }

      const stressRatio = Phaser.Math.Clamp(
        tree.standTimer / tree.standTimeLimit,
        0,
        1
      );

      tree.currentScale = 1.0 - stressRatio * 0.26;
      tree.container.setScale(tree.currentScale);

      // Gentle canopy breeze sway + chainsaw tremor above 62% stress
      tree.swayPhase += dt * 1.8;
      const breezeOffsetX = Math.sin(tree.swayPhase) * 2.5;
      const sawShudderX =
        lemurOnThis && stressRatio > 0.62
          ? Math.sin(this.time.now * 0.06) * 4
          : 0;
      tree.container.x = tree.baseX + breezeOffsetX + sawShudderX;
      tree.container.y = tree.baseY;

      const targetStressStage =
        stressRatio >= 0.72
          ? 3
          : stressRatio >= 0.44
          ? 2
          : stressRatio >= 0.16
          ? 1
          : 0;

      if (targetStressStage !== tree.stressStage) {
        tree.stressStage = targetStressStage;
        this.drawTreeSawStress(tree, targetStressStage);
      }

      if (tree.standTimer >= tree.standTimeLimit) {
        this.fellTree(tree);
        this.trees.splice(i, 1);
        this.treesFelled++;
        if (this.currentTree?.id === tree.id) {
          this.currentTree = null;
          this.isInCanopy = false;
        }
      }
    }
  }

  private checkCanopySupport(): void {
    let foundTree: CanopyTree | null = null;

    for (const tree of this.trees) {
      const dx = this.lemurX - tree.container.x;
      const dy = this.lemurY - tree.container.y;
      const rx =
        tree.baseRadius *
        tree.currentScale *
        (tree.isSanctuary ? 1.75 : 1.02);
      const ry =
        tree.baseRadius *
        tree.currentScale *
        (tree.isSanctuary ? 0.6 : 0.9);

      const normDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (normDist <= 1.0) {
        foundTree = tree;
        break;
      }
    }

    this.currentTree = foundTree;
    this.isInCanopy = foundTree !== null;
  }

  private updateLemurMovement(dt: number): void {
    this.leapCooldown = Math.max(0, this.leapCooldown - dt);

    let inputX = 0;
    let inputY = 0;

    if (this.cursors) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) inputX -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) inputX += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) inputY -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) inputY += 1;
    }

    if (this.input.activePointer.isDown && inputX === 0 && inputY === 0) {
      const worldPt = this.cameras.main.getWorldPoint(
        this.input.activePointer.x,
        this.input.activePointer.y
      );
      const pdx = worldPt.x - this.lemurX;
      const pdy = worldPt.y - this.lemurY;
      if (Math.hypot(pdx, pdy) > 20) {
        inputX = pdx;
        inputY = pdy;
      }
    }

    const len = Math.hypot(inputX, inputY);
    if (len > 0) {
      inputX /= len;
      inputY /= len;
      this.lemurAngle = Phaser.Math.Angle.RotateTo(
        this.lemurAngle,
        Math.atan2(inputY, inputX),
        11 * dt
      );
    }

    // Trigger Canopy Leap on SPACE or SHIFT
    const leapPressed =
      this.wasd &&
      (Phaser.Input.Keyboard.JustDown(this.wasd.SPACE) ||
        Phaser.Input.Keyboard.JustDown(this.wasd.SHIFT));

    if (leapPressed && this.leapCooldown <= 0 && this.stamina >= 13) {
      this.leapTimer = 0.3;
      this.leapCooldown = 0.72;
      this.stamina = Math.max(0, this.stamina - 13);
      this.leapDirX = Math.cos(this.lemurAngle);
      this.leapDirY = Math.sin(this.lemurAngle);
    }

    const maxStaminaSpeedFactor = getStaminaSpeedMultiplier(
      this.maxStamina,
      0.52
    );

    if (this.leapTimer > 0) {
      this.leapTimer -= dt;
      const leapSpeed =
        (this.isInCanopy ? 410 : 285) * maxStaminaSpeedFactor;
      this.lemurVx = this.leapDirX * leapSpeed;
      this.lemurVy = this.leapDirY * leapSpeed;
      this.lemur.setTexture('lemur_leap');
      this.lemur.setScale(1.16);
    } else {
      const rawSpeed = this.isInCanopy
        ? 210
        : this.stamina > 5
        ? 145
        : 84;
      const baseSpeed = rawSpeed * maxStaminaSpeedFactor;
      this.lemurVx = inputX * baseSpeed;
      this.lemurVy = inputY * baseSpeed;
      this.lemur.setTexture('lemur_walk');
      this.lemur.setScale(1.0);
    }

    const prevX = this.lemurX;
    const prevY = this.lemurY;

    this.lemurX = Phaser.Math.Clamp(
      this.lemurX + this.lemurVx * dt,
      45,
      this.WORLD_WIDTH - 45
    );
    this.lemurY = Phaser.Math.Clamp(
      this.lemurY + this.lemurVy * dt,
      180,
      this.worldHeight - 60
    );

    const frameDist = Math.hypot(this.lemurX - prevX, this.lemurY - prevY);
    if (!this.isInCanopy && this.leapTimer <= 0) {
      this.totalGroundMeters += frameDist / this.PIXELS_PER_METER;
      this.dustStepTimer += dt;
      if (this.dustStepTimer > 0.3 && frameDist > 0.3) {
        this.dustStepTimer = 0;
        this.spawnGroundDustPuff(this.lemurX, this.lemurY);
      }
    }

    if (frameDist > 0.3 && this.leapTimer <= 0) {
      this.stepWobbleTime += dt * (this.isInCanopy ? 13 : 9);
    }
    const wobble =
      this.leapTimer > 0 ? 0 : Math.sin(this.stepWobbleTime) * 0.06;

    this.lemur.setPosition(this.lemurX, this.lemurY);
    this.lemur.setRotation(this.lemurAngle + wobble);
  }

  private updateSurvivalMeters(dt: number): void {
    const isMoving = Math.hypot(this.lemurVx, this.lemurVy) > 10;

    if (this.isInCanopy) {
      // Resting/perching inside tree crowns recovers stamina rapidly up to maxStamina ceiling
      this.stamina = Math.min(this.maxStamina, this.stamina + 22 * dt);
    } else if (this.leapTimer <= 0) {
      // Exposed sun-baked deforested earth slowly erodes Max Stamina ceiling & burns Stamina
      this.maxStamina = Math.max(20, this.maxStamina - 2.4 * dt);
      const groundDrain = isMoving ? 6.2 : 3.0;
      this.stamina = Math.min(
        this.maxStamina,
        Math.max(0, this.stamina - groundDrain * dt)
      );
    }
  }

  private updateFruits(): void {
    for (const fruit of this.fruits) {
      if (fruit.collected) continue;

      if (!this.trees.some((t) => t.id === fruit.tree.id)) {
        fruit.collected = true;
        fruit.sprite.setVisible(false);
        continue;
      }

      fruit.sprite.x =
        fruit.tree.container.x + fruit.offsetX * fruit.tree.currentScale;
      fruit.sprite.y =
        fruit.tree.container.y + fruit.offsetY * fruit.tree.currentScale;

      const dist = Phaser.Math.Distance.Between(
        this.lemurX,
        this.lemurY,
        fruit.sprite.x,
        fruit.sprite.y
      );
      if (dist <= 48) {
        fruit.collected = true;
        fruit.sprite.setVisible(false);
        this.fruitCollected++;
        this.maxStamina = Math.min(100, this.maxStamina + 28);
        this.stamina = Math.min(this.maxStamina, this.stamina + 42);
        this.uiManager.spawnFloatingNotice(
          fruit.sprite.x,
          fruit.sprite.y,
          '+28% MAX STAMINA!',
          '#34d399'
        );
      }
    }
  }

  private updateFossas(dt: number): void {
    for (const fossa of this.fossas) {
      if (fossa.attackCooldown > 0) {
        fossa.attackCooldown = Math.max(0, fossa.attackCooldown - dt);
      }

      const distToLemur = Phaser.Math.Distance.Between(
        fossa.sprite.x,
        fossa.sprite.y,
        this.lemurX,
        this.lemurY
      );

      // Chase only when the lemur touches down on the exposed forest floor nearby
      if (distToLemur < 230 && !this.isInCanopy && this.leapTimer <= 0) {
        fossa.isChasing = true;
        const angle = Phaser.Math.Angle.Between(
          fossa.sprite.x,
          fossa.sprite.y,
          this.lemurX,
          this.lemurY
        );
        fossa.sprite.x += Math.cos(angle) * fossa.chaseSpeed * dt;
        fossa.sprite.y = Phaser.Math.Clamp(
          fossa.sprite.y + Math.sin(angle) * fossa.chaseSpeed * dt,
          this.SANCTUARY_Y + 95,
          this.worldHeight - 80
        );
        fossa.sprite.setRotation(angle);
        fossa.alertText.setText('!');
      } else {
        fossa.isChasing = false;
        fossa.sprite.x += fossa.vx * dt;
        // Drift smoothly back to patrol corridor Y
        fossa.sprite.y = Phaser.Math.Linear(
          fossa.sprite.y,
          fossa.patrolY,
          1.8 * dt
        );

        if (fossa.sprite.x < fossa.minX) {
          fossa.sprite.x = fossa.minX;
          fossa.vx = Math.abs(fossa.vx);
        } else if (fossa.sprite.x > fossa.maxX) {
          fossa.sprite.x = fossa.maxX;
          fossa.vx = -Math.abs(fossa.vx);
        }
        fossa.sprite.setRotation(fossa.vx >= 0 ? 0 : Math.PI);
        fossa.alertText.setText(distToLemur < 230 ? '?' : '');
      }

      fossa.alertText.setPosition(fossa.sprite.x, fossa.sprite.y - 26);

      // Ambush bite if catching an exposed lemur on the ground (mid-air Canopy Leap clears the Fossa)
      if (
        distToLemur < 42 &&
        !this.isInCanopy &&
        this.leapTimer <= 0 &&
        fossa.attackCooldown <= 0
      ) {
        fossa.attackCooldown = 1.1;
        this.stamina = Math.max(0, this.stamina - 32);
        this.maxStamina = Math.max(20, this.maxStamina - 12);
        this.cameras.main.shake(220, 0.012);
        this.uiManager.spawnFloatingNotice(
          this.lemurX,
          this.lemurY - 36,
          'FOSSA AMBUSH! LEAP TO THE CANOPY!',
          '#ef4444'
        );
      }
    }
  }

  private updateLoggingTrucks(dt: number): void {
    const struck = this.shippingManager.update(dt, {
      playerX: this.lemurX,
      playerY: this.lemurY,
      hitHalfWidth: 74,
      hitHalfHeight: 28,
      onWakeOverlap: (truckVx, stepDt) => {
        if (!this.isInCanopy && this.leapTimer <= 0) {
          this.lemurX += truckVx * stepDt * 0.75;
          this.stamina = Math.max(0, this.stamina - 14 * stepDt);
        }
      },
    });

    if (struck) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.cameras.main.shake(340, 0.016);
      this.spawnGroundDustPuff(this.lemurX, this.lemurY, 1.8);
      this.uiManager.spawnFloatingNotice(
        this.lemurX,
        this.lemurY,
        'STRUCK ON LOGGING HAUL ROAD!',
        '#ef4444'
      );
      this.time.delayedCall(500, () => {
        this.triggerImpactOverlay(false, 'truck');
      });
    }
  }

  private spawnGroundDustPuff(x: number, y: number, scale = 0.85): void {
    const puff = this.add.graphics({ x, y }).setDepth(4);
    puff.fillStyle(0xd97706, 0.45);
    puff.fillCircle(0, 0, 12 * scale);

    this.tweens.add({
      targets: puff,
      scaleX: 2.0,
      scaleY: 2.0,
      alpha: 0,
      duration: 550,
      onComplete: () => puff.destroy(),
    });
  }

  public getNextLevelData(): LemurSceneData {
    return {
      level: this.level + 1,
      carryMaxStamina: Math.min(100, this.maxStamina + 20),
      cumulativeMeters:
        this.cumulativeMetersBeforeLevel + this.levelTargetMeters,
      totalGroundMeters: Math.round(this.totalGroundMeters),
      fruitCollected: this.fruitCollected,
      treesFelled: this.treesFelled,
      cumulativeTimeSeconds:
        this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds,
    };
  }

  private checkWinLoss(): void {
    // Win: Reached Northern Ancient Baobab Sanctuary safely in the canopy
    if (this.lemurY <= this.SANCTUARY_Y + 75 && this.isInCanopy) {
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
          episodeId: 'LemurScene',
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
          this.lemurX,
          this.lemurY - 24,
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

    // Loss: Stamina depleted from heat exposure or Fossa ambush
    if (this.stamina <= 0) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.triggerImpactOverlay(false, 'exhaustion');
    }
  }

  private triggerImpactOverlay(
    won: boolean,
    deathReason: 'exhaustion' | 'truck' = 'exhaustion'
  ): void {
    const metersInCurrentLevel = Math.min(
      this.levelTargetMeters,
      Math.max(
        0,
        Math.round(
          ((this.startY - this.lemurY) / (this.startY - this.SANCTUARY_Y)) *
            this.levelTargetMeters
        )
      )
    );

    const totalMetersMigrated =
      this.cumulativeMetersBeforeLevel +
      (won ? this.levelTargetMeters : metersInCurrentLevel);

    const nextLevelMeters =
      this.BASE_LEVEL_METERS + this.level * this.METERS_PER_LEVEL_INCREMENT;

    const openOverlay = (window as unknown as {
      showLemurImpactModal?: (payload: {
        won: boolean;
        deathReason?: 'exhaustion' | 'truck';
        level: number;
        levelTargetMeters: number;
        metersInLevel: number;
        totalMetersMigrated: number;
        nextLevelMeters: number;
        groundMeters: number;
        fruitCollected: number;
        treesFelled: number;
        levelTimeSeconds: number;
        totalTimeSeconds: number;
        nextLevelData: LemurSceneData;
      }) => void;
    }).showLemurImpactModal;

    if (openOverlay) {
      openOverlay({
        won,
        deathReason,
        level: this.level,
        levelTargetMeters: this.levelTargetMeters,
        metersInLevel: won ? this.levelTargetMeters : metersInCurrentLevel,
        totalMetersMigrated,
        nextLevelMeters,
        groundMeters: Math.round(this.totalGroundMeters),
        fruitCollected: this.fruitCollected,
        treesFelled: this.treesFelled,
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
        ((this.lemurY - this.SANCTUARY_Y) / (this.startY - this.SANCTUARY_Y)) *
          this.levelTargetMeters
      )
    );
    const progressPct = Phaser.Math.Clamp(
      1 - metersRemaining / this.levelTargetMeters,
      0,
      1
    );

    const predatorDanger = this.fossas.some((f) => f.isChasing);

    this.uiManager.renderTopHUD({
      headerPrefix: `EPISODE 03 • LEVEL ${this.level}`,
      elapsedSeconds: this.levelElapsedSeconds,
      heroValueText: `${metersRemaining}m`,
      subValueText: 'to Baobab Sanctuary',
      progressPct,
      stamina: this.stamina,
      secondaryVignetteColor: 0xf59e0b,
      secondaryVignetteAlpha: predatorDanger ? 0.34 : !this.isInCanopy ? 0.14 : 0,
    });

    const onFragileTree =
      this.isInCanopy && this.currentTree && !this.currentTree.isSanctuary;
    let secondaryBar:
      | {
          pct: number;
          fillColor: number;
          tagText: string;
          tagColor: string;
        }
      | undefined;

    if (onFragileTree && this.currentTree) {
      const secsLeft = Math.max(
        0,
        this.currentTree.standTimeLimit - this.currentTree.standTimer
      );
      const lifePct = Phaser.Math.Clamp(
        secsLeft / this.currentTree.standTimeLimit,
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
        : this.isInCanopy
        ? 0x34d399
        : 0xf59e0b;

    this.uiManager.renderWorldBars({
      x: this.lemurX,
      y: this.lemurY,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      primaryFillColor: fillCol,
      secondaryBar,
    });
  }
}
