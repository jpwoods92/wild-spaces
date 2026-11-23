import Phaser from 'phaser';
import { globalPauseManager } from '../systems/PauseManager';
import { clearActiveSession } from '../utils/SessionStore';
import {
  computeCardPopoverPosition,
  computeMapBounds,
  MapBounds,
  MAP_MAX_LON,
  MAP_MIN_LON,
  projectLonLat,
  WORLD_LANDMASSES,
} from '../utils/WorldMapData';

interface EpisodeCard {
  id: string;
  code: string;
  shortLabel: string;
  region: string;
  title: string;
  species: string;
  scientificName: string;
  status: string;
  mechanicSummary: string;
  playable: boolean;
  accentColor: number;
  accentHex: string;
  lon: number;
  lat: number;
  tagOffsetX: number;
  tagOffsetY: number;
}

interface MapPin {
  ep: EpisodeCard;
  x: number;
  y: number;
  container: Phaser.GameObjects.Container;
}

const EPISODES: EpisodeCard[] = [
  {
    id: 'PolarBearScene',
    code: '01',
    shortLabel: 'ARCTIC',
    region: 'BEAUFORT SEA, ARCTIC',
    title: '01 • The Thinning North',
    species: 'Polar Bear',
    scientificName: 'Ursus maritimus',
    status: 'VULNERABLE — 13% sea-ice loss/decade',
    mechanicSummary:
      'Migrate 1,000m north to permanent pack ice & your cub. Ice floes crack and shrink beneath you; hunt seals to keep warmth & stamina up across open water.',
    playable: true,
    accentColor: 0x38bdf8,
    accentHex: '#38bdf8',
    lon: -142,
    lat: 71.5,
    tagOffsetX: 0,
    tagOffsetY: 25,
  },
  {
    id: 'WhaleScene',
    code: '02',
    shortLabel: 'N. ATLANTIC',
    region: 'NORTH ATLANTIC OCEAN',
    title: '02 • Drowned Echoes',
    species: 'North Atlantic Right Whale',
    scientificName: 'Eubalaena glacialis',
    status: 'CRITICALLY ENDANGERED — <360 remaining',
    mechanicSummary:
      'Press SPACE to sing and follow your calf’s echo through dark water. Commercial shipping lanes, ghost fishing gear & seismic sonar flood the sea with blinding noise.',
    playable: true,
    accentColor: 0x818cf8,
    accentHex: '#818cf8',
    lon: -66.5,
    lat: 42.5,
    tagOffsetX: 46,
    tagOffsetY: -12,
  },
  {
    id: 'LemurScene',
    code: '03',
    shortLabel: 'MADAGASCAR',
    region: 'SPINY FOREST, MADAGASCAR',
    title: '03 • Fractured Canopy',
    species: 'Ring-Tailed Lemur',
    scientificName: 'Lemur catta',
    status: 'ENDANGERED — >80% habitat fragmented',
    mechanicSummary:
      'Hold SPACE to aim and charge long canopy leaps from crown to crown while an advancing slash-and-burn fire wall sweeps northward behind you.',
    playable: true,
    accentColor: 0x34d399,
    accentHex: '#34d399',
    lon: 45.2,
    lat: -24.2,
    tagOffsetX: 0,
    tagOffsetY: 25,
  },
  {
    id: 'TurtleScene',
    code: '04',
    shortLabel: 'FLORIDA COAST',
    region: 'ATLANTIC NESTING BEACH',
    title: '04 • False Horizon',
    species: 'Loggerhead Sea Turtle',
    scientificName: 'Caretta caretta',
    status: 'VULNERABLE: 1 in 1,000 reach adulthood',
    mechanicSummary:
      'Crawl from your dune nest to the moonlit surf. Hold SPACE to burrow, hide, and recover stamina while avoiding crabs, birds, and blinding spotlights.',
    playable: true,
    accentColor: 0xf59e0b,
    accentHex: '#f59e0b',
    lon: -80.2,
    lat: 27.5,
    tagOffsetX: -36,
    tagOffsetY: 25,
  },
];

export class HubScene extends Phaser.Scene {
  private mapBounds!: MapBounds;
  private pins: MapPin[] = [];
  private hoveredEpisodeId: string | null = null;
  private pulsePhase = 0;

  private pulseGraphics!: Phaser.GameObjects.Graphics;
  private connectorGraphics!: Phaser.GameObjects.Graphics;
  private popoverContainer!: Phaser.GameObjects.Container;
  private hideTimer?: Phaser.Time.TimerEvent;
  private resizeTimer?: Phaser.Time.TimerEvent;

  private onResize = (): void => {
    this.resizeTimer?.remove(false);
    this.resizeTimer = this.time.delayedCall(60, () => {
      if (this.scene.isActive('HubScene')) {
        this.scene.restart();
      }
    });
  };

  constructor() {
    super({ key: 'HubScene' });
  }

  create(): void {
    globalPauseManager.detachScene();
    clearActiveSession();

    this.pins = [];
    this.hoveredEpisodeId = null;
    this.pulsePhase = 0;
    this.hideTimer = undefined;
    this.resizeTimer = undefined;

    const subtitleEl = document.querySelector('.brand-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent =
        'Global Habitat Crisis Map — Hover a Pin to Explore an Episode';
    }

    const { width, height } = this.scale;

    // 1. Deep atmospheric ocean backdrop
    const bg = this.add.graphics().setDepth(-10);
    bg.fillGradientStyle(0x040d17, 0x040d17, 0x0b2239, 0x081a2c, 1);
    bg.fillRect(0, 0, width, height);

    // 2. Centered Hub Header
    this.add
      .text(width / 2, 26, 'GLOBAL HABITAT CRISIS MAP', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#38bdf8',
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 56, 'Choose a Solitary Survival Story', {
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        88,
        'Hover a habitat pin to inspect an episode  •  Click any pin or card to play',
        {
          fontSize: '13px',
          color: '#94a3b8',
        }
      )
      .setOrigin(0.5);

    // 3. Simplified Vector World Map
    this.mapBounds = computeMapBounds(width, height, 116, 54, 32);
    this.drawWorldMap(this.mapBounds);

    // 4. Radar Pulse, Connector & Floating Popover Layers
    this.pulseGraphics = this.add.graphics().setDepth(15);
    this.connectorGraphics = this.add.graphics().setDepth(35);
    this.popoverContainer = this.add
      .container(0, 0)
      .setDepth(40)
      .setVisible(false);

    // 5. Location Pins & Bottom Legend Strip
    for (const ep of EPISODES) {
      const pos = projectLonLat(ep.lon, ep.lat, this.mapBounds);
      this.createLocationPin(ep, pos.x, pos.y);
    }
    this.createLegendStrip(width, height);

    // 6. Responsive Resize Cleanup
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize);
      this.hideTimer?.remove(false);
      this.resizeTimer?.remove(false);
    });
  }

  private drawWorldMap(bounds: MapBounds): void {
    const g = this.add.graphics().setDepth(2);

    // Map ocean container fill & subtle drop border
    g.fillGradientStyle(0x051424, 0x051424, 0x0a2540, 0x081e36, 0.96);
    g.fillRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 14);
    g.lineStyle(1.5, 0x38bdf8, 0.28);
    g.strokeRoundedRect(bounds.x, bounds.y, bounds.width, bounds.height, 14);

    // Subtle high-latitude Arctic pack-ice shimmer (lat 74°..82°)
    const iceTopLeft = projectLonLat(MAP_MIN_LON, 82, bounds);
    const iceBottomRight = projectLonLat(MAP_MAX_LON, 74, bounds);
    g.fillStyle(0xbae6fd, 0.06);
    g.fillRoundedRect(
      iceTopLeft.x + 2,
      iceTopLeft.y + 2,
      iceBottomRight.x - iceTopLeft.x - 4,
      iceBottomRight.y - iceTopLeft.y,
      10
    );

    // Longitude graticule every 30° & Latitude graticule every 20°
    g.lineStyle(1, 0x38bdf8, 0.08);
    for (let lon = -150; lon <= 150; lon += 30) {
      const top = projectLonLat(lon, 82, bounds);
      const bottom = projectLonLat(lon, -60, bounds);
      g.lineBetween(top.x, top.y, bottom.x, bottom.y);
    }
    for (let lat = -40; lat <= 80; lat += 20) {
      const left = projectLonLat(-180, lat, bounds);
      const right = projectLonLat(180, lat, bounds);
      g.lineBetween(left.x, left.y, right.x, right.y);
    }

    // Dashed special parallels: Arctic Circle (66.5°N), Equator (0°), Tropic of Capricorn (-23.5°S)
    const parallels: Array<{ lat: number; label: string; color: number }> = [
      { lat: 66.5, label: '66°N', color: 0x7dd3fc },
      { lat: 0, label: '0°', color: 0x94a3b8 },
      { lat: -23.5, label: '23°S', color: 0xfbbf24 },
    ];
    for (const p of parallels) {
      const left = projectLonLat(-180, p.lat, bounds);
      const right = projectLonLat(180, p.lat, bounds);
      g.lineStyle(1, p.color, 0.16);
      for (let x = left.x + 8; x < right.x - 8; x += 14) {
        g.lineBetween(x, left.y, Math.min(right.x - 8, x + 7), left.y);
      }
      this.add
        .text(left.x + 8, left.y - 3, p.label, {
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#64748b',
        })
        .setOrigin(0, 1)
        .setDepth(3);
    }

    // Simplified vector landmasses (shelf glow + dark land fill + shoreline stroke)
    for (const land of WORLD_LANDMASSES) {
      const pts = land.points.map(([lon, lat]) =>
        projectLonLat(lon, lat, bounds)
      );
      g.lineStyle(5, 0x0ea5e9, 0.11);
      g.strokePoints(pts, true);

      g.fillStyle(0x132c41, 0.95);
      g.fillPoints(pts, true);

      g.lineStyle(1.2, 0x38bdf8, 0.38);
      g.strokePoints(pts, true);
    }
  }

  private createLocationPin(ep: EpisodeCard, pinX: number, pinY: number): void {
    const container = this.add.container(pinX, pinY).setDepth(20);

    const marker = this.add.graphics();
    // Drop shadow
    marker.fillStyle(0x020617, 0.55);
    marker.fillCircle(0, 2, 16);
    // Pointer tail
    marker.fillStyle(ep.accentColor, 1);
    marker.fillTriangle(-5, 10, 5, 10, 0, 18);
    // Colored badge outer ring
    marker.fillStyle(ep.accentColor, 1);
    marker.fillCircle(0, 0, 13.5);
    // Dark inner disk
    marker.fillStyle(0x06121e, 1);
    marker.fillCircle(0, 0, 10);

    const codeText = this.add
      .text(0, 0, ep.code, {
        fontSize: '10px',
        fontStyle: 'bold',
        color: ep.accentHex,
      })
      .setOrigin(0.5);

    const tagText = this.add
      .text(ep.tagOffsetX, ep.tagOffsetY, ep.shortLabel, {
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#e2e8f0',
        backgroundColor: 'rgba(4, 13, 23, 0.86)',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5);

    container.add([marker, codeText, tagText]);

    const hitZone = this.add
      .zone(pinX, pinY, 52, 52)
      .setDepth(25)
      .setInteractive({
        hitArea: new Phaser.Geom.Circle(26, 26, 26),
        hitAreaCallback: Phaser.Geom.Circle.Contains,
        useHandCursor: ep.playable,
      });

    hitZone.on('pointerover', () => {
      this.cancelHidePopover();
      this.showEpisodePopover(ep, pinX, pinY);
    });
    hitZone.on('pointerout', () => {
      this.scheduleHidePopover();
    });
    hitZone.on('pointerdown', () => {
      if (ep.playable) {
        this.scene.start(ep.id);
      }
    });

    this.pins.push({ ep, x: pinX, y: pinY, container });
  }

  private createLegendStrip(viewportW: number, viewportH: number): void {
    const legendY = Math.min(
      viewportH - 24,
      this.mapBounds.y + this.mapBounds.height + 26
    );
    const gap = 12;
    const pillW = Math.min(188, (viewportW - 64 - gap * 3) / 4);
    const pillH = 28;
    const totalW = pillW * EPISODES.length + gap * (EPISODES.length - 1);
    const startX = (viewportW - totalW) / 2 + pillW / 2;

    EPISODES.forEach((ep, idx) => {
      const px = startX + idx * (pillW + gap);
      const pill = this.add.container(px, legendY).setDepth(18);
      const bg = this.add.graphics();
      const drawPill = (hover: boolean) => {
        bg.clear();
        bg.fillStyle(hover ? 0x112a45 : 0x081726, 0.92);
        bg.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 14);
        bg.lineStyle(1, ep.accentColor, hover ? 0.9 : 0.4);
        bg.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 14);
        bg.fillStyle(ep.accentColor, 1);
        bg.fillCircle(-pillW / 2 + 14, 0, 4);
      };
      drawPill(false);

      const label = this.add
        .text(6, 0, `${ep.code} • ${ep.shortLabel}`, {
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#e2e8f0',
        })
        .setOrigin(0.5);

      pill.add([bg, label]);

      const zone = this.add
        .zone(px, legendY, pillW, pillH)
        .setDepth(19)
        .setInteractive({ useHandCursor: ep.playable });

      zone.on('pointerover', () => {
        drawPill(true);
        const pin = this.pins.find((p) => p.ep.id === ep.id);
        if (pin) {
          this.cancelHidePopover();
          this.showEpisodePopover(ep, pin.x, pin.y);
        }
      });
      zone.on('pointerout', () => {
        drawPill(false);
        this.scheduleHidePopover();
      });
      zone.on('pointerdown', () => {
        if (ep.playable) {
          this.scene.start(ep.id);
        }
      });
    });
  }

  private cancelHidePopover(): void {
    this.hideTimer?.remove(false);
    this.hideTimer = undefined;
  }

  private scheduleHidePopover(): void {
    this.cancelHidePopover();
    this.hideTimer = this.time.delayedCall(190, () => {
      this.hideEpisodePopover();
    });
  }

  private hideEpisodePopover(): void {
    this.hoveredEpisodeId = null;
    this.connectorGraphics.clear();
    this.popoverContainer.setVisible(false);
    this.popoverContainer.removeAll(true);
  }

  private showEpisodePopover(
    ep: EpisodeCard,
    pinX: number,
    pinY: number
  ): void {
    const isSameEpisode =
      this.hoveredEpisodeId === ep.id && this.popoverContainer.visible;
    this.hoveredEpisodeId = ep.id;
    if (isSameEpisode) return;

    this.tweens.killTweensOf(this.popoverContainer);
    this.popoverContainer.removeAll(true);

    const { width: viewportW, height: viewportH } = this.scale;
    const cardW = Math.min(315, viewportW - 36);
    const padX = 20;
    const contentW = cardW - padX * 2;
    let curY = 18;

    const titleText = this.add.text(padX, curY, ep.title, {
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#ffffff',
      wordWrap: { width: contentW },
    });
    curY += titleText.height + 6;

    const regionText = this.add.text(padX, curY, ep.region, {
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#7dd3fc',
      wordWrap: { width: contentW },
    });
    curY += regionText.height + 6;

    const speciesText = this.add.text(padX, curY, ep.species, {
      fontSize: '13px',
      color: '#cbd5e1',
      wordWrap: { width: contentW },
    });
    curY += speciesText.height + 2;

    const scientificText = this.add.text(padX, curY, ep.scientificName, {
      fontSize: '12px',
      fontStyle: 'italic',
      color: '#94a3b8',
      wordWrap: { width: contentW },
    });
    curY += scientificText.height + 8;

    const statusBadge = this.add.text(padX, curY, ep.status, {
      fontSize: '10px',
      fontStyle: 'bold',
      color: ep.playable ? '#fbbf24' : '#f87171',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 8, y: 4 },
      wordWrap: { width: contentW - 16 },
    });
    curY += statusBadge.height + 10;

    const summaryText = this.add.text(padX, curY, ep.mechanicSummary, {
      fontSize: '12px',
      color: '#94a3b8',
      lineSpacing: 4,
      wordWrap: { width: contentW },
    });
    curY += summaryText.height + 16;

    const btnH = 36;
    const btnY = curY;
    const cardH = btnY + btnH + 18;

    const panel = this.add.graphics();
    const drawCardPanel = (focused: boolean) => {
      panel.clear();
      panel.fillStyle(0x020617, 0.65);
      panel.fillRoundedRect(3, 5, cardW, cardH, 12);
      panel.fillStyle(focused ? 0x102740 : 0x0b1d30, 0.96);
      panel.fillRoundedRect(0, 0, cardW, cardH, 12);
      panel.lineStyle(focused ? 2 : 1.5, ep.accentColor, focused ? 0.95 : 0.72);
      panel.strokeRoundedRect(0, 0, cardW, cardH, 12);
    };
    drawCardPanel(false);

    const btnBg = this.add.graphics();
    btnBg.fillStyle(ep.playable ? ep.accentColor : 0x1e293b, 1);
    btnBg.fillRoundedRect(padX, btnY, contentW, btnH, 8);

    const btnLabel = this.add
      .text(
        cardW / 2,
        btnY + btnH / 2,
        ep.playable
          ? `▶  PLAY EPISODE ${EPISODES.indexOf(ep) + 1}`
          : 'PLANNED FOR EPISODE ' + (EPISODES.indexOf(ep) + 1),
        {
          fontSize: '12px',
          fontStyle: 'bold',
          color: ep.playable ? '#041019' : '#64748b',
        }
      )
      .setOrigin(0.5);

    const cardZone = this.add
      .zone(cardW / 2, cardH / 2, cardW, cardH)
      .setInteractive({ useHandCursor: ep.playable });

    cardZone.on('pointerover', () => {
      this.cancelHidePopover();
      drawCardPanel(true);
    });
    cardZone.on('pointerout', () => {
      drawCardPanel(false);
      this.scheduleHidePopover();
    });
    cardZone.on('pointerdown', () => {
      if (ep.playable) {
        this.scene.start(ep.id);
      }
    });

    this.popoverContainer.add([
      panel,
      titleText,
      regionText,
      speciesText,
      scientificText,
      statusBadge,
      summaryText,
      btnBg,
      btnLabel,
      cardZone,
    ]);

    const pos = computeCardPopoverPosition(
      pinX,
      pinY,
      cardW,
      cardH,
      viewportW,
      viewportH
    );

    this.popoverContainer.setPosition(pos.x, pos.y);
    this.popoverContainer.setAlpha(0);
    this.popoverContainer.setScale(0.96);
    this.popoverContainer.setVisible(true);

    this.tweens.add({
      targets: this.popoverContainer,
      alpha: 1,
      scale: 1,
      duration: 110,
      ease: 'Cubic.easeOut',
    });

    // Leader line from pin to the closest card edge
    const anchorX = pinX <= pos.x + cardW / 2 ? pos.x : pos.x + cardW;
    const anchorY = pos.y + cardH * 0.45;
    this.connectorGraphics.clear();
    this.connectorGraphics.lineStyle(1.5, ep.accentColor, 0.72);
    this.connectorGraphics.lineBetween(pinX, pinY, anchorX, anchorY);
    this.connectorGraphics.fillStyle(ep.accentColor, 0.9);
    this.connectorGraphics.fillCircle(anchorX, anchorY, 3.5);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.pulsePhase += dt * 1.4;

    this.pulseGraphics.clear();
    for (let i = 0; i < this.pins.length; i++) {
      const pin = this.pins[i];
      const isHovered = this.hoveredEpisodeId === pin.ep.id;

      const targetScale = isHovered ? 1.16 : 1.0;
      pin.container.setScale(
        Phaser.Math.Linear(pin.container.scaleX, targetScale, Math.min(1, dt * 14))
      );

      for (let ring = 0; ring < 2; ring++) {
        const wave = (this.pulsePhase + i * 0.27 + ring * 0.5) % 1;
        const maxR = isHovered ? 32 : 23;
        const radius = 12 + wave * (maxR - 12);
        const alpha = (1 - wave) * (isHovered ? 0.72 : 0.4);
        this.pulseGraphics.lineStyle(
          isHovered ? 2 : 1.3,
          pin.ep.accentColor,
          alpha
        );
        this.pulseGraphics.strokeCircle(pin.x, pin.y, radius);
      }
    }
  }
}
