import Phaser from 'phaser';
import { globalPauseManager } from '../systems/PauseManager';
import { clearActiveSession } from '../utils/SessionStore';

interface EpisodeCard {
  id: string;
  region: string;
  title: string;
  species: string;
  status: string;
  mechanicSummary: string;
  playable: boolean;
  accentColor: number;
}

const EPISODES: EpisodeCard[] = [
  {
    id: 'PolarBearScene',
    region: 'BEAUFORT SEA, ARCTIC',
    title: '01 • The Thinning North',
    species: 'Polar Bear (Ursus maritimus)',
    status: 'VULNERABLE — 13% sea-ice loss/decade',
    mechanicSummary:
      'Migrate 1,000m north to permanent pack ice & your cub. Ice floes crack and shrink beneath you; hunt seals to keep warmth & stamina up across open water.',
    playable: true,
    accentColor: 0x38bdf8,
  },
  {
    id: 'WhaleScene',
    region: 'NORTH ATLANTIC OCEAN',
    title: '02 • Drowned Echoes',
    species: 'North Atlantic Right Whale (Eubalaena glacialis)',
    status: 'CRITICALLY ENDANGERED — <360 remaining',
    mechanicSummary:
      'Press SPACE to sing and follow your calf’s echo through dark water. Commercial shipping lanes, ghost fishing gear & seismic sonar flood the sea with blinding noise.',
    playable: true,
    accentColor: 0x818cf8,
  },
  {
    id: 'LemurScene',
    region: 'SPINY FOREST, MADAGASCAR',
    title: '03 • Fractured Canopy',
    species: 'Ring-Tailed Lemur (Lemur catta)',
    status: 'ENDANGERED — >80% habitat fragmented',
    mechanicSummary:
      'Hold SPACE to aim and charge long canopy leaps from crown to crown while an advancing slash-and-burn fire wall sweeps northward behind you.',
    playable: true,
    accentColor: 0x34d399,
  },
  {
    id: 'TurtleScene',
    region: 'ATLANTIC NESTING BEACH',
    title: '04 • False Horizon',
    species: 'Loggerhead Sea Turtle (Caretta caretta)',
    status: 'VULNERABLE: 1 in 1,000 reach adulthood',
    mechanicSummary:
      'Crawl from your dune nest to the moonlit surf. Hold SPACE to burrow under sand as seabirds dive and ghost crabs prowl, while resisting resort light pull and plastic debris.',
    playable: true,
    accentColor: 0xf59e0b,
  },
];

export class HubScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HubScene' });
  }

  create(): void {
    globalPauseManager.detachScene();
    clearActiveSession();

    const subtitleEl = document.querySelector('.brand-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent =
        'Global Habitat Crisis Map — Choose an Episode';
    }

    const { width, height } = this.scale;

    // Deep atmospheric background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x040d17, 0x040d17, 0x0b2239, 0x081a2c, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle latitude/longitude grid lines
    bg.lineStyle(1, 0x38bdf8, 0.08);
    for (let x = 80; x < width; x += 120) {
      bg.lineBetween(x, 0, x, height);
    }
    for (let y = 80; y < height; y += 120) {
      bg.lineBetween(0, y, width, y);
    }

    this.add
      .text(width / 2, 58, 'GLOBAL HABITAT CRISIS MAP', {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#38bdf8',
        letterSpacing: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 92, 'Choose a Solitary Survival Story', {
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        128,
        'Each top-down vignette translates human environmental impact directly into gameplay mechanics.',
        {
          fontSize: '14px',
          color: '#94a3b8',
        }
      )
      .setOrigin(0.5);

    if (width >= 1080) {
      const gap = 18;
      const cardWidth = Math.min(290, (width - 96 - gap * 3) / 4);
      const cardHeight = Math.min(385, Math.max(325, height - 190));
      const totalW = cardWidth * 4 + gap * 3;
      const startX = (width - totalW) / 2 + cardWidth / 2;
      const cardY = Math.max(156 + cardHeight / 2, height / 2 + 28);

      EPISODES.forEach((ep, idx) => {
        const cx = startX + idx * (cardWidth + gap);
        this.createEpisodeCard(cx, cardY, cardWidth, cardHeight, ep);
      });
    } else {
      const gapX = 20;
      const gapY = 18;
      const cardWidth = Math.min(340, (width - 72) / 2);
      const cardHeight = Math.min(
        275,
        Math.max(220, Math.floor((height - 195) / 2))
      );
      const totalW = cardWidth * 2 + gapX;
      const totalH = cardHeight * 2 + gapY;
      const startX = (width - totalW) / 2 + cardWidth / 2;
      const startY =
        Math.max(156, (height + 140 - totalH) / 2) + cardHeight / 2;

      EPISODES.forEach((ep, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cx = startX + col * (cardWidth + gapX);
        const cy = startY + row * (cardHeight + gapY);
        this.createEpisodeCard(cx, cy, cardWidth, cardHeight, ep);
      });
    }
  }

  private createEpisodeCard(
    x: number,
    y: number,
    w: number,
    h: number,
    ep: EpisodeCard
  ): void {
    const container = this.add.container(x, y);
    const compactW = w < 300;
    const compactH = h < 300;
    const padX = compactW ? 16 : 22;
    const contentW = w - padX * 2;
    let curY = -h / 2 + (compactH ? 14 : 20);

    const panel = this.add.graphics();
    const drawCard = (hover: boolean) => {
      panel.clear();
      panel.fillStyle(hover ? 0x112a45 : 0x0b1d30, 0.92);
      panel.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      panel.lineStyle(hover ? 2 : 1, ep.accentColor, hover ? 0.9 : 0.35);
      panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    };
    drawCard(false);

    const titleText = this.add.text(-w / 2 + padX, curY, ep.title, {
      fontSize: compactW ? '18px' : '21px',
      fontStyle: 'bold',
      color: '#ffffff',
      wordWrap: { width: contentW },
    });
    curY += titleText.height + (compactH ? 5 : 8);

    const regionText = this.add.text(-w / 2 + padX, curY, ep.region, {
      fontSize: compactW ? '10px' : '11px',
      fontStyle: 'bold',
      color: '#7dd3fc',
      wordWrap: { width: contentW },
    });
    curY += regionText.height + (compactH ? 5 : 7);

    const speciesText = this.add.text(-w / 2 + padX, curY, ep.species, {
      fontSize: compactW || compactH ? '12px' : '13px',
      color: '#cbd5e1',
      wordWrap: { width: contentW },
    });
    curY += speciesText.height + (compactH ? 7 : 10);

    const statusBadge = this.add.text(-w / 2 + padX, curY, ep.status, {
      fontSize: compactW || compactH ? '10px' : '11px',
      fontStyle: 'bold',
      color: ep.playable ? '#fbbf24' : '#f87171',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 8, y: 4 },
      wordWrap: { width: contentW - 16 },
    });
    curY += statusBadge.height + (compactH ? 8 : 12);

    const summaryText = this.add.text(
      -w / 2 + padX,
      curY,
      ep.mechanicSummary,
      {
        fontSize: compactW || compactH ? '12px' : '13px',
        color: '#94a3b8',
        lineSpacing: compactH ? 3 : 5,
        wordWrap: { width: contentW },
      }
    );

    const btnBg = this.add.graphics();
    const btnY = h / 2 - (compactH ? 28 : 38);
    btnBg.fillStyle(ep.playable ? ep.accentColor : 0x1e293b, 1);
    btnBg.fillRoundedRect(-w / 2 + padX, btnY - 18, contentW, 36, 8);

    const btnLabel = this.add
      .text(
        0,
        btnY,
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

    container.add([
      panel,
      titleText,
      regionText,
      speciesText,
      statusBadge,
      summaryText,
      btnBg,
      btnLabel,
    ]);

    const hitZone = this.add
      .zone(x, y, w, h)
      .setInteractive({ useHandCursor: ep.playable });

    hitZone.on('pointerover', () => {
      drawCard(true);
    });
    hitZone.on('pointerout', () => {
      drawCard(false);
    });
    hitZone.on('pointerdown', () => {
      if (ep.playable) {
        this.scene.start(ep.id);
      }
    });
  }
}
