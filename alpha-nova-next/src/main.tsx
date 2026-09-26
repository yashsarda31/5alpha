import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './legacy/index.css';
import './legacy/App.css';
import './legacy/components/ui/ui.css';
import './styles.css';
import './magic/magic.css';
import './readability.css';
import App from './App';
import { createVercelBeforeSend, shouldEnableVercelAnalytics } from './legacy/lib/vercelAnalytics';
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); (window as Window & { __anInstallPrompt?: Event }).__anInstallPrompt = event; window.dispatchEvent(new Event('an-install-ready')); });
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
if (shouldEnableVercelAnalytics({ production: import.meta.env.PROD, hostname: window.location.hostname })) {
  const startAnalytics = () => void import('@vercel/analytics').then(({ inject }) => {
    const sanitize = createVercelBeforeSend(window.location.href);
    inject({ mode:'production', beforeSend: event => { const safe = sanitize(event); return safe ? { ...event, url: safe.url } : null; }, framework:'react' });
  }).catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(startAnalytics, { timeout: 2000 });
  else globalThis.setTimeout(startAnalytics, 0);
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
