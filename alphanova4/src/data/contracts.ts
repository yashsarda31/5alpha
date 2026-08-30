export type DataState = 'ready' | 'stale' | 'provider_limited' | 'unavailable';

export type ResourceState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready' | 'stale'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };

export interface IndexPoint {
  name: string;
  last: number;
  changePct: number;
  spark: number[];
}

export interface MoverPoint {
  symbol: string;
  last: number;
  changePct: number;
  spark: number[];
}

export interface DashboardViewModel {
  status: DataState;
  marketOpen: boolean | null;
  indices: IndexPoint[];
  movers: MoverPoint[];
}

export interface BreadthViewModel {
  advancing: number;
  declining: number;
}

export interface SignalSetup {
  symbol: string;
  side: 'LONG' | 'SHORT';
  score: number;
  observedAt: string | null;
  entry: number;
  stop: number;
  target: number;
  invalidation: string | null;
  methodology: string;
  riskContext: string | null;
}

export interface SignalsViewModel {
  status: DataState;
  market: 'IN' | 'US';
  observedAt: string | null;
  regime: string;
  breadth: BreadthViewModel | null;
  setups: SignalSetup[];
}

export interface ChartViewModel {
  ticker: string;
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  sma20: number[];
  sma50: number[];
  rsi: number[];
}

export interface FundamentalsViewModel {
  marketCap: number | null;
  peRatio: number | null;
  roe: number | null;
  debtToEquity: number | null;
}

export interface WatchlistItem {
  symbol: string;
  market: 'IN' | 'US';
  sector?: string | null;
  addedAt?: string | null;
}

export interface WatchlistRow extends WatchlistItem {
  last: number | null;
  changePct: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  spark: number[];
  quoteState: 'ready' | 'unavailable';
}
