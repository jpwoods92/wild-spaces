import Phaser from 'phaser';
import {
  formatDuration,
  recordLevelCompletion,
} from '../utils/LeaderboardStore';
import {
  clearActiveSession,
  saveActiveSession,
} from '../utils/SessionStore';
import { shouldSpawnFoodAtNode } from '../utils/FoodScarcitySchedule';
import {
  areTreesBackToBack,
  CircleObstacle,
  resolveCircleObstacleMovement,
} from '../utils/ObstacleAvoidance';
import { AbilityCooldown } from '../utils/AbilityCooldown';
import { ShippingCorridorManager } from '../systems/ShippingCorridorManager';
import {
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager';
import { globalPauseManager } from '../systems/PauseManager';

interface CanopyTree {
  id: number;
  container: Phaser.GameObjects.Container;
  trunkGraphics: Phaser.GameObjects.Graphics;
  shadowGraphics: Phaser.GameObjects.Graphics;
  canopyGraphics: Phaser.GameObjects.Graphics;
  points: Phaser.Math.Vector2[];
  baseX: number;
  baseY: number;
  baseRadius: number;
  trunkRadius: number;
  swayPhase: number;
  isSanctuary?: boolean;
  scorched: boolean;
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

interface RivalLemur {
  id: number;
  sprite: Phaser.GameObjects.Image;
  tagText: Phaser.GameObjects.Text;
  ringGraphics: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  currentTree: CanopyTree | null;
  targetTree: CanopyTree | null;
  hopTimer: number;
  isLeaping: boolean;
  leapElapsed: number;
  leapDuration: number;
  startX: number;
  startY: number;
  destX: number;
  destY: number;
  active: boolean;
}

export interface LemurSceneData {
  level?: number;
  carryMaxStamina?: number;
  cumulativeMeters?: number;
  totalGroundMeters?: number;
  fruitCollected?: number;
  bestCanopyCombo?: number;
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
  private treeGapMin = 300;
  private treeGapMax = 370;
  private twoTreeChance = 0.42;

  // Player Lemur state
  private lemur!: Phaser.GameObjects.Sprite;
  private troopMember!: Phaser.GameObjects.Image;
  private lemurX = 1200;
  private lemurY = 3920;
  private lemurVx = 0;
  private lemurVy = 0;
  private lemurAngle = -Math.PI / 2;

  // Survival, Hold-to-Charge Canopy Leap & Combo state
  private stamina = 100;
  private maxStamina = 100;
  private isInCanopy = true;
  private currentTree: CanopyTree | null = null;
  private isChargingLeap = false;
  private leapCooldown = new AbilityCooldown(1.1);
  private leapCharge = 0;
  private isLeaping = false;
  private leapElapsed = 0;
  private leapDuration = 0.35;
  private leapStartX = 1200;
  private leapStartY = 3920;
  private leapTargetX = 1200;
  private leapTargetY = 3920;
  private leapOriginTreeId: number | null = null;
  private aimLandTree: CanopyTree | null = null;
  private aimTreeOccupied = false;
  private aimTargetX = 1200;
  private aimTargetY = 3920;
  private canopyCombo = 0;
  private bestCanopyCombo = 0;
  private stepWobbleTime = 0;
  private dustStepTimer = 0;

  // Advancing Slash-and-Burn ("Tavy") Fire Wall
  private fireFrontY = 4340;
  private fireGraphics!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private leapShadowGraphics!: Phaser.GameObjects.Graphics;

  // Entities
  private haulRoadCenters: number[] = [];
  private shippingManager!: ShippingCorridorManager;
  private trees: CanopyTree[] = [];
  private fruits: TamarindFruit[] = [];
  private fossas: FossaPredator[] = [];
  private rivalLemurs: RivalLemur[] = [];

  // Run telemetry
  private cumulativeMetersBeforeLevel = 0;
  private cumulativeTimeBeforeLevel = 0;
  private levelElapsedSeconds = 0;
  private totalGroundMeters = 0;
  private fruitCollected = 0;
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
    this.worldHeight = this.startY + 460;

    // Wider clear-cut deforestation gaps as level increases (staying reachable by charged Canopy Leaps)
    this.treeGapMin = Math.min(410, 300 + (this.level - 1) * 24);
    this.treeGapMax = Math.min(475, 370 + (this.level - 1) * 24);
    this.twoTreeChance = Math.max(0.08, 0.42 - (this.level - 1) * 0.068);

    this.cumulativeMetersBeforeLevel = data?.cumulativeMeters ?? 0;
    this.cumulativeTimeBeforeLevel = data?.cumulativeTimeSeconds ?? 0;
    this.levelElapsedSeconds = 0;
    this.totalGroundMeters = data?.totalGroundMeters ?? 0;
    this.fruitCollected = data?.fruitCollected ?? 0;
    this.bestCanopyCombo = data?.bestCanopyCombo ?? 0;
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

    // 2. Generate Permanent Canopy Crowns & Ancient Baobab Sanctuary
    this.generateCanopyRoute();

    // 3. Spawn Escaping Rival Lemurs on Level 2+
    this.spawnRivalLemurs();

    // 4. Spawn Active Clear-Cut Logging Haul Roads via Shared ShippingCorridorManager
    this.spawnLoggingHaulRoads();

    // 4. Spawn Ground Ambush Fossa Predators in clearings
    this.spawnFossaPredators();

    // 5. Spawn Waiting Juvenile Lemur Troop at Northern Baobab Sanctuary
    this.troopMember = this.add
      .image(this.WORLD_WIDTH / 2, this.SANCTUARY_Y - 62, 'lemur_troop')
      .setDepth(15)
      .setAngle(90);

    // 6. Leap Shadow, Aim Trajectory & Advancing Fire Wall Layers
    this.fireGraphics = this.add.graphics().setDepth(17);
    this.leapShadowGraphics = this.add.graphics().setDepth(18);
    this.aimGraphics = this.add.graphics().setDepth(26);

    // 7. Spawn Player Ring-Tailed Lemur
    this.lemur = this.add
      .sprite(this.lemurX, this.lemurY, 'lemur_walk')
      .setDepth(20)
      .setRotation(this.lemurAngle);

    this.cameras.main.startFollow(this.lemur, true, 0.09, 0.09);

    // 8. Ambient Canopy Leaves Drifting in the Wind
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

    // 9. Controls
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

    // 10. Build Shared Episode HUD & World-Space Bars
    this.uiManager = new EpisodeUIManager(this, {
      accentColor: 0x34d399,
      accentHex: '#34d399',
      bottomHint:
        'WASD / Arrows: Aim & Move  •  Hold SPACE: Charge Canopy Leap  •  Outrun the Fire Wall  •  P / ESC: Pause',
      autoFadeHintMs: 6500,
      worldUiYOffset: 66,
      worldBarWidth: 76,
    });
    this.uiManager.redrawViewportBg(0x160e08);
    globalPauseManager.attachScene(this);
    saveActiveSession('LemurScene', {
      level: this.level,
      carryMaxStamina: this.maxStamina,
      cumulativeMeters: this.cumulativeMetersBeforeLevel,
      totalGroundMeters: Math.round(this.totalGroundMeters),
      fruitCollected: this.fruitCollected,
      bestCanopyCombo: this.bestCanopyCombo,
      cumulativeTimeSeconds: this.cumulativeTimeBeforeLevel,
    });

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
    this.isChargingLeap = false;
    this.leapCharge = 0;
    this.leapCooldown.reset();
    this.isLeaping = false;
    this.leapElapsed = 0;
    this.leapOriginTreeId = null;
    this.aimLandTree = null;
    this.aimTreeOccupied = false;
    this.aimTargetX = this.lemurX;
    this.aimTargetY = this.lemurY;
    this.canopyCombo = 0;
    this.stepWobbleTime = 0;
    this.dustStepTimer = 0;
    this.fireFrontY = this.startY + 420;
    this.haulRoadCenters = [];
    if (!this.shippingManager) {
      this.shippingManager = new ShippingCorridorManager(this);
    } else {
      this.shippingManager.clear();
    }
    this.trees = [];
    this.fruits = [];
    this.fossas = [];
    this.rivalLemurs = [];
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
      const sy = Phaser.Math.Between(520, this.worldHeight - 240);
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

    // 1. Permanent Starting Baobab & Spiny Crown
    const startTree = this.createCanopyTree(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.startY,
      126
    );

    // 2. Permanent stepping-stone canopy crowns from South (`startY - 340`) to North (`Y = 740`)
    let yCursor = this.startY - 340;
    let prevX = this.WORLD_WIDTH / 2;
    let treesSinceLastFruit = 0;

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
            98
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
        const baseRadius = Phaser.Math.Between(78, 114);
        const centerX = this.WORLD_WIDTH / 2;
        let placedTree: CanopyTree | null = null;

        for (let attempt = 0; attempt < 16; attempt++) {
          const candidateX =
            treesInBand === 1
              ? Phaser.Math.Clamp(
                  prevX + Phaser.Math.Between(-300, 300),
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
              baseRadius
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
    this.createCanopyTree(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.SANCTUARY_Y - 30,
      360,
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

    this.currentTree = startTree;
  }

  private createCanopyTree(
    id: number,
    x: number,
    y: number,
    radius: number,
    isSanctuary = false
  ): CanopyTree {
    const trunkRadius = isSanctuary ? 58 : Math.round(radius * 0.42);

    // Forest-floor sturdy wooden trunk & buttress roots (depth 4, below Fossa predators at depth 5)
    const trunkGraphics = this.add.graphics({ x, y }).setDepth(4);
    trunkGraphics.fillStyle(0x090502, 0.34);
    trunkGraphics.fillCircle(4, 6, trunkRadius + 4);
    trunkGraphics.fillStyle(0x451a03, 1);
    for (let r = 0; r < 5; r++) {
      const ra = (r / 5) * Math.PI * 2 + 0.3;
      trunkGraphics.fillEllipse(
        Math.cos(ra) * (trunkRadius * 0.72),
        Math.sin(ra) * (trunkRadius * 0.72),
        trunkRadius * 0.85,
        trunkRadius * 0.45
      );
    }
    trunkGraphics.fillStyle(0x78350f, 1);
    trunkGraphics.lineStyle(2.5, 0x451a03, 0.95);
    trunkGraphics.fillCircle(0, 0, trunkRadius);
    trunkGraphics.strokeCircle(0, 0, trunkRadius);
    trunkGraphics.fillStyle(0x92400e, 0.78);
    trunkGraphics.fillCircle(
      -trunkRadius * 0.15,
      -trunkRadius * 0.15,
      trunkRadius * 0.52
    );

    // Overhead canopy crown (depth 8, above ground predators)
    const container = this.add.container(x, y).setDepth(8);
    const shadowGraphics = this.add.graphics();
    const canopyGraphics = this.add.graphics();

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
    shadowGraphics.fillStyle(0x090502, 0.28);
    shadowGraphics.beginPath();
    points.forEach((pt, idx) => {
      const sx = pt.x * 1.04 + 10;
      const sy = pt.y * 1.04 + 14;
      if (idx === 0) shadowGraphics.moveTo(sx, sy);
      else shadowGraphics.lineTo(sx, sy);
    });
    shadowGraphics.closePath();
    shadowGraphics.fillPath();

    // Rich Spiny-Forest Emerald Crown (slightly translucent so trunk & predators beneath remain legible)
    canopyGraphics.fillStyle(isSanctuary ? 0x15803d : 0x166534, 0.84);
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
    canopyGraphics.fillStyle(isSanctuary ? 0x22c55e : 0x16a34a, 0.7);
    canopyGraphics.beginPath();
    points.forEach((pt, idx) => {
      if (idx === 0) canopyGraphics.moveTo(pt.x * 0.72, pt.y * 0.72 - 4);
      else canopyGraphics.lineTo(pt.x * 0.72, pt.y * 0.72 - 4);
    });
    canopyGraphics.closePath();
    canopyGraphics.fillPath();

    // Highlighted top leaves
    canopyGraphics.fillStyle(0x4ade80, 0.36);
    canopyGraphics.fillCircle(-radius * 0.16, -radius * 0.14, radius * 0.28);

    container.add([shadowGraphics, canopyGraphics]);

    const tree: CanopyTree = {
      id,
      container,
      trunkGraphics,
      shadowGraphics,
      canopyGraphics,
      points,
      baseX: x,
      baseY: y,
      baseRadius: radius,
      trunkRadius,
      swayPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      isSanctuary,
      scorched: false,
    };

    this.trees.push(tree);
    return tree;
  }

  private spawnFruitOnTree(tree: CanopyTree): void {
    const pt = tree.points[Phaser.Math.Between(0, tree.points.length - 1)];
    const offsetX = pt.x * 0.54;
    const offsetY = pt.y * 0.54;

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

  private spawnRivalLemurs(): void {
    if (this.level < 2) return;

    const rivalCount = Math.min(10, 2 + (this.level - 2) * 2);
    const eligibleTrees = this.trees
      .filter(
        (t) =>
          !t.isSanctuary &&
          t.id !== 1 &&
          !areTreesBackToBack(
            t.baseX,
            t.baseY,
            this.WORLD_WIDTH / 2,
            this.startY
          )
      )
      .sort((a, b) => b.baseY - a.baseY);

    if (eligibleTrees.length === 0) return;

    for (let i = 0; i < rivalCount; i++) {
      const baseIdx = Math.min(
        eligibleTrees.length - 1,
        Math.floor(((i + 0.5) / rivalCount) * eligibleTrees.length)
      );
      let startTree: CanopyTree | null = null;
      for (let offset = 0; offset < eligibleTrees.length; offset++) {
        const candidate =
          eligibleTrees[(baseIdx + offset) % eligibleTrees.length];
        if (!this.hasBackToBackRival(candidate)) {
          startTree = candidate;
          break;
        }
      }
      // Skip spawning if no non-back-to-back tree is available
      if (!startTree) continue;

      const rx = startTree.baseX + Phaser.Math.Between(-14, 14);
      const ry = startTree.baseY + Phaser.Math.Between(-14, 14);

      const sprite = this.add
        .image(rx, ry, 'lemur_walk')
        .setDepth(19)
        .setTint(0xfde68a)
        .setRotation(-Math.PI / 2);

      const ringGraphics = this.add.graphics().setDepth(14);
      const tagText = this.add
        .text(rx, ry - 26, 'OCCUPIED', {
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#fbbf24',
          stroke: '#041019',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(27);

      this.rivalLemurs.push({
        id: i + 1,
        sprite,
        tagText,
        ringGraphics,
        x: rx,
        y: ry,
        currentTree: startTree,
        targetTree: null,
        hopTimer: Phaser.Math.FloatBetween(1.6, 3.8),
        isLeaping: false,
        leapElapsed: 0,
        leapDuration: 0.42,
        startX: rx,
        startY: ry,
        destX: rx,
        destY: ry,
        active: true,
      });
    }
  }

  private hasBackToBackRival(
    tree: CanopyTree,
    excludeRivalId?: number
  ): boolean {
    if (tree.isSanctuary) return false;
    return this.rivalLemurs.some((r) => {
      if (!r.active || r.id === excludeRivalId) return false;
      const otherTree = r.targetTree ?? r.currentTree;
      if (!otherTree || otherTree.isSanctuary) return false;
      return areTreesBackToBack(
        tree.baseX,
        tree.baseY,
        otherTree.baseX,
        otherTree.baseY
      );
    });
  }

  private isTreeOccupiedByRival(
    tree: CanopyTree,
    excludeRivalId?: number
  ): boolean {
    if (tree.isSanctuary) return false;
    return this.rivalLemurs.some(
      (r) =>
        r.active &&
        r.id !== excludeRivalId &&
        (r.currentTree?.id === tree.id || r.targetTree?.id === tree.id)
    );
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

      const initialPos = resolveCircleObstacleMovement(
        Phaser.Math.Between(
          this.WORLD_WIDTH / 2 - 380,
          this.WORLD_WIDTH / 2 + 380
        ),
        patrolY,
        0,
        0,
        0,
        this.getTrunkObstacles()
      );
      const startX = initialPos.x;
      patrolY = initialPos.y;
      const dir = i % 2 === 0 ? 1 : -1;

      const sprite = this.add
        .image(startX, patrolY, 'fossa_predator')
        .setDepth(5)
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

  private getTrunkObstacles(): CircleObstacle[] {
    return this.trees.map((tree) => ({
      x: tree.baseX,
      y: tree.baseY,
      radius: tree.trunkRadius + 24,
    }));
  }

  private getTreeEllipticalRadii(tree: CanopyTree): { rx: number; ry: number } {
    return {
      rx: tree.baseRadius * (tree.isSanctuary ? 1.75 : 1.02),
      ry: tree.baseRadius * (tree.isSanctuary ? 0.6 : 0.9),
    };
  }

  private findTreeAt(x: number, y: number): CanopyTree | null {
    for (const tree of this.trees) {
      if (tree.scorched) continue;
      const dx = x - tree.container.x;
      const dy = y - tree.container.y;
      const { rx, ry } = this.getTreeEllipticalRadii(tree);
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0) {
        return tree;
      }
    }
    return null;
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameEnded || globalPauseManager.isPaused()) return;

    const dt = Math.min(deltaMs / 1000, 0.05);
    this.levelElapsedSeconds += dt;

    // 1. Advance Slash-and-Burn ("Tavy") Fire Wall & Scorch Overtaken Trees
    this.updateFireFront(dt);
    if (this.gameEnded) return;

    // 2. Gentle Canopy Breeze Sway
    this.updateTrees(dt);

    // 3. Handle Aiming, Crown Clamping & Hold-to-Charge Parabolic Canopy Leap
    this.updateLemurMovement(dt);

    // 4. Update Survival Meters (Stamina recovery in canopy / ground & fire heat burn)
    this.updateSurvivalMeters(dt);

    // 5. Update Tamarind Fruit Foraging, Rival Lemurs & Fossa Ground Predators
    this.updateFruits();
    this.updateRivalLemurs(dt);
    this.updateFossas(dt);

    // 6. Update Logging Haul Road Trucks via Shared ShippingCorridorManager
    this.updateLoggingTrucks(dt);

    // 7. Animate waiting Troop Juvenile at Ancient Baobab Sanctuary
    this.troopMember.rotation =
      Math.PI / 2 + Math.sin(this.time.now * 0.0045) * 0.25;

    // 8. Check Win / Loss Conditions
    this.checkWinLoss();

    // 9. Render Fire Wall, Leap Trajectory Reticle, HUD & World Bars
    this.renderFireFront();
    this.renderAimReticle();
    this.renderHUD();
  }

  private updateFireFront(dt: number): void {
    const baseFireSpeed = 54 + Math.min(42, (this.level - 1) * 7);
    const distAhead = this.fireFrontY - this.lemurY;
    const effectiveSpeed =
      distAhead > 920 ? baseFireSpeed * 1.35 : baseFireSpeed;

    // Advance northward toward Sanctuary, stopping safely outside the Sanctuary perimeter
    this.fireFrontY = Math.max(
      this.SANCTUARY_Y + 190,
      this.fireFrontY - effectiveSpeed * dt
    );

    // Scorch any non-sanctuary trees overtaken by the fire front
    for (const tree of this.trees) {
      if (
        !tree.isSanctuary &&
        !tree.scorched &&
        tree.baseY > this.fireFrontY + 20
      ) {
        tree.scorched = true;
        tree.container.setAlpha(0.45);
        // Darken crown foliage to charred ash
        tree.canopyGraphics.fillStyle(0x1c1917, 0.72);
        tree.canopyGraphics.fillCircle(0, 0, tree.baseRadius * 0.88);
        if (this.currentTree?.id === tree.id) {
          this.currentTree = null;
          this.isInCanopy = false;
        }
      }
    }

    // Direct contact with the advancing fire wall is fatal
    if (this.lemurY >= this.fireFrontY - 14) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.cameras.main.shake(360, 0.018);
      this.uiManager.spawnFloatingNotice(
        this.lemurX,
        this.lemurY - 24,
        'OVERTAKEN BY SLASH-AND-BURN FIRE!',
        '#ef4444'
      );
      this.time.delayedCall(500, () => {
        this.triggerImpactOverlay(false, 'fire');
      });
    }
  }

  private updateTrees(dt: number): void {
    for (const tree of this.trees) {
      if (tree.isSanctuary || tree.scorched) continue;
      tree.swayPhase += dt * 1.7;
      tree.container.x = tree.baseX + Math.sin(tree.swayPhase) * 2.5;
      tree.container.y = tree.baseY;
    }
  }

  private checkCanopySupport(): void {
    const foundTree = this.findTreeAt(this.lemurX, this.lemurY);
    const usableTree =
      foundTree && !this.isTreeOccupiedByRival(foundTree) ? foundTree : null;
    this.currentTree = usableTree;
    this.isInCanopy = usableTree !== null;
  }

  private updateLemurMovement(dt: number): void {
    if (!this.isLeaping) this.leapCooldown.tick(dt);

    // 1. Mid-air parabolic leap flight
    if (this.isLeaping) {
      this.leapElapsed += dt;
      const t = Phaser.Math.Clamp(this.leapElapsed / this.leapDuration, 0, 1);

      this.lemurX = Phaser.Math.Linear(this.leapStartX, this.leapTargetX, t);
      this.lemurY = Phaser.Math.Linear(this.leapStartY, this.leapTargetY, t);
      this.lemurVx = 0;
      this.lemurVy = 0;

      const arc = Math.sin(t * Math.PI);
      this.lemur.setTexture('lemur_leap');
      this.lemur.setScale(1.0 + arc * 0.42);
      this.lemur.setPosition(this.lemurX, this.lemurY - arc * 16);
      this.lemur.setRotation(this.lemurAngle);

      this.leapShadowGraphics.clear();
      this.leapShadowGraphics.fillStyle(0x090502, 0.36 - arc * 0.14);
      this.leapShadowGraphics.fillEllipse(
        this.lemurX,
        this.lemurY + 12,
        Math.max(18, 34 - arc * 10),
        Math.max(9, 18 - arc * 6)
      );

      if (t >= 1) {
        this.isLeaping = false;
        this.leapCooldown.trigger();
        this.lemur.setTexture('lemur_walk');
        this.lemur.setScale(1.0);
        this.lemur.setPosition(this.lemurX, this.lemurY);
        this.leapShadowGraphics.clear();

        const hitTree = this.findTreeAt(this.lemurX, this.lemurY);
        if (hitTree && this.isTreeOccupiedByRival(hitTree)) {
          // Occupied non-sanctuary tree cannot be landed on -> bounce off rim onto ground
          const cx = hitTree.container.x;
          const cy = hitTree.container.y;
          const { rx, ry } = this.getTreeEllipticalRadii(hitTree);
          let pushAngle = Math.atan2(this.lemurY - cy, this.lemurX - cx);
          if (Math.hypot(this.lemurX - cx, this.lemurY - cy) < 4) {
            pushAngle = this.lemurAngle + Math.PI;
          }
          this.lemurX = Phaser.Math.Clamp(
            cx + Math.cos(pushAngle) * rx * 1.08,
            45,
            this.WORLD_WIDTH - 45
          );
          this.lemurY = Phaser.Math.Clamp(
            cy + Math.sin(pushAngle) * ry * 1.08,
            180,
            this.worldHeight - 60
          );
          this.lemur.setPosition(this.lemurX, this.lemurY);
          this.currentTree = null;
          this.isInCanopy = false;
          this.canopyCombo = 0;
          this.cameras.main.shake(180, 0.008);
          this.uiManager.spawnFloatingNotice(
            this.lemurX,
            this.lemurY - 36,
            'TREE OCCUPIED! BOUNCED TO GROUND!',
            '#ef4444'
          );
        } else {
          this.checkCanopySupport();
          if (
            this.isInCanopy &&
            this.currentTree &&
            this.currentTree.id !== this.leapOriginTreeId
          ) {
            this.canopyCombo++;
            this.bestCanopyCombo = Math.max(
              this.bestCanopyCombo,
              this.canopyCombo
            );
            this.stamina = Math.min(this.maxStamina, this.stamina + 6);
            if (this.canopyCombo >= 2) {
              this.uiManager.spawnFloatingNotice(
                this.lemurX,
                this.lemurY - 36,
                `CANOPY COMBO ×${this.canopyCombo} (+STAMINA)`,
                '#34d399'
              );
            }
          } else if (!this.isInCanopy) {
            this.canopyCombo = 0;
            this.spawnGroundDustPuff(this.lemurX, this.lemurY, 1.15);
          }
        }
      }
      return;
    }

    // 2. Sync canopy state & gather directional aiming / walking input
    this.checkCanopySupport();

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

    // 3. Hold SPACE / SHIFT to charge leap; release to launch parabolic arc
    // Leap is gated by a shared cooldown that starts on landing; a charge
    // already in progress is never interrupted.
    const leapHeld =
      this.wasd &&
      (this.wasd.SPACE.isDown || this.wasd.SHIFT.isDown) &&
      (this.isChargingLeap || this.leapCooldown.isReady());

    if (leapHeld) {
      if (!this.isChargingLeap) {
        this.isChargingLeap = true;
        this.leapCharge = 0;
      } else {
        this.leapCharge = Math.min(1, this.leapCharge + dt / 0.82);
      }

      const maxRange =
        (this.isInCanopy ? 465 : 310) *
        getStaminaSpeedMultiplier(this.maxStamina, 0.68);
      const minRange = 105;
      const leapDist = Phaser.Math.Linear(minRange, maxRange, this.leapCharge);

      this.aimTargetX = Phaser.Math.Clamp(
        this.lemurX + Math.cos(this.lemurAngle) * leapDist,
        55,
        this.WORLD_WIDTH - 55
      );
      this.aimTargetY = Phaser.Math.Clamp(
        this.lemurY + Math.sin(this.lemurAngle) * leapDist,
        180,
        this.worldHeight - 60
      );
      const rawTree = this.findTreeAt(this.aimTargetX, this.aimTargetY);
      this.aimTreeOccupied =
        rawTree !== null && this.isTreeOccupiedByRival(rawTree);
      this.aimLandTree = this.aimTreeOccupied ? null : rawTree;

      this.lemurVx = 0;
      this.lemurVy = 0;
      this.lemur.setTexture('lemur_walk');
      this.lemur.setScale(1.0);
      this.lemur.setPosition(this.lemurX, this.lemurY);
      this.lemur.setRotation(this.lemurAngle);
      return;
    }

    // Release while charging -> launch!
    if (this.isChargingLeap) {
      const staminaCost = Phaser.Math.Linear(5, 14, this.leapCharge);
      this.stamina = Math.max(0, this.stamina - staminaCost);

      this.isChargingLeap = false;
      this.isLeaping = true;
      this.leapElapsed = 0;
      this.leapDuration = Phaser.Math.Linear(0.28, 0.54, this.leapCharge);
      this.leapStartX = this.lemurX;
      this.leapStartY = this.lemurY;
      this.leapTargetX = this.aimTargetX;
      this.leapTargetY = this.aimTargetY;
      this.leapOriginTreeId = this.currentTree?.id ?? null;
      this.aimLandTree = null;
      this.aimTreeOccupied = false;
      return;
    }

    // 4. Normal walking: clamped inside canopy crown when in tree, or sprinting across ground
    const maxStaminaSpeedFactor = getStaminaSpeedMultiplier(
      this.maxStamina,
      0.52
    );

    if (this.isInCanopy && this.currentTree) {
      const canopySpeed = 195 * maxStaminaSpeedFactor;
      this.lemurVx = inputX * canopySpeed;
      this.lemurVy = inputY * canopySpeed;

      const candidateX = this.lemurX + this.lemurVx * dt;
      const candidateY = this.lemurY + this.lemurVy * dt;

      // Keep walking clamped to 88% of current tree crown ellipse so player cannot walk off accidentally
      const cx = this.currentTree.container.x;
      const cy = this.currentTree.container.y;
      const { rx, ry } = this.getTreeEllipticalRadii(this.currentTree);
      const clampRx = rx * 0.88;
      const clampRy = ry * 0.88;
      const dx = candidateX - cx;
      const dy = candidateY - cy;
      const norm = Math.hypot(dx / clampRx, dy / clampRy);

      if (norm > 1.0) {
        this.lemurX = cx + dx / norm;
        this.lemurY = cy + dy / norm;
      } else {
        this.lemurX = candidateX;
        this.lemurY = candidateY;
      }
    } else {
      const groundSpeed =
        (this.stamina > 5 ? 142 : 84) * maxStaminaSpeedFactor;
      this.lemurVx = inputX * groundSpeed;
      this.lemurVy = inputY * groundSpeed;

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
      this.totalGroundMeters += frameDist / this.PIXELS_PER_METER;
      this.dustStepTimer += dt;
      if (this.dustStepTimer > 0.3 && frameDist > 0.3) {
        this.dustStepTimer = 0;
        this.spawnGroundDustPuff(this.lemurX, this.lemurY);
      }
    }

    if (Math.hypot(this.lemurVx, this.lemurVy) > 5) {
      this.stepWobbleTime += dt * (this.isInCanopy ? 13 : 9);
    }
    const wobble = Math.sin(this.stepWobbleTime) * 0.06;

    this.lemur.setTexture('lemur_walk');
    this.lemur.setScale(1.0);
    this.lemur.setPosition(this.lemurX, this.lemurY);
    this.lemur.setRotation(this.lemurAngle + wobble);
  }

  private renderFireFront(): void {
    this.fireGraphics.clear();

    // Scorched smoldering forest floor south of fireFrontY
    const ashHeight = Math.max(0, this.worldHeight - this.fireFrontY);
    if (ashHeight > 0) {
      this.fireGraphics.fillStyle(0x0c0705, 0.72);
      this.fireGraphics.fillRect(0, this.fireFrontY, this.WORLD_WIDTH, ashHeight);

      // Glowing embers inside recently burned earth
      const t = this.time.now * 0.004;
      for (let x = 90; x < this.WORLD_WIDTH; x += 150) {
        const emberY = this.fireFrontY + 45 + ((x * 17) % 140);
        if (emberY < this.worldHeight) {
          this.fireGraphics.fillStyle(
            0xea580c,
            0.35 + Math.sin(t + x * 0.03) * 0.25
          );
          this.fireGraphics.fillCircle(x, emberY, 6);
        }
      }
    }

    // Advance heat-haze warning glow 180px north of the fire line
    this.fireGraphics.fillStyle(0xf97316, 0.11);
    this.fireGraphics.fillRect(0, this.fireFrontY - 180, this.WORLD_WIDTH, 180);
    this.fireGraphics.lineStyle(2, 0xf59e0b, 0.35);
    this.fireGraphics.lineBetween(
      0,
      this.fireFrontY - 180,
      this.WORLD_WIDTH,
      this.fireFrontY - 180
    );

    // Jagged flickering flame tongues spanning x = 0..WORLD_WIDTH at fireFrontY
    const timePhase = this.time.now * 0.01;
    const segW = 48;

    this.fireGraphics.fillStyle(0xef4444, 0.85);
    this.fireGraphics.beginPath();
    this.fireGraphics.moveTo(0, this.fireFrontY + 26);
    for (let x = 0; x <= this.WORLD_WIDTH; x += segW) {
      const flicker =
        Math.sin(timePhase + x * 0.04) * 18 +
        Math.cos(timePhase * 1.4 + x * 0.09) * 12;
      this.fireGraphics.lineTo(x, this.fireFrontY - 22 - Math.abs(flicker));
    }
    this.fireGraphics.lineTo(this.WORLD_WIDTH, this.fireFrontY + 26);
    this.fireGraphics.closePath();
    this.fireGraphics.fillPath();

    // Bright amber/yellow inner flame crest
    this.fireGraphics.fillStyle(0xf59e0b, 0.9);
    this.fireGraphics.beginPath();
    this.fireGraphics.moveTo(0, this.fireFrontY + 18);
    for (let x = 0; x <= this.WORLD_WIDTH; x += segW) {
      const flicker = Math.sin(timePhase * 1.3 + x * 0.06) * 14;
      this.fireGraphics.lineTo(x, this.fireFrontY - 10 - Math.abs(flicker));
    }
    this.fireGraphics.lineTo(this.WORLD_WIDTH, this.fireFrontY + 18);
    this.fireGraphics.closePath();
    this.fireGraphics.fillPath();

    this.fireGraphics.lineStyle(3, 0xfef08a, 0.85);
    this.fireGraphics.lineBetween(
      0,
      this.fireFrontY - 4,
      this.WORLD_WIDTH,
      this.fireFrontY - 4
    );
  }

  private renderAimReticle(): void {
    this.aimGraphics.clear();
    if (!this.isChargingLeap || this.isLeaping) return;

    const isTreeTarget = this.aimLandTree !== null;
    const reticleColor = this.aimTreeOccupied
      ? 0xef4444
      : isTreeTarget
      ? 0x34d399
      : 0xf59e0b;

    // Dotted parabolic trajectory arc from lemur to landing target
    const dots = 9;
    for (let i = 1; i < dots; i++) {
      const frac = i / dots;
      const dx = Phaser.Math.Linear(this.lemurX, this.aimTargetX, frac);
      const dy =
        Phaser.Math.Linear(this.lemurY, this.aimTargetY, frac) -
        Math.sin(frac * Math.PI) * 28;
      this.aimGraphics.fillStyle(reticleColor, 0.45 + frac * 0.45);
      this.aimGraphics.fillCircle(dx, dy, 3.2);
    }

    // Dual landing reticle ring
    const pulseRadius = 22 + Math.sin(this.time.now * 0.012) * 2.5;
    this.aimGraphics.fillStyle(reticleColor, 0.16);
    this.aimGraphics.fillCircle(this.aimTargetX, this.aimTargetY, pulseRadius);
    this.aimGraphics.lineStyle(2.5, reticleColor, 0.95);
    this.aimGraphics.strokeCircle(
      this.aimTargetX,
      this.aimTargetY,
      pulseRadius
    );
    this.aimGraphics.lineStyle(1.5, reticleColor, 0.85);
    this.aimGraphics.strokeCircle(this.aimTargetX, this.aimTargetY, 8);
  }

  private updateSurvivalMeters(dt: number): void {
    const isMoving = Math.hypot(this.lemurVx, this.lemurVy) > 10;

    if (this.isInCanopy && !this.isLeaping) {
      // Perching inside tree crowns recovers stamina rapidly up to maxStamina ceiling
      this.stamina = Math.min(this.maxStamina, this.stamina + 22 * dt);
    } else if (!this.isLeaping) {
      // Exposed sun-baked deforested earth slowly erodes Max Stamina ceiling & burns Stamina
      this.maxStamina = Math.max(20, this.maxStamina - 2.4 * dt);
      const groundDrain = isMoving ? 6.2 : 3.0;
      this.stamina = Math.min(
        this.maxStamina,
        Math.max(0, this.stamina - groundDrain * dt)
      );
    }

    // Smoke & scorching heat within 260px of the advancing fire front
    if (this.fireFrontY - this.lemurY < 260) {
      this.maxStamina = Math.max(20, this.maxStamina - 2.0 * dt);
      this.stamina = Math.min(
        this.maxStamina,
        Math.max(0, this.stamina - 4.5 * dt)
      );
    }
  }

  private updateFruits(): void {
    for (const fruit of this.fruits) {
      if (fruit.collected) continue;

      if (fruit.tree.scorched) {
        fruit.collected = true;
        fruit.sprite.setVisible(false);
        continue;
      }

      fruit.sprite.x = fruit.tree.container.x + fruit.offsetX;
      fruit.sprite.y = fruit.tree.container.y + fruit.offsetY;

      const dist = Phaser.Math.Distance.Between(
        this.lemurX,
        this.lemurY,
        fruit.sprite.x,
        fruit.sprite.y
      );
      if (dist <= 48 && !this.isLeaping) {
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

  private updateRivalLemurs(dt: number): void {
    for (const r of this.rivalLemurs) {
      if (!r.active) continue;

      r.ringGraphics.clear();

      // Highlight occupied non-sanctuary tree so players can clearly read blocked crowns
      const reservedTree = r.currentTree ?? r.targetTree;
      if (reservedTree && !reservedTree.isSanctuary && !reservedTree.scorched) {
        const { rx, ry } = this.getTreeEllipticalRadii(reservedTree);
        r.ringGraphics.lineStyle(2.5, 0xf59e0b, 0.72);
        r.ringGraphics.strokeEllipse(
          reservedTree.container.x,
          reservedTree.container.y,
          rx * 2,
          ry * 2
        );
      }

      if (r.isLeaping) {
        r.leapElapsed += dt;
        const t = Phaser.Math.Clamp(r.leapElapsed / r.leapDuration, 0, 1);
        r.x = Phaser.Math.Linear(r.startX, r.destX, t);
        r.y = Phaser.Math.Linear(r.startY, r.destY, t);

        const arc = Math.sin(t * Math.PI);
        r.sprite.setTexture('lemur_leap');
        r.sprite.setScale(1.0 + arc * 0.35);
        r.sprite.setPosition(r.x, r.y - arc * 14);
        r.tagText.setPosition(r.x, r.y - 32 - arc * 14);

        if (t >= 1) {
          r.isLeaping = false;
          r.currentTree = r.targetTree;
          r.targetTree = null;
          r.sprite.setTexture('lemur_walk').setScale(1.0).setPosition(r.x, r.y);
          r.tagText.setPosition(r.x, r.y - 26);

          if (!r.currentTree || r.currentTree.isSanctuary) {
            r.active = false;
            r.sprite.setVisible(false);
            r.tagText.setVisible(false);
            r.ringGraphics.clear();
            continue;
          }

          r.hopTimer = Phaser.Math.FloatBetween(1.8, 3.6);
        }
        continue;
      }

      let backToBackConflict = false;

      // Sync gently with swaying tree crown
      if (r.currentTree) {
        if (r.currentTree.scorched) {
          r.hopTimer = Math.min(r.hopTimer, 0);
        } else {
          r.x = r.currentTree.container.x;
          r.y = r.currentTree.container.y;
          r.sprite.setPosition(r.x, r.y);
          r.tagText.setPosition(r.x, r.y - 26);

          const conflictsWithRival = this.hasBackToBackRival(
            r.currentTree,
            r.id
          );
          const conflictsWithPlayer =
            this.isInCanopy &&
            this.currentTree !== null &&
            !this.currentTree.isSanctuary &&
            areTreesBackToBack(
              r.currentTree.baseX,
              r.currentTree.baseY,
              this.currentTree.baseX,
              this.currentTree.baseY
            );
          if (!r.isLeaping && (conflictsWithRival || conflictsWithPlayer)) {
            backToBackConflict = true;
            r.hopTimer = 0;
          }

          // Eat any uncollected TamarindFruit on this tree
          for (const fruit of this.fruits) {
            if (!fruit.collected && fruit.tree.id === r.currentTree.id) {
              fruit.collected = true;
              fruit.sprite.setVisible(false);
              if (
                Phaser.Math.Distance.Between(
                  this.lemurX,
                  this.lemurY,
                  fruit.sprite.x,
                  fruit.sprite.y
                ) < 550
              ) {
                this.uiManager.spawnFloatingNotice(
                  fruit.sprite.x,
                  fruit.sprite.y - 20,
                  'RIVAL LEMUR ATE FRUIT!',
                  '#fbbf24'
                );
              }
            }
          }
        }
      }

      // Advance tree-to-tree escape northward ahead of fire
      const fireClose = this.fireFrontY - r.y < 420;
      r.hopTimer -= dt * (fireClose ? 2.1 : 1.0);
      if (!r.isLeaping && r.hopTimer <= 0) {
        const maxHopDist = backToBackConflict ? 760 : 520;
        const candidates = this.trees
          .filter((candidate) => {
            if (candidate.scorched) return false;
            if (candidate.baseY >= r.y - 40) return false;
            const dist = Phaser.Math.Distance.Between(
              r.x,
              r.y,
              candidate.baseX,
              candidate.baseY
            );
            if (dist >= maxHopDist) return false;
            if (
              !candidate.isSanctuary &&
              this.currentTree?.id === candidate.id
            ) {
              return false;
            }
            if (
              !candidate.isSanctuary &&
              this.isInCanopy &&
              this.currentTree !== null &&
              !this.currentTree.isSanctuary &&
              areTreesBackToBack(
                candidate.baseX,
                candidate.baseY,
                this.currentTree.baseX,
                this.currentTree.baseY
              )
            ) {
              return false;
            }
            if (this.isTreeOccupiedByRival(candidate, r.id)) {
              return false;
            }
            if (this.hasBackToBackRival(candidate, r.id)) {
              return false;
            }
            return true;
          })
          .sort((a, b) => {
            const da = Phaser.Math.Distance.Between(
              r.x,
              r.y,
              a.baseX,
              a.baseY
            );
            const db = Phaser.Math.Distance.Between(
              r.x,
              r.y,
              b.baseX,
              b.baseY
            );
            return da - db;
          });

        if (candidates.length > 0) {
          const chosen = candidates[0];
          r.currentTree = null;
          r.targetTree = chosen;
          r.isLeaping = true;
          r.leapElapsed = 0;
          r.leapDuration = 0.42;
          r.startX = r.x;
          r.startY = r.y;
          r.destX = chosen.baseX + Phaser.Math.Between(-14, 14);
          r.destY = chosen.baseY + Phaser.Math.Between(-14, 14);
          r.sprite.setRotation(
            Phaser.Math.Angle.Between(r.x, r.y, r.destX, r.destY)
          );
        } else if (r.currentTree?.scorched || backToBackConflict) {
          // Overtaken or back-to-back with no valid move -> disperse
          r.active = false;
          r.sprite.setVisible(false);
          r.tagText.setVisible(false);
          r.ringGraphics.clear();
        } else {
          r.hopTimer = 0.6;
        }
      }
    }
  }

  private updateFossas(dt: number): void {
    const trunkObstacles = this.getTrunkObstacles();

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

      let desiredVx = 0;
      let desiredVy = 0;

      // Chase only when the lemur touches down on the exposed forest floor nearby
      if (distToLemur < 230 && !this.isInCanopy && !this.isLeaping) {
        fossa.isChasing = true;
        const angle = Phaser.Math.Angle.Between(
          fossa.sprite.x,
          fossa.sprite.y,
          this.lemurX,
          this.lemurY
        );
        desiredVx = Math.cos(angle) * fossa.chaseSpeed;
        desiredVy = Math.sin(angle) * fossa.chaseSpeed;
        fossa.alertText.setText('!');
      } else {
        fossa.isChasing = false;
        desiredVx = fossa.vx;
        desiredVy = (fossa.patrolY - fossa.sprite.y) * 1.8;
        fossa.alertText.setText(distToLemur < 230 ? '?' : '');
      }

      // Steer around tree trunks so Fossas never clip through bark
      const steered = resolveCircleObstacleMovement(
        fossa.sprite.x,
        fossa.sprite.y,
        desiredVx,
        desiredVy,
        dt,
        trunkObstacles
      );

      fossa.sprite.x = steered.x;
      fossa.sprite.y = Phaser.Math.Clamp(
        steered.y,
        this.SANCTUARY_Y + 95,
        this.worldHeight - 80
      );

      if (!fossa.isChasing) {
        if (fossa.sprite.x < fossa.minX) {
          fossa.sprite.x = fossa.minX;
          fossa.vx = Math.abs(fossa.vx);
        } else if (fossa.sprite.x > fossa.maxX) {
          fossa.sprite.x = fossa.maxX;
          fossa.vx = -Math.abs(fossa.vx);
        }
      }

      if (Math.hypot(steered.actualVx, steered.actualVy) > 1e-2) {
        fossa.sprite.setRotation(
          Math.atan2(steered.actualVy, steered.actualVx)
        );
      }

      fossa.alertText.setPosition(fossa.sprite.x, fossa.sprite.y - 26);

      // Recompute post-step distance after trunk avoidance before evaluating bite
      const finalDistToLemur = Phaser.Math.Distance.Between(
        fossa.sprite.x,
        fossa.sprite.y,
        this.lemurX,
        this.lemurY
      );

      // Ambush bite if catching an exposed lemur on the ground (mid-air Canopy Leap clears Fossa)
      if (
        finalDistToLemur < 42 &&
        !this.isInCanopy &&
        !this.isLeaping &&
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
      checkCollision: !this.isLeaping,
      hitHalfWidth: 74,
      hitHalfHeight: 28,
      onWakeOverlap: (truckVx, stepDt) => {
        if (!this.isInCanopy && !this.isLeaping) {
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
      bestCanopyCombo: this.bestCanopyCombo,
      cumulativeTimeSeconds:
        this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds,
    };
  }

  private checkWinLoss(): void {
    // Win: Reached Northern Ancient Baobab Sanctuary safely in the canopy
    if (this.lemurY <= this.SANCTUARY_Y + 75 && this.isInCanopy && !this.isLeaping) {
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

    // Loss: Stamina depleted from heat exposure, smoke, or Fossa ambush
    if (this.stamina <= 0) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.triggerImpactOverlay(false, 'exhaustion');
    }
  }

  private triggerImpactOverlay(
    won: boolean,
    deathReason: 'exhaustion' | 'truck' | 'fire' = 'exhaustion'
  ): void {
    if (won) {
      saveActiveSession('LemurScene', { ...this.getNextLevelData() });
    } else {
      clearActiveSession();
    }

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
        deathReason?: 'exhaustion' | 'truck' | 'fire';
        level: number;
        levelTargetMeters: number;
        metersInLevel: number;
        totalMetersMigrated: number;
        nextLevelMeters: number;
        groundMeters: number;
        fruitCollected: number;
        bestCanopyCombo: number;
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
        bestCanopyCombo: this.bestCanopyCombo,
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

    const fireDistPx = this.fireFrontY - this.lemurY;
    const fireMeters = Math.max(
      0,
      Math.round(fireDistPx / this.PIXELS_PER_METER)
    );
    const predatorDanger = this.fossas.some((f) => f.isChasing);
    const heatWarningAlpha =
      fireDistPx < 260
        ? 0.42
        : predatorDanger
        ? 0.34
        : !this.isInCanopy && !this.isLeaping
        ? 0.14
        : 0;

    this.uiManager.renderTopHUD({
      headerPrefix: `EPISODE 03 • LEVEL ${this.level}`,
      elapsedSeconds: this.levelElapsedSeconds,
      heroValueText: `${metersRemaining}m`,
      subValueText: 'to Baobab Sanctuary',
      progressPct,
      stamina: this.stamina,
      secondaryVignetteColor: fireDistPx < 260 ? 0xef4444 : 0xf59e0b,
      secondaryVignetteAlpha: heatWarningAlpha,
    });

    let secondaryBar:
      | {
          pct: number;
          fillColor: number;
          tagText: string;
          tagColor: string;
        }
      | undefined;

    if (this.isChargingLeap) {
      if (this.aimTreeOccupied) {
        secondaryBar = {
          pct: this.leapCharge,
          fillColor: 0xef4444,
          tagText: 'TREE OCCUPIED — BLOCKED!',
          tagColor: '#f87171',
        };
      } else {
        const isTreeTarget = this.aimLandTree !== null;
        secondaryBar = {
          pct: this.leapCharge,
          fillColor: isTreeTarget ? 0x34d399 : 0xf59e0b,
          tagText: isTreeTarget ? 'TREE TARGET LOCKED' : 'GROUND LANDING',
          tagColor: isTreeTarget ? '#34d399' : '#fbbf24',
        };
      }
    } else if (!this.isLeaping && !this.leapCooldown.isReady()) {
      secondaryBar = {
        pct: this.leapCooldown.getRechargePct(),
        fillColor: 0x94a3b8,
        tagText: `LEAP ${this.leapCooldown.getRemaining().toFixed(1)}s`,
        tagColor: '#cbd5e1',
      };
    } else if (fireDistPx < 540) {
      const fireProximityPct = Phaser.Math.Clamp(1 - fireDistPx / 540, 0, 1);
      secondaryBar = {
        pct: fireProximityPct,
        fillColor: fireDistPx < 240 ? 0xef4444 : 0xf97316,
        tagText: `🔥 FIRE ${fireMeters}m BEHIND`,
        tagColor: fireDistPx < 240 ? '#f87171' : '#fb923c',
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
