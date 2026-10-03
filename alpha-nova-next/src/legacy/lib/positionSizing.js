export function calculatePositionSize({ capital, riskPercent, entryPrice, stopLoss }) {
  const empty = { riskAmount: 0, riskPerShare: 0, shares: 0, positionSize: 0,
    percentOfCapital: 0, stopPct: null, actualRisk: 0, targets: [] };
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!positive(capital)) return { ...empty, error: 'Enter account capital greater than zero.' };
  if (!positive(riskPercent) || riskPercent > 100) return { ...empty, error: 'Enter risk greater than zero and no more than 100%.' };
  if (!positive(entryPrice)) return { ...empty, error: 'Enter an entry price greater than zero.' };
  if (!positive(stopLoss) || stopLoss >= entryPrice) return { ...empty, error: 'For a long trade, enter a positive stop below the entry price.' };
  const riskAmount = capital * (riskPercent / 100);
  const riskPerShare = entryPrice - stopLoss;
  const shares = Math.floor(riskAmount / riskPerShare);
  const positionSize = shares * entryPrice;
  const percentOfCapital = positionSize / capital * 100;
  if (!Number.isSafeInteger(shares) || !Number.isFinite(positionSize) || !Number.isFinite(percentOfCapital)) {
    return { ...empty, error: 'These inputs exceed the calculator range. Reduce the values or widen the stop.' };
  }
  const actualRisk = shares * riskPerShare;
  const targets = [1, 1.5, 2, 3].map(r => ({ r, price: entryPrice + riskPerShare * r,
    gainPct: riskPerShare * r / entryPrice * 100, profit: actualRisk * r }));
  if (targets.some(t => !Number.isFinite(t.price) || !Number.isFinite(t.profit) || !Number.isFinite(t.gainPct))) {
    return { ...empty, error: 'These inputs exceed the calculator range. Reduce the values or widen the stop.' };
  }
  return { riskAmount, riskPerShare, shares, positionSize, percentOfCapital,
    stopPct: riskPerShare / entryPrice * 100, actualRisk, targets, error: null };
}
