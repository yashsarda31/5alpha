import { number } from './market';
export function validSeries(input: unknown): number[] {
  if (!Array.isArray(input) || input.length < 2) return [];
  const values = input.map(number);
  return values.every((value): value is number => value !== null && value > 0) ? values : [];
}
export function seriesPath(values: number[], width: number, height: number, pad = 8): string {
  if (values.length < 2 || values.some(value => !Number.isFinite(value))) return '';
  const low = Math.min(...values), high = Math.max(...values);
  const range = high - low;
  return values.map((value, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1) * width).toFixed(2)},${(range === 0 ? height / 2 : pad + (high - value) / range * (height - pad * 2)).toFixed(2)}`).join(' ');
}
