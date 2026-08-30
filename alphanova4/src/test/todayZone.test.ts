import { describe, expect, it } from 'vitest';
import { createTodayZone } from '../scene/zones/todayZone';
import type { TodayViewModel } from '../data/contracts';

const model: TodayViewModel = {
  status: 'ready',
  dashboard: {
    status: 'ready', marketOpen: true,
    indices: [{ name: 'NIFTY 50', last: 24252, changePct: 0.4, spark: [24100, 24252] }],
    movers: [{ symbol: 'ITC.NS', last: 420, changePct: -0.3, spark: [418, 420] }],
  },
  signalSummary: {
    regime: 'RISK-ON', breadth: { advancing: 30, declining: 20 }, setupCount: 2,
    observedAt: '2026-08-30T09:30:00+05:30', status: 'ready',
  },
};

describe('Today zone', () => {
  it('maps validated indices, movers, regime, and breadth to bounded geometry', () => {
    const zone = createTodayZone();
    zone.update(model);
    expect(zone.root.getObjectByName('index-rings')?.children).toHaveLength(1);
    expect(zone.root.getObjectByName('mover-nodes')?.children).toHaveLength(1);
    expect(zone.root.getObjectByName('regime-core')).toBeTruthy();
    expect(zone.root.getObjectByName('breadth-arc')).toBeTruthy();
    let bounded = true;
    zone.root.traverse((object) => {
      bounded = bounded && object.position.toArray().every(Number.isFinite) && object.position.length() <= 24;
    });
    expect(bounded).toBe(true);
  });

  it('renders no market geometry for an unavailable model', () => {
    const zone = createTodayZone();
    zone.update({ ...model, status: 'unavailable' });
    expect(zone.root.getObjectByName('index-rings')?.children).toHaveLength(0);
    expect(zone.root.getObjectByName('mover-nodes')?.children).toHaveLength(0);
  });
});
