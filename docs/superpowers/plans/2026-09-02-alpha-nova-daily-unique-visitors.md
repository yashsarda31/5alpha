# Alpha Nova Daily Unique Visitors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record one privacy-safe Alpha Nova browser visit per IST calendar day across every route and display a single daily unique-visitor KPI in the standalone growth dashboard.

**Architecture:** Extend the existing first-party anonymous analytics event pipeline with `site_visit`, aggregate distinct browser UUIDs by IST day inside `api/analytics_events.py`, and expose a backward-compatible `visitors` object from the protected admin metrics endpoint. A router-level tracker calls a retryable, locally deduplicated frontend helper; the standalone dashboard renders only today's KPI plus yesterday and seven-day-average context.

**Tech Stack:** React 18, React Router, browser `localStorage`, Node's built-in test runner, FastAPI, Python `sqlite3`, pytest, and the dashboard's self-contained HTML/CSS/JavaScript.

## Global Constraints

- A visitor is one anonymous browser identifier observed during an IST calendar day.
- The same browser counts once per IST day across every Alpha Nova route and can count again the next IST day.
- The KPI label is exactly `Unique visitors today`; context is `Yesterday X · 7-day avg Y`.
- Keep visitor counts separate from registered-user metrics.
- Reuse `alphanova_analytics_device_id`; do not add cookies, IP hashing, fingerprinting, third-party analytics, email, symbols, query strings, or tokens.
- Preserve the existing 90-day analytics retention and anonymous-device deletion behavior.
- Persist the daily deduplication marker only after the API accepts the event; a failed send must remain retryable.
- Treat missing `visitors` data as an older-backend state; do not reject the entire metrics response.
- Do not backfill visitor history from existing product events.
- This plan authorizes local implementation, tests, and commits only. Do not deploy, rotate secrets, or copy files to Downloads.
- Preserve all unrelated dirty-worktree changes.

## File Structure

- `api/analytics_events.py`: validate `site_visit` and own IST daily-visitor aggregation.
- `api/test_analytics_events.py`: unit coverage for the event allowlist, distinct-browser counting, IST boundaries, future/invalid rows, seven-day averaging, retention, and device deletion.
- `api/main.py`: include the aggregate in the protected `/api/admin/metrics` response without changing its authentication contract.
- `api/test_admin_metrics.py`: verify the endpoint-data contract with a deterministic clock.
- `web/src/lib/productAnalytics.js`: own IST day calculation, once-per-day browser deduplication, retry behavior, and reset cleanup.
- `web/src/lib/productAnalytics.test.js`: behavior-level unit tests for payload validation, IST rollover, deduplication, retries, and in-flight suppression.
- `web/src/App.jsx`: mount the daily tracker once inside `BrowserRouter`, above both login and application routes.
- `web/src/lib/siteVisitorWiring.test.js`: source contract proving all routes pass through the tracker.
- `alphanova48-growth-dashboard.html`: render the visitor KPI while retaining the current registered-user UI and legacy-payload compatibility.
- `api/test_growth_dashboard_file.py`: standalone-file contract and UTF-8 regression coverage.

---

### Task 1: Add IST daily visitor aggregation to the protected metrics API

**Files:**
- Modify: `api/analytics_events.py:11-173`
- Modify: `api/test_analytics_events.py:1-104`
- Modify: `api/main.py:47-49,7939-8022`
- Modify: `api/test_admin_metrics.py:1-100`

**Interfaces:**
- Consumes: existing `analytics_events(event, device_id, occurred_at, route, market, created_at)` rows and `_utc(value)` normalization.
- Produces: `aggregate_visitors(conn: sqlite3.Connection, now: datetime) -> dict` with `timezone`, `today`, `yesterday`, `average_7d`, and `tracked_since`; `_admin_metrics_data(..., now=None)` returns that object at top-level key `visitors`.

- [ ] **Step 1: Write failing analytics aggregation tests**

Update the import and exact allowlist in `api/test_analytics_events.py`, then add the deterministic IST-boundary test:

```python
from api.analytics_events import (
    ALLOWED_EVENTS,
    aggregate_activation,
    aggregate_visitors,
    delete_device,
    ensure_schema,
    record_event,
)


def test_event_and_field_allowlists_are_exact(conn):
    assert ALLOWED_EVENTS == {
        "today_viewed", "analyse_loaded", "position_sizing_completed",
        "watchlist_intent_started", "watchlist_saved", "alerts_enabled",
        "return_visit", "site_visit",
    }
    # Keep the existing storage assertions below this allowlist unchanged.


def test_site_visit_aggregation_counts_distinct_browsers_by_ist_day(conn):
    now = datetime(2026, 9, 2, 18, 45, tzinfo=timezone.utc)  # 3 Sep, 00:15 IST
    first = "7d1c74ef-8da5-4a78-9eab-8f35145d172f"
    second = "0e1334ee-e1b1-4e55-b262-9420bb550251"
    yesterday = "9d708c18-8202-437a-9a2a-106454a80bb9"
    sixth_day = "ef06d730-4053-4c69-9297-2f91d95c46e5"

    def visit(device, occurred_at):
        record_event(conn, {
            "event": "site_visit",
            "device_id": device,
            "occurred_at": occurred_at,
            "route": "/",
            "market": "",
        }, now)

    visit(first, "2026-09-02T18:35:00Z")       # today in IST
    visit(first, "2026-09-02T18:40:00Z")       # duplicate browser/day
    visit(second, "2026-09-02T18:41:00Z")      # second browser today
    visit(yesterday, "2026-09-02T18:20:00Z")   # yesterday in IST
    visit(sixth_day, "2026-08-28T04:30:00Z")   # within trailing seven IST days
    conn.execute(
        "INSERT INTO analytics_events(event, device_id, occurred_at, route, market, created_at) VALUES(?,?,?,?,?,?)",
        ("site_visit", "27557797-d00d-4690-a5cc-d1c1bbfac012", "not-a-date", "/", "", now.isoformat()),
    )
    visit("e48322bb-3881-44c4-9d81-1c79609c702f", "2026-09-02T19:00:00Z")  # future

    result = aggregate_visitors(conn, now)

    assert result == {
        "timezone": "Asia/Kolkata",
        "today": 2,
        "yesterday": 1,
        "average_7d": 0.6,
        "tracked_since": "2026-08-28T04:30:00+00:00",
    }
```

- [ ] **Step 2: Run the analytics test and confirm RED**

Run from the repository root:

```powershell
rtk python -m pytest api/test_analytics_events.py -q
```

Expected: collection fails because `aggregate_visitors` does not exist, or the exact allowlist fails because `site_visit` is absent.

- [ ] **Step 3: Implement the minimal visitor aggregate**

In `api/analytics_events.py`, add `site_visit` to `ALLOWED_EVENTS`, define the fixed India timezone, and add the aggregate after `aggregate_activation`:

```python
ALLOWED_EVENTS = {
    "today_viewed",
    "analyse_loaded",
    "position_sizing_completed",
    "watchlist_intent_started",
    "watchlist_saved",
    "alerts_enabled",
    "return_visit",
    "site_visit",
}
IST = timezone(timedelta(hours=5, minutes=30))


def aggregate_visitors(conn: sqlite3.Connection, now: datetime) -> dict:
    ensure_schema(conn)
    current = _utc(now)
    today = current.astimezone(IST).date()
    days = [today - timedelta(days=offset) for offset in range(7)]
    devices_by_day = {day: set() for day in days}
    tracked_since = None

    rows = conn.execute(
        "SELECT device_id, occurred_at FROM analytics_events WHERE event = ?",
        ("site_visit",),
    ).fetchall()
    for row in rows:
        device_id, occurred_at = row[0], row[1]
        try:
            occurred = _utc(occurred_at)
        except ValueError:
            continue
        if occurred > current:
            continue
        if tracked_since is None or occurred < tracked_since:
            tracked_since = occurred
        day = occurred.astimezone(IST).date()
        if day in devices_by_day:
            devices_by_day[day].add(device_id)

    counts = {day: len(devices) for day, devices in devices_by_day.items()}
    return {
        "timezone": "Asia/Kolkata",
        "today": counts[today],
        "yesterday": counts[today - timedelta(days=1)],
        "average_7d": round(sum(counts.values()) / 7, 1),
        "tracked_since": tracked_since.isoformat() if tracked_since else None,
    }
```

- [ ] **Step 4: Run the analytics suite and confirm GREEN**

```powershell
rtk python -m pytest api/test_analytics_events.py -q
```

Expected: all tests pass, including the new distinct-browser/IST-day test and the existing privacy, retention, reset, funnel, and cohort tests.

- [ ] **Step 5: Write the failing admin-metrics contract test**

In `api/test_admin_metrics.py`, import `ensure_schema` and add a deterministic response test:

```python
from api.analytics_events import ensure_schema  # noqa: E402


def test_admin_metrics_includes_daily_unique_visitors():
    now = datetime(2026, 9, 2, 18, 45, tzinfo=timezone.utc)
    conn = _auth_db()
    ensure_schema(conn)
    conn.execute("DELETE FROM analytics_events")
    conn.execute(
        "INSERT INTO analytics_events(event, device_id, occurred_at, route, market, created_at) VALUES(?,?,?,?,?,?)",
        ("site_visit", "7d1c74ef-8da5-4a78-9eab-8f35145d172f",
         "2026-09-02T18:35:00Z", "/", "", now.isoformat()),
    )
    conn.commit()
    conn.close()

    metrics = _admin_metrics_data(now=now)

    assert metrics["visitors"] == {
        "timezone": "Asia/Kolkata",
        "today": 1,
        "yesterday": 0,
        "average_7d": 0.1,
        "tracked_since": "2026-09-02T18:35:00+00:00",
    }
```

- [ ] **Step 6: Run the admin test and confirm RED**

```powershell
rtk python -m pytest api/test_admin_metrics.py::test_admin_metrics_includes_daily_unique_visitors -q
```

Expected: FAIL because `_admin_metrics_data` does not accept `now` and does not return `visitors`.

- [ ] **Step 7: Add visitors to the protected metrics response**

Update both import branches and `_admin_metrics_data` in `api/main.py`:

```python
try:
    from api.analytics_events import (
        aggregate_activation,
        aggregate_visitors,
        delete_device,
        record_event,
    )
except ImportError:
    from analytics_events import (
        aggregate_activation,
        aggregate_visitors,
        delete_device,
        record_event,
    )


def _admin_metrics_data(growth_days=90, recent_limit=25, now=None):
    _blob_pull_db(force=True)
    now = now or datetime.now(timezone.utc)
    conn = _auth_db()
    try:
        users = conn.execute(
            "SELECT email, display_name, created_at, last_login_at FROM users"
        ).fetchall()
        active_sessions = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE expires_at > ?", (_utc_now(),)
        ).fetchone()[0]
        activation = aggregate_activation(conn, now)
        visitors = aggregate_visitors(conn, now)
    finally:
        conn.close()

    today = now.date()
    # Keep the existing registered-user calculations unchanged below this point.
```

Add the new top-level field beside the existing activation field in the return object:

```python
        "activation": activation,
        "visitors": visitors,
```

Retain the existing inline `totals` dictionary and all other response fields exactly; this is a two-line replacement at the end of the existing return object.

- [ ] **Step 8: Run focused backend tests and confirm GREEN**

```powershell
rtk python -m pytest api/test_analytics_events.py api/test_admin_metrics.py -q
```

Expected: all focused backend tests pass.

- [ ] **Step 9: Commit the backend aggregate**

```powershell
rtk git add -- api/analytics_events.py api/test_analytics_events.py api/main.py api/test_admin_metrics.py
rtk git commit -m "feat: aggregate daily unique visitors"
```

---

### Task 2: Record one accepted browser visit per IST day

**Files:**
- Modify: `web/src/lib/productAnalytics.js:1-119`
- Modify: `web/src/lib/productAnalytics.test.js:1-26`

**Interfaces:**
- Consumes: existing `trackProductEvent(name, fields)` transport, anonymous `ANALYTICS_DEVICE_KEY`, and browser-compatible storage methods.
- Produces: `VISITOR_DAY_KEY`, `istDayKey(now: Date) -> string | null`, `trackDailySiteVisit({now, storage, sendEvent}) -> Promise<boolean>`, and `clearProductAnalyticsStorage(storage) -> boolean`.

- [ ] **Step 1: Write failing IST-day and accepted-send tests**

Expand `web/src/lib/productAnalytics.test.js` imports and add a memory storage helper plus the visitor tests:

```javascript
import {
  ANALYTICS_DEVICE_KEY,
  FIRST_RUN_KEY,
  VISITOR_DAY_KEY,
  buildEventPayload,
  clearProductAnalyticsStorage,
  istDayKey,
  trackDailySiteVisit,
} from './productAnalytics.js';

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('IST day key rolls over at 18:30 UTC', () => {
  assert.equal(istDayKey(new Date('2026-09-02T18:29:59Z')), '2026-09-02');
  assert.equal(istDayKey(new Date('2026-09-02T18:30:00Z')), '2026-09-03');
});

test('daily site visit sends once after acceptance and sends again next IST day', async () => {
  const storage = memoryStorage();
  const calls = [];
  const sendEvent = async (...args) => { calls.push(args); return true; };

  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T18:29:00Z'), storage, sendEvent,
  }), true);
  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T18:29:30Z'), storage, sendEvent,
  }), false);
  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T18:30:00Z'), storage, sendEvent,
  }), true);

  assert.deepEqual(calls, [
    ['site_visit', { route: '/', market: '' }],
    ['site_visit', { route: '/', market: '' }],
  ]);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), '2026-09-03');
});

test('failed and concurrent site visit attempts remain retryable without duplicates', async () => {
  const storage = memoryStorage();
  let calls = 0;
  let accept = false;
  const sendEvent = async () => { calls += 1; return accept; };
  const options = {
    now: new Date('2026-09-02T08:00:00Z'), storage, sendEvent,
  };

  assert.equal(await trackDailySiteVisit(options), false);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), null);
  accept = true;
  const [first, second] = await Promise.all([
    trackDailySiteVisit(options),
    trackDailySiteVisit(options),
  ]);

  assert.deepEqual([first, second], [true, true]);
  assert.equal(calls, 2); // one rejected attempt, then one shared accepted attempt
  assert.equal(storage.getItem(VISITOR_DAY_KEY), '2026-09-02');
});

test('visitor tracking absorbs transport errors and reset cleanup removes its marker', async () => {
  const failingStorage = memoryStorage();
  assert.equal(await trackDailySiteVisit({
    now: new Date('2026-09-02T08:00:00Z'),
    storage: failingStorage,
    sendEvent: async () => { throw new Error('offline'); },
  }), false);
  assert.equal(failingStorage.getItem(VISITOR_DAY_KEY), null);

  const storage = memoryStorage({
    [ANALYTICS_DEVICE_KEY]: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    [FIRST_RUN_KEY]: '{}',
    [VISITOR_DAY_KEY]: '2026-09-02',
    alphanova_analytics_last_visit_day: '2026-09-01',
  });
  assert.equal(clearProductAnalyticsStorage(storage), true);
  assert.equal(storage.getItem(ANALYTICS_DEVICE_KEY), null);
  assert.equal(storage.getItem(FIRST_RUN_KEY), null);
  assert.equal(storage.getItem(VISITOR_DAY_KEY), null);
  assert.equal(storage.getItem('alphanova_analytics_last_visit_day'), null);
});
```

Also add a payload assertion showing `site_visit` is allowlisted with only the canonical site route and empty market:

```javascript
assert.deepEqual(
  buildEventPayload('site_visit', { route: '/', market: '' },
    '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    new Date('2026-09-02T08:00:00Z')),
  {
    event: 'site_visit',
    device_id: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    occurred_at: '2026-09-02T08:00:00.000Z',
    route: '/',
    market: '',
  },
);
```

- [ ] **Step 2: Run the product analytics tests and confirm RED**

Run from `web`:

```powershell
rtk node --test src/lib/productAnalytics.test.js
```

Expected: module import failure because `VISITOR_DAY_KEY`, `istDayKey`, and `trackDailySiteVisit` do not exist, or the `site_visit` payload assertion fails.

- [ ] **Step 3: Implement IST day calculation, retry, and deduplication**

In `web/src/lib/productAnalytics.js`, add the key and allowlisted event:

```javascript
export const ANALYTICS_DEVICE_KEY = 'alphanova_analytics_device_id';
export const FIRST_RUN_KEY = 'alphanova_first_run_v1';
export const VISITOR_DAY_KEY = 'alphanova_analytics_site_visit_day';
const LAST_VISIT_KEY = 'alphanova_analytics_last_visit_day';
const IST_OFFSET_MS = 330 * 60 * 1000;

const EVENTS = new Set([
  'today_viewed',
  'analyse_loaded',
  'position_sizing_completed',
  'watchlist_intent_started',
  'watchlist_saved',
  'alerts_enabled',
  'return_visit',
  'site_visit',
]);

export function istDayKey(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
```

After `trackProductEvent`, add the in-flight guard and tracker:

```javascript
let siteVisitInFlight = null;

export function trackDailySiteVisit({
  now = new Date(),
  storage = globalThis.localStorage,
  sendEvent = trackProductEvent,
} = {}) {
  const day = istDayKey(now);
  if (!day || !storage) return Promise.resolve(false);
  try {
    if (storage.getItem(VISITOR_DAY_KEY) === day) return Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
  if (siteVisitInFlight) return siteVisitInFlight;

  siteVisitInFlight = (async () => {
    let accepted = false;
    try {
      accepted = await sendEvent('site_visit', { route: '/', market: '' });
    } catch {
      return false;
    }
    if (!accepted) return false;
    try {
      storage.setItem(VISITOR_DAY_KEY, day);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    siteVisitInFlight = null;
  });
  return siteVisitInFlight;
}
```

Add one storage-cleanup helper before `resetProductAnalytics`:

```javascript
export function clearProductAnalyticsStorage(storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.removeItem(ANALYTICS_DEVICE_KEY);
    storage.removeItem(FIRST_RUN_KEY);
    storage.removeItem(LAST_VISIT_KEY);
    storage.removeItem(VISITOR_DAY_KEY);
    return true;
  } catch {
    return false;
  }
}
```

Replace the duplicated local-storage cleanup branches in `resetProductAnalytics` with the helper while retaining the server-side delete gate:

```javascript
export async function resetProductAnalytics() {
  const deviceId = getDeviceId(false);
  if (!deviceId) return clearProductAnalyticsStorage();
  const ok = await send('/api/analytics/device', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!ok) return false;
  return clearProductAnalyticsStorage();
}
```

- [ ] **Step 4: Run the product analytics tests and confirm GREEN**

```powershell
rtk node --test src/lib/productAnalytics.test.js
```

Expected: all product analytics tests pass with no warnings or unhandled rejections.

- [ ] **Step 5: Commit the browser tracker**

```powershell
rtk git add -- web/src/lib/productAnalytics.js web/src/lib/productAnalytics.test.js
rtk git commit -m "feat: record daily browser visits"
```

---

### Task 3: Mount visitor tracking above every application route

**Files:**
- Modify: `web/src/App.jsx:1-446`
- Create: `web/src/lib/siteVisitorWiring.test.js`

**Interfaces:**
- Consumes: `trackDailySiteVisit() -> Promise<boolean>` from Task 2 and `useLocation()` from React Router.
- Produces: a route-observing `SiteVisitTracker` mounted directly inside `BrowserRouter`, before the route tree containing `/login` and `AppLayout`.

- [ ] **Step 1: Write the failing global-wiring contract test**

Create `web/src/lib/siteVisitorWiring.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('daily visitor tracking wraps login and every application route', () => {
  assert.match(
    app,
    /import \{ trackDailySiteVisit \} from '\.\/lib\/productAnalytics\.js';/,
  );
  assert.match(
    app,
    /const SiteVisitTracker = \(\) => \{[\s\S]*const \{ pathname \} = useLocation\(\);[\s\S]*void trackDailySiteVisit\(\);[\s\S]*\}, \[pathname\]\);[\s\S]*return null;[\s\S]*\};/,
  );
  assert.match(app, /<BrowserRouter>\s*<SiteVisitTracker \/>\s*<Routes>/);
});
```

- [ ] **Step 2: Run the wiring test and confirm RED**

From `web`:

```powershell
rtk node --test src/lib/siteVisitorWiring.test.js
```

Expected: FAIL because the import, component, and router-level mount are absent.

- [ ] **Step 3: Add the router-level tracker**

In `web/src/App.jsx`, add the import:

```javascript
import { trackDailySiteVisit } from './lib/productAnalytics.js';
```

Add this component beside `ScrollToTop`:

```javascript
const SiteVisitTracker = () => {
  const { pathname } = useLocation();
  React.useEffect(() => {
    void trackDailySiteVisit();
  }, [pathname]);
  return null;
};
```

Mount it inside the existing router, before its route tree:

```jsx
<BrowserRouter>
  <SiteVisitTracker />
  <Routes>
    <Route
      path="/login"
      element={<Suspense fallback={<PageLoader />}><Login /></Suspense>}
    />
    <Route path="*" element={<AppLayout />} />
  </Routes>
</BrowserRouter>
```

- [ ] **Step 4: Run wiring and analytics tests and confirm GREEN**

```powershell
rtk node --test src/lib/productAnalytics.test.js src/lib/siteVisitorWiring.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Run focused lint for changed web files**

```powershell
rtk npx eslint src/App.jsx src/lib/productAnalytics.js src/lib/productAnalytics.test.js src/lib/siteVisitorWiring.test.js
```

Expected: exit 0 with no lint errors.

- [ ] **Step 6: Commit the global wiring**

```powershell
rtk git add -- web/src/App.jsx web/src/lib/siteVisitorWiring.test.js
rtk git commit -m "feat: track visits across all routes"
```

---

### Task 4: Render the backward-compatible visitor KPI and verify the feature

**Files:**
- Modify: `alphanova48-growth-dashboard.html:93,246-328`
- Modify: `api/test_growth_dashboard_file.py:1-15`

**Interfaces:**
- Consumes: optional admin payload field `visitors = {timezone, today, yesterday, average_7d, tracked_since}` from Task 1.
- Produces: one eighth KPI card labelled `Unique visitors today`; older payloads show an unavailable state without breaking the rest of the dashboard.

- [ ] **Step 1: Write the failing dashboard contract test**

Append to `api/test_growth_dashboard_file.py`:

```python
def test_growth_dashboard_renders_optional_daily_visitor_kpi():
    html = DASHBOARD.read_text(encoding="utf-8")
    validation = html.split("function validatePayload(data) {", 1)[1].split(
        "function setStatus", 1
    )[0]

    assert "visitors" not in validation
    assert '["Unique visitors today"' in html
    assert "state.data.visitors" in html
    assert "Yesterday ${fmt(visitors.yesterday)} · 7-day avg ${fmtOne(visitors.average_7d)}" in html
    assert '"Backend update required"' in html
```

- [ ] **Step 2: Run the dashboard contract and confirm RED**

From the repository root:

```powershell
rtk python -m pytest api/test_growth_dashboard_file.py -q
```

Expected: FAIL because the visitor KPI strings are absent.

- [ ] **Step 3: Add the visitor formatter, KPI, fallback, and eight-column layout**

In `alphanova48-growth-dashboard.html`, change the wide-screen grid only; retain the existing 4/2/1 responsive breakpoints:

```css
.kpi-grid { display: grid; grid-template-columns: repeat(8, minmax(130px, 1fr)); gap: 12px; margin-bottom: 18px; }
```

Add the one-decimal formatter beside `fmt`:

```javascript
const fmt = (value) => Number(value || 0).toLocaleString("en-IN");
const fmtOne = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
```

Keep `validatePayload` unchanged so `visitors` remains optional. At the start of `renderKpis`, calculate a complete visitor state:

```javascript
const visitors = state.data.visitors;
const visitorsAvailable = visitors && ["today", "yesterday", "average_7d"]
  .every((field) => Number.isFinite(Number(visitors[field])));
const visitorValue = visitorsAvailable ? fmt(visitors.today) : "—";
const visitorMeta = visitorsAvailable
  ? `Yesterday ${fmt(visitors.yesterday)} · 7-day avg ${fmtOne(visitors.average_7d)}`
  : "Backend update required";
```

Append the new card to the existing `cards` array after `Live sessions`:

```javascript
["Live sessions", fmt(totals.active_sessions), "Unexpired tokens", ""],
["Unique visitors today", visitorValue, escapeHtml(visitorMeta), ""],
```

- [ ] **Step 4: Run dashboard and focused feature tests and confirm GREEN**

From the repository root:

```powershell
rtk python -m pytest api/test_growth_dashboard_file.py api/test_analytics_events.py api/test_admin_metrics.py -q
```

From `web`:

```powershell
rtk node --test src/lib/productAnalytics.test.js src/lib/siteVisitorWiring.test.js
```

Expected: all focused tests pass.

- [ ] **Step 5: Run the broader local verification gates**

From the repository root:

```powershell
rtk python -m pytest api -q --ignore=api/test_live.py
rtk git diff --check
```

From `web`:

```powershell
rtk node --test src/**/*.test.js
rtk npm run build
```

Expected: backend and frontend tests pass, the production build exits 0, and `git diff --check` prints no errors. If a pre-existing unrelated failure remains, record its exact command/output and prove all focused visitor tests still pass; do not repair unrelated files.

- [ ] **Step 6: Inspect the final scoped diff**

```powershell
rtk git diff -- api/analytics_events.py api/test_analytics_events.py api/main.py api/test_admin_metrics.py web/src/lib/productAnalytics.js web/src/lib/productAnalytics.test.js web/src/App.jsx web/src/lib/siteVisitorWiring.test.js alphanova48-growth-dashboard.html api/test_growth_dashboard_file.py
rtk git status --short
```

Expected: only the planned visitor-tracking files appear in the scoped diff; unrelated pre-existing changes remain untouched.

- [ ] **Step 7: Commit the dashboard and verification contract**

```powershell
rtk git add -- alphanova48-growth-dashboard.html api/test_growth_dashboard_file.py
rtk git commit -m "feat: show daily unique visitor KPI"
```

- [ ] **Step 8: Report the local delivery boundary**

Report the exact focused and broader test counts, build result, commit IDs, and the dashboard file path. State explicitly that no deployment, secret rotation, or Downloads copy occurred and that collection starts only after a separately authorized production deployment.
