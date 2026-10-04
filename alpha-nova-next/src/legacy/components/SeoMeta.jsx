import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_SOCIAL_IMAGE, SITE_ORIGIN, SITE_NAME, canonicalForPath, seoForPath, structuredDataForPath } from '../seoConfig';

function setMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement(attributes.property ? 'meta' : attributes.rel ? 'link' : 'meta');
    document.head.appendChild(element);
  }
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
}

export default function SeoMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const config = seoForPath(pathname);
    const canonical = canonicalForPath(pathname, config);
    const image = `${SITE_ORIGIN}${config.image || DEFAULT_SOCIAL_IMAGE}`;
    document.title = config.title;
    setMeta('meta[name="description"]', { name: 'description', content: config.description });
    setMeta('meta[name="robots"]', { name: 'robots', content: config.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow' });
    setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: config.title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: config.description });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    setMeta('meta[property="og:image"]', { property: 'og:image', content: image });
    setMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: config.title });
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: config.description });
    setMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });
    let schema = document.getElementById('page-schema');
    const data = structuredDataForPath(pathname, config);
    if (data) {
      if (!schema) {
        schema = document.createElement('script');
        schema.id = 'page-schema';
        schema.type = 'application/ld+json';
        document.head.appendChild(schema);
      }
      schema.textContent = JSON.stringify(data);
    } else schema?.remove();
  }, [pathname]);
  return null;
}
