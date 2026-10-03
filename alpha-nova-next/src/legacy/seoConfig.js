export const SITE_ORIGIN = 'https://abovealphasolutions.com';
export const DEFAULT_SOCIAL_IMAGE = '/api/public-preview/alpha-nova.png';

const research = (title, description, extra = {}) => ({ title, description, index: true, image: DEFAULT_SOCIAL_IMAGE, ...extra });
const privatePage = (title) => ({ title, description: 'Alpha Nova private workspace.', index: false });

export const SEO_ROUTES = {
  '/': research('Alpha Nova — NSE Delivery Intelligence for Indian Swing Traders', 'Turn official NSE delivery data into a dated daily shortlist with price context, transparent baselines, and shareable research.'),
  '/dashboard': research('Today’s Indian Market Research Dashboard | Alpha Nova', 'Review market context, signals, delivery activity, and the next research actions for the latest available session.', { canonicalPath: '/' }),
  '/delivery-radar': research('NSE Delivery Radar — Unusual Delivered Quantity | Alpha Nova', 'Compare delivered quantity and delivery percentage with each NSE stock’s prior 20-session average.', { image: '/api/public-preview/delivery-radar.png' }),
  '/high-delivery-volume-stocks-today': research('High Delivery Volume Stocks Today — NSE | Alpha Nova', 'See NSE stocks with unusual delivered quantity versus their prior 20-session average, with delivery percentage, price move, source date, and coverage.', { image: '/api/public-preview/delivery-radar.png' }),
  '/signals': research('Indian Market Signals With Evidence | Alpha Nova', 'Research dated Indian market setups with explicit evidence, risk context, and incomplete-data states.'),
  '/chart': research('Stock Chart Analysis | Alpha Nova', 'Open a shareable stock chart with technical context and source-aware research tools.'),
  '/screener': research('Indian Stock Screener — Technical and Fundamental | Alpha Nova', 'Run editable screens across supported Indian and US universes with completed-session dates and transparent rules.'),
  '/momentum': research('NSE Momentum Leaders | Alpha Nova', 'Review dated Indian momentum leaders and weakness lists with data coverage disclosures.'),
  '/stocks-at-52-week-high-today': research('Stocks at 52-Week High Today — NSE | Alpha Nova', 'See covered NSE large-cap stocks whose latest session close finished above the prior 252-session high, with source date and coverage.'),
  '/sectors': research('India Sector Rotation | Alpha Nova', 'Compare Indian sector rotation and constituent leadership on matched weekly observations.'),
  '/track-record': research('Alpha Nova Signal Track Record', 'Review resolved signal outcomes and the methodology used to measure them.'),
  '/fiidii': research('FII and DII Activity | Alpha Nova', 'Review provisional cash-market institutional flows with the actual available date and source status.', { canonicalPath: '/fii-dii-data-today' }),
  '/fii-dii-data-today': research('FII DII Data Today — Provisional Cash Flows | Alpha Nova', 'See the latest available provisional FII and DII cash-market buy, sell, and net activity with source dates.'),
  '/option-chain': research('NSE Option Chain Analysis | Alpha Nova', 'Inspect expiry-specific NSE option open interest, PCR, strike distribution, and timestamps.'),
  '/nifty-pcr-today': research('Nifty PCR Today — Open Interest Put Call Ratio | Alpha Nova', 'Review NIFTY expiry-specific open-interest PCR with the included strike universe and timestamp.'),
  '/bank-nifty-oi-analysis': research('Bank Nifty OI Analysis — Expiry and Strike Map | Alpha Nova', 'Review BANKNIFTY expiry-specific call and put open interest, changes, PCR, and strike distribution.'),
  '/deals': research('Bulk, Block and Insider Deals | Alpha Nova', 'Research exchange-reported deals and disclosed counterparties with source dates.', { canonicalPath: '/bulk-block-deals-today' }),
  '/bulk-block-deals-today': research('Bulk and Block Deals Today — NSE | Alpha Nova', 'Review the latest available NSE bulk and block deals with counterparties, quantities, prices, values, and source date.'),
  '/fundamentals': research('Stock Fundamentals Research | Alpha Nova', 'Review provider-dated financial and valuation fields without hiding unavailable evidence.'),
  '/dcf': research('DCF Calculator | Alpha Nova', 'Build and share a transparent discounted cash-flow scenario with editable assumptions.'),
  '/forecast': research('One-Month Stock Forecast | Alpha Nova', 'Explore historical price scenarios, invalidation levels, ROE, earnings growth and dated news with explicit data limitations.'),
  '/arima': research('SARIMAX Stock Forecast Research | Alpha Nova', 'Explore a dated statistical forecast with model limitations and shareable inputs.'),
  '/flcl': research('First Lower Close Last Lower Close Analysis | Alpha Nova', 'Review FLCL price structure with shareable symbol research.'),
  '/position-sizing': research('Trading Position Size Calculator | Alpha Nova', 'Calculate position size from capital, entry, stop, and explicit risk assumptions.'),
  '/news': research('Indian Market News | Alpha Nova', 'Review market news alongside Alpha Nova research tools.'),
  '/learn': research('Learn Systematic Market Research | Alpha Nova', 'Learn how to interpret market evidence, risk, and data limitations.'),
  '/druck-minervini': research('Druckenmiller and Minervini Research | Alpha Nova', 'Research growth and trend characteristics using transparent simplified screens.'),
  '/explore': research('Explore research tools | Alpha Nova', 'Find stock screeners, market context, and company research tools.'),
  '/login': privatePage('Sign in | Alpha Nova'),
  '/watchlist': privatePage('Watchlist | Alpha Nova'),
  '/leaderboard': privatePage('Prediction Leaderboard | Alpha Nova'),
  '/trading-game': privatePage('Discipline Arena | Alpha Nova'),
};

export function seoForPath(pathname) {
  if (/^\/stocks\/[^/]+\/delivery-percentage$/.test(pathname)) {
    const encoded = pathname.split('/')[2];
    let symbol = 'NSE stock';
    try { symbol = decodeURIComponent(encoded).toUpperCase(); } catch { /* keep safe fallback */ }
    return research(`${symbol} Delivery Percentage and History | Alpha Nova`, `Review ${symbol} delivered quantity, delivery percentage, price move, and prior 20-session comparisons from official NSE files.`, { image: `/api/public-preview/delivery-radar.png` });
  }
  return SEO_ROUTES[pathname] || { title:'Page not found | Alpha Nova', description:'This address does not exist. Explore Alpha Nova research tools.', index:false };
}
