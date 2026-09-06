import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deliveryApiPath,
  deliveryStockPath,
  formatDeliveryNumber,
  normalizeDeliverySymbol,
  sourceNotice,
} from './deliveryView.js';

test('delivery symbols normalize to canonical NSE paths', () => {
  assert.equal(normalizeDeliverySymbol(' reliance.ns '), 'RELIANCE');
  assert.equal(deliveryStockPath('M&M.NS'), '/stocks/M%26M/delivery-percentage');
  assert.equal(deliveryApiPath('TCS'), '/api/delivery/stock/TCS?limit=90');
  assert.equal(normalizeDeliverySymbol('bad/symbol'), '');
});

test('delivery numbers never expose NaN or Infinity', () => {
  assert.equal(formatDeliveryNumber(3_500_000, 'quantity'), '35,00,000');
  assert.equal(formatDeliveryNumber(1.543, 'ratio'), '1.54×');
  assert.equal(formatDeliveryNumber(Number.NaN, 'percent'), '—');
  assert.equal(formatDeliveryNumber(Infinity, 'quantity'), '—');
});

test('source notice leads with the actual session and incomplete evidence', () => {
  assert.equal(sourceNotice({ source_status: 'fresh', trade_date: '2026-07-31' }), 'NSE session 31 Jul 2026');
  assert.equal(sourceNotice({ source_status: 'stale', trade_date: '2026-07-31' }), 'Latest available NSE session 31 Jul 2026 · delayed');
  assert.equal(sourceNotice({ trade_date: null }), 'NSE delivery data unavailable');
});
