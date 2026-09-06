import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLatestRequestGuard } from './latestRequest.js';

const source = fs.readFileSync(new URL('../pages/Chart.jsx', import.meta.url), 'utf8');

test('Analyse leads with instrument, quote, watchlist and source date before chart evidence', () => {
  const instrument = source.indexOf('className="chart-instrument-header"');
  const quote = source.indexOf('className="chart-quote"');
  const star = source.indexOf('<WatchlistStar', instrument);
  const date = source.indexOf('className="chart-quote-date"');
  const chart = source.indexOf('className="chart-plot-pane"');
  const dash = source.indexOf('className="chart-stock-pro"');
  const summary = source.indexOf('className="stats-grid chart-summary-grid"');
  const ai = source.indexOf('className="chart-ai-section"');
  assert.ok(instrument >= 0 && quote > instrument && star > instrument && date > quote && chart > date);
  assert.ok(dash > chart && summary > dash && ai > summary);
  assert.match(source, /Explain this chart/);
  assert.doesNotMatch(source, /STOCK PRO DASH|Chart Analyser/);
});

test('VCP Rating and Alpha Score remain in technical evidence', () => {
  const dash = source.indexOf('className="chart-stock-pro"');
  const summary = source.indexOf('className="stats-grid chart-summary-grid"');
  const vcp = source.indexOf('VCP RATING', dash);
  const alpha = source.indexOf('ALPHA SCORE', dash);
  assert.ok(vcp > dash && vcp < summary);
  assert.ok(alpha > dash && alpha < summary);
});

test('Chart uses the mobile-height branch', () => {
  assert.match(source, /height:\s*isNarrow\s*\?\s*430\s*:\s*650/);
});

test('loaded identity remains separate from search text throughout displayed evidence', () => {
  assert.match(source, /const loadedTicker = chartData\?\.ticker \|\| ''/);
  assert.match(source, /setChartData\(\{ \.\.\.resChart\.data, ticker: resolved \}\)/);
  assert.match(source, /value=\{ticker\}/);
  const evidence = source.slice(source.indexOf('className="chart-instrument-header"'));
  assert.doesNotMatch(evidence, /\bticker\b/);
  assert.match(evidence, /symbol=\{loadedTicker\}/);
  assert.match(evidence, /name: loadedTicker/);
  assert.match(source, /const cur = currencyFor\(loadedTicker\)/);
});

test('AI uses loaded chart identity and rejects a response after another chart request', async () => {
  // Execute the page's actual request handler with a pending network response.
  const handler = source.slice(source.indexOf('  const runAiAnalysis = async () => {'), source.indexOf('  // With a saved Gemini key'));
  const guard = { current: createLatestRequestGuard() };
  const chartData = { ticker: 'KEI.NS', close: [4850], high: [4900], low: [4800], sma20: [4700], rsi: [55], vcp_rating: 3 };
  const reports = [];
  const requests = [];
  let resolve;
  const axios = { post: (_url, payload) => {
    requests.push(payload);
    return new Promise((done) => { resolve = done; });
  } };
  const run = new Function('chartData', 'loadedTicker', 'ticker', 'aiRequestGuardRef', 'localStorage', 'currencyFor', 'setAiReport', 'setAiLoading', 'axios', `${handler}; return runAiAnalysis;`)(
    chartData, chartData.ticker, 'RELIANCE', guard, { getItem: () => 'test-key' },
    (symbol) => symbol.endsWith('.NS') ? '₹' : '$', (report) => reports.push(report), () => {}, axios,
  );
  const pending = run();
  assert.equal(requests[0].ticker, 'KEI.NS');
  assert.match(requests[0].data_summary, /Ticker: KEI\.NS/);
  assert.match(requests[0].data_summary, /Latest Close: ₹4850\.00/);
  guard.current.begin();
  resolve({ data: { report: 'Old KEI report' } });
  await pending;
  assert.deepEqual(reports, ['']);
  assert.match(source.slice(source.indexOf('  const fetchChart'), source.indexOf('  useEffect', source.indexOf('  const fetchChart'))), /aiRequestGuardRef\.current\.begin\(\)/);
});
