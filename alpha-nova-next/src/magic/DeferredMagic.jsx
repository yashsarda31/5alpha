import { lazy, Suspense, useEffect, useState } from 'react';
import MagicErrorBoundary from './MagicErrorBoundary';
const MagicCanvas = lazy(() => import('./MagicCanvas'));

export default function DeferredMagic() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Decide before importing Three.js, not after paying its download/parse cost.
    if (import.meta.env.VITE_MAGIC === 'off'
      || window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 760px)').matches
      || navigator.connection?.saveData
      || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
    let idle;
    const timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => setReady(true), { timeout: 5000 });
      else setReady(true);
    }, 3500);
    return () => { window.clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback(idle); };
  }, []);
  return ready ? <MagicErrorBoundary><Suspense fallback={null}><MagicCanvas/></Suspense></MagicErrorBoundary> : null;
}
