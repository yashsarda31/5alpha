export const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

export const finitePositive = (value: unknown): number | null => {
  const number = finiteNumber(value);
  return number !== null && number > 0 ? number : null;
};

export const finiteSeries = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value.map(finiteNumber).filter((item): item is number => item !== null);
};

export const textValue = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
};
