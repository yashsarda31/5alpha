import test from 'node:test';
import assert from 'node:assert/strict';

let dcf = {};
try {
  dcf = await import('./dcfMath.js');
} catch {
  // The first TDD run intentionally exercises the missing implementation.
}

const missing = () => Number.NaN;
const stepDcfNumber = dcf.stepDcfNumber || missing;
const sanitizeDcfNumber = dcf.sanitizeDcfNumber || missing;
const selectDcfBasis = dcf.selectDcfBasis || missing;
const calculateDcf = dcf.calculateDcf || missing;
const formatDcfMoney = dcf.formatDcfMoney || missing;
const formatDcfPercent = dcf.formatDcfPercent || missing;
const formatMarketCap = dcf.formatMarketCap || missing;

test('a 0.1 step preserves a two-decimal fetched growth rate', () => {
  assert.equal(stepDcfNumber(6.88, 0.1, -50, 100), 6.98);
  assert.equal(stepDcfNumber(6.88, -0.1, -50, 100), 6.78);
});

test('steppers preserve entered precision and clamp to their domain', () => {
  assert.equal(stepDcfNumber(11.25, 1, 1, 50), 12.25);
  assert.equal(stepDcfNumber(49.75, 1, 1, 50), 50);
  assert.equal(stepDcfNumber(-9.95, -0.1, -10, 20), -10);
});

test('typed values use the same limits as the stepper buttons', () => {
  assert.equal(sanitizeDcfNumber('0', { min: 1, max: 30, integer: true }), 1);
  assert.equal(sanitizeDcfNumber('31', { min: 1, max: 30, integer: true }), 30);
  assert.equal(sanitizeDcfNumber('1000', { min: -50, max: 100 }), 100);
});

test('provider float noise is normalized for editable controls', () => {
  assert.equal(sanitizeDcfNumber(6.880000114440918, { min: -50, max: 100 }), 6.88);
  assert.equal(sanitizeDcfNumber(8.729999542236328, { min: 0, max: 1_000_000, precision: 3 }), 8.73);
});

test('auto selection never builds a valuation from a negative basis', () => {
  assert.deepEqual(
    selectDcfBasis({ eps: -2.98, fcf: 1.23456, dividend: 0 }),
    { basedOn: 'FCF', baseValue: 1.235 },
  );
  assert.deepEqual(
    selectDcfBasis({ eps: -2.98, fcf: -5, dividend: 0 }),
    { basedOn: 'EPS w/o NRI', baseValue: 0 },
  );
});

test('an invalid valuation is unavailable instead of a negative value with 0% safety', () => {
  assert.deepEqual(calculateDcf({ baseValue: -2, stockPrice: 17 }), {
    growthValue: null,
    terminalValue: null,
    fairValue: null,
    marginOfSafety: null,
  });
});

test('display rounding is half-up and never renders negative zero', () => {
  assert.equal(formatDcfMoney(1.005, '$'), '$1.01');
  assert.equal(formatDcfMoney(-0.0001, '$'), '$0.00');
  assert.equal(formatDcfPercent(-0.000001), '0.00%');
});

test('market cap uses a readable adaptive unit', () => {
  assert.equal(formatMarketCap(4_901_760_000_000, '$'), '$4.90T');
  assert.equal(formatMarketCap(20_450_000_000, '₹'), '₹20.45B');
  assert.equal(formatMarketCap(null, '$'), 'N/A');
});
