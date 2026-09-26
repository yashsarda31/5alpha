import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_DEVICE_KEY,
  FIRST_RUN_KEY,
  VISITOR_DAY_KEY,
  buildEventPayload,
  clearProductAnalyticsStorage,
  istDayKey,
  trackDailySiteVisit,
} from './productAnalytics.js';

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('analytics payload strips query, symbol, identity, and tokens', () => {
  const payload = buildEventPayload('analyse_loaded', {
    route: '/chart?symbol=RELIANCE',
    market: 'IN',
    symbol: 'RELIANCE',
    email: 'person@example.com',
    token: 'secret',
  }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f', new Date('2026-08-29T04:30:00Z'));

  assert.deepEqual(payload, {
    event: 'analyse_loaded',
    device_id: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    occurred_at: '2026-08-29T04:30:00.000Z',
    route: '/chart',
    market: 'IN',
  });
});

test('unknown events and routes are rejected before transport', () => {
  assert.equal(buildEventPayload('searched_symbol', { route: '/chart', market: 'IN' }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f'), null);
  assert.equal(buildEventPayload('analyse_loaded', { route: '/private', market: 'IN' }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f'), null);
});

test('site visit payload uses only the canonical site route', () => {
  assert.deepEqual(
    buildEventPayload('site_visit', { route: '/', market: '' },
      '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
      new Date('2026-09-02T08:00:00Z')),
    {
      event: 'site_visit',
      device_id: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
      occurred_at: '2026-09-02T08:00:00.000Z',
      route: '/',
      market: '',
    },
  );
});

test('IST day key rolls over at 18:30 UTC', () => {
  assert.equal(istDayKey(new Date('2026-09-02T18:29:59Z')), '2026-09-02');
  assert.equal(istDayKey(new Date('2026-09-02T18:30:00Z')), '2026-09-03');
});

test('daily site visit sends once after acceptance and sends again next IST day', async () => {
  const storage = memoryStorage();
  const calls = [];
  const sendEvent = async (...args) => { calls.push(args); return true; };

  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T18:29:00Z'), storage, sendEvent,
  }), true);
  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T18:29:30Z'), storage, sendEvent,
  }), false);
  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T18:30:00Z'), storage, sendEvent,
  }), true);

  assert.deepEqual(calls, [
    ['site_visit', { route: '/', market: '' }],
    ['site_visit', { route: '/', market: '' }],
  ]);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), '2026-09-03');
});

test('failed and concurrent site visit attempts remain retryable without duplicates', async () => {
  const storage = memoryStorage();
  let calls = 0;
  let accept = false;
  const sendEvent = async () => { calls += 1; return accept; };
  const options = {
    now: new Date('2026-09-02T08:00:00Z'), storage, sendEvent,
  };

  assert.equal(await trackDailySiteVisit(options), false);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), null);
  accept = true;
  const [first, second] = await Promise.all([
    trackDailySiteVisit(options),
    trackDailySiteVisit(options),
  ]);

  assert.deepEqual([first, second], [true, true]);
  assert.equal(calls, 2);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), '2026-09-02');
});

test('visitor tracking absorbs transport errors and reset cleanup removes its marker', async () => {
  const failingStorage = memoryStorage();
  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T08:00:00Z'),
    storage: failingStorage,
    sendEvent: async () => { throw new Error('offline'); },
  }), false);
  assert.equal(failingStorage.getItem(VISITOR_DAY_KEY), null);

  const storage = memoryStorage({
    [ANALYTICS_DEVICE_KEY]: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    [FIRST_RUN_KEY]: '{}',
    [VISITOR_DAY_KEY]: '2026-09-02',
    alphanova_analytics_last_visit_day: '2026-09-01',
  });
  assert.equal(clearProductAnalyticsStorage(storage), true);
  assert.equal(storage.getItem(ANALYTICS_DEVICE_KEY), null);
  assert.equal(storage.getItem(FIRST_RUN_KEY), null);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), null);
  assert.equal(storage.getItem('alphanova_analytics_last_visit_day'), null);
});
