import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSignalAlerts } from '../alerts/SignalAlertProvider';
import { ensureSubscribed, type PushStatus } from '../alerts/pushSubscription';
import { FocusPanel } from '../components/FocusPanel';
import type { SignalsViewModel } from '../data/contracts';
import { normalizeSignals } from '../data/signals';
import { useResource } from '../hooks/useResource';
import { apiRequest } from '../lib/apiClient';
import type { UniverseRuntime } from '../scene/createUniverse';
import { createSignalsZone } from '../scene/zones/signalsZone';
const money = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value);

export const SignalsRoute = ({ runtime }: { runtime: UniverseRuntime }) => {
  const load = useMemo(() => (signal: AbortSignal) => apiRequest('/api/signals', { signal }).then(normalizeSignals), []);
  const resource = useResource<SignalsViewModel>('signals', load, 60_000);
  const model = resource.data ?? normalizeSignals({ data_status: { state: 'unavailable' }, setups: { plans: [] } });
  const zone = useMemo(() => createSignalsZone(), []);
  const [params, setParams] = useSearchParams();
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const { observe } = useSignalAlerts();
  const selected = model.setups.find((setup) => setup.symbol === params.get('symbol')) ?? model.setups[0] ?? null;
  useEffect(() => { runtime.registerZone(zone); }, [runtime, zone]);
  useEffect(() => { runtime.renderZone('signals', model); }, [runtime, model]);
  useEffect(() => { if (resource.status === 'ready' || resource.status === 'stale') observe(model.setups); }, [resource.status, model.setups, observe]);

  if (resource.status === 'loading') return <section className="route-panel"><p role="status">Scanning evidence field…</p></section>;
  if (!model.setups.length) return <section className="route-panel"><div className="route-code">SIGNALS / FAIL CLOSED</div><h1>HOLD (INSUFFICIENT EVIDENCE)</h1><p role="status">No complete, finite trade plan survived validation.</p></section>;
  return <section className="route-panel signals-layout">
    <div className="signals-list"><div className="route-code">{model.market} / {model.regime}</div><h1>Opportunity field</h1>
      {model.setups.map((setup) => <button type="button" className={selected?.symbol === setup.symbol ? 'signal-card is-selected' : 'signal-card'} key={setup.symbol} onClick={() => setParams({ symbol: setup.symbol })}><strong>{setup.symbol}</strong><span>{setup.side} · {setup.score}/100</span></button>)}
    </div>
    {selected && <FocusPanel eyebrow={`${model.status} · ${model.regime}`} title={`${selected.side} ${selected.symbol}`}>
      <dl className="signal-dossier"><div><dt>Score</dt><dd>{selected.score}/100</dd></div><div><dt>Observed</dt><dd>{selected.observedAt ?? 'Unavailable'}</dd></div><div><dt>Entry</dt><dd>{money(selected.entry)}</dd></div><div><dt>Stop</dt><dd>{money(selected.stop)}</dd></div><div><dt>Target</dt><dd>{money(selected.target)}</dd></div></dl>
      <h2>Invalidation</h2><p>{selected.invalidation ?? 'Unavailable'}</p><h2>Methodology</h2><p>{selected.methodology}</p><h2>Risk context</h2><p>{selected.riskContext ?? 'Use conservative sizing and independent verification.'}</p>
      <button type="button" className="primary-action" onClick={async () => setPushStatus(await ensureSubscribed())}>Enable alerts</button>{pushStatus && <p role="status">Alert status: {pushStatus}</p>}
      <small>Research analytics only — not investment advice.</small>
    </FocusPanel>}
  </section>;
};
