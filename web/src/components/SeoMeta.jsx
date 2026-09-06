import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_SOCIAL_IMAGE, SITE_ORIGIN, seoForPath } from '../seoConfig';

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
    const canonical = `${SITE_ORIGIN}${config.canonicalPath || (pathname === '/' ? '' : pathname)}`;
    const image = `${SITE_ORIGIN}${config.image || DEFAULT_SOCIAL_IMAGE}`;
    document.title = config.title;
    setMeta('meta[name="description"]', { name: 'description', content: config.description });
    setMeta('meta[name="robots"]', { name: 'robots', content: config.index ? 'index, follow, max-image-preview:large' : 'noindex, nofollow' });
    setMeta('link[rel="canonical"]', { rel: 'canonical', href: canonical });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: config.title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: config.description });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    setMeta('meta[property="og:image"]', { property: 'og:image', content: image });
  }, [pathname]);
  return null;
}
