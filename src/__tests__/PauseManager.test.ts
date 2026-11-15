import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import { PauseManager, type PauseStateSnapshot } from '../systems/PauseManager.ts';

function createMockPauseScene() {
  let tweenPauseCalls = 0;
  let tweenResumeCalls = 0;

  const scene = {
    time: {
      paused: false,
    },
    tweens: {
      pauseAll() {
        tweenPauseCalls++;
      },
      resumeAll() {
        tweenResumeCalls++;
      },
    },
  };

  return {
    scene: scene as unknown as Phaser.Scene,
    getTimePaused: () => scene.time.paused,
    getTweenPauseCalls: () => tweenPauseCalls,
    getTweenResumeCalls: () => tweenResumeCalls,
  };
}

describe('PauseManager shared pause system', () => {
  it('starts unpaused and ignores manual pause before a gameplay scene is attached', () => {
    const pm = new PauseManager();
    assert.equal(pm.hasActiveScene(), false);
    assert.equal(pm.isPaused(), false);
    assert.equal(pm.toggleManualPause(), false);
    assert.equal(pm.isPaused(), false);
  });

  it('toggles manual pause and syncs Phaser scene time and tweens', () => {
    const pm = new PauseManager();
    const mock = createMockPauseScene();
    pm.attachScene(mock.scene);

    assert.equal(pm.hasActiveScene(), true);
    assert.equal(pm.isPaused(), false);

    const pausedNow = pm.toggleManualPause();
    assert.equal(pausedNow, true);
    assert.equal(pm.isPaused(), true);
    assert.equal(pm.isManuallyPaused(), true);
    assert.equal(mock.getTimePaused(), true);
    assert.equal(mock.getTweenPauseCalls(), 1);

    const resumedNow = pm.toggleManualPause();
    assert.equal(resumedNow, false);
    assert.equal(pm.isPaused(), false);
    assert.equal(pm.isManuallyPaused(), false);
    assert.equal(mock.getTimePaused(), false);
  });

  it('pauses the active game when the Personal Bests / Info modal opens and resumes when it closes', () => {
    const pm = new PauseManager();
    const mock = createMockPauseScene();
    pm.attachScene(mock.scene);

    pm.setModalOpen(true);
    assert.equal(pm.isPaused(), true);
    assert.equal(pm.isModalPaused(), true);
    assert.equal(pm.isManuallyPaused(), false);
    assert.equal(mock.getTimePaused(), true);

    pm.setModalOpen(false);
    assert.equal(pm.isPaused(), false);
    assert.equal(pm.isModalPaused(), false);
    assert.equal(mock.getTimePaused(), false);
  });

  it('preserves manual pause if a player manually paused before opening and closing the Personal Bests modal', () => {
    const pm = new PauseManager();
    const mock = createMockPauseScene();
    pm.attachScene(mock.scene);

    pm.setManualPause(true);
    pm.setModalOpen(true);
    assert.equal(pm.isPaused(), true);

    // Closing the modal leaves manual pause active until explicitly resumed
    pm.setModalOpen(false);
    assert.equal(pm.isPaused(), true);
    assert.equal(pm.isManuallyPaused(), true);
    assert.equal(mock.getTimePaused(), true);

    pm.setManualPause(false);
    assert.equal(pm.isPaused(), false);
    assert.equal(mock.getTimePaused(), false);
  });

  it('clears pause state when level ends or scene detaches, and notifies subscribers', () => {
    const pm = new PauseManager();
    const mock = createMockPauseScene();
    const snapshots: PauseStateSnapshot[] = [];

    const unsubscribe = pm.subscribe((state) => {
      snapshots.push(state);
    });

    pm.attachScene(mock.scene);
    pm.setManualPause(true);
    assert.equal(pm.isPaused(), true);

    pm.setGameEnded(true);
    assert.equal(pm.isPaused(), false);
    assert.equal(pm.hasActiveScene(), false);
    assert.equal(mock.getTimePaused(), false);

    pm.detachScene();
    unsubscribe();
    assert.ok(snapshots.length >= 4);
  });
});
