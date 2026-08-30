import { expect, it } from 'vitest';
import type { WatchlistRow } from '../data/contracts';
import { createWatchlistZone } from '../scene/zones/watchlistZone';
const rows: WatchlistRow[] = [
  { symbol:'ITC', market:'IN', last:null, changePct:null, dayLow:null, dayHigh:null, spark:[], quoteState:'unavailable' },
  { symbol:'NVDA', market:'US', last:180, changePct:1.2, dayLow:178, dayHigh:182, spark:[179,180], quoteState:'ready' },
];
it('groups markets and preserves unavailable quote nodes', () => { const zone=createWatchlistZone(); zone.update(rows); expect(zone.root.getObjectByName('market-IN')?.getObjectByName('watch-ITC')?.userData.quoteState).toBe('unavailable'); expect(zone.root.getObjectByName('market-US')?.getObjectByName('watch-NVDA')).toBeTruthy(); });
