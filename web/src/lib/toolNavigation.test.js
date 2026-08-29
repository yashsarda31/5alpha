import test from 'node:test';
import assert from 'node:assert/strict';
import { filterToolSections, readRecentTools, recordRecentTool } from './toolNavigation.js';

const sections = [
  { title: 'Research', items: [{ to: '/dcf', label: 'DCF Calculator' }, { to: '/screener', label: 'Quant Screener' }] },
];

test('tool search keeps matching groups and items', () => {
  assert.deepEqual(filterToolSections(sections, 'dcf'), [
    { title: 'Research', items: [{ to: '/dcf', label: 'DCF Calculator' }] },
  ]);
});

test('recent tools are bounded and storage-safe', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  recordRecentTool(storage, { to: '/dcf', label: 'DCF Calculator' });
  recordRecentTool(storage, { to: '/screener', label: 'Quant Screener' });
  assert.deepEqual(readRecentTools(storage).map((item) => item.to), ['/screener', '/dcf']);
  assert.deepEqual(readRecentTools(null), []);
});
