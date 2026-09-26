import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../pages/MarketSignals.jsx', import.meta.url), 'utf8');

test('Actionable Setups renders before Regime Context', () => {
  const header = source.indexOf('<PageHeader', source.indexOf('return ('));
  const setups = source.indexOf('id="setups-analysis"', header);
  const regime = source.indexOf('>Regime Context<', header);
  const options = source.indexOf('>Options Intelligence<', header);
  const portfolio = source.indexOf('<SignalsPortfolio', header);
  assert.ok(header >= 0 && setups > header);
  assert.ok(regime > setups);
  assert.ok(options > regime);
  assert.ok(portfolio > options);
});
