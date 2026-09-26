import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Bell, BookOpen, ChevronRight, Compass, Globe2, LayoutDashboard, LineChart, LogOut, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Star, TrendingUp, X, Zap } from 'lucide-react';
import { AuthProvider, useAuth } from './legacy/AuthContext';
import { WatchlistProvider } from './legacy/WatchlistContext';
import { PredictionProvider } from './legacy/PredictionContext';
import { MarketProvider, useMarket } from './legacy/MarketContext';
import SignalAlertProvider from './legacy/alerts/SignalAlertProvider';
import AuthIntentHandler from './legacy/components/AuthIntentHandler';
import SeoMeta from './legacy/components/SeoMeta';
import Disclaimer from './legacy/components/Disclaimer';
import { trackDailySiteVisit } from './legacy/lib/productAnalytics';
import { trackSiteArrival } from './legacy/lib/trafficArrival';
import { Loading, EmptyState } from './components/ui';
import MagicCanvas from './magic/MagicCanvas';
import MagicErrorBoundary from './magic/MagicErrorBoundary';
import PageTransition from './magic/PageTransition';
import { symbolPath } from './lib/market';
import './ForecastNav.css';

const Today = lazy(() => import('./pages/Today'));
const Signals = lazy(() => import('./pages/Signals'));
const Analyse = lazy(() => import('./pages/Analyse'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const Forecast = lazy(() => import('./pages/Forecast'));
const SettingsSheet = lazy(() => import('./legacy/components/SettingsSheet'));
const Login = lazy(() => import('./legacy/pages/Login'));
const TickerSearch = lazy(() => import('./legacy/components/TickerSearch'));
const specialist = {
  '/screener': lazy(() => import('./legacy/pages/Screener')),
  '/delivery-radar': lazy(() => import('./legacy/pages/DeliveryRadar')),
  '/momentum': lazy(() => import('./legacy/pages/Momentum')),
  '/sectors': lazy(() => import('./legacy/pages/SectorRotation')),
  '/track-record': lazy(() => import('./legacy/pages/TrackRecord')),
  '/news': lazy(() => import('./legacy/pages/News')),
  '/fiidii': lazy(() => import('./legacy/pages/FiiDii')),
  '/deals': lazy(() => import('./legacy/pages/Deals')),
  '/fundamentals': lazy(() => import('./legacy/pages/Fundamentals')),
  '/dcf': lazy(() => import('./legacy/pages/Dcf')),
  '/arima': lazy(() => import('./legacy/pages/Arima')),
  '/flcl': lazy(() => import('./legacy/pages/Flcl')),
  '/druck-minervini': lazy(() => import('./legacy/pages/DruckMinervini')),
  '/position-sizing': lazy(() => import('./legacy/pages/PositionSizing')),
  '/option-chain': lazy(() => import('./legacy/pages/OptionChain')),
  '/learn': lazy(() => import('./legacy/pages/Learn')),
  '/leaderboard': lazy(() => import('./legacy/pages/Leaderboard')),
  '/trading-game': lazy(() => import('./legacy/pages/TradingGame')),
};
const Momentum = specialist['/momentum'] as React.ComponentType<Record<string, unknown>>;
const OptionChain = specialist['/option-chain'];
const DeliveryRadar = specialist['/delivery-radar'];
const tools = [
  { path: '/forecast', title: 'Stock forecast', detail: 'One-month scenarios, fundamentals and invalidation levels', icon: Sparkles, group: 'Deep research' },
  { path: '/screener', title: 'Stock screener', detail: 'Find your next research idea', icon: SlidersHorizontal, group: 'Discover' },
  { path: '/delivery-radar', title: 'Delivery radar', detail: 'Follow delivery participation', icon: Activity, group: 'Discover' },
  { path: '/momentum', title: 'Momentum leaders', detail: 'Strength, breakouts and relative performance', icon: TrendingUp, group: 'Discover' },
  { path: '/sectors', title: 'Sector rotation', detail: 'See where market leadership is moving', icon: Compass, group: 'Discover' },
  { path: '/fiidii', title: 'Institutional flows', detail: 'FII and DII activity', icon: Globe2, group: 'Market context' },
  { path: '/deals', title: 'Block & insider deals', detail: 'Published large transactions', icon: Activity, group: 'Market context' },
  { path: '/option-chain', title: 'Options intelligence', detail: 'Open interest, strikes and positioning', icon: LineChart, group: 'Market context' },
  { path: '/news', title: 'Market news', detail: 'The headlines behind the moves', icon: BookOpen, group: 'Market context' },
  { path: '/fundamentals', title: 'Fundamentals', detail: 'Understand the business behind the ticker', icon: LayoutDashboard, group: 'Deep research' },
  { path: '/dcf', title: 'Valuation model', detail: 'Explore discounted cash flow scenarios', icon: SlidersHorizontal, group: 'Deep research' },
  { path: '/arima', title: 'Price forecasting', detail: 'SARIMAX model and uncertainty ranges', icon: Sparkles, group: 'Deep research' },
  { path: '/flcl', title: 'FLCL analysis', detail: 'First-level and confirmation-level research', icon: LineChart, group: 'Deep research' },
  { path: '/druck-minervini', title: 'Druck & Minervini', detail: 'Structured growth and trend research', icon: TrendingUp, group: 'Deep research' },
  { path: '/position-sizing', title: 'Position sizing', detail: 'Translate a risk budget into position size', icon: ShieldCheck, group: 'Practice & learn' },
  { path: '/track-record', title: 'Signal track record', detail: 'Inspect recorded outcomes and limitations', icon: Activity, group: 'Practice & learn' },
  { path: '/learn', title: 'Research library', detail: 'Build a more informed process', icon: BookOpen, group: 'Practice & learn' },
  { path: '/leaderboard', title: 'Prediction leaderboard', detail: 'Explore community predictions', icon: Star, group: 'Practice & learn' },
  { path: '/trading-game', title: 'Discipline arena', detail: 'Practise decisions without capital at risk', icon: Zap, group: 'Practice & learn' },
];
const primary = [
  { path: '/dashboard', title: 'Today', icon: LayoutDashboard },
  { path: '/signals', title: 'Signals', icon: Zap },
  { path: '/chart', title: 'Analyse', icon: LineChart },
  { path: '/watchlist', title: 'Watchlist', icon: Star },
  { path: '/forecast', title: 'Forecast', icon: Sparkles },
];

function Brand() {
  return <Link to="/dashboard" className="an-brand" aria-label="Alpha Nova home"><svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="10" fill="#16343a"/><path d="M9 24 17 9l8 15M12 19h10" fill="none" stroke="#99eeed" strokeWidth="2" strokeLinejoin="round"/><circle cx="26" cy="8" r="2" fill="#edce91"/></svg><span>alpha<span className="an-brand-light">nova</span><small>MARKET RESEARCH</small></span></Link>;
}
function ToolDirectory() {
  const [query, setQuery] = useState('');
  const filtered = tools.filter(tool => `${tool.title} ${tool.detail}`.toLowerCase().includes(query.toLowerCase()));
  return <div><div className="an-page-heading"><div><div className="an-kicker">YOUR RESEARCH TOOLKIT</div><h1>One market. More perspectives.</h1><p>Go deeper with the right tool for the question.</p></div></div><label className="an-directory-search"><Search size={18}/><input className="an-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a research tool…" aria-label="Find a research tool"/></label>{['Discover', 'Market context', 'Deep research', 'Practice & learn'].map(group => { const items = filtered.filter(t => t.group === group); return items.length > 0 && <section key={group} className="an-tool-section"><h2>{group}</h2><div className="an-tool-grid">{items.map(({path,title,detail,icon:Icon}) => <Link className="an-tool-card" to={path} key={path}><span className="an-tool-icon"><Icon size={21}/></span><div><h3>{title}</h3><p>{detail}</p></div><ArrowUpRight size={16}/></Link>)}</div></section>; })}{!filtered.length && <EmptyState title="No matching tools" description="Try a topic such as delivery, options or valuation."/>}</div>;
}
function SearchDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const { market } = useMarket();
  const navigate = useNavigate();
  useEffect(() => { ref.current?.showModal(); }, []);
  const openSymbol = (symbol: string) => { if (symbol.trim()) { navigate(symbolPath(symbol, market)); close(); } };
  return <dialog ref={ref} className="an-search-dialog" aria-label="Search stocks and tools" onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}><div className="an-search-head"><span className="an-kicker">FIND YOUR NEXT IDEA</span><button className="an-icon-button" onClick={close} aria-label="Close search"><X size={20}/></button></div><form onSubmit={e => { e.preventDefault(); openSymbol(query); }} className="an-search-form"><Search size={21}/><Suspense fallback={<span className="an-muted">Opening search…</span>}><TickerSearch value={query} onChange={setQuery} onSelect={openSymbol} placeholder="Search a company or symbol" inputStyle={undefined} inputProps={{ autoFocus: true, 'aria-label': 'Search stocks' }}/></Suspense><button className="an-button an-button-primary" type="submit">Analyse</button></form><p className="an-muted">Type a company name, or enter a full symbol such as {market === 'US' ? 'AAPL' : 'RELIANCE.NS'}.</p>{!query && <div className="an-search-links" aria-label="Popular symbols">{(market === 'US' ? ['AAPL','MSFT','NVDA'] : ['RELIANCE.NS','TCS.NS','HDFCBANK.NS']).map(symbol => <button className="an-button" key={symbol} onClick={() => openSymbol(symbol)}>{symbol}</button>)}</div>}<div className="an-search-links">{tools.filter(t => `${t.title} ${t.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5).map(t => <Link key={t.path} to={t.path} onClick={close}><t.icon size={17}/><span>{t.title}</span><ChevronRight size={15}/></Link>)}</div><footer>Stock research & tools <kbd>esc</kbd> to close</footer></dialog>;
}
class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <EmptyState title="This page could not load" description="Your research is still saved. Reload the page to try again." action={<button className="an-button" onClick={() => window.location.reload()}>Reload page</button>}/> : this.props.children; }
}
function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { market, setMarket } = useMarket() as {market: string; setMarket: (market: string) => void};
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    const collect = async () => { await trackSiteArrival({ pathname: location.pathname, search: location.search }); await trackDailySiteVisit(); };
    void collect();
  }, [location.pathname, location.search]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(open => !open); } };
    window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle);
  }, []);
  const active = [...primary, ...tools, { path: '/explore', title: 'Explore' }, { path: '/login', title: 'Account' }].find(item => item.path === location.pathname);
  const setSelectedMarket = (next: string) => { setMarket(next); const params = new URLSearchParams(location.search); params.set('market', next); if (location.pathname === '/chart' || location.pathname === '/forecast') params.delete('symbol'); navigate({ pathname: location.pathname, search: params.toString() }, { replace: true }); };
  const loginState = { from: { pathname: location.pathname, search: location.search } };
  return <div className="an-app"><MagicErrorBoundary><MagicCanvas /></MagicErrorBoundary><a href="#main-content" className="an-skip-link">Skip to content</a><SeoMeta/><AuthIntentHandler/>
    <aside className="an-sidebar"><Brand/><div className="an-sidebar-label">WORKSPACE</div><nav aria-label="Primary navigation">{primary.map(({ path, title, icon: Icon }) => <NavLink key={path} to={path} className={({isActive}) => `an-nav-item ${isActive ? 'active' : ''}`}><Icon size={18}/><span>{title}</span>{path === '/signals' && <span className="an-nav-dot"/>}{path === '/forecast' && <small className="an-featured-label">Featured</small>}</NavLink>)}</nav><div className="an-sidebar-label">EXPLORE</div><nav aria-label="Research tools">{tools.filter(tool => tool.path !== '/forecast').slice(0, 4).map(({path,title,icon:Icon}) => <NavLink className={({isActive}) => `an-nav-item ${isActive ? 'active' : ''}`} key={path} to={path}><Icon size={18}/><span>{title}</span></NavLink>)}<NavLink to="/explore" className={({isActive}) => `an-nav-item ${isActive ? 'active' : ''}`}><Compass size={18}/><span>Explore</span><ChevronRight size={14}/></NavLink></nav><div className="an-sidebar-bottom"><Link className="an-learn-card" to="/learn" aria-label="Research library: build your market knowledge"><span className="an-learn-orbit"><BookOpen size={20}/></span><strong>A better research process.</strong><span>Build your market knowledge <ArrowUpRight size={13}/></span></Link><button className="an-nav-item" onClick={() => setSettingsOpen(true)}><Settings size={18}/>Settings & alerts</button>{currentUser ? <div className="an-account"><span className="an-avatar">{String(currentUser.displayName || currentUser.email || 'A').slice(0,1).toUpperCase()}</span><div><strong>{currentUser.displayName || 'Your account'}</strong><small>Research workspace</small></div><button onClick={logout} className="an-icon-button" aria-label="Sign out"><LogOut size={16}/></button></div> : <Link className="an-account" to="/login" state={loginState}><span className="an-avatar">AN</span><div><strong>Your personal workspace</strong><small>Sign in to save your research</small></div><ArrowUpRight size={15}/></Link>}</div></aside>
    <div className="an-workspace"><header className="an-topbar"><div className="an-breadcrumb"><span>Workspace</span><ChevronRight size={13}/><strong>{active?.title || 'Research'}</strong></div><div className="an-mobile-brand"><Brand/></div><button className="an-global-search" onClick={() => setSearchOpen(true)}><Search size={16}/><span>Search stocks, tools and more</span><kbd>Ctrl / ⌘ K</kbd></button><div className="an-top-actions"><div className="an-market-switch" aria-label="Market"><button aria-pressed={market === 'IN'} onClick={() => setSelectedMarket('IN')}>IN<span> India</span></button><button aria-pressed={market === 'US'} onClick={() => setSelectedMarket('US')}>US<span> Market</span></button></div><button className="an-icon-button an-mobile-search" onClick={() => setSearchOpen(true)} aria-label="Search stocks and tools"><Search size={20}/></button><button className="an-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Notification settings"><Bell size={18}/></button></div></header>
    <main id="main-content" className="an-main" tabIndex={-1}><PageTransition><PageBoundary key={location.pathname}><Suspense fallback={<Loading label="Opening your workspace"/>}><Routes><Route path="/" element={<Navigate to={{ pathname: "/dashboard", search: location.search, hash: location.hash }} state={location.state} replace/>}/>{Object.entries({ '/analyse':'/chart', '/auth':'/login', '/tools':'/explore', '/sector-rotation':'/sectors', '/institutional-flows':'/fiidii' }).map(([from,to]) => <Route key={from} path={from} element={<Navigate to={{ pathname:to, search:location.search, hash:location.hash }} state={location.state} replace/>}/>)}<Route path="/dashboard" element={<Today/>}/><Route path="/signals" element={<Signals/>}/><Route path="/chart" element={<Analyse/>}/><Route path="/watchlist" element={<Watchlist/>}/><Route path="/forecast" element={<Forecast/>}/><Route path="/explore" element={<ToolDirectory/>}/><Route path="/login" element={<div className="an-legacy"><Login/></div>}/>{Object.entries(specialist).map(([path, Page]) => <Route key={path} path={path} element={<div className="an-legacy"><Page/></div>}/>)}<Route path="/stocks-at-52-week-high-today" element={<div className="an-legacy"><Momentum initialView={'breakouts'} eventType={'52W HIGH'} marketOverride={'in'} title={'Stocks at 52-Week High Today'} subtitle={'Confirmed highs in the covered NSE universe.'}/></div>}/><Route path="/high-delivery-volume-stocks-today" element={<Navigate to={{ pathname: "/delivery-radar", search: location.search, hash: location.hash }} state={location.state} replace/>}/><Route path="/fii-dii-data-today" element={<Navigate to={{ pathname: "/fiidii", search: location.search, hash: location.hash }} state={location.state} replace/>}/><Route path="/bulk-block-deals-today" element={<Navigate to={{ pathname: "/deals", search: location.search, hash: location.hash }} state={location.state} replace/>}/><Route path="/nifty-pcr-today" element={<div className="an-legacy"><OptionChain defaultSymbol="NIFTY"/></div>}/><Route path="/bank-nifty-oi-analysis" element={<div className="an-legacy"><OptionChain defaultSymbol="BANKNIFTY"/></div>}/><Route path="/stocks/:symbol/delivery-percentage" element={<div className="an-legacy"><DeliveryRadar/></div>}/><Route path="*" element={<EmptyState title="Page not found" description="This address does not exist. Check the link or explore the research workspace." action={<Link className="an-button an-button-primary" to="/explore">Explore tools</Link>}/>}/></Routes></Suspense></PageBoundary></PageTransition><footer className="an-footer"><div><span className="an-footer-mark">α</span> Independent research. Informed decisions.</div><span>Provider snapshots · prices may be delayed</span></footer><div className="an-disclosure"><Disclaimer/></div></main></div>
    <nav className="an-mobile-dock" aria-label="Mobile navigation">{primary.map(({path,title,icon:Icon}) => <NavLink key={path} to={path} className={({isActive}) => isActive ? 'active' : ''}><Icon size={20}/><span>{title}</span></NavLink>)}<NavLink to="/explore"><Compass size={20}/><span>Explore</span></NavLink></nav>
    {searchOpen && <SearchDialog close={() => setSearchOpen(false)}/>}{settingsOpen && <Suspense fallback={null}><SettingsSheet open onClose={() => setSettingsOpen(false)}/></Suspense>}
  </div>;
}
export default function App() { return <BrowserRouter><AuthProvider><MarketProvider><WatchlistProvider><PredictionProvider><SignalAlertProvider><Shell/></SignalAlertProvider></PredictionProvider></WatchlistProvider></MarketProvider></AuthProvider></BrowserRouter>; }
