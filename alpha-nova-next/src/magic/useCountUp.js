import { useEffect, useState } from 'react';

export function useCountUp(target, duration = 800) {
  const numeric = Number(target);
  const [display, setDisplay] = useState(() => (Number.isFinite(numeric) ? numeric : target));

  useEffect(() => {
    if (!Number.isFinite(numeric)) { setDisplay(target); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(numeric);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(numeric * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(numeric);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [numeric, duration, target]);

  return display;
}
