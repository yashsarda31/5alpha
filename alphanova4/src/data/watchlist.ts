import type { WatchlistItem, WatchlistRow } from './contracts';
import { finiteNumber, finitePositive, finiteSeries, textValue } from './finite';

type RawRecord = Record<string, unknown>;
const record = (value: unknown): RawRecord => value && typeof value === 'object' ? value as RawRecord : {};

export const normalizeSymbol = (value: unknown): string => {
  const symbol = textValue(value)?.toUpperCase() ?? '';
  return symbol.endsWith('.NS') ? symbol.slice(0, -3) : symbol;
};

const itemFrom = (raw: unknown): WatchlistItem | null => {
  const body = record(raw);
  const symbol = normalizeSymbol(body.symbol);
  if (!symbol) return null;
  return {
    symbol,
    market: textValue(body.market)?.toUpperCase() === 'US' ? 'US' : 'IN',
    sector: textValue(body.sector),
    addedAt: textValue(body.added_at),
  };
};

export const normalizeWatchlist = (rawItems: unknown, rawQuotes: unknown): WatchlistRow[] => {
  const items = (Array.isArray(rawItems) ? rawItems : []).map(itemFrom).filter((item): item is WatchlistItem => item !== null);
  const quotes = new Map((Array.isArray(rawQuotes) ? rawQuotes : []).map((quote) => {
    const body = record(quote);
    return [normalizeSymbol(body.symbol), body] as const;
  }));
  return items.map((item) => {
    const quote = quotes.get(item.symbol) ?? {};
    const last = finitePositive(quote.last);
    const changePct = finiteNumber(quote.change_pct);
    return {
      ...item,
      last,
      changePct,
      dayLow: finitePositive(quote.day_low),
      dayHigh: finitePositive(quote.day_high),
      spark: finiteSeries(quote.spark),
      quoteState: last !== null && changePct !== null ? 'ready' : 'unavailable',
    };
  });
};
