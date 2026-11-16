import Phaser from 'phaser';
import { globalPauseManager } from '../systems/PauseManager';

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
    region: '01 • BEAUFORT SEA, ARCTIC',
    title: 'The Thinning North',
    species: 'Polar Bear (Ursus maritimus)',
    status: 'VULNERABLE — 13% sea-ice loss/decade',
    mechanicSummary:
      'Migrate 1,000m north to permanent pack ice & your cub. Ice floes crack and shrink beneath you; hunt seals to keep warmth & stamina up across open water.',
    playable: true,
    accentColor: 0x38bdf8,
  },
  {
    id: 'WhaleScene',
    region: '02 • NORTH ATLANTIC OCEAN',
    title: 'Drowned Echoes',
    species: 'North Atlantic Right Whale',
    status: 'CRITICALLY ENDANGERED — <360 remaining',
    mechanicSummary:
      'Press SPACE to sing and follow your calf’s echo through dark water. Commercial shipping lanes, ghost fishing gear & seismic sonar flood the sea with blinding noise.',
    playable: true,
    accentColor: 0x818cf8,
  },
  {
    id: 'LemurScene',
    region: '03 • SPINY FOREST, MADAGASCAR',
    title: 'Fractured Canopy',
    species: 'Ring-Tailed Lemur (Lemur catta)',
    status: 'ENDANGERED — >80% habitat fragmented',
    mechanicSummary:
      'Leap rapidly through safe treetops while active logging fells canopy bridges in real time, forcing desperate dashes across predator-patrolled ground.',
    playable: true,
    accentColor: 0x34d399,
  },
];

export class HubScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HubScene' });
  }

  create(): void {
    globalPauseManager.detachScene();
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

    const cardWidth = Math.min(340, (width - 100) / 3);
    const cardHeight = 350;
    const totalW = cardWidth * 3 + 48;
    const startX = (width - totalW) / 2 + cardWidth / 2;
    const cardY = height / 2 + 30;

    EPISODES.forEach((ep, idx) => {
      const cx = startX + idx * (cardWidth + 24);
      this.createEpisodeCard(cx, cardY, cardWidth, cardHeight, ep);
    });
  }

  private createEpisodeCard(
    x: number,
    y: number,
    w: number,
    h: number,
    ep: EpisodeCard
  ): void {
    const container = this.add.container(x, y);

    const panel = this.add.graphics();
    const drawCard = (hover: boolean) => {
      panel.clear();
      panel.fillStyle(hover ? 0x112a45 : 0x0b1d30, 0.92);
      panel.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      panel.lineStyle(hover ? 2 : 1, ep.accentColor, hover ? 0.9 : 0.35);
      panel.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    };
    drawCard(false);

    const regionText = this.add.text(-w / 2 + 22, -h / 2 + 24, ep.region, {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#7dd3fc',
    });

    const titleText = this.add.text(-w / 2 + 22, -h / 2 + 48, ep.title, {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    });

    const speciesText = this.add.text(-w / 2 + 22, -h / 2 + 80, ep.species, {
      fontSize: '13px',
      color: '#cbd5e1',
    });

    const statusBadge = this.add.text(-w / 2 + 22, -h / 2 + 108, ep.status, {
      fontSize: '11px',
      fontStyle: 'bold',
      color: ep.playable ? '#fbbf24' : '#f87171',
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      padding: { x: 8, y: 5 },
    });

    const summaryText = this.add.text(
      -w / 2 + 22,
      -h / 2 + 148,
      ep.mechanicSummary,
      {
        fontSize: '13px',
        color: '#94a3b8',
        lineSpacing: 5,
        wordWrap: { width: w - 44 },
      }
    );

    const btnBg = this.add.graphics();
    const btnY = h / 2 - 42;
    btnBg.fillStyle(ep.playable ? ep.accentColor : 0x1e293b, 1);
    btnBg.fillRoundedRect(-w / 2 + 22, btnY - 18, w - 44, 38, 8);

    const btnLabel = this.add
      .text(
        0,
        btnY + 1,
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
      regionText,
      titleText,
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
