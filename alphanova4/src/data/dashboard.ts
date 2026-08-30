import type { DashboardViewModel, IndexPoint, MoverPoint } from './contracts';
import { finiteNumber, finitePositive, finiteSeries, textValue } from './finite';

type RawRecord = Record<string, unknown>;
const record = (value: unknown): RawRecord => value && typeof value === 'object' ? value as RawRecord : {};

const indexPoint = (raw: unknown): IndexPoint | null => {
  const row = record(raw);
  const name = textValue(row.name);
  const last = finitePositive(row.last);
  const changePct = finiteNumber(row.change_pct);
  return name && last !== null && changePct !== null
    ? { name, last, changePct, spark: finiteSeries(row.spark) }
    : null;
};

const moverPoint = (raw: unknown): MoverPoint | null => {
  const row = record(raw);
  const symbol = textValue(row.ticker ?? row.symbol)?.toUpperCase() ?? null;
  const last = finitePositive(row.last);
  const changePct = finiteNumber(row.change_pct);
  return symbol && last !== null && changePct !== null
    ? { symbol, last, changePct, spark: finiteSeries(row.spark) }
    : null;
};

export const normalizeDashboard = (raw: unknown): DashboardViewModel => {
  const body = record(raw);
  const indices = (Array.isArray(body.indices) ? body.indices : []).map(indexPoint).filter((row): row is IndexPoint => row !== null);
  const movers = (Array.isArray(body.movers) ? body.movers : []).map(moverPoint).filter((row): row is MoverPoint => row !== null);
  return {
    status: indices.length || movers.length ? 'ready' : 'unavailable',
    marketOpen: typeof body.market_open === 'boolean' ? body.market_open : null,
    indices,
    movers,
  };
};
