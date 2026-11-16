import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearActiveSession,
  getActiveSession,
  saveActiveSession,
} from '../utils/SessionStore.ts';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});

describe('SessionStore shared active-session persistence', () => {
  beforeEach(() => {
    clearActiveSession();
  });

  it('returns null when no game is in progress (lands on home page HubScene)', () => {
    assert.equal(getActiveSession(), null);
  });

  it('saves and restores active episode ID and level telemetry data', () => {
    const saved = saveActiveSession('LemurScene', {
      level: 2,
      carryMaxStamina: 85,
      cumulativeMeters: 1000,
      bestCanopyCombo: 4,
    });

    assert.equal(saved.episodeId, 'LemurScene');

    const restored = getActiveSession();
    assert.ok(restored !== null);
    assert.equal(restored?.episodeId, 'LemurScene');
    assert.deepEqual(restored?.sceneData, {
      level: 2,
      carryMaxStamina: 85,
      cumulativeMeters: 1000,
      bestCanopyCombo: 4,
    });
  });

  it('clears the active session when returning to Habitat Map or on game over', () => {
    saveActiveSession('WhaleScene', { level: 3 });
    assert.ok(getActiveSession() !== null);

    clearActiveSession();
    assert.equal(getActiveSession(), null);
  });

  it('returns null safely when stored session JSON is corrupt or has an unknown episodeId', () => {
    globalThis.localStorage.setItem(
      'wild_spaces_active_session_v1',
      '{not-valid-json'
    );
    assert.equal(getActiveSession(), null);

    globalThis.localStorage.setItem(
      'wild_spaces_active_session_v1',
      JSON.stringify({
        episodeId: 'UnknownScene',
        sceneData: { level: 1 },
      })
    );
    assert.equal(getActiveSession(), null);

    globalThis.localStorage.setItem(
      'wild_spaces_active_session_v1',
      JSON.stringify({
        episodeId: 'PolarBearScene',
        sceneData: ['not-an-object'],
      })
    );
    assert.equal(getActiveSession(), null);
  });
});
