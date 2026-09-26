import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCREEN, PRESETS, applyPreset, buildPayload, sortRows, csvForRows, sanitizeSaved, filterChips, configFromSearchParams, configToSearchParams } from './screenerView.js';

test('combined preset preserves universe and exposes editable technical and PE filters', () => {
  const config = applyPreset({ ...DEFAULT_SCREEN, universe: 'nifty200' }, PRESETS.find(p => p.id === 'weakness'));
  assert.equal(config.universe, 'nifty200');
  assert.equal(buildPayload(config).price_trend, 'below_200');
  assert.equal(buildPayload(config).min_pe, 40);
  assert.equal(filterChips(config).length, 2);
});

test('zero is an active filter; empty values are omitted and invalid values rejected', () => {
  const payload = buildPayload({ ...DEFAULT_SCREEN, min_momentum: '0' });
  assert.equal(payload.min_momentum, 0);
  assert.equal('max_pe' in payload, false);
  assert.throws(() => buildPayload({ ...DEFAULT_SCREEN, min_pe: 'oops' }));
  assert.throws(() => buildPayload({ ...DEFAULT_SCREEN, universe: 'custom', tickers: ' , ' }));
  assert.throws(() => buildPayload({ ...DEFAULT_SCREEN, min_pe: '50', max_pe: '20' }));
});

test('missing values sort last in both directions without mutating rows', () => {
  const rows = [{ price: null }, { price: 5 }, { price: 9 }];
  assert.deepEqual(sortRows(rows, 'price', 'desc').map(r => r.price), [9, 5, null]);
  assert.deepEqual(sortRows(rows, 'price', 'asc').map(r => r.price), [5, 9, null]);
  assert.equal(rows[0].price, null);
});

test('CSV includes scan dates and match reasons, quotes commas and neutralizes formulas', () => {
  const csv = csvForRows([{ ticker: '=CMD()', price: 99, priceDate: '2026-09-04', reasons: ['A, B'] }]);
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes('2026-09-04'));
  assert.ok(csv.includes('"A, B"'));
});

test('saved screens reject corrupt storage and unknown rule values', () => {
  assert.deepEqual(sanitizeSaved(null), []);
  assert.deepEqual(sanitizeSaved([{ id: 'bad', name: 'Bad', config: { price_trend: 'fake' } }]), []);
  const saved = sanitizeSaved([{ id: 'ok', name: 'My screen', config: DEFAULT_SCREEN }]);
  assert.equal(saved[0].name, 'My screen');
  assert.equal(saved[0].config.universe, 'nifty100');
});

test('screener configuration round-trips through allowlisted public query state', () => {
  const config = { ...DEFAULT_SCREEN, universe: 'nifty200', benchmark: '^CNX200', price_trend: 'below_200', max_pe: '30', volume_breakout: true };
  const params = configToSearchParams(config);
  assert.equal(params.toString(), 'benchmark=%5ECNX200&max_pe=30&price_trend=below_200&rs_lookback=252&universe=nifty200&volume_breakout=true');
  assert.deepEqual(configFromSearchParams(params, DEFAULT_SCREEN), config);
  assert.deepEqual(configFromSearchParams(new URLSearchParams('universe=bad&apiKey=secret'), DEFAULT_SCREEN), DEFAULT_SCREEN);
});
