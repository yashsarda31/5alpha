# Alpha Nova Daily Decision Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Today into a concise daily decision cockpit, connect priority setups to Analyse, automatically load Analyse's first symbol, and stop implying live polling after the market closes.

**Architecture:** Keep the existing React routes and SWR data sources. Add a pure presentation helper for deterministic setup selection and no-trade guidance, then compose existing Dashboard data into a decision-first order. Reuse Chart's guarded fetch path and Market Signals' existing revalidation path rather than adding APIs or state providers.

**Tech Stack:** React 19, React Router, Axios, Vite 8, Node's built-in test runner, CSS design tokens, FastAPI regression suite.

## Global Constraints

- No deployment without a separate explicit request.
- No signal-score, portfolio, price-provider, or model changes.
- No removal of specialist routes.
- No new event-tracking backend in this pass.
- No pricing, subscription, or paywall work.
- Preserve unrelated working-tree changes.
- Keep `Today`, `Signals`, `Analyse`, and `Watchlist` as the four primary routes.
- Do not weaken or remove the existing compliance notice.

## File Map

- Create `web/src/lib/decisionBrief.js`: pure selection and no-trade guidance functions.
- Create `web/src/lib/decisionBrief.test.js`: behavioral tests for those pure functions.
- Create `web/src/lib/decisionCockpitContract.test.js`: source-level product-contract checks spanning Dashboard, Chart, and Signals.
- Modify `web/src/pages/Dashboard.jsx`: decision-first ordering, richer setup cards, no-trade state, and removal of duplicate module launchers and AI status.
- Modify `web/src/pages/Dashboard.css`: market-regime, risk-level, no-trade, and responsive setup-card styles.
- Modify `web/src/pages/Chart.jsx`: load the default or URL-provided symbol through the existing guarded request path.
- Modify `web/src/pages/MarketSignals.jsx`: stop automatic refresh after close and show manual refresh.

---

### Task 1: Deterministic decision-brief helpers

**Files:**
- Create: `web/src/lib/decisionBrief.js`
- Test: `web/src/lib/decisionBrief.test.js`

**Interfaces:**
- Consumes: the existing `/api/signals` response shape `{ setups: { plans }, regime }`.
- Produces: `selectPrioritySetups(signals, limit)` returning an array of unique-symbol plans and `buildNoTradeGuidance(signals)` returning `{ state, title, body }`.

- [ ] **Step 1: Write the failing helper tests**

Create `web/src/lib/decisionBrief.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNoTradeGuidance, selectPrioritySetups } from './decisionBrief.js';

test('priority setups keep the strongest side per symbol and sort by score', () => {
  const signals = {
    setups: {
      plans: [
        { symbol: 'AAA', side: 'LONG', score: 61 },
        { symbol: 'BBB', side: 'SHORT', score: 82 },
        { symbol: 'AAA', side: 'SHORT', score: 74 },
        { symbol: 'CCC', side: 'LONG', score: 69 },
      ],
    },
  };

  assert.deepEqual(
    selectPrioritySetups(signals, 2).map((plan) => [plan.symbol, plan.side, plan.score]),
    [['BBB', 'SHORT', 82], ['AAA', 'SHORT', 74]],
  );
});

test('priority setups ignore malformed plans', () => {
  const signals = { setups: { plans: [null, {}, { symbol: 'AAA' }, { symbol: 'BBB', side: 'LONG', score: 70 }] } };
  assert.deepEqual(selectPrioritySetups(signals), [{ symbol: 'BBB', side: 'LONG', score: 70 }]);
});

test('missing Signals data reports an unavailable feed without inventing a setup', () => {
  assert.deepEqual(buildNoTradeGuidance(null), {
    state: 'unavailable',
    title: 'Setup feed unavailable',
    body: 'Market prices are still available. Open Signals to retry the model feed.',
  });
});

test('risk-off and weak-breadth regimes explain why no trade is useful', () => {
  assert.deepEqual(buildNoTradeGuidance({
    regime: { overall: 'RISK-OFF', breadth: { adv: 180, dec: 420 } },
  }), {
    state: 'no-trade',
    title: 'No high-conviction setup right now',
    body: 'The model is in RISK-OFF with only 30% advancing breadth. Capital preservation is a valid position.',
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing module failure**

Run:

```powershell
rtk node --test web/src/lib/decisionBrief.test.js
```

Expected: FAIL because `decisionBrief.js` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Create `web/src/lib/decisionBrief.js`:

```js
const numericScore = (plan) => {
  const score = Number(plan?.score);
  return Number.isFinite(score) ? score : 0;
};

export const selectPrioritySetups = (signals, limit = 3) => {
  const plans = signals?.setups?.plans;
  if (!Array.isArray(plans)) return [];

  const strongestBySymbol = new Map();
  plans.forEach((plan) => {
    if (!plan?.symbol || !plan?.side) return;
    const current = strongestBySymbol.get(plan.symbol);
    if (!current || numericScore(plan) > numericScore(current)) {
      strongestBySymbol.set(plan.symbol, plan);
    }
  });

  return [...strongestBySymbol.values()]
    .sort((left, right) => numericScore(right) - numericScore(left))
    .slice(0, limit);
};

export const buildNoTradeGuidance = (signals) => {
  if (!signals) {
    return {
      state: 'unavailable',
      title: 'Setup feed unavailable',
      body: 'Market prices are still available. Open Signals to retry the model feed.',
    };
  }

  const regime = signals.regime || {};
  const overall = regime.overall || 'NEUTRAL';
  const advancing = Number(regime.breadth?.adv) || 0;
  const declining = Number(regime.breadth?.dec) || 0;
  const total = advancing + declining;
  const advancingPct = total > 0 ? Math.round((advancing / total) * 100) : null;

  if (overall === 'RISK-OFF') {
    const breadth = advancingPct === null ? '' : ` with only ${advancingPct}% advancing breadth`;
    return {
      state: 'no-trade',
      title: 'No high-conviction setup right now',
      body: `The model is in RISK-OFF${breadth}. Capital preservation is a valid position.`,
    };
  }

  if (advancingPct !== null && advancingPct < 45) {
    return {
      state: 'no-trade',
      title: 'No high-conviction setup right now',
      body: `Only ${advancingPct}% of the tracked market is advancing. Wait for broader confirmation before forcing a trade.`,
    };
  }

  const volatility = regime.vol?.label;
  if (volatility === 'HIGH-VOL' || volatility === 'RICH') {
    return {
      state: 'no-trade',
      title: 'No high-conviction setup right now',
      body: `Volatility is ${volatility}. The model has not found a setup with enough reward for the current risk.`,
    };
  }

  return {
    state: 'no-trade',
    title: 'No high-conviction setup right now',
    body: `The ${overall} regime is visible, but no setup currently clears the model threshold. Waiting is part of the process.`,
  };
};
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```powershell
rtk node --test web/src/lib/decisionBrief.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the helper boundary**

```powershell
rtk git add web/src/lib/decisionBrief.js web/src/lib/decisionBrief.test.js
rtk git commit -m "feat: derive daily decision brief"
```

---

### Task 2: Decision-first Today screen

**Files:**
- Modify: `web/src/pages/Dashboard.jsx:1-451`
- Modify: `web/src/pages/Dashboard.css:92-121,315-412`
- Create: `web/src/lib/decisionCockpitContract.test.js`

**Interfaces:**
- Consumes: `selectPrioritySetups(signals, 3)` and `buildNoTradeGuidance(signals)` from Task 1.
- Produces: a Today screen ordered as Market Brief, My Watchlist, Priority Setups, Market Details, and Today's Call.

- [ ] **Step 1: Write the failing Today contract tests**

Create `web/src/lib/decisionCockpitContract.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Today is a decision cockpit rather than a duplicate tool catalogue', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  assert.match(dashboard, /title="Today"/);
  assert.match(dashboard, /Priority Setups/);
  assert.match(dashboard, /Market Details/);
  assert.doesNotMatch(dashboard, /Analytics Modules|NAV_MODULES/);
  assert.doesNotMatch(dashboard, /AI OFFLINE|AI ACTIVE|gemini_api_key/);
});

test('priority setups connect directly to ticker-specific Analyse routes', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  assert.match(dashboard, /selectPrioritySetups/);
  assert.match(dashboard, /encodeURIComponent\(plan\.symbol\)/);
  assert.match(dashboard, /Entry/);
  assert.match(dashboard, /Stop/);
  assert.match(dashboard, /Target/);
});

test('Today explicitly renders no-trade and unavailable setup guidance', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  assert.match(dashboard, /buildNoTradeGuidance/);
  assert.match(dashboard, /dash-no-trade/);
  assert.match(dashboard, /Open Signals/);
});
```

- [ ] **Step 2: Run the contract tests and verify they fail**

Run:

```powershell
rtk node --test web/src/lib/decisionCockpitContract.test.js
```

Expected: all three tests fail against the current module-grid Dashboard.

- [ ] **Step 3: Replace the setup teaser with a Priority Setups component**

In `web/src/pages/Dashboard.jsx`:

- remove `Badge` from the shared UI import;
- import `buildNoTradeGuidance` and `selectPrioritySetups` from `../lib/decisionBrief`;
- replace `SetupsTeaser` with a `PrioritySetups` component that:
  - calls `selectPrioritySetups(signals, 3)`;
  - renders `buildNoTradeGuidance(signals)` when the list is empty;
  - links each card to ``/chart?symbol=${encodeURIComponent(plan.symbol)}``;
  - renders entry, stop, and target only when each value is present;
  - renders the complete `signals.as_of` label without claiming a live time when absent.

Use this risk-level renderer inside the component:

```jsx
const SetupLevel = ({ label, value, currency }) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return (
    <span className="dash-setup-level">
      <span>{label}</span>
      <strong className="tnum">{currency}{Number(value).toLocaleString('en-IN')}</strong>
    </span>
  );
};
```

Use this empty state:

```jsx
const guidance = buildNoTradeGuidance(signals);
return (
  <div className={`dash-no-trade ${guidance.state}`}>
    <div>
      <strong>{guidance.title}</strong>
      <p>{guidance.body}</p>
    </div>
    <Link to="/signals" className="dash-manage-link">Open Signals →</Link>
  </div>
);
```

- [ ] **Step 4: Reorder Today and remove duplicate navigation**

In `web/src/pages/Dashboard.jsx`:

- change the header to `title="Today"` and `subtitle="Your market, setups & next actions"`;
- keep only `StatusPill` in the header action;
- render `PulseStrip`, `MyWatchlist`, and `PrioritySetups` before market details;
- add `<SectionTitle>Market Details</SectionTitle>` before the movers/macro grid;
- render `TodaysCall` after market details;
- delete `NAV_MODULES`, `liveSetupCount`, and the Analytics Modules JSX.

- [ ] **Step 5: Add focused setup and no-trade styles**

In `web/src/pages/Dashboard.css`, replace the old teaser selectors with:

```css
.dash-setups { margin: 22px 0 26px; }
.dash-setup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: 12px;
}
.dash-setup-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  color: inherit;
  text-decoration: none;
  background: var(--surface-grad), var(--surface-tile);
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-tile);
  box-shadow: var(--inset-hl);
  transition: transform 0.18s ease, border-color 0.18s ease;
}
.dash-setup-card:hover { transform: translateY(-2px); border-color: var(--primary-accent-border); }
.dash-setup-head { display: flex; align-items: center; gap: 10px; }
.dash-setup-symbol { color: var(--text-primary); font-size: 16px; font-weight: 750; }
.dash-setup-score { margin-left: auto; color: var(--primary-gold); font-size: 12px; font-weight: 700; }
.dash-setup-levels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.dash-setup-level { display: grid; gap: 3px; min-width: 0; }
.dash-setup-level span { color: var(--text-secondary); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.dash-setup-level strong { color: var(--text-primary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.dash-no-trade {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
  background: var(--surface-tile);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--r-tile);
}
.dash-no-trade strong { color: var(--primary-gold); }
.dash-no-trade p { margin: 5px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.dash-no-trade.unavailable strong { color: var(--text-primary); }
.dash-setup-asof { margin-top: 8px; color: var(--text-secondary); font-size: 11px; }
@media (max-width: 560px) {
  .dash-no-trade { align-items: flex-start; flex-direction: column; }
  .dash-setup-levels { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Run focused tests and lint**

Run:

```powershell
rtk node --test web/src/lib/decisionBrief.test.js web/src/lib/decisionCockpitContract.test.js web/src/lib/lightweightAppContract.test.js web/src/lib/singleProductContract.test.js
rtk npx eslint src/pages/Dashboard.jsx src/lib/decisionBrief.js src/lib/decisionBrief.test.js src/lib/decisionCockpitContract.test.js
```

Run both commands from `web`. Expected: all tests and lint pass.

- [ ] **Step 7: Commit the Today experience**

```powershell
rtk git add web/src/pages/Dashboard.jsx web/src/pages/Dashboard.css web/src/lib/decisionCockpitContract.test.js
rtk git commit -m "feat: focus Today on trading decisions"
```

---

### Task 3: Useful Analyse first load

**Files:**
- Modify: `web/src/pages/Chart.jsx:18-68`
- Modify: `web/src/lib/decisionCockpitContract.test.js`

**Interfaces:**
- Consumes: `fetchChart(sym)` and the existing `createLatestRequestGuard()`.
- Produces: automatic loading for the URL symbol or `NVDA` when Analyse opens.

- [ ] **Step 1: Add the failing Analyse contract test**

Append to `web/src/lib/decisionCockpitContract.test.js`:

```js
test('Analyse loads the URL symbol or its visible default immediately', () => {
  const chart = source('../pages/Chart.jsx');
  assert.match(chart, /const sym = searchParams\.get\('symbol'\) \|\| 'NVDA'/);
  assert.match(chart, /fetchChart\(sym\)/);
  assert.doesNotMatch(chart, /No auto-fetch by default/);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run from `web`:

```powershell
rtk node --test src/lib/decisionCockpitContract.test.js
```

Expected: the new test fails because the current effect fetches only when a query symbol exists.

- [ ] **Step 3: Use the guarded fetch path for the initial symbol**

Replace the current Chart effect with:

```jsx
useEffect(() => {
  const sym = searchParams.get('symbol') || 'NVDA';
  setTicker(sym);
  fetchChart(sym);
  // fetchChart intentionally stays behind the latest-request guard; adding it
  // to dependencies would recreate the function and refetch on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [searchParams]);
```

- [ ] **Step 4: Run focused Chart checks**

Run from `web`:

```powershell
rtk node --test src/lib/decisionCockpitContract.test.js src/lib/latestRequest.test.js
rtk npx eslint src/pages/Chart.jsx src/lib/decisionCockpitContract.test.js
```

Expected: all tests and lint pass.

- [ ] **Step 5: Commit the Analyse improvement**

```powershell
rtk git add web/src/pages/Chart.jsx web/src/lib/decisionCockpitContract.test.js
rtk git commit -m "feat: load Analyse default symbol"
```

---

### Task 4: Market-aware Signals refresh

**Files:**
- Modify: `web/src/pages/MarketSignals.jsx:1-137`
- Modify: `web/src/lib/decisionCockpitContract.test.js`

**Interfaces:**
- Consumes: `data.market_open`, `revalidate`, and the existing `autoRefresh` state.
- Produces: automatic 60-second polling only during open-market data and an after-hours `Refresh snapshot` action.

- [ ] **Step 1: Add the failing Signals contract test**

Append to `web/src/lib/decisionCockpitContract.test.js`:

```js
test('Signals stops automatic polling after close and offers manual refresh', () => {
  const signals = source('../pages/MarketSignals.jsx');
  assert.match(signals, /data\?\.market_open === false/);
  assert.match(signals, /setAutoRefresh\(false\)/);
  assert.match(signals, /data\.market_open \?/);
  assert.match(signals, /Refresh snapshot/);
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run from `web`:

```powershell
rtk node --test src/lib/decisionCockpitContract.test.js
```

Expected: the Signals contract fails because the toggle currently remains active after close.

- [ ] **Step 3: Stop polling after closed-market data arrives**

In `web/src/pages/MarketSignals.jsx`:

- import `useEffect` with `useState`;
- after the SWR hook, add:

```jsx
useEffect(() => {
  if (data?.market_open === false && autoRefresh) setAutoRefresh(false);
}, [data?.market_open, autoRefresh]);
```

The existing `autoRefresh ? 60000 : 0` interval then clears on the next render.

- [ ] **Step 4: Render the appropriate freshness control**

Replace the unconditional toggle with:

```jsx
{data.market_open ? (
  <div className="refresh-toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
    <span>Auto 60s</span>
    <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
      <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: autoRefresh ? 'var(--primary-accent)' : 'rgba(255,255,255,0.1)', borderRadius: '22px', transition: '0.3s' }} />
    </label>
  </div>
) : (
  <button type="button" className="secondary" onClick={revalidate} disabled={refreshing} style={{ width: 'auto', padding: '8px 14px' }}>
    {refreshing ? 'Refreshing…' : 'Refresh snapshot'}
  </button>
)}
```

- [ ] **Step 5: Run focused Signals checks**

Run from `web`:

```powershell
rtk node --test src/lib/decisionCockpitContract.test.js src/lib/lightweightAppContract.test.js src/lib/signalsPortfolioContract.test.js
rtk npx eslint src/pages/MarketSignals.jsx src/lib/decisionCockpitContract.test.js
```

Expected: all tests and lint pass.

- [ ] **Step 6: Commit the market-aware refresh behavior**

```powershell
rtk git add web/src/pages/MarketSignals.jsx web/src/lib/decisionCockpitContract.test.js
rtk git commit -m "feat: respect market state in Signals refresh"
```

---

### Task 5: Full regression and browser verification

**Files:**
- Verify: all files changed in Tasks 1-4.
- Preserve: existing unrelated dirty files and generated `web/dist` state.

**Interfaces:**
- Consumes: the completed Daily Decision Cockpit frontend.
- Produces: evidence that the release is locally ready, without deployment.

- [ ] **Step 1: Run the complete frontend test suite**

Run from the repository root:

```powershell
rtk node --test web/src/lib/*.test.js
```

Expected: all frontend tests pass.

- [ ] **Step 2: Run frontend lint, production build, and dependency audit**

Run from `web`:

```powershell
rtk npm run lint
rtk npm run build
rtk npm audit --omit=dev
```

Expected: lint and build exit 0; audit reports no unresolved production vulnerability.

- [ ] **Step 3: Run backend regressions**

Run from the repository root:

```powershell
rtk python -m pytest api -q --ignore=api/test_live.py
```

Expected: all non-live backend tests pass.

- [ ] **Step 4: Run whitespace and scope checks**

Run:

```powershell
rtk git diff --check
rtk git status --short
```

Expected: no whitespace errors; status contains only intended cockpit changes plus pre-existing unrelated work.

- [ ] **Step 5: Restore generated distribution files if the build changed them**

Inspect `rtk git status --short web/dist`. If tracked `web/dist` files changed, restore only those generated files with:

```powershell
rtk git restore --worktree web/dist
```

Expected: no generated distribution artifacts remain in the cockpit diff.

- [ ] **Step 6: Start local frontend and backend services**

Use the existing project launch commands in separate hidden processes:

```powershell
rtk python run_server.py
rtk npm run dev -- --host 127.0.0.1
```

Run the frontend command from `web`. Confirm the backend health endpoint and the Vite URL return HTTP success before browser checks.

- [ ] **Step 7: Verify desktop user flows**

At 1440x1000, verify:

- Today order is Market Brief, My Watchlist, Priority Setups, Market Details, Today's Call;
- no Analytics Modules section remains;
- setup cards show only supplied levels and open the matching symbol in Analyse;
- Analyse automatically loads NVDA when opened directly;
- the compliance notice and primary navigation remain usable;
- no console errors appear.

- [ ] **Step 8: Verify 390x844 mobile flows**

Verify:

- no horizontal overflow;
- setup cards use one column and risk levels remain readable;
- no duplicated nine-card tool stack remains;
- fixed bottom tabs do not obscure the final content;
- Today, Signals, Analyse, Watchlist, and More navigation still work.

- [ ] **Step 9: Verify closed-market Signals behavior**

When `/api/signals` reports `market_open: false`, confirm:

- last-session status and timestamp remain visible;
- `Refresh snapshot` is visible;
- `Auto 60s` is absent;
- manual refresh completes without a new error.

- [ ] **Step 10: Commit any verification-only test adjustments**

If browser verification required a scoped test or style correction, add only those files and commit:

```powershell
rtk git add web/src/pages/Dashboard.jsx web/src/pages/Dashboard.css web/src/pages/Chart.jsx web/src/pages/MarketSignals.jsx web/src/lib/decisionBrief.js web/src/lib/decisionBrief.test.js web/src/lib/decisionCockpitContract.test.js
rtk git commit -m "test: verify daily decision cockpit"
```

If no correction was required, do not create an empty commit.
