# Alpha Nova Trust and Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Alpha Nova's paper-position evidence contract, expose signal data quality, make Signals readable on mobile, and guide a first-time visitor through one measurable research workflow.

**Architecture:** Extract evidence-aware position resolution and portfolio aggregation into `api/signal_model/portfolio.py`, leaving FastAPI routing, database/blob coordination, and caching in `api/main.py`. Add a small status envelope to Signals, focused React components for trust and progressive disclosure, and an allowlisted first-party analytics module whose failures never block product actions.

**Tech Stack:** Python 3/FastAPI/SQLite/pandas/pytest; React 19/Vite/React Router; Node built-in test runner; existing CSS design tokens and SWR helper.

## Global Constraints

- Alpha Nova remains public and research-only; do not add a paywall, pricing, checkout, entitlement, or payment SDK.
- Label the existing 0–100 heuristic as `Quality Score`, never `Conviction`, probability, confidence, or expected win rate.
- Ambiguous outcomes use status `unresolved` and are excluded from wins, losses, returns, equity curves, and open-slot counts.
- Essential stale, incomplete, or provider-limited inputs publish zero actionable setups.
- Preserve all routes, contextual watchlist/alert authentication, and unrelated dirty-worktree content.
- Do not modify generated `web/dist` files.
- Do not deploy, publish, or push; deployment requires a separate explicit request.
- Every behavior change follows RED → GREEN → REFACTOR, with the failing test output observed before production edits.

---

## File Map

- Create `api/signal_model/portfolio.py`: deterministic evidence resolution and portfolio snapshot logic.
- Create `api/test_signal_portfolio.py`: unit coverage for resolution and aggregation.
- Modify `api/main.py`: route orchestration, injected providers, database status updates, Signals data status, fail-closed gate, analytics routes, admin aggregation.
- Modify `api/test_signal_tracking.py`: endpoint integration and persistence regressions.
- Create `api/test_signal_data_status.py`: status-envelope and fail-closed publication coverage.
- Create `api/analytics_events.py`: event validation, SQLite persistence, retention, reset, and aggregate funnel/cohort queries.
- Create `api/test_analytics_events.py`: event privacy and aggregation coverage.
- Create `web/src/lib/signalView.js` and `web/src/lib/signalView.test.js`: pure trust/status view derivation.
- Create `web/src/components/DataStatus.jsx`: provenance disclosure.
- Create `web/src/components/CollapsibleSection.jsx`: accessible mobile disclosure.
- Create `web/src/components/SignalSetupCards.jsx`: setup cards with risk fields and Analyse link.
- Modify `web/src/pages/MarketSignals.jsx` and `web/src/pages/MarketSignals.css`: trust-first responsive layout.
- Modify `web/src/pages/TrackRecord.jsx`: unresolved group and honest sample labels.
- Create `web/src/lib/productAnalytics.js` and `web/src/lib/productAnalytics.test.js`: scrubbed, non-blocking event transport.
- Create `web/src/components/FirstRunWorkflow.jsx`: public device-local research ladder.
- Modify `web/src/pages/Dashboard.jsx` and `web/src/pages/Dashboard.css`: first-run workflow integration.
- Modify `web/src/components/Disclaimer.jsx`, `web/src/components/SettingsSheet.jsx`, and `web/src/index.css`: persistent notice access, analytics reset, typography floors.
- Create `web/src/lib/trustUsabilityContract.test.js`: cross-file source contracts.

---

### Task 1: Extract Evidence-Aware Portfolio Resolution

**Files:**
- Create: `api/signal_model/portfolio.py`
- Create: `api/test_signal_portfolio.py`

**Interfaces:**
- Consumes: position dictionaries with `market`, `symbol`, `side`, `entry`, `stop`, `target`, `entry_date`, and optional `signal_at`.
- Produces: `Resolution(status, exit_price, exit_date, reason)`; `resolve_position(position, intraday_bars, daily_bars, market_date, max_hold_days)`; `build_portfolio_snapshot(rows, quote_loader, market_date, slots, weight)`.

- [ ] **Step 1: Write the failing resolver tests**

Create `api/test_signal_portfolio.py` with deterministic bars and these tests:

```python
from datetime import date

import pandas as pd

from api.signal_model.portfolio import build_portfolio_snapshot, resolve_position


def bars(*rows):
    return pd.DataFrame(rows).set_index("timestamp")


def position(**overrides):
    row = {
        "market": "IN", "symbol": "TEST", "side": "LONG",
        "entry": 100.0, "stop": 95.0, "target": 110.0,
        "entry_date": "2026-08-28", "signal_at": "2026-08-28T10:15:00+05:30",
        "status": "open", "source": "live_engine", "model_version": "test-v1",
    }
    row.update(overrides)
    return row


def test_post_publication_intraday_stop_resolves_loss():
    intraday = bars(
        {"timestamp": "2026-08-28T10:10:00+05:30", "Open": 100, "High": 101, "Low": 90, "Close": 99},
        {"timestamp": "2026-08-28T10:20:00+05:30", "Open": 100, "High": 101, "Low": 94, "Close": 96},
    )
    result = resolve_position(position(), intraday, pd.DataFrame(), date(2026, 8, 28), 5)
    assert (result.status, result.exit_price, result.exit_date) == ("loss", 95.0, "2026-08-28")


def test_same_bar_stop_and_target_uses_conservative_stop():
    intraday = bars(
        {"timestamp": "2026-08-28T10:20:00+05:30", "Open": 100, "High": 112, "Low": 94, "Close": 105},
    )
    result = resolve_position(position(), intraday, pd.DataFrame(), date(2026, 8, 28), 5)
    assert result.status == "loss"
    assert result.exit_price == 95.0


def test_entry_close_beyond_stop_without_intraday_is_unresolved():
    daily = bars(
        {"timestamp": "2026-08-28", "Open": 100, "High": 103, "Low": 92, "Close": 94},
    )
    result = resolve_position(position(), pd.DataFrame(), daily, date(2026, 8, 28), 5)
    assert result.status == "unresolved"
    assert result.reason == "missing_post_entry_intraday_evidence"


def test_post_entry_gap_through_stop_fills_at_open():
    daily = bars(
        {"timestamp": "2026-08-29", "Open": 90, "High": 92, "Low": 88, "Close": 91},
    )
    result = resolve_position(position(), pd.DataFrame(), daily, date(2026, 8, 29), 5)
    assert (result.status, result.exit_price) == ("loss", 90.0)


def test_unresolved_rows_do_not_affect_stats_or_slots():
    rows = [
        {**position(symbol="WIN", status="win"), "exit": 110, "exit_date": "2026-08-29", "ret_pct": 10.0},
        {**position(symbol="AMB", status="unresolved"), "resolution_reason": "missing_post_entry_intraday_evidence"},
        position(symbol="OPEN"),
    ]
    snapshot = build_portfolio_snapshot(
        rows, quote_loader=lambda market, symbol: 102.0,
        market_date=date(2026, 8, 29), slots=10, weight=0.10,
    )
    assert snapshot["stats"]["closed"] == 1
    assert snapshot["stats"]["unresolved"] == 1
    assert snapshot["stats"]["open"] == 1
    assert snapshot["stats"]["win_rate"] == 100.0
    assert [row["symbol"] for row in snapshot["unresolved"]] == ["AMB"]
```

- [ ] **Step 2: Run the tests and observe the expected RED failure**

Run from the repository root:

```powershell
rtk python -m pytest api/test_signal_portfolio.py -q
```

Expected: collection fails with `ModuleNotFoundError: No module named 'api.signal_model.portfolio'`.

- [ ] **Step 3: Implement the deterministic portfolio module**

Create `api/signal_model/portfolio.py` with immutable results, timestamp filtering, conservative bar ordering, gap-aware fills, ambiguous-entry handling, time stops, and aggregation:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Callable, Iterable, Mapping

import pandas as pd


FINAL_STATUSES = frozenset({"win", "loss", "closed"})
UNRESOLVED_STATUS = "unresolved"


@dataclass(frozen=True)
class Resolution:
    status: str
    exit_price: float | None
    exit_date: str
    reason: str | None = None


def _bar_resolution(side: str, stop: float, target: float, row) -> tuple[str, float] | None:
    op, hi, lo = float(row["Open"]), float(row["High"]), float(row["Low"])
    if side == "LONG":
        if op <= stop: return "loss", op
        if lo <= stop: return "loss", stop
        if op >= target: return "win", op
        if hi >= target: return "win", target
    else:
        if op >= stop: return "loss", op
        if hi >= stop: return "loss", stop
        if op <= target: return "win", op
        if lo <= target: return "win", target
    return None


def resolve_position(position: Mapping, intraday_bars: pd.DataFrame,
                     daily_bars: pd.DataFrame, market_date: date,
                     max_hold_days: int) -> Resolution | None:
    side = str(position["side"])
    stop, target = float(position["stop"]), float(position["target"])
    entry_day = datetime.strptime(position["entry_date"], "%Y-%m-%d").date()
    signal_at = pd.Timestamp(position["signal_at"]) if position.get("signal_at") else None

    if signal_at is not None and intraday_bars is not None and not intraday_bars.empty:
        for timestamp, row in intraday_bars.sort_index().iterrows():
            if pd.Timestamp(timestamp) < signal_at:
                continue
            result = _bar_resolution(side, stop, target, row)
            if result:
                return Resolution(result[0], round(result[1], 2), pd.Timestamp(timestamp).strftime("%Y-%m-%d"))

    entry_row = None
    if daily_bars is not None and not daily_bars.empty:
        for timestamp, row in daily_bars.sort_index().iterrows():
            day = pd.Timestamp(timestamp).date()
            if day == entry_day:
                entry_row = row
                continue
            if day < entry_day:
                continue
            result = _bar_resolution(side, stop, target, row)
            if result:
                return Resolution(result[0], round(result[1], 2), day.isoformat())

    if (intraday_bars is None or intraday_bars.empty) and entry_row is not None:
        close = float(entry_row["Close"])
        contradicted = close <= stop or close >= target if side == "LONG" else close >= stop or close <= target
        if contradicted:
            return Resolution(UNRESOLVED_STATUS, None, entry_day.isoformat(),
                              "missing_post_entry_intraday_evidence")

    if (market_date - entry_day).days >= max_hold_days and daily_bars is not None and not daily_bars.empty:
        last = daily_bars.sort_index().iloc[-1]
        return Resolution("closed", round(float(last["Close"]), 2), market_date.isoformat(), "time_stop")
    return None


def build_portfolio_snapshot(rows: Iterable[Mapping], quote_loader: Callable[[str, str], float | None],
                             market_date: date, slots: int, weight: float) -> dict:
    rows = list(rows)
    opened = [dict(row) for row in rows if row["status"] == "open"]
    unresolved = [dict(row) for row in rows if row["status"] == UNRESOLVED_STATUS]
    closed = [dict(row) for row in rows if row["status"] in FINAL_STATUSES]
    open_out, unrealized = [], 0.0
    for row in opened:
        current = quote_loader(row["market"], row["symbol"]) or float(row["entry"])
        direction = 1 if row["side"] == "LONG" else -1
        unreal = (current - float(row["entry"])) / float(row["entry"]) * 100 * direction
        unrealized += weight * unreal
        open_out.append({**row, "current": round(current, 2), "unreal_pct": round(unreal, 2),
                         "days_held": (market_date - datetime.strptime(row["entry_date"], "%Y-%m-%d").date()).days,
                         "weight_pct": round(weight * 100)})
    wins = [row for row in closed if float(row.get("ret_pct") or 0) > 0]
    losses = [row for row in closed if float(row.get("ret_pct") or 0) <= 0]
    realized = sum(weight * float(row.get("ret_pct") or 0) for row in closed)
    stats = {
        "closed": len(closed), "wins": len(wins), "losses": len(losses),
        "unresolved": len(unresolved), "open": len(open_out), "slots": slots,
        "win_rate": round(len(wins) / len(closed) * 100, 1) if closed else None,
        "realized_pct": round(realized, 2), "unrealized_pct": round(unrealized, 2),
        "total_pct": round(realized + unrealized, 2),
    }
    curve, cumulative = [], 0.0
    for row in sorted(closed, key=lambda item: (item.get("exit_date") or "", item.get("id", 0))):
        cumulative += weight * float(row.get("ret_pct") or 0)
        curve.append({"date": (row.get("exit_date") or "")[:10], "cum_pct": round(cumulative, 2)})
    return {"stats": stats, "open": open_out, "closed": list(reversed(closed))[:50],
            "unresolved": unresolved, "equity_curve": curve}
```

- [ ] **Step 4: Run the focused tests and observe GREEN**

Run:

```powershell
rtk python -m pytest api/test_signal_portfolio.py -q
```

Expected: `5 passed`.

- [ ] **Step 5: Refactor without behavior changes and commit**

Run the focused test again after formatting/naming cleanup, then:

```powershell
rtk git add api/signal_model/portfolio.py api/test_signal_portfolio.py
rtk git commit -m "fix: make signal portfolio outcomes evidence-aware"
```

---

### Task 2: Persist Unresolved Outcomes and Integrate the Extracted Module

**Files:**
- Modify: `api/main.py:5835-7369`
- Modify: `api/test_signal_tracking.py`

**Interfaces:**
- Consumes: Task 1 `resolve_position()` and `build_portfolio_snapshot()`.
- Produces: database rows with optional `resolution_reason`; `/api/signals/portfolio` payload with `unresolved`; compatibility wrappers `_resolve_signal_positions()` and `_signal_portfolio_snapshot()` retained for existing callers during this phase.

- [ ] **Step 1: Replace the old entry-day skip regression with failing integration tests**

In `api/test_signal_tracking.py`, keep the existing post-entry daily and gap tests, replace `test_resolve_skips_entry_day`, and add snapshot/endpoint assertions:

```python
def test_entry_day_close_beyond_stop_without_intraday_becomes_unresolved(monkeypatch):
    conn = _reset()
    ed = (datetime.now(IST).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    _insert(conn, symbol="SAME", side="LONG", entry=100, stop=95, target=110,
            entry_date=ed, signal_at=f"{ed}T10:15:00+05:30")
    _patch_yf(monkeypatch, _fake_hist([(ed, 100, 103, 92, 94)]))
    monkeypatch.setattr(main, "_pf_intraday_bars", lambda row: None)
    assert main._resolve_signal_positions(conn) == 1
    row = conn.execute("SELECT status, resolution_reason FROM signal_positions WHERE symbol='SAME'").fetchone()
    assert tuple(row) == ("unresolved", "missing_post_entry_intraday_evidence")


def test_snapshot_excludes_unresolved_from_performance_and_slots(monkeypatch):
    rows = [
        {"market": "IN", "symbol": "AMB", "side": "LONG", "kind": "f", "score": 70,
         "entry": 100, "stop": 95, "target": 110, "entry_date": "2026-08-28",
         "status": "unresolved", "resolution_reason": "missing_post_entry_intraday_evidence",
         "source": "live_engine", "model_version": "test-v1"},
    ]
    snap = main._signal_portfolio_snapshot(rows)
    assert snap["stats"]["closed"] == 0
    assert snap["stats"]["open"] == 0
    assert snap["stats"]["unresolved"] == 1
    assert snap["unresolved"][0]["symbol"] == "AMB"


def test_portfolio_endpoint_exposes_unresolved_group(monkeypatch):
    _reset()
    monkeypatch.setattr(main, "_resolve_signal_positions", lambda conn: 0)
    main.API_CACHE.pop("signal_portfolio_IN", None)
    payload = client.get("/api/signals/portfolio?market=IN").json()
    assert "unresolved" in payload
    assert "unresolved" in payload["stats"]
```

- [ ] **Step 2: Run the integration tests and observe RED**

Run:

```powershell
rtk python -m pytest api/test_signal_tracking.py -q
```

Expected: failures for the absent `resolution_reason` column and absent `unresolved` payload.

- [ ] **Step 3: Add the migration and wire the extracted service**

In `_auth_db()` schema initialization, add an idempotent migration:

```python
try:
    conn.execute("ALTER TABLE signal_positions ADD COLUMN resolution_reason TEXT")
except sqlite3.OperationalError as exc:
    if "duplicate column name" not in str(exc).lower():
        raise
```

Import the Task 1 functions with the existing package/fallback import pattern. Add `_pf_intraday_bars(row)` using `yf.Ticker(symbol).history(interval="5m", start=entry_date, end=next_calendar_day, auto_adjust=True)` and return a DataFrame or `None`. Update `_resolve_signal_positions()` to call `resolve_position()`, persist `status`, `exit`, `exit_date`, `ret_pct`, and `resolution_reason`, and calculate `ret_pct` only when `exit_price` is not `None`. Keep `_signal_portfolio_snapshot(rows)` as a wrapper that injects `_yf_quote_change`, `_market_date`, `SIGNAL_PF_SLOTS`, and `SIGNAL_PF_WEIGHT` into `build_portfolio_snapshot()` and then restores the existing extended segmentation fields.

- [ ] **Step 4: Run focused backend integration tests and observe GREEN**

Run:

```powershell
rtk python -m pytest api/test_signal_tracking.py api/test_signal_portfolio.py -q
```

Expected: all focused tests pass with no warnings.

- [ ] **Step 5: Commit the integration slice**

```powershell
rtk git add api/main.py api/test_signal_tracking.py
rtk git commit -m "fix: persist unresolved signal outcomes"
```

---

### Task 3: Add Data Status and Fail-Closed Publication

**Files:**
- Create: `api/test_signal_data_status.py`
- Modify: `api/main.py:4194-4235,5271-5420`

**Interfaces:**
- Produces: `build_signal_data_status(...) -> dict`; `_apply_signal_quality_gate(..., data_status=None)`; `/api/signals.data_status`.
- The status object has `status`, `observed_at`, `market_session`, `sources`, `required_inputs_complete`, and `warnings`.

- [ ] **Step 1: Write failing status and gate tests**

Create `api/test_signal_data_status.py`:

```python
from api import main


PLAN = {"symbol": "TEST", "side": "LONG", "score": 80, "coverage_pct": 100}


def test_weekend_latest_session_is_valid_last_session():
    status = main.build_signal_data_status(
        market_open=False, market_note="weekend", observed_at="2026-08-28T15:40:07+05:30",
        sources=["NSE"], required={"price": True, "open_interest": True},
        latest_completed_session="2026-08-28", expected_latest_session="2026-08-28",
    )
    assert status["status"] == "last_session"
    assert status["required_inputs_complete"] is True


def test_missing_required_input_rejects_every_plan():
    status = {"status": "provider_limited", "required_inputs_complete": False,
              "warnings": ["open_interest_unavailable"]}
    published, rejected, quality = main._apply_signal_quality_gate([PLAN], data_status=status)
    assert published == []
    assert rejected[0]["rejection_reasons"] == ["inputs_incomplete"]
    assert quality["rejection_counts"] == {"inputs_incomplete": 1}


def test_stale_session_rejects_every_plan():
    status = {"status": "stale", "required_inputs_complete": True,
              "warnings": ["latest_completed_session_missing"]}
    published, rejected, quality = main._apply_signal_quality_gate([PLAN], data_status=status)
    assert published == []
    assert rejected[0]["rejection_reasons"] == ["stale_inputs"]


def test_market_signals_payload_contains_status(monkeypatch):
    monkeypatch.setattr(main, "_signals_market_open", lambda: (False, "weekend"))
    main.API_CACHE.clear()
    payload = main._json_safe({"data_status": main.build_signal_data_status(
        False, "weekend", "2026-08-28T15:40:07+05:30", ["NSE"],
        {"price": True, "open_interest": True}, "2026-08-28", "2026-08-28")})
    assert payload["data_status"]["status"] == "last_session"
```

- [ ] **Step 2: Run the status tests and observe RED**

Run:

```powershell
rtk python -m pytest api/test_signal_data_status.py -q
```

Expected: failures because `build_signal_data_status` and the `data_status` gate argument do not exist.

- [ ] **Step 3: Implement the status builder and gate**

Add this pure builder near `_apply_signal_quality_gate`:

```python
def build_signal_data_status(market_open, market_note, observed_at, sources,
                             required, latest_completed_session, expected_latest_session):
    warnings = []
    missing = sorted(name for name, available in required.items() if not available)
    if missing:
        warnings.extend(f"{name}_unavailable" for name in missing)
        status = "provider_limited"
    elif latest_completed_session != expected_latest_session:
        warnings.append("latest_completed_session_missing")
        status = "stale"
    else:
        status = "fresh" if market_open else "last_session"
    return {
        "status": status,
        "observed_at": observed_at,
        "market_session": "open" if market_open else f"closed_{market_note}",
        "sources": sorted(set(source for source in sources if source)),
        "required_inputs_complete": not missing,
        "warnings": warnings,
    }
```

Extend `_apply_signal_quality_gate` with `data_status=None`. When status is absent, treat it as provider-limited at API publication call sites; direct unit callers that omit it preserve the current score/coverage-only behavior. When provided, append `inputs_incomplete` or `stale_inputs` before score and coverage reasons, deduplicating in order. Build the India status from futures-radar price/OI availability and `buildup_ts`; build the US status from its corresponding timestamp and provider flags. Put the status in every Signals response before applying the gate.

- [ ] **Step 4: Run the focused Signals backend suite and observe GREEN**

Run:

```powershell
rtk python -m pytest api/test_signal_data_status.py api/test_main.py api/test_us_signals.py api/test_signal_levels.py -q
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the trust-envelope slice**

```powershell
rtk git add api/main.py api/test_signal_data_status.py
rtk git commit -m "feat: fail closed on incomplete signal inputs"
```

---

### Task 4: Build Frontend Trust Components and Pure View Logic

**Files:**
- Create: `web/src/lib/signalView.js`
- Create: `web/src/lib/signalView.test.js`
- Create: `web/src/components/DataStatus.jsx`
- Create: `web/src/components/CollapsibleSection.jsx`
- Create: `web/src/components/SignalSetupCards.jsx`

**Interfaces:**
- Produces: `normalizeDataStatus(raw)`, `signalEmptyState(data)`, `<DataStatus status />`, `<CollapsibleSection id title defaultOpen>`, and `<SignalSetupCards plans currency market />`.

- [ ] **Step 1: Write failing pure view tests**

Create `web/src/lib/signalView.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDataStatus, signalEmptyState } from './signalView.js';

test('missing status fails closed as provider limited', () => {
  assert.deepEqual(normalizeDataStatus(undefined), {
    status: 'provider_limited', observed_at: null, market_session: 'unknown',
    sources: [], required_inputs_complete: false,
    warnings: ['status_unavailable'],
  });
});

test('incomplete inputs explain why there is no actionable setup', () => {
  const copy = signalEmptyState({
    setups: { plans: [] },
    data_status: { status: 'provider_limited', required_inputs_complete: false,
      warnings: ['open_interest_unavailable'] },
  });
  assert.equal(copy.title, 'No qualifying setup — inputs incomplete');
  assert.match(copy.detail, /open interest unavailable/i);
});

test('a valid empty radar remains a normal no-setup state', () => {
  const copy = signalEmptyState({
    setups: { plans: [] },
    data_status: { status: 'last_session', required_inputs_complete: true, warnings: [] },
  });
  assert.equal(copy.title, 'No qualifying setup');
});
```

- [ ] **Step 2: Run and observe RED**

Run from `web`:

```powershell
rtk node --test src/lib/signalView.test.js
```

Expected: collection fails because `signalView.js` does not exist.

- [ ] **Step 3: Implement the pure helper and accessible components**

Create `signalView.js` with exact normalization and warning-label conversion. Implement `DataStatus.jsx` as a `<section aria-label="Signal data status">` with a visible state pill, `<time dateTime>`, source summary, and a `<details>` warnings disclosure. Implement `CollapsibleSection.jsx` with a native `<details>` element so keyboard and no-JavaScript behavior are inherent. Implement `SignalSetupCards.jsx` with `Link` targets `/chart?symbol=${encodeURIComponent(plan.symbol)}`, visible `Quality Score`, entry/stop/target, data timestamp, and no probability language.

- [ ] **Step 4: Run helper tests and component lint**

Run:

```powershell
rtk node --test src/lib/signalView.test.js
rtk npx eslint src/lib/signalView.js src/components/DataStatus.jsx src/components/CollapsibleSection.jsx src/components/SignalSetupCards.jsx
```

Expected: tests and ESLint exit 0.

- [ ] **Step 5: Commit the frontend trust primitives**

```powershell
rtk git add src/lib/signalView.js src/lib/signalView.test.js src/components/DataStatus.jsx src/components/CollapsibleSection.jsx src/components/SignalSetupCards.jsx
rtk git commit -m "feat: add signal trust presentation primitives"
```

---

### Task 5: Recompose Signals and Track Record for Mobile

**Files:**
- Modify: `web/src/pages/MarketSignals.jsx`
- Modify: `web/src/pages/MarketSignals.css`
- Modify: `web/src/pages/TrackRecord.jsx`
- Modify: `web/src/components/SignalsPortfolio.jsx`
- Create: `web/src/lib/trustUsabilityContract.test.js`

**Interfaces:**
- Consumes: Task 4 components and Task 2/3 API fields.
- Produces: trust-first mobile order, collapsed analytical details, unresolved track-record group, and honest sample/cost labels.

- [ ] **Step 1: Write failing source-contract tests**

Create `web/src/lib/trustUsabilityContract.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Signals leads with trust state and setup cards', () => {
  const signals = source('../pages/MarketSignals.jsx');
  assert.match(signals, /<DataStatus status=\{data\.data_status\}/);
  assert.match(signals, /<SignalSetupCards/);
  assert.doesNotMatch(signals, />Conviction</);
  assert.match(signals, /Quality Score/);
});

test('mobile-only detail surfaces use accessible disclosures', () => {
  const signals = source('../pages/MarketSignals.jsx');
  for (const title of ['Volatility forecast', 'Options intelligence', 'Futures buildups', 'Index option structures', 'Current model portfolio']) {
    assert.match(signals, new RegExp(`title="${title}"`));
  }
  assert.match(signals, /<CollapsibleSection/);
});

test('Track Record separates unresolved rows and labels small samples', () => {
  const track = source('../pages/TrackRecord.jsx');
  assert.match(track, /unresolved/);
  assert.match(track, /Needs resolution/);
  assert.match(track, /Small forward sample/);
  assert.match(track, /Gross of verified costs/);
});
```

- [ ] **Step 2: Run the contracts and observe RED**

Run from `web`:

```powershell
rtk node --test src/lib/trustUsabilityContract.test.js
```

Expected: all three tests fail on missing components/copy.

- [ ] **Step 3: Recompose Market Signals**

Import Task 4 units. Render `DataStatus` immediately after `PageHeader`, followed by `SignalSetupCards` or `signalEmptyState(data)`, then the compact regime grid. Add a `.signals-section-jumps` navigation linking to `#signal-regime`, `#signal-volatility`, `#signal-options`, `#signal-buildups`, and `#signal-portfolio`. Wrap the five detail groups in `CollapsibleSection`; use CSS to render their `<summary>` hidden and content always open above 850px, while mobile defaults closed. Remove every user-facing `Conviction` string and replace it with `Quality Score`.

- [ ] **Step 4: Add responsive cards and honest Track Record presentation**

In `MarketSignals.css`, add a one-column `.signal-setup-cards` layout below 650px, minimum 14px explanatory copy, 12px metadata floors, 44px disclosure summaries, and `.desktop-detail-open` behavior above 850px. In `TrackRecord.jsx`, destructure `unresolved = []`, show `Small forward sample · N/100` while `stats.forward.closed < 100`, show `Gross of verified costs` when no net-cost flag exists, and render unresolved rows in a separate DataTable with symbol, side, entry date, and reason. Update `SignalsPortfolio.jsx` to use responsive labelled rows on mobile and show the same sample warning.

- [ ] **Step 5: Run focused frontend tests, lint, and build**

Run from `web`:

```powershell
rtk node --test src/lib/signalView.test.js src/lib/trustUsabilityContract.test.js src/lib/signalsPortfolioContract.test.js src/lib/marketSignalsOrderContract.test.js src/lib/decisionCockpitContract.test.js
rtk npx eslint src/pages/MarketSignals.jsx src/pages/TrackRecord.jsx src/components/SignalsPortfolio.jsx src/components/DataStatus.jsx src/components/CollapsibleSection.jsx src/components/SignalSetupCards.jsx src/lib/signalView.js
rtk npm run build
```

Expected: tests, ESLint, and build exit 0.

- [ ] **Step 6: Commit the responsive Signals slice**

```powershell
rtk git add src/pages/MarketSignals.jsx src/pages/MarketSignals.css src/pages/TrackRecord.jsx src/components/SignalsPortfolio.jsx src/lib/trustUsabilityContract.test.js
rtk git commit -m "feat: make Signals trust-first on mobile"
```

---

### Task 6: Add Privacy-Safe Activation Measurement and First-Run Workflow

**Files:**
- Create: `api/analytics_events.py`
- Create: `api/test_analytics_events.py`
- Modify: `api/main.py:5770-5900,7720-7835`
- Create: `web/src/lib/productAnalytics.js`
- Create: `web/src/lib/productAnalytics.test.js`
- Create: `web/src/components/FirstRunWorkflow.jsx`
- Modify: `web/src/pages/Dashboard.jsx`
- Modify: `web/src/pages/Dashboard.css`
- Modify: `web/src/components/SettingsSheet.jsx`

**Interfaces:**
- Backend: `record_event(conn, payload, now)`, `delete_device(conn, device_id)`, `aggregate_activation(conn, now)`; `POST /api/analytics/events`; `DELETE /api/analytics/device`; admin payload `activation`.
- Frontend: `trackProductEvent(name, fields={})`, `resetProductAnalytics()`, `<FirstRunWorkflow />`.

- [ ] **Step 1: Write failing backend privacy tests**

Create `api/test_analytics_events.py` with a temporary SQLite connection and tests that accepted events persist only allowlisted fields, symbol/query/email/token fields raise `ValueError`, retention removes rows older than 90 days, reset deletes only one device, and aggregation reports funnel counts plus 1-day/7-day return cohorts. Use this exact accepted payload:

```python
ACCEPTED = {
    "event": "analyse_loaded",
    "device_id": "7d1c74ef-8da5-4a78-9eab-8f35145d172f",
    "occurred_at": "2026-08-29T04:30:00Z",
    "route": "/chart",
    "market": "IN",
}
```

Assert the allowlist is exactly:

```python
{"today_viewed", "analyse_loaded", "position_sizing_completed",
 "watchlist_intent_started", "watchlist_saved", "alerts_enabled", "return_visit"}
```

- [ ] **Step 2: Run backend analytics tests and observe RED**

```powershell
rtk python -m pytest api/test_analytics_events.py -q
```

Expected: collection fails because `api.analytics_events` does not exist.

- [ ] **Step 3: Implement backend analytics storage and routes**

Create `analytics_events.py` with `ensure_schema()` for an `analytics_events(id, event, device_id, occurred_at, route, market, created_at)` table and indexes on `(event, occurred_at)` and `(device_id, occurred_at)`. Validate UUID device IDs, exact event names, route against `{ "/", "/dashboard", "/chart", "/position-sizing", "/watchlist", "/signals" }`, and market against `{ "IN", "US", "" }`. Reject unknown keys rather than ignoring them. Delete rows older than 90 days on bounded writes. Compute aggregate counts and device-based return cohorts without returning raw identifiers. Add Pydantic request models and the two routes in `main.py`; merge `aggregate_activation()` into the owner-only admin metrics payload.

- [ ] **Step 4: Write failing frontend scrubber tests**

Create `web/src/lib/productAnalytics.test.js`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventPayload } from './productAnalytics.js';

test('analytics payload strips query, symbol, identity, and tokens', () => {
  const payload = buildEventPayload('analyse_loaded', {
    route: '/chart?symbol=RELIANCE', market: 'IN', symbol: 'RELIANCE',
    email: 'person@example.com', token: 'secret',
  }, '7d1c74ef-8da5-4a78-9eab-8f35145d172f', new Date('2026-08-29T04:30:00Z'));
  assert.deepEqual(payload, {
    event: 'analyse_loaded', device_id: '7d1c74ef-8da5-4a78-9eab-8f35145d172f',
    occurred_at: '2026-08-29T04:30:00.000Z', route: '/chart', market: 'IN',
  });
});
```

- [ ] **Step 5: Run frontend analytics tests and observe RED**

From `web`:

```powershell
rtk node --test src/lib/productAnalytics.test.js
```

Expected: collection fails because `productAnalytics.js` does not exist.

- [ ] **Step 6: Implement the non-blocking client and first-run ladder**

Implement `buildEventPayload` as a pure allowlist/scrubber. Generate a random UUID with `crypto.randomUUID()`, store it under `alphanova_analytics_device_id`, and return `null` when storage or UUID generation is unavailable. `trackProductEvent` uses `fetch('/api/analytics/events', {method:'POST', headers:{'Content-Type':'application/json'}, body, keepalive:true})` behind a 1500ms `AbortController`; it catches every failure. `resetProductAnalytics` sends the DELETE request, removes the local ID and first-run state, and returns a boolean.

Create `FirstRunWorkflow.jsx` with four links/actions: choose a displayed mover or search, Analyse, Position Sizing, save/alerts. Store completed step keys under `alphanova_first_run_v1`; storage failures remain in component state. Integrate it only into the empty-watchlist branch of Today. Emit the seven approved events at their real completion points, never with a symbol field. Add a Settings button labelled `Reset anonymous product analytics` that calls the reset helper and reports success/failure in an aria-live region.

- [ ] **Step 7: Run focused backend/frontend tests and commit**

Run:

```powershell
rtk python -m pytest api/test_analytics_events.py api/test_admin_metrics.py -q
Set-Location web
rtk node --test src/lib/productAnalytics.test.js src/lib/decisionCockpitContract.test.js src/lib/signedInAccountUxContract.test.js
rtk npx eslint src/lib/productAnalytics.js src/components/FirstRunWorkflow.jsx src/pages/Dashboard.jsx src/components/SettingsSheet.jsx
Set-Location ..
```

Expected: all commands exit 0. Then commit:

```powershell
rtk git add api/analytics_events.py api/test_analytics_events.py api/main.py web/src/lib/productAnalytics.js web/src/lib/productAnalytics.test.js web/src/components/FirstRunWorkflow.jsx web/src/pages/Dashboard.jsx web/src/pages/Dashboard.css web/src/components/SettingsSheet.jsx
rtk git commit -m "feat: add privacy-safe activation workflow"
```

---

### Task 7: Enforce Readability and Persistent Compliance Access

**Files:**
- Modify: `web/src/components/Disclaimer.jsx`
- Modify: `web/src/index.css`
- Modify: `web/src/lib/trustUsabilityContract.test.js`

**Interfaces:**
- Produces: acknowledged compact notice with a reopen action; 14px body and 12px metadata floors on the modified Signals/Today/Track Record surfaces.

- [ ] **Step 1: Add failing compliance/readability contracts**

Append to `trustUsabilityContract.test.js`:

```javascript
test('acknowledged compliance notice remains reopenable', () => {
  const disclaimer = source('../components/Disclaimer.jsx');
  assert.match(disclaimer, /Educational analytics/);
  assert.match(disclaimer, /View notice/);
  assert.match(disclaimer, /setDismissed\(false\)/);
  assert.match(disclaimer, /localStorage/);
});

test('essential explanatory text has explicit readability floors', () => {
  const css = source('../index.css') + source('../pages/MarketSignals.css') + source('../pages/Dashboard.css');
  assert.match(css, /--font-body-min:\s*14px/);
  assert.match(css, /--font-meta-min:\s*12px/);
  assert.match(css, /line-height:\s*1\.4/);
});
```

- [ ] **Step 2: Run and observe RED**

From `web`:

```powershell
rtk node --test src/lib/trustUsabilityContract.test.js
```

Expected: the two new tests fail.

- [ ] **Step 3: Implement persistent notice access and typography tokens**

Change `Disclaimer.jsx` to use `localStorage` key `alphanova_disclaimer_acknowledged_v1`. The compact state renders:

```jsx
<div className="disclaimer-mini">
  <span>Educational analytics — not investment advice.</span>
  <button type="button" className="disclaimer-view" onClick={() => setDismissed(false)}>
    View notice
  </button>
</div>
```

If acknowledgement storage fails, keep the full notice visible by setting dismissed only after a successful write. Add `--font-body-min: 14px` and `--font-meta-min: 12px` to root tokens. Apply them to explanatory copy on Signals, Today, Track Record, first-run guidance, and compliance text with `line-height: 1.4` or higher. Keep monospace on `.tnum`, levels, timestamps, and compact codes only.

- [ ] **Step 4: Run frontend contracts, accessibility-focused lint, and build**

```powershell
rtk node --test src/lib/trustUsabilityContract.test.js src/lib/signedInAccountUxContract.test.js src/lib/decisionCockpitContract.test.js
rtk npx eslint src/components/Disclaimer.jsx src/components/SettingsSheet.jsx src/pages/MarketSignals.jsx src/pages/TrackRecord.jsx src/pages/Dashboard.jsx
rtk npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the readability slice**

```powershell
rtk git add src/components/Disclaimer.jsx src/index.css src/lib/trustUsabilityContract.test.js
rtk git commit -m "feat: improve Alpha Nova readability and notice access"
```

---

### Task 8: Full Local Verification and Browser Evidence

**Files:**
- Verify only; modify source only if a failing regression requires a new RED → GREEN cycle.

**Interfaces:**
- Produces: fresh automated, build, dependency, whitespace, desktop, and mobile evidence. Produces no deployment.

- [ ] **Step 1: Run complete backend verification**

From repository root:

```powershell
rtk python -m pytest api -q --ignore=api/test_live.py
rtk python -m compileall -q api
```

Expected: zero failures and exit code 0.

- [ ] **Step 2: Run complete frontend verification**

From `web`:

```powershell
rtk node --test src/**/*.test.js
rtk npm run lint
rtk npm run build
rtk npm audit --audit-level=high
```

Expected: zero test/lint/build failures and zero high-or-critical vulnerabilities.

- [ ] **Step 3: Run repository integrity checks**

From repository root:

```powershell
rtk git diff --check
rtk git status --short
```

Expected: no whitespace errors; status contains only intended Alpha Nova files plus the pre-existing unrelated untracked paths.

- [ ] **Step 4: Start the local API and frontend**

Use separate hidden/background terminals:

```powershell
rtk python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
```

From `web`:

```powershell
rtk npm run dev -- --host 127.0.0.1 --port 5173
```

Wait for both health endpoints before browser checks.

- [ ] **Step 5: Verify desktop and mobile user flows**

With a named browser session, check 1440x1000 and 390x844:

1. Today with an empty watchlist shows the four-step workflow without an auth wall.
2. Selecting a mover opens its Analyse route; Position Sizing remains reachable.
3. Signals shows status, setup/no-setup state, and regime within two mobile viewports.
4. Five detail disclosures expand and collapse with keyboard input.
5. Track Record shows unresolved rows separately and displays small-sample/cost labels.
6. A provider-limited fixture yields no setup and names the missing input.
7. Watchlist and alert intent still return to the originating URL.
8. Acknowledging and reopening the compliance notice works after reload.
9. Analytics reset changes the anonymous device ID without affecting auth or watchlist data.
10. `document.documentElement.scrollWidth === document.documentElement.clientWidth` at both sizes; console contains no errors.

- [ ] **Step 6: Run live-provider tests against the local API**

From repository root while the local API is running:

```powershell
rtk python -m pytest api/test_live.py -q
```

Expected: provider-dependent results are recorded exactly; any provider failure blocks a completion claim and is reported as external rather than hidden.

- [ ] **Step 7: Review requirements and create the final local commit**

Re-read `docs/superpowers/specs/2026-08-29-alpha-nova-trust-and-usability-design.md`, map every Phase Completion Criterion to automated or browser evidence, and inspect:

```powershell
rtk git diff HEAD~7 --stat
rtk git log -8 --oneline
```

If all gates pass, do not deploy. Report the local commit sequence, test counts, browser sizes, unresolved limitations, and the explicit statement that production remains unchanged.

