import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function fixture({ readFails = false, writeFails = false } = {}) {
  const handlers = {};
  const stored = new Map([['/', new Response('healthy app shell', { headers: { 'content-type': 'text/html' } })]]);
  const cache = { match: async key => { if (readFails) throw new Error('cache unavailable'); return stored.get(key)?.clone(); }, put: async (key, response) => { if (writeFails) throw new Error('quota exceeded'); stored.set(key, response); } };
  let network = new Response('new app shell', { headers: { 'content-type': 'text/html' } });
  vm.runInNewContext(source, {
    URL, self: { location: { origin: 'https://example.test' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache, match: cache.match },
    fetch: async () => { if (network instanceof Error) throw network; return network.clone(); },
  });
  return {
    stored,
    network: response => { network = response; },
    async navigate(path) {
      let response;
      const pending = [];
      handlers.fetch({ request: { url: `https://example.test${path}`, method: 'GET', mode: 'navigate' },
        respondWith: value => { response = value; }, waitUntil: value => pending.push(value) });
      const result = await response;
      await Promise.all(pending);
      await Promise.resolve();
      return result;
    },
  };
}

test('a failed navigation cannot overwrite the healthy offline shell', async () => {
  const app = fixture();
  app.network(new Response('upstream error', { status: 503, headers: { 'content-type': 'text/html' } }));
  assert.equal((await app.navigate('/dashboard')).status, 503);
  app.network(new Error('offline'));
  assert.equal(await (await app.navigate('/dashboard')).text(), 'healthy app shell');
});

test('standalone share documents cannot replace the offline application', async () => {
  const app = fixture();
  app.network(new Response('standalone share document', { headers: { 'content-type': 'text/html' } }));
  await app.navigate('/s/test-share');
  app.network(new Error('offline'));
  assert.equal(await (await app.navigate('/signals')).text(), 'healthy app shell');
});

test('non-HTML navigation responses cannot replace the offline shell', async () => {
  const app = fixture();
  app.network(new Response('{}', { headers: { 'content-type': 'application/json' } }));
  await app.navigate('/dashboard');
  assert.equal(await app.stored.get('/').text(), 'healthy app shell');
});

test('a successful dashboard navigation updates the offline shell', async () => {
  const app = fixture();
  await app.navigate('/dashboard');
  app.network(new Error('offline'));
  assert.equal(await (await app.navigate('/watchlist')).text(), 'new app shell');
});

test('asset cache read or write failure still returns the working network response', async () => {
  for (const options of [{ readFails: true }, { writeFails: true }]) {
    const app = fixture(options);
    app.network(new Response('export default 1', { headers: { 'content-type': 'text/javascript' } }));
    assert.equal(await (await app.navigate('/assets/page-123.js')).text(), 'export default 1');
  }
});

test('HTML fallback for an obsolete asset never poisons the immutable cache', async () => {
  const app = fixture();
  app.network(new Response('<html>app shell</html>', { headers: { 'content-type': 'text/html' } }));
  await app.navigate('/assets/obsolete.js');
  assert.equal(app.stored.size, 1);
});
