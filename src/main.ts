import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HubScene } from './scenes/HubScene';
import {
  PolarBearScene,
  PolarBearSceneData,
} from './scenes/PolarBearScene';
import { POLAR_BEAR_ASSETS } from './config/AssetManifest';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#06101a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight - 52,
  },
  scene: [BootScene, PolarBearScene, HubScene],
};

const game = new Phaser.Game(config);

// Global Infinite Mode option state
const winState = window as unknown as {
  wildSpacesInfiniteMode: boolean;
  showPolarBearImpactModal: (payload: {
    won: boolean;
    level: number;
    levelTargetMeters: number;
    metersInLevel: number;
    totalMetersMigrated: number;
    nextLevelMeters: number;
    swimMeters: number;
    sealsCaught: number;
    floesCollapsed: number;
    nextLevelData: PolarBearSceneData;
  }) => void;
};
winState.wildSpacesInfiniteMode = false;

// Wire up HTML UI & Conservation Modals
const impactModal = document.getElementById('impact-modal')!;
const infoModal = document.getElementById('info-modal')!;
const btnInfiniteToggle = document.getElementById('btn-infinite-toggle')!;
const btnNextLevel = document.getElementById('btn-impact-next-level')!;

let pendingNextLevelData: PolarBearSceneData | null = null;

function syncInfiniteButtonUI(): void {
  if (winState.wildSpacesInfiniteMode) {
    btnInfiniteToggle.textContent = '∞ Infinite Mode: ON';
    btnInfiniteToggle.classList.add('btn-infinite-active');
  } else {
    btnInfiniteToggle.textContent = '∞ Infinite Mode: OFF';
    btnInfiniteToggle.classList.remove('btn-infinite-active');
  }
}

btnInfiniteToggle.addEventListener('click', () => {
  winState.wildSpacesInfiniteMode = !winState.wildSpacesInfiniteMode;
  syncInfiniteButtonUI();
});

// Expose impact modal hook for PolarBearScene
winState.showPolarBearImpactModal = (payload) => {
  const tag = document.getElementById('impact-tag')!;
  const title = document.getElementById('impact-title')!;
  const summary = document.getElementById('impact-summary')!;
  const statDist = document.getElementById('stat-distance')!;
  const statDistLabel = document.getElementById('stat-distance-label')!;
  const statSwum = document.getElementById('stat-swum')!;
  const statSeals = document.getElementById('stat-seals')!;

  pendingNextLevelData = payload.won ? payload.nextLevelData : null;

  if (payload.won) {
    tag.className = 'modal-tag success';
    tag.textContent = `Level ${payload.level} Complete • Sanctuary Reached`;
    title.textContent = 'You Reached the Northern Pack Ice';
    summary.textContent = `You navigated ${payload.levelTargetMeters}m north and reunited with your cub (${payload.floesCollapsed} ice patches shattered along the way). Continue north into Level ${
      payload.level + 1
    } (${payload.nextLevelMeters}m) where ice patches and seals grow even scarcer!`;
    btnNextLevel.style.display = 'inline-flex';
    btnNextLevel.textContent = `Continue North (Level ${payload.level + 1} • ${payload.nextLevelMeters}m →)`;
  } else {
    tag.className = 'modal-tag danger';
    tag.textContent = `Stranded on Level ${payload.level}`;
    title.textContent = 'Exhausted by Shrinking Ice';
    summary.textContent = `You reached Level ${payload.level} (${payload.metersInLevel}m / ${payload.levelTargetMeters}m in this level, ${payload.totalMetersMigrated}m total) before your stamina gave out in open water.`;
    btnNextLevel.style.display = 'none';
  }

  statDist.textContent = `${payload.totalMetersMigrated}m`;
  statDistLabel.textContent = `Total Distance (Lvl ${payload.level})`;
  statSwum.textContent = `${payload.swimMeters}m`;
  statSeals.textContent = `${payload.sealsCaught}`;

  impactModal.classList.add('active');
};

// Impact modal buttons
document.getElementById('btn-impact-retry')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  game.scene.stop('HubScene');
  game.scene.start('PolarBearScene', { level: 1 });
});

btnNextLevel.addEventListener('click', () => {
  impactModal.classList.remove('active');
  winState.wildSpacesInfiniteMode = true;
  syncInfiniteButtonUI();
  game.scene.stop('HubScene');
  game.scene.start(
    'PolarBearScene',
    pendingNextLevelData ?? { level: 2 }
  );
});

document.getElementById('btn-impact-hub')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  game.scene.stop('PolarBearScene');
  game.scene.start('HubScene');
});

// Topbar: Switch to World Habitat Map
document.getElementById('btn-hub')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  infoModal.classList.remove('active');
  if (game.scene.isActive('HubScene')) {
    game.scene.stop('HubScene');
    game.scene.start('PolarBearScene');
  } else {
    game.scene.stop('PolarBearScene');
    game.scene.start('HubScene');
  }
});

// Topbar: Artist Asset Spec Modal
document.getElementById('btn-artist-spec')?.addEventListener('click', () => {
  const tag = document.getElementById('info-tag')!;
  const title = document.getElementById('info-title')!;
  const body = document.getElementById('info-body')!;

  tag.className = 'modal-tag';
  tag.textContent = 'Artist Commission Brief (Episode 1)';
  title.textContent = 'Plug-and-Play Sprite Specification';

  const rows = POLAR_BEAR_ASSETS.map(
    (a) =>
      `<li style="margin-bottom: 10px;">
        <strong style="color:#7dd3fc;">${a.key}</strong> (${a.dimensions}, ${a.frames} frame${
        a.frames > 1 ? 's' : ''
      })<br/>
        <span style="color:#cbd5e1;">${a.description}</span><br/>
        <code style="font-size:11px; color:#94a3b8;">Path: public${a.filePath}</code>
      </li>`
  ).join('');

  body.innerHTML = `
    <p style="margin-bottom: 12px;">
      This prototype currently renders procedural vector-style textures in <code>BootScene.ts</code>.
      When commissioning a 2D artist (via <strong>r/gameDevClassifieds</strong>, <strong>Cara</strong>, or <strong>Itch.io</strong>),
      you can hand them this exact list and drop their PNGs into <code>public/assets/polar-bear/</code>:
    </p>
    <ul style="padding-left: 18px; margin-bottom: 12px;">${rows}</ul>
    <p style="font-size: 12px; color: #94a3b8;">
      Flip <code>useExternalFile: true</code> in <code>src/config/AssetManifest.ts</code> to hot-swap any asset.
    </p>
  `;

  infoModal.classList.add('active');
});

// Topbar: Charity / WWF Integration Guide & Direct Link
document.getElementById('btn-charity')?.addEventListener('click', () => {
  const tag = document.getElementById('info-tag')!;
  const title = document.getElementById('info-title')!;
  const body = document.getElementById('info-body')!;

  tag.className = 'modal-tag success';
  tag.textContent = 'World Wildlife Fund & Conservation';
  title.textContent = 'Protect Real Wild Spaces';

  body.innerHTML = `
    <p style="margin-bottom: 14px;">
      Every mini-game in <strong>Wild Spaces</strong> highlights a real-world conservation crisis where human activity is shrinking critical wildlife habitats.
    </p>
    <div class="fact-callout" style="margin-bottom: 16px;">
      <h4>Direct Charity Integration (Zero Middleman)</h4>
      <p>
        For production launch on your custom domain, embed a <strong>Tiltify</strong> or <strong>Every.org Charity API</strong> widget here so 100% of player donations go directly to the <strong>World Wildlife Fund (WWF)</strong> or <strong>Polar Bears International</strong> with automatic tax receipts and a live community fundraising progress bar.
      </p>
    </div>
    <p>
      <a class="btn btn-donate" href="https://protect.worldwildlife.org/" target="_blank" rel="noopener noreferrer">
        Visit World Wildlife Fund (WWF) Donation Page ↗
      </a>
    </p>
  `;

  infoModal.classList.add('active');
});

document.getElementById('btn-info-close')?.addEventListener('click', () => {
  infoModal.classList.remove('active');
});
