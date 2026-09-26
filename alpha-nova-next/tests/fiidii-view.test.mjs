import test from 'node:test';
import assert from 'node:assert/strict';
import { fiidiiFreshness } from '../src/legacy/lib/fiidiiView.js';

test('reports the latest source session and stale snapshot age', () => {
  const result = fiidiiFreshness({
    data: [{ date: '18-Sep-2026' }],
    updated_at: '2026-09-07T09:33:25Z',
    source_status: 'stale',
    is_stale: true,
  });

  assert.equal(result.latestSession, '18 Sep 2026');
  assert.equal(result.isStale, true);
  assert.match(result.message, /Snapshot last refreshed 7 Sep 2026/i);
});

test('uses explicit latest_session_date when rows are absent', () => {
  const result = fiidiiFreshness({
    data: [],
    latest_session_date: '18-Sep-2026',
    updated_at: '2026-09-18T13:35:00Z',
    source_status: 'fresh',
    is_stale: false,
  });

  assert.equal(result.latestSession, '18 Sep 2026');
  assert.equal(result.isStale, false);
});

