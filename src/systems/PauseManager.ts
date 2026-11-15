import type Phaser from 'phaser';

export interface PauseStateSnapshot {
  isPaused: boolean;
  manualPaused: boolean;
  modalPaused: boolean;
  gameEnded: boolean;
  hasActiveScene: boolean;
}

export type PauseChangeListener = (state: PauseStateSnapshot) => void;

/**
 * Shared Pause Manager used across all Wild Spaces episodes and UI modals.
 * Centralizes manual pause (P / Esc / Topbar button) and automatic modal pause
 * (Personal Bests, Artist Spec, Charity modals) so timers, movement, and tweens
 * freeze consistently across every game.
 */
export class PauseManager {
  private scene: Phaser.Scene | null = null;
  private manualPaused = false;
  private modalPaused = false;
  private gameEnded = false;
  private listeners = new Set<PauseChangeListener>();

  public attachScene(scene: Phaser.Scene): void {
    this.scene = scene;
    this.manualPaused = false;
    this.gameEnded = false;
    this.syncScenePauseState();
    this.notify();
  }

  public detachScene(): void {
    if (this.scene) {
      this.applyScenePause(this.scene, false);
    }
    this.scene = null;
    this.manualPaused = false;
    this.gameEnded = false;
    this.notify();
  }

  public hasActiveScene(): boolean {
    return this.scene !== null && !this.gameEnded;
  }

  public isPaused(): boolean {
    return (
      this.scene !== null &&
      !this.gameEnded &&
      (this.manualPaused || this.modalPaused)
    );
  }

  public isManuallyPaused(): boolean {
    return this.scene !== null && !this.gameEnded && this.manualPaused;
  }

  public isModalPaused(): boolean {
    return this.modalPaused;
  }

  public toggleManualPause(): boolean {
    if (!this.scene || this.gameEnded) {
      return false;
    }
    this.manualPaused = !this.manualPaused;
    this.syncScenePauseState();
    this.notify();
    return this.isPaused();
  }

  public setManualPause(paused: boolean): void {
    if (!this.scene || this.gameEnded) {
      return;
    }
    if (this.manualPaused === paused) return;
    this.manualPaused = paused;
    this.syncScenePauseState();
    this.notify();
  }

  public setModalOpen(open: boolean): void {
    if (this.modalPaused === open) return;
    this.modalPaused = open;
    this.syncScenePauseState();
    this.notify();
  }

  public setGameEnded(ended: boolean): void {
    this.gameEnded = ended;
    if (ended) {
      this.manualPaused = false;
    }
    this.syncScenePauseState();
    this.notify();
  }

  public getSnapshot(): PauseStateSnapshot {
    return {
      isPaused: this.isPaused(),
      manualPaused: this.isManuallyPaused(),
      modalPaused: this.modalPaused,
      gameEnded: this.gameEnded,
      hasActiveScene: this.hasActiveScene(),
    };
  }

  public subscribe(listener: PauseChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private syncScenePauseState(): void {
    if (!this.scene) return;
    this.applyScenePause(this.scene, this.isPaused());
  }

  private applyScenePause(scene: Phaser.Scene, paused: boolean): void {
    if (scene.time) {
      scene.time.paused = paused;
    }
    if (scene.tweens) {
      if (paused) {
        scene.tweens.pauseAll();
      } else {
        scene.tweens.resumeAll();
      }
    }
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const globalPauseManager = new PauseManager();
