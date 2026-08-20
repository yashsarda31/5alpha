const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const roundTo = (value, precision = 2) => {
  const factor = 10 ** precision;
  const adjusted = value + Math.sign(value || 1) * Number.EPSILON;
  return Math.round(adjusted * factor) / factor;
};

export const stepDcfNumber = (value, delta, min, max, precision = 2) => {
  const current = Number(value);
  const next = Number.isFinite(current) ? current + delta : min;
  return clamp(roundTo(next, precision), min, max);
};

export const sanitizeDcfNumber = (value, {
  min,
  max,
  integer = false,
  precision = 2,
  fallback = min,
}) => {
  const parsed = typeof value === 'string' && value.trim() === '' ? Number.NaN : Number(value);
  const finite = Number.isFinite(parsed) ? parsed : fallback;
  const rounded = integer ? Math.round(finite) : roundTo(finite, precision);
  return clamp(rounded, min, max);
};

const roundedBasis = (value) => roundTo(Number(value), 3);

export const selectDcfBasis = (data = {}) => {
  const choices = [
    ['EPS w/o NRI', data.eps],
    ['FCF', data.fcf],
    ['Adjusted Dividend', data.dividend],
  ];
  const choice = choices.find(([, value]) => Number.isFinite(Number(value)) && Number(value) > 0);
  return choice
    ? { basedOn: choice[0], baseValue: roundedBasis(choice[1]) }
    : { basedOn: 'EPS w/o NRI', baseValue: 0 };
};

export const calculateDcf = ({
  baseValue,
  discountRate = 11,
  growthYears = 10,
  growthRate = 15.2,
  terminalYears = 10,
  terminalRate = 4,
  addTangibleBook = false,
  tangibleBook = 0,
  stockPrice = 0,
} = {}) => {
  const values = [baseValue, discountRate, growthYears, growthRate, terminalYears, terminalRate];
  if (!values.every((value) => Number.isFinite(Number(value))) || Number(baseValue) <= 0) {
    return { growthValue: null, terminalValue: null, fairValue: null, marginOfSafety: null };
  }

  let currentValue = Number(baseValue);
  let growthValue = 0;
  const discount = Number(discountRate) / 100;
  const growth = Number(growthRate) / 100;
  for (let year = 1; year <= Number(growthYears); year += 1) {
    currentValue *= 1 + growth;
    growthValue += currentValue / ((1 + discount) ** year);
  }

  let terminalValue = 0;
  const terminalGrowth = Number(terminalRate) / 100;
  for (let year = 1; year <= Number(terminalYears); year += 1) {
    currentValue *= 1 + terminalGrowth;
    terminalValue += currentValue / ((1 + discount) ** (Number(growthYears) + year));
  }

  const bookValue = addTangibleBook && Number.isFinite(Number(tangibleBook)) ? Number(tangibleBook) : 0;
  const fairValue = growthValue + terminalValue + bookValue;
  if (!Number.isFinite(fairValue) || fairValue <= 0) {
    return { growthValue: null, terminalValue: null, fairValue: null, marginOfSafety: null };
  }

  const price = Number(stockPrice);
  const marginOfSafety = Number.isFinite(price) && price > 0 ? (fairValue - price) / fairValue : null;
  return { growthValue, terminalValue, fairValue, marginOfSafety };
};

const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const normalizeDisplayZero = (value) => Math.abs(value) < 0.005 ? 0 : value;

export const formatDcfMoney = (value, currency = '$') => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${currency}${decimalFormatter.format(normalizeDisplayZero(Number(value)))}`;
};

export const formatDcfPercent = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${decimalFormatter.format(normalizeDisplayZero(Number(value) * 100))}%`;
};

export const formatDcfRatio = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  return decimalFormatter.format(normalizeDisplayZero(Number(value)));
};

export const formatMarketCap = (value, currency = '$') => {
  const amount = Number(value);
  if (value === null || value === undefined || !Number.isFinite(amount) || amount <= 0) return 'N/A';
  if (amount >= 1e12) return `${currency}${decimalFormatter.format(amount / 1e12)}T`;
  if (amount >= 1e9) return `${currency}${decimalFormatter.format(amount / 1e9)}B`;
  if (amount >= 1e6) return `${currency}${decimalFormatter.format(amount / 1e6)}M`;
  return formatDcfMoney(amount, currency);
};
