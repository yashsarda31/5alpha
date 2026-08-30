import { useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardViewModel, ResourceState, SignalsViewModel, TodayViewModel } from '../data/contracts';
import { normalizeDashboard } from '../data/dashboard';
import { normalizeSignals } from '../data/signals';
import { useResource } from '../hooks/useResource';
import { apiRequest } from '../lib/apiClient';
import type { UniverseRuntime } from '../scene/createUniverse';
import { createTodayZone } from '../scene/zones/todayZone';

const emptyDashboard: DashboardViewModel = { status: 'unavailable', marketOpen: null, indices: [], movers: [] };
const emptySignals: SignalsViewModel = {
  status: 'unavailable', market: 'IN', observedAt: null, regime: 'UNAVAILABLE', breadth: null, setups: [],
};

const composeToday = (
  dashboardState: ResourceState<DashboardViewModel>,
  signalState: ResourceState<SignalsViewModel>,
): TodayViewModel => {
  const dashboard = dashboardState.data ?? emptyDashboard;
  const signals = signalState.data ?? emptySignals;
  const bothUnavailable = dashboardState.status === 'error' && signalState.status === 'error';
  const stale = dashboardState.status === 'stale' || signalState.status === 'stale';
  const providerLimited = signals.status === 'provider_limited';
  return {
    status: bothUnavailable ? 'unavailable' : stale ? 'stale' : providerLimited ? 'provider_limited' : 'ready',
    dashboard,
    signalSummary: {
      status: signals.status,
      regime: signals.regime,
      breadth: signals.breadth,
      setupCount: signals.setups.length,
      observedAt: signals.observedAt,
    },
  };
};

const number = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const TodayRoute = ({ runtime }: { runtime: UniverseRuntime | null }) => {
  const loadDashboard = useCallback((signal: AbortSignal) => apiRequest<unknown>('/api/dashboard', { signal }).then(normalizeDashboard), []);
  const loadSignals = useCallback((signal: AbortSignal) => apiRequest<unknown>('/api/signals', { signal }).then(normalizeSignals), []);
  const dashboard = useResource('dashboard', loadDashboard, 120_000);
  const signals = useResource('signals', loadSignals, 60_000);
  const model = useMemo(() => composeToday(dashboard, signals), [dashboard, signals]);
  const zone = useMemo(() => createTodayZone(), []);

  useEffect(() => { runtime?.registerZone(zone); }, [runtime, zone]);
  useEffect(() => { runtime?.renderZone('today', model); }, [runtime, model]);

  if (dashboard.status === 'loading' && signals.status === 'loading') {
    return <section className="today-route"><div role="status" className="data-message">Synchronising market universe…</div></section>;
  }
  if (model.status === 'unavailable') {
    return <section className="today-route"><div role="status" className="data-message is-error">Market data unavailable · retrying safely</div></section>;
  }

  return (
    <section className="today-route">
      <div className="route-code">TODAY / COMMAND SPHERE</div>
      <div className="today-heading">
        <div><h1>Market pulse</h1><p>Your state, strongest evidence, and next research action.</p></div>
        <div className="regime-orb"><span>REGIME</span><strong>{model.signalSummary.regime}</strong></div>
      </div>
      <div className="today-strip">
        {model.dashboard.indices.map((index) => (
          <article className="pulse-card" key={index.name}>
            <span>{index.name}</span>
            <strong>{number(index.last)}</strong>
            <em className={index.changePct >= 0 ? 'is-gain' : 'is-loss'}>{index.changePct >= 0 ? '▲' : '▼'} {Math.abs(index.changePct).toFixed(2)}%</em>
          </article>
        ))}
      </div>
      <div className="today-bottom">
        <div className="setup-beacon">
          <span>VALID SETUPS</span>
          <strong>{model.signalSummary.setupCount.toString().padStart(2, '0')}</strong>
          <Link to="/signals">Enter signal field →</Link>
        </div>
        <div className="mover-list">
          <span className="micro-label">MOVERS IN ORBIT</span>
          {model.dashboard.movers.slice(0, 4).map((mover) => (
            <Link key={mover.symbol} to={`/chart?symbol=${encodeURIComponent(mover.symbol)}`}>
              <b>{mover.symbol.replace('.NS', '')}</b><span>{number(mover.last)}</span><em className={mover.changePct >= 0 ? 'is-gain' : 'is-loss'}>{mover.changePct >= 0 ? '+' : ''}{mover.changePct.toFixed(2)}%</em>
            </Link>
          ))}
          {model.dashboard.movers.length === 0 && <p>No validated mover data.</p>}
        </div>
      </div>
    </section>
  );
};
