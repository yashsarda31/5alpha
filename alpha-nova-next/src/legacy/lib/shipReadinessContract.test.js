import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('signup and watchlist inputs have distinct browser identities and filter resets per account', () => {
  const login = source('../pages/Login.jsx');
  const watchlist = source('../../pages/Watchlist.tsx');
  assert.match(login, /name=\{isLogin \? 'login-email' : 'signup-email'\}/);
  assert.match(login, /autoComplete="email"/);
  assert.match(watchlist, /name="watchlist-symbol-filter"/);
  assert.match(watchlist, /autoComplete="off"/);
  assert.match(watchlist, /useEffect\(\(\) => \{\s*setQuery\(''\);\s*\}, \[accountKey\]\)/);
});

test('watchlist stars surface failures beside the originating control', () => {
  const star = source('../components/WatchlistStar.jsx');
  assert.match(star, /role="alert"/);
  assert.match(star, /Could not save/);
});

test('Google Identity initialization is shared across Login mounts', () => {
  const login = source('../pages/Login.jsx');
  assert.match(login, /initializeGoogleIdentity/);
  assert.match(login, /if \(googleInitializedClientId === clientId\) return/);
});

test('symbol search passes the selected market to the server', () => {
  const ticker = source('../components/TickerSearch.jsx');
  assert.match(ticker, /market/);
  assert.match(ticker, /market=\$\{encodeURIComponent\(market\)\}/);
});

test('mobile market buttons keep visible text in both states', () => {
  const styles = source('../../styles.css');
  assert.match(styles, /\.an-market-switch button span\{display:inline\}/);
  assert.match(styles, /\.an-market-switch button\[aria-pressed=false\]/);
});

test('alert activation exposes a pending state', () => {
  const settings = source('../components/SettingsSheet.jsx');
  assert.match(settings, /subscribing/);
  assert.match(settings, /Enabling/);
  assert.match(settings, /disabled=\{permission === 'denied' \|\| subscribing\}/);
});

test('dashboard and watchlist render provider timestamps when supplied', () => {
  const today = source('../../pages/Today.tsx');
  const watchlist = source('../../pages/Watchlist.tsx');
  assert.doesNotMatch(today, /Source dates not supplied/);
  assert.match(today, /formatStamp/);
  assert.match(watchlist, /quote\.as_of/);
});
