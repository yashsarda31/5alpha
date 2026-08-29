import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventPayload } from './productAnalytics.js';

test('analytics payload strips query, symbol, identity, and tokens', () => {
  const payload = buildEventPayload('analyse_loaded', {
    route: '/chart?symbol=RELIANCE',
    market: 'IN',
    symbol: 'RELIANCE',
    email: 'person@example.com',
    token: 'secret',
  }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f', new Date('2026-08-29T04:30:00Z'));

  assert.deepEqual(payload, {
    event: 'analyse_loaded',
    device_id: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    occurred_at: '2026-08-29T04:30:00.000Z',
    route: '/chart',
    market: 'IN',
  });
});

test('unknown events and routes are rejected before transport', () => {
  assert.equal(buildEventPayload('searched_symbol', { route: '/chart', market: 'IN' }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f'), null);
  assert.equal(buildEventPayload('analyse_loaded', { route: '/private', market: 'IN' }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f'), null);
});
