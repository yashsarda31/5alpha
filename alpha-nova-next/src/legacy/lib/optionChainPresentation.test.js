import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuildupColorClass, getBuildupLabel } from './optionChainPresentation.js';

test('put short buildup is labelled Put Selling and colored green', () => {
  assert.equal(getBuildupLabel('Short Buildup', 'put'), 'Put Selling');
  assert.equal(getBuildupColorClass('Short Buildup', 'put'), 'text-green');
});

test('call short buildup remains Call Selling and red', () => {
  assert.equal(getBuildupLabel('Short Buildup', 'call'), 'Call Selling');
  assert.equal(getBuildupColorClass('Short Buildup', 'call'), 'text-red');
});

test('all non-selling buildup colors retain the current contract', () => {
  assert.equal(getBuildupColorClass('Long Buildup', 'call'), 'text-green');
  assert.equal(getBuildupColorClass('Long Buildup', 'put'), 'text-green');
  assert.equal(getBuildupColorClass('Short Covering', 'call'), 'text-green');
  assert.equal(getBuildupColorClass('Long Unwinding', 'put'), 'text-red');
  assert.equal(getBuildupColorClass('Unknown', 'put'), 'text-neutral');
});
