import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/SectorRotation.jsx', import.meta.url), 'utf8');

test('Sector Rotation maps all eight new groups', () => {
  for (const name of [
    'Nifty Midcap 100', 'Nifty Smallcap 100', 'Nifty Healthcare',
    'Nifty Consumer Durables', 'Nifty India Consumption', 'Nifty Oil & Gas',
    'Nifty Commodities', 'Nifty Services Sector',
  ]) assert.ok(source.includes(`'${name}'`), `${name} missing`);
});

test('Top Stocks section renders below ranking and before AI brief', () => {
  const ranking = source.indexOf('Sector strength ranking');
  const stocks = source.indexOf('Top Stocks in Top Sectors');
  const ai = source.indexOf('AI rotation brief');
  assert.ok(ranking >= 0 && stocks > ranking && ai > stocks);
  assert.match(source, /top_sector_stocks/);
  assert.match(source, /provider_limited/);
});

test('Coverage warning and dynamic trend label are rendered', () => {
  assert.match(source, /coverage\.missing/);
  assert.match(source, /trend_label/);
});
