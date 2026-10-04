import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { injectSeo, renderSitemap } from './generate-seo-pages.mjs';
import { SEO_ROUTES, SITE_NAME, canonicalForPath, seoForPath, structuredDataForPath } from '../src/seoConfig.js';
import { HOME_CONTENT } from '../src/homeContent.js';

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

test('homepage exposes the company and useful research links without JavaScript', () => {
  const html = injectSeo(shell, '/', SEO_ROUTES['/']);
  assert.match(html, /<title>Above Alpha Solutions \| Alpha Nova Market Research<\/title>/);
  assert.ok(html.includes(HOME_CONTENT));
  assert.match(html, /<h1[^>]*>Above Alpha Solutions<\/h1>/);
  assert.match(html, /href="\/screener"/);
  const schema = JSON.parse(html.match(/<script id="page-schema" type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const website = schema['@graph'].find(node => node['@type'] === 'WebSite');
  assert.equal(website.name, SITE_NAME);
  assert.equal(website.alternateName, 'Alpha Nova');
  assert.equal(website.url, 'https://abovealphasolutions.com/');
  assert.equal(schema['@graph'].find(node => node['@type'] === 'Organization').name, SITE_NAME);
});

test('canonical normalization prevents duplicate homepage sitemap entries and trailing slash noindex', () => {
  assert.equal(canonicalForPath('/dashboard'), canonicalForPath('/'));
  assert.equal(canonicalForPath('/signals/'), canonicalForPath('/signals'));
  assert.equal(seoForPath('/signals/').index, true);
  const locations = [...renderSitemap(SEO_ROUTES).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.equal(locations.length, new Set(locations).size);
  assert.equal(locations.filter(url => /^https:\/\/abovealphasolutions.com\/?$/.test(url)).length, 1);
});

test('structured data follows the active public page and is absent on private routes', () => {
  assert.equal(structuredDataForPath('/watchlist'), null);
  assert.equal(structuredDataForPath('/not-a-page'), null);
  const graph = structuredDataForPath('/signals')['@graph'];
  assert.equal(graph.find(node => node['@type'] === 'WebPage').url, 'https://abovealphasolutions.com/signals');
});

test('every SEO document has a Render route before the SPA fallback, including slash variants', () => {
  const config = readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const fallback = config.indexOf('source: /*');
  assert.ok(fallback > 0);
  for (const route of Object.keys(SEO_ROUTES).filter(route => route !== '/')) {
    for (const source of [route, `${route}/`]) {
      const rule = `source: ${source}\n        destination: ${route}/index.html`;
      assert.ok(config.includes(rule), `Missing Render SEO rewrite: ${source}`);
      assert.ok(config.indexOf(rule) < fallback);
    }
  }
  assert.match(config, /source: \/api\/\*[\s\S]*destination: https:\/\/alphanova-api.onrender.com\/api\/\*/);
});
