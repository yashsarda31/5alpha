import { useState } from 'react';
import { Navigate, useLocation, useRoutes } from 'react-router-dom';
import { AppDock } from './components/AppDock';
import { ComplianceNotice } from './components/ComplianceNotice';
import { SceneStatus } from './components/SceneStatus';
import { CORE_ROUTES } from './coreRoutes';
import { useUniverse } from './hooks/useUniverse';
import { TodayRoute } from './routes/TodayRoute';
import { SignalsRoute } from './routes/SignalsRoute';
import { AnalyseRoute } from './routes/AnalyseRoute';
import { WatchlistRoute } from './routes/WatchlistRoute';
import { LoginSheet } from './components/LoginSheet';
import { AuthProvider } from './auth/AuthProvider';
import { WatchlistProvider } from './watchlist/WatchlistProvider';
import { createUniverse, type UniverseRuntime } from './scene/createUniverse';

const RouteStub = ({ label }: { label: string }) => (
  <section className="route-stub" aria-label={`${label} scene`}>
    <div className="route-code">ALPHA / {label.toUpperCase()}</div>
    <h1>{label}</h1>
    <p>Spatial market intelligence is coming online.</p>
  </section>
);

const routeLabel = (pathname: string) => CORE_ROUTES.find(({ path }) => pathname === path)?.label ?? 'Account';

function AppShell({ universeFactory = createUniverse }: { universeFactory?: () => UniverseRuntime }) {
  const location = useLocation();
  const label = routeLabel(location.pathname);
  const [focusMode, setFocusMode] = useState(false);
  const { hostRef, runtime } = useUniverse({ factory: universeFactory, tier: 'balanced' });
  const routeElement = useRoutes([
    { path: '/dashboard', element: <TodayRoute runtime={runtime} /> },
    { path: '/signals', element: <SignalsRoute runtime={runtime} /> },
    { path: '/chart', element: <AnalyseRoute runtime={runtime} /> },
    { path: '/watchlist', element: <WatchlistRoute runtime={runtime} /> },
    ...CORE_ROUTES.filter(({ path }) => !['/dashboard', '/signals', '/chart', '/watchlist'].includes(path)).map(({ path, label }) => ({ path, element: <RouteStub label={label} /> })),
    { path: '/login', element: <LoginSheet /> },
    { path: '*', element: <Navigate to="/dashboard" replace /> },
  ]);

  const toggleFocus = () => {
    setFocusMode((current) => {
      if (current) runtime.resume();
      else runtime.pause();
      return !current;
    });
  };

  return (
    <div className="nova-shell" data-tier="balanced">
      <div ref={hostRef} className="universe-host" aria-hidden="true" />
      <div className="ambient-grid" aria-hidden="true" />
      <header className="brand-bar">
        <a className="brand-mark" href="/dashboard" aria-label="AlphaNova4 Today">
          <span className="nova-gem" aria-hidden="true"><i /></span>
          <span><strong>AlphaNova</strong><em>4</em></span>
        </a>
        <span className="live-orbit"><i /> SPATIAL TERMINAL</span>
      </header>
      <ComplianceNotice />
      <main className="semantic-stage" data-route-label={label} data-focus-mode={String(focusMode)} aria-label={`${label} workspace`}>
        {routeElement}
      </main>
      <SceneStatus value={focusMode ? { message: 'Universe paused · Focus mode active' } : null} />
      <button type="button" className="focus-toggle" onClick={toggleFocus}>
        {focusMode ? 'Resume universe' : 'Focus data'}
      </button>
      <AppDock />
    </div>
  );
}

export default function App(props: { universeFactory?: () => UniverseRuntime }) {
  return <AuthProvider><WatchlistProvider><AppShell {...props} /></WatchlistProvider></AuthProvider>;
}
