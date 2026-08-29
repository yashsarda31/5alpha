import test from 'node:test';
import assert from 'node:assert/strict';
import { TOAST_TTL_MS, enqueueToast } from './alertPresentation.js';

test('signal alerts show one toast at a time', () => {
  assert.deepEqual(enqueueToast([{ id: 'old' }], { id: 'new' }), [{ id: 'new' }]);
});

test('signal alerts expire after five seconds', () => {
  assert.equal(TOAST_TTL_MS, 5000);
});
