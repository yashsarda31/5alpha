import React, { useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Link, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import {
  LayoutGrid, Star, Zap, Rocket, Newspaper,
  LineChart, Bird, Search, Landmark, Calculator, BarChart3, Sparkles, Scale, Link2,
  Trophy, Gamepad2, GraduationCap, Settings, Menu, Compass, ArrowLeftRight, Gauge,
  ChevronsUpDown,
} from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import AppLogo from './components/AppLogo';
import { WatchlistProvider } from './WatchlistContext';
import { PredictionProvider } from './PredictionContext';
import Disclaimer from './components/Disclaimer';
import AuthIntentHandler from './components/AuthIntentHandler';
import SignalAlertProvider from './alerts/SignalAlertProvider';

const Login = lazy(() => import('./pages/Login'));
const SettingsSheet = lazy(() => import('./components/SettingsSheet'));

// One importer map feeds both lazy() and hover-prefetch: pointing at a nav
// link starts downloading that page's chunk, so the click lands on warm code.
const routeImporters = {
  '/dashboard': () => import('./pages/Dashboard'),
  '/watchlist': () => import('./pages/Watchlist'),
  '/leaderboard': () => import('./pages/Leaderboard'),
  '/dcf': () => import('./pages/Dcf'),
  '/chart': () => import('./pages/Chart'),
  '/flcl': () => import('./pages/Flcl'),
  '/screener': () => import('./pages/Screener'),
  '/arima': () => import('./pages/Arima'),
  '/position-sizing': () => import('./pages/PositionSizing'),
  '/momentum': () => import('./pages/Momentum'),
  '/fundamentals': () => import('./pages/Fundamentals'),
  '/news': () => import('./pages/News'),
  '/option-chain': () => import('./pages/OptionChain'),
  '/signals': () => import('./pages/MarketSignals'),
  '/track-record': () => import('./pages/TrackRecord'),
  '/sectors': () => import('./pages/SectorRotation'),
  '/deals': () => import('./pages/Deals'),
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
const Flcl = lazy(routeImporters['/flcl']);
const Screener = lazy(routeImporters['/screener']);
const Arima = lazy(routeImporters['/arima']);
const PositionSizing = lazy(routeImporters['/position-sizing']);
const Momentum = lazy(routeImporters['/momentum']);
const Fundamentals = lazy(routeImporters['/fundamentals']);
const News = lazy(routeImporters['/news']);
const OptionChain = lazy(routeImporters['/option-chain']);
const MarketSignals = lazy(routeImporters['/signals']);
const TrackRecord = lazy(routeImporters['/track-record']);
const SectorRotation = lazy(routeImporters['/sectors']);
const Deals = lazy(routeImporters['/deals']);
const Learn = lazy(routeImporters['/learn']);
const DruckMinervini = lazy(routeImporters['/druck-minervini']);
const TradingGame = lazy(routeImporters['/trading-game']);
const FiiDii = lazy(routeImporters['/fiidii']);

// The primary path mirrors the daily research workflow. Specialist tools stay
// available one disclosure away instead of competing with the core actions.
const PRIMARY_NAV_ITEMS = [
  { to: '/dashboard', label: 'Today', Icon: LayoutGrid },
  { to: '/signals', label: 'Signals', Icon: Zap },
  { to: '/chart', label: 'Analyse', Icon: LineChart },
  { to: '/watchlist', label: 'Watchlist', Icon: Star },
];

const MORE_NAV_SECTIONS = [
  {
    title: 'Market context',
    items: [
      { to: '/track-record', label: 'Signal Track Record', Icon: Gauge },
      { to: '/sectors', label: 'Sector Rotation', Icon: Compass },
      { to: '/momentum', label: 'Momentum Leaders', Icon: Rocket },
      { to: '/news', label: 'News', Icon: Newspaper },
    ],
  },
  {
    title: 'Research',
    items: [
      { to: '/flcl', label: 'FLCL Analysis', Icon: ChevronsUpDown },
      { to: '/druck-minervini', label: 'Druck & Minervini', Icon: Bird },
      { to: '/screener', label: 'Quant Screener', Icon: Search },
      { to: '/fiidii', label: 'FII / DII Activity', Icon: Landmark },
      { to: '/deals', label: 'Block & Insider Deals', Icon: ArrowLeftRight },
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

const MORE_ROUTE_PATHS = new Set(MORE_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.to)));

// Thumb-reach destinations for the installed/mobile experience
const TAB_ITEMS = [
  { to: '/dashboard', label: 'Today', Icon: LayoutGrid },
  { to: '/signals', label: 'Signals', Icon: Zap },
  { to: '/chart', label: 'Analyse', Icon: LineChart },
  { to: '/watchlist', label: 'Watchlist', Icon: Star },
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

// SPA navigations keep the previous page's scroll offset, which strands mobile
// users mid-page when they tap a tab. Reset to top on forward navigations only
// — back/forward (POP) keeps the browser's own position handling.
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  React.useEffect(() => {
    if (navType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navType]);
  return null;
};

const AppLayout = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // While the nav drawer is open, stop touch scrolls from reaching the page
  // behind it (the backdrop otherwise chains the scroll to the body).
  React.useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    return () => document.body.classList.remove('menu-open');
  }, [menuOpen]);

  return (
    <WatchlistProvider>
    <PredictionProvider>
    <SignalAlertProvider>
      <AuthIntentHandler />
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMenuOpen(true)} aria-label="Open navigation menu">☰</button>
        <span className="mobile-title">
          <AppLogo size={20} />
          <span><span className="brand-alpha">Alpha</span> Nova</span>
        </span>
      </div>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <div className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand-block">
          <div className="brand-row">
            <AppLogo size={26} />
            <span className="brand-wordmark"><span className="brand-alpha">Alpha</span> Nova</span>
          </div>
          <span className="brand-edition">Pro Terminal V3</span>
        </div>

        <nav>
          <div className="nav-section">
            <div className="nav-section-title">Daily workflow</div>
            {PRIMARY_NAV_ITEMS.map((item) => (
              <NavItem key={item.to} {...item} onNavigate={() => setMenuOpen(false)} />
            ))}
          </div>
          <details
            className="nav-more"
            open={MORE_ROUTE_PATHS.has(location.pathname) ? true : undefined}
          >
            <summary>More tools</summary>
            {MORE_NAV_SECTIONS.map((section) => (
              <div className="nav-section" key={section.title}>
                <div className="nav-section-title">{section.title}</div>
                {section.items.map((item) => (
                  <NavItem key={item.to} {...item} onNavigate={() => setMenuOpen(false)} />
                ))}
              </div>
            ))}
          </details>
        </nav>

        <div className="sidebar-footer">
          {!currentUser && (
            <Link
              to="/login?mode=signup"
              state={{ from: location }}
              className="sidebar-signup-cta"
              onClick={() => setMenuOpen(false)}
            >
              Save watchlist &amp; enable alerts
            </Link>
          )}
          <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
            <Settings size={16} aria-hidden="true" />
            <span className="settings-btn-label">
              <span>Settings</span>
              <span className="settings-btn-email">
                {currentUser ? currentUser.email : 'Save watchlist & enable alerts'}
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="content">
        <ScrollToTop />
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
          <Route path="/flcl" element={<Flcl />} />
          <Route path="/druck-minervini" element={<DruckMinervini />} />
          <Route path="/screener" element={<Screener />} />

          <Route path="/fiidii" element={<FiiDii />} />
          <Route path="/arima" element={<Arima />} />
          <Route path="/position-sizing" element={<PositionSizing />} />
          <Route path="/news" element={<News />} />
          <Route path="/option-chain" element={<OptionChain />} />
          <Route path="/signals" element={<MarketSignals />} />
          <Route path="/track-record" element={<TrackRecord />} />
          <Route path="/sectors" element={<SectorRotation />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/trading-game" element={<TradingGame />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </Suspense>
      </div>

      <MobileTabBar onMore={() => setMenuOpen(true)} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet open onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
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
          {/* No auth wall: every visitor lands in the complete terminal. */}
          <Route
            path="/login"
            element={<Suspense fallback={<PageLoader />}><Login /></Suspense>}
          />
          <Route path="*" element={<AppLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
