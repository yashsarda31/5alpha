import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Today is a decision cockpit rather than a duplicate tool catalogue', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  assert.match(dashboard, /title="Today"/);
  assert.match(dashboard, /Priority Setups/);
  assert.match(dashboard, /Market Details/);
  assert.doesNotMatch(dashboard, /Analytics Modules|NAV_MODULES/);
  assert.doesNotMatch(dashboard, /AI OFFLINE|AI ACTIVE|gemini_api_key/);
});

test('priority setups connect directly to ticker-specific Analyse routes', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  assert.match(dashboard, /selectPrioritySetups/);
  assert.match(dashboard, /encodeURIComponent\(plan\.symbol\)/);
  assert.match(dashboard, /Entry/);
  assert.match(dashboard, /Stop/);
  assert.match(dashboard, /Target/);
});

test('Today explicitly renders no-trade and unavailable setup guidance', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  assert.match(dashboard, /buildNoTradeGuidance/);
  assert.match(dashboard, /dash-no-trade/);
  assert.match(dashboard, /Open Signals/);
});

test('Analyse loads the URL symbol or its visible default immediately', () => {
  const chart = source('../pages/Chart.jsx');
  assert.match(chart, /const sym = searchParams\.get\('symbol'\) \|\| 'NVDA'/);
  assert.match(chart, /fetchChart\(sym\)/);
  assert.doesNotMatch(chart, /No auto-fetch by default/);
});

test('Signals stops automatic polling after close and offers manual refresh', () => {
  const signals = source('../pages/MarketSignals.jsx');
  assert.match(signals, /setMarketOpen\(response\.data\?\.market_open !== false\)/);
  assert.match(signals, /autoRefresh && marketOpen \? 60000 : 0/);
  assert.match(signals, /data\.market_open \?/);
  assert.match(signals, /Refresh snapshot/);
});
