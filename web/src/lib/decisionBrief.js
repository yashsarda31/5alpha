const numericScore = (plan) => {
  const score = Number(plan?.score);
  return Number.isFinite(score) ? score : 0;
};

export const selectPrioritySetups = (signals, limit = 3) => {
  const plans = signals?.setups?.plans;
  if (!Array.isArray(plans)) return [];

  const strongestBySymbol = new Map();
  plans.forEach((plan) => {
    if (!plan?.symbol || !plan?.side) return;
    const current = strongestBySymbol.get(plan.symbol);
    if (!current || numericScore(plan) > numericScore(current)) {
      strongestBySymbol.set(plan.symbol, plan);
    }
  });

  return [...strongestBySymbol.values()]
    .sort((left, right) => numericScore(right) - numericScore(left))
    .slice(0, limit);
};

export const buildNoTradeGuidance = (signals) => {
  if (!signals) {
    return {
      state: 'unavailable',
      title: 'Setup feed unavailable',
      body: 'Market prices are still available. Open Signals to retry the model feed.',
    };
  }

  const regime = signals.regime || {};
  const overall = regime.overall || 'NEUTRAL';
  const advancing = Number(regime.breadth?.adv) || 0;
  const declining = Number(regime.breadth?.dec) || 0;
  const total = advancing + declining;
  const advancingPct = total > 0 ? Math.round((advancing / total) * 100) : null;

  if (overall === 'RISK-OFF') {
    const breadth = advancingPct === null ? '' : ` with only ${advancingPct}% advancing breadth`;
    return {
      state: 'no-trade',
      title: 'No high-conviction setup right now',
      body: `The model is in RISK-OFF${breadth}. Capital preservation is a valid position.`,
    };
  }

  if (advancingPct !== null && advancingPct < 45) {
    return {
      state: 'no-trade',
      title: 'No high-conviction setup right now',
      body: `Only ${advancingPct}% of the tracked market is advancing. Wait for broader confirmation before forcing a trade.`,
    };
  }

  const volatility = regime.vol?.label;
  if (volatility === 'HIGH-VOL' || volatility === 'RICH') {
    return {
      state: 'no-trade',
      title: 'No high-conviction setup right now',
      body: `Volatility is ${volatility}. The model has not found a setup with enough reward for the current risk.`,
    };
  }

  return {
    state: 'no-trade',
    title: 'No high-conviction setup right now',
    body: `The ${overall} regime is visible, but no setup currently clears the model threshold. Waiting is part of the process.`,
  };
};
