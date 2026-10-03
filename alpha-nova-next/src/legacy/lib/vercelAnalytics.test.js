import test from 'node:test';
import assert from 'node:assert/strict';
import { beforeSendVercelAnalytics, createVercelBeforeSend, shouldEnableVercelAnalytics } from './vercelAnalytics.js';

const pageview = (url) => beforeSendVercelAnalytics({ type: 'pageview', url });

test('only a production build on a public production hostname enables collection', () => {
  assert.equal(shouldEnableVercelAnalytics({ production: true, hostname: 'abovealphasolutions.com' }), true);
  assert.equal(shouldEnableVercelAnalytics({ production: true, hostname: 'www.abovealphasolutions.com' }), true);
  for (const hostname of ['localhost', '127.0.0.1', 'preview.vercel.app', 'evil-abovealphasolutions.com']) {
    assert.equal(shouldEnableVercelAnalytics({ production: true, hostname }), false);
  }
  assert.equal(shouldEnableVercelAnalytics({ production: false, hostname: 'abovealphasolutions.com' }), false);
  assert.equal(shouldEnableVercelAnalytics(), false);
});

test('retains bounded campaign labels while stripping credentials, click identifiers, fragments and extras', () => {
  const event = beforeSendVercelAnalytics({
    type: 'pageview',
    url: 'https://abovealphasolutions.com/?utm_source=youtube&utm_medium=paid_video&utm_campaign=September-2026&gclid=secret&token=secret&email=person%40example.com#access_token=secret',
    data: { email: 'person@example.com' },
  });
  assert.deepEqual(event, { type: 'pageview', url: 'https://abovealphasolutions.com/?utm_source=youtube&utm_medium=paid_video&utm_campaign=September-2026' });
  assert.equal(pageview('https://abovealphasolutions.com/chart?symbol=INFY#secret').url, 'https://abovealphasolutions.com/chart');
});

test('drops malformed, duplicate and overlong campaign labels', () => {
  for (const query of ['utm_campaign=person%40example.com', 'utm_source=a&utm_source=b', `utm_campaign=${'a'.repeat(81)}`, 'utm_campaign=secret%2Fpath', 'utm_medium=%0Asecret', 'utm_content=secret&utm_term=secret']) {
    assert.equal(pageview(`https://abovealphasolutions.com/dashboard?${query}`).url, 'https://abovealphasolutions.com/dashboard');
  }
  assert.ok(pageview(`https://abovealphasolutions.com/?utm_campaign=${'a'.repeat(64)}`).url.endsWith('a'.repeat(64)));
});

test('excludes private, auth-sensitive and unknown dynamic paths', () => {
  for (const path of ['/login', '/watchlist', '/trading-game', '/admin', '/owner', '/api/auth/callback', '/auth/reset/secret', '/stocks/SECRET/delivery-percentage', '/s/SECRET', '/unknown/secret', '/alphanova48-growth-dashboard.html', '/%64ashboard']) {
    assert.equal(pageview(`https://abovealphasolutions.com${path}?utm_source=youtube`), null, path);
  }
});

test('rejects unsafe origins, credentials, malformed values and custom events', () => {
  for (const url of ['https://example.com/', 'http://abovealphasolutions.com/', 'https://user:secret@abovealphasolutions.com/', 'https://abovealphasolutions.com:8080/', '/dashboard', 'not a url', null]) {
    assert.equal(pageview(url), null);
  }
  assert.equal(beforeSendVercelAnalytics({ type: 'event', url: 'https://abovealphasolutions.com/' }), null);
  assert.equal(beforeSendVercelAnalytics(null), null);
});

test('preserves root campaign arrival across an early router redirect without duplicating future pageviews', () => {
  const send = createVercelBeforeSend('https://abovealphasolutions.com/?utm_source=youtube&token=secret#secret');
  assert.deepEqual(send({ type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' }), { type: 'pageview', url: 'https://abovealphasolutions.com/?utm_source=youtube' });
  assert.deepEqual(send({ type: 'pageview', url: 'https://abovealphasolutions.com/chart?symbol=INFY' }), { type: 'pageview', url: 'https://abovealphasolutions.com/chart' });
  assert.deepEqual(send({ type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' }), { type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' });
});

test('landing capture does not reveal private URLs or override a different navigation', () => {
  const privateLanding = createVercelBeforeSend('https://abovealphasolutions.com/auth/reset/secret');
  assert.deepEqual(privateLanding({ type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' }), { type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' });
  const publicLanding = createVercelBeforeSend('https://abovealphasolutions.com/?utm_source=youtube');
  assert.equal(publicLanding({ type: 'pageview', url: 'https://abovealphasolutions.com/login' }), null);
  assert.deepEqual(publicLanding({ type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' }), { type: 'pageview', url: 'https://abovealphasolutions.com/dashboard' });
  const otherNavigation = createVercelBeforeSend('https://abovealphasolutions.com/?utm_source=youtube');
  assert.deepEqual(otherNavigation({ type: 'pageview', url: 'https://abovealphasolutions.com/signals' }), { type: 'pageview', url: 'https://abovealphasolutions.com/signals' });
});
