import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../pages/Dashboard.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../pages/DeliveryRadar.jsx', import.meta.url), 'utf8');

test('delivery research is reachable from Today, research navigation, and public routes', () => {
  assert.match(app, /to: '\/delivery-radar', label: 'Delivery Radar'/);
  assert.match(app, /path="\/high-delivery-volume-stocks-today"/);
  assert.match(app, /path="\/stocks\/:symbol\/delivery-percentage"/);
  assert.match(app, /path="\/stocks-at-52-week-high-today"/);
  assert.match(app, /path="\/bulk-block-deals-today"/);
  const embeddedShareRoutes = app.split('const PAGE_SHARE_ROUTES = new Set([')[1].split(']);')[0];
  assert.doesNotMatch(embeddedShareRoutes, /stocks-at-52-week-high-today|bulk-block-deals-today/);
  assert.match(dashboard, /to="\/delivery-radar"/);
});

test('delivery page states source date, baseline, and interpretation limits', () => {
  assert.match(page, /20-session average/);
  assert.match(page, /not proof of institutional buying/i);
  assert.match(page, /sourceNotice/);
  assert.match(page, /\/api\/delivery\/radar/);
});
