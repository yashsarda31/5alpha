import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardNumber, dashboardChange } from './dashboardDisplay.js';

test('missing dashboard quotes remain unavailable instead of becoming zero', () => {
  for (const value of [null, undefined, '', ' ', 'invalid', Infinity, NaN]) {
    assert.equal(dashboardNumber(value), null);
    assert.deepEqual(dashboardChange(value), { label: 'N/A', tone: '' });
  }
});

test('dashboard changes handle numeric strings, real zero and both directions', () => {
  assert.equal(dashboardNumber('123.45'), 123.45);
  assert.deepEqual(dashboardChange(0), { label: '0.00%', tone: '' });
  assert.deepEqual(dashboardChange('1.25'), { label: '+1.25%', tone: 'tone-gain' });
  assert.deepEqual(dashboardChange(-2.3), { label: '-2.30%', tone: 'tone-loss' });
});
