import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    import('gsap').then(({ gsap }) => {
      if (cancelled) return;
      gsap.fromTo(
        el,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', overwrite: true },
      );
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  return <div ref={ref}>{children}</div>;
}
