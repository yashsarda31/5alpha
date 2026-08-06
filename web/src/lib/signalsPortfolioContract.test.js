import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('Signals portfolio shows public proof and gates active levels for guests', () => {
  const portfolio = source('../components/SignalsPortfolio.jsx');

  assert.match(portfolio, /`signal_portfolio_\$\{market\}`/);
  assert.match(portfolio, /`\/api\/signals\/portfolio\?market=\$\{market\}`/);
  assert.match(portfolio, /currentUser \? fullColumns : guestColumns/);
  for (const label of ['Entry', 'Current', 'Unreal. P&L', 'Stop', 'Target', 'Held', 'Weight']) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(portfolio, new RegExp(`label: '${escaped}'`));
  }
  assert.match(portfolio, /Unlock active levels/);
  assert.match(portfolio, /state=\{\{ from: location \}\}/);
  assert.match(portfolio, /View full track record/);
  assert.match(portfolio, /Portfolio unavailable/);
  assert.match(portfolio, /The model book is all cash\./);
  assert.doesNotMatch(portfolio, /How it works:|Reported returns exclude|first-come-first-served/);
});

test('Market Signals places the matching portfolio after actionable setups', () => {
  const signals = source('../pages/MarketSignals.jsx');

  assert.match(signals, /import SignalsPortfolio from '\.\.\/components\/SignalsPortfolio';/);
  assert.match(signals, /<SignalsPortfolio market=\{isUS \? 'US' : 'IN'\} \/>/);

  const setupsIndex = signals.indexOf('id="setups-analysis"');
  const portfolioIndex = signals.indexOf('<SignalsPortfolio');
  const signupIndex = signals.indexOf('<SignalsConversionCard');
  assert.ok(setupsIndex >= 0 && portfolioIndex > setupsIndex);
  if (signupIndex >= 0) assert.ok(signupIndex > portfolioIndex);
});
