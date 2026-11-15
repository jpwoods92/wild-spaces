import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HubScene } from './scenes/HubScene';
import {
  PolarBearScene,
  PolarBearSceneData,
} from './scenes/PolarBearScene';
import { WhaleScene, WhaleSceneData } from './scenes/WhaleScene';
import { POLAR_BEAR_ASSETS, WHALE_ASSETS } from './config/AssetManifest';

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
  scene: [BootScene, WhaleScene, PolarBearScene, HubScene],
};

const game = new Phaser.Game(config);

// Track which episode is active for modal retry/continue actions
let activeEpisodeKey: 'PolarBearScene' | 'WhaleScene' = 'WhaleScene';
let pendingNextLevelData: PolarBearSceneData | WhaleSceneData | null = null;

// Global Infinite Mode option state
const winState = window as unknown as {
  wildSpacesInfiniteMode: boolean;
  showPolarBearImpactModal: (payload: {
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
    nextLevelData: PolarBearSceneData;
  }) => void;
  showWhaleImpactModal: (payload: {
    won: boolean;
    deathReason?: 'exhaustion' | 'ship';
    level: number;
    levelTargetMeters: number;
    metersInLevel: number;
    totalMetersMigrated: number;
    nextLevelMeters: number;
    bloomsConsumed: number;
    entanglementsHit: number;
    nextLevelData: WhaleSceneData;
  }) => void;
};
winState.wildSpacesInfiniteMode = false;

// Wire up HTML UI & Conservation Modals
const impactModal = document.getElementById('impact-modal')!;
const infoModal = document.getElementById('info-modal')!;
const btnInfiniteToggle = document.getElementById('btn-infinite-toggle')!;
const btnNextLevel = document.getElementById('btn-impact-next-level')!;

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

// Expose impact modal hook for Episode 1 (PolarBearScene)
winState.showPolarBearImpactModal = (payload) => {
  activeEpisodeKey = 'PolarBearScene';
  const tag = document.getElementById('impact-tag')!;
  const title = document.getElementById('impact-title')!;
  const summary = document.getElementById('impact-summary')!;
  const statDist = document.getElementById('stat-distance')!;
  const statDistLabel = document.getElementById('stat-distance-label')!;
  const statSwum = document.getElementById('stat-swum')!;
  const statSwumLabel = document.getElementById('stat-swum-label')!;
  const statSeals = document.getElementById('stat-seals')!;
  const statSealsLabel = document.getElementById('stat-seals-label')!;
  const factHeading = document.getElementById('impact-fact-heading')!;
  const factBody = document.getElementById('impact-fact')!;

  pendingNextLevelData = payload.won ? payload.nextLevelData : null;

  if (payload.won) {
    tag.className = 'modal-tag success';
    tag.textContent = `Episode 1 • Level ${payload.level} Complete`;
    title.textContent = 'You Reached the Northern Pack Ice';
    summary.textContent = `You navigated ${payload.levelTargetMeters}m north and reunited with your cub (${payload.floesCollapsed} ice patches shattered along the way). Continue north into Level ${
      payload.level + 1
    } (${payload.nextLevelMeters}m) where ice patches and seals grow even scarcer!`;
    btnNextLevel.style.display = 'inline-flex';
    btnNextLevel.textContent = `Continue North (Level ${payload.level + 1} • ${payload.nextLevelMeters}m →)`;
  } else if (payload.deathReason === 'ship') {
    tag.className = 'modal-tag danger';
    tag.textContent = `Vessel Strike • Level ${payload.level}`;
    title.textContent = 'Struck by an Industrial Arctic Vessel';
    summary.textContent = `As melting sea ice opens new commercial shipping corridors across the Arctic, vessel traffic has surged—creating lethal open-water crossings for migrating wildlife (${payload.totalMetersMigrated}m total progress).`;
    btnNextLevel.style.display = 'none';
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
  statSwumLabel.textContent = 'Open-Water Swim';
  statSeals.textContent = `${payload.sealsCaught}`;
  statSealsLabel.textContent = 'Seals Caught';

  factHeading.textContent = 'Real-World Arctic Crisis';
  factBody.textContent =
    'Arctic sea ice is shrinking by nearly 13% per decade. As seasonal ice breaks up weeks earlier each spring, polar bears are forced to swim up to 3x farther across freezing open water—burning critical fat reserves needed to nurse their cubs.';

  impactModal.classList.add('active');
};

// Expose impact modal hook for Episode 2 (WhaleScene)
winState.showWhaleImpactModal = (payload) => {
  activeEpisodeKey = 'WhaleScene';
  const tag = document.getElementById('impact-tag')!;
  const title = document.getElementById('impact-title')!;
  const summary = document.getElementById('impact-summary')!;
  const statDist = document.getElementById('stat-distance')!;
  const statDistLabel = document.getElementById('stat-distance-label')!;
  const statSwum = document.getElementById('stat-swum')!;
  const statSwumLabel = document.getElementById('stat-swum-label')!;
  const statSeals = document.getElementById('stat-seals')!;
  const statSealsLabel = document.getElementById('stat-seals-label')!;
  const factHeading = document.getElementById('impact-fact-heading')!;
  const factBody = document.getElementById('impact-fact')!;

  pendingNextLevelData = payload.won ? payload.nextLevelData : null;

  if (payload.won) {
    tag.className = 'modal-tag success';
    tag.textContent = `Episode 2 • Level ${payload.level} Complete`;
    title.textContent = 'Reunited in the Northern Sanctuary';
    summary.textContent = `Following your calf’s answering echoes through dark Atlantic waters, you navigated ${payload.levelTargetMeters}m north to the feeding sanctuary. Continue into Level ${
      payload.level + 1
    } (${payload.nextLevelMeters}m) where plankton blooms grow scarcer and acoustic noise intensifies!`;
    btnNextLevel.style.display = 'inline-flex';
    btnNextLevel.textContent = `Continue Migration (Level ${payload.level + 1} • ${payload.nextLevelMeters}m →)`;
  } else if (payload.deathReason === 'ship') {
    tag.className = 'modal-tag danger';
    tag.textContent = `Vessel Strike • Level ${payload.level}`;
    title.textContent = 'Struck in a High-Speed Shipping Lane';
    summary.textContent = `Low-frequency engine noise masks the approach of commercial vessels until it is too late. Ship strikes and rope entanglements are the two leading causes of death for North Atlantic Right Whales (${payload.totalMetersMigrated}m total progress).`;
    btnNextLevel.style.display = 'none';
  } else {
    tag.className = 'modal-tag danger';
    tag.textContent = `Exhausted on Level ${payload.level}`;
    title.textContent = 'Stamina Depleted by Noise & Entanglement';
    summary.textContent = `You migrated ${payload.metersInLevel}m / ${payload.levelTargetMeters}m on Level ${payload.level} (${payload.totalMetersMigrated}m total) before chronic acoustic stress and fishing gear drag exhausted your reserves.`;
    btnNextLevel.style.display = 'none';
  }

  statDist.textContent = `${payload.totalMetersMigrated}m`;
  statDistLabel.textContent = `Total Distance (Lvl ${payload.level})`;
  statSwum.textContent = `${payload.bloomsConsumed}`;
  statSwumLabel.textContent = 'Plankton Blooms Fed';
  statSeals.textContent = `${payload.entanglementsHit}`;
  statSealsLabel.textContent = 'Gear Entanglements';

  factHeading.textContent = 'North Atlantic Right Whale Crisis (<360 Left)';
  factBody.textContent =
    'Fewer than 360 North Atlantic Right Whales remain on Earth. Over 85% have been entangled in commercial fishing gear at least once, and underwater shipping noise drowns out up to 90% of the acoustic communication space mothers and calves rely on to stay together.';

  impactModal.classList.add('active');
};

// Impact modal buttons
document.getElementById('btn-impact-retry')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  game.scene.stop('HubScene');
  game.scene.stop('PolarBearScene');
  game.scene.stop('WhaleScene');
  game.scene.start(activeEpisodeKey, { level: 1 });
});

btnNextLevel.addEventListener('click', () => {
  impactModal.classList.remove('active');
  winState.wildSpacesInfiniteMode = true;
  syncInfiniteButtonUI();
  game.scene.stop('HubScene');
  game.scene.stop('PolarBearScene');
  game.scene.stop('WhaleScene');
  game.scene.start(activeEpisodeKey, pendingNextLevelData ?? { level: 2 });
});

document.getElementById('btn-impact-hub')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  game.scene.stop('PolarBearScene');
  game.scene.stop('WhaleScene');
  game.scene.start('HubScene');
});

// Topbar: Switch to World Habitat Map
document.getElementById('btn-hub')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  infoModal.classList.remove('active');
  if (game.scene.isActive('HubScene')) {
    game.scene.stop('HubScene');
    game.scene.start(activeEpisodeKey);
  } else {
    if (game.scene.isActive('PolarBearScene')) {
      activeEpisodeKey = 'PolarBearScene';
    } else if (game.scene.isActive('WhaleScene')) {
      activeEpisodeKey = 'WhaleScene';
    }
    game.scene.stop('PolarBearScene');
    game.scene.stop('WhaleScene');
    game.scene.start('HubScene');
  }
});

// Topbar: Artist Asset Spec Modal
document.getElementById('btn-artist-spec')?.addEventListener('click', () => {
  const tag = document.getElementById('info-tag')!;
  const title = document.getElementById('info-title')!;
  const body = document.getElementById('info-body')!;

  const isWhale =
    game.scene.isActive('WhaleScene') || activeEpisodeKey === 'WhaleScene';
  const assets = isWhale ? WHALE_ASSETS : POLAR_BEAR_ASSETS;
  const folder = isWhale ? 'public/assets/whale/' : 'public/assets/polar-bear/';

  tag.className = 'modal-tag';
  tag.textContent = isWhale
    ? 'Artist Commission Brief (Episode 2 • Right Whale)'
    : 'Artist Commission Brief (Episode 1 • Polar Bear)';
  title.textContent = 'Plug-and-Play Sprite Specification';

  const rows = assets
    .map(
      (a) =>
        `<li style="margin-bottom: 10px;">
        <strong style="color:#7dd3fc;">${a.key}</strong> (${a.dimensions}, ${a.frames} frame${
          a.frames > 1 ? 's' : ''
        })<br/>
        <span style="color:#cbd5e1;">${a.description}</span><br/>
        <code style="font-size:11px; color:#94a3b8;">Path: public${a.filePath}</code>
      </li>`
    )
    .join('');

  body.innerHTML = `
    <p style="margin-bottom: 12px;">
      This prototype currently renders procedural vector-style textures in <code>BootScene.ts</code>.
      When commissioning a 2D artist, hand them this exact list and drop their PNGs into <code>${folder}</code>:
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
        For production launch on your custom domain, embed a <strong>Tiltify</strong> or <strong>Every.org Charity API</strong> widget here so 100% of player donations go directly to the <strong>World Wildlife Fund (WWF)</strong> or <strong>Whale and Dolphin Conservation (WDC)</strong> with automatic tax receipts and a live community fundraising progress bar.
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
