import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Today prioritizes state, setups, next actions, then watchlist', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  const order = [
    '<PulseStrip',
    '<PrioritySetups',
    '<NextActions',
    '<MyWatchlist',
    '<SectionTitle>Market Details</SectionTitle>',
  ].map((token) => dashboard.lastIndexOf(token));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(dashboard, /to="\/signals"[^>]*>Review Signals/);
  assert.match(dashboard, /to="\/chart"[^>]*>Analyse a symbol/);
  assert.match(dashboard, /to="\/position-sizing"[^>]*>Size a position/);
});
