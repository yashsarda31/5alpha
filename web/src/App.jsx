import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Star, Zap, Rocket, Newspaper, Target,
  LineChart, Bird, Search, Landmark, Calculator, BarChart3, Sparkles, Scale, Link2,
  Trophy, Gamepad2, GraduationCap, Settings, Menu, Compass,
} from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import { WatchlistProvider } from './WatchlistContext';
import { PredictionProvider } from './PredictionContext';
import Login from './pages/Login';
import Disclaimer from './components/Disclaimer';
import SettingsSheet from './components/SettingsSheet';
import SignalAlertProvider from './alerts/SignalAlertProvider';

// One importer map feeds both lazy() and hover-prefetch: pointing at a nav
// link starts downloading that page's chunk, so the click lands on warm code.
const routeImporters = {
  '/dashboard': () => import('./pages/Dashboard'),
  '/watchlist': () => import('./pages/Watchlist'),
  '/leaderboard': () => import('./pages/Leaderboard'),
  '/dcf': () => import('./pages/Dcf'),
  '/chart': () => import('./pages/Chart'),
  '/screener': () => import('./pages/Screener'),
  '/arima': () => import('./pages/Arima'),
  '/position-sizing': () => import('./pages/PositionSizing'),
  '/momentum': () => import('./pages/Momentum'),
  '/fundamentals': () => import('./pages/Fundamentals'),
  '/news': () => import('./pages/News'),
  '/option-chain': () => import('./pages/OptionChain'),
  '/signals': () => import('./pages/MarketSignals'),
  '/sectors': () => import('./pages/SectorRotation'),
  '/focus': () => import('./pages/FocusList'),
  '/learn': () => import('./pages/Learn'),
  '/druck-minervini': () => import('./pages/DruckMinervini'),
  '/trading-game': () => import('./pages/TradingGame'),
  '/fiidii': () => import('./pages/FiiDii'),
};

const prefetched = new Set();
const prefetchRoute = (path) => {
  if (prefetched.has(path) || !routeImporters[path]) return;
  prefetched.add(path);
  routeImporters[path]().catch(() => prefetched.delete(path));
};

// Every page is lazy-loaded so the initial bundle carries only the shell;
// heavy dependencies (Plotly ~1.4 MB) download only when a chart page opens.
const Dashboard = lazy(routeImporters['/dashboard']);
const Watchlist = lazy(routeImporters['/watchlist']);
const Leaderboard = lazy(routeImporters['/leaderboard']);
const Dcf = lazy(routeImporters['/dcf']);
const Chart = lazy(routeImporters['/chart']);
const Screener = lazy(routeImporters['/screener']);
const Arima = lazy(routeImporters['/arima']);
const PositionSizing = lazy(routeImporters['/position-sizing']);
const Momentum = lazy(routeImporters['/momentum']);
const Fundamentals = lazy(routeImporters['/fundamentals']);
const News = lazy(routeImporters['/news']);
const OptionChain = lazy(routeImporters['/option-chain']);
const MarketSignals = lazy(routeImporters['/signals']);
const SectorRotation = lazy(routeImporters['/sectors']);
const FocusList = lazy(routeImporters['/focus']);
const Learn = lazy(routeImporters['/learn']);
const DruckMinervini = lazy(routeImporters['/druck-minervini']);
const TradingGame = lazy(routeImporters['/trading-game']);
const FiiDii = lazy(routeImporters['/fiidii']);

// Progressive disclosure: what matters right now up top, deep research in the
// middle, gamified extras at the bottom (order per user preference).
const NAV_SECTIONS = [
  {
    title: 'Today',
    items: [
      { to: '/dashboard', label: 'Dashboard', Icon: LayoutGrid },
      { to: '/watchlist', label: 'Watchlist', Icon: Star },
      { to: '/signals', label: 'Market Signals', Icon: Zap },
      { to: '/sectors', label: 'Sector Rotation', Icon: Compass },
      { to: '/momentum', label: 'Momentum Leaders', Icon: Rocket },
      { to: '/news', label: 'News', Icon: Newspaper },
      { to: '/focus', label: 'Focus List', Icon: Target },
    ],
  },
  {
    title: 'Research',
    items: [
      { to: '/chart', label: 'Chart Analyser', Icon: LineChart },
      { to: '/druck-minervini', label: 'Druck & Minervini', Icon: Bird },
      { to: '/screener', label: 'Quant Screener', Icon: Search },
      { to: '/fiidii', label: 'FII / DII Activity', Icon: Landmark },
      { to: '/dcf', label: 'DCF Calculator', Icon: Calculator },
      { to: '/fundamentals', label: 'Fundamentals', Icon: BarChart3 },
      { to: '/arima', label: 'SARIMAX Forecaster', Icon: Sparkles },
      { to: '/position-sizing', label: 'Position Sizing', Icon: Scale },
      { to: '/option-chain', label: 'Option Chain', Icon: Link2 },
    ],
  },
  {
    title: 'Play & Learn',
    items: [
      { to: '/leaderboard', label: 'Nifty Leaderboard', Icon: Trophy },
      { to: '/trading-game', label: 'Discipline Arena', Icon: Gamepad2 },
      { to: '/learn', label: 'Learn', Icon: GraduationCap },
    ],
  },
];

// Thumb-reach destinations for the installed/mobile experience
const TAB_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutGrid },
  { to: '/signals', label: 'Signals', Icon: Zap },
  { to: '/watchlist', label: 'Watchlist', Icon: Star },
  { to: '/momentum', label: 'Momentum', Icon: Rocket },
];

// Layout-shaped skeleton instead of a bare "Loading…" word — the page keeps
// its silhouette while the chunk and data arrive.
const PageLoader = () => (
  <div className="page-skeleton" aria-busy="true" aria-label="Loading page">
    <div className="skeleton skeleton-header" />
    <div className="skeleton page-skeleton-block" style={{ height: 84 }} />
    <div className="page-skeleton-grid">
      <div className="skeleton page-skeleton-block" style={{ height: 160 }} />
      <div className="skeleton page-skeleton-block" style={{ height: 160 }} />
    </div>
    <div className="skeleton page-skeleton-block" style={{ height: 220 }} />
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const NavItem = ({ to, label, onNavigate, ...rest }) => {
  const Icon = rest.Icon; // capitalized var (not param) so the JSX-blind no-unused-vars config ignores it
  return (
  <NavLink
    to={to}
    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
    onMouseEnter={() => prefetchRoute(to)}
    onTouchStart={() => prefetchRoute(to)}
    onFocus={() => prefetchRoute(to)}
    onClick={onNavigate}
  >
    <Icon size={16} className="nav-ico" aria-hidden="true" />
    {label}
  </NavLink>
  );
};

const MobileTabBar = ({ onMore }) => (
  <nav className="mobile-tabbar" aria-label="Primary">
    {TAB_ITEMS.map((item) => {
      const Icon = item.Icon;
      return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
        onTouchStart={() => prefetchRoute(item.to)}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{item.label}</span>
      </NavLink>
      );
    })}
    <button className="tab-item" onClick={onMore} aria-label="More pages">
      <Menu size={20} aria-hidden="true" />
      <span>More</span>
    </button>
  </nav>
);

const AppLayout = () => {
  const { currentUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>Pro Edition V3</div>

        <nav>
          {NAV_SECTIONS.map((section) => (
            <div className="nav-section" key={section.title}>
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} onNavigate={() => setMenuOpen(false)} />
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} aria-hidden="true" />
            <span className="settings-btn-label">
              <span>Settings</span>
              <span className="settings-btn-email">{currentUser?.email}</span>
            </span>
          </button>
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
          <Route path="/sectors" element={<SectorRotation />} />
          <Route path="/focus" element={<FocusList />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/trading-game" element={<TradingGame />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </div>

      <MobileTabBar onMore={() => setMenuOpen(true)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
