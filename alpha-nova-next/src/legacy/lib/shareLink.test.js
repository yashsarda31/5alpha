import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canonicalShareUrl, createPublicShare, shareParamsForRoute } from './shareLink.js';

test('canonical share URL uses the public host and stable allowlisted parameters', () => {
  const url = canonicalShareUrl(
    'http://localhost:5173/screener?token=secret&benchmark=%5ENSEI&universe=nifty200&max_pe=30#results',
  );
  assert.equal(url, 'https://alphanova48.in/screener?benchmark=%5ENSEI&max_pe=30&universe=nifty200');
});

test('route state excludes credentials and unsupported values', () => {
  assert.deepEqual(
    shareParamsForRoute('/option-chain', { symbol: 'NIFTY', expiryDate: '2026-09-10', apiKey: 'secret', email: 'x@y.test' }),
    { expiryDate: '2026-09-10', symbol: 'NIFTY' },
  );
  assert.deepEqual(shareParamsForRoute('/dashboard', { symbol: 'TCS', market: 'IN' }), { market: 'IN' });
});

test('canonical URL accepts overrides and removes empty or excessive custom values', () => {
  assert.equal(
    canonicalShareUrl('/delivery-radar', { symbol: 'RELIANCE', token: 'nope', market: '' }),
    'https://alphanova48.in/delivery-radar?symbol=RELIANCE',
  );
  assert.equal(
    canonicalShareUrl('/screener', { tickers: 'A'.repeat(600) }),
    'https://alphanova48.in/screener',
  );
});

test('share UI sends and copies the canonical public URL', () => {
  const button = readFileSync(new URL('../components/ShareButton.jsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('./shareCard.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.match(button, /canonicalShareUrl\(window\.location\)/);
  assert.match(button, /navigator\.clipboard\.writeText\(shareUrl\)/);
  assert.match(card, /url: shareUrl/);
  assert.match(card, /const APP_URL = 'alphanova48\.in'/);
  assert.match(app, /const RouteShareAction/);
  assert.match(app, /<RouteShareAction \/>/);
});

test('stateful option and screener pages hydrate shareable query state', () => {
  const optionChain = readFileSync(new URL('../pages/OptionChain.jsx', import.meta.url), 'utf8');
  const screener = readFileSync(new URL('../pages/Screener.jsx', import.meta.url), 'utf8');
  assert.match(optionChain, /useSearchParams/);
  assert.match(optionChain, /searchParams\.get\('symbol'\)/);
  assert.match(optionChain, /expiryDate/);
  assert.match(screener, /configFromSearchParams/);
  assert.match(screener, /configToSearchParams/);
});

test('public share creation sends only path, query, and bounded title', async () => {
  let request;
  const url = await createPublicShare(
    { pathname: '/screener', search: '?universe=nifty200&token=secret' },
    'A'.repeat(150),
    async (path, options) => {
      request = { path, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ url: 'https://alphanova48.in/s/abc123' }) };
    },
  );
  assert.equal(url, 'https://alphanova48.in/s/abc123');
  assert.equal(request.path, '/api/public-shares');
  assert.deepEqual(request.body, { path: '/screener', query: 'universe=nifty200', title: 'A'.repeat(100) });
});
