import { describe, expect, it } from 'vitest';
import type { SignalsViewModel } from '../data/contracts';
import { createSignalsZone, freshnessToPulse, scoreToScale } from '../scene/zones/signalsZone';

const model: SignalsViewModel = {
  status: 'ready', market: 'IN', observedAt: new Date().toISOString(), regime: 'RISK-ON', breadth: null,
  setups: [
    { symbol: 'RELIANCE', side: 'LONG', score: 78, observedAt: new Date().toISOString(), entry: 1400, stop: 1350, target: 1500, invalidation: 'Close below support', methodology: 'Momentum', riskContext: 'Research only' },
    { symbol: 'TCS', side: 'SHORT', score: 61, observedAt: '2020-01-01T00:00:00Z', entry: 3000, stop: 3100, target: 2800, invalidation: null, methodology: 'Trend', riskContext: null },
  ],
};

describe('Signals zone', () => {
  it('maps score to size, freshness to pulse, and relevance to distance', () => {
    const zone = createSignalsZone();
    zone.update(model);
    const reliance = zone.root.getObjectByName('signal-RELIANCE');
    expect(reliance?.scale.x).toBeCloseTo(scoreToScale(78));
    expect(reliance?.userData.pulseRate).toBe(freshnessToPulse(model.setups[0].observedAt));
    expect(reliance?.userData.distanceSource).toBe('relevance');
    expect(reliance?.position.length()).toBeLessThanOrEqual(24);
    zone.dispose();
  });
});
