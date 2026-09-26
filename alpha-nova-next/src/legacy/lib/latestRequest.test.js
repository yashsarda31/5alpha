import test from 'node:test';
import assert from 'node:assert/strict';

let latestRequest = {};
try {
  latestRequest = await import('./latestRequest.js');
} catch {
  // The first TDD run intentionally exercises the missing implementation.
}

const createLatestRequestGuard = latestRequest.createLatestRequestGuard || (() => ({
  begin: () => 0,
  isCurrent: () => false,
}));

test('only the newest overlapping request may commit results', () => {
  const guard = createLatestRequestGuard();
  const first = guard.begin();
  const second = guard.begin();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
});
