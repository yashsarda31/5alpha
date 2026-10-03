import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('missing provider fundamentals stay unavailable while measured zero remains zero', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const page = await server.ssrLoadModule('/src/legacy/pages/Fundamentals.jsx');
    for (const value of [null, undefined, '', 'N/A', Infinity, NaN, false]) {
      assert.equal(page.formatFundamentalValue?.(value, '%'), 'N/A', String(value));
    }
    assert.equal(page.formatFundamentalValue(0, '%'), '0.00%');
    assert.equal(page.formatFundamentalValue('21.14'), '21.14');
    assert.equal(page.formatFundamentalValue(-22.4, '%'), '-22.40%');
  } finally { await server.close(); }
});
