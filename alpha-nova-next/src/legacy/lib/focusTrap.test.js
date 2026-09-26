import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFocusIndex } from './focusTrap.js';

test('nextFocusIndex wraps Tab and Shift+Tab inside an overlay', () => {
  assert.equal(nextFocusIndex(4, 3, false), 0);
  assert.equal(nextFocusIndex(4, 0, true), 3);
  assert.equal(nextFocusIndex(4, 1, false), 2);
  assert.equal(nextFocusIndex(0, 0, false), -1);
});
