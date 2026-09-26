import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('public research remains accessible when browser storage is blocked', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Storage is blocked', 'SecurityError'); },
  });
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { AuthProvider, useAuth } = await server.ssrLoadModule('/src/legacy/AuthContext.jsx');
    function Probe() {
      const { currentUser, loading } = useAuth();
      assert.equal(currentUser, null);
      assert.equal(loading, false);
      return React.createElement('span', null, 'Public research');
    }
    assert.equal(renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(Probe))), '<span>Public research</span>');
  } finally {
    await server.close();
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
