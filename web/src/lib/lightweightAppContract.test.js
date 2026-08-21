import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('route code is fetched only from explicit navigation intent', () => {
  const app = source('../App.jsx');

  assert.doesNotMatch(app, /requestIdleCallback|setTimeout\(warm/);
  assert.match(app, /onMouseEnter=\{\(\) => prefetchRoute\(to\)\}/);
  assert.match(app, /onTouchStart=\{\(\) => prefetchRoute\(to\)\}/);
  assert.match(app, /onFocus=\{\(\) => prefetchRoute\(to\)\}/);
});

test('login and settings code load only when those surfaces are opened', () => {
  const app = source('../App.jsx');

  assert.doesNotMatch(app, /import Login from/);
  assert.doesNotMatch(app, /import SettingsSheet from/);
  assert.match(app, /const Login = lazy\(\(\) => import\('\.\/pages\/Login'\)\)/);
  assert.match(app, /const SettingsSheet = lazy\(\(\) => import\('\.\/components\/SettingsSheet'\)\)/);
  assert.match(app, /settingsOpen &&/);
});

test('AI markdown libraries load only when an insight is rendered', () => {
  const pages = [
    'Arima', 'Chart', 'Dcf', 'DruckMinervini', 'Flcl', 'Fundamentals',
    'PositionSizing', 'Screener', 'SectorRotation',
  ];

  pages.forEach((page) => {
    const code = source(`../pages/${page}.jsx`);
    assert.doesNotMatch(code, /from 'react-markdown'|from 'remark-gfm'/, page);
    assert.match(code, /LazyMarkdown/, page);
  });
});

test('the alert provider observes shared Signals data without owning a poller', () => {
  const provider = source('../alerts/SignalAlertProvider.jsx');

  assert.match(provider, /subscribe\('signals'/);
  assert.doesNotMatch(provider, /fetch\('\/api\/signals'/);
  assert.doesNotMatch(provider, /setInterval\(runPoll/);
});

test('Dashboard fetches the shared Signals snapshot it displays', () => {
  const dashboard = source('../pages/Dashboard.jsx');

  assert.match(dashboard, /useSWR\(\s*'signals'/);
  assert.match(dashboard, /axios\.get\('\/api\/signals'\)/);
});

test('prediction data loads only on routes that render it', () => {
  const provider = source('../PredictionContext.jsx');

  assert.match(provider, /useLocation/);
  assert.match(provider, /shouldLoadPrediction\(location\.pathname\)/);
});

test('the primary navigation is a four-step workflow with deeper tools disclosed separately', () => {
  const app = source('../App.jsx');

  assert.match(app, /const PRIMARY_NAV_ITEMS/);
  for (const label of ['Today', 'Signals', 'Analyse', 'Watchlist']) {
    assert.match(app, new RegExp(`label: '${label}'`));
  }
  assert.match(app, />More tools</);
});
