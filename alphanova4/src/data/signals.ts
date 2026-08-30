import type { DataState, SignalSetup, SignalsViewModel } from './contracts';
import { finiteNumber, finitePositive, textValue } from './finite';

type RawRecord = Record<string, unknown>;
const record = (value: unknown): RawRecord => value && typeof value === 'object' ? value as RawRecord : {};

const dataState = (value: unknown): DataState => {
  const state = textValue(value)?.toLowerCase();
  return state === 'ready' || state === 'stale' || state === 'provider_limited' || state === 'unavailable'
    ? state
    : 'provider_limited';
};

const normalizeSetup = (raw: unknown, fallbackObservedAt: string | null): SignalSetup | null => {
  const row = record(raw);
  const symbol = textValue(row.symbol)?.toUpperCase() ?? null;
  const sideText = textValue(row.side)?.toUpperCase();
  const side = sideText === 'LONG' || sideText === 'SHORT' ? sideText : null;
  const score = finiteNumber(row.score);
  const entry = finitePositive(row.entry);
  const stop = finitePositive(row.stop);
  const target = finitePositive(row.target);
  if (!symbol || !side || score === null || score < 0 || score > 100 || entry === null || stop === null || target === null) return null;
  const reasons = Array.isArray(row.reasons) ? row.reasons.map(textValue).filter(Boolean).join(' · ') : null;
  return {
    symbol,
    side,
    score,
    observedAt: textValue(row.observed_at) ?? fallbackObservedAt,
    entry,
    stop,
    target,
    invalidation: textValue(row.invalidation),
    methodology: textValue(row.rationale) ?? reasons ?? 'Methodology unavailable',
    riskContext: textValue(row.risk_context),
  };
};

export const normalizeSignals = (raw: unknown): SignalsViewModel => {
  const body = record(raw);
  const statusBody = record(body.data_status);
  const setupsBody = record(body.setups);
  const regimeBody = record(body.regime);
  const breadthBody = record(regimeBody.breadth);
  const observedAt = textValue(statusBody.observed_at) ?? textValue(body.as_of);
  const rawPlans = Array.isArray(setupsBody.plans) ? setupsBody.plans : [];
  const setups = rawPlans.map((plan) => normalizeSetup(plan, observedAt)).filter((plan): plan is SignalSetup => plan !== null);
  const advancing = finiteNumber(breadthBody.adv);
  const declining = finiteNumber(breadthBody.dec);
  let status = dataState(statusBody.state);
  if (rawPlans.length > 0 && setups.length === 0) status = 'provider_limited';
  return {
    status,
    market: textValue(body.signals_market)?.toUpperCase() === 'US' ? 'US' : 'IN',
    observedAt,
    regime: textValue(regimeBody.overall) ?? 'UNAVAILABLE',
    breadth: advancing !== null && declining !== null ? { advancing, declining } : null,
    setups,
  };
};
