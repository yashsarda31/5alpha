import type { Capabilities, QualityProfile, RenderTier } from './types';

export const QUALITY: Record<RenderTier, QualityProfile> = {
  full: { maxPixelRatio: 2, particles: 900, bloom: true, shadows: true, transitionScale: 1 },
  balanced: { maxPixelRatio: 1.35, particles: 280, bloom: false, shadows: false, transitionScale: 0.7 },
  essential: { maxPixelRatio: 1, particles: 0, bloom: false, shadows: false, transitionScale: 0 },
};

export const selectInitialTier = (capabilities: Capabilities): RenderTier => {
  if (!capabilities.webgl || capabilities.reducedMotion) return 'essential';
  if (capabilities.cores <= 4 || (capabilities.memoryGb !== null && capabilities.memoryGb <= 4)) return 'balanced';
  return 'full';
};

const downgrade = (tier: RenderTier): RenderTier => {
  if (tier === 'full') return 'balanced';
  return 'essential';
};

export class FrameBudgetMonitor {
  public tier: RenderTier;
  private readonly frames: number[] = [];
  private lastDowngradeAt = Number.NEGATIVE_INFINITY;

  constructor(
    initialTier: RenderTier,
    private readonly windowSize = 30,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.tier = initialTier;
  }

  push(frameMs: number): RenderTier {
    if (!Number.isFinite(frameMs) || frameMs < 0 || this.tier === 'essential') return this.tier;
    this.frames.push(frameMs);
    if (this.frames.length > this.windowSize) this.frames.shift();
    if (this.frames.length < this.windowSize) return this.tier;
    const average = this.frames.reduce((sum, value) => sum + value, 0) / this.frames.length;
    if (average > 22 && this.now() - this.lastDowngradeAt >= 10_000) {
      this.tier = downgrade(this.tier);
      this.lastDowngradeAt = this.now();
      this.frames.length = 0;
    }
    return this.tier;
  }
}
