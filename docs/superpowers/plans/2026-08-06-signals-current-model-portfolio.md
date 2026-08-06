# Signals Current Model Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the active IN or US model portfolio inside Market Signals, with full details for signed-in users and conversion-focused level gating for guests.

**Architecture:** Add one isolated `SignalsPortfolio` component that owns the existing portfolio API request and its loading, error, empty, authenticated, and guest states. `MarketSignals` passes only its resolved market, keeping signal generation and portfolio construction unchanged.

**Tech Stack:** React 19, React Router, Axios, the existing `useSWR` cache, Alpha Nova UI components, Node's built-in test runner, ESLint, and Vite.

## Global Constraints

- Place the section below Actionable Setups and before the existing Signals signup card.
- Follow the active Signals market exactly: `IN` or `US`.
- Reuse `/api/signals/portfolio?market=IN|US`; do not change the backend or database.
- Signed-in columns: Symbol, Side, Entry, Current, Unrealized P&L, Stop, Target, Held, Weight.
- Guest columns: Symbol, Side, Unrealized P&L, Held, and one `Unlock active levels` action.
- Preserve the complete Signals route as the post-signup return destination.
- Keep copy brief; add only `Current model portfolio`, the timestamp, state messages, and `View full track record`.
- Do not change signal generation, model portfolio rules, closed-trade history, or LONG/SHORT support.

---

## File Structure

- Create `web/src/components/SignalsPortfolio.jsx`: fetch and render the current portfolio for one market.
- Modify `web/src/pages/MarketSignals.jsx`: import the component and place it in the approved page position.
- Modify `web/src/lib/newUserQualityContract.test.js`: add source contracts for the component behavior and Signals integration.

### Task 1: Build the authenticated and guest portfolio table

**Files:**
- Create: `web/src/components/SignalsPortfolio.jsx`
- Modify: `web/src/lib/newUserQualityContract.test.js`
- Test: `web/src/lib/newUserQualityContract.test.js`

**Interfaces:**
- Consumes: `market: 'IN' | 'US'`, `useAuth().currentUser`, `useSWR(key, fetcher, interval)`, and the existing `/api/signals/portfolio` response `{ open, as_of }`.
- Produces: default React component `SignalsPortfolio({ market })`.

- [ ] **Step 1: Write the failing component contract**

Append this test to `web/src/lib/newUserQualityContract.test.js`:

```js
test('Signals portfolio shows public proof and gates active levels for guests', () => {
  const componentUrl = new URL('../components/SignalsPortfolio.jsx', import.meta.url);
  assert.equal(existsSync(componentUrl), true, 'SignalsPortfolio component must exist');
  const portfolio = readFileSync(componentUrl, 'utf8');

  assert.match(portfolio, /`signal_portfolio_\$\{market\}`/);
  assert.match(portfolio, /`\/api\/signals\/portfolio\?market=\$\{market\}`/);
  assert.match(portfolio, /currentUser \? fullColumns : guestColumns/);
  for (const label of ['Entry', 'Current', 'Unreal. P&L', 'Stop', 'Target', 'Held', 'Weight']) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(portfolio, new RegExp(`label: '${escaped}'`));
  }
  assert.match(portfolio, /Unlock active levels/);
  assert.match(portfolio, /state=\{\{ from: location \}\}/);
  assert.match(portfolio, /View full track record/);
  assert.match(portfolio, /Portfolio unavailable/);
  assert.match(portfolio, /The model book is all cash\./);
  assert.doesNotMatch(portfolio, /How it works:|Reported returns exclude|first-come-first-served/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
rtk node --test src/lib/newUserQualityContract.test.js
```

Working directory: `web`

Expected: FAIL at `SignalsPortfolio component must exist` because the component has not been created.

- [ ] **Step 3: Create the minimal portfolio component**

Create `web/src/components/SignalsPortfolio.jsx` with:

```jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Badge, DataTable, EmptyState } from './ui';
import { useAuth } from '../AuthContext';
import { useSWR } from '../lib/swrCache';
import { chartSymbolForMarket } from '../lib/newUserFlow';

const currencyOf = (market) => (market === 'US' ? '$' : '₹');

const money = (value, market) => {
  if (value === null || value === undefined) return '—';
  return `${currencyOf(market)}${Number(value).toLocaleString(
    market === 'US' ? 'en-US' : 'en-IN',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`;
};

const pct = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
};

const toneOf = (value) => (
  value === null || value === undefined ? 'neutral' : value > 0 ? 'gain' : value < 0 ? 'loss' : 'neutral'
);

const SignalsPortfolio = ({ market }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const { data, error, revalidate } = useSWR(
    `signal_portfolio_${market}`,
    () => axios.get(`/api/signals/portfolio?market=${market}`).then((response) => response.data),
    60000,
  );

  const symbolColumn = {
    key: 'symbol',
    label: 'Symbol',
    render: (row) => (
      <Link
        to={`/chart?symbol=${encodeURIComponent(chartSymbolForMarket(row.symbol, row.market))}`}
        style={{ fontWeight: 700, color: 'var(--text-primary)' }}
      >
        {row.symbol}
      </Link>
    ),
  };
  const sideColumn = {
    key: 'side',
    label: 'Side',
    align: 'center',
    render: (row) => <Badge tone={row.side === 'LONG' ? 'gain' : 'loss'}>{row.side}</Badge>,
  };
  const pnlColumn = {
    key: 'unreal_pct',
    label: 'Unreal. P&L',
    align: 'right',
    render: (row) => <span className={`tone-${toneOf(row.unreal_pct)}`}>{pct(row.unreal_pct)}</span>,
  };
  const heldColumn = {
    key: 'days_held',
    label: 'Held',
    align: 'right',
    render: (row) => `${row.days_held}d`,
  };
  const fullColumns = [
    symbolColumn,
    sideColumn,
    { key: 'entry', label: 'Entry', align: 'right', render: (row) => money(row.entry, row.market) },
    { key: 'current', label: 'Current', align: 'right', render: (row) => money(row.current, row.market) },
    pnlColumn,
    { key: 'stop', label: 'Stop', align: 'right', render: (row) => money(row.stop, row.market) },
    { key: 'target', label: 'Target', align: 'right', render: (row) => money(row.target, row.market) },
    heldColumn,
    { key: 'weight_pct', label: 'Weight', align: 'right', render: (row) => `${row.weight_pct}%` },
  ];
  const guestColumns = [
    symbolColumn,
    sideColumn,
    pnlColumn,
    heldColumn,
    {
      key: 'locked',
      label: 'Trade plan',
      align: 'right',
      render: () => (
        <Link to="/login?mode=signup" state={{ from: location }} style={{ fontWeight: 700 }}>
          Unlock active levels
        </Link>
      ),
    },
  ];
  const columns = currentUser ? fullColumns : guestColumns;

  return (
    <section className="signals-portfolio" aria-labelledby="signals-portfolio-title">
      <div className="signals-section-title" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span id="signals-portfolio-title">
          Current model portfolio
          {data?.as_of && <span style={{ color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}> · {data.as_of}</span>}
        </span>
        <Link to="/track-record" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>
          View full track record
        </Link>
      </div>

      {error && !data ? (
        <EmptyState title="Portfolio unavailable">
          <button type="button" onClick={revalidate} className="secondary" style={{ width: 'auto' }}>Retry</button>
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.open || []}
          rowKey={(row) => `${row.market}-${row.symbol}`}
          loading={!data}
          empty={<EmptyState title="No open positions">The model book is all cash.</EmptyState>}
        />
      )}
    </section>
  );
};

export default SignalsPortfolio;
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
rtk node --test src/lib/newUserQualityContract.test.js
```

Expected: all tests in `newUserQualityContract.test.js` PASS.

- [ ] **Step 5: Commit the component slice**

```powershell
rtk git add -- web/src/components/SignalsPortfolio.jsx web/src/lib/newUserQualityContract.test.js
rtk git commit -m "feat: add Signals portfolio table"
```

### Task 2: Place the portfolio inside Market Signals

**Files:**
- Modify: `web/src/pages/MarketSignals.jsx`
- Modify: `web/src/lib/newUserQualityContract.test.js`
- Test: `web/src/lib/newUserQualityContract.test.js`

**Interfaces:**
- Consumes: `SignalsPortfolio({ market })` from Task 1 and `isUS` from the live Signals response.
- Produces: a rendered current portfolio between `#setups-analysis` and `SignalsConversionCard`.

- [ ] **Step 1: Write the failing integration contract**

Append this test to `web/src/lib/newUserQualityContract.test.js`:

```js
test('Market Signals places the matching portfolio before its signup card', () => {
  const signals = source('../pages/MarketSignals.jsx');

  assert.match(signals, /import SignalsPortfolio from '..\/components\/SignalsPortfolio';/);
  assert.match(signals, /<SignalsPortfolio market=\{isUS \? 'US' : 'IN'\} \/>/);

  const setupsIndex = signals.indexOf('id="setups-analysis"');
  const portfolioIndex = signals.indexOf('<SignalsPortfolio');
  const signupIndex = signals.indexOf('<SignalsConversionCard');
  assert.ok(setupsIndex >= 0 && portfolioIndex > setupsIndex);
  assert.ok(signupIndex > portfolioIndex);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
rtk node --test src/lib/newUserQualityContract.test.js
```

Expected: FAIL because `MarketSignals.jsx` does not import or render `SignalsPortfolio`.

- [ ] **Step 3: Add the import and approved placement**

Add this import beside the other component imports in `web/src/pages/MarketSignals.jsx`:

```jsx
import SignalsPortfolio from '../components/SignalsPortfolio';
```

Insert this between the closing tag for `#setups-analysis` and `<SignalsConversionCard ...>`:

```jsx
      <SignalsPortfolio market={isUS ? 'US' : 'IN'} />
```

- [ ] **Step 4: Run focused and complete verification**

Run the focused contract first:

```powershell
rtk node --test src/lib/newUserQualityContract.test.js
```

Expected: PASS.

Run the complete frontend Node suite:

```powershell
rtk node --test scripts/generate-seo-pages.test.mjs scripts/build-superstar-ad.test.mjs scripts/adsense-auto-ads.test.mjs src/lib/dcfMath.test.js src/lib/dashboardWatchlistMerge.test.js src/lib/dashboardPulse.test.js src/lib/chartAdapters.test.js src/lib/authSession.test.js src/lib/accessGate.test.js src/lib/uiMode.test.js src/lib/swrCache.test.js src/lib/superstarPortfolios.test.js src/lib/stockProView.test.js src/lib/signalPolling.test.js src/lib/newUserQualityContract.test.js src/lib/newUserFlow.test.js src/lib/marketSignalsView.test.js src/lib/fundamentalsView.test.js
rtk npm run lint
rtk npm run build
```

Working directory: `web`

Expected: all Node tests PASS, ESLint exits 0, and Vite builds successfully.

Run the repository diff check:

```powershell
rtk git diff --check
```

Working directory: repository root.

Expected: exit 0 with no output.

- [ ] **Step 5: Commit the integration slice**

```powershell
rtk git add -- web/src/pages/MarketSignals.jsx web/src/lib/newUserQualityContract.test.js
rtk git commit -m "feat: show current portfolio in Signals"
```

- [ ] **Step 6: Stop before deployment**

Report the local verification evidence and wait for an explicit `deploy` request before running Vercel production commands.
