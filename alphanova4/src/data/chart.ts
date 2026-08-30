import type { ChartViewModel, FundamentalsViewModel } from './contracts';
import { finiteNumber, finitePositive, textValue } from './finite';

type RawRecord = Record<string, unknown>;
const record = (value: unknown): RawRecord => value && typeof value === 'object' ? value as RawRecord : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export const normalizeChart = (raw: unknown): ChartViewModel => {
  const body = record(raw);
  const dates = array(body.dates ?? body.date);
  const open = array(body.open);
  const high = array(body.high);
  const low = array(body.low);
  const close = array(body.close);
  const volume = array(body.volume);
  const sma20 = array(body.sma20);
  const sma50 = array(body.sma50);
  const rsi = array(body.rsi);
  const length = Math.min(dates.length, open.length, high.length, low.length, close.length, volume.length);
  const result: ChartViewModel = {
    ticker: textValue(body.ticker)?.toUpperCase() ?? 'UNKNOWN',
    dates: [], open: [], high: [], low: [], close: [], volume: [], sma20: [], sma50: [], rsi: [],
  };
  const optional = { sma20: [] as Array<number | null>, sma50: [] as Array<number | null>, rsi: [] as Array<number | null> };
  for (let index = 0; index < length; index += 1) {
    const date = textValue(dates[index]);
    const values = [
      finitePositive(open[index]), finitePositive(high[index]), finitePositive(low[index]), finitePositive(close[index]), finiteNumber(volume[index]),
    ];
    if (!date || values.some((value) => value === null) || (values[4] as number) < 0) continue;
    result.dates.push(date);
    result.open.push(values[0] as number);
    result.high.push(values[1] as number);
    result.low.push(values[2] as number);
    result.close.push(values[3] as number);
    result.volume.push(values[4] as number);
    optional.sma20.push(finitePositive(sma20[index]));
    optional.sma50.push(finitePositive(sma50[index]));
    optional.rsi.push(finiteNumber(rsi[index]));
  }
  if (optional.sma20.every((value): value is number => value !== null)) result.sma20 = optional.sma20;
  if (optional.sma50.every((value): value is number => value !== null)) result.sma50 = optional.sma50;
  if (optional.rsi.every((value): value is number => value !== null)) result.rsi = optional.rsi;
  return result;
};

export const normalizeFundamentals = (raw: unknown): FundamentalsViewModel => {
  const body = record(raw);
  return {
    marketCap: finiteNumber(body.market_cap),
    peRatio: finiteNumber(body.pe_ratio ?? body.trailing_pe),
    roe: finiteNumber(body.roe),
    debtToEquity: finiteNumber(body.debt_to_equity),
  };
};
