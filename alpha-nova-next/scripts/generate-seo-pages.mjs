import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_SOCIAL_IMAGE, SEO_ROUTES, SITE_ORIGIN } from '../src/seoConfig.js';

const escapeAttr = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const canonicalFor = (route, config) => `${SITE_ORIGIN}${config.canonicalPath || (route === '/' ? '' : route)}`;

export function injectSeo(shell, route, config) {
  const canonical = canonicalFor(route, config);
  const image = `${SITE_ORIGIN}${config.image || DEFAULT_SOCIAL_IMAGE}`;
  const robots = config.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow';
  const schema = config.index ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage', name: config.title,
    description: config.description, url: canonical, isPartOf: { '@type': 'WebSite', name: 'Alpha Nova', url: SITE_ORIGIN },
  }).replaceAll('<', '\\u003c')}</script>` : '';
  const metadata = [
    `<title>${escapeAttr(config.title)}</title>`,
    `<meta name="description" content="${escapeAttr(config.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Alpha Nova" />`,
    `<meta property="og:title" content="${escapeAttr(config.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(config.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(config.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(config.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    schema,
  ].filter(Boolean).join('\n    ');
  return shell.replace(/\s*<title>[\s\S]*?<\/title>/i, '').replace('</head>', `    ${metadata}\n  </head>`);
}

export function renderSitemap(routes) {
  const urls = [];
  const seen = new Set();
  for (const [route, config] of Object.entries(routes)) {
    if (!config.index) continue;
    const canonical = canonicalFor(route, config);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    urls.push(`  <url><loc>${canonical}</loc></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export async function generateSeoPages(outputDirectory = 'dist') {
  const root = path.resolve(outputDirectory);
  const shell = await readFile(path.join(root, 'index.html'), 'utf8');
  for (const [route, config] of Object.entries(SEO_ROUTES)) {
    const target = route === '/' ? path.join(root, 'index.html') : path.join(root, ...route.slice(1).split('/'), 'index.html');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, injectSeo(shell, route, config), 'utf8');
  }
  await writeFile(path.join(root, '404.html'), injectSeo(shell, '/404', {title:'Page not found | Alpha Nova', description:'This address does not exist. Explore Alpha Nova research tools.', index:false}), 'utf8');
  await writeFile(path.join(root, 'sitemap.xml'), renderSitemap(SEO_ROUTES), 'utf8');
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) await generateSeoPages(process.argv[2] || 'dist');
