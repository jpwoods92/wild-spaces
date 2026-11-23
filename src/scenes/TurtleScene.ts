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
  doesBirdDiveHit,
  isPointInShade,
  LightPool,
  ShadeZone,
} from '../utils/BeachStealth';
import {
  EpisodeUIManager,
  getStaminaSpeedMultiplier,
} from '../systems/EpisodeUIManager';
import { globalPauseManager } from '../systems/PauseManager';

interface ResortLight {
  fixtureX: number;
  fixtureY: number;
  basePoolX: number;
  basePoolY: number;
  sweepAmp: number;
  sweepSpeed: number;
  sweepPhase: number;
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
}

type SeabirdState = 'patrol' | 'telegraph' | 'dive' | 'recover';

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
  strikeX: number;
  strikeY: number;
  diveStartX: number;
  diveStartY: number;
  baseDetectRadius: number;
}

interface SiblingHatchling {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  speed: number;
  startDelay: number;
  wobblePhase: number;
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
        'WASD / Arrows: Crawl  •  Hold SPACE: Burrow & Hide  •  Avoid Lights & Predators  •  P / ESC: Pause',
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
      const reachX = isLeftSide
        ? Phaser.Math.Between(310, 560)
        : Phaser.Math.Between(this.WORLD_WIDTH - 560, this.WORLD_WIDTH - 310);
      const radius = Math.min(440, 270 + (this.level - 1) * 22);
      const strength = Math.min(108, 72 + (this.level - 1) * 6);

      // Streetlamp post icon on boardwalk
      const lamp = this.add.graphics().setDepth(16);
      lamp.fillStyle(0x1e293b, 1);
      lamp.fillCircle(fixtureX, ly, 11);
      lamp.fillStyle(0xfef08a, 0.95);
      lamp.fillCircle(fixtureX, ly, 6);

      const sweepAmp = this.level >= 2 ? 45 + Math.min(55, (this.level - 2) * 14) : 0;

      this.resortLights.push({
        fixtureX,
        fixtureY: ly,
        basePoolX: reachX,
        basePoolY: ly,
        sweepAmp,
        sweepSpeed: 0.7 + (i % 3) * 0.2,
        sweepPhase: i * 1.4,
        pool: {
          x: reachX,
          y: ly,
          radius,
          strength,
          sourceX: fixtureX,
          sourceY: ly,
        },
      });
    }

    // Southern beachfront promenade glare behind the nesting dune
    this.resortLights.push({
      fixtureX: this.WORLD_WIDTH / 2,
      fixtureY: this.startY + 280,
      basePoolX: this.WORLD_WIDTH / 2,
      basePoolY: this.startY + 135,
      sweepAmp: 0,
      sweepSpeed: 0,
      sweepPhase: 0,
      pool: {
        x: this.WORLD_WIDTH / 2,
        y: this.startY + 135,
        radius: 220,
        strength: 62,
        sourceX: this.WORLD_WIDTH / 2,
        sourceY: this.startY + 280,
      },
    });
  }

  private spawnGhostCrabs(): void {
    const crabCount = Math.min(16, 4 + (this.level - 1) * 2);
    const minY = this.SURF_Y + 190;
    const maxY = this.startY - 220;
    const spanY = Math.max(300, maxY - minY);

    for (let i = 0; i < crabCount; i++) {
      const frac = (i + 0.5) / crabCount;
      const cy = Math.round(minY + spanY * frac + Phaser.Math.Between(-35, 35));
      const cx = Phaser.Math.Between(240, this.WORLD_WIDTH - 240);

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
        patrolSpan: Phaser.Math.Between(160, 260),
        patrolSpeed: Math.min(115, 68 + (this.level - 1) * 8),
        chaseSpeed: Math.min(172, 114 + (this.level - 1) * 11),
        wasChasing: false,
        attackCooldown: 0,
      });
    }
  }

  private spawnSeabirds(): void {
    const birdCount = Math.min(7, 2 + Math.floor((this.level - 1) * 1.2));
    const minY = this.SURF_Y + 280;
    const maxY = this.startY - 260;
    const spanY = Math.max(320, maxY - minY);

    for (let i = 0; i < birdCount; i++) {
      const frac = (i + 0.5) / birdCount;
      const ay = Math.round(minY + spanY * frac);
      const ax =
        this.WORLD_WIDTH / 2 +
        Phaser.Math.Between(-420, 420);
      const orbitRadius = Phaser.Math.Between(150, 240);
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
        orbitSpeed: (i % 2 === 0 ? 1 : -1) * (0.75 + (this.level - 1) * 0.07),
        state: 'patrol',
        stateTimer: 0,
        telegraphDuration: Math.max(0.75, 1.12 - (this.level - 1) * 0.06),
        strikeX: bx,
        strikeY: by,
        diveStartX: bx,
        diveStartY: by,
        baseDetectRadius: 235,
      });
    }
  }

  private spawnSiblingHatchlings(): void {
    for (let i = 0; i < 7; i++) {
      const sx = this.WORLD_WIDTH / 2 + Phaser.Math.Between(-46, 46);
      const sy = this.startY + Phaser.Math.Between(-16, 18);
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
        speed: Phaser.Math.FloatBetween(82, 114),
        startDelay: i * 0.22,
        wobblePhase: i * 1.3,
        active: true,
      });
    }
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameEnded || globalPauseManager.isPaused()) return;

    const dt = Math.min(deltaMs / 1000, 0.05);
    this.levelElapsedSeconds += dt;

    // 1. Animate sweeping resort light pools before stealth/pull checks
    this.updateResortLights(dt);

    // 2. Player movement, shade check, light pull & Burrow stealth
    this.updateTurtleMovement(dt);

    // 3. Survival stamina drains & cool kelp / plastic debris overlaps
    this.updateSurvivalAndEnvironment(dt);

    // 4. Predators & atmospheric siblings
    this.updateGhostCrabs(dt);
    this.updateSeabirds(dt);
    this.updateSiblingHatchlings(dt);

    // 5. Win / Loss evaluation
    this.checkWinLoss();

    // 6. Visuals, Light Cones, Surf Waves, Bird Telegraphs & HUD
    this.renderNightVisuals(dt);
    this.renderHUD();
  }

  private updateResortLights(dt: number): void {
    for (const light of this.resortLights) {
      if (light.sweepAmp > 0) {
        light.sweepPhase += dt * light.sweepSpeed;
        light.pool.x =
          light.basePoolX + Math.sin(light.sweepPhase) * light.sweepAmp;
      }
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

    const nearSurf = this.turtleY <= this.SURF_Y + 260;
    let drainRate = this.isBurrowed
      ? 3.2
      : nearSurf
      ? 2.0
      : 3.6;

    if (!this.isBurrowed) {
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
    }

    this.stamina = Math.max(0, this.stamina - drainRate * dt);

    // Hydrate at cool damp kelp patches when unburrowed
    if (!this.isBurrowed) {
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
    const crabDetectRange = this.isBurrowed
      ? 0
      : this.inShade
      ? 95
      : 190 + this.currentGlare * 75;

    for (const crab of this.ghostCrabs) {
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

      if (crabDetectRange > 0 && distToTurtle < crabDetectRange) {
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
    const canSpotHatchling =
      this.turtleY > this.SURF_Y + 90 && this.turtleY < this.startY - 120;

    for (const bird of this.seabirds) {
      if (bird.state === 'patrol') {
        bird.orbitAngle += bird.orbitSpeed * dt;
        bird.x = bird.anchorX + Math.cos(bird.orbitAngle) * bird.orbitRadius;
        bird.y = bird.anchorY + Math.sin(bird.orbitAngle) * bird.orbitRadius;
        bird.sprite.setPosition(bird.x, bird.y);
        bird.sprite.setScale(1);
        bird.sprite.setAlpha(0.75);
        bird.sprite.setRotation(
          bird.orbitAngle + (bird.orbitSpeed >= 0 ? Math.PI / 2 : -Math.PI / 2)
        );

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
            bird.strikeX = this.turtleX;
            bird.strikeY = this.turtleY;
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
        bird.sprite.setAlpha(0.88);
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
        bird.sprite.setAlpha(0.98);
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
          } else {
            this.predatorsEvaded++;
            this.uiManager.spawnFloatingNotice(
              bird.strikeX,
              bird.strikeY - 24,
              'SWOOP EVADED!',
              '#2dd4bf'
            );
            bird.state = 'recover';
            bird.stateTimer = 2.2;
          }
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
        bird.sprite.setAlpha(0.6);
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
      if (!sib.active) continue;
      if (sib.startDelay > 0) {
        sib.startDelay -= dt;
        continue;
      }

      const sibInShade = isPointInShade(sib.x, sib.y, this.shadeZones);
      const pull = computeLightPollutionPull(
        sib.x,
        sib.y,
        activePools,
        sibInShade
      );
      sib.wobblePhase += dt * 4.5;
      const vx = Math.sin(sib.wobblePhase) * 20 + pull.pullX * 0.7;
      const vy = -sib.speed + pull.pullY * 0.65;

      sib.x = Phaser.Math.Clamp(sib.x + vx * dt, 98, this.WORLD_WIDTH - 98);
      sib.y += vy * dt;

      sib.sprite.setPosition(sib.x, sib.y);
      sib.sprite.setRotation(Math.atan2(vy, vx));

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

    // 3. Coastal resort light-pollution cones & sand glare pools
    this.lightGraphics.clear();
    for (const light of this.resortLights) {
      const { x, y, radius } = light.pool;
      this.lightGraphics.fillStyle(0xfef08a, 0.08);
      this.lightGraphics.fillTriangle(
        light.fixtureX,
        light.fixtureY,
        x - radius * 0.35,
        y + radius * 0.22,
        x + radius * 0.35,
        y - radius * 0.22
      );
      this.lightGraphics.fillStyle(0xf59e0b, 0.14);
      this.lightGraphics.fillCircle(x, y, radius);
      this.lightGraphics.fillStyle(0xfef08a, 0.18);
      this.lightGraphics.fillCircle(x, y, radius * 0.52);
      this.lightGraphics.lineStyle(1, 0xfbbf24, 0.24);
      this.lightGraphics.strokeCircle(x, y, radius);
    }

    // 4. Seabird telegraph strike rings
    this.birdOverlayGraphics.clear();
    for (const bird of this.seabirds) {
      if (bird.state === 'telegraph' || bird.state === 'dive') {
        const pulse = 0.65 + Math.sin(this.time.now * 0.025) * 0.25;
        this.birdOverlayGraphics.fillStyle(0xef4444, 0.14 * pulse);
        this.birdOverlayGraphics.fillCircle(bird.strikeX, bird.strikeY, 42);
        this.birdOverlayGraphics.lineStyle(2.5, 0xef4444, 0.85 * pulse);
        this.birdOverlayGraphics.strokeCircle(bird.strikeX, bird.strikeY, 42);
      }
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

    const anyBirdDiving = this.seabirds.some(
      (b) => b.state === 'telegraph' || b.state === 'dive'
    );
    const vignetteColor = anyBirdDiving
      ? 0xef4444
      : this.currentGlare > 0.2
      ? 0xf59e0b
      : undefined;
    const vignetteAlpha = anyBirdDiving
      ? 0.36
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
        tagText: `BURROWED • ${secsLeft.toFixed(1)}s`,
        tagColor: '#5eead4',
      };
    } else if (anyBirdDiving) {
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
