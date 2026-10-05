import test from 'node:test';
import assert from 'node:assert/strict';
import { requestResearch, readResearch } from '../src/lib/researchRequests.ts';

const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const nextTick = () => new Promise(resolve => setTimeout(resolve, 10));

test('concurrent readers share one network request and one reader can leave safely', async t => {
  let resolve, signal;
  const fetch = t.mock.method(globalThis, 'fetch', (_url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  const a = requestResearch('/api/signals?market=IN&test=share', null);
  const b = requestResearch('/api/signals?market=IN&test=share', null);
  a.release(); a.release();
  await nextTick();
  assert.equal(signal.aborted, false);
  resolve(json({ as_of: '2026-10-01' }));
  assert.deepEqual(await b.promise, { as_of: '2026-10-01' });
  assert.equal(fetch.mock.callCount(), 1);
  b.release();
});

test('successful snapshots retain timestamps, expire in 15s and refresh bypasses them', async t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({ as_of: '2026-10-01' }));
  const url = '/api/dashboard?test=ttl';
  await requestResearch(url, null).promise;
  now += 14999;
  assert.deepEqual(await requestResearch(url, null).promise, { as_of: '2026-10-01' });
  assert.equal(fetch.mock.callCount(), 1);
  now++;
  assert.equal(readResearch(url, null), null);
  await requestResearch(url, null).promise;
  await requestResearch(url, null, true).promise;
  assert.equal(fetch.mock.callCount(), 3);
});

test('market and account identity do not share snapshots', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, opts) => json({ identity: opts.headers.Authorization || 'guest' }));
  const url = '/api/signals?market=IN&test=identity';
  await requestResearch(url, 'test-a').promise;
  await requestResearch(url, 'test-b').promise;
  await requestResearch(url, null).promise;
  await requestResearch('/api/signals?market=US&test=identity', null).promise;
  assert.equal(fetch.mock.callCount(), 4);
  assert.equal(readResearch(url, 'test-a').identity, 'Bearer test-a');
  assert.equal(readResearch(url, null).identity, 'guest');
});

test('private and intraday responses are never cached', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({ data: 1 }));
  for (const url of ['/api/watchlist', '/api/auth/me', '/api/intraday/RELIANCE.NS']) {
    await requestResearch(url, null).promise;
    await requestResearch(url, null).promise;
    assert.equal(readResearch(url, null), null);
  }
  assert.equal(fetch.mock.callCount(), 6);
});

test('errors and HTML fallbacks are not cached; a failed refresh evicts the old snapshot', async t => {
  let response = json({ old: true });
  t.mock.method(globalThis, 'fetch', async () => response.clone());
  const url = '/api/dashboard?test=error';
  await requestResearch(url, null).promise;
  response = new Response('unavailable', { status: 503 });
  await assert.rejects(requestResearch(url, null, true).promise, /503/);
  assert.equal(readResearch(url, null), null);
  response = new Response('<html>fallback</html>', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(requestResearch(url, null).promise, /unexpected response/);
  assert.equal(readResearch(url, null), null);
  response = json({ recovered: true });
  assert.deepEqual(await requestResearch(url, null).promise, { recovered: true });
});

test('abandoned requests are cancelled, but an immediate remount reuses them', async t => {
  let signal, resolve;
  const fetch = t.mock.method(globalThis, 'fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((yes, no) => { resolve = yes; signal.addEventListener('abort', () => no(new Error('aborted'))); });
  });
  const url = '/api/signals?test=remount';
  const a = requestResearch(url, null);
  a.release();
  const b = requestResearch(url, null);
  await nextTick();
  assert.equal(signal.aborted, false);
  resolve(json({ ok: true }));
  await b.promise;
  b.release();
  assert.equal(fetch.mock.callCount(), 1);
  const c = requestResearch('/api/signals?test=cancel', null);
  const rejected = assert.rejects(c.promise, /took too long/);
  c.release();
  await rejected;
  assert.equal(signal.aborted, true);
});

test('snapshot storage is bounded', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ ok: true }));
  for (let i = 0; i < 41; i++) await requestResearch(`/api/dashboard?test=bounded-${i}`, null).promise;
  assert.equal(readResearch('/api/dashboard?test=bounded-0', null), null);
  assert.deepEqual(readResearch('/api/dashboard?test=bounded-40', null), { ok: true });
});
