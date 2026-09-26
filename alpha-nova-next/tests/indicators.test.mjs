import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, bollinger } from '../src/lib/indicators.js';

const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

test('ema seeds with SMA and tracks upward trend', () => {
  const out = ema(closes, 5);
  assert.equal(out.length, closes.length);
  assert.equal(out[0], null);
  assert.equal(out[3], null);
  assert.ok(out.at(-1) > out.at(-2));
});

test('ema returns nulls when history is insufficient', () => {
  assert.deepEqual(ema([1, 2], 5), [null, null]);
  assert.deepEqual(ema([], 5), []);
});

test('bollinger middle equals SMA20 and bands widen with volatility', () => {
  const flat = Array(20).fill(100);
  const b = bollinger(flat, 20, 2);
  assert.equal(b.middle.at(-1), 100);
  assert.equal(b.upper.at(-1), 100);
  assert.equal(b.lower.at(-1), 100);
  const volatile = [...Array(19).fill(100), 200];
  const b2 = bollinger(volatile, 20, 2);
  assert.ok(b2.upper.at(-1) > b2.middle.at(-1));
  assert.ok(b2.lower.at(-1) < b2.middle.at(-1));
});

test('bollinger guards short history with nulls', () => {
  const b = bollinger([1, 2, 3], 20, 2);
  assert.deepEqual(b.middle, [null, null, null]);
});
