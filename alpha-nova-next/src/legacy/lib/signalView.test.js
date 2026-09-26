import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataStatus, signalEmptyState } from './signalView.js';

test('missing status fails closed as provider limited', () => {
  assert.deepEqual(normalizeDataStatus(undefined), {
    status: 'provider_limited',
    observed_at: null,
    market_session: 'unknown',
    sources: [],
    required_inputs_complete: false,
    warnings: ['status_unavailable'],
  });
});

test('incomplete inputs explain why there is no actionable setup', () => {
  const copy = signalEmptyState({
    setups: { plans: [] },
    data_status: {
      status: 'provider_limited',
      required_inputs_complete: false,
      warnings: ['open_interest_unavailable'],
    },
  });

  assert.equal(copy.title, 'No qualifying setup — inputs incomplete');
  assert.match(copy.detail, /open interest unavailable/i);
});

test('a valid empty radar remains a normal no-setup state', () => {
  const copy = signalEmptyState({
    setups: { plans: [] },
    data_status: { status: 'last_session', required_inputs_complete: true, warnings: [] },
  });

  assert.equal(copy.title, 'No qualifying setup');
});
