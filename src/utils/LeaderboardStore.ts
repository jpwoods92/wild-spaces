export interface LeaderboardEntry {
  episodeId: string;
  level: number;
  levelTimeSeconds: number;
  totalTimeSeconds: number;
  totalMeters: number;
  completedAtIso: string;
}

const STORAGE_KEY = 'wild_spaces_personal_leaderboard_v1';
const MAX_ENTRIES_PER_BUCKET = 5;

export function formatDuration(seconds: number): string {
  const safeSecs = Math.max(0, seconds);
  const mins = Math.floor(safeSecs / 60);
  const rem = safeSecs - mins * 60;
  if (mins > 0) {
    const secStr = rem < 10 ? `0${rem.toFixed(2)}` : rem.toFixed(2);
    return `${mins}:${secStr}`;
  }
  return `${rem.toFixed(2)}s`;
}

export function formatHudClock(seconds: number): string {
  const safeSecs = Math.max(0, seconds);
  const mins = Math.floor(safeSecs / 60);
  const rem = safeSecs - mins * 60;
  const minStr = mins < 10 ? `0${mins}` : `${mins}`;
  const secStr = rem < 10 ? `0${rem.toFixed(1)}` : rem.toFixed(1);
  return `${minStr}:${secStr}`;
}

function loadAllEntries(): LeaderboardEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllEntries(entries: LeaderboardEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore localStorage quota/privacy errors
  }
}

export function getLeaderboardEntries(
  episodeId: string,
  level = 1
): LeaderboardEntry[] {
  return loadAllEntries()
    .filter((e) => e.episodeId === episodeId && e.level === level)
    .sort((a, b) => a.levelTimeSeconds - b.levelTimeSeconds)
    .slice(0, MAX_ENTRIES_PER_BUCKET);
}

export function getAllEpisodeBestByLevel(
  episodeId: string
): LeaderboardEntry[] {
  const all = loadAllEntries().filter((e) => e.episodeId === episodeId);
  const bestByLevel = new Map<number, LeaderboardEntry>();
  for (const entry of all) {
    const existing = bestByLevel.get(entry.level);
    if (!existing || entry.levelTimeSeconds < existing.levelTimeSeconds) {
      bestByLevel.set(entry.level, entry);
    }
  }
  return Array.from(bestByLevel.values()).sort((a, b) => a.level - b.level);
}

export function recordLevelCompletion(params: {
  episodeId: string;
  level: number;
  levelTimeSeconds: number;
  totalTimeSeconds: number;
  totalMeters: number;
}): {
  isNewBest: boolean;
  rank: number | null;
  entries: LeaderboardEntry[];
} {
  const all = loadAllEntries();
  const bucketBefore = all
    .filter(
      (e) => e.episodeId === params.episodeId && e.level === params.level
    )
    .sort((a, b) => a.levelTimeSeconds - b.levelTimeSeconds);

  const prevBest =
    bucketBefore.length > 0 ? bucketBefore[0].levelTimeSeconds : Infinity;
  const isNewBest = params.levelTimeSeconds < prevBest;

  const newEntry: LeaderboardEntry = {
    episodeId: params.episodeId,
    level: params.level,
    levelTimeSeconds: Number(params.levelTimeSeconds.toFixed(3)),
    totalTimeSeconds: Number(params.totalTimeSeconds.toFixed(3)),
    totalMeters: params.totalMeters,
    completedAtIso: new Date().toISOString(),
  };

  const otherBuckets = all.filter(
    (e) => !(e.episodeId === params.episodeId && e.level === params.level)
  );
  const updatedBucket = [...bucketBefore, newEntry]
    .sort((a, b) => a.levelTimeSeconds - b.levelTimeSeconds)
    .slice(0, MAX_ENTRIES_PER_BUCKET);

  saveAllEntries([...otherBuckets, ...updatedBucket]);

  const rankIndex = updatedBucket.findIndex(
    (e) =>
      e.completedAtIso === newEntry.completedAtIso &&
      e.levelTimeSeconds === newEntry.levelTimeSeconds
  );

  return {
    isNewBest,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    entries: updatedBucket,
  };
}
