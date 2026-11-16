export type PlayableEpisodeId = 'PolarBearScene' | 'WhaleScene' | 'LemurScene';

export interface ActiveGameSession {
  episodeId: PlayableEpisodeId;
  sceneData: Record<string, unknown>;
  updatedAtIso: string;
}

const SESSION_STORAGE_KEY = 'wild_spaces_active_session_v1';
const VALID_EPISODE_IDS: ReadonlySet<string> = new Set<PlayableEpisodeId>([
  'PolarBearScene',
  'WhaleScene',
  'LemurScene',
]);

function getStorage(): Storage | undefined {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage;
  }
  return undefined;
}

export function saveActiveSession(
  episodeId: PlayableEpisodeId,
  sceneData: Record<string, unknown> = {}
): ActiveGameSession {
  const session: ActiveGameSession = {
    episodeId,
    sceneData,
    updatedAtIso: new Date().toISOString(),
  };

  try {
    getStorage()?.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore localStorage quota/privacy errors
  }

  return session;
}

export function getActiveSession(): ActiveGameSession | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ActiveGameSession> | null;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.episodeId !== 'string' ||
      !VALID_EPISODE_IDS.has(parsed.episodeId) ||
      !parsed.sceneData ||
      typeof parsed.sceneData !== 'object' ||
      Array.isArray(parsed.sceneData)
    ) {
      return null;
    }

    return {
      episodeId: parsed.episodeId as PlayableEpisodeId,
      sceneData: parsed.sceneData,
      updatedAtIso:
        typeof parsed.updatedAtIso === 'string'
          ? parsed.updatedAtIso
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearActiveSession(): void {
  try {
    getStorage()?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
