import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoTradeGuidance, selectPrioritySetups } from './decisionBrief.js';

test('priority setups keep the strongest side per symbol and sort by score', () => {
  const signals = {
    setups: {
      plans: [
        { symbol: 'AAA', side: 'LONG', score: 61 },
        { symbol: 'BBB', side: 'SHORT', score: 82 },
        { symbol: 'AAA', side: 'SHORT', score: 74 },
        { symbol: 'CCC', side: 'LONG', score: 69 },
      ],
    },
  };

  assert.deepEqual(
    selectPrioritySetups(signals, 2).map((plan) => [plan.symbol, plan.side, plan.score]),
    [['BBB', 'SHORT', 82], ['AAA', 'SHORT', 74]],
  );
});

test('priority setups ignore malformed plans', () => {
  const signals = { setups: { plans: [null, {}, { symbol: 'AAA' }, { symbol: 'BBB', side: 'LONG', score: 70 }] } };
  assert.deepEqual(selectPrioritySetups(signals), [{ symbol: 'BBB', side: 'LONG', score: 70 }]);
});

test('missing Signals data reports an unavailable feed without inventing a setup', () => {
  assert.deepEqual(buildNoTradeGuidance(null), {
    state: 'unavailable',
    title: 'Setup feed unavailable',
    body: 'Market prices are still available. Open Signals to retry the model feed.',
  });
});

test('risk-off and weak-breadth regimes explain why no trade is useful', () => {
  assert.deepEqual(buildNoTradeGuidance({
    regime: { overall: 'RISK-OFF', breadth: { adv: 180, dec: 420 } },
  }), {
    state: 'no-trade',
    title: 'No high-conviction setup right now',
    body: 'The model is in RISK-OFF with only 30% advancing breadth. Capital preservation is a valid position.',
  });
});
