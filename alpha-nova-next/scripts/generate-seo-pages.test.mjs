import assert from 'node:assert/strict';
import test from 'node:test';

import { injectSeo, renderSitemap } from './generate-seo-pages.mjs';
import { SEO_ROUTES } from '../src/seoConfig.js';

const shell = '<!doctype html><html><head><title>Alpha Nova</title></head><body><div id="root"></div></body></html>';

test('public delivery route gets unique canonical and social metadata in raw HTML', () => {
  const html = injectSeo(shell, '/high-delivery-volume-stocks-today', SEO_ROUTES['/high-delivery-volume-stocks-today']);
  assert.match(html, /<title>High Delivery Volume Stocks Today/);
  assert.match(html, /rel="canonical" href="https:\/\/abovealphasolutions\.com\/high-delivery-volume-stocks-today"/);
  assert.match(html, /property="og:image" content="https:\/\/abovealphasolutions\.com\/api\/public-preview\/delivery-radar\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /application\/ld\+json/);
});

test('private route raw HTML is noindex', () => {
  const html = injectSeo(shell, '/watchlist', SEO_ROUTES['/watchlist']);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /application\/ld\+json/);
});

test('sitemap includes supported public pages and excludes private or unavailable templates', () => {
  const xml = renderSitemap(SEO_ROUTES);
  assert.match(xml, /high-delivery-volume-stocks-today/);
  assert.match(xml, /fii-dii-data-today/);
  assert.match(xml, /nifty-pcr-today/);
  assert.match(xml, /stocks-at-52-week-high-today/);
  assert.match(xml, /bulk-block-deals-today/);
  assert.doesNotMatch(xml, /watchlist/);
});
