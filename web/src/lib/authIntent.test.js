import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authState,
  continuationFromAuth,
  fullLocationPath,
  notificationIntent,
  watchlistIntent,
} from './authIntent.js';

test('fullLocationPath preserves pathname, search and hash', () => {
  assert.equal(
    fullLocationPath({ pathname: '/chart', search: '?symbol=SBIN.NS', hash: '#levels' }),
    '/chart?symbol=SBIN.NS#levels',
  );
});

test('watchlist intent normalizes NSE suffix and infers the market', () => {
  assert.deepEqual(
    watchlistIntent('sbin.ns', 'US'),
    { kind: 'watchlist-add', symbol: 'SBIN', market: 'IN' },
  );
  assert.deepEqual(
    watchlistIntent('AAPL', 'US'),
    { kind: 'watchlist-add', symbol: 'AAPL', market: 'US' },
  );
  assert.equal(watchlistIntent('  ', 'IN'), null);
});

test('auth continuation keeps intent and the complete return path', () => {
  const from = { pathname: '/signals', search: '?market=US', hash: '#portfolio' };
  const state = authState(from, notificationIntent());
  assert.deepEqual(continuationFromAuth(state), {
    to: '/signals?market=US#portfolio',
    state: { authIntent: { kind: 'enable-notifications' } },
  });
});
