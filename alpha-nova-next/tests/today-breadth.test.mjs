import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('dashboard withholds breadth percentages when either count is missing or invalid', async () => {
  let breadth = { adv: 12 };
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom',
    plugins: [{ name: 'breadth-fixture', enforce: 'pre', load(id) {
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/lib/useResource.ts')) return `export function useResource(url) {
        return { data: url.includes('signals') ? { regime: { breadth: globalThis.__qualityBreadth } } : {}, refresh() {} };
      }`;
      if (path.endsWith('/legacy/MarketContext.jsx')) return `export const useMarket = () => ({market:'IN'});`;
      if (path.endsWith('/legacy/WatchlistContext.jsx')) return `export const useWatchlist = () => ({symbols:[]});`;
      if (path.endsWith('/legacy/AuthContext.jsx')) return `export const useAuth = () => ({currentUser:null});`;
      if (path.endsWith('/legacy/components/WatchlistStar.jsx')) return `export default function Star() {return null;}`;
    } }],
  });
  try {
    const { default: Today } = await server.ssrLoadModule('/src/pages/Today.tsx');
    const render = () => {
      globalThis.__qualityBreadth = breadth;
      return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Today)));
    };
    for (breadth of [{adv:12}, {dec:12}, {adv:12,dec:-1}, {adv:12,dec:' '}, {adv:0,dec:0}]) {
      assert.doesNotMatch(render(), /% advancing/, JSON.stringify(breadth));
    }
    breadth = { adv: 12, dec: 0 };
    assert.match(render(), /100% advancing/);
    breadth = { adv: 0, dec: 12 };
    assert.match(render(), /0% advancing/);
  } finally {
    delete globalThis.__qualityBreadth;
    await server.close();
  }
});
