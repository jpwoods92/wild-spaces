import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HubScene } from './scenes/HubScene';
import {
  PolarBearScene,
  PolarBearSceneData,
} from './scenes/PolarBearScene';
import { WhaleScene, WhaleSceneData } from './scenes/WhaleScene';
import { LemurScene, LemurSceneData } from './scenes/LemurScene';
import {
  LEMUR_ASSETS,
  POLAR_BEAR_ASSETS,
  WHALE_ASSETS,
} from './config/AssetManifest';
import {
  formatDuration,
  getAllEpisodeBestByLevel,
  getLeaderboardEntries,
  LeaderboardEntry,
  recordLevelCompletion,
} from './utils/LeaderboardStore';
import { getActiveSession } from './utils/SessionStore';
import { globalPauseManager } from './systems/PauseManager';

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
  scene: [BootScene, LemurScene, WhaleScene, PolarBearScene, HubScene],
};

const game = new Phaser.Game(config);

type PlayableEpisodeKey = 'PolarBearScene' | 'WhaleScene' | 'LemurScene';
const EPISODE_KEYS: PlayableEpisodeKey[] = [
  'PolarBearScene',
  'WhaleScene',
  'LemurScene',
];

function stopGameplayScenes(): void {
  for (const key of EPISODE_KEYS) {
    game.scene.stop(key);
  }
}

function getDetectedEpisodeKey(): PlayableEpisodeKey {
  for (const key of EPISODE_KEYS) {
    if (game.scene.isActive(key)) {
      return key;
    }
  }
  return activeEpisodeKey;
}

// Track which episode is active for modal retry/continue actions
let activeEpisodeKey: PlayableEpisodeKey =
  getActiveSession()?.episodeId ?? 'PolarBearScene';
let pendingNextLevelData:
  | PolarBearSceneData
  | WhaleSceneData
  | LemurSceneData
  | null = null;

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
    levelTimeSeconds: number;
    totalTimeSeconds: number;
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
    levelTimeSeconds: number;
    totalTimeSeconds: number;
    nextLevelData: WhaleSceneData;
  }) => void;
  showLemurImpactModal: (payload: {
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
};
winState.wildSpacesInfiniteMode = false;

// Wire up HTML UI & Conservation Modals
const impactModal = document.getElementById('impact-modal')!;
const infoModal = document.getElementById('info-modal')!;
const pauseModal = document.getElementById('pause-modal')!;
const btnPauseToggle = document.getElementById('btn-pause-toggle')!;
const btnInfiniteToggle = document.getElementById('btn-infinite-toggle')!;
const btnNextLevel = document.getElementById('btn-impact-next-level')!;

function openInfoModal(): void {
  infoModal.classList.add('active');
  globalPauseManager.setModalOpen(true);
}

function closeInfoModal(): void {
  infoModal.classList.remove('active');
  globalPauseManager.setModalOpen(false);
}

globalPauseManager.subscribe((state) => {
  if (!state.hasActiveScene) {
    btnPauseToggle.style.display = 'none';
    pauseModal.classList.remove('active');
    return;
  }

  btnPauseToggle.style.display = 'inline-flex';
  if (state.isPaused) {
    btnPauseToggle.textContent = '▶ Resume';
    btnPauseToggle.classList.add('btn-pause-active');
  } else {
    btnPauseToggle.textContent = '⏸ Pause';
    btnPauseToggle.classList.remove('btn-pause-active');
  }

  // Show manual pause overlay when manually paused and no other modal is covering the screen
  if (state.manualPaused && !state.modalPaused) {
    pauseModal.classList.add('active');
  } else {
    pauseModal.classList.remove('active');
  }
});

btnPauseToggle.addEventListener('click', () => {
  if (infoModal.classList.contains('active')) {
    closeInfoModal();
    globalPauseManager.setManualPause(false);
    return;
  }
  globalPauseManager.toggleManualPause();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();

  if (key === 'escape') {
    if (infoModal.classList.contains('active')) {
      closeInfoModal();
      return;
    }
    if (!impactModal.classList.contains('active')) {
      globalPauseManager.toggleManualPause();
    }
  } else if (
    key === 'p' &&
    !infoModal.classList.contains('active') &&
    !impactModal.classList.contains('active')
  ) {
    globalPauseManager.toggleManualPause();
  }
});

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

function renderImpactLeaderboard(params: {
  episodeId: string;
  episodeLabel: string;
  level: number;
  won: boolean;
  levelTimeSeconds: number;
  totalTimeSeconds: number;
  totalMeters: number;
}): void {
  const lbTitle = document.getElementById('impact-leaderboard-title')!;
  const lbBadge = document.getElementById('impact-leaderboard-badge')!;
  const lbList = document.getElementById('impact-leaderboard-list')!;

  let entries: LeaderboardEntry[] = [];
  let highlightRank: number | null = null;
  let isNewBest = false;

  if (params.won) {
    const res = recordLevelCompletion({
      episodeId: params.episodeId,
      level: params.level,
      levelTimeSeconds: params.levelTimeSeconds,
      totalTimeSeconds: params.totalTimeSeconds,
      totalMeters: params.totalMeters,
    });
    entries = res.entries;
    highlightRank = res.rank;
    isNewBest = res.isNewBest;
  } else {
    entries = getLeaderboardEntries(params.episodeId, params.level);
  }

  lbTitle.textContent = `⏱ Personal Best Times • ${params.episodeLabel} (Level ${params.level})`;
  if (params.won && isNewBest) {
    lbBadge.textContent = '★ NEW PERSONAL BEST!';
    lbBadge.style.color = '#34d399';
    lbBadge.title = '';
  } else {
    lbBadge.textContent = 'Local Storage';
    lbBadge.style.color = '#94a3b8';
    lbBadge.title =
      'Times are stored locally only and lost if browser storage is cleared.';
  }

  if (entries.length === 0) {
    lbList.innerHTML = `<li class="leaderboard-row"><span>No completed runs recorded for Level ${params.level} yet.</span><span>—</span></li>`;
    return;
  }

  lbList.innerHTML = entries
    .map((entry, idx) => {
      const rank = idx + 1;
      const isCurrent = highlightRank === rank;
      const dateStr = new Date(entry.completedAtIso).toLocaleDateString(
        undefined,
        { month: 'short', day: 'numeric' }
      );
      return `<li class="leaderboard-row${isCurrent ? ' highlight' : ''}">
        <span>#${rank} • ${formatDuration(entry.levelTimeSeconds)}${
        isCurrent ? ' (This Run)' : ''
      }</span>
        <span style="color:#94a3b8; font-size:11px;">${entry.totalMeters}m • ${dateStr}</span>
      </li>`;
    })
    .join('');
}

interface EpisodeImpactModalDescriptor {
  episodeId: PlayableEpisodeKey;
  episodeLabel: string;
  level: number;
  won: boolean;
  tagText: string;
  titleText: string;
  summaryText: string;
  nextButtonLabel?: string;
  nextLevelData: PolarBearSceneData | WhaleSceneData | LemurSceneData | null;
  totalMetersMigrated: number;
  stat2Value: string;
  stat2Label: string;
  stat3Value: string;
  stat3Label: string;
  levelTimeSeconds: number;
  totalTimeSeconds: number;
  factHeading: string;
  factBody: string;
}

function openEpisodeImpactModal(desc: EpisodeImpactModalDescriptor): void {
  activeEpisodeKey = desc.episodeId;
  pendingNextLevelData = desc.won ? desc.nextLevelData : null;

  const tag = document.getElementById('impact-tag')!;
  const title = document.getElementById('impact-title')!;
  const summary = document.getElementById('impact-summary')!;
  const statDist = document.getElementById('stat-distance')!;
  const statDistLabel = document.getElementById('stat-distance-label')!;
  const statSwum = document.getElementById('stat-swum')!;
  const statSwumLabel = document.getElementById('stat-swum-label')!;
  const statSeals = document.getElementById('stat-seals')!;
  const statSealsLabel = document.getElementById('stat-seals-label')!;
  const statTime = document.getElementById('stat-time')!;
  const statTimeLabel = document.getElementById('stat-time-label')!;
  const factHeading = document.getElementById('impact-fact-heading')!;
  const factBody = document.getElementById('impact-fact')!;

  tag.className = desc.won ? 'modal-tag success' : 'modal-tag danger';
  tag.textContent = desc.tagText;
  title.textContent = desc.titleText;
  summary.textContent = desc.summaryText;

  if (desc.won && desc.nextButtonLabel) {
    btnNextLevel.style.display = 'inline-flex';
    btnNextLevel.textContent = desc.nextButtonLabel;
  } else {
    btnNextLevel.style.display = 'none';
  }

  statDist.textContent = `${desc.totalMetersMigrated}m`;
  statDistLabel.textContent = `Total Distance (Lvl ${desc.level})`;
  statSwum.textContent = desc.stat2Value;
  statSwumLabel.textContent = desc.stat2Label;
  statSeals.textContent = desc.stat3Value;
  statSealsLabel.textContent = desc.stat3Label;
  statTime.textContent = formatDuration(desc.levelTimeSeconds);
  statTimeLabel.textContent = desc.won
    ? `Level ${desc.level} Time`
    : 'Time Survived';

  renderImpactLeaderboard({
    episodeId: desc.episodeId,
    episodeLabel: desc.episodeLabel,
    level: desc.level,
    won: desc.won,
    levelTimeSeconds: desc.levelTimeSeconds,
    totalTimeSeconds: desc.totalTimeSeconds,
    totalMeters: desc.totalMetersMigrated,
  });

  factHeading.textContent = desc.factHeading;
  factBody.textContent = desc.factBody;

  impactModal.classList.add('active');
}

// Expose impact modal hook for Episode 1 (PolarBearScene)
winState.showPolarBearImpactModal = (payload) => {
  openEpisodeImpactModal({
    episodeId: 'PolarBearScene',
    episodeLabel: 'Polar Bear',
    level: payload.level,
    won: payload.won,
    tagText: payload.won
      ? `Episode 1 • Level ${payload.level} Complete`
      : payload.deathReason === 'ship'
      ? `Vessel Strike • Level ${payload.level}`
      : `Stranded on Level ${payload.level}`,
    titleText: payload.won
      ? 'You Reached the Northern Pack Ice'
      : payload.deathReason === 'ship'
      ? 'Struck by an Industrial Arctic Vessel'
      : 'Exhausted by Shrinking Ice',
    summaryText: payload.won
      ? `You navigated ${payload.levelTargetMeters}m north in ${formatDuration(
          payload.levelTimeSeconds
        )} and reunited with your cub (${payload.floesCollapsed} ice patches shattered along the way). Continue north into Level ${
          payload.level + 1
        } (${payload.nextLevelMeters}m) where ice patches and seals grow even scarcer!`
      : payload.deathReason === 'ship'
      ? `As melting sea ice opens new commercial shipping corridors across the Arctic, vessel traffic has surged, creating lethal open-water crossings for migrating wildlife (${payload.totalMetersMigrated}m total progress).`
      : `You reached Level ${payload.level} (${payload.metersInLevel}m / ${payload.levelTargetMeters}m in this level, ${payload.totalMetersMigrated}m total) before your stamina gave out in open water.`,
    nextButtonLabel: `Continue North (Level ${payload.level + 1} • ${payload.nextLevelMeters}m →)`,
    nextLevelData: payload.nextLevelData,
    totalMetersMigrated: payload.totalMetersMigrated,
    stat2Value: `${payload.swimMeters}m`,
    stat2Label: 'Open-Water Swim',
    stat3Value: `${payload.sealsCaught}`,
    stat3Label: 'Seals Caught',
    levelTimeSeconds: payload.levelTimeSeconds,
    totalTimeSeconds: payload.totalTimeSeconds,
    factHeading: 'Real-World Arctic Crisis',
    factBody:
      'Arctic sea ice is shrinking by nearly 13% per decade. As seasonal ice breaks up weeks earlier each spring, polar bears are forced to swim up to 3x farther across freezing open water, burning critical fat reserves needed to nurse their cubs.',
  });
};

// Expose impact modal hook for Episode 2 (WhaleScene)
winState.showWhaleImpactModal = (payload) => {
  openEpisodeImpactModal({
    episodeId: 'WhaleScene',
    episodeLabel: 'Right Whale',
    level: payload.level,
    won: payload.won,
    tagText: payload.won
      ? `Episode 2 • Level ${payload.level} Complete`
      : payload.deathReason === 'ship'
      ? `Vessel Strike • Level ${payload.level}`
      : `Exhausted on Level ${payload.level}`,
    titleText: payload.won
      ? 'Reunited in the Calving Sanctuary'
      : payload.deathReason === 'ship'
      ? 'Struck in a High-Speed Shipping Lane'
      : 'Stamina Depleted by Noise & Entanglement',
    summaryText: payload.won
      ? `Following your calf’s answering echoes through dark Atlantic waters, you navigated ${payload.levelTargetMeters}m in ${formatDuration(
          payload.levelTimeSeconds
        )} to the sanctuary. Continue into Level ${
          payload.level + 1
        } (${payload.nextLevelMeters}m) where plankton blooms grow scarcer and decoy echoes emerge!`
      : payload.deathReason === 'ship'
      ? `Low-frequency engine noise masks the approach of commercial vessels until it is too late. Ship strikes and rope entanglements are the two leading causes of death for North Atlantic Right Whales (${payload.totalMetersMigrated}m total progress).`
      : `You migrated ${payload.metersInLevel}m / ${payload.levelTargetMeters}m on Level ${payload.level} (${payload.totalMetersMigrated}m total) before chronic acoustic stress and fishing gear drag exhausted your reserves.`,
    nextButtonLabel: `Continue Migration (Level ${payload.level + 1} • ${payload.nextLevelMeters}m →)`,
    nextLevelData: payload.nextLevelData,
    totalMetersMigrated: payload.totalMetersMigrated,
    stat2Value: `${payload.bloomsConsumed}`,
    stat2Label: 'Plankton Blooms Fed',
    stat3Value: `${payload.entanglementsHit}`,
    stat3Label: 'Gear Entanglements',
    levelTimeSeconds: payload.levelTimeSeconds,
    totalTimeSeconds: payload.totalTimeSeconds,
    factHeading: 'North Atlantic Right Whale Crisis (<360 Left)',
    factBody:
      'Fewer than 360 North Atlantic Right Whales remain on Earth. Over 85% have been entangled in commercial fishing gear at least once, and underwater shipping noise drowns out up to 90% of the acoustic communication space mothers and calves rely on to stay together.',
  });
};

// Expose impact modal hook for Episode 3 (LemurScene)
winState.showLemurImpactModal = (payload) => {
  openEpisodeImpactModal({
    episodeId: 'LemurScene',
    episodeLabel: 'Ring-Tailed Lemur',
    level: payload.level,
    won: payload.won,
    tagText: payload.won
      ? `Episode 3 • Level ${payload.level} Complete`
      : payload.deathReason === 'fire'
      ? `Slash-and-Burn Fire • Level ${payload.level}`
      : payload.deathReason === 'truck'
      ? `Haul Road Impact • Level ${payload.level}`
      : `Exhausted in Deforested Gap • Level ${payload.level}`,
    titleText: payload.won
      ? 'Reached the Ancient Baobab Sanctuary'
      : payload.deathReason === 'fire'
      ? 'Overtaken by the Slash-and-Burn Front'
      : payload.deathReason === 'truck'
      ? 'Struck on an Illegal Logging Haul Road'
      : 'Overwhelmed on the Fractured Forest Floor',
    summaryText: payload.won
      ? `Leaping from crown to crown ahead of the brushfire, you guided your lemur ${payload.levelTargetMeters}m in ${formatDuration(
          payload.levelTimeSeconds
        )} to the baobab sanctuary (best canopy chain: ×${payload.bestCanopyCombo}). Continue into Level ${
          payload.level + 1
        } (${payload.nextLevelMeters}m) where clear-cut gaps widen and the fire wall advances faster!`
      : payload.deathReason === 'fire'
      ? `Traditional "tavy" slash-and-burn clearing turns fragmented forest patches into fast-moving walls of flame and blinding smoke, leaving wildlife trapped between wide clearings (${payload.totalMetersMigrated}m total progress).`
      : payload.deathReason === 'truck'
      ? `Clear-cut logging roads carve straight through Madagascar's spiny forest, turning vital canopy crossings into fatal ground dashes (${payload.totalMetersMigrated}m total progress).`
      : `You traveled ${payload.metersInLevel}m / ${payload.levelTargetMeters}m on Level ${payload.level} (${payload.totalMetersMigrated}m total) before heat exposure, smoke, and fossa ambushes exhausted your stamina.`,
    nextButtonLabel: `Continue Through Canopy (Level ${payload.level + 1} • ${payload.nextLevelMeters}m →)`,
    nextLevelData: payload.nextLevelData,
    totalMetersMigrated: payload.totalMetersMigrated,
    stat2Value: `${payload.groundMeters}m`,
    stat2Label: 'Exposed Ground Run',
    stat3Value: `${payload.fruitCollected}`,
    stat3Label: 'Tamarind Pods Eaten',
    levelTimeSeconds: payload.levelTimeSeconds,
    totalTimeSeconds: payload.totalTimeSeconds,
    factHeading: 'Madagascar Spiny Forest Deforestation (>80% Lost)',
    factBody:
      'More than 80% of Madagascar’s original spiny and dry forests have been cleared for charcoal production and illegal hardwood logging. Forced down onto open ground between fragmented treetops, Ring-Tailed Lemurs face intense heat stress and ambush predators like the Fossa, driving wild populations down by over 95% since 2000.',
  });
};

// Impact modal buttons
document.getElementById('btn-impact-retry')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  game.scene.stop('HubScene');
  stopGameplayScenes();
  game.scene.start(activeEpisodeKey, { level: 1 });
});

btnNextLevel.addEventListener('click', () => {
  impactModal.classList.remove('active');
  winState.wildSpacesInfiniteMode = true;
  syncInfiniteButtonUI();
  game.scene.stop('HubScene');
  stopGameplayScenes();
  game.scene.start(activeEpisodeKey, pendingNextLevelData ?? { level: 2 });
});

document.getElementById('btn-impact-hub')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  stopGameplayScenes();
  game.scene.start('HubScene');
});

// Topbar: Personal Leaderboard Modal (All Episodes)
document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
  const tag = document.getElementById('info-tag')!;
  const title = document.getElementById('info-title')!;
  const body = document.getElementById('info-body')!;

  tag.style.display = 'none';
  title.textContent = 'Personal Best Completion Times';

  const renderEpisodeSection = (episodeId: string, label: string): string => {
    const bests = getAllEpisodeBestByLevel(episodeId);
    if (bests.length === 0) {
      return `
        <div class="leaderboard-box" style="margin-bottom:14px;">
          <div class="leaderboard-header"><span>${label}</span><span>No Completions Yet</span></div>
          <p style="font-size:12px; color:#94a3b8;">Complete a level to record your personal best time.</p>
        </div>
      `;
    }
    const items = bests
      .map((entry) => {
        const topList = getLeaderboardEntries(episodeId, entry.level);
        const subText =
          topList.length > 1
            ? `Top ${topList.length}: ${topList
                .map((e) => formatDuration(e.levelTimeSeconds))
                .join(' • ')}`
            : `1 run recorded`;
        return `<li class="leaderboard-row">
          <span><strong>Level ${entry.level}</strong> — Fastest: <strong style="color:#6ee7b7;">${formatDuration(
          entry.levelTimeSeconds
        )}</strong></span>
          <span style="font-size:11px; color:#94a3b8;">${subText}</span>
        </li>`;
      })
      .join('');

    return `
      <div class="leaderboard-box" style="margin-bottom:14px;">
        <div class="leaderboard-header"><span>${label}</span><span>Fastest Per Level</span></div>
        <ul class="leaderboard-list">${items}</ul>
      </div>
    `;
  };

  body.innerHTML = `
    <div>
      <span
        class="storage-chip"
        data-tooltip="Times are stored locally only and lost if browser storage is cleared."
      >
        Local Storage
      </span>
    </div>
    ${renderEpisodeSection(
      'PolarBearScene',
      'Episode 1 • The Thinning North (Polar Bear)'
    )}
    ${renderEpisodeSection(
      'WhaleScene',
      'Episode 2 • Drowned Echoes (Right Whale)'
    )}
    ${renderEpisodeSection(
      'LemurScene',
      'Episode 3 • Fractured Canopy (Ring-Tailed Lemur)'
    )}
  `;

  openInfoModal();
});

// Topbar: Switch to World Habitat Map
document.getElementById('btn-hub')?.addEventListener('click', () => {
  impactModal.classList.remove('active');
  closeInfoModal();
  globalPauseManager.setManualPause(false);
  if (game.scene.isActive('HubScene')) {
    game.scene.stop('HubScene');
    game.scene.start(activeEpisodeKey);
  } else {
    activeEpisodeKey = getDetectedEpisodeKey();
    stopGameplayScenes();
    game.scene.start('HubScene');
  }
});

// Topbar: Artist Asset Spec Modal
document.getElementById('btn-artist-spec')?.addEventListener('click', () => {
  const tag = document.getElementById('info-tag')!;
  const title = document.getElementById('info-title')!;
  const body = document.getElementById('info-body')!;

  const specByEpisode: Record<
    PlayableEpisodeKey,
    {
      assets: typeof POLAR_BEAR_ASSETS;
      folder: string;
      briefLabel: string;
    }
  > = {
    PolarBearScene: {
      assets: POLAR_BEAR_ASSETS,
      folder: 'public/assets/polar-bear/',
      briefLabel: 'Artist Commission Brief (Episode 1 • Polar Bear)',
    },
    WhaleScene: {
      assets: WHALE_ASSETS,
      folder: 'public/assets/whale/',
      briefLabel: 'Artist Commission Brief (Episode 2 • Right Whale)',
    },
    LemurScene: {
      assets: LEMUR_ASSETS,
      folder: 'public/assets/lemur/',
      briefLabel: 'Artist Commission Brief (Episode 3 • Ring-Tailed Lemur)',
    },
  };

  const epKey = getDetectedEpisodeKey();
  const { assets, folder, briefLabel } = specByEpisode[epKey];

  tag.style.display = 'inline-block';
  tag.className = 'modal-tag';
  tag.textContent = briefLabel;
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

  openInfoModal();
});

// Topbar: Charity / WWF Integration Guide & Direct Link
document.getElementById('btn-charity')?.addEventListener('click', () => {
  const tag = document.getElementById('info-tag')!;
  const title = document.getElementById('info-title')!;
  const body = document.getElementById('info-body')!;

  tag.style.display = 'inline-block';
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

  openInfoModal();
});

document.getElementById('btn-info-close')?.addEventListener('click', () => {
  closeInfoModal();
});

// Pause modal buttons
document.getElementById('btn-pause-resume')?.addEventListener('click', () => {
  globalPauseManager.setManualPause(false);
});

document.getElementById('btn-pause-retry')?.addEventListener('click', () => {
  globalPauseManager.setManualPause(false);
  game.scene.stop('HubScene');
  stopGameplayScenes();
  game.scene.start(activeEpisodeKey, { level: 1 });
});

document.getElementById('btn-pause-hub')?.addEventListener('click', () => {
  globalPauseManager.setManualPause(false);
  stopGameplayScenes();
  game.scene.start('HubScene');
});
