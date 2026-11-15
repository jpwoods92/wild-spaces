import Phaser from 'phaser';

interface IceFloe {
  id: number;
  container: Phaser.GameObjects.Container;
  underwaterGraphics: Phaser.GameObjects.Graphics;
  surfaceGraphics: Phaser.GameObjects.Graphics;
  crackGraphics: Phaser.GameObjects.Graphics;
  points: Phaser.Math.Vector2[];
  baseRadius: number;
  currentScale: number;
  meltRate: number; // baseline passive melt per second
  weightMeltRate: number; // extra melt when bear stands on it
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

interface IndustrialShip {
  sprite: Phaser.GameObjects.Image;
  wakeGraphics: Phaser.GameObjects.Graphics;
  vx: number;
  laneY: number;
}

export class PolarBearScene extends Phaser.Scene {
  private readonly WORLD_WIDTH = 1600;
  private readonly WORLD_HEIGHT = 4200;
  private readonly START_Y = 3920;
  private readonly SANCTUARY_Y = 380;

  private bear!: Phaser.GameObjects.Sprite;
  private cub!: Phaser.GameObjects.Image;
  private bearX = 800;
  private bearY = 3920;
  private bearVx = 0;
  private bearVy = 0;
  private bearAngle = -Math.PI / 2; // facing North

  // Survival meters (0 - 100)
  private warmth = 100;
  private stamina = 100;
  private isOnIce = true;
  private currentFloe: IceFloe | null = null;

  // Lunge / Dash state
  private lungeTimer = 0;
  private lungeCooldown = 0;
  private lungeDirX = 0;
  private lungeDirY = 0;

  // Entities
  private floes: IceFloe[] = [];
  private seals: SealPrey[] = [];
  private ships: IndustrialShip[] = [];

  // Run telemetry for Impact Report
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

  // HUD Elements (fixed to camera)
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private hudDistanceText!: Phaser.GameObjects.Text;
  private hudWarmthLabel!: Phaser.GameObjects.Text;
  private hudStaminaLabel!: Phaser.GameObjects.Text;
  private hudStatusText!: Phaser.GameObjects.Text;
  private hudTempText!: Phaser.GameObjects.Text;
  private hudHintText!: Phaser.GameObjects.Text;
  private hypothermiaVignette!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'PolarBearScene' });
  }

  create(): void {
    this.resetState();

    // 1. World Ocean Background & Currents
    this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);
    this.drawOceanBackdrop();

    // 2. Generate Ice Floe Stepping Stones & Northern Sanctuary
    this.generateMigrationRoute();

    // 3. Spawn Industrial Shipping Lane (mid-migration human impact hazard)
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

    // 8. Build Fixed HUD
    this.createHUD();

    // Handle window resize cleanly
    this.scale.on('resize', () => {
      this.layoutHUD();
    });
  }

  private resetState(): void {
    this.bearX = this.WORLD_WIDTH / 2;
    this.bearY = this.START_Y;
    this.bearVx = 0;
    this.bearVy = 0;
    this.bearAngle = -Math.PI / 2;
    this.warmth = 100;
    this.stamina = 100;
    this.isOnIce = true;
    this.currentFloe = null;
    this.lungeTimer = 0;
    this.lungeCooldown = 0;
    this.floes = [];
    this.seals = [];
    this.ships = [];
    this.totalSwimMeters = 0;
    this.sealsCaught = 0;
    this.floesCollapsed = 0;
    this.gameEnded = false;
  }

  private drawOceanBackdrop(): void {
    const bg = this.add.graphics().setDepth(0);
    // Deep Arctic bathyal gradient
    bg.fillGradientStyle(0x071e34, 0x071e34, 0x030b14, 0x030b14, 1);
    bg.fillRect(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

    // Subtle horizontal current bands
    bg.lineStyle(2, 0x38bdf8, 0.06);
    for (let y = 200; y < this.WORLD_HEIGHT; y += 140) {
      bg.beginPath();
      for (let x = 0; x <= this.WORLD_WIDTH; x += 80) {
        const waveY = y + Math.sin(x * 0.008 + y * 0.01) * 18;
        if (x === 0) bg.moveTo(x, waveY);
        else bg.lineTo(x, waveY);
      }
      bg.strokePath();
    }

    // Shipping Lane Hazard Corridor Marker (around Y = 1950..2250)
    const laneGraphics = this.add.graphics().setDepth(1);
    laneGraphics.fillStyle(0x451a03, 0.22);
    laneGraphics.fillRect(0, 1940, this.WORLD_WIDTH, 320);
    laneGraphics.lineStyle(2, 0xf59e0b, 0.35);
    laneGraphics.lineBetween(0, 1940, this.WORLD_WIDTH, 1940);
    laneGraphics.lineBetween(0, 2260, this.WORLD_WIDTH, 2260);

    this.add
      .text(
        this.WORLD_WIDTH / 2,
        1962,
        '⚠ COMMERCIAL ARCTIC SHIPPING CORRIDOR — HIGH WAKE & ICE BREAKUP ⚠',
        {
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#fbbf24',
          letterSpacing: 2,
        }
      )
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setDepth(2);
  }

  private generateMigrationRoute(): void {
    let nextId = 1;

    // 1. Starting Southern Floe (stable enough to orient, but begins melting)
    this.createIceFloe(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.START_Y,
      135,
      0.006,
      0.02,
      0
    );

    // 2. Stepping-stone floes from South (Y=3680) to North (Y=680)
    let yCursor = 3680;
    while (yCursor > 680) {
      // Skip right inside the narrowest center of the shipping lane to force a tense crossing
      const inShippingLane = yCursor > 2020 && yCursor < 2190;
      const floesInRow = inShippingLane
        ? 1
        : Phaser.Math.Between(2, 3);

      const rowWidth = 1050;
      const startX = (this.WORLD_WIDTH - rowWidth) / 2;

      for (let i = 0; i < floesInRow; i++) {
        const slotX =
          floesInRow === 1
            ? Phaser.Math.Between(520, 1080)
            : startX +
              (i * rowWidth) / (floesInRow - 1) +
              Phaser.Math.Between(-95, 95);

        const fy = yCursor + Phaser.Math.Between(-45, 45);
        // Southern floes are smaller or melt faster; medium floes occasionally hold seals
        const baseRadius = Phaser.Math.Between(68, 128);
        const passiveMelt = Phaser.Math.FloatBetween(0.003, 0.008);
        const weightMelt =
          baseRadius < 88
            ? Phaser.Math.FloatBetween(0.048, 0.075)
            : Phaser.Math.FloatBetween(0.022, 0.038);
        const driftVx = Phaser.Math.FloatBetween(-24, 24);

        const floe = this.createIceFloe(
          nextId++,
          slotX,
          fy,
          baseRadius,
          passiveMelt,
          weightMelt,
          driftVx
        );

        // Spawn a Ringed Seal on ~38% of floes that are medium/large
        if (baseRadius >= 85 && Math.random() < 0.42) {
          this.spawnSealOnFloe(floe);
        }
      }

      yCursor -= Phaser.Math.Between(185, 235);
    }

    // 3. Permanent Northern Pack Ice Sanctuary (Top of map)
    const sanctuary = this.createIceFloe(
      nextId++,
      this.WORLD_WIDTH / 2,
      this.SANCTUARY_Y - 30,
      360,
      0,
      0,
      0,
      true
    );

    this.add
      .text(
        this.WORLD_WIDTH / 2,
        this.SANCTUARY_Y - 140,
        '★ PERMANENT NORTHERN PACK ICE SANCTUARY ★',
        {
          fontSize: '15px',
          fontStyle: 'bold',
          color: '#38bdf8',
          letterSpacing: 2,
        }
      )
      .setOrigin(0.5)
      .setDepth(16);

    this.currentFloe = sanctuary; // Will be updated on first frame
  }

  private createIceFloe(
    id: number,
    x: number,
    y: number,
    radius: number,
    meltRate: number,
    weightMeltRate: number,
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
      baseRadius: radius,
      currentScale: 1,
      meltRate,
      weightMeltRate,
      vx,
      minX: 180,
      maxX: this.WORLD_WIDTH - 180,
      isSanctuary,
      crackStage: 0,
    };

    this.floes.push(floe);
    return floe;
  }

  private drawFloeCracks(floe: IceFloe, stage: number): void {
    floe.crackGraphics.clear();
    floe.crackGraphics.lineStyle(2, 0x0284c7, 0.75);

    const count = stage * 2;
    for (let i = 0; i < count; i++) {
      const p1 = floe.points[(i * 3) % floe.points.length];
      floe.crackGraphics.beginPath();
      floe.crackGraphics.moveTo(p1.x * 0.9, p1.y * 0.9);
      floe.crackGraphics.lineTo(p1.x * 0.35 + (i % 2 === 0 ? 12 : -12), p1.y * 0.35);
      floe.crackGraphics.lineTo(0, 0);
      floe.crackGraphics.strokePath();
    }
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
    const lanes = [
      { y: 2010, vx: 115, startX: 300 },
      { y: 2180, vx: -125, startX: 1250 },
    ];

    for (const lane of lanes) {
      const wakeGraphics = this.add.graphics().setDepth(13);
      const sprite = this.add
        .image(lane.startX, lane.y, 'industrial_ship')
        .setDepth(14)
        .setFlipX(lane.vx < 0);

      this.ships.push({
        sprite,
        wakeGraphics,
        vx: lane.vx,
        laneY: lane.y,
      });
    }
  }

  private createHUD(): void {
    this.hypothermiaVignette = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(95);

    this.hudGraphics = this.add.graphics().setScrollFactor(0).setDepth(100);

    this.hudDistanceText = this.add
      .text(0, 0, '', {
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hudTempText = this.add
      .text(0, 0, '', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fb923c',
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hudWarmthLabel = this.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(102);

    this.hudStaminaLabel = this.add
      .text(0, 0, '', {
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(102);

    this.hudStatusText = this.add
      .text(0, 0, '', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#7dd3fc',
      })
      .setScrollFactor(0)
      .setDepth(101);

    this.hudHintText = this.add
      .text(
        0,
        0,
        'WASD / Arrows: Walk & Swim   •   SPACE: Lunge to Catch Seals / Dash   •   Rest on ice to recover Warmth',
        {
          fontSize: '12px',
          color: '#cbd5e1',
          backgroundColor: 'rgba(6, 16, 26, 0.78)',
          padding: { x: 14, y: 7 },
        }
      )
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(101);

    this.layoutHUD();
  }

  private layoutHUD(): void {
    const { width, height } = this.scale;
    this.hudDistanceText.setPosition(28, 22);
    this.hudTempText.setPosition(28, 44);
    this.hudWarmthLabel.setPosition(36, 73);
    this.hudStaminaLabel.setPosition(36, 101);
    this.hudStatusText.setPosition(28, 128);
    this.hudHintText.setPosition(width / 2, height - 16);
  }

  update(_time: number, deltaMs: number): void {
    if (this.gameEnded) return;

    const dt = Math.min(deltaMs / 1000, 0.05);

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
    for (let i = this.floes.length - 1; i >= 0; i--) {
      const floe = this.floes[i];
      if (floe.isSanctuary) continue;

      // Drift horizontally
      floe.container.x += floe.vx * dt;
      if (floe.container.x < floe.minX || floe.container.x > floe.maxX) {
        floe.vx *= -1;
      }

      // Passive thermal melt + extra melt if bear is standing on it
      const bearOnThis = this.currentFloe?.id === floe.id;
      const meltDelta =
        (floe.meltRate + (bearOnThis ? floe.weightMeltRate : 0)) * dt;
      floe.currentScale = Math.max(0.18, floe.currentScale - meltDelta);
      floe.container.setScale(floe.currentScale);

      // Progressive visible cracking
      const targetCrackStage =
        floe.currentScale < 0.42
          ? 3
          : floe.currentScale < 0.65
          ? 2
          : floe.currentScale < 0.85
          ? 1
          : 0;

      if (targetCrackStage !== floe.crackStage) {
        floe.crackStage = targetCrackStage;
        this.drawFloeCracks(floe, targetCrackStage);
      }

      // Collapse floe when too small
      if (floe.currentScale <= 0.22) {
        this.spawnSplashRing(floe.container.x, floe.container.y, 1.4);
        floe.container.destroy();
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

    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      const lungeSpeed = this.isOnIce ? 390 : 265;
      this.bearVx = this.lungeDirX * lungeSpeed;
      this.bearVy = this.lungeDirY * lungeSpeed;
      this.bear.setTexture('bear_lunge');
    } else {
      const baseSpeed = this.isOnIce
        ? 195
        : this.stamina > 5
        ? 128
        : 78; // Slows down when exhausted in water
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
      this.WORLD_HEIGHT - 60
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
      // Recover warmth and stamina on solid ice
      this.warmth = Math.min(100, this.warmth + 15 * dt);
      this.stamina = Math.min(100, this.stamina + 24 * dt);
    } else {
      // Draining stamina while swimming
      if (isMoving) {
        this.stamina = Math.max(0, this.stamina - 6.8 * dt);
      } else {
        this.stamina = Math.max(0, this.stamina - 2.5 * dt);
      }

      // Freezing open water drains Body Warmth (faster if Stamina is 0)
      const coldDrain = this.stamina <= 1 ? 13.5 : 5.8;
      this.warmth = Math.max(0, this.warmth - coldDrain * dt);
    }
  }

  private updateSeals(dt: number): void {
    for (const seal of this.seals) {
      if (seal.state !== 'resting') continue;

      // If the seal's floe collapsed, the seal swims away
      if (seal.floe.currentScale <= 0.25) {
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

      // Catch condition: Bear is within 46px (or 62px while lunging!)
      const catchRadius = this.lungeTimer > 0 ? 64 : 44;
      if (dist <= catchRadius) {
        seal.state = 'caught';
        seal.sprite.setVisible(false);
        seal.alertText.setVisible(false);
        this.sealsCaught++;
        this.warmth = Math.min(100, this.warmth + 38);
        this.stamina = Math.min(100, this.stamina + 48);
        this.spawnFloatingText(
          seal.sprite.x,
          seal.sprite.y,
          '+WARMTH & STAMINA!',
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
          this.spawnFloatingText(
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
    for (const ship of this.ships) {
      ship.sprite.x += ship.vx * dt;
      if (ship.vx > 0 && ship.sprite.x > this.WORLD_WIDTH + 160) {
        ship.sprite.x = -160;
      } else if (ship.vx < 0 && ship.sprite.x < -160) {
        ship.sprite.x = this.WORLD_WIDTH + 160;
      }

      // Draw V-shaped wake behind the vessel
      ship.wakeGraphics.clear();
      ship.wakeGraphics.lineStyle(2, 0x94a3b8, 0.35);
      const dir = ship.vx > 0 ? -1 : 1;
      const sternX = ship.sprite.x + dir * 65;
      ship.wakeGraphics.lineBetween(
        sternX,
        ship.laneY,
        sternX + dir * 180,
        ship.laneY - 42
      );
      ship.wakeGraphics.lineBetween(
        sternX,
        ship.laneY,
        sternX + dir * 180,
        ship.laneY + 42
      );

      // Push bear back & drain warmth if hit by vessel or heavy wake
      const dist = Phaser.Math.Distance.Between(
        this.bearX,
        this.bearY,
        ship.sprite.x,
        ship.laneY
      );
      if (dist < 78) {
        this.bearX += ship.vx * dt * 1.6;
        this.bearY += (this.bearY < ship.laneY ? -1 : 1) * 90 * dt;
        this.warmth = Math.max(0, this.warmth - 18 * dt);
      }
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

  private spawnFloatingText(
    x: number,
    y: number,
    msg: string,
    color: string
  ): void {
    const txt = this.add
      .text(x, y - 16, msg, {
        fontSize: '13px',
        fontStyle: 'bold',
        color,
        stroke: '#041019',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.tweens.add({
      targets: txt,
      y: y - 54,
      alpha: 0,
      duration: 1200,
      onComplete: () => txt.destroy(),
    });
  }

  private checkWinLoss(): void {
    // Win: Reached the Northern Sanctuary near the Cub
    if (this.bearY <= this.SANCTUARY_Y + 75 && this.isOnIce) {
      this.gameEnded = true;
      this.triggerImpactOverlay(true);
      return;
    }

    // Loss: Hypothermia (Warmth hit 0)
    if (this.warmth <= 0) {
      this.gameEnded = true;
      this.triggerImpactOverlay(false);
    }
  }

  private triggerImpactOverlay(won: boolean): void {
    const metersNorth = Math.min(
      1000,
      Math.max(
        0,
        Math.round(
          ((this.START_Y - this.bearY) / (this.START_Y - this.SANCTUARY_Y)) *
            1000
        )
      )
    );

    const openOverlay = (window as unknown as {
      showPolarBearImpactModal?: (payload: {
        won: boolean;
        metersNorth: number;
        swimMeters: number;
        sealsCaught: number;
        floesCollapsed: number;
      }) => void;
    }).showPolarBearImpactModal;

    if (openOverlay) {
      openOverlay({
        won,
        metersNorth: won ? 1000 : metersNorth,
        swimMeters: Math.round(this.totalSwimMeters),
        sealsCaught: this.sealsCaught,
        floesCollapsed: this.floesCollapsed,
      });
    }
  }

  private renderHUD(): void {
    const { width, height } = this.scale;
    this.hudGraphics.clear();

    // HUD Panel Box
    this.hudGraphics.fillStyle(0x06121e, 0.86);
    this.hudGraphics.fillRoundedRect(16, 12, 310, 142, 10);
    this.hudGraphics.lineStyle(1, 0x38bdf8, 0.3);
    this.hudGraphics.strokeRoundedRect(16, 12, 310, 142, 10);

    const metersRemaining = Math.max(
      0,
      Math.round(
        ((this.bearY - this.SANCTUARY_Y) / (this.START_Y - this.SANCTUARY_Y)) *
          1000
      )
    );

    this.hudDistanceText.setText(
      `▲ ${metersRemaining}m North to Pack Ice & Cub`
    );

    // Arctic Temperature Anomaly rises slightly as time passes
    const anomaly = (2.6 + (1000 - metersRemaining) * 0.0009).toFixed(1);
    this.hudTempText.setText(`Arctic Temp Anomaly: +${anomaly}°C (Rapid Melt)`);

    // 1. Body Warmth Bar
    this.drawMeterBar(
      28,
      72,
      284,
      16,
      this.warmth / 100,
      this.warmth < 30 ? 0xef4444 : 0xea580c
    );
    this.hudWarmthLabel.setText(`BODY WARMTH: ${Math.round(this.warmth)}%`);

    // 2. Swim Stamina Bar
    this.drawMeterBar(
      28,
      100,
      284,
      16,
      this.stamina / 100,
      0x0284c7
    );
    this.hudStaminaLabel.setText(`SWIM STAMINA: ${Math.round(this.stamina)}%`);

    // Surface / Ice stability status
    if (this.isOnIce && this.currentFloe) {
      const stability = Math.round(this.currentFloe.currentScale * 100);
      this.hudStatusText.setColor(stability < 45 ? '#fbbf24' : '#34d399');
      this.hudStatusText.setText(
        this.currentFloe.isSanctuary
          ? '● ON PERMANENT PACK ICE — SAFE'
          : `● ON ICE FLOE (${stability}% integrity — melting beneath you)`
      );
    } else {
      this.hudStatusText.setColor('#f87171');
      this.hudStatusText.setText(
        '≈ SWIMMING IN FREEZING WATER — Find ice to warm up!'
      );
    }

    // Low-warmth frost danger vignette
    this.hypothermiaVignette.clear();
    if (this.warmth < 40) {
      const dangerAlpha = ((40 - this.warmth) / 40) * 0.45;
      this.hypothermiaVignette.lineStyle(24, 0xef4444, dangerAlpha);
      this.hypothermiaVignette.strokeRect(0, 0, width, height);
    }
  }

  private drawMeterBar(
    x: number,
    y: number,
    w: number,
    h: number,
    pct: number,
    fillColor: number
  ): void {
    this.hudGraphics.fillStyle(0x0f172a, 0.95);
    this.hudGraphics.fillRoundedRect(x, y, w, h, 4);

    if (pct > 0) {
      this.hudGraphics.fillStyle(fillColor, 0.95);
      this.hudGraphics.fillRoundedRect(
        x + 2,
        y + 2,
        Math.max(6, (w - 4) * Phaser.Math.Clamp(pct, 0, 1)),
        h - 4,
        3
      );
    }
  }
}
