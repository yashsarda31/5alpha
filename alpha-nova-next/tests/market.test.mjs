import test from 'node:test';
import assert from 'node:assert/strict';
import {number, formatNumber, formatChange, formatPrice, formatMarketCap, formatStamp, symbolPath} from '../src/lib/market.ts';

test('large US values use international grouping and compact market caps', () => {
  assert.equal(formatPrice(1234567.89, 'US'), '$1,234,567.89');
  assert.equal(formatPrice(1234567.89, 'IN'), '₹12,34,567.89');
  assert.equal(formatMarketCap(5443899100016, 'US'), '$5.44T');
  assert.equal(formatMarketCap(16888525488128, 'IN'), '₹16.89T');
  for (const value of [null, '', NaN, -1, 0]) assert.equal(formatMarketCap(value), 'Unavailable');
});
test('missing and invalid data never becomes a zero quote',()=>{
  for(const value of [null, undefined, '', ' ', NaN, Infinity, true, {}, [], 'bad']) { assert.equal(number(value),null); assert.equal(formatPrice(value),'—'); }
  assert.equal(number(0),0); assert.equal(number('123.5'),123.5);
});
test('quotes have correct currency and change direction',()=>{
  assert.equal(formatPrice(1234.5,'IN'),'₹1,234.50'); assert.equal(formatPrice(12,'US'),'$12.00');
  assert.equal(formatChange(-1.25),'-1.25%'); assert.equal(formatChange(0),'0.00%'); assert.equal(formatChange(2.3),'+2.30%'); assert.equal(formatNumber(Infinity),'—');
});
test('symbol links keep market and suffix unambiguous',()=>{
  assert.equal(symbolPath('RELIANCE','IN'),'/chart?symbol=RELIANCE.NS&market=IN'); assert.equal(symbolPath('AAPL','US'),'/chart?symbol=AAPL&market=US'); assert.equal(symbolPath('RELIANCE.NS','IN'),'/chart?symbol=RELIANCE.NS&market=IN');
});
test('source dates retain timezone and unavailable state',()=>{
  assert.equal(formatStamp(undefined),'Source time unavailable'); assert.equal(formatStamp('bad'),'Source time unavailable'); assert.match(formatStamp('2026-09-20T10:00:00+05:30'),/10:00/);
});
