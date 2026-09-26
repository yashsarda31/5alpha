export type AnalysePeriod = '1M' | '3M' | '6M' | '1Y' | '3Y' | 'MAX';

export interface AnalyseChartData {
  ticker?: string;
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  [key: string]: unknown;
}

export function normaliseChart(value: unknown): AnalyseChartData | null;
export function latestObservation(values: unknown): number | null;
export function periodStartIndex(dates: string[], period: AnalysePeriod): number;
export function resolveAnalysisSymbol(raw: string, selectedMarket: 'IN' | 'US'): { symbol: string; market: 'IN' | 'US' };
