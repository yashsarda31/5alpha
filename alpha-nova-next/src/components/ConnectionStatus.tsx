import { useEffect, useState } from 'react';

export default function ConnectionStatus() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const staleChunk = () => setUpdate(true);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('vite:preloadError', staleChunk);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('vite:preloadError', staleChunk);
    };
  }, []);
  if (!offline && !update) return null;
  return <div className="an-connection-status" role="status" aria-live="polite">
    <span>{offline ? 'You are offline. Displayed research may be out of date. We will retry when you reconnect.' : 'This page could not download. Reload to try the latest version.'}</span>
    {!offline && <button className="an-button" onClick={() => window.location.reload()}>Reload workspace</button>}
  </div>;
}
