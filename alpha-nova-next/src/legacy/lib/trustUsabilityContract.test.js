import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Signals shows setup cards without the removed provider panel', () => {
  const signals = source('../pages/MarketSignals.jsx');
  assert.doesNotMatch(signals, /<DataStatus/);
  assert.match(signals, /<SignalSetupCards/);
  assert.doesNotMatch(signals, />Conviction</);
  assert.match(signals, /Quality Score/);
});

test('mobile-only detail surfaces use accessible disclosures', () => {
  const signals = source('../pages/MarketSignals.jsx');
  for (const title of ['Volatility forecast', 'Options intelligence', 'Index option structures', 'Current model portfolio']) {
    assert.match(signals, new RegExp(`title="${title}"`));
  }
  assert.match(signals, /<CollapsibleSection/);
});

test('Track Record separates unresolved rows and labels small samples', () => {
  const track = source('../pages/TrackRecord.jsx');
  assert.match(track, /unresolved/);
  assert.match(track, /Needs resolution/);
  assert.match(track, /Small forward sample/);
  assert.match(track, /Gross of verified costs/);
});

test('acknowledged compliance notice remains reopenable', () => {
  const disclaimer = source('../components/Disclaimer.jsx');
  assert.match(disclaimer, />Discl: Not Investment Advice</);
  assert.doesNotMatch(disclaimer, /The quantitative models and AI-generated insights/);
  assert.match(disclaimer, /Educational analytics/);
  assert.match(disclaimer, /View notice/);
  assert.match(disclaimer, /setDismissed\(false\)/);
  assert.match(disclaimer, /localStorage/);
});

test('essential explanatory text has explicit readability floors', () => {
  const css = source('../index.css') + source('../pages/MarketSignals.css') + source('../pages/Dashboard.css');
  assert.ok(Number(css.match(/--font-body-min:\s*(\d+)px/)?.[1]) >= 14);
  assert.ok(Number(css.match(/--font-meta-min:\s*(\d+)px/)?.[1]) >= 12);
  assert.match(css, /line-height:\s*1\.4/);
});
