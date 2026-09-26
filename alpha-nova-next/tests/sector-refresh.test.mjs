import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('sector refresh failure warns while retaining the last successful snapshot', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { search: '?market=IN' } };
  const server = await createServer({
    server: { middlewareMode: true }, appType: 'custom',
    plugins: [{ name: 'sector-refresh-fixture', enforce: 'pre', load(id) {
      if (id.replaceAll('\\', '/').endsWith('/legacy/lib/swrCache.js')) return `
        export const useSWR = () => ({ refreshing: false, error: new Error('Offline'), revalidate() {},
          data: { market: 'IN', sectors: [], leaders: ['Nifty Pharma'], laggards: [],
            quadrant_counts: {}, benchmark: { name: 'NIFTY 50' }, as_of: '2026-09-22 15:30 IST' } });`;
      if (id.replaceAll('\\', '/').endsWith('/legacy/components/Plot.jsx')) return 'export default function Plot() { return null; }';
    } }],
  });
  try {
    const { default: SectorRotation } = await server.ssrLoadModule('/src/legacy/pages/SectorRotation.jsx');
    const markup = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SectorRotation)));
    assert.match(markup, /role="alert"/);
    assert.match(markup, /Refresh failed/);
    assert.match(markup, /previous sector snapshot/);
    assert.match(markup, /2026-09-22 15:30 IST/);
    assert.match(markup, /Pharma/);
    assert.match(markup, /Retry/);
  } finally {
    await server.close();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
