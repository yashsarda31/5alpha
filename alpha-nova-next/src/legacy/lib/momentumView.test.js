import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { momentumRows, sessionLabel } from './momentumView.js';

const snapshot = { ranked: [{ ticker: 'A.NS', rs_percentile: 0 }, { ticker: 'B.NS', rs_percentile: 100 }, { ticker: 'C.NS', rs_percentile: null }],
  low_rs: [{ ticker: 'A.NS', rs_percentile: 0 }],
  breakouts: [{ ticker: 'A.NS', type: '52W HIGH', chg_today: 2 }, { ticker: 'B.NS', type: '20D HIGH', chg_today: 3 }],
  breakdowns: [{ ticker: 'X', chg_today: -2 }, { ticker: 'Y', chg_today: -5 }] };

test('leaders rank strongest first and missing RS stays last in either direction', () => {
  assert.deepEqual(momentumRows(snapshot, 'leaders').map(r => r.ticker), ['B.NS', 'A.NS', 'C.NS']);
  assert.deepEqual(momentumRows(snapshot, 'leaders', '', 'rs_percentile', 'asc').map(r => r.ticker), ['A.NS', 'B.NS', 'C.NS']);
  assert.equal(snapshot.ranked[0].ticker, 'A.NS');
});
test('weakness views use their full backend lists and sort falls first', () => {
  assert.deepEqual(momentumRows(snapshot, 'low_rs').map(r => r.ticker), ['A.NS']);
  assert.deepEqual(momentumRows(snapshot, 'breakdowns').map(r => r.ticker), ['Y', 'X']);
  assert.equal(momentumRows(snapshot, 'leaders', ' b. ')[0].ticker, 'B.NS');
  assert.deepEqual(momentumRows(snapshot, 'leaders', 'missing'), []);
});
test('event pages can select only confirmed 52-week highs', () => {
  assert.deepEqual(momentumRows(snapshot, 'breakouts', '', undefined, undefined, '52W HIGH').map(r => r.ticker), ['A.NS']);
});
test('session labels use market timezone and never call an older snapshot today', () => {
  const now = new Date('2026-09-05T01:00:00Z');
  assert.match(sessionLabel({ session_date: '2026-09-04' }, 'in', now), /^Latest available session/);
  assert.match(sessionLabel({ session_date: '2026-09-04' }, 'us', now), /^Today/);
  assert.match(sessionLabel({}, 'in', now), /unavailable/);
});
test('bottom tray preserves the four-step workflow and Momentum remains available', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const tray = app.split('const TAB_ITEMS = [')[1].split('];')[0];
  assert.match(tray, /to: '\/watchlist', label: 'Watchlist'/);
  assert.doesNotMatch(tray, /momentum/);
  assert.match(app, /to: '\/watchlist', label: 'Watchlist'/);
  const more = app.split('const MORE_NAV_SECTIONS = [')[1].split('const MORE_ROUTE_PATHS')[0];
  assert.match(more, /to: '\/momentum', label: 'Momentum Leaders'/);
  assert.match(app, /path="\/watchlist"/);
});
