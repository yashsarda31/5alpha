import test from 'node:test';
import assert from 'node:assert/strict';
import { chaseValue, durationValue, indiaWatchlist, setupStateLabel, timestampValue, watchCounts } from './signalTimingView.js';

test('labels forming, triggered and existing positions without suggesting restricted access', () => {
  assert.equal(setupStateLabel({ lifecycle: 'forming', actionable: false }), 'Forming');
  assert.equal(setupStateLabel({ lifecycle: 'triggered' }), 'Triggered');
  assert.equal(setupStateLabel({ lifecycle: 'triggered', levels_locked: true }), 'Open position');
  assert.equal(setupStateLabel({ lifecycle: 'open', actionable: false }), 'Open position');
});

test('invalid or missing timestamps and timing values are unavailable, never zero', () => {
  assert.equal(timestampValue(null).text, 'Unavailable');
  assert.equal(timestampValue('not-a-date').text, 'Unavailable');
  assert.equal(durationValue(undefined), 'Unavailable');
  assert.equal(durationValue(null), 'Unavailable');
  assert.equal(durationValue(''), 'Unavailable');
  assert.equal(durationValue('bad'), 'Unavailable');
  assert.equal(chaseValue(null), 'Unavailable');
  assert.equal(chaseValue(0.35), '0.35R');
});

test('watchlists tolerate absent arrays and stay India-only', () => {
  assert.deepEqual(indiaWatchlist({}, 'IN'), []);
  const setups = { watchlist: [{ symbol: 'ABC', lifecycle: 'forming', actionable: false }] };
  assert.equal(indiaWatchlist(setups, 'IN').length, 1);
  assert.deepEqual(indiaWatchlist(setups, 'US'), []);
});

test('watch counts include only recognized lifecycle states', () => {
  assert.deepEqual(watchCounts([{ lifecycle: 'forming' }, { lifecycle: 'forming' }, { lifecycle: 'extended' }]), {
    forming: 2, extended: 1, invalidated: 0,
  });
});

test('non-actionable watch card contract exposes no entry or quantity fields', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../components/SignalSetupCards.jsx', import.meta.url), 'utf8'));
  const watchBlock = source.match(/\{watch && \([\s\S]*?\n\s*\)\}/)?.[0] || '';
  assert.match(watchBlock, /Trigger/);
  assert.match(watchBlock, /Invalidation/);
  assert.match(watchBlock, /Reason/);
  assert.match(watchBlock, /Chase/);
  assert.doesNotMatch(watchBlock, /Entry|Quantity/);
});
