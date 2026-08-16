# Alpha Nova Single-Product Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Alpha Nova's remaining guest-specific experience with the full application and use login only to persist watchlists or activate browser notifications.

**Architecture:** Keep one React application shell and make all research content authentication-neutral. Route high-intent watchlist and notification actions through typed router-state intents; automatically complete watchlist saves after authentication and present a post-login user-gesture prompt for notification permission. Make Today's Call public through an optional-user read API and store signed-out choices locally without creating leaderboard records.

**Tech Stack:** React 19, React Router 7, Axios, Vite 8, Node's built-in test runner, FastAPI, SQLite, pytest.

## Global Constraints

- Preserve every current product page and navigation destination.
- Signed-out and signed-in visitors see the same market data, research, signals, levels, dashboards, tables, and tools.
- Login is requested only for server-backed watchlist persistence or browser push notifications.
- Preserve Google and email/password authentication and exact return paths.
- Do not send symbols, emails, or personal data in analytics properties.
- Preserve unrelated dirty-worktree changes and stage only task-owned files.
- Do not manually edit generated `web/dist` assets.
- Do not deploy without a separate explicit deployment request.

---

## File Map

- Create `web/src/lib/authIntent.js`: pure constructors and route-continuation helpers for watchlist and notification intents.
- Create `web/src/lib/authIntent.test.js`: intent validation, normalization, and full-path contracts.
- Create `web/src/components/AuthIntentHandler.jsx`: completes a pending watchlist save and renders the post-login notification activation prompt.
- Create `web/src/lib/localPrediction.js`: safe, date-scoped signed-out prediction persistence.
- Create `web/src/lib/localPrediction.test.js`: local-storage success and failure contracts.
- Create `web/src/lib/singleProductContract.test.js`: source-level regressions proving guest variants cannot return.
- Modify `web/src/App.jsx`: remove the guest banner, mount the intent handler, and use benefit-led account copy.
- Modify `web/src/pages/Login.jsx`: preserve pathname, query, hash, and pending intent after authentication; remove research-unlock claims.
- Modify `web/src/components/WatchlistStar.jsx`: create a watchlist intent for signed-out star clicks.
- Modify `web/src/pages/Watchlist.jsx`: render the standard page for everyone and convert signed-out manual adds into the same intent.
- Modify `web/src/components/SignalsPortfolio.jsx`: always render the full portfolio columns.
- Modify `web/src/components/SettingsSheet.jsx`: use a notification intent for signed-out alert activation and remove guest-labelled copy.
- Modify `web/src/PredictionContext.jsx`: fetch the public daily question for everyone and keep signed-out submissions device-local.
- Modify `web/src/pages/Dashboard.jsx`: render Today's Call for everyone.
- Modify `web/src/pages/Leaderboard.jsx`: remove the guest banner and guest-specific empty-state copy.
- Modify `api/main.py`: make `GET /api/predict/today` optional-user while preserving authenticated choices.
- Modify `api/test_predictions.py`: cover anonymous daily-question reads and prove anonymous writes remain rejected.
- Modify `web/src/index.css`: remove obsolete guest-banner styles and add the compact post-login notification prompt.
- Delete `web/src/pages/GuestGate.jsx`, `web/src/pages/GuestGate.css`, `web/src/lib/accessGate.js`, and `web/src/lib/accessGate.test.js`: retire only guest-only variants, not product routes.

---

### Task 1: Typed authentication intents and exact return paths

**Files:**
- Create: `web/src/lib/authIntent.js`
- Create: `web/src/lib/authIntent.test.js`

**Interfaces:**
- Produces: `fullLocationPath(location): string`
- Produces: `watchlistIntent(symbol, market): { kind, symbol, market } | null`
- Produces: `notificationIntent(): { kind: 'enable-notifications' }`
- Produces: `authState(from, intent): { from, intent }`
- Produces: `continuationFromAuth(state): { to, state }`

- [ ] **Step 1: Write the failing pure-function tests**

```js
// web/src/lib/authIntent.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authState,
  continuationFromAuth,
  fullLocationPath,
  notificationIntent,
  watchlistIntent,
} from './authIntent.js';

test('fullLocationPath preserves pathname, search and hash', () => {
  assert.equal(fullLocationPath({ pathname: '/chart', search: '?symbol=SBIN.NS', hash: '#levels' }), '/chart?symbol=SBIN.NS#levels');
});

test('watchlist intent normalizes NSE suffix and infers the market', () => {
  assert.deepEqual(watchlistIntent('sbin.ns', 'US'), { kind: 'watchlist-add', symbol: 'SBIN', market: 'IN' });
  assert.deepEqual(watchlistIntent('AAPL', 'US'), { kind: 'watchlist-add', symbol: 'AAPL', market: 'US' });
  assert.equal(watchlistIntent('  ', 'IN'), null);
});

test('auth continuation keeps intent and the complete return path', () => {
  const from = { pathname: '/signals', search: '?market=US', hash: '#portfolio' };
  const state = authState(from, notificationIntent());
  assert.deepEqual(continuationFromAuth(state), {
    to: '/signals?market=US#portfolio',
    state: { authIntent: { kind: 'enable-notifications' } },
  });
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run from `web/`: `rtk node --test src/lib/authIntent.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `authIntent.js`.

- [ ] **Step 3: Implement the intent helpers**

```js
// web/src/lib/authIntent.js
export const fullLocationPath = (location = {}) => (
  `${location.pathname || '/dashboard'}${location.search || ''}${location.hash || ''}`
);

export const watchlistIntent = (rawSymbol, rawMarket = 'IN') => {
  let symbol = String(rawSymbol || '').trim().toUpperCase();
  if (!symbol) return null;
  const nseSuffix = symbol.endsWith('.NS');
  if (nseSuffix) symbol = symbol.slice(0, -3);
  return {
    kind: 'watchlist-add',
    symbol,
    market: nseSuffix || String(rawMarket).toUpperCase() !== 'US' ? 'IN' : 'US',
  };
};

export const notificationIntent = () => ({ kind: 'enable-notifications' });

export const authState = (from, intent) => ({
  from: {
    pathname: from?.pathname || '/dashboard',
    search: from?.search || '',
    hash: from?.hash || '',
  },
  intent: intent || null,
});

export const continuationFromAuth = (state) => ({
  to: fullLocationPath(state?.from),
  state: state?.intent ? { authIntent: state.intent } : null,
});
```

- [ ] **Step 4: Run the focused test**

Run from `web/`: `rtk node --test src/lib/authIntent.test.js`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the helper boundary**

```powershell
rtk git add -- web/src/lib/authIntent.js web/src/lib/authIntent.test.js
rtk git commit -m "feat: add contextual auth intents"
```

---

### Task 2: One full application shell and complete Signals content

**Files:**
- Modify: `web/src/App.jsx:138-160, 275-296, 337-344`
- Modify: `web/src/components/SignalsPortfolio.jsx:1-100`
- Modify: `web/src/index.css`
- Create: `web/src/lib/singleProductContract.test.js`

**Interfaces:**
- Consumes: normal `AppLayout` routing already present in `App.jsx`
- Produces: one signed-out application shell with no standing guest UI
- Produces: `SignalsPortfolio` always using `fullColumns`

- [ ] **Step 1: Add a failing single-product source contract**

```js
// web/src/lib/singleProductContract.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('the app shell contains no guest banner or guest route', () => {
  const app = source('../App.jsx');
  assert.doesNotMatch(app, /GuestBanner|GuestGate|Browsing as guest/);
  assert.match(app, /Save watchlist & enable alerts/);
});

test('Signals always shows the full model portfolio', () => {
  const portfolio = source('../components/SignalsPortfolio.jsx');
  assert.match(portfolio, /columns=\{fullColumns\}/);
  assert.doesNotMatch(portfolio, /guestColumns|Unlock active levels|useAuth/);
});
```

- [ ] **Step 2: Run the contract and verify both cases fail**

Run from `web/`: `rtk node --test src/lib/singleProductContract.test.js`

Expected: 2 failures identifying `GuestBanner` and `guestColumns`.

- [ ] **Step 3: Remove the standing guest shell treatment**

Delete the `GuestBanner` component and `<GuestBanner />` mount from `App.jsx`.
Replace the sidebar footer's signed-out block with this benefit-led action:

```jsx
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
```

Add `const location = useLocation();` inside `AppLayout`, and replace the
settings subtitle expression with:

```jsx
<span className="settings-btn-email">
  {currentUser ? currentUser.email : 'Save watchlist & enable alerts'}
</span>
```

- [ ] **Step 4: Render complete Signals columns for every visitor**

Remove `useAuth`, `useLocation`, `guestColumns`, and the conditional column
selection from `SignalsPortfolio.jsx`. Change the table prop to:

```jsx
<DataTable
  columns={fullColumns}
  rows={data?.open || []}
  rowKey={(row) => `${row.market}-${row.symbol}`}
  loading={!data}
  empty={<EmptyState title="No open positions">The model book is all cash.</EmptyState>}
/>
```

- [ ] **Step 5: Remove `.guest-banner*` rules from `web/src/index.css`**

Delete the complete style blocks whose selectors start with `.guest-banner`.
Do not change unrelated theme, mobile navigation, DCF, or page styles in the
already-dirty stylesheet.

- [ ] **Step 6: Run the contract and targeted lint**

Run from `web/`: `rtk node --test src/lib/singleProductContract.test.js`

Expected: 2 tests pass.

Run from `web/`: `rtk npx eslint src/App.jsx src/components/SignalsPortfolio.jsx src/lib/singleProductContract.test.js`

Expected: exit 0.

- [ ] **Step 7: Commit only the shell and Signals changes**

```powershell
rtk git add -- web/src/App.jsx web/src/components/SignalsPortfolio.jsx web/src/lib/singleProductContract.test.js
rtk git add -p -- web/src/index.css
rtk git diff --cached --check
rtk git commit -m "feat: show the full app to every visitor"
```

---

### Task 3: Watchlist conversion intent and automatic post-login save

**Files:**
- Create: `web/src/components/AuthIntentHandler.jsx`
- Modify: `web/src/App.jsx:244-347`
- Modify: `web/src/components/WatchlistStar.jsx:1-55`
- Modify: `web/src/pages/Watchlist.jsx:30-78, 130-336`
- Modify: `web/src/pages/Login.jsx:1-225`
- Modify: `web/src/lib/singleProductContract.test.js`

**Interfaces:**
- Consumes: `watchlistIntent`, `authState`, and `continuationFromAuth` from Task 1
- Consumes: `useWatchlist().add(symbol, market)`
- Produces: router state `{ authIntent: { kind: 'watchlist-add', symbol, market } }`
- Produces: one-shot automatic watchlist save after successful authentication

- [ ] **Step 1: Extend the failing source contract**

Add these tests to `singleProductContract.test.js`:

```js
test('watchlist actions preserve an explicit auth intent', () => {
  const star = source('../components/WatchlistStar.jsx');
  const page = source('../pages/Watchlist.jsx');
  assert.match(star, /watchlistIntent\(symbol, market\)/);
  assert.match(star, /authState\(location, intent\)/);
  assert.match(page, /watchlistIntent\(value, market\)/);
  assert.doesNotMatch(page, /Your watchlist lives in your free account/);
});

test('login preserves the full return path and pending intent', () => {
  const login = source('../pages/Login.jsx');
  assert.match(login, /continuationFromAuth\(location\.state\)/);
  assert.match(login, /navigate\(continuation\.to, \{ replace: true, state: continuation\.state \}\)/);
});

test('the app mounts the post-login intent handler inside account providers', () => {
  const app = source('../App.jsx');
  assert.match(app, /<AuthIntentHandler \/>/);
});
```

- [ ] **Step 2: Run the three new cases and verify they fail**

Run from `web/`: `rtk node --test src/lib/singleProductContract.test.js`

Expected: the 3 new tests fail on missing intent calls and handler mount.

- [ ] **Step 3: Preserve the star intent**

In `WatchlistStar.jsx`, import the Task 1 helpers and replace the signed-out
branch with:

```jsx
if (!currentUser) {
  const intent = watchlistIntent(symbol, market);
  navigate('/login?mode=signup', { state: authState(location, intent) });
  return;
}
```

- [ ] **Step 4: Use the normal Watchlist page for everyone**

Remove the `if (!currentUser)` guest-page return from `Watchlist.jsx`. Add
`useLocation`, `useNavigate`, `authState`, and `watchlistIntent`. Extend the
`AddBox` signature and submit branch exactly as follows:

```jsx
const AddBox = ({ onAdd, onRequireAuth, isAuthenticated, error, onClearError }) => {
```

```jsx
if (!isAuthenticated) {
  onRequireAuth(v, market);
  return;
}
await onAdd(v, market);
setValue('');
```

Create the parent callback:

```jsx
const requireWatchlistAuth = (symbol, market) => {
  const intent = watchlistIntent(symbol, market);
  navigate('/login?mode=signup', { state: authState(location, intent) });
};
```

Mount the add box with all five props:

```jsx
<AddBox
  onAdd={add}
  onRequireAuth={requireWatchlistAuth}
  isAuthenticated={Boolean(currentUser)}
  error={error}
  onClearError={clearError}
/>
```

The standard page still renders `AddBox`, the empty state, and data tables. Its
empty copy is:

```jsx
<EmptyState title="Your watchlist is empty">
  Track stocks across NSE and US. Add a symbol above or tap ☆ anywhere in Alpha Nova.
</EmptyState>
```

- [ ] **Step 5: Preserve full return paths through login**

Import `continuationFromAuth` in `Login.jsx` and replace `continueAfterAuth`:

```jsx
const continueAfterAuth = useCallback(() => {
  const continuation = continuationFromAuth(location.state);
  navigate(continuation.to, { replace: true, state: continuation.state });
}, [location.state, navigate]);
```

Change signup perks to the two durable account benefits:

```jsx
const SIGNUP_PERKS = [
  'Save your NSE & US watchlist across devices',
  'Enable browser alerts for newly published signals',
];
```

Change signup supporting copy to `Save your watchlist and enable alerts · free · no credit card`.

- [ ] **Step 6: Implement one-shot post-login watchlist completion**

```jsx
// web/src/components/AuthIntentHandler.jsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useWatchlist } from '../WatchlistContext';
import { useSignalAlerts } from '../alerts/SignalAlertContext';

const AuthIntentHandler = () => {
  const { currentUser } = useAuth();
  const { add } = useWatchlist();
  const { ensureSubscribed } = useSignalAlerts();
  const location = useLocation();
  const navigate = useNavigate();
  const handled = useRef(null);
  const [notificationPending, setNotificationPending] = useState(false);
  const [watchlistError, setWatchlistError] = useState('');
  const intent = location.state?.authIntent;

  const clear = useCallback(() => {
    setNotificationPending(false);
    setWatchlistError('');
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, navigate]);

  const saveWatchlist = useCallback(async () => {
    try {
      await add(intent.symbol, intent.market);
      clear();
    } catch {
      setWatchlistError(`Could not save ${intent.symbol}. Retry?`);
    }
  }, [add, clear, intent]);

  useEffect(() => {
    if (!currentUser || !intent) return;
    const key = JSON.stringify(intent);
    if (handled.current === key) return;
    handled.current = key;
    if (intent.kind === 'watchlist-add') saveWatchlist();
    if (intent.kind === 'enable-notifications') setNotificationPending(true);
  }, [currentUser, intent, saveWatchlist]);

  const enable = async () => {
    await ensureSubscribed();
    clear();
  };

  if (!notificationPending && !watchlistError) return null;
  return (
    <div className="auth-intent-prompt" role="dialog" aria-label={watchlistError ? 'Watchlist save failed' : 'Enable notifications'}>
      <strong>{watchlistError || 'Enable signal alerts on this device?'}</strong>
      <div className="auth-intent-actions">
        <button type="button" className="secondary" onClick={clear}>Not now</button>
        {watchlistError ? (
          <button type="button" onClick={() => { handled.current = null; setWatchlistError(''); saveWatchlist(); }}>Retry save</button>
        ) : (
          <button type="button" onClick={enable}>Enable alerts</button>
        )}
      </div>
    </div>
  );
};

export default AuthIntentHandler;
```

Import and mount `<AuthIntentHandler />` in `AppLayout` inside
`WatchlistProvider`, `PredictionProvider`, and `SignalAlertProvider`, immediately
before the page shell.

- [ ] **Step 7: Run focused tests and lint**

Run from `web/`: `rtk node --test src/lib/authIntent.test.js src/lib/singleProductContract.test.js src/lib/googleAuthContract.test.js`

Expected: all tests pass.

Run from `web/`: `rtk npx eslint src/components/AuthIntentHandler.jsx src/components/WatchlistStar.jsx src/pages/Watchlist.jsx src/pages/Login.jsx src/App.jsx`

Expected: exit 0.

- [ ] **Step 8: Commit the complete watchlist conversion path**

```powershell
rtk git add -- web/src/components/AuthIntentHandler.jsx web/src/components/WatchlistStar.jsx web/src/App.jsx web/src/lib/singleProductContract.test.js
rtk git add -p -- web/src/pages/Watchlist.jsx web/src/pages/Login.jsx
rtk git diff --cached --check
rtk git commit -m "feat: save watchlist intent after sign in"
```

---

### Task 4: Notification conversion at the moment of intent

**Files:**
- Modify: `web/src/components/SettingsSheet.jsx:120-205`
- Modify: `web/src/alerts/SignalAlertProvider.jsx:160-400`
- Modify: `web/src/index.css`
- Modify: `web/src/lib/singleProductContract.test.js`

**Interfaces:**
- Consumes: `notificationIntent()` and `authState(location, intent)` from Task 1
- Consumes: `AuthIntentHandler` notification prompt from Task 3
- Preserves: `ensureSubscribed(): Promise<string>` from `SignalAlertContext`

- [ ] **Step 1: Add a failing notification-intent contract**

```js
test('signed-out Settings starts the notification auth intent', () => {
  const settings = source('../components/SettingsSheet.jsx');
  assert.match(settings, /notificationIntent\(\)/);
  assert.match(settings, /authState\(location, intent\)/);
  assert.match(settings, /Save watchlist & enable alerts/);
  assert.doesNotMatch(settings, /Browsing as guest/);
});
```

- [ ] **Step 2: Run the case and verify it fails**

Run from `web/`: `rtk node --test src/lib/singleProductContract.test.js`

Expected: the Settings notification-intent case fails.

- [ ] **Step 3: Route signed-out notification activation through login**

In `SettingsSheet.jsx`, add `useLocation`, `authState`, and
`notificationIntent`. Replace the signed-out account block with:

```jsx
<div className="settings-account">
  <div>
    <div className="settings-account-label">Save your setup</div>
    <div className="settings-account-email">Keep your watchlist across devices and enable signal alerts.</div>
  </div>
  <Link
    to="/login?mode=signup"
    state={authState(location, notificationIntent())}
    style={{ textDecoration: 'none' }}
    onClick={onClose}
  >
    <button type="button" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }}>
      Save watchlist &amp; enable alerts
    </button>
  </Link>
</div>
```

Keep the existing signed-in notification toggle, push test, and leaderboard
visibility controls unchanged.

- [ ] **Step 4: Keep notification permission account-backed**

Verify `SignalAlertProvider.jsx` retains both guards:

```jsx
if (currentUser && notifSupported() && Notification.permission === 'granted' &&
    localStorage.getItem(PREF_KEY) !== 'off') {
  subscribePush();
}
```

```jsx
{showNudge && currentUser && (
  <div className="notif-nudge" role="dialog" aria-label="Enable notifications">
```

Do not make `/api/push/subscribe`, `/api/push/unsubscribe`, or
`/api/push/test` public.

- [ ] **Step 5: Style the post-login user-gesture prompt**

Add these rules to `web/src/index.css` beside `.notif-nudge`:

```css
.auth-intent-prompt {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 1200;
  max-width: min(360px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--surface-grad), var(--bg-panel);
  box-shadow: var(--shadow-raised);
}

.auth-intent-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.auth-intent-actions button {
  width: auto;
}
```

- [ ] **Step 6: Run focused tests and lint**

Run from `web/`: `rtk node --test src/lib/authIntent.test.js src/lib/singleProductContract.test.js`

Expected: all tests pass.

Run from `web/`: `rtk npx eslint src/components/SettingsSheet.jsx src/alerts/SignalAlertProvider.jsx src/components/AuthIntentHandler.jsx`

Expected: exit 0.

- [ ] **Step 7: Commit notification conversion**

```powershell
rtk git add -- web/src/lib/singleProductContract.test.js
rtk git add -p -- web/src/components/SettingsSheet.jsx web/src/alerts/SignalAlertProvider.jsx web/src/index.css
rtk git diff --cached --check
rtk git commit -m "feat: continue notification setup after sign in"
```

---

### Task 5: Public Today's Call with device-local signed-out choices

**Files:**
- Create: `web/src/lib/localPrediction.js`
- Create: `web/src/lib/localPrediction.test.js`
- Modify: `web/src/PredictionContext.jsx:1-73`
- Modify: `web/src/pages/Dashboard.jsx:233-340`
- Modify: `web/src/pages/Leaderboard.jsx:1-145`
- Modify: `api/main.py:7362-7392`
- Modify: `api/test_predictions.py:35-45`
- Modify: `web/src/lib/singleProductContract.test.js`

**Interfaces:**
- Produces: `readLocalChoice(storage, qdate): 'UP' | 'DOWN' | null`
- Produces: `writeLocalChoice(storage, qdate, choice): boolean`
- Produces: anonymous `GET /api/predict/today` with `your_choice: null`
- Preserves: authenticated prediction writes and leaderboard identity

- [ ] **Step 1: Change the backend test to require a public read and private write**

Replace `test_today_shape_and_auth` in `api/test_predictions.py` with:

```python
def test_today_is_public_but_submit_requires_auth(monkeypatch):
    _unlock(monkeypatch)
    public = client.get("/api/predict/today")
    assert public.status_code == 200
    assert public.json()["symbol"] == "NIFTY 50"
    assert public.json()["your_choice"] is None
    assert client.post("/api/predict", json={"choice": "UP"}).status_code == 401

    headers, _ = _new_user()
    private = client.get("/api/predict/today", headers=headers).json()
    assert private["your_choice"] is None
```

- [ ] **Step 2: Run the backend test and verify the anonymous read fails**

Run: `rtk python -m pytest api/test_predictions.py::test_today_is_public_but_submit_requires_auth -q`

Expected: FAIL because the anonymous GET returns 401.

- [ ] **Step 3: Make only the daily-question read optional-user**

In `predict_today`, replace user resolution and prediction lookup with:

```python
row, conn = _optional_user(conn, authorization)
qdate, locked = _active_question_date()
conn.execute("INSERT OR IGNORE INTO daily_questions (qdate, symbol) VALUES (?, 'NIFTY 50')", (qdate,))
conn.commit()
pred = None
if row is not None:
    pred = conn.execute(
        "SELECT choice FROM predictions WHERE user_id=? AND qdate=?",
        (row["id"], qdate),
    ).fetchone()
```

Keep `POST /api/predict`, `GET /api/predict/me`, and
`POST /api/predict/hide` authenticated.

- [ ] **Step 4: Run the focused backend tests**

Run: `rtk python -m pytest api/test_predictions.py -q`

Expected: all prediction and leaderboard tests pass.

- [ ] **Step 5: Write failing local-prediction tests**

```js
// web/src/lib/localPrediction.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocalChoice, writeLocalChoice } from './localPrediction.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('signed-out prediction is scoped to its question date', () => {
  const storage = memoryStorage();
  assert.equal(writeLocalChoice(storage, '2026-08-16', 'UP'), true);
  assert.equal(readLocalChoice(storage, '2026-08-16'), 'UP');
  assert.equal(readLocalChoice(storage, '2026-08-17'), null);
});

test('invalid choices and blocked storage fail safely', () => {
  const hostile = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(writeLocalChoice(memoryStorage(), '2026-08-16', 'SIDEWAYS'), false);
  assert.equal(writeLocalChoice(hostile, '2026-08-16', 'DOWN'), false);
  assert.equal(readLocalChoice(hostile, '2026-08-16'), null);
});
```

- [ ] **Step 6: Run the local test and verify the module is missing**

Run from `web/`: `rtk node --test src/lib/localPrediction.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `localPrediction.js`.

- [ ] **Step 7: Implement safe local persistence**

```js
// web/src/lib/localPrediction.js
const KEY = 'alphanova_local_prediction';
const valid = (choice) => choice === 'UP' || choice === 'DOWN';

export const readLocalChoice = (storage, qdate) => {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || 'null');
    return saved?.qdate === qdate && valid(saved?.choice) ? saved.choice : null;
  } catch {
    return null;
  }
};

export const writeLocalChoice = (storage, qdate, choice) => {
  if (!qdate || !valid(choice)) return false;
  try {
    storage?.setItem(KEY, JSON.stringify({ qdate, choice }));
    return true;
  } catch {
    return false;
  }
};
```

- [ ] **Step 8: Make `PredictionProvider` public-read/local-write**

Import the local helpers. Change `reload` so it always requests
`/api/predict/today`; request `/api/predict/me` only for `currentUser`. For a
signed-out response, overlay the local choice:

```jsx
const response = await axios.get('/api/predict/today', { headers: authHeader() });
const payload = response.data;
setToday(currentUser ? payload : {
  ...payload,
  your_choice: readLocalChoice(window.localStorage, payload.qdate),
});
```

Change `submit` before the authenticated POST:

```jsx
if (!currentUser) {
  writeLocalChoice(window.localStorage, today?.qdate, choice);
  setToday((value) => (value ? { ...value, your_choice: choice } : value));
  return;
}
```

Include `currentUser` in the `reload` and `submit` callback dependencies. On
logout, call `reload()` instead of clearing `today`.

- [ ] **Step 9: Render one Today's Call component for everyone**

Remove `useAuth` and the entire signed-out teaser branch from `TodaysCall` in
`Dashboard.jsx`. Keep the normal loading, voting, locked, resolved, and
community states. Render the streak badge only when `stats` exists:

```jsx
const flame = stats
  ? <span className="tc-streak" title="Current streak">Streak {stats.current_streak || 0}</span>
  : null;
```

- [ ] **Step 10: Make Leaderboard copy neutral**

Remove the signed-out `lb-hint` containing `guest` and `Create free account`.
Keep signed-in personal StatGrid values. Change the page subtitle to
`Community NIFTY calls ranked by streak and long-run accuracy`. Use this
empty-state body for a streak board with no rows:

```jsx
'Make a call on the Dashboard to start today’s community challenge.'
```

Add this source contract:

```js
test('Today’s Call and Leaderboard do not substitute guest variants', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  const leaderboard = source('../pages/Leaderboard.jsx');
  assert.doesNotMatch(dashboard, /Guests get a static teaser|Create free account/);
  assert.doesNotMatch(leaderboard, /as a guest|Sign up free/);
});
```

- [ ] **Step 11: Run focused frontend tests and lint**

Run from `web/`: `rtk node --test src/lib/localPrediction.test.js src/lib/singleProductContract.test.js`

Expected: all tests pass.

Run from `web/`: `rtk npx eslint src/PredictionContext.jsx src/pages/Dashboard.jsx src/pages/Leaderboard.jsx src/lib/localPrediction.js src/lib/localPrediction.test.js`

Expected: exit 0.

- [ ] **Step 12: Commit the public/local prediction path**

```powershell
rtk git add -- api/test_predictions.py web/src/PredictionContext.jsx web/src/pages/Leaderboard.jsx web/src/lib/localPrediction.js web/src/lib/localPrediction.test.js web/src/lib/singleProductContract.test.js
rtk git add -p -- api/main.py web/src/pages/Dashboard.jsx
rtk git diff --cached --check
rtk git commit -m "feat: make daily call available without login"
```

---

### Task 6: Retire obsolete guest-only implementation

**Files:**
- Delete: `web/src/pages/GuestGate.jsx`
- Delete: `web/src/pages/GuestGate.css`
- Delete: `web/src/lib/accessGate.js`
- Delete: `web/src/lib/accessGate.test.js`
- Modify: `web/src/lib/singleProductContract.test.js`

**Interfaces:**
- Produces: no guest-gate feature flag, preview reducer, page component, or styles
- Preserves: every route declared in `web/src/App.jsx`

- [ ] **Step 1: Extend the source contract to forbid guest-only files**

```js
test('obsolete guest-only implementation files are retired', () => {
  const paths = [
    '../pages/GuestGate.jsx',
    '../pages/GuestGate.css',
    './accessGate.js',
    './accessGate.test.js',
  ];
  paths.forEach((path) => assert.equal(fs.existsSync(new URL(path, import.meta.url)), false, path));
});

test('every established product route remains declared', () => {
  const app = source('../App.jsx');
  [
    '/dashboard', '/watchlist', '/leaderboard', '/dcf', '/fundamentals',
    '/momentum', '/chart', '/flcl', '/druck-minervini', '/screener',
    '/fiidii', '/arima', '/position-sizing', '/news', '/option-chain',
    '/signals', '/track-record', '/sectors', '/deals', '/learn', '/trading-game',
  ].forEach((route) => assert.match(app, new RegExp(`path="${route}"`), route));
});
```

- [ ] **Step 2: Run the contract and verify the guest-file case fails**

Run from `web/`: `rtk node --test src/lib/singleProductContract.test.js`

Expected: the obsolete-file test fails while the product-route test passes.

- [ ] **Step 3: Delete only the four guest-only files**

Use `apply_patch` delete operations for:

```text
web/src/pages/GuestGate.jsx
web/src/pages/GuestGate.css
web/src/lib/accessGate.js
web/src/lib/accessGate.test.js
```

- [ ] **Step 4: Search for leftover guest-version behavior**

Run: `rtk rg -n -i "GuestGate|guest gate|guestColumns|Browsing as guest|as a guest|guest banner|Unlock active levels|Your watchlist lives in your free account" web/src`

Expected: no matches outside the negative assertions in
`singleProductContract.test.js`.

- [ ] **Step 5: Run the complete frontend Node suite**

Run from `web/`: `rtk node --test src/lib/*.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit the guest-variant retirement**

```powershell
rtk git add -- web/src/pages/GuestGate.jsx web/src/pages/GuestGate.css web/src/lib/accessGate.js web/src/lib/accessGate.test.js web/src/lib/singleProductContract.test.js
rtk git commit -m "refactor: retire guest-only app variants"
```

---

### Task 7: Full verification and browser flow audit

**Files:**
- Verify only; restore generated `web/dist` changes after build if Git reports them.

**Interfaces:**
- Validates: the complete approved product contract and every product route

- [ ] **Step 1: Run all frontend Node tests**

Run from `web/`: `rtk node --test src/lib/*.test.js`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run focused frontend lint**

Run:

```powershell
rtk npx eslint src/App.jsx src/AuthContext.jsx src/PredictionContext.jsx src/alerts/SignalAlertProvider.jsx src/components/AuthIntentHandler.jsx src/components/SettingsSheet.jsx src/components/SignalsPortfolio.jsx src/components/WatchlistStar.jsx src/pages/Dashboard.jsx src/pages/Leaderboard.jsx src/pages/Login.jsx src/pages/Watchlist.jsx src/lib/authIntent.js src/lib/authIntent.test.js src/lib/localPrediction.js src/lib/localPrediction.test.js src/lib/singleProductContract.test.js
```

Run from `web/`.

Expected: exit 0. If whole-repo lint is also run, report unrelated baseline debt
separately and do not broaden this task.

- [ ] **Step 3: Run relevant backend tests**

Run:

```powershell
rtk python -m pytest api/test_auth.py api/test_watchlist.py api/test_push.py api/test_predictions.py -q
```

Expected: all selected tests pass.

- [ ] **Step 4: Compile the touched Python module**

Run: `rtk python -m py_compile api/main.py`

Expected: exit 0.

- [ ] **Step 5: Build the production frontend**

Run from `web/`: `rtk npm run build`

Expected: Vite exits 0 and emits the production bundle.

- [ ] **Step 6: Restore generated bundle churn only**

Inspect `git status --short web/dist`. If the build changed tracked generated
files, restore only those exact `web/dist` paths using `git restore --worktree -- web/dist`.

- [ ] **Step 7: Run whitespace and scope checks**

Run: `rtk git diff --check`

Expected: no whitespace errors.

Run: `rtk git status --short`

Expected: unrelated pre-existing changes remain; no generated `web/dist` churn
remains; all feature files are committed.

- [ ] **Step 8: Start the local app for browser verification**

Start terminal 1 from `api/`:

```powershell
rtk python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Start terminal 2 from `web/`:

```powershell
rtk npm run dev -- --host 127.0.0.1 --port 5173
```

From the repository root, verify both processes before opening the browser:

```powershell
rtk curl.exe -fsS http://127.0.0.1:8000/api/predict/today
rtk curl.exe -fsS http://127.0.0.1:5173/
```

Expected: both commands return HTTP-success content. Stop both processes after
browser verification.

- [ ] **Step 9: Verify the signed-out route inventory**

At desktop and 390-by-844 mobile sizes, visit `/`, then navigate to all routes
listed in Task 6. For every route verify normal page content, no auth redirect,
no locked Signals fields, no guest banner/copy, no horizontal overflow, and no
console error.

- [ ] **Step 10: Verify the watchlist conversion flow**

Signed out, open `/chart?symbol=SBIN.NS#levels`, tap ☆, create or use a test
account, and verify:

```text
return URL = /chart?symbol=SBIN.NS#levels
watchlist contains SBIN exactly once
refresh keeps SBIN
second signed-in device/session can load SBIN from the account
```

- [ ] **Step 11: Verify the notification conversion flow**

Signed out, choose the Settings benefit action, authenticate, and verify the
post-login prompt appears. Click `Enable alerts` and verify the supported
browser reaches either granted/subscribed or an accurate denied/unsupported
state without a login loop.

- [ ] **Step 12: Verify signed-out Today's Call**

Signed out, choose GREEN or RED before lock, refresh, and verify the choice
remains. Confirm the network log contains no anonymous `POST /api/predict` and
the public leaderboard does not mark any row as the visitor.

- [ ] **Step 13: Commit any verification-only test correction**

If verification exposes a feature-owned defect, add a focused failing test,
fix it, rerun the affected checks, and commit only those files with:

```powershell
rtk git commit -m "test: cover single-product conversion regression"
```

Do not deploy. Report local verification separately from any future production
release request.
