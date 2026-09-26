import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('shared market links resolve before the first child render', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { MarketProvider, useMarket } = await server.ssrLoadModule('/src/legacy/MarketContext.jsx');
    function Probe() { return React.createElement('span', null, useMarket().market); }
    for (const [url, expected] of [
      ['/chart?market=US', 'US'],
      ['/dashboard?market=us', 'US'],
      ['/signals?market=IN', 'IN'],
      ['/chart?market=invalid', 'IN'],
      ['/chart', 'IN'],
    ]) {
      const result = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [url] },
        React.createElement(MarketProvider, null, React.createElement(Probe))));
      assert.equal(result, `<span>${expected}</span>`, url);
    }
  } finally { await server.close(); }
});
