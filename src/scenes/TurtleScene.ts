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
  CircleObstacle,
  resolveCircleObstacleMovement,
} from '../utils/ObstacleAvoidance';
import { AbilityCooldown } from '../utils/AbilityCooldown';
import {
  computeBirdDetectRadius,
  computeLightPollutionPull,
  computeSpotlightPosition,
  computeTurtlePredatorCounts,
  doesBirdDiveHit,
  getPredatorVisibilityAlpha,
  isPointInShade,
  LightPool,
  recoverBurrowedStamina,
  ShadeZone,
  SweepingSpotlight,
  updateBlindnessTimer,
} from '../utils/BeachStealth';
import {
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager';
import { globalPauseManager } from '../systems/PauseManager';

interface ResortLight {
  fixtureX: number;
  fixtureY: number;
  motion: SweepingSpotlight;
  pool: LightPool;
}

interface DriftwoodCover {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  shade: ShadeZone;
}

interface PlasticSnare {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  radius: number;
}

interface WetKelp {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  collected: boolean;
}

interface GhostCrab {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  patrolAnchorX: number;
  patrolAnchorY: number;
  patrolDir: number;
  patrolSpan: number;
  chaseSpeed: number;
  patrolSpeed: number;
  wasChasing: boolean;
  attackCooldown: number;
  alive: boolean;
}

type SeabirdState = 'patrol' | 'telegraph' | 'dive' | 'recover';
type SeabirdTargetKind = 'player' | 'sibling' | 'crab';

interface Seabird {
  sprite: Phaser.GameObjects.Image;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  state: SeabirdState;
  stateTimer: number;
  telegraphDuration: number;
  recoverDuration: number;
  strikeX: number;
  strikeY: number;
  diveStartX: number;
  diveStartY: number;
  baseDetectRadius: number;
  targetKind: SeabirdTargetKind;
}

interface SiblingHatchling {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  speed: number;
  startDelay: number;
  wobblePhase: number;
  isBurrowed: boolean;
  burrowTimer: number;
  burrowCooldown: number;
  eaten: boolean;
  active: boolean;
}

interface SandTrackPoint {
  x: number;
  y: number;
  angle: number;
  age: number;
}

export interface TurtleSceneData {
  level?: number;
  carryMaxStamina?: number;
  cumulativeMeters?: number;
  predatorsEvaded?: number;
  kelpCollected?: number;
  burrowsUsed?: number;
  cumulativeTimeSeconds?: number;
}

export class TurtleScene extends Phaser.Scene {
  private readonly WORLD_WIDTH = 2000;
  private readonly SURF_Y = 300;
  private readonly PIXELS_PER_METER = 18;
  private readonly BASE_LEVEL_METERS = 150;
  private readonly METERS_PER_LEVEL_INCREMENT = 35;
  private readonly MAX_BURROW_DURATION = 2.6;

  private level = 1;
  private levelTargetMeters = 150;
  private startY = 3000;
  private worldHeight = 3380;

  // Player hatchling state
  private turtle!: Phaser.GameObjects.Sprite;
  private turtleX = 1000;
  private turtleY = 3000;
  private turtleVx = 0;
  private turtleVy = 0;
  private turtleAngle = -Math.PI / 2;
  private crawlWobbleTime = 0;

  // Burrow-and-crawl stealth state
  private isBurrowed = false;
  private burrowElapsed = 0;
  private burrowCooldown = new AbilityCooldown(1.6);
  private burrowLockUntilRelease = false;

  // Survival & environmental telemetry
  private stamina = 100;
  private maxStamina = 100;
  private inShade = false;
  private isSnared = false;
  private currentGlare = 0;
  private currentPullX = 0;
  private currentPullY = 0;
  private blindnessTimer = 0;
  private lightWarnCooldown = 0;
  private snareWarnCooldown = 0;

  // Cumulative progression metrics
  private cumulativeMetersBeforeLevel = 0;
  private cumulativeTimeBeforeLevel = 0;
  private levelElapsedSeconds = 0;
  private predatorsEvaded = 0;
  private kelpCollected = 0;
  private burrowsUsed = 0;
  private gameEnded = false;

  // World collections & graphics layers
  private surfGraphics!: Phaser.GameObjects.Graphics;
  private lightGraphics!: Phaser.GameObjects.Graphics;
  private birdOverlayGraphics!: Phaser.GameObjects.Graphics;
  private blindOverlayGraphics!: Phaser.GameObjects.Graphics;
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private sandTracks: SandTrackPoint[] = [];
  private trackDropTimer = 0;

  private resortLights: ResortLight[] = [];
  private driftwoodCovers: DriftwoodCover[] = [];
  private driftwoodObstacles: CircleObstacle[] = [];
  private shadeZones: ShadeZone[] = [];
  private plasticSnares: PlasticSnare[] = [];
  private wetKelps: WetKelp[] = [];
  private ghostCrabs: GhostCrab[] = [];
  private seabirds: Seabird[] = [];
  private siblings: SiblingHatchling[] = [];

  // Input
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
  };

  // Shared Episode UI Manager
  private uiManager!: EpisodeUIManager;
  private onResize = (): void => {
    this.uiManager?.handleResize(0x040d17);
  };

  constructor() {
    super({ key: 'TurtleScene' });
  }

  init(data?: TurtleSceneData): void {
    this.level = data?.level && data.level >= 1 ? Math.floor(data.level) : 1;

    this.levelTargetMeters =
      this.BASE_LEVEL_METERS +
      (this.level - 1) * this.METERS_PER_LEVEL_INCREMENT;
    this.startY =
      this.SURF_Y + Math.round(this.levelTargetMeters * this.PIXELS_PER_METER);
    this.worldHeight = this.startY + 380;

    this.cumulativeMetersBeforeLevel = data?.cumulativeMeters ?? 0;
    this.cumulativeTimeBeforeLevel = data?.cumulativeTimeSeconds ?? 0;
    this.levelElapsedSeconds = 0;
    this.predatorsEvaded = data?.predatorsEvaded ?? 0;
    this.kelpCollected = data?.kelpCollected ?? 0;
    this.burrowsUsed = data?.burrowsUsed ?? 0;

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
        'Episode 4: False Horizon (Loggerhead Sea Turtle)';
    }

    // 1. Night Beach, Moonlit Surf, Dunes & Boardwalks
    this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.worldHeight);
    this.drawNightBeachBackdrop();

    // 2. Dynamic Render Layers
    this.trackGraphics = this.add.graphics().setDepth(6);
    this.lightGraphics = this.add.graphics().setDepth(8);
    this.birdOverlayGraphics = this.add.graphics().setDepth(14);
    this.surfGraphics = this.add.graphics().setDepth(12);
    this.blindOverlayGraphics = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(94);

    // 3. Populate Lights, Driftwood Shade, Plastic Snares, Wet Kelp, Predators & Siblings
    this.spawnBeachHabitatAndHazards();
    this.spawnResortLights();
    this.spawnGhostCrabs();
    this.spawnSeabirds();
    this.spawnSiblingHatchlings();

    // 4. Player Baby Sea Turtle Hatchling
    this.turtle = this.add
      .sprite(this.turtleX, this.turtleY, 'turtle_crawl')
      .setDepth(20)
      .setRotation(this.turtleAngle);

    this.cameras.main.startFollow(this.turtle, true, 0.1, 0.1);

    // 5. Ambient Coastal Wind / Sea-Spray Specks
    this.add
      .particles(0, 0, 'sand_dot', {
        x: { min: 0, max: this.scale.width },
        y: -10,
        lifespan: 5400,
        speedY: { min: 35, max: 70 },
        speedX: { min: -25, max: 25 },
        scale: { start: 0.7, end: 0.25 },
        alpha: { start: 0.45, end: 0 },
        quantity: 1,
        frequency: 160,
      })
      .setScrollFactor(0)
      .setDepth(90);

    // 6. Keyboard Controls
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

    // 7. Shared Episode HUD & World Bars
    this.uiManager = new EpisodeUIManager(this, {
      accentColor: 0xf59e0b,
      accentHex: '#f59e0b',
      bottomHint:
        'WASD / Arrows: Crawl  •  Hold SPACE: Burrow (Hide & Recover Stamina)  •  Avoid Blinding Spotlights  •  P / ESC: Pause',
      autoFadeHintMs: 6500,
      worldUiYOffset: 54,
      worldBarWidth: 74,
    });
    this.uiManager.redrawViewportBg(0x040d17);
    globalPauseManager.attachScene(this);

    saveActiveSession('TurtleScene', {
      level: this.level,
      carryMaxStamina: this.maxStamina,
      cumulativeMeters: this.cumulativeMetersBeforeLevel,
      predatorsEvaded: this.predatorsEvaded,
      kelpCollected: this.kelpCollected,
      burrowsUsed: this.burrowsUsed,
      cumulativeTimeSeconds: this.cumulativeTimeBeforeLevel,
    });

    if (this.level > 1) {
      this.uiManager.spawnFloatingNotice(
        this.turtleX,
        this.turtleY - 28,
        `LEVEL ${this.level} — ${this.levelTargetMeters}m TO MOONLIT SURF`,
        '#f59e0b'
      );
    }

    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize);
    });
  }

  private resetLevelEntities(): void {
    this.turtleX = this.WORLD_WIDTH / 2;
    this.turtleY = this.startY;
    this.turtleVx = 0;
    this.turtleVy = 0;
    this.turtleAngle = -Math.PI / 2;
    this.crawlWobbleTime = 0;

    this.isBurrowed = false;
    this.burrowElapsed = 0;
    this.burrowCooldown.reset();
    this.burrowLockUntilRelease = false;

    this.inShade = false;
    this.isSnared = false;
    this.currentGlare = 0;
    this.currentPullX = 0;
    this.currentPullY = 0;
    this.blindnessTimer = 0;
    this.lightWarnCooldown = 0;
    this.snareWarnCooldown = 0;
    this.gameEnded = false;

    this.sandTracks = [];
    this.trackDropTimer = 0;
    this.resortLights = [];
    this.driftwoodCovers = [];
    this.driftwoodObstacles = [];
    this.shadeZones = [];
    this.plasticSnares = [];
    this.wetKelps = [];
    this.ghostCrabs = [];
    this.seabirds = [];
    this.siblings = [];
  }

  private drawNightBeachBackdrop(): void {
    const bg = this.add.graphics().setDepth(-10);

    // 1. Deep nocturnal ocean at the northern target edge (y <= SURF_Y + 40)
    bg.fillGradientStyle(0x030c18, 0x030c18, 0x08233d, 0x08233d, 1);
    bg.fillRect(0, 0, this.WORLD_WIDTH, this.SURF_Y + 40);

    // Shimmering moonlit reflection path guiding hatchlings north toward the sea
    for (let i = 0; i < 16; i++) {
      const y = 26 + i * 17;
      const w = 130 + (i % 3) * 28 + Math.sin(i * 1.1) * 18;
      bg.fillStyle(0xe0f2fe, 0.08 + (i / 16) * 0.08);
      bg.fillEllipse(this.WORLD_WIDTH / 2, y, w, 9);
    }

    // Distant moon glow disk near horizon
    bg.fillStyle(0xf8fafc, 0.12);
    bg.fillCircle(this.WORLD_WIDTH / 2, 74, 62);
    bg.fillStyle(0xf8fafc, 0.28);
    bg.fillCircle(this.WORLD_WIDTH / 2, 74, 30);

    // 2. Wet dark tidal shoreline sand (SURF_Y to SURF_Y + 260)
    bg.fillGradientStyle(0x162230, 0x162230, 0x263242, 0x263242, 1);
    bg.fillRect(0, this.SURF_Y, this.WORLD_WIDTH, 265);

    // 3. Main moonlit night sand expanse down to dune ridge
    bg.fillGradientStyle(0x283444, 0x283444, 0x374151, 0x333e4f, 1);
    bg.fillRect(0, this.SURF_Y + 260, this.WORLD_WIDTH, this.startY + 80);

    // Subtle horizontal sand ripple contours
    bg.fillStyle(0x1e293b, 0.28);
    for (let y = this.SURF_Y + 290; y < this.worldHeight - 140; y += 90) {
      for (let x = 150; x < this.WORLD_WIDTH - 150; x += 260) {
        const jx = x + (((y * 17) % 110) - 55);
        bg.fillEllipse(jx, y, 160, 18);
      }
    }

    // 4. Vegetated coastal nesting dune & hatchling nest crater at startY
    bg.fillGradientStyle(0x374151, 0x374151, 0x1e293b, 0x1e293b, 1);
    bg.fillRect(0, this.startY + 40, this.WORLD_WIDTH, this.worldHeight - this.startY);

    // Dune grass tufts south of nest
    for (let x = 120; x < this.WORLD_WIDTH - 120; x += 85) {
      const gy = this.startY + 65 + (x % 50);
      bg.fillStyle(0x14532d, 0.72);
      bg.fillCircle(x, gy, 24);
      bg.fillStyle(0x166534, 0.55);
      bg.fillCircle(x + 12, gy - 6, 16);
    }

    // Excavated nest sand crater at spawn
    bg.fillStyle(0x1e293b, 0.85);
    bg.fillEllipse(this.WORLD_WIDTH / 2, this.startY, 96, 68);
    bg.fillStyle(0x0f172a, 0.85);
    bg.fillEllipse(this.WORLD_WIDTH / 2, this.startY, 64, 44);
    bg.lineStyle(2, 0x94a3b8, 0.35);
    bg.strokeEllipse(this.WORLD_WIDTH / 2, this.startY, 96, 68);

    // 5. Coastal resort wooden boardwalks framing left (x < 92) & right (x > WORLD_WIDTH - 92)
    const drawBoardwalk = (xStart: number) => {
      bg.fillStyle(0x2d2017, 1);
      bg.fillRect(xStart, this.SURF_Y + 120, 92, this.worldHeight - this.SURF_Y);
      bg.lineStyle(2, 0x4b3628, 0.85);
      for (let py = this.SURF_Y + 132; py < this.worldHeight; py += 22) {
        bg.lineBetween(xStart + 3, py, xStart + 89, py);
      }
      bg.fillStyle(0x4b3628, 1);
      bg.fillRect(xStart === 0 ? 86 : xStart, this.SURF_Y + 120, 6, this.worldHeight - this.SURF_Y);
    };
    drawBoardwalk(0);
    drawBoardwalk(this.WORLD_WIDTH - 92);

    // Horizon surf guide label
    this.add
      .text(this.WORLD_WIDTH / 2, this.SURF_Y - 58, 'MOONLIT OCEAN SURF', {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#bae6fd',
        letterSpacing: 3,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(0.75);
  }

  private spawnBeachHabitatAndHazards(): void {
    const shadeGraphics = this.add.graphics().setDepth(7);
    const stepY = Math.max(155, 215 - (this.level - 1) * 10);
    let nodesSinceLastKelp = 0;

    for (let y = this.startY - 220; y > this.SURF_Y + 230; y -= stepY) {
      // Spawn 1-2 weathered driftwood shade shelters per band
      const logCount = Phaser.Math.Between(1, 2);
      for (let c = 0; c < logCount; c++) {
        const lx = Phaser.Math.Between(250, this.WORLD_WIDTH - 250);
        const ly = y + Phaser.Math.Between(-35, 35);
        const tooClose = this.driftwoodCovers.some(
          (d) => Phaser.Math.Distance.Between(lx, ly, d.x, d.y) < 190
        );
        if (tooClose) continue;

        const sprite = this.add
          .image(lx, ly, 'driftwood_cover')
          .setDepth(11)
          .setRotation(Phaser.Math.FloatBetween(-0.22, 0.22));

        const shade: ShadeZone = {
          x: lx,
          y: ly + 10,
          radiusX: 72,
          radiusY: 48,
        };
        shadeGraphics.fillStyle(0x020617, 0.42);
        shadeGraphics.fillEllipse(
          shade.x,
          shade.y,
          shade.radiusX * 2,
          shade.radiusY * 2
        );
        shadeGraphics.lineStyle(1, 0x38bdf8, 0.14);
        shadeGraphics.strokeEllipse(
          shade.x,
          shade.y,
          shade.radiusX * 2,
          shade.radiusY * 2
        );

        this.driftwoodCovers.push({ sprite, x: lx, y: ly, shade });
        this.shadeZones.push(shade);
        this.driftwoodObstacles.push({ x: lx, y: ly, radius: 36 });
      }

      // Cool damp kelp recovery patch evaluated by shared scarcity schedule
      nodesSinceLastKelp++;
      if (shouldSpawnFoodAtNode(this.level, nodesSinceLastKelp)) {
        nodesSinceLastKelp = 0;
        const kx = Phaser.Math.Between(220, this.WORLD_WIDTH - 220);
        const ky = y + Phaser.Math.Between(-45, 45);
        const kelpSprite = this.add.image(kx, ky, 'wet_kelp').setDepth(10);
        this.wetKelps.push({
          sprite: kelpSprite,
          x: kx,
          y: ky,
          collected: false,
        });
      }

      // Tangled beach plastic debris snares scaling gently with level
      const snareCount =
        this.level >= 2 ? Phaser.Math.Between(1, 2) : Math.random() < 0.72 ? 1 : 0;
      for (let s = 0; s < snareCount; s++) {
        const px = Phaser.Math.Between(220, this.WORLD_WIDTH - 220);
        const py = y + Phaser.Math.Between(-50, 50);
        const nearCover = this.driftwoodCovers.some(
          (d) => Phaser.Math.Distance.Between(px, py, d.x, d.y) < 110
        );
        if (nearCover) continue;

        const sprite = this.add
          .image(px, py, 'plastic_debris')
          .setDepth(9)
          .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
        this.plasticSnares.push({ sprite, x: px, y: py, radius: 34 });
      }
    }
  }

  private spawnResortLights(): void {
    const totalLights = 4 + Math.min(8, (this.level - 1) * 2);
    const minY = this.SURF_Y + 260;
    const maxY = this.startY - 120;
    const spanY = Math.max(400, maxY - minY);

    for (let i = 0; i < totalLights; i++) {
      const frac = (i + 0.5) / totalLights;
      const ly = Math.round(minY + spanY * frac);
      const isLeftSide = i % 2 === 0;
      const fixtureX = isLeftSide ? 64 : this.WORLD_WIDTH - 64;
      const baseX = isLeftSide
        ? Phaser.Math.Between(420, 660)
        : Phaser.Math.Between(this.WORLD_WIDTH - 660, this.WORLD_WIDTH - 420);
      const radius = Math.min(440, 270 + (this.level - 1) * 22);
      const strength = Math.min(108, 72 + (this.level - 1) * 6);

      // Streetlamp post icon on boardwalk
      const lamp = this.add.graphics().setDepth(16);
      lamp.fillStyle(0x1e293b, 1);
      lamp.fillCircle(fixtureX, ly, 11);
      lamp.fillStyle(0xfef08a, 0.95);
      lamp.fillCircle(fixtureX, ly, 6);

      const motion: SweepingSpotlight = {
        baseX,
        baseY: ly,
        ampX: 210 + Math.min(180, (this.level - 1) * 32),
        ampY: 120 + Math.min(110, (this.level - 1) * 20),
        speedX: 0.65 + (i % 3) * 0.22 + Math.min(0.45, (this.level - 1) * 0.08),
        speedY:
          0.45 + ((i + 1) % 3) * 0.18 + Math.min(0.35, (this.level - 1) * 0.06),
        phase: i * 1.45,
      };
      const initialPos = computeSpotlightPosition(motion, 0);

      this.resortLights.push({
        fixtureX,
        fixtureY: ly,
        motion,
        pool: {
          x: Phaser.Math.Clamp(initialPos.x, 130, this.WORLD_WIDTH - 130),
          y: Phaser.Math.Clamp(
            initialPos.y,
            this.SURF_Y + 180,
            this.worldHeight - 80
          ),
          radius,
          strength,
          sourceX: fixtureX,
          sourceY: ly,
        },
      });
    }

    // Southern beachfront promenade spotlight sweeping behind the nesting dune
    const southMotion: SweepingSpotlight = {
      baseX: this.WORLD_WIDTH / 2,
      baseY: this.startY + 135,
      ampX: 260,
      ampY: 30,
      speedX: 0.55,
      speedY: 0.35,
      phase: 0.6,
    };
    const southInitial = computeSpotlightPosition(southMotion, 0);
    this.resortLights.push({
      fixtureX: this.WORLD_WIDTH / 2,
      fixtureY: this.startY + 280,
      motion: southMotion,
      pool: {
        x: southInitial.x,
        y: southInitial.y,
        radius: 220,
        strength: 62,
        sourceX: this.WORLD_WIDTH / 2,
        sourceY: this.startY + 280,
      },
    });
  }

  private spawnGhostCrabs(): void {
    const { crabCount } = computeTurtlePredatorCounts(this.level);
    const minY = this.SURF_Y + 170;
    const maxY = this.startY - 190;
    const spanY = Math.max(300, maxY - minY);

    for (let i = 0; i < crabCount; i++) {
      const frac = (i + 0.5) / crabCount;
      const cy = Math.round(minY + spanY * frac + Phaser.Math.Between(-45, 45));
      const cx = Phaser.Math.Between(180, this.WORLD_WIDTH - 180);

      const sprite = this.add
        .image(cx, cy, 'ghost_crab')
        .setDepth(19)
        .setRotation(i % 2 === 0 ? 0 : Math.PI);

      this.ghostCrabs.push({
        sprite,
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        patrolAnchorX: cx,
        patrolAnchorY: cy,
        patrolDir: i % 2 === 0 ? 1 : -1,
        patrolSpan: Phaser.Math.Between(160, 280),
        patrolSpeed: Math.min(125, 68 + (this.level - 1) * 9),
        chaseSpeed: Math.min(182, 114 + (this.level - 1) * 12),
        wasChasing: false,
        attackCooldown: 0,
        alive: true,
      });
    }
  }

  private spawnSeabirds(): void {
    const { birdCount } = computeTurtlePredatorCounts(this.level);
    const minY = this.SURF_Y + 230;
    const maxY = this.startY - 220;
    const spanY = Math.max(320, maxY - minY);
    const telegraphDuration = Math.max(0.68, 1.12 - (this.level - 1) * 0.06);
    const recoverDuration = Math.max(1.25, 2.2 - (this.level - 1) * 0.14);

    for (let i = 0; i < birdCount; i++) {
      const frac = (i + 0.5) / birdCount;
      const ay = Math.round(minY + spanY * frac);
      const ax = Phaser.Math.Between(260, this.WORLD_WIDTH - 260);
      const orbitRadius = Phaser.Math.Between(150, 260);
      const orbitAngle = i * 1.9;
      const bx = ax + Math.cos(orbitAngle) * orbitRadius;
      const by = ay + Math.sin(orbitAngle) * orbitRadius;

      const sprite = this.add
        .image(bx, by, 'seabird_shadow')
        .setDepth(32)
        .setAlpha(0.84)
        .setRotation(orbitAngle + Math.PI / 2);

      this.seabirds.push({
        sprite,
        anchorX: ax,
        anchorY: ay,
        x: bx,
        y: by,
        orbitAngle,
        orbitRadius,
        orbitSpeed:
          (i % 2 === 0 ? 1 : -1) * (0.78 + Math.min(0.65, (this.level - 1) * 0.09)),
        state: 'patrol',
        stateTimer: 0,
        telegraphDuration,
        recoverDuration,
        strikeX: bx,
        strikeY: by,
        diveStartX: bx,
        diveStartY: by,
        baseDetectRadius: 235,
        targetKind: 'player',
      });
    }
  }

  private spawnSiblingHatchlings(): void {
    const siblingCount = 10 + Math.min(8, (this.level - 1) * 2);
    for (let i = 0; i < siblingCount; i++) {
      const fromNest = i < 8;
      const sx = fromNest
        ? this.WORLD_WIDTH / 2 + Phaser.Math.Between(-56, 56)
        : Phaser.Math.Between(360, this.WORLD_WIDTH - 360);
      const sy = fromNest
        ? this.startY + Phaser.Math.Between(-16, 18)
        : Phaser.Math.Between(
            Math.max(this.SURF_Y + 340, this.startY - 780),
            this.startY - 120
          );

      const sprite = this.add
        .image(sx, sy, 'turtle_crawl')
        .setDepth(17)
        .setScale(0.78)
        .setTint(0xd1fae5)
        .setAlpha(0.88)
        .setRotation(-Math.PI / 2);

      this.siblings.push({
        sprite,
        x: sx,
        y: sy,
        speed: Phaser.Math.FloatBetween(82, 116),
        startDelay: fromNest ? i * 0.2 : 0,
        wobblePhase: i * 1.3,
        isBurrowed: false,
        burrowTimer: 0,
        burrowCooldown: 0,
        eaten: false,
        active: true,
      });
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameEnded || globalPauseManager.isPaused()) return;

    const dt = Math.min(deltaMs / 1000, 0.05);
    this.levelElapsedSeconds += dt;

    // 1. Move resort spotlights in 2D before stealth/pull/blindness checks
    this.updateResortLights();

    // 2. Player movement, shade check, light pull & Burrow stealth
    this.updateTurtleMovement(dt);

    // 3. Burrow stamina recovery, blindness timer & cool kelp / plastic debris overlaps
    this.updateSurvivalAndEnvironment(dt);

    // 4. Ecosystem: sibling evasion, ghost crabs & swooping seabirds
    this.updateSiblingHatchlings(dt);
    this.updateGhostCrabs(dt);
    this.updateSeabirds(dt);

    // 5. Win / Loss evaluation
    this.checkWinLoss();

    // 6. Visuals, Light Cones, Surf Waves, Blindness Veil, Bird Telegraphs & HUD
    this.renderNightVisuals(dt);
    this.renderHUD();
  }

  private updateResortLights(): void {
    for (const light of this.resortLights) {
      const next = computeSpotlightPosition(
        light.motion,
        this.levelElapsedSeconds
      );
      light.pool.x = Phaser.Math.Clamp(next.x, 130, this.WORLD_WIDTH - 130);
      light.pool.y = Phaser.Math.Clamp(
        next.y,
        this.SURF_Y + 180,
        this.worldHeight - 80
      );
    }
  }

  private updateTurtleMovement(dt: number): void {
    if (!this.isBurrowed) {
      this.burrowCooldown.tick(dt);
    }

    const spaceDown = Boolean(this.wasd?.SPACE.isDown);
    const shiftDown = Boolean(this.wasd?.SHIFT.isDown);
    const burrowHeld = spaceDown || shiftDown;

    if (!burrowHeld) {
      this.burrowLockUntilRelease = false;
    }

    // Enter burrow stealth when SPACE/SHIFT held and cooldown is ready
    if (
      burrowHeld &&
      !this.isBurrowed &&
      this.burrowCooldown.isReady() &&
      !this.burrowLockUntilRelease
    ) {
      this.isBurrowed = true;
      this.burrowElapsed = 0;
      this.burrowsUsed++;
      this.turtle.setTexture('turtle_burrow');
      this.turtle.setScale(1.02);
    }

    // Update active burrow stealth or exit on release / max duration
    if (this.isBurrowed) {
      this.burrowElapsed += dt;
      if (!burrowHeld || this.burrowElapsed >= this.MAX_BURROW_DURATION) {
        if (this.burrowElapsed >= this.MAX_BURROW_DURATION && burrowHeld) {
          this.burrowLockUntilRelease = true;
        }
        this.isBurrowed = false;
        this.burrowElapsed = 0;
        this.burrowCooldown.trigger();
        this.turtle.setTexture('turtle_crawl');
        this.turtle.setScale(1.0);
      } else {
        this.turtleVx = 0;
        this.turtleVy = 0;
        this.inShade = isPointInShade(this.turtleX, this.turtleY, this.shadeZones);
        this.currentGlare = 0;
        this.currentPullX = 0;
        this.currentPullY = 0;
        return;
      }
    }

    // Directional crawl input (WASD / Arrows / pointer hold)
    let inputX = 0;
    let inputY = 0;
    if (this.cursors) {
      if (this.cursors.left.isDown || this.wasd?.A.isDown) inputX -= 1;
      if (this.cursors.right.isDown || this.wasd?.D.isDown) inputX += 1;
      if (this.cursors.up.isDown || this.wasd?.W.isDown) inputY -= 1;
      if (this.cursors.down.isDown || this.wasd?.S.isDown) inputY += 1;
    }

    if (this.input.activePointer.isDown && inputX === 0 && inputY === 0) {
      const worldPt = this.cameras.main.getWorldPoint(
        this.input.activePointer.x,
        this.input.activePointer.y
      );
      const pdx = worldPt.x - this.turtleX;
      const pdy = worldPt.y - this.turtleY;
      if (Math.hypot(pdx, pdy) > 16) {
        inputX = pdx;
        inputY = pdy;
      }
    }

    const inputLen = Math.hypot(inputX, inputY);
    if (inputLen > 0) {
      inputX /= inputLen;
      inputY /= inputLen;
      this.turtleAngle = Phaser.Math.Angle.RotateTo(
        this.turtleAngle,
        Math.atan2(inputY, inputX),
        12 * dt
      );
      this.crawlWobbleTime += dt * 11;
    }

    // Check shade cover & resort light pollution pull
    this.inShade = isPointInShade(this.turtleX, this.turtleY, this.shadeZones);
    const activePools = this.resortLights.map((l) => l.pool);
    const lightRes = computeLightPollutionPull(
      this.turtleX,
      this.turtleY,
      activePools,
      this.inShade
    );
    this.currentPullX = lightRes.pullX;
    this.currentPullY = lightRes.pullY;
    this.currentGlare = lightRes.glare;

    // Check plastic debris snare overlap
    this.isSnared = this.plasticSnares.some(
      (s) => Phaser.Math.Distance.Between(this.turtleX, this.turtleY, s.x, s.y) <= s.radius
    );

    const speedFactor = getStaminaSpeedMultiplier(this.maxStamina, 0.54);
    const snareFactor = this.isSnared ? 0.45 : 1.0;
    const baseSpeed = 148 * speedFactor * snareFactor;

    this.turtleVx = inputX * baseSpeed + this.currentPullX;
    this.turtleVy = inputY * baseSpeed + this.currentPullY;

    this.turtleX = Phaser.Math.Clamp(
      this.turtleX + this.turtleVx * dt,
      104,
      this.WORLD_WIDTH - 104
    );
    this.turtleY = Phaser.Math.Clamp(
      this.turtleY + this.turtleVy * dt,
      this.SURF_Y + 12,
      this.worldHeight - 40
    );

    // Record sandy flipper trail
    const speedMag = Math.hypot(this.turtleVx, this.turtleVy);
    if (speedMag > 16) {
      this.trackDropTimer += dt;
      if (this.trackDropTimer >= 0.14) {
        this.trackDropTimer = 0;
        this.sandTracks.push({
          x: this.turtleX,
          y: this.turtleY,
          angle: this.turtleAngle,
          age: 0,
        });
        if (this.sandTracks.length > 72) {
          this.sandTracks.shift();
        }
      }
    }

    this.turtle.setTexture('turtle_crawl');
    this.turtle.setPosition(this.turtleX, this.turtleY);
    const wobble =
      inputLen > 0 ? Math.sin(this.crawlWobbleTime) * 0.1 : 0;
    this.turtle.setRotation(this.turtleAngle + wobble);
  }

  private updateSurvivalAndEnvironment(dt: number): void {
    this.lightWarnCooldown = Math.max(0, this.lightWarnCooldown - dt);
    this.snareWarnCooldown = Math.max(0, this.snareWarnCooldown - dt);

    // Update spotlight blindness timer (only refreshes when exposed in glare)
    const wasBlinded = this.blindnessTimer > 0.15;
    this.blindnessTimer = updateBlindnessTimer(
      this.blindnessTimer,
      this.currentGlare,
      this.isBurrowed,
      this.inShade,
      dt
    );
    if (!wasBlinded && this.blindnessTimer > 0.5 && this.lightWarnCooldown <= 0) {
      this.lightWarnCooldown = 3.2;
      this.uiManager.spawnFloatingNotice(
        this.turtleX,
        this.turtleY - 26,
        'BLINDED BY SPOTLIGHT! PREDATORS HIDDEN',
        '#fef08a'
      );
    }

    if (this.isBurrowed) {
      // Recover stamina while safely tucked inside cool sand
      this.stamina = recoverBurrowedStamina(
        this.stamina,
        this.maxStamina,
        dt,
        18
      );
    } else {
      const nearSurf = this.turtleY <= this.SURF_Y + 260;
      let drainRate = nearSurf ? 2.0 : 3.6;

      if (this.currentGlare > 0.25) {
        drainRate += 3.0 * this.currentGlare;
        this.maxStamina = Math.max(20, this.maxStamina - 0.7 * dt);
        if (this.lightWarnCooldown <= 0 && !this.inShade) {
          this.lightWarnCooldown = 3.2;
          this.uiManager.spawnFloatingNotice(
            this.turtleX,
            this.turtleY - 26,
            'RESORT GLARE! DUCK INTO SHADE OR HOLD SPACE',
            '#fbbf24'
          );
        }
      }
      if (this.isSnared) {
        drainRate += 7.5;
        this.maxStamina = Math.max(20, this.maxStamina - 0.85 * dt);
        if (this.snareWarnCooldown <= 0) {
          this.snareWarnCooldown = 2.8;
          this.uiManager.spawnFloatingNotice(
            this.turtleX,
            this.turtleY - 26,
            'PLASTIC SNARE! SLOWED',
            '#fb923c'
          );
        }
      }

      this.stamina = Math.max(0, this.stamina - drainRate * dt);

      // Hydrate at cool damp kelp patches when unburrowed
      for (const kelp of this.wetKelps) {
        if (kelp.collected) continue;
        if (
          Phaser.Math.Distance.Between(
            this.turtleX,
            this.turtleY,
            kelp.x,
            kelp.y
          ) <= 36
        ) {
          kelp.collected = true;
          this.kelpCollected++;
          this.maxStamina = Math.min(100, this.maxStamina + 14);
          this.stamina = Math.min(this.maxStamina, this.stamina + 28);
          this.uiManager.spawnFloatingNotice(
            kelp.x,
            kelp.y - 24,
            '+HYDRATED (COOL KELP)',
            '#2dd4bf'
          );
          this.tweens.add({
            targets: kelp.sprite,
            alpha: 0,
            scale: 0.6,
            duration: 320,
          });
        }
      }
    }
  }

  private updateGhostCrabs(dt: number): void {
    const predatorVis = getPredatorVisibilityAlpha(this.blindnessTimer);
    const crabDetectRange = this.isBurrowed
      ? 0
      : this.inShade
      ? 95
      : 190 + this.currentGlare * 75;

    for (const crab of this.ghostCrabs) {
      if (!crab.alive) continue;

      crab.sprite.setAlpha(predatorVis);
      crab.sprite.setVisible(predatorVis > 0.01);

      if (crab.attackCooldown > 0) {
        crab.attackCooldown = Math.max(0, crab.attackCooldown - dt);
      }

      const distToTurtle = Phaser.Math.Distance.Between(
        crab.x,
        crab.y,
        this.turtleX,
        this.turtleY
      );

      let desiredVx = 0;
      let desiredVy = 0;

      // Dodge diving seabirds so crabs try to avoid getting eaten too
      let dodgingBird: Seabird | null = null;
      let bestBirdDist = 120;
      for (const bird of this.seabirds) {
        if (bird.state !== 'telegraph' && bird.state !== 'dive') continue;
        const dBird = Phaser.Math.Distance.Between(
          crab.x,
          crab.y,
          bird.strikeX,
          bird.strikeY
        );
        if (dBird < bestBirdDist) {
          bestBirdDist = dBird;
          dodgingBird = bird;
        }
      }

      if (dodgingBird) {
        crab.wasChasing = false;
        const awayAngle = Phaser.Math.Angle.Between(
          dodgingBird.strikeX,
          dodgingBird.strikeY,
          crab.x,
          crab.y
        );
        desiredVx = Math.cos(awayAngle) * crab.chaseSpeed;
        desiredVy = Math.sin(awayAngle) * crab.chaseSpeed;
      } else if (crabDetectRange > 0 && distToTurtle < crabDetectRange) {
        crab.wasChasing = true;
        const angle = Phaser.Math.Angle.Between(
          crab.x,
          crab.y,
          this.turtleX,
          this.turtleY
        );
        desiredVx = Math.cos(angle) * crab.chaseSpeed;
        desiredVy = Math.sin(angle) * crab.chaseSpeed;
      } else {
        if (crab.wasChasing && this.isBurrowed) {
          crab.wasChasing = false;
          this.predatorsEvaded++;
          crab.patrolDir = crab.x >= this.turtleX ? 1 : -1;
          this.uiManager.spawnFloatingNotice(
            crab.x,
            crab.y - 20,
            'HIDDEN! CRAB LOST YOU',
            '#2dd4bf'
          );
        } else {
          crab.wasChasing = false;
        }

        // Hunt nearby unburrowed sibling hatchlings if player is out of reach
        let targetSib: SiblingHatchling | null = null;
        let bestSibDist = 210;
        if (crab.attackCooldown <= 0) {
          for (const sib of this.siblings) {
            if (!sib.active || sib.eaten || sib.isBurrowed || sib.startDelay > 0) {
              continue;
            }
            const dSib = Phaser.Math.Distance.Between(crab.x, crab.y, sib.x, sib.y);
            const sibInShade = isPointInShade(sib.x, sib.y, this.shadeZones);
            const maxRange = sibInShade ? 105 : 210;
            if (dSib < maxRange && dSib < bestSibDist) {
              bestSibDist = dSib;
              targetSib = sib;
            }
          }
        }

        if (targetSib) {
          if (bestSibDist < 26) {
            targetSib.active = false;
            targetSib.eaten = true;
            crab.attackCooldown = 1.4;
            this.tweens.add({
              targets: targetSib.sprite,
              alpha: 0,
              scale: 0.35,
              duration: 280,
            });
            if (distToTurtle < 420 && predatorVis > 0.3) {
              this.uiManager.spawnFloatingNotice(
                targetSib.x,
                targetSib.y - 18,
                'SIBLING CAUGHT BY CRAB',
                '#fb923c'
              );
            }
          } else {
            const sibAngle = Phaser.Math.Angle.Between(
              crab.x,
              crab.y,
              targetSib.x,
              targetSib.y
            );
            desiredVx = Math.cos(sibAngle) * crab.chaseSpeed * 0.92;
            desiredVy = Math.sin(sibAngle) * crab.chaseSpeed * 0.92;
          }
        } else {
          // Lateral beach patrol near anchor
          if (crab.x > crab.patrolAnchorX + crab.patrolSpan) {
            crab.patrolDir = -1;
          } else if (crab.x < crab.patrolAnchorX - crab.patrolSpan) {
            crab.patrolDir = 1;
          }
          const dyReturn = Phaser.Math.Clamp(
            (crab.patrolAnchorY - crab.y) * 0.8,
            -45,
            45
          );
          desiredVx = crab.patrolDir * crab.patrolSpeed;
          desiredVy = dyReturn;
        }
      }

      const steered = resolveCircleObstacleMovement(
        crab.x,
        crab.y,
        desiredVx,
        desiredVy,
        dt,
        this.driftwoodObstacles
      );
      crab.x = Phaser.Math.Clamp(steered.x, 110, this.WORLD_WIDTH - 110);
      crab.y = Phaser.Math.Clamp(steered.y, this.SURF_Y + 90, this.startY - 120);
      crab.vx = steered.actualVx;
      crab.vy = steered.actualVy;

      crab.sprite.setPosition(crab.x, crab.y);
      if (Math.hypot(crab.vx, crab.vy) > 5) {
        crab.sprite.setRotation(Math.atan2(crab.vy, crab.vx));
      }

      // Pinch exposed turtle on contact
      if (
        !this.isBurrowed &&
        distToTurtle < 32 &&
        crab.attackCooldown <= 0
      ) {
        crab.attackCooldown = 1.25;
        this.stamina = Math.max(0, this.stamina - 26);
        this.maxStamina = Math.max(20, this.maxStamina - 9);
        const pushAngle = Phaser.Math.Angle.Between(
          crab.x,
          crab.y,
          this.turtleX,
          this.turtleY
        );
        this.turtleX = Phaser.Math.Clamp(
          this.turtleX + Math.cos(pushAngle) * 28,
          104,
          this.WORLD_WIDTH - 104
        );
        this.turtleY = Phaser.Math.Clamp(
          this.turtleY + Math.sin(pushAngle) * 28,
          this.SURF_Y + 12,
          this.worldHeight - 40
        );
        this.cameras.main.shake(120, 0.008);
        this.uiManager.spawnFloatingNotice(
          this.turtleX,
          this.turtleY - 28,
          'GHOST CRAB PINCH! HOLD SPACE TO HIDE',
          '#f87171'
        );
      }
    }
  }

  private updateSeabirds(dt: number): void {
    const predatorVis = getPredatorVisibilityAlpha(this.blindnessTimer);
    const activePools = this.resortLights.map((l) => l.pool);
    const canSpotHatchling =
      this.turtleY > this.SURF_Y + 90 && this.turtleY < this.startY - 120;
    const aliveCrabCount = this.ghostCrabs.reduce(
      (acc, c) => acc + (c.alive ? 1 : 0),
      0
    );

    for (const bird of this.seabirds) {
      if (bird.state === 'patrol') {
        bird.orbitAngle += bird.orbitSpeed * dt;
        bird.x = bird.anchorX + Math.cos(bird.orbitAngle) * bird.orbitRadius;
        bird.y = bird.anchorY + Math.sin(bird.orbitAngle) * bird.orbitRadius;
        bird.sprite.setPosition(bird.x, bird.y);
        bird.sprite.setScale(1);
        bird.sprite.setAlpha(0.75 * predatorVis);
        bird.sprite.setVisible(predatorVis > 0.01);
        bird.sprite.setRotation(
          bird.orbitAngle + (bird.orbitSpeed >= 0 ? Math.PI / 2 : -Math.PI / 2)
        );

        let lockedTarget = false;
        const detectR = computeBirdDetectRadius(
          bird.baseDetectRadius,
          this.currentGlare,
          this.isBurrowed,
          this.inShade
        );
        if (canSpotHatchling && detectR > 0) {
          const dist = Phaser.Math.Distance.Between(
            bird.x,
            bird.y,
            this.turtleX,
            this.turtleY
          );
          if (dist < detectR) {
            bird.state = 'telegraph';
            bird.stateTimer = bird.telegraphDuration;
            bird.targetKind = 'player';
            bird.strikeX = this.turtleX;
            bird.strikeY = this.turtleY;
            bird.diveStartX = bird.x;
            bird.diveStartY = bird.y;
            lockedTarget = true;
          }
        }

        // Also hunt exposed siblings across open beach
        if (!lockedTarget) {
          let bestSib: SiblingHatchling | null = null;
          let bestDist = Infinity;
          for (const sib of this.siblings) {
            if (
              !sib.active ||
              sib.eaten ||
              sib.isBurrowed ||
              sib.startDelay > 0 ||
              sib.y <= this.SURF_Y + 70 ||
              sib.y >= this.startY - 90
            ) {
              continue;
            }
            if (isPointInShade(sib.x, sib.y, this.shadeZones)) continue;
            const sibGlare = computeLightPollutionPull(
              sib.x,
              sib.y,
              activePools,
              false
            ).glare;
            const sibDetectR = bird.baseDetectRadius + sibGlare * 120;
            const dSib = Phaser.Math.Distance.Between(
              bird.x,
              bird.y,
              sib.x,
              sib.y
            );
            if (dSib < sibDetectR && dSib < bestDist) {
              bestDist = dSib;
              bestSib = sib;
            }
          }
          if (bestSib) {
            bird.state = 'telegraph';
            bird.stateTimer = bird.telegraphDuration;
            bird.targetKind = 'sibling';
            bird.strikeX = bestSib.x;
            bird.strikeY = bestSib.y;
            bird.diveStartX = bird.x;
            bird.diveStartY = bird.y;
            lockedTarget = true;
          }
        }

        // Occasionally swoop on exposed ghost crabs if surplus crabs remain
        if (!lockedTarget && aliveCrabCount > 4) {
          let bestCrab: GhostCrab | null = null;
          let bestDist = 170;
          for (const crab of this.ghostCrabs) {
            if (
              !crab.alive ||
              crab.y <= this.SURF_Y + 90 ||
              crab.y >= this.startY - 120 ||
              isPointInShade(crab.x, crab.y, this.shadeZones)
            ) {
              continue;
            }
            const dCrab = Phaser.Math.Distance.Between(
              bird.x,
              bird.y,
              crab.x,
              crab.y
            );
            if (dCrab < bestDist) {
              bestDist = dCrab;
              bestCrab = crab;
            }
          }
          if (bestCrab) {
            bird.state = 'telegraph';
            bird.stateTimer = bird.telegraphDuration;
            bird.targetKind = 'crab';
            bird.strikeX = bestCrab.x;
            bird.strikeY = bestCrab.y;
            bird.diveStartX = bird.x;
            bird.diveStartY = bird.y;
          }
        }
      } else if (bird.state === 'telegraph') {
        bird.stateTimer -= dt;
        const progress = Phaser.Math.Clamp(
          1 - bird.stateTimer / bird.telegraphDuration,
          0,
          1
        );
        const angleToTarget = Phaser.Math.Angle.Between(
          bird.x,
          bird.y,
          bird.strikeX,
          bird.strikeY
        );
        bird.sprite.setRotation(angleToTarget);
        bird.sprite.setAlpha(0.88 * predatorVis);
        bird.sprite.setVisible(predatorVis > 0.01);
        bird.sprite.setScale(1 + progress * 0.14);

        if (bird.stateTimer <= 0) {
          bird.state = 'dive';
          bird.stateTimer = 0.36;
          bird.diveStartX = bird.x;
          bird.diveStartY = bird.y;
        }
      } else if (bird.state === 'dive') {
        bird.stateTimer -= dt;
        const t = Phaser.Math.Clamp(1 - bird.stateTimer / 0.36, 0, 1);
        bird.x = Phaser.Math.Linear(bird.diveStartX, bird.strikeX, t);
        bird.y = Phaser.Math.Linear(bird.diveStartY, bird.strikeY, t);
        bird.sprite.setPosition(bird.x, bird.y);
        bird.sprite.setAlpha(0.98 * predatorVis);
        bird.sprite.setVisible(predatorVis > 0.01);
        bird.sprite.setScale(1.16 - t * 0.28);

        if (bird.stateTimer <= 0) {
          if (
            doesBirdDiveHit(
              this.turtleX,
              this.turtleY,
              bird.strikeX,
              bird.strikeY,
              42,
              this.isBurrowed,
              this.inShade
            )
          ) {
            this.gameEnded = true;
            globalPauseManager.setGameEnded(true);
            this.cameras.main.shake(320, 0.018);
            this.uiManager.spawnFloatingNotice(
              this.turtleX,
              this.turtleY - 26,
              'CAPTURED BY A SEABIRD!',
              '#ef4444'
            );
            this.time.delayedCall(450, () => {
              this.triggerImpactOverlay(false, 'predator');
            });
            return;
          }

          let caughtPrey = false;

          // Check if an exposed sibling was caught in the dive zone
          for (const sib of this.siblings) {
            if (!sib.active || sib.eaten || sib.isBurrowed || sib.startDelay > 0) {
              continue;
            }
            if (isPointInShade(sib.x, sib.y, this.shadeZones)) continue;
            if (
              Phaser.Math.Distance.Between(
                sib.x,
                sib.y,
                bird.strikeX,
                bird.strikeY
              ) <= 42
            ) {
              sib.active = false;
              sib.eaten = true;
              caughtPrey = true;
              this.tweens.add({
                targets: sib.sprite,
                alpha: 0,
                scale: 0.35,
                duration: 280,
              });
              if (
                Phaser.Math.Distance.Between(
                  this.turtleX,
                  this.turtleY,
                  sib.x,
                  sib.y
                ) < 420 &&
                predatorVis > 0.3
              ) {
                this.uiManager.spawnFloatingNotice(
                  sib.x,
                  sib.y - 20,
                  'SEABIRD SNATCHED A SIBLING!',
                  '#fb923c'
                );
              }
              break;
            }
          }

          // Otherwise check if an exposed ghost crab was caught
          if (!caughtPrey && aliveCrabCount > 3) {
            for (const crab of this.ghostCrabs) {
              if (!crab.alive) continue;
              if (isPointInShade(crab.x, crab.y, this.shadeZones)) continue;
              if (
                Phaser.Math.Distance.Between(
                  crab.x,
                  crab.y,
                  bird.strikeX,
                  bird.strikeY
                ) <= 34
              ) {
                crab.alive = false;
                caughtPrey = true;
                this.tweens.add({
                  targets: crab.sprite,
                  alpha: 0,
                  scale: 0.35,
                  duration: 280,
                });
                if (
                  Phaser.Math.Distance.Between(
                    this.turtleX,
                    this.turtleY,
                    crab.x,
                    crab.y
                  ) < 420 &&
                  predatorVis > 0.3
                ) {
                  this.uiManager.spawnFloatingNotice(
                    crab.x,
                    crab.y - 20,
                    'SEABIRD SNATCHED A CRAB!',
                    '#fde68a'
                  );
                }
                break;
              }
            }
          }

          if (
            !caughtPrey &&
            (bird.targetKind === 'player' ||
              Phaser.Math.Distance.Between(
                this.turtleX,
                this.turtleY,
                bird.strikeX,
                bird.strikeY
              ) < 130)
          ) {
            this.predatorsEvaded++;
            this.uiManager.spawnFloatingNotice(
              bird.strikeX,
              bird.strikeY - 24,
              'SWOOP EVADED!',
              '#2dd4bf'
            );
          }

          bird.state = 'recover';
          bird.stateTimer = bird.recoverDuration;
        }
      } else {
        // Recover and climb back to orbit
        bird.stateTimer -= dt;
        const targetX =
          bird.anchorX + Math.cos(bird.orbitAngle) * bird.orbitRadius;
        const targetY =
          bird.anchorY + Math.sin(bird.orbitAngle) * bird.orbitRadius;
        bird.x = Phaser.Math.Linear(bird.x, targetX, Math.min(1, dt * 1.8));
        bird.y = Phaser.Math.Linear(bird.y, targetY, Math.min(1, dt * 1.8));
        bird.sprite.setPosition(bird.x, bird.y);
        bird.sprite.setScale(0.95);
        bird.sprite.setAlpha(0.6 * predatorVis);
        bird.sprite.setVisible(predatorVis > 0.01);
        bird.sprite.setRotation(
          Phaser.Math.Angle.Between(bird.x, bird.y, targetX, targetY)
        );
        if (bird.stateTimer <= 0) {
          bird.state = 'patrol';
        }
      }
    }
  }

  private updateSiblingHatchlings(dt: number): void {
    const activePools = this.resortLights.map((l) => l.pool);
    for (const sib of this.siblings) {
      if (!sib.active || sib.eaten) continue;
      if (sib.startDelay > 0) {
        sib.startDelay -= dt;
        continue;
      }

      if (sib.burrowCooldown > 0) {
        sib.burrowCooldown = Math.max(0, sib.burrowCooldown - dt);
      }

      if (sib.isBurrowed) {
        sib.burrowTimer -= dt;
        if (sib.burrowTimer <= 0) {
          sib.isBurrowed = false;
          sib.burrowCooldown = 2.4;
          sib.sprite.setTexture('turtle_crawl');
        }
        continue;
      }

      // Burrow cleanly to evade nearby diving seabirds
      const threatenedByBird = this.seabirds.some(
        (b) =>
          (b.state === 'telegraph' || b.state === 'dive') &&
          Phaser.Math.Distance.Between(sib.x, sib.y, b.strikeX, b.strikeY) < 115
      );
      if (threatenedByBird && sib.burrowCooldown <= 0) {
        sib.isBurrowed = true;
        sib.burrowTimer = 1.35;
        sib.sprite.setTexture('turtle_burrow');
        continue;
      }

      // Evade nearby patrolling/chasing ghost crabs
      let fleeVx = 0;
      let fleeVy = 0;
      let closestCrabDist = 155;
      let closestCrab: GhostCrab | null = null;
      for (const crab of this.ghostCrabs) {
        if (!crab.alive) continue;
        const dCrab = Phaser.Math.Distance.Between(sib.x, sib.y, crab.x, crab.y);
        if (dCrab < closestCrabDist) {
          closestCrabDist = dCrab;
          closestCrab = crab;
        }
      }

      if (closestCrab) {
        if (closestCrabDist < 52 && sib.burrowCooldown <= 0) {
          sib.isBurrowed = true;
          sib.burrowTimer = 1.2;
          sib.sprite.setTexture('turtle_burrow');
          continue;
        }
        const dx = sib.x - closestCrab.x;
        const dy = sib.y - closestCrab.y;
        const len = Math.hypot(dx, dy) || 1;
        fleeVx = (dx / len) * 145;
        fleeVy = (dy / len) * 145;
      }

      const sibInShade = isPointInShade(sib.x, sib.y, this.shadeZones);
      const pull = computeLightPollutionPull(
        sib.x,
        sib.y,
        activePools,
        sibInShade
      );
      sib.wobblePhase += dt * 4.5;
      const vx = Math.sin(sib.wobblePhase) * 20 + pull.pullX * 0.7 + fleeVx;
      const vy = -sib.speed + pull.pullY * 0.65 + fleeVy;

      sib.x = Phaser.Math.Clamp(sib.x + vx * dt, 98, this.WORLD_WIDTH - 98);
      sib.y = Phaser.Math.Clamp(
        sib.y + vy * dt,
        this.SURF_Y + 12,
        this.worldHeight - 40
      );

      sib.sprite.setTexture('turtle_crawl');
      sib.sprite.setPosition(sib.x, sib.y);
      if (Math.hypot(vx, vy) > 5) {
        sib.sprite.setRotation(Math.atan2(vy, vx));
      }

      if (sib.y <= this.SURF_Y + 18) {
        sib.active = false;
        this.tweens.add({
          targets: sib.sprite,
          alpha: 0,
          scale: 0.45,
          duration: 380,
        });
      }
    }
  }

  private checkWinLoss(): void {
    // Win: Reached the breaking moonlit ocean surf at top
    if (this.turtleY <= this.SURF_Y + 26) {
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
          episodeId: 'TurtleScene',
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
          this.turtleX,
          this.turtleY - 24,
          `★ LEVEL ${this.level} COMPLETE${pbSuffix} → LEVEL ${nextLevel} (${nextMeters}m)`,
          '#f59e0b'
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

    // Loss: Yolk-sac stamina exhausted
    if (this.stamina <= 0) {
      this.gameEnded = true;
      globalPauseManager.setGameEnded(true);
      this.triggerImpactOverlay(false, 'exhaustion');
    }
  }

  private getNextLevelData(): TurtleSceneData {
    return {
      level: this.level + 1,
      carryMaxStamina: this.maxStamina,
      cumulativeMeters:
        this.cumulativeMetersBeforeLevel + this.levelTargetMeters,
      predatorsEvaded: this.predatorsEvaded,
      kelpCollected: this.kelpCollected,
      burrowsUsed: this.burrowsUsed,
      cumulativeTimeSeconds:
        this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds,
    };
  }

  private triggerImpactOverlay(
    won: boolean,
    deathReason: 'exhaustion' | 'predator' = 'exhaustion'
  ): void {
    if (won) {
      saveActiveSession('TurtleScene', { ...this.getNextLevelData() });
    } else {
      clearActiveSession();
    }

    const metersInCurrentLevel = Math.min(
      this.levelTargetMeters,
      Math.max(
        0,
        Math.round(
          ((this.startY - this.turtleY) / (this.startY - this.SURF_Y)) *
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
      showTurtleImpactModal?: (payload: {
        won: boolean;
        deathReason?: 'exhaustion' | 'predator';
        level: number;
        levelTargetMeters: number;
        metersInLevel: number;
        totalMetersMigrated: number;
        nextLevelMeters: number;
        predatorsEvaded: number;
        kelpCollected: number;
        burrowsUsed: number;
        levelTimeSeconds: number;
        totalTimeSeconds: number;
        nextLevelData: TurtleSceneData;
      }) => void;
    }).showTurtleImpactModal;

    if (openOverlay) {
      openOverlay({
        won,
        deathReason,
        level: this.level,
        levelTargetMeters: this.levelTargetMeters,
        metersInLevel: won ? this.levelTargetMeters : metersInCurrentLevel,
        totalMetersMigrated,
        nextLevelMeters,
        predatorsEvaded: this.predatorsEvaded,
        kelpCollected: this.kelpCollected,
        burrowsUsed: this.burrowsUsed,
        levelTimeSeconds: this.levelElapsedSeconds,
        totalTimeSeconds:
          this.cumulativeTimeBeforeLevel + this.levelElapsedSeconds,
        nextLevelData: this.getNextLevelData(),
      });
    }
  }

  private renderNightVisuals(dt: number): void {
    const t = this.time.now * 0.0025;
    const predatorVis = getPredatorVisibilityAlpha(this.blindnessTimer);

    // 1. Animated white breaking ocean surf along SURF_Y
    this.surfGraphics.clear();
    for (let x = 0; x <= this.WORLD_WIDTH; x += 64) {
      const waveY =
        this.SURF_Y + Math.sin(t * 1.4 + x * 0.015) * 9 + 6;
      this.surfGraphics.fillStyle(0xe0f2fe, 0.24);
      this.surfGraphics.fillEllipse(x + 32, waveY + 6, 86, 18);
      this.surfGraphics.fillStyle(0xf8fafc, 0.36);
      this.surfGraphics.fillEllipse(x + 32, waveY, 72, 8);
    }

    // 2. Flipper sand-track trail
    this.trackGraphics.clear();
    for (const pt of this.sandTracks) {
      pt.age += dt;
      const alpha = Phaser.Math.Clamp(1 - pt.age / 7.5, 0, 1) * 0.35;
      if (alpha <= 0.01) continue;
      const perpX = -Math.sin(pt.angle) * 8;
      const perpY = Math.cos(pt.angle) * 8;
      this.trackGraphics.fillStyle(0x0f172a, alpha);
      this.trackGraphics.fillCircle(pt.x + perpX, pt.y + perpY, 2.1);
      this.trackGraphics.fillCircle(pt.x - perpX, pt.y - perpY, 2.1);
    }

    // 3. Coastal resort moving spotlights & sand glare pools
    this.lightGraphics.clear();
    for (const light of this.resortLights) {
      const { x, y, radius } = light.pool;
      const dx = x - light.fixtureX;
      const dy = y - light.fixtureY;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = (-dy / len) * (radius * 0.45);
      const perpY = (dx / len) * (radius * 0.45);

      this.lightGraphics.fillStyle(0xfef08a, 0.09);
      this.lightGraphics.fillTriangle(
        light.fixtureX,
        light.fixtureY,
        x - perpX,
        y - perpY,
        x + perpX,
        y + perpY
      );
      this.lightGraphics.fillStyle(0xf59e0b, 0.15);
      this.lightGraphics.fillCircle(x, y, radius);
      this.lightGraphics.fillStyle(0xfef08a, 0.2);
      this.lightGraphics.fillCircle(x, y, radius * 0.52);
      this.lightGraphics.lineStyle(1, 0xfbbf24, 0.26);
      this.lightGraphics.strokeCircle(x, y, radius);
    }

    // 4. Seabird telegraph strike rings (hidden when blinded by spotlight)
    this.birdOverlayGraphics.clear();
    if (predatorVis > 0.01) {
      for (const bird of this.seabirds) {
        if (bird.state === 'telegraph' || bird.state === 'dive') {
          const pulse = 0.65 + Math.sin(this.time.now * 0.025) * 0.25;
          this.birdOverlayGraphics.fillStyle(
            0xef4444,
            0.14 * pulse * predatorVis
          );
          this.birdOverlayGraphics.fillCircle(bird.strikeX, bird.strikeY, 42);
          this.birdOverlayGraphics.lineStyle(
            2.5,
            0xef4444,
            0.85 * pulse * predatorVis
          );
          this.birdOverlayGraphics.strokeCircle(bird.strikeX, bird.strikeY, 42);
        }
      }
    }

    // 5. Full-screen glare wash while night vision is blinded by a spotlight
    this.blindOverlayGraphics.clear();
    if (this.blindnessTimer > 0) {
      const blindAlpha =
        Phaser.Math.Clamp(this.blindnessTimer / 3.4, 0, 1) * 0.28;
      this.blindOverlayGraphics.fillStyle(0xfef9c3, blindAlpha);
      this.blindOverlayGraphics.fillRect(
        0,
        0,
        this.scale.width,
        this.scale.height
      );
    }
  }

  private renderHUD(): void {
    const distTotal = Math.max(1, this.startY - this.SURF_Y);
    const rawPct = (this.startY - this.turtleY) / distTotal;
    const progressPct = Phaser.Math.Clamp(rawPct, 0, 1);
    const metersRemaining = Math.max(
      0,
      Math.round(this.levelTargetMeters * (1 - progressPct))
    );

    const predatorVis = getPredatorVisibilityAlpha(this.blindnessTimer);
    const canSeeDivingBird =
      predatorVis > 0.15 &&
      this.seabirds.some(
        (b) =>
          (b.state === 'telegraph' || b.state === 'dive') &&
          b.targetKind === 'player'
      );

    const vignetteColor = canSeeDivingBird
      ? 0xef4444
      : this.blindnessTimer > 0
      ? 0xfef08a
      : this.currentGlare > 0.2
      ? 0xf59e0b
      : undefined;
    const vignetteAlpha = canSeeDivingBird
      ? 0.36
      : this.blindnessTimer > 0
      ? Phaser.Math.Clamp(this.blindnessTimer / 3.4, 0, 1) * 0.42
      : this.currentGlare > 0.2
      ? this.currentGlare * 0.35
      : 0;

    this.uiManager.renderTopHUD({
      headerPrefix: `EPISODE 04 • LEVEL ${this.level}`,
      elapsedSeconds: this.levelElapsedSeconds,
      heroValueText: `${metersRemaining}m`,
      subValueText: 'to Moonlit Surf',
      progressPct,
      stamina: this.stamina,
      secondaryVignetteColor: vignetteColor,
      secondaryVignetteAlpha: vignetteAlpha,
    });

    let secondaryBar:
      | {
          pct: number;
          fillColor: number;
          tagText: string;
          tagColor: string;
        }
      | undefined;

    if (this.isBurrowed) {
      const secsLeft = Math.max(0, this.MAX_BURROW_DURATION - this.burrowElapsed);
      secondaryBar = {
        pct: secsLeft / this.MAX_BURROW_DURATION,
        fillColor: 0x2dd4bf,
        tagText: `BURROWED • RECOVERING ${secsLeft.toFixed(1)}s`,
        tagColor: '#5eead4',
      };
    } else if (this.blindnessTimer > 0.1) {
      secondaryBar = {
        pct: Phaser.Math.Clamp(this.blindnessTimer / 3.8, 0, 1),
        fillColor: 0xfef08a,
        tagText: `BLINDED • ${this.blindnessTimer.toFixed(1)}s`,
        tagColor: '#fef08a',
      };
    } else if (canSeeDivingBird) {
      secondaryBar = {
        pct: 1,
        fillColor: 0xef4444,
        tagText: 'SEABIRD DIVING • HOLD SPACE!',
        tagColor: '#fca5a5',
      };
    } else if (!this.burrowCooldown.isReady()) {
      secondaryBar = {
        pct: this.burrowCooldown.getRechargePct(),
        fillColor: 0x94a3b8,
        tagText: `BURROW ${this.burrowCooldown.getRemaining().toFixed(1)}s`,
        tagColor: '#cbd5e1',
      };
    } else if (this.isSnared) {
      secondaryBar = {
        pct: 1,
        fillColor: 0xf97316,
        tagText: 'PLASTIC SNARE • SLOWED',
        tagColor: '#fdba74',
      };
    } else if (this.currentGlare > 0.2) {
      secondaryBar = {
        pct: this.currentGlare,
        fillColor: 0xf59e0b,
        tagText: 'LIGHT PULL • HEAD TO SURF',
        tagColor: '#fcd34d',
      };
    } else if (this.inShade) {
      secondaryBar = {
        pct: 1,
        fillColor: 0x38bdf8,
        tagText: 'IN DRIFTWOOD SHADE (HIDDEN)',
        tagColor: '#7dd3fc',
      };
    }

    const fillCol =
      this.stamina < 28
        ? 0xef4444
        : this.isBurrowed || this.inShade
        ? 0x2dd4bf
        : 0xf59e0b;

    this.uiManager.renderWorldBars({
      x: this.turtleX,
      y: this.turtleY,
      stamina: this.stamina,
      maxStamina: this.maxStamina,
      primaryFillColor: fillCol,
      secondaryBar,
    });
  }
}
