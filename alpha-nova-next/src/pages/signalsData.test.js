import test from 'node:test';
import assert from 'node:assert/strict';
import { earlySignals, filterSignals, finiteNumber, isActionableSnapshot, signalLifecycle } from './signalsData.js';

test('freshness fails closed for missing, unknown, stale and refresh-error states', () => {
  assert.equal(isActionableSnapshot(undefined), false);
  assert.equal(isActionableSnapshot({ status: 'fresh', required_inputs_complete: false }), false);
  assert.equal(isActionableSnapshot({ status: 'mystery', required_inputs_complete: true }), false);
  assert.equal(isActionableSnapshot({ status: 'stale', required_inputs_complete: true }), false);
  assert.equal(isActionableSnapshot({ status: 'provider_limited', required_inputs_complete: true }), false);
  assert.equal(isActionableSnapshot({ status: 'fresh', required_inputs_complete: true }, 'refresh failed'), false);
  assert.equal(isActionableSnapshot({ status: 'fresh', required_inputs_complete: true }), true);
  assert.equal(isActionableSnapshot({ status: 'last_session', required_inputs_complete: true }), true);
});

test('finiteNumber rejects values that could render misleading metrics', () => {
  for (const value of [null, undefined, '', '   ', [], [12], {}, true, false, NaN, Infinity, -Infinity, 'not-a-number']) assert.equal(finiteNumber(value), null);
  assert.equal(finiteNumber('0'), 0);
  assert.equal(finiteNumber('12.5'), 12.5);
});

test('published lifecycle filters retain locked plan integrity', () => {
  const plans = [{ symbol: 'RELIANCE', side: 'LONG' }, { symbol: 'TCS', side: 'SHORT', lifecycle: 'triggered' }, { symbol: 'INFY', side: 'LONG', lifecycle: 'open' }, { symbol: 'HDFCBANK', side: 'LONG', lifecycle: 'qualifying', levels_locked: true }];
  assert.equal(signalLifecycle(plans[0]), 'published');
  assert.equal(signalLifecycle(plans[3]), 'open');
  assert.deepEqual(filterSignals(plans, { lifecycle: 'open' }).map((plan) => plan.symbol), ['INFY', 'HDFCBANK']);
  assert.deepEqual(filterSignals(plans, { direction: 'SHORT', query: 'tc' }).map((plan) => plan.symbol), ['TCS']);
});

test('early lane accepts only explicit nonactionable India watch states', () => {
  const setups = { watchlist: [{ symbol: 'A', lifecycle: 'forming', actionable: false }, { symbol: 'B', lifecycle: 'extended', actionable: false }, { symbol: 'C', lifecycle: 'invalidated', actionable: false }, { symbol: 'D', lifecycle: 'forming', actionable: true }, { symbol: 'E', lifecycle: 'open', actionable: false }] };
  assert.deepEqual(earlySignals(setups, 'US'), []);
  assert.deepEqual(earlySignals(setups, 'IN').map((plan) => plan.symbol), ['A', 'B', 'C']);
  assert.deepEqual(filterSignals(earlySignals(setups, 'IN'), { lifecycle: 'extended', lane: 'early' }).map((plan) => plan.symbol), ['B']);
});
