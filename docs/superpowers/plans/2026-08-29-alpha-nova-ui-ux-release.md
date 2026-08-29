# Alpha Nova UI/UX Completion and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the approved Alpha Nova Today, Signals, alerts, navigation, watchlist, and accessibility improvements and deploy the verified combined tree to production.

**Architecture:** Preserve the existing React/Vite shell, routes, FastAPI backend, contextual-auth contract, and glass-terminal design system. Add small pure helpers for alert queuing and tool filtering, keep page-specific presentation in the existing page files, and use current shared UI components for semantics and accessibility.

**Tech Stack:** React 19, React Router 7, Vite 8, Node test runner, CSS, FastAPI/Python, Vercel.

## Global Constraints

- Alpha Nova remains public and research-only; do not add a paywall, pricing, execution, or return claims.
- Preserve every specialist route and all analytical data.
- Preserve contextual authentication and the originating route/pending intent.
- Keep essential text at least 14px and metadata at least 12px.
- Mobile interactive targets must be at least 44 by 44 CSS pixels.
- Do not alter unrelated `OpenBB/`, `nourishfit/`, `sales-momentum/`, local ads, webinar files, `.tmp/`, or `.ui-audit/`.
- Do not push to a remote repository.

## File Structure

- `web/src/pages/Dashboard.jsx` and `Dashboard.css`: Today hierarchy and next actions.
- `web/src/alerts/alertPresentation.js` and `.test.js`: single-toast queue and lifetime contract.
- `web/src/alerts/SignalAlertProvider.jsx`, `ToastStack.jsx`, and `alerts.css`: alert integration and responsive presentation.
- `web/src/lib/toolNavigation.js` and `.test.js`: local tool filtering and recent-tool persistence.
- `web/src/App.jsx` and `index.css`: desktop disclosure plus the mobile More sheet.
- `web/src/pages/Watchlist.jsx` and `Watchlist.css`: starter suggestions and empty-state actions.
- `web/src/components/ui/PageHeader.jsx`, `SectionTitle.jsx`, `DataTable.jsx`, and `ui.css`: semantic headings, sorting, focus, and touch targets.
- `web/src/components/DataStatus.jsx`, `web/src/pages/MarketSignals.jsx`, and `MarketSignals.css`: refresh disclosure and scoring-methodology disclosure.
- `web/src/lib/uiUxReleaseContract.test.js`: cross-surface source contracts that supplement pure helper tests.

---

### Task 1: Reorder Today Around the Decision Journey

**Files:**
- Create: `web/src/lib/uiUxReleaseContract.test.js`
- Modify: `web/src/pages/Dashboard.jsx`
- Modify: `web/src/pages/Dashboard.css`

**Interfaces:**
- Consumes: existing `PulseStrip`, `PrioritySetups`, `MyWatchlist`, `SectionTitle`, and React Router `Link`.
- Produces: `NextActions` UI and source order `PulseStrip -> PrioritySetups -> NextActions -> MyWatchlist -> Market Details`.

- [ ] **Step 1: Write the failing Today order test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Today prioritizes state, setups, next actions, then watchlist', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  const order = [
    '<PulseStrip',
    '<PrioritySetups',
    '<NextActions',
    '<MyWatchlist',
    '<SectionTitle>Market Details</SectionTitle>',
  ].map((token) => dashboard.lastIndexOf(token));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(dashboard, /to="\/signals"[^>]*>Review Signals/);
  assert.match(dashboard, /to="\/chart"[^>]*>Analyse a symbol/);
  assert.match(dashboard, /to="\/position-sizing"[^>]*>Size a position/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd web; node --test src/lib/uiUxReleaseContract.test.js`

Expected: FAIL because `NextActions` and the approved order do not exist.

- [ ] **Step 3: Add the minimal Today implementation**

Add above `Dashboard`:

```jsx
const NextActions = () => (
  <section className="dash-next-actions" aria-labelledby="dash-next-actions-title">
    <SectionTitle id="dash-next-actions-title">Next Actions</SectionTitle>
    <div className="dash-next-actions__grid">
      <Link to="/signals">Review Signals</Link>
      <Link to="/chart">Analyse a symbol</Link>
      <Link to="/position-sizing">Size a position</Link>
    </div>
  </section>
);
```

Render the blocks in this exact order after `PulseStrip`:

```jsx
<PrioritySetups signals={signalsData} loading={signalsLoading} />
<NextActions />
<div style={{ marginBottom: 8 }}><MyWatchlist /></div>
```

Add these styles in `Dashboard.css`:

```css
.dash-next-actions { margin: 18px 0 24px; }
.dash-next-actions__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.dash-next-actions__grid a {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  text-decoration: none;
  background: var(--surface-tile);
}
@media (max-width: 650px) {
  .dash-next-actions__grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Run focused and existing dashboard contracts**

Run: `cd web; node --test src/lib/uiUxReleaseContract.test.js src/lib/decisionCockpitContract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
rtk git add -- web/src/lib/uiUxReleaseContract.test.js web/src/pages/Dashboard.jsx web/src/pages/Dashboard.css
rtk git commit -m "feat: prioritize Alpha Nova daily decisions"
```

### Task 2: Make In-App Signal Alerts Compact and Non-Blocking

**Files:**
- Create: `web/src/alerts/alertPresentation.js`
- Create: `web/src/alerts/alertPresentation.test.js`
- Modify: `web/src/alerts/SignalAlertProvider.jsx`
- Modify: `web/src/alerts/ToastStack.jsx`
- Modify: `web/src/alerts/alerts.css`

**Interfaces:**
- Produces: `TOAST_TTL_MS = 5000` and `enqueueToast(current, next) -> [next]`.
- Consumes: the existing `notify`, `dismiss`, and `openToast` provider callbacks.

- [ ] **Step 1: Write the failing pure helper tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOAST_TTL_MS, enqueueToast } from './alertPresentation.js';

test('signal alerts show one toast at a time', () => {
  assert.deepEqual(enqueueToast([{ id: 'old' }], { id: 'new' }), [{ id: 'new' }]);
});

test('signal alerts expire after five seconds', () => {
  assert.equal(TOAST_TTL_MS, 5000);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web; node --test src/alerts/alertPresentation.test.js`

Expected: FAIL because `alertPresentation.js` does not exist.

- [ ] **Step 3: Implement the helper and integrate it**

```js
export const TOAST_TTL_MS = 5000;
export const enqueueToast = (_current, next) => [next];
```

Import both exports into `SignalAlertProvider.jsx`, delete its local ten-second
constant, and replace the queue update with:

```js
setToasts((prev) => enqueueToast(prev, toast));
window.setTimeout(() => dismiss(id), TOAST_TTL_MS);
```

In `ToastStack.jsx`, keep symbol, side, score, entry, and stop; remove the target
from the toast body because the complete plan remains one click away.

In `alerts.css`, keep desktop top-right placement and add:

```css
@media (max-width: 850px) {
  .toast-stack {
    top: calc(60px + env(safe-area-inset-top, 0px));
    right: 12px;
    width: calc(100vw - 24px);
    max-height: calc(100vh - 132px - env(safe-area-inset-bottom, 0px));
  }
  .signal-toast { padding-right: 52px; }
  .signal-toast .st-close { min-width: 44px; min-height: 44px; top: 2px; right: 2px; }
}
```

- [ ] **Step 4: Run focused alert and signed-in contracts**

Run: `cd web; node --test src/alerts/alertPresentation.test.js src/lib/signedInAccountUxContract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
rtk git add -- web/src/alerts/alertPresentation.js web/src/alerts/alertPresentation.test.js web/src/alerts/SignalAlertProvider.jsx web/src/alerts/ToastStack.jsx web/src/alerts/alerts.css
rtk git commit -m "feat: make signal alerts non blocking"
```

### Task 3: Replace Redundant Mobile Navigation With a Searchable More Sheet

**Files:**
- Create: `web/src/lib/toolNavigation.js`
- Create: `web/src/lib/toolNavigation.test.js`
- Modify: `web/src/App.jsx`
- Modify: `web/src/index.css`
- Modify: `web/src/lib/uiUxReleaseContract.test.js`

**Interfaces:**
- Produces: `filterToolSections(sections, query)`, `readRecentTools(storage)`, and `recordRecentTool(storage, item)`.
- Consumes: existing `MORE_NAV_SECTIONS`, `MobileTabBar`, focus trap, auth intent, and sidebar markup.

- [ ] **Step 1: Write failing navigation helper tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterToolSections, readRecentTools, recordRecentTool } from './toolNavigation.js';

const sections = [
  { title: 'Research', items: [{ to: '/dcf', label: 'DCF Calculator' }, { to: '/screener', label: 'Quant Screener' }] },
];

test('tool search keeps matching groups and items', () => {
  assert.deepEqual(filterToolSections(sections, 'dcf'), [
    { title: 'Research', items: [{ to: '/dcf', label: 'DCF Calculator' }] },
  ]);
});

test('recent tools are bounded and storage-safe', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  recordRecentTool(storage, { to: '/dcf', label: 'DCF Calculator' });
  recordRecentTool(storage, { to: '/screener', label: 'Quant Screener' });
  assert.deepEqual(readRecentTools(storage).map((item) => item.to), ['/screener', '/dcf']);
  assert.deepEqual(readRecentTools(null), []);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web; node --test src/lib/toolNavigation.test.js`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure navigation helpers**

```js
const RECENT_KEY = 'alphanova_recent_tools_v1';

export const filterToolSections = (sections, query) => {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return sections;
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.label.toLowerCase().includes(needle)) }))
    .filter((section) => section.items.length > 0);
};

export const readRecentTools = (storage) => {
  try { return JSON.parse(storage?.getItem(RECENT_KEY) || '[]').slice(0, 4); } catch { return []; }
};

export const recordRecentTool = (storage, item) => {
  if (!storage || !item?.to || !item?.label) return [];
  const next = [item, ...readRecentTools(storage).filter((saved) => saved.to !== item.to)].slice(0, 4);
  try { storage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { return next; }
  return next;
};
```

- [ ] **Step 4: Write the failing shell contract**

Extend `uiUxReleaseContract.test.js`:

```js
test('mobile uses one More sheet with search and recent tools', () => {
  const app = source('../App.jsx');
  assert.doesNotMatch(app, /aria-label="Open navigation menu"/);
  assert.match(app, /placeholder="Search tools"/);
  assert.match(app, /Recent tools/);
  assert.match(app, /filterToolSections/);
  assert.match(app, /recordRecentTool/);
});
```

- [ ] **Step 5: Implement the sheet in the existing shell**

In `App.jsx`, remove the hamburger button but keep the mobile brand top bar.
Make the bottom `More` button pass its event to the existing `openMenu` callback,
so focus restoration still targets the visible trigger. Add the following state
and filtering:

```jsx
const [toolQuery, setToolQuery] = useState('');
const [recentTools, setRecentTools] = useState(() => readRecentTools(window.localStorage));
const visibleToolSections = filterToolSections(MORE_NAV_SECTIONS, toolQuery);
const visitTool = (item) => {
  setRecentTools(recordRecentTool(window.localStorage, { to: item.to, label: item.label }));
  closeMenu(false);
};
```

Render this before the specialist groups inside the mobile sheet:

```jsx
<label className="tool-search">
  <span className="sr-only">Search tools</span>
  <input value={toolQuery} onChange={(event) => setToolQuery(event.target.value)} placeholder="Search tools" />
</label>
{!toolQuery && recentTools.length > 0 && (
  <div className="nav-section mobile-recent-tools">
    <div className="nav-section-title">Recent tools</div>
    {recentTools.map((item) => <Link key={item.to} className="nav-link" to={item.to} onClick={() => visitTool(item)}>{item.label}</Link>)}
  </div>
)}
{visibleToolSections.map((section) => (
  <div className="nav-section" key={section.title}>
    <div className="nav-section-title">{section.title}</div>
    {section.items.map((item) => <NavItem key={item.to} {...item} onNavigate={() => visitTool(item)} />)}
  </div>
))}
{visibleToolSections.length === 0 && <p className="tool-search-empty">No matching tools.</p>}
```

Use `Account & preferences` instead of repeating the full signup message in the
signed-out Settings control. Hide the daily-workflow group inside the sheet
because it already exists in the bottom tab bar.

In `index.css`, add:

```css
.nav-more summary::after { content: '⌄'; margin-left: auto; transition: transform 0.18s ease; }
.nav-more[open] summary::after { transform: rotate(180deg); }
.tool-search input { width: 100%; min-height: 44px; margin: 0 0 12px; }
.tool-search-empty { padding: 16px; color: var(--text-secondary); }
@media (max-width: 850px) {
  .sidebar {
    left: 0;
    right: 0;
    top: 18vh;
    bottom: 0;
    width: 100%;
    border-radius: 18px 18px 0 0;
    transform: translateY(105%);
  }
  .sidebar.open { transform: translateY(0); }
  .sidebar .primary-nav-section { display: none; }
  .sidebar nav { overflow-y: auto; }
  .sidebar-footer { position: static; }
}
```

- [ ] **Step 6: Run helper, shell, and account UX tests**

Run: `cd web; node --test src/lib/toolNavigation.test.js src/lib/uiUxReleaseContract.test.js src/lib/signedInAccountUxContract.test.js src/lib/singleProductContract.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
rtk git add -- web/src/lib/toolNavigation.js web/src/lib/toolNavigation.test.js web/src/lib/uiUxReleaseContract.test.js web/src/App.jsx web/src/index.css
rtk git commit -m "feat: simplify mobile tool navigation"
```

### Task 4: Turn the Empty Watchlist Into a Starter State

**Files:**
- Modify: `web/src/pages/Watchlist.jsx`
- Modify: `web/src/pages/Watchlist.css`
- Modify: `web/src/lib/uiUxReleaseContract.test.js`

**Interfaces:**
- Consumes: existing `add`, `requireWatchlistAuth`, selected market, and React Router links.
- Produces: neutral `WATCHLIST_STARTERS` and explicit starter actions.

- [ ] **Step 1: Add the failing watchlist contract**

```js
test('empty watchlist offers neutral starter actions', () => {
  const page = source('../pages/Watchlist.jsx');
  assert.match(page, /WATCHLIST_STARTERS/);
  assert.match(page, /Example symbols — not recommendations/);
  assert.match(page, /Choose from Today’s movers/);
  assert.match(page, /onStarterSelect/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web; node --test src/lib/uiUxReleaseContract.test.js`

Expected: FAIL because the starter state does not exist.

- [ ] **Step 3: Implement the starter state**

Add:

```js
const WATCHLIST_STARTERS = {
  IN: ['RELIANCE', 'TCS', 'HDFCBANK'],
  US: ['AAPL', 'MSFT', 'NVDA'],
};
```

Lift `market` state from `AddBox` into `Watchlist`, pass `market` and
`setMarket` into `AddBox`, and add `onStarterSelect(symbol)` that calls `add`
for authenticated users and `requireWatchlistAuth` otherwise. Replace the
generic empty state with a starter panel containing the neutral disclaimer,
buttons for the selected market, and a link to `/dashboard#market-movers`.
Keep the existing optimistic rollback and auth intent unchanged.

Add these styles in `Watchlist.css`:

```css
.wl-starter { padding: 24px; border: 1px solid var(--border-color); border-radius: 14px; text-align: center; }
.wl-starter__note { color: var(--text-secondary); font-size: 14px; }
.wl-starter__chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 16px 0; }
.wl-starter__chips button { width: auto; min-width: 44px; min-height: 44px; padding: 8px 14px; }
.wl-starter__movers { color: var(--primary-accent); }
```

- [ ] **Step 4: Run watchlist, account, and shell contracts**

Run: `cd web; node --test src/lib/uiUxReleaseContract.test.js src/lib/signedInAccountUxContract.test.js src/lib/singleProductContract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
rtk git add -- web/src/pages/Watchlist.jsx web/src/pages/Watchlist.css web/src/lib/uiUxReleaseContract.test.js
rtk git commit -m "feat: add watchlist starter actions"
```

### Task 5: Fix Semantic Headings, Sort Controls, and Touch Targets

**Files:**
- Modify: `web/src/components/ui/PageHeader.jsx`
- Modify: `web/src/components/ui/SectionTitle.jsx`
- Modify: `web/src/components/ui/DataTable.jsx`
- Modify: `web/src/components/ui/ui.css`
- Modify: `web/src/index.css`
- Modify: `web/src/lib/uiUxReleaseContract.test.js`

**Interfaces:**
- Produces: semantic page `h1`, configurable section heading, keyboard sort buttons, and `aria-sort`.
- Consumes: existing `sortKey`, `sortDir`, and `onSort` props.

- [ ] **Step 1: Add failing semantic-accessibility contracts**

```js
test('shared UI exposes semantic headings and accessible sorting', () => {
  const header = source('../components/ui/PageHeader.jsx');
  const section = source('../components/ui/SectionTitle.jsx');
  const table = source('../components/ui/DataTable.jsx');
  assert.match(header, /<h1 className="ui-ph-title">/);
  assert.match(section, /const Heading = `h\$\{level\}`/);
  assert.match(table, /aria-sort=/);
  assert.match(table, /className="ui-sort-button"/);
  assert.match(table, /<button/);
});

test('mobile critical controls have 44px targets', () => {
  const css = source('../index.css') + source('../components/ui/ui.css') + source('../alerts/alerts.css');
  assert.match(css, /--touch-target:\s*44px/);
  assert.match(css, /min-height:\s*var\(--touch-target\)/);
  assert.match(css, /min-width:\s*var\(--touch-target\)/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web; node --test src/lib/uiUxReleaseContract.test.js`

Expected: FAIL because headings, sort buttons, and the shared touch token are missing.

- [ ] **Step 3: Implement semantic shared components**

Use `<h1 className="ui-ph-title">{title}</h1>` in `PageHeader`.
Update `SectionTitle` to accept `level = 2` and `id`, construct
`const Heading = `h${level}``, and render
`<Heading id={id} className="ui-section-title">`.

For each sortable header in `DataTable`, set:

```jsx
aria-sort={col.sortable ? (sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
```

and render:

```jsx
<button type="button" className="ui-sort-button" onClick={() => onSort(col.key)}>
  {col.label}{sortIndicator(col)}
</button>
```

Non-sortable headers remain plain text.

Add `--touch-target: 44px` to `:root`. In the mobile media block, apply both
minimum dimensions to dismiss, share, settings-close, watchlist-remove, sheet
close, and compact refresh controls. Add visible focus styles for sort buttons.

- [ ] **Step 4: Run shared component and UX contracts**

Run: `cd web; node --test src/lib/uiUxReleaseContract.test.js src/lib/trustUsabilityContract.test.js src/lib/signedInAccountUxContract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
rtk git add -- web/src/components/ui/PageHeader.jsx web/src/components/ui/SectionTitle.jsx web/src/components/ui/DataTable.jsx web/src/components/ui/ui.css web/src/index.css web/src/lib/uiUxReleaseContract.test.js
rtk git commit -m "fix: improve terminal accessibility semantics"
```

### Task 6: Clarify Signals Refresh and Scoring Methodology

**Files:**
- Modify: `web/src/components/DataStatus.jsx`
- Modify: `web/src/pages/MarketSignals.jsx`
- Modify: `web/src/pages/MarketSignals.css`
- Modify: `web/src/lib/trustUsabilityContract.test.js`

**Interfaces:**
- Produces: `DataStatus({ status, refreshing })` and a collapsed `How scoring works` disclosure.
- Consumes: existing SWR `refreshing`, fail-closed `data_status`, and `CollapsibleSection`.

- [ ] **Step 1: Add failing trust contracts**

Append to `trustUsabilityContract.test.js`:

```js
test('Signals labels refresh transitions and collapses methodology', () => {
  const status = source('../components/DataStatus.jsx');
  const signals = source('../pages/MarketSignals.jsx');
  assert.match(status, /refreshing = false/);
  assert.match(status, /Refreshing current snapshot/);
  assert.match(signals, /<DataStatus status=\{data\.data_status\} refreshing=\{refreshing\}/);
  assert.match(signals, /title="How scoring works"/);
  assert.doesNotMatch(signals, /<p className="signals-footnote">/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd web; node --test src/lib/trustUsabilityContract.test.js`

Expected: FAIL because refresh state is not passed and methodology is always expanded.

- [ ] **Step 3: Implement refresh and methodology disclosure**

Change `DataStatus` signature to `({ status, refreshing = false })` and add:

```jsx
{refreshing && <span className="signal-data-status__refreshing" role="status">Refreshing current snapshot…</span>}
```

Pass `refreshing={refreshing}` from `MarketSignals`. Replace the expanded
`signals-footnote` paragraph with:

```jsx
<CollapsibleSection title="How scoring works" className="signals-methodology">
  <p className="signals-footnote">
    Quality Score = {isUS ? 'volume intensity' : 'OI intensity'} + price momentum + liquidity + options-flow agreement + index bias + intraday &amp; regime alignment (0–100, publication threshold 65).
    {!isUS && ' New India setups use a tighter stop with a 2:1 gross target; existing open plans retain their locked original levels. This revised execution policy is not backtest-validated.'}
    {' '}*Qty sized so a stop-out loses {setups.risk_pct}% of {cur}{fmt(setups.capital, 0)} capital, scaled by the volatility regime (×{regime.vol_scale}) — not rounded to lot size. Signals are analytics, not investment advice.
  </p>
</CollapsibleSection>
```

Preserve all existing policy, risk-sizing, validation, and disclaimer copy.
Style the disclosure as a quiet, readable block with 14px body text.

- [ ] **Step 4: Run Signals trust contracts**

Run: `cd web; node --test src/lib/trustUsabilityContract.test.js src/lib/signalView.test.js src/lib/marketSignalsOrderContract.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
rtk git add -- web/src/components/DataStatus.jsx web/src/pages/MarketSignals.jsx web/src/pages/MarketSignals.css web/src/lib/trustUsabilityContract.test.js
rtk git commit -m "feat: clarify Signals freshness and scoring"
```

### Task 7: Run the Complete Local Release Gate

**Files:**
- Verify only; modify production code only through a new failing regression if a defect is found.

**Interfaces:**
- Consumes: completed Tasks 1–6.
- Produces: fresh automated and browser evidence for deployment.

- [ ] **Step 1: Run the complete frontend suite**

Run from `web`:

```powershell
rtk node --test src/**/*.test.js
rtk npm run lint
rtk npm run build
rtk npm audit --audit-level=high
```

Expected: every command exits 0; zero failed tests, lint errors, build errors, or high-severity vulnerabilities.

- [ ] **Step 2: Run the complete backend suite and compilation**

Run from the repository root:

```powershell
rtk python -m pytest api -q --ignore=api/test_live.py
rtk python -m compileall -q api
rtk git diff --check
```

Expected: exit 0 for every command.

- [ ] **Step 3: Run live-provider tests against a local API**

Start `python -m uvicorn api.main:app --host 127.0.0.1 --port 8000`, wait for
`/api/dashboard` to respond, then run `rtk python -m pytest api/test_live.py -q`.

Expected: exit 0. Stop the local server after the browser checks.

- [ ] **Step 4: Browser-check local desktop and mobile**

At 1440x1000 and 390x844 verify `/dashboard`, `/signals`, `/chart?symbol=NVDA`,
`/watchlist`, `/login?mode=signup`, the More sheet, compliance acknowledgement,
tool search, toast placement, setup cards, methodology disclosure, table sorting,
keyboard Escape/focus restoration, no horizontal overflow, and a clean console.

- [ ] **Step 5: Record the verified tree state**

Run: `rtk git status --short` and `rtk git log -7 --oneline`.

Expected: only the known unrelated untracked paths remain; all release changes are committed.

### Task 8: Deploy and Verify Production

**Files:**
- Deployment only; do not edit source unless production verification reveals a reproducible defect with a failing regression.

**Interfaces:**
- Consumes: a fully green local release gate.
- Produces: a Ready Vercel production deployment and live smoke evidence.

- [ ] **Step 1: Deploy to the canonical Vercel project**

Run from the repository root:

```powershell
rtk npx vercel --prod --yes
rtk npx vercel inspect alphanova48.in
```

Expected: target `production`, status `Ready`, canonical alias `https://alphanova48.in`.

- [ ] **Step 2: Verify representative live routes**

Check HTTP status and payload shape for `/`, `/dashboard`, `/signals`,
`/chart?symbol=NVDA`, `/watchlist`, `/api/dashboard`, `/api/signals?market=IN`,
`/api/dcf/data/AAPL`, and unauthenticated `/api/admin/metrics` returning 403.

- [ ] **Step 3: Repeat browser smoke checks in production**

At desktop and 390x844 repeat Today, Signals, Analyse, Watchlist, More sheet,
signup, compliance, tool search, toast, focus, overflow, console, and essential
request checks. Confirm the deployed UI exposes the new spec rather than an old
service-worker cache.

- [ ] **Step 4: Report the deployment evidence**

Report commit range, automated test counts, Vercel deployment ID/status,
representative route results, desktop/mobile observations, and any provider or
authentication limitations that were not exercised.
