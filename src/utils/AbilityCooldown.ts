/**
 * Shared cooldown timer for movement abilities (dashes, lunges, leaps) used
 * across every episode so all games gate burst movement the same way.
 */
export class AbilityCooldown {
  readonly duration: number;
  private remaining = 0;

  constructor(duration: number) {
    this.duration = duration;
  }

  /** Advance the timer by `dt` seconds. */
  tick(dt: number): void {
    this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
  }

  /** True when the ability can be used again. */
  isReady(): boolean {
    return this.remaining <= 0;
  }

  /** Start the cooldown (optionally with a custom duration). */
  trigger(duration: number = this.duration): void {
    this.remaining = Math.max(0, duration);
  }

  /** Clear the cooldown immediately (e.g. on level restart). */
  reset(): void {
    this.remaining = 0;
  }

  /** Seconds left before the ability is ready. */
  getRemaining(): number {
    return this.remaining;
  }

  /** Recharge progress from 0 (just used) to 1 (ready). */
  getRechargePct(): number {
    if (this.duration <= 0) return 1;
    return Math.min(1, Math.max(0, 1 - this.remaining / this.duration));
  }
}
