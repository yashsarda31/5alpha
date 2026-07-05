import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { WatchlistProvider } from './WatchlistContext';
import { PredictionProvider } from './PredictionContext';
import Login from './pages/Login';
import Disclaimer from './components/Disclaimer';
import InstallApp from './components/InstallApp';
import SignalAlertProvider, { useSignalAlerts } from './alerts/SignalAlertProvider';
import { usePrediction } from './PredictionContext';

// Every page is lazy-loaded so the initial bundle carries only the shell;
// heavy dependencies (Plotly ~1.4 MB) download only when a chart page opens.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Dcf = lazy(() => import('./pages/Dcf'));
const Chart = lazy(() => import('./pages/Chart'));
const Screener = lazy(() => import('./pages/Screener'));
const Arima = lazy(() => import('./pages/Arima'));
const PositionSizing = lazy(() => import('./pages/PositionSizing'));
const Momentum = lazy(() => import('./pages/Momentum'));
const Fundamentals = lazy(() => import('./pages/Fundamentals'));
const News = lazy(() => import('./pages/News'));
const OptionChain = lazy(() => import('./pages/OptionChain'));
const MarketSignals = lazy(() => import('./pages/MarketSignals'));
const FocusList = lazy(() => import('./pages/FocusList'));
const Learn = lazy(() => import('./pages/Learn'));
const DruckMinervini = lazy(() => import('./pages/DruckMinervini'));
const TradingGame = lazy(() => import('./pages/TradingGame'));
const FiiDii = lazy(() => import('./pages/FiiDii'));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: 'var(--text-secondary)', fontSize: '14px', letterSpacing: '0.05em' }}>
    Loading…
  </div>
);

const AlertBell = () => {
  const { browserEnabled, toggleBrowser, permission } = useSignalAlerts();
  if (permission === 'unsupported') return null;
  const state = permission === 'denied' ? 'BLOCKED' : browserEnabled ? 'ON' : 'OFF';
  const title = permission === 'denied'
    ? 'Browser notifications are blocked in your browser settings'
    : 'Toggle background browser notifications for new signals';
  return (
    <button
      className={`alert-bell ${browserEnabled ? 'on' : ''}`}
      onClick={toggleBrowser}
      title={title}
      disabled={permission === 'denied'}
    >
      <span className="ab-ico">{browserEnabled ? '🔔' : '🔕'}</span>
      Signal alerts
      <span className="ab-state">{state}</span>
    </button>
  );
};

const LeaderboardOptOut = () => {
  const { stats, setHidden } = usePrediction();
  if (!stats) return null;
  const hidden = !!stats.hidden;
  return (
    <button
      className={`alert-bell ${hidden ? '' : 'on'}`}
      onClick={() => setHidden(!hidden)}
      title="Show or hide your name on the Nifty Leaderboard"
    >
      <span className="ab-ico">{hidden ? '🙈' : '🏆'}</span>
      Leaderboard
      <span className="ab-state">{hidden ? 'HIDDEN' : 'VISIBLE'}</span>
    </button>
  );
};

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const AppLayout = () => {
  const { currentUser, logout } = useAuth();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleKeyChange = (e) => {
    setApiKey(e.target.value);
    localStorage.setItem('gemini_api_key', e.target.value);
  };

  return (
    <WatchlistProvider>
    <PredictionProvider>
    <SignalAlertProvider>
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu">☰</button>
        <span className="mobile-title">
          <span style={{ color: 'var(--primary-gold)' }}>Alpha</span> Nova
        </span>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span style={{ color: 'var(--primary-gold)' }}>Alpha</span> Nova
        </h2>
        <div style={{color: "var(--text-secondary)", fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "32px"}}>Pro Edition V3</div>
        
        <nav onClick={() => setMenuOpen(false)}>
          <NavLink to="/dashboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⌘</span> Dashboard
          </NavLink>
          <NavLink to="/watchlist" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⭐</span> Watchlist
          </NavLink>
          <NavLink to="/leaderboard" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🏆</span> Nifty Leaderboard
          </NavLink>
          <NavLink to="/signals" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⚡</span> Market Signals
          </NavLink>
          <NavLink to="/focus" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🎯</span> Focus List
          </NavLink>
          <NavLink to="/chart" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>📈</span> Chart Analyser
          </NavLink>
          <NavLink to="/druck-minervini" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🦅</span> Druck & Minervini
          </NavLink>
          <NavLink to="/screener" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🔍</span> Quant Screener
          </NavLink>

          <NavLink to="/fiidii" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🏦</span> FII / DII Activity
          </NavLink>
          <NavLink to="/dcf" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>💵</span> DCF Calculator
          </NavLink>
          <NavLink to="/fundamentals" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>📊</span> Fundamentals
          </NavLink>
          <NavLink to="/momentum" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🚀</span> Momentum Leaders
          </NavLink>
          <NavLink to="/arima" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🔮</span> SARIMAX Forecaster
          </NavLink>
          <NavLink to="/position-sizing" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⚖️</span> Position Sizing
          </NavLink>
          <NavLink to="/news" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>📰</span> News
          </NavLink>
          <NavLink to="/option-chain" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>⛓️</span> Option Chain
          </NavLink>
          <NavLink to="/trading-game" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🎮</span> Discipline Arena
          </NavLink>
          <NavLink to="/learn" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
            <span style={{marginRight: '12px', opacity: 0.8}}>🎓</span> Learn
          </NavLink>
        </nav>
        
        <div style={{marginTop: 'auto', paddingTop: '40px'}}>
          <InstallApp />
          <AlertBell />
          <LeaderboardOptOut />
          <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Logged in as</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--primary-gold)', marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.email}</div>
            <button onClick={logout} className="secondary" style={{ padding: '8px', fontSize: '12px' }}>Sign Out</button>
          </div>
          
          <label>Gemini API Key</label>
          <input 
            type="password" 
            value={apiKey} 
            onChange={handleKeyChange} 
            placeholder="Enter AI Key..." 
            style={{marginBottom: '0'}}
          />
        </div>
      </div>

      <div className="content">
        <Disclaimer />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/dcf" element={<Dcf />} />
          <Route path="/fundamentals" element={<Fundamentals />} />
          <Route path="/momentum" element={<Momentum />} />
          <Route path="/chart" element={<Chart />} />
          <Route path="/druck-minervini" element={<DruckMinervini />} />
          <Route path="/screener" element={<Screener />} />

          <Route path="/fiidii" element={<FiiDii />} />
          <Route path="/arima" element={<Arima />} />
          <Route path="/position-sizing" element={<PositionSizing />} />
          <Route path="/news" element={<News />} />
          <Route path="/option-chain" element={<OptionChain />} />
          <Route path="/signals" element={<MarketSignals />} />
          <Route path="/focus" element={<FocusList />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/trading-game" element={<TradingGame />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </div>
    </SignalAlertProvider>
    </PredictionProvider>
    </WatchlistProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="*" 
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
