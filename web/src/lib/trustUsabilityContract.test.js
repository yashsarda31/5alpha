import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Signals leads with trust state and setup cards', () => {
  const signals = source('../pages/MarketSignals.jsx');
  assert.match(signals, /<DataStatus status=\{data\.data_status\}/);
  assert.match(signals, /<SignalSetupCards/);
  assert.doesNotMatch(signals, />Conviction</);
  assert.match(signals, /Quality Score/);
});

test('mobile-only detail surfaces use accessible disclosures', () => {
  const signals = source('../pages/MarketSignals.jsx');
  for (const title of ['Volatility forecast', 'Options intelligence', 'Futures buildups', 'Index option structures', 'Current model portfolio']) {
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
