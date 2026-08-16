import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the app shell contains no guest banner or guest route', () => {
  const app = source('../App.jsx');
  assert.doesNotMatch(app, /GuestBanner|GuestGate|Browsing as guest/);
  assert.match(app, /Save watchlist & enable alerts/);
});

test('Signals always shows the full model portfolio', () => {
  const portfolio = source('../components/SignalsPortfolio.jsx');
  assert.match(portfolio, /columns=\{fullColumns\}/);
  assert.doesNotMatch(portfolio, /guestColumns|Unlock active levels|useAuth/);
});

test('watchlist actions preserve an explicit auth intent', () => {
  const star = source('../components/WatchlistStar.jsx');
  const page = source('../pages/Watchlist.jsx');
  assert.match(star, /watchlistIntent\(symbol, market\)/);
  assert.match(star, /authState\(location, intent\)/);
  assert.match(page, /watchlistIntent\(symbol, market\)/);
  assert.doesNotMatch(page, /Your watchlist lives in your free account/);
});

test('login preserves the full return path and pending intent', () => {
  const login = source('../pages/Login.jsx');
  assert.match(login, /continuationFromAuth\(location\.state\)/);
  assert.match(login, /navigate\(continuation\.to, \{ replace: true, state: continuation\.state \}\)/);
});

test('the app mounts the post-login intent handler inside account providers', () => {
  const app = source('../App.jsx');
  assert.match(app, /<AuthIntentHandler \/>/);
});

test('signed-out Settings starts the notification auth intent', () => {
  const settings = source('../components/SettingsSheet.jsx');
  assert.match(settings, /notificationIntent\(\)/);
  assert.match(settings, /authState\(location, notificationIntent\(\)\)/);
  assert.match(settings, /Save watchlist &amp; enable alerts/);
  assert.doesNotMatch(settings, /Browsing as guest/);
});
