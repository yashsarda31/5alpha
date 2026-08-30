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
  const length = Math.min(dates.length, open.length, high.length, low.length, close.length, volume.length, sma20.length, sma50.length, rsi.length);
  const result: ChartViewModel = {
    ticker: textValue(body.ticker)?.toUpperCase() ?? 'UNKNOWN',
    dates: [], open: [], high: [], low: [], close: [], volume: [], sma20: [], sma50: [], rsi: [],
  };
  for (let index = 0; index < length; index += 1) {
    const date = textValue(dates[index]);
    const values = [
      finitePositive(open[index]), finitePositive(high[index]), finitePositive(low[index]), finitePositive(close[index]),
      finiteNumber(volume[index]), finitePositive(sma20[index]), finitePositive(sma50[index]), finiteNumber(rsi[index]),
    ];
    if (!date || values.some((value) => value === null) || (values[4] as number) < 0) continue;
    result.dates.push(date);
    result.open.push(values[0] as number);
    result.high.push(values[1] as number);
    result.low.push(values[2] as number);
    result.close.push(values[3] as number);
    result.volume.push(values[4] as number);
    result.sma20.push(values[5] as number);
    result.sma50.push(values[6] as number);
    result.rsi.push(values[7] as number);
  }
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
