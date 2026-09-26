import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalFields, createArrivalTracker, ARRIVAL_KEY } from './trafficArrival.js';
import { sendAnalyticsRequest } from './analyticsTransport.js';

const device = '7d1c74ef-8da5-4a78-9eab-8f35145d172f';
const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
};
const ad = { pathname: '/signals', search: '?utm_source=youtube&utm_medium=paid_video&utm_campaign=launch&email=private&gclid=secret' };

test('only normalized paths and bounded campaign labels are collected', () => {
  assert.deepEqual(arrivalFields(ad), { landing: '/signals', source: 'youtube', medium: 'paid_video', campaign: 'launch' });
  assert.deepEqual(arrivalFields({ pathname: '/stocks/RELIANCE/delivery-percentage', search: '?utm_campaign=person%40example.com' }),
    { landing: '/stocks/:symbol/delivery-percentage', source: '', medium: '', campaign: '' });
  assert.equal(arrivalFields({ pathname: '/api/admin/metrics' }), null);
  assert.equal(arrivalFields({ pathname: '/owner-analytics.html' }), null);
  assert.equal(arrivalFields({ pathname: '/unknown/private-identifier' }).landing, '/other');
});

test('one tab visit, new campaign, and a 30-minute absence have distinct semantics', async () => {
  let time = 1000;
  const calls = [];
  const track = createArrivalTracker({ storage: memoryStorage(), deviceId: () => device,
    now: () => time, uuid: () => `id-${calls.length}`, send: async (payload) => { calls.push(payload); return true; } });
  assert.equal(await track(ad), true);
  assert.equal(await track(ad), false);
  assert.equal(await track({ pathname: '/chart', search: '' }), false);
  assert.equal(await track({ ...ad, search: '?utm_source=youtube&utm_campaign=second' }), true);
  time += 30 * 60 * 1000;
  assert.equal(await track(ad), true);
  assert.equal(calls.length, 3);
});

test('failed arrival survives reload with its original event ID', async () => {
  const storage = memoryStorage();
  const calls = [];
  const options = { storage, deviceId: () => device, now: () => 1000,
    uuid: () => 'fixed-id', send: async (p) => { calls.push(p); return false; } };
  assert.equal(await createArrivalTracker(options)(ad), false);
  assert.equal(JSON.parse(storage.getItem(ARRIVAL_KEY)).accepted, false);
  assert.equal(await createArrivalTracker({ ...options, uuid: () => 'must-not-be-used',
    send: async (p) => { calls.push(p); return true; } })(ad), true);
  assert.deepEqual(calls[0], calls[1]);
});

test('concurrent mounting does not double count and identity reset starts fresh', async () => {
  let currentDevice = device;
  let calls = 0;
  const track = createArrivalTracker({ storage: memoryStorage(), deviceId: () => currentDevice,
    uuid: () => 'id', send: async () => { calls += 1; return true; } });
  await Promise.all([track(ad), track(ad)]);
  assert.equal(calls, 1);
  currentDevice = '0e1334ee-e1b1-4e55-b262-9420bb550251';
  assert.equal(await track(ad), true);
  assert.equal(calls, 2);
});

test('private mode or transport exceptions never break navigation', async () => {
  const track = createArrivalTracker({ deviceId: () => null });
  assert.equal(await track(ad), false);
  const broken = createArrivalTracker({ deviceId: () => device, uuid: () => 'id',
    send: async () => { throw new Error('offline'); } });
  assert.equal(await broken(ad), false);
});

test('a changed campaign during an outstanding save is collected afterward', async () => {
  const calls = [];
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const track = createArrivalTracker({ storage: memoryStorage(), deviceId: () => device,
    uuid: () => `id-${calls.length}`, send: async (p) => {
      calls.push(p);
      if (calls.length === 1) await pending;
      return true;
    } });
  const first = track(ad);
  const second = track({ ...ad, search: '?utm_campaign=second' });
  finish();
  await Promise.all([first, second]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(p => p.campaign), ['launch', 'second']);
});

test('retry transport preserves exact request and stops at three failed attempts', async () => {
  const calls = [];
  const options = { method: 'POST', body: '{"event_id":"stable"}' };
  assert.equal(await sendAnalyticsRequest('/api/analytics/arrival', options, {
    wait: async () => {}, fetchImpl: async (url, request) => {
      calls.push([url, request.body]); return { ok: false, status: 503 };
    },
  }), false);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([url, body]) => url === '/api/analytics/arrival' && body === options.body));
});

test('validation failures are not retried and transient failure can recover', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: calls === 2, status: 503 }; };
  assert.equal(await sendAnalyticsRequest('/api/analytics/arrival', {}, { fetchImpl, wait: async () => {} }), true);
  assert.equal(calls, 2);
  calls = 0;
  assert.equal(await sendAnalyticsRequest('/api/analytics/arrival', {}, {
    fetchImpl: async () => { calls += 1; return { ok: false, status: 422 }; }, wait: async () => {},
  }), false);
  assert.equal(calls, 1);
});
