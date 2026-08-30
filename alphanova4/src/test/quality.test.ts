import { describe, expect, it } from 'vitest';
import { FrameBudgetMonitor, QUALITY, selectInitialTier } from '../scene/quality';

describe('initial rendering tier', () => {
  it('selects Essential for reduced motion or unavailable WebGL', () => {
    expect(selectInitialTier({ reducedMotion: true, webgl: true, cores: 8, memoryGb: 8 })).toBe('essential');
    expect(selectInitialTier({ reducedMotion: false, webgl: false, cores: 8, memoryGb: 8 })).toBe('essential');
  });

  it('keeps full rendering for capable phones and balanced for constrained phones', () => {
    expect(selectInitialTier({ reducedMotion: false, webgl: true, cores: 8, memoryGb: 8 })).toBe('full');
    expect(selectInitialTier({ reducedMotion: false, webgl: true, cores: 2, memoryGb: 2 })).toBe('balanced');
    expect(QUALITY.balanced.maxPixelRatio).toBeLessThan(QUALITY.full.maxPixelRatio);
  });
});

describe('frame budget hysteresis', () => {
  it('downgrades once after sustained frames over 33ms and never auto-upgrades', () => {
    let now = 0;
    const monitor = new FrameBudgetMonitor('full', 30, () => now);
    Array.from({ length: 29 }, () => monitor.push(40));
    expect(monitor.tier).toBe('full');
    monitor.push(40);
    expect(monitor.tier).toBe('balanced');

    now += 11_000;
    Array.from({ length: 30 }, () => monitor.push(12));
    expect(monitor.tier).toBe('balanced');
  });

  it('can downgrade balanced to essential after the cooldown', () => {
    let now = 0;
    const monitor = new FrameBudgetMonitor('full', 2, () => now);
    monitor.push(50);
    monitor.push(50);
    expect(monitor.tier).toBe('balanced');
    now += 10_001;
    monitor.push(50);
    monitor.push(50);
    expect(monitor.tier).toBe('essential');
  });
});
