import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SignalSetup } from '../data/contracts';
const SEEN_KEY = 'alphanova_seen_signals';
type Value = { latest: string | null; observe: (setups: SignalSetup[]) => void };
const Context = createContext<Value>({ latest: null, observe: () => undefined });
const marketDayKey = (setup: SignalSetup) => `${setup.symbol}:${(setup.observedAt ?? new Date().toISOString()).slice(0, 10)}`;

export const SignalAlertProvider = ({ children }: { children: ReactNode }) => {
  const seeded = useRef(false);
  const [latest, setLatest] = useState<string | null>(null);
  const observe = useCallback((setups: SignalSetup[]) => {
    const prior = new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
    const keys = setups.map(marketDayKey);
    if (!seeded.current) { seeded.current = true; localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...prior, ...keys])].slice(-500))); return; }
    const fresh = setups.find((setup) => !prior.has(marketDayKey(setup)));
    keys.forEach((key) => prior.add(key)); localStorage.setItem(SEEN_KEY, JSON.stringify([...prior].slice(-500)));
    if (!fresh) return;
    const message = `${fresh.side} ${fresh.symbol} research setup detected`; setLatest(message);
    if (localStorage.getItem('alphanova_browser_notifs') === 'enabled' && Notification.permission === 'granted') new Notification('AlphaNova4 signal', { body: message });
  }, []);
  const value = useMemo(() => ({ latest, observe }), [latest, observe]);
  return <Context.Provider value={value}>{children}<div className="sr-only" aria-live="polite">{latest}</div></Context.Provider>;
};
// eslint-disable-next-line react-refresh/only-export-components
export const useSignalAlerts = () => useContext(Context);
