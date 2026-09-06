import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the market selector is compact, responsive and honours URL overrides', () => {
  const app = source('../App.jsx');
  const toggle = source('../components/MarketToggle.jsx');
  const css = source('../index.css');

  assert.match(app, /className="mobile-market-toggle"/);
  assert.match(app, /className="sidebar-market-toggle"/);
  assert.match(toggle, /useSearchParams/);
  assert.match(toggle, /setSearchParams/);
  assert.match(toggle, /className="market-toggle"/);
  assert.doesNotMatch(toggle, /<footer|market-footer/);
  assert.doesNotMatch(css, /\.market-footer\s*\{[\s\S]*?position:\s*fixed/);
});

test('market-aware tools follow the global region without overriding explicit symbols', () => {
  const chart = source('../pages/Chart.jsx');
  const screener = source('../pages/Screener.jsx');
  const dashboard = source('../pages/Dashboard.jsx');

  assert.match(chart, /useMarket/);
  assert.match(chart, /defaultTickerForMarket\(market/);
  assert.match(screener, /useMarket/);
  assert.match(screener, /screenDefaultsForMarket\(market/);
  assert.match(dashboard, /market === 'IN' && <TodaysCall \/>/);
});

test('Options exposes its visible title as the page heading', () => {
  const options = source('../pages/OptionChain.jsx');
  assert.match(options, /<h1 className="ui-ph-title">Option Chain<\/h1>/);
});
