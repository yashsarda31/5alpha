// Guest access gate — the signup-wall experiment.
//
// History matters here, because this setting has been wrong in both directions:
//   * Before 2026-07-10 every route sat behind ProtectedRoute. Anonymous
//     visitors hit a bare login wall with no product preview: 1000 visitors,
//     0 signups.
//   * Guest mode removed the wall entirely. That fixed the dead end but
//     over-corrected — guests now use the whole terminal indefinitely and have
//     no reason to ever create an account.
//
// This gate is the middle setting: a signed-out visitor gets one page showing
// live proof (a few genuinely scored setups) and must sign up for the terminal.
//
// Kept behind a flag so the experiment can be reversed without a deploy:
//   localStorage.setItem('alphanova_guest_gate', 'off')  -> full guest access
//   localStorage.setItem('alphanova_guest_gate', 'on')   -> force the gate
//   localStorage.removeItem('alphanova_guest_gate')      -> use the default
const OVERRIDE_KEY = 'alphanova_guest_gate';

// Flip this to false to ship full guest access again.
export const GUEST_GATE_DEFAULT = true;

// The public proof and policy surfaces remain readable without an account.
// Signals and every actionable research tool still require signup.
export const PUBLIC_PATHS = new Set([
  '/', '/login', '/track-record', '/privacy', '/terms', '/support',
]);

// How many scored setups a signed-out visitor is shown as proof.
export const GUEST_PREVIEW_SETUPS = 3;

export const isPublicPath = (pathname) => PUBLIC_PATHS.has(pathname);

// 'on' | 'off' -> boolean, anything else -> null (meaning "use the default").
export const readGateOverride = (storage) => {
  try {
    const value = storage?.getItem(OVERRIDE_KEY);
    if (value === 'on') return true;
    if (value === 'off') return false;
    return null;
  } catch {
    return null; // private-mode / blocked storage falls back to the default
  }
};

export const isGuestGateEnabled = (
  storage = typeof localStorage === 'undefined' ? null : localStorage,
) => {
  const override = readGateOverride(storage);
  return override === null ? GUEST_GATE_DEFAULT : override;
};

// Highest-scoring setup per symbol, best first. The signals engine can publish
// several sides/kinds for one stock; showing the same ticker twice in a
// three-card preview wastes the proof, so collapse to one row per symbol.
export const previewSetups = (signals, limit = GUEST_PREVIEW_SETUPS) => {
  const plans = signals?.setups?.plans || [];
  const best = new Map();
  plans.forEach((plan) => {
    if (!plan || !plan.symbol || !plan.side) return;
    const held = best.get(plan.symbol);
    if (!held || (plan.score || 0) > (held.score || 0)) best.set(plan.symbol, plan);
  });
  return [...best.values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit);
};

// The live engine publishes nothing outside market hours or when no candidate
// clears the quality bar — most of the clock. An empty proof panel behind a
// signup wall converts nobody, so the gate falls back to the last calls the
// engine actually published (GET /api/signals/preview), labelled with their
// date. Live calls always win; the fallback only fills a hole.
export const resolveGateSetups = (signals, preview, limit = GUEST_PREVIEW_SETUPS) => {
  const live = previewSetups(signals, limit);
  if (live.length) return { setups: live, live: true, asOf: null };
  const recent = (preview?.setups || [])
    .filter((setup) => setup && setup.symbol && setup.side)
    .slice(0, limit);
  return { setups: recent, live: false, asOf: recent.length ? preview?.as_of || null : null };
};

// 'YYYY-MM-DD' -> '5 Aug 2026'. Built from the parts rather than Date parsing:
// new Date('2026-08-05') is UTC midnight, which renders as the previous day in
// any timezone behind UTC.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatGateDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  return name ? `${Number(day)} ${name} ${year}` : '';
};

// Friendly name for the page the visitor was trying to open, so the gate can
// say what they were reaching for instead of a generic "sign up".
const DESTINATION_LABELS = {
  '/dashboard': 'the Dashboard',
  '/signals': 'Market Signals',
  '/screener': 'the Quant Screener',
  '/option-chain': 'the Option Chain',
  '/chart': 'the Chart Analyser',
  '/track-record': 'the Signal Track Record',
  '/watchlist': 'your Watchlist',
  '/momentum': 'Momentum Leaders',
  '/sectors': 'Sector Rotation',
  '/deals': 'Bulk & Insider Deals',
  '/fiidii': 'FII/DII Activity',
  '/dcf': 'Valuations',
  '/fundamentals': 'Fundamentals',
  '/news': 'Market News',
  '/arima': 'SARIMAX Forecasting',
  '/flcl': 'FLCL Analysis',
  '/position-sizing': 'Position Sizing',
  '/superstar-portfolios': 'Superstar Portfolios',
  '/leaderboard': 'the Nifty Leaderboard',
  '/learn': 'Learning Resources',
  '/trading-game': 'the Discipline Arena',
};

export const destinationLabel = (pathname) => DESTINATION_LABELS[pathname] || null;

const DEFAULT_GATE_CONTENT = {
  lede: 'Create a free account to open Alpha Nova.',
  previewTitle: 'One account, one connected workflow',
  points: ['Live market context', 'Saved research across devices', 'Alerts when new setups qualify'],
  showSignals: false,
};

const GATE_CONTENT = {
  '/dashboard': {
    lede: 'Market regime, watchlist and qualified ideas—together.',
    previewTitle: 'Your 10-minute market routine',
    points: ['Read the regime', 'Review the shortlist', 'Verify risk before acting'],
    showSignals: true,
  },
  '/signals': {
    // Not "live scores": the panel falls back to the last published session
    // when the market is quiet, and the copy has to hold in both states.
    lede: 'See real scored calls now. Sign up to unlock fixed trade levels.',
    previewTitle: 'Live scored setups',
    points: [],
    showSignals: true,
  },
  '/screener': {
    lede: 'Filter NSE stocks by momentum, quality, value and liquidity.',
    previewTitle: 'Build a focused shortlist',
    points: ['Institutional-style filters', 'NSE liquidity and trend checks', 'Links into chart research'],
    showSignals: false,
  },
  '/option-chain': {
    lede: 'Read options positioning without a spreadsheet.',
    previewTitle: 'Read derivatives context',
    points: ['PCR and open-interest structure', 'Max pain and implied volatility', 'Support and resistance context'],
    showSignals: false,
  },
  '/chart': {
    lede: 'Verify any NSE or US setup on the chart.',
    previewTitle: 'Verify the chart',
    points: ['Trend and momentum context', 'Technical structure', 'Research links from every symbol'],
    showSignals: false,
  },
  '/watchlist': {
    lede: 'Keep your research list in one place.',
    previewTitle: 'Make the terminal yours',
    points: ['NSE and US symbols', 'Live prices', 'One-tap research actions'],
    showSignals: false,
  },
  '/momentum': {
    lede: 'Find stocks with persistent relative strength.',
    previewTitle: 'Find durable leaders',
    points: ['Relative-strength ranking', 'Trend persistence', 'NSE and US context'],
    showSignals: false,
  },
  '/sectors': {
    lede: 'See where sector leadership is shifting.',
    previewTitle: 'Read sector rotation',
    points: ['Relative performance', 'Leadership quadrants', 'Market-level context'],
    showSignals: false,
  },
  '/deals': {
    lede: 'Review large NSE transactions and ownership activity.',
    previewTitle: 'Inspect meaningful transactions',
    points: ['Bulk deals', 'Block deals', 'Insider activity'],
    showSignals: false,
  },
  '/fiidii': {
    lede: 'Track daily institutional participation.',
    previewTitle: 'Follow institutional flows',
    points: ['FII cash activity', 'DII cash activity', 'Participation trend'],
    showSignals: false,
  },
  '/dcf': {
    lede: 'Estimate value and test market expectations.',
    previewTitle: 'Value the business',
    points: ['Editable cash-flow assumptions', 'Margin-of-safety view', 'Reverse valuation context'],
    showSignals: false,
  },
  '/fundamentals': {
    lede: 'Check performance, balance-sheet quality and valuation.',
    previewTitle: 'Check business quality',
    points: ['Financial trends', 'Provider and period labels', 'Missing-data warnings'],
    showSignals: false,
  },
  '/news': {
    lede: 'Connect headlines to your research.',
    previewTitle: 'Add news context',
    points: ['Stock-linked headlines', 'Sentiment context', 'Direct research links'],
    showSignals: false,
  },
  '/arima': {
    lede: 'Explore price ranges with visible uncertainty.',
    previewTitle: 'Inspect a probabilistic forecast',
    points: ['Confidence ranges', 'Out-of-sample error', 'Model limitations'],
    showSignals: false,
  },
  '/flcl': {
    lede: 'Assess swing regimes and trailing levels.',
    previewTitle: 'Inspect liquidity quality',
    points: ['Free-cash-flow coverage', 'Balance-sheet context', 'Historical trend'],
    showSignals: false,
  },
  '/position-sizing': {
    lede: 'Turn entry and stop into position size.',
    previewTitle: 'Define the downside first',
    points: ['Capital at risk', 'Share quantity', 'Risk-reward scenarios'],
    showSignals: false,
  },
  '/superstar-portfolios': {
    lede: 'Track disclosed holdings and quarterly changes.',
    previewTitle: 'Research disclosed portfolios',
    points: ['Share quantities', 'Quarterly changes', 'Source methodology'],
    showSignals: false,
  },
  '/leaderboard': {
    lede: 'Build a daily market-reading habit.',
    previewTitle: 'Practise the process',
    points: ['Daily market calls', 'Visible streaks', 'Optional public ranking'],
    showSignals: false,
  },
  '/learn': {
    lede: 'Follow a curated investing and trading path.',
    previewTitle: 'Learn with a purpose',
    points: ['Beginner-to-advanced resources', 'India-focused references', 'Risk-management material'],
    showSignals: false,
  },
  '/trading-game': {
    lede: 'Practise risk-focused trading habits.',
    previewTitle: 'Train discipline',
    points: ['Planning habits', 'Risk challenges', 'Progress tracking'],
    showSignals: false,
  },
};

export const gateContent = (pathname) => GATE_CONTENT[pathname] || DEFAULT_GATE_CONTENT;
