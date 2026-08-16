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
