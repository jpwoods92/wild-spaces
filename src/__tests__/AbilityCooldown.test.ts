import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AbilityCooldown } from '../utils/AbilityCooldown.ts';

describe('AbilityCooldown shared dash / leap cooldown', () => {
  it('starts ready with full recharge', () => {
    const cd = new AbilityCooldown(1.5);
    assert.equal(cd.isReady(), true);
    assert.equal(cd.getRemaining(), 0);
    assert.equal(cd.getRechargePct(), 1);
  });

  it('blocks use after trigger until the full duration elapses', () => {
    const cd = new AbilityCooldown(1.5);
    cd.trigger();
    assert.equal(cd.isReady(), false);
    assert.equal(cd.getRechargePct(), 0);

    cd.tick(0.75);
    assert.equal(cd.isReady(), false);
    assert.ok(Math.abs(cd.getRechargePct() - 0.5) < 1e-9);

    cd.tick(0.75);
    assert.equal(cd.isReady(), true);
    assert.equal(cd.getRemaining(), 0);
  });

  it('never goes negative, ignores negative dt, and resets instantly', () => {
    const cd = new AbilityCooldown(1);
    cd.trigger();
    cd.tick(-5);
    assert.equal(cd.getRemaining(), 1);
    cd.tick(10);
    assert.equal(cd.getRemaining(), 0);
    cd.trigger(2);
    assert.equal(cd.getRemaining(), 2);
    cd.reset();
    assert.equal(cd.isReady(), true);
  });
});
