import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleUrl = new URL('./apiClient.js', import.meta.url);

test('apiClient sends JSON and returns an axios-compatible data envelope', async () => {
  assert.equal(fs.existsSync(moduleUrl), true, 'apiClient.js must exist');
  const { apiClient } = await import(moduleUrl);
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await apiClient.post('/api/example', { symbol: 'INFY' }, { headers: { Authorization: 'Bearer x' } });
    assert.deepEqual(response.data, { ok: true });
    assert.equal(request.url, '/api/example');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer x');
    assert.equal(request.options.headers['Content-Type'], 'application/json');
    assert.equal(request.options.body, JSON.stringify({ symbol: 'INFY' }));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('apiClient exposes response status and payload on errors', async () => {
  assert.equal(fs.existsSync(moduleUrl), true, 'apiClient.js must exist');
  const { apiClient } = await import(moduleUrl);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Denied' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });

  try {
    await assert.rejects(
      apiClient.get('/api/private'),
      (error) => error.response?.status === 403 && error.response?.data?.detail === 'Denied',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('always-loaded providers do not import Axios', () => {
  for (const path of ['../AuthContext.jsx', '../WatchlistContext.jsx', '../PredictionContext.jsx']) {
    const code = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(code, /from 'axios'/, path);
    assert.match(code, /apiClient/);
  }
});
