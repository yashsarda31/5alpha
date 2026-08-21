# Alpha Nova Calibrated Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a leakage-resistant, probability-gated two-to-five-session signal system that publishes every qualified setup while targeting at least a 55% net forward win rate at net reward-to-risk of at least 1:1.

**Architecture:** Keep the existing scanners as candidate generators, but move v3 execution, features, persistence, offline training, JSON artifacts and live probability scoring into a focused `api/signal_model` package. Build and validate the offline dataset first. Continue into live integration only for a market whose locked out-of-sample report passes every release gate; otherwise stop with evidence and leave production behaviour unchanged.

**Tech Stack:** Python 3.11+, FastAPI, SQLite, pandas, NumPy, scikit-learn 1.9.0 for offline training only, JSON runtime artifacts, pytest, React 19, Vite 8, Node's built-in test runner.

## Global Constraints

- Target at least 55% net wins over at least 100 out-of-sample published trades per market.
- Every published trade must have net reward-to-risk greater than or equal to 1.0.
- Resolve at stop, target or the fifth trading-session close; ambiguous daily bars resolve stop-first.
- Publish every candidate above the approved probability threshold; do not impose a daily quota.
- India and US models, thresholds, reports and release decisions remain independent.
- Historical validation, shadow outcomes, forward outcomes, reconstructed backfill and legacy outcomes must never share one headline statistic.
- The v3 service fails closed on stale data, schema mismatch, missing artifact or checksum failure; it never silently falls back to v2.1.
- scikit-learn remains an offline-only dependency and must not be added to `api/requirements.txt` or the Vercel runtime bundle.
- Existing `/api/signals` and `/api/signals/portfolio` routes remain compatible.
- Preserve unrelated dirty and untracked workspace files.
- Do not deploy without a separate explicit user request; run all local verification before any later deployment.

## Scope gate

Tasks 1-6 build the measurement and validation foundation. Task 6 is a hard gate:

- If neither market passes, stop. Commit the reproducible research code and reports, report the failed metrics, and do not implement Tasks 7-10.
- If one market passes, implement Tasks 7-10 only for that market while leaving the other market in `NO SIGNAL` for v3.
- If both pass, implement Tasks 7-10 for both independently.

## File map

**Create:**

- `api/signal_model/__init__.py` — stable public interfaces for the package.
- `api/signal_model/contracts.py` — immutable candidate, plan, outcome and artifact contracts.
- `api/signal_model/costs.py` — date-aware statutory costs plus conservative slippage assumptions.
- `api/signal_model/execution.py` — cost-aware plan construction and five-session resolution.
- `api/signal_model/features.py` — one point-in-time feature schema shared by replay and live scoring.
- `api/signal_model/ledger.py` — SQLite schema and append/update lifecycle operations.
- `api/signal_model/replay.py` — EOD candidate reconstruction and labeled-dataset generation.
- `api/signal_model/providers.py` — bounded official archive and daily-bar readers used by replay.
- `api/signal_model/training.py` — purged splits, logistic model, calibration and JSON export.
- `api/signal_model/validation.py` — release metrics, baselines and hard-gate evaluation.
- `api/signal_model/runtime.py` — dependency-light JSON artifact loading and scoring.
- `api/signal_model/monitor.py` — rolling results, pause state and drift checks.
- `api/requirements-train.txt` — offline training dependency set.
- `api/scripts/__init__.py` — makes the research CLIs runnable from the repository root.
- `api/scripts/build_signal_dataset.py` — reproducible dataset CLI.
- `api/scripts/train_signal_model.py` — training/report/artifact CLI.
- `api/test_signal_execution_v3.py`
- `api/test_signal_costs_v3.py`
- `api/test_signal_features_v3.py`
- `api/test_signal_ledger_v3.py`
- `api/test_signal_replay_v3.py`
- `api/test_signal_training_v3.py`
- `api/test_signal_validation_v3.py`
- `api/test_signal_runtime_v3.py`
- `api/test_signal_monitor_v3.py`
- `web/src/lib/calibratedSignalsView.js` — display-state and probability-band helpers.
- `web/src/lib/calibratedSignalsContract.test.js`

**Modify conditionally after Task 6 passes:**

- `api/main.py:4080-5268` — invoke the approved v3 scorer without changing market-context payloads.
- `api/main.py:5618-5752` — initialize the v3 ledger and model-state tables.
- `api/main.py:5880-5917` — add protected v3 capture/activation endpoints.
- `api/main.py:6604-7193` — serve current-model forward tracking separately from legacy data.
- `api/requirements.txt` — no scikit-learn; only update if a small runtime dependency becomes unavoidable.
- `vercel.json:2-11` — add capture/activation schedules only after a model passes and local endpoint tests pass.
- `web/src/pages/MarketSignals.jsx:298-369` — render pending/active calibrated setups and fail-closed states.
- `web/src/pages/MarketSignals.css` — probability, freshness and state styling.
- `web/src/components/SignalsPortfolio.jsx` — show all active v3 signals without a ten-slot claim.
- `web/src/pages/TrackRecord.jsx:88-172` — make current-model forward results the headline and label other segments.
- `web/src/lib/signalsPortfolioContract.test.js` — update source contracts for v3 fields and copy.

---

### Task 1: Domain contracts and deterministic execution policy

**Files:**

- Create: `api/signal_model/__init__.py`
- Create: `api/signal_model/contracts.py`
- Create: `api/signal_model/costs.py`
- Create: `api/signal_model/execution.py`
- Create: `api/test_signal_execution_v3.py`
- Create: `api/test_signal_costs_v3.py`

**Interfaces:**

- Produces: `CandidateSnapshot`, `ExecutionPlan`, `Outcome`, `SessionBar`, `ExecutionPolicy`.
- Produces: `build_execution_plan(candidate, next_open, policy, round_trip_cost_pct) -> ExecutionPlan`; the candidate carries its precomputed barrier.
- Produces: `resolve_outcome(plan, bars, round_trip_cost_pct) -> Outcome | None`.
- Produces: `round_trip_cost_pct(market, session_date) -> float` with an explicit effective-date schedule.
- Consumes: no application globals or network data.

- [ ] **Step 1: Write failing contract and execution tests**

```python
# api/test_signal_execution_v3.py
from datetime import date

from api.signal_model.contracts import CandidateSnapshot, ExecutionPolicy, SessionBar
from api.signal_model.execution import build_execution_plan, resolve_outcome


def candidate(side="LONG"):
    return CandidateSnapshot(
        candidate_id="IN|2026-08-20|ABC|LONG",
        market="IN", symbol="ABC", side=side, kind="long_buildup",
        session_date=date(2026, 8, 20), observed_at="2026-08-20T15:45:00+05:30",
        reference_entry=100.0, atr14=4.0, session_low=98.0, session_high=103.0,
        barrier_price=108.0 if side == "LONG" else 92.0,
        features={}, data_as_of={},
    )


def test_long_plan_is_net_one_to_one_after_costs():
    plan = build_execution_plan(candidate(), next_open=100.0,
                                policy=ExecutionPolicy(), round_trip_cost_pct=0.20)
    assert plan.status == "active"
    assert plan.stop == 96.0
    assert plan.rr_net >= 1.0
    assert plan.target > 104.0


def test_chased_gap_expires_instead_of_moving_levels():
    plan = build_execution_plan(candidate(), next_open=101.1,
                                policy=ExecutionPolicy(), round_trip_cost_pct=0.20)
    assert plan.status == "expired"
    assert plan.reason == "chased_open"


def test_ambiguous_daily_bar_resolves_stop_first():
    plan = build_execution_plan(candidate(), 100.0, ExecutionPolicy(), 0.20)
    bar = SessionBar(date(2026, 8, 21), 100.0, plan.target + 1, plan.stop - 1, 101.0)
    out = resolve_outcome(plan, [bar], round_trip_cost_pct=0.20)
    assert out.status == "loss"
    assert out.exit_price == plan.stop


def test_fifth_session_time_exit_uses_net_result():
    plan = build_execution_plan(candidate(), 100.0, ExecutionPolicy(), 0.20)
    bars = [SessionBar(date(2026, 8, 21 + i), 100, 103, 97, 100.5) for i in range(5)]
    out = resolve_outcome(plan, bars, round_trip_cost_pct=0.20)
    assert out.status == "win"
    assert out.reason == "time_exit"
    assert out.net_return_pct > 0
```

- [ ] **Step 2: Run the tests and verify the missing package failure**

Run: `rtk python -m pytest api/test_signal_execution_v3.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: No module named 'api.signal_model'`.

- [ ] **Step 3: Add immutable contracts**

```python
# api/signal_model/contracts.py
from dataclasses import dataclass
from datetime import date
from typing import Literal

Side = Literal["LONG", "SHORT"]


@dataclass(frozen=True)
class CandidateSnapshot:
    candidate_id: str
    market: str
    symbol: str
    side: Side
    kind: str
    session_date: date
    observed_at: str
    reference_entry: float
    atr14: float
    session_low: float
    session_high: float
    barrier_price: float | None
    features: dict[str, float]
    data_as_of: dict[str, str]


@dataclass(frozen=True)
class ExecutionPolicy:
    atr_multiple: float = 1.0
    max_chase_r: float = 0.25
    max_hold_sessions: int = 5
    tick_size: float = 0.05


@dataclass(frozen=True)
class ExecutionPlan:
    candidate_id: str
    status: Literal["active", "expired"]
    side: Side
    entry: float | None
    stop: float | None
    target: float | None
    risk: float | None
    rr_net: float | None
    max_hold_sessions: int
    reason: str


@dataclass(frozen=True)
class SessionBar:
    session_date: date
    open: float
    high: float
    low: float
    close: float


@dataclass(frozen=True)
class Outcome:
    status: Literal["win", "loss"]
    reason: Literal["target", "stop", "time_exit"]
    exit_price: float
    exit_date: date
    gross_return_pct: float
    net_return_pct: float
```

- [ ] **Step 4: Implement plan construction and conservative resolution**

```python
# api/signal_model/execution.py
from .contracts import CandidateSnapshot, ExecutionPlan, ExecutionPolicy, Outcome, SessionBar


def build_execution_plan(candidate: CandidateSnapshot, next_open: float,
                         policy: ExecutionPolicy, round_trip_cost_pct: float) -> ExecutionPlan:
    direction = 1 if candidate.side == "LONG" else -1
    base_risk = candidate.atr14 * policy.atr_multiple
    swing_risk = ((next_open - candidate.session_low + policy.tick_size)
                  if direction == 1 else
                  (candidate.session_high - next_open + policy.tick_size))
    risk = max(base_risk, swing_risk)
    chase = direction * (next_open - candidate.reference_entry)
    if risk <= 0 or chase > policy.max_chase_r * risk:
        return ExecutionPlan(candidate.candidate_id, "expired", candidate.side,
                             None, None, None, None, None,
                             policy.max_hold_sessions, "chased_open")
    stop = next_open - direction * risk
    cost_amount = next_open * round_trip_cost_pct / 100.0
    target_distance = risk + 2.0 * cost_amount
    target = next_open + direction * target_distance
    if candidate.barrier_price is not None:
        room = direction * (candidate.barrier_price - next_open)
        if 0 < room < target_distance:
            return ExecutionPlan(candidate.candidate_id, "expired", candidate.side,
                                 None, None, None, None, None,
                                 policy.max_hold_sessions, "insufficient_1r_room")
    rr_net = (target_distance - cost_amount) / (risk + cost_amount)
    return ExecutionPlan(candidate.candidate_id, "active", candidate.side,
                         round(next_open, 2), round(stop, 2), round(target, 2),
                         round(risk, 4), round(rr_net, 4), policy.max_hold_sessions, "qualified")
```

Add this resolver in the same file:

```python
def resolve_outcome(plan, bars, round_trip_cost_pct):
    if plan.status != "active":
        return None
    direction = 1 if plan.side == "LONG" else -1

    def finish(price, bar, reason):
        gross = direction * (price - plan.entry) / plan.entry * 100.0
        net = gross - round_trip_cost_pct
        return Outcome("win" if net > 0 else "loss", reason, round(price, 2),
                       bar.session_date, round(gross, 4), round(net, 4))

    eligible = list(bars)[:plan.max_hold_sessions]
    for bar in eligible:
        if direction == 1:
            if bar.open <= plan.stop:
                return finish(bar.open, bar, "stop")
            if bar.low <= plan.stop:
                return finish(plan.stop, bar, "stop")
            if bar.open >= plan.target:
                return finish(bar.open, bar, "target")
            if bar.high >= plan.target:
                return finish(plan.target, bar, "target")
        else:
            if bar.open >= plan.stop:
                return finish(bar.open, bar, "stop")
            if bar.high >= plan.stop:
                return finish(plan.stop, bar, "stop")
            if bar.open <= plan.target:
                return finish(bar.open, bar, "target")
            if bar.low <= plan.target:
                return finish(plan.target, bar, "target")
    if len(eligible) == plan.max_hold_sessions:
        return finish(eligible[-1].close, eligible[-1], "time_exit")
    return None
```

- [ ] **Step 5: Run the focused tests**

Before running, add cost-boundary coverage:

```python
# api/test_signal_costs_v3.py
from datetime import date

from api.signal_model.costs import round_trip_cost_pct


def test_india_futures_stt_change_is_date_correct():
    before = round_trip_cost_pct("IN", date(2026, 3, 31))
    after = round_trip_cost_pct("IN", date(2026, 4, 1))
    assert round(after - before, 6) == 0.03


def test_cost_envelope_is_conservative_and_market_specific():
    assert round_trip_cost_pct("IN", date(2026, 8, 22)) >= 0.17
    assert round_trip_cost_pct("US", date(2026, 8, 22)) == 0.10
```

Implement the schedule in `api/signal_model/costs.py`:

```python
from datetime import date

OTHER_ROUND_TRIP_BPS = {"IN": 12.0, "US": 10.0}


def round_trip_cost_pct(market, session_date):
    if market == "IN":
        # Futures STT on the sell leg: 0.02% through 2026-03-31,
        # 0.05% from 2026-04-01. Other costs include a conservative
        # slippage/brokerage/exchange/GST/stamp envelope.
        stt_bps = 5.0 if session_date >= date(2026, 4, 1) else 2.0
        return (OTHER_ROUND_TRIP_BPS["IN"] + stt_bps) / 100.0
    if market == "US":
        return OTHER_ROUND_TRIP_BPS["US"] / 100.0
    raise ValueError("unsupported_market")
```

Run: `rtk python -m pytest api/test_signal_execution_v3.py api/test_signal_costs_v3.py -q`

Expected: `6 passed`.

- [ ] **Step 6: Commit the execution-policy unit**

```powershell
rtk git add -- api/signal_model/__init__.py api/signal_model/contracts.py api/signal_model/costs.py api/signal_model/execution.py api/test_signal_execution_v3.py api/test_signal_costs_v3.py
rtk git commit -m "feat: add deterministic v3 signal execution policy"
```

---

### Task 2: Point-in-time feature builder

**Files:**

- Create: `api/signal_model/features.py`
- Create: `api/test_signal_features_v3.py`

**Interfaces:**

- Consumes: completed daily bars through `session_date`, candidate-side OI/volume values and market context.
- Produces: `FEATURE_SCHEMA_V1: tuple[str, ...]`.
- Produces: `build_feature_row(candidate_row, history, context, session_date) -> dict[str, float]`.
- Produces: `validate_feature_row(features) -> tuple[bool, list[str]]`.

- [ ] **Step 1: Write leakage and normalization tests**

```python
# api/test_signal_features_v3.py
import pandas as pd

from api.signal_model.features import FEATURE_SCHEMA_V1, build_feature_row


def history():
    idx = pd.bdate_range("2026-06-01", periods=45)
    close = pd.Series(range(100, 145), index=idx, dtype=float)
    return pd.DataFrame({"open": close - 1, "high": close + 2,
                         "low": close - 2, "close": close,
                         "volume": range(1000, 1045), "oi": range(2000, 2045)})


def test_future_rows_do_not_change_point_in_time_features():
    bars = history()
    cutoff = bars.index[34].date()
    row = {"side": "LONG", "price_change_pct": 1.2, "oi_change_pct": 8.0,
           "volume": 1034, "delivery_change_pct": 3.0}
    context = {"index_return_pct": 0.4, "sector_return_pct": 0.2,
               "breadth_pct": 58.0, "vix_percentile": 0.45, "regime": 1.0}
    before = build_feature_row(row, bars.iloc[:35], context, cutoff)
    mutated = pd.concat([bars.iloc[:35], bars.iloc[35:].assign(close=9999)])
    after = build_feature_row(row, mutated, context, cutoff)
    assert before == after
    assert tuple(before) == FEATURE_SCHEMA_V1


def test_features_are_side_aligned_and_scale_free():
    bars = history()
    cutoff = bars.index[-1].date()
    long = build_feature_row({"side": "LONG", "price_change_pct": 2,
                              "oi_change_pct": 10, "volume": 1044,
                              "delivery_change_pct": 2}, bars, {
                                  "index_return_pct": 1, "sector_return_pct": 0.5,
                                  "breadth_pct": 60, "vix_percentile": 0.45, "regime": 1}, cutoff)
    short = build_feature_row({**{"side": "SHORT", "price_change_pct": -2,
                                 "oi_change_pct": 10, "volume": 1044,
                                 "delivery_change_pct": -2}}, bars, {
                                     "index_return_pct": -1, "sector_return_pct": -0.5,
                                     "breadth_pct": 40, "vix_percentile": 0.45, "regime": -1}, cutoff)
    assert long["side_return_atr"] > 0
    assert short["side_return_atr"] > 0
```

- [ ] **Step 2: Verify the tests fail because the feature module is absent**

Run: `rtk python -m pytest api/test_signal_features_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.features`.

- [ ] **Step 3: Implement the frozen v1 schema**

```python
# api/signal_model/features.py
FEATURE_SCHEMA_V1 = (
    "side_return_atr", "oi_change_percentile", "volume_percentile",
    "close_location", "rsi14_side", "distance_sma20_atr",
    "relative_strength_index", "relative_strength_sector",
    "delivery_side", "breadth_side", "vix_percentile",
    "regime_alignment",
)


def _percentile_last(series):
    clean = series.dropna()
    if clean.empty:
        return float("nan")
    return float((clean <= clean.iloc[-1]).mean())


def build_feature_row(candidate_row, history, context, session_date):
    eligible = history.loc[history.index.date <= session_date].copy()
    if len(eligible) < 30:
        raise ValueError("insufficient_history")
    direction = 1.0 if candidate_row["side"] == "LONG" else -1.0
    # Calculate Wilder ATR(14), RSI(14), rolling OI/volume percentiles and the
    # remaining schema fields only from `eligible`; return keys in schema order.
    values = _feature_values(candidate_row, eligible, context, direction)
    return {name: float(values[name]) for name in FEATURE_SCHEMA_V1}
```

Add the following helpers above `build_feature_row`:

```python
import math

import pandas as pd


def _wilder_atr(frame, periods=14):
    previous = frame.close.shift(1)
    true_range = pd.concat([
        frame.high - frame.low,
        (frame.high - previous).abs(),
        (frame.low - previous).abs(),
    ], axis=1).max(axis=1)
    return true_range.ewm(alpha=1 / periods, adjust=False).mean()


def _rsi(close, periods=14):
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / periods, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / periods, adjust=False).mean()
    return 100 - 100 / (1 + gain / loss.replace(0, 1e-12))


def _feature_values(candidate, frame, context, direction):
    atr = float(_wilder_atr(frame).iloc[-1])
    close = float(frame.close.iloc[-1])
    atr_pct = atr / close * 100.0
    oi_change = frame.oi.pct_change().replace([float("inf"), float("-inf")], pd.NA)
    volume_rank = _percentile_last(frame.volume.tail(60))
    oi_history = pd.concat([oi_change.tail(59), pd.Series([candidate["oi_change_pct"] / 100])])
    day_range = max(float(frame.high.iloc[-1] - frame.low.iloc[-1]), 1e-12)
    location = float((frame.close.iloc[-1] - frame.low.iloc[-1]) / day_range)
    rsi = float(_rsi(frame.close).iloc[-1])
    sma20 = float(frame.close.tail(20).mean())
    return {
        "side_return_atr": direction * candidate["price_change_pct"] / atr_pct,
        "oi_change_percentile": _percentile_last(oi_history),
        "volume_percentile": volume_rank,
        "close_location": location if direction > 0 else 1.0 - location,
        "rsi14_side": direction * (rsi - 50.0) / 50.0,
        "distance_sma20_atr": direction * (close - sma20) / atr,
        "relative_strength_index": direction * (
            candidate["price_change_pct"] - context["index_return_pct"]),
        "relative_strength_sector": direction * (
            candidate["price_change_pct"] - context["sector_return_pct"]),
        "delivery_side": direction * candidate["delivery_change_pct"],
        "breadth_side": direction * (context["breadth_pct"] - 50.0) / 50.0,
        "vix_percentile": context["vix_percentile"],
        "regime_alignment": direction * context["regime"],
    }


def validate_feature_row(features):
    reasons = []
    if tuple(features) != FEATURE_SCHEMA_V1:
        reasons.append("feature_schema_mismatch")
    if any(not math.isfinite(float(value)) for value in features.values()):
        reasons.append("non_finite_feature")
    return not reasons, reasons
```

Historical context creation calculates `vix_percentile` from the last 252 completed VIX sessions before calling this function.

- [ ] **Step 4: Run focused feature tests**

Run: `rtk python -m pytest api/test_signal_features_v3.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Commit the feature unit**

```powershell
rtk git add -- api/signal_model/features.py api/test_signal_features_v3.py
rtk git commit -m "feat: add point-in-time signal features"
```

---

### Task 3: Append-only candidate ledger

**Files:**

- Create: `api/signal_model/ledger.py`
- Create: `api/test_signal_ledger_v3.py`
- Modify after focused tests pass: `api/main.py:5618-5752`

**Interfaces:**

- Consumes: SQLite connection and `CandidateSnapshot`/scoring dictionaries.
- Produces: `ensure_schema(conn) -> None`.
- Produces: `append_candidate(conn, candidate, raw_inputs, state="candidate", source="historical_replay") -> bool`.
- Produces: `transition_candidate(conn, candidate_id, from_state, to_state, **fields) -> bool`.
- Produces: `list_current_model_rows(conn, market, model_version) -> list[dict]`.

- [ ] **Step 1: Write schema, idempotency and lifecycle tests**

```python
# api/test_signal_ledger_v3.py
import sqlite3

from api.signal_model.ledger import append_candidate, ensure_schema, transition_candidate


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)
    return conn


def snapshot():
    from datetime import date
    from api.signal_model.contracts import CandidateSnapshot
    return CandidateSnapshot(
        candidate_id="IN|2026-08-20|ABC|LONG", market="IN", symbol="ABC",
        side="LONG", kind="long_buildup", session_date=date(2026, 8, 20),
        observed_at="2026-08-20T15:45:00+05:30", reference_entry=100.0,
        atr14=4.0, session_low=98.0, session_high=103.0,
        barrier_price=108.0, features={"side_return_atr": 1.0},
        data_as_of={"fo": "2026-08-20"},
    )


def test_candidate_insert_is_append_only_and_idempotent():
    candidate_snapshot = snapshot()
    conn = db()
    assert append_candidate(conn, candidate_snapshot, {"price": 100}) is True
    assert append_candidate(conn, candidate_snapshot, {"price": 999}) is False
    row = conn.execute("SELECT * FROM signal_candidates_v3").fetchone()
    assert row["reference_entry"] == 100
    assert conn.execute("SELECT COUNT(*) FROM signal_candidates_v3").fetchone()[0] == 1


def test_transition_requires_expected_previous_state():
    candidate_snapshot = snapshot()
    conn = db()
    append_candidate(conn, candidate_snapshot, {})
    assert transition_candidate(conn, candidate_snapshot.candidate_id,
                                "candidate", "rejected",
                                rejection_reasons=["low_probability"]) is True
    assert transition_candidate(conn, candidate_snapshot.candidate_id,
                                "candidate", "active") is False
```

- [ ] **Step 2: Verify the tests fail for the missing ledger**

Run: `rtk python -m pytest api/test_signal_ledger_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.ledger`.

- [ ] **Step 3: Implement the v3 tables and transactional transitions**

```python
# api/signal_model/ledger.py
SCHEMA = """
CREATE TABLE IF NOT EXISTS signal_candidates_v3 (
  candidate_id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  kind TEXT NOT NULL,
  session_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  state TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  features_json TEXT NOT NULL,
  data_as_of_json TEXT NOT NULL,
  reference_entry REAL NOT NULL,
  atr14 REAL NOT NULL,
  session_low REAL NOT NULL,
  session_high REAL NOT NULL,
  barrier_price REAL,
  probability REAL,
  threshold REAL,
  model_version TEXT,
  feature_schema TEXT NOT NULL,
  rejection_reasons TEXT NOT NULL DEFAULT '[]',
  entry REAL, stop REAL, target REAL, rr_net REAL,
  activation_date TEXT, expiry_date TEXT,
  exit REAL, exit_date TEXT, net_return_pct REAL, outcome TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sigv3_market_state
ON signal_candidates_v3(market, state, session_date);

CREATE TABLE IF NOT EXISTS signal_model_state (
  market TEXT PRIMARY KEY,
  model_version TEXT,
  mode TEXT NOT NULL DEFAULT 'off',
  paused INTEGER NOT NULL DEFAULT 0,
  pause_reason TEXT,
  updated_at TEXT NOT NULL
);
"""


def ensure_schema(conn):
    conn.executescript(SCHEMA)
```

Add stable JSON and guarded write helpers:

```python
import json
from datetime import datetime, timezone


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def append_candidate(conn, candidate, raw_inputs, state="candidate", source="historical_replay"):
    now = datetime.now(timezone.utc).isoformat()
    values = (
        candidate.candidate_id, candidate.market, candidate.symbol, candidate.side,
        candidate.kind, candidate.session_date.isoformat(), candidate.observed_at,
        state, _json(raw_inputs), _json(candidate.features), _json(candidate.data_as_of),
        candidate.reference_entry, candidate.atr14, candidate.session_low,
        candidate.session_high, candidate.barrier_price, "features-v1", source,
        now, now,
    )
    sql = """INSERT OR IGNORE INTO signal_candidates_v3
      (candidate_id,market,symbol,side,kind,session_date,observed_at,state,
       raw_json,features_json,data_as_of_json,reference_entry,atr14,session_low,
       session_high,barrier_price,feature_schema,source,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
    return conn.execute(sql, values).rowcount == 1


_TRANSITION_COLUMNS = {
    "rejection_reasons", "probability", "threshold", "model_version",
    "entry", "stop", "target", "rr_net", "activation_date", "expiry_date",
    "exit", "exit_date", "net_return_pct", "outcome",
}


def transition_candidate(conn, candidate_id, from_state, to_state, **fields):
    unknown = set(fields) - _TRANSITION_COLUMNS
    if unknown:
        raise ValueError(f"unsupported_transition_fields:{sorted(unknown)}")
    normalized = {key: (_json(value) if key == "rejection_reasons" else value)
                  for key, value in fields.items()}
    normalized["state"] = to_state
    normalized["updated_at"] = datetime.now(timezone.utc).isoformat()
    assignments = ",".join(f"{key}=?" for key in normalized)
    values = [*normalized.values(), candidate_id, from_state]
    sql = f"UPDATE signal_candidates_v3 SET {assignments} WHERE candidate_id=? AND state=?"
    return conn.execute(sql, values).rowcount == 1
```

Tests use the default `historical_replay`; live capture passes `shadow` or `forward` explicitly.

- [ ] **Step 4: Integrate schema creation into `_auth_db`**

```python
# api/main.py near existing local/package fallback imports
try:
    from api.signal_model.ledger import ensure_schema as ensure_signal_model_schema
except ImportError:
    from signal_model.ledger import ensure_schema as ensure_signal_model_schema

# at the end of _auth_db(), before return
ensure_signal_model_schema(conn)
```

- [ ] **Step 5: Run ledger and existing tracking tests**

Run: `rtk python -m pytest api/test_signal_ledger_v3.py api/test_signal_tracking.py -q`

Expected: all tests pass.

- [ ] **Step 6: Commit the ledger unit**

```powershell
rtk git add -- api/signal_model/ledger.py api/test_signal_ledger_v3.py api/main.py
rtk git commit -m "feat: add append-only calibrated signal ledger"
```

---

### Task 4: Reproducible historical replay and labeled dataset

**Files:**

- Create: `api/signal_model/providers.py`
- Create: `api/signal_model/replay.py`
- Create: `api/scripts/__init__.py`
- Create: `api/scripts/build_signal_dataset.py`
- Create: `api/test_signal_replay_v3.py`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: completed official/session data and Tasks 1-2.
- Produces: `reconstruct_india_candidates(fo_rows, session_date) -> list[dict]` without a score threshold.
- Produces: `replay_market(sessions, contexts, cost_schedule, market) -> pandas.DataFrame`.
- Produces: gzip CSV with one row per candidate plus a JSON manifest containing source hashes and date coverage.

- [ ] **Step 1: Write candidate completeness and label tests**

```python
# api/test_signal_replay_v3.py
from datetime import date

from api.signal_model.replay import reconstruct_india_candidates, replay_market


def test_reconstruction_keeps_every_directional_candidate(fo_rows):
    rows = reconstruct_india_candidates(fo_rows, date(2026, 8, 20))
    assert {(r["symbol"], r["side"]) for r in rows} == {
        ("LONGOI", "LONG"), ("SHORTOI", "SHORT"), ("COVER", "LONG")
    }
    assert all("legacy_score" not in row or row["legacy_score"] >= 0 for row in rows)


def test_replay_enters_next_session_and_labels_after_costs(replay_sessions):
    frame = replay_market(replay_sessions, {}, lambda market, day: 0.20, "IN")
    row = frame.loc[frame.symbol == "LONGOI"].iloc[0]
    assert row.entry_date > row.session_date
    assert row.hold_sessions <= 5
    assert row.label in (0, 1)
    assert row.label == int(row.net_return_pct > 0)
```

Build `fo_rows` and `replay_sessions` fixtures entirely from synthetic dictionaries and daily bars so this test never uses the network.

- [ ] **Step 2: Verify missing replay failures**

Run: `rtk python -m pytest api/test_signal_replay_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.replay`.

- [ ] **Step 3: Extract bounded provider functions**

Move the reusable logic from `_fetch_fo_bhavcopy` into `api/signal_model/providers.py` as:

```python
def fetch_india_fo_session(session_date, cache_dir, http_get=requests.get):
    """Return normalized near-month stock-future rows; cache the immutable archive."""


def fetch_daily_bars(symbols, start, end, market, downloader=yf.download):
    """Return split/corporate-action-adjusted daily OHLCV indexed by symbol/date."""
```

Use bounded retries, explicit `User-Agent`, per-file SHA-256 hashes and immutable cache filenames under `data/signals_v3/raw/`.

- [ ] **Step 4: Implement replay without publication filtering**

```python
# api/signal_model/replay.py
def reconstruct_india_candidates(fo_rows, session_date):
    candidates = []
    for row in fo_rows:
        px = row["price_change_pct"]
        oi = row["oi_change_pct"]
        if px > 0 and oi > 0:
            side, kind = "LONG", "long_buildup"
        elif px < 0 and oi > 0:
            side, kind = "SHORT", "short_buildup"
        elif px > 0 and oi < 0:
            side, kind = "LONG", "short_covering"
        else:
            continue
        candidates.append({**row, "side": side, "kind": kind,
                           "session_date": session_date.isoformat()})
    return candidates
```

`replay_market` must call `build_feature_row`, `build_execution_plan` and `resolve_outcome` from Tasks 1-2. It must retain execution rejections as rows with `eligible=0` and a stable reason, and label only active plans.

- [ ] **Step 5: Add the dataset CLI and local-data exclusion**

```python
# api/scripts/build_signal_dataset.py
def main():
    args = parse_args()
    frame, manifest = build_dataset(args.market, args.start, args.end, args.cache_dir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False, compression="gzip")
    output.with_suffix(".manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
```

Add `data/signals_v3/` to `.gitignore` even though `data/` is already ignored, documenting the intentional local-only research cache.

- [ ] **Step 6: Run replay tests and a five-session smoke dataset**

Run: `rtk python -m pytest api/test_signal_execution_v3.py api/test_signal_features_v3.py api/test_signal_replay_v3.py -q`

Expected: all focused tests pass.

Run: `rtk python -m api.scripts.build_signal_dataset --market IN --start 2026-08-03 --end 2026-08-10 --output data/signals_v3/in-smoke.csv.gz`

Expected: exit 0; manifest reports the requested range, at least one retrieved trading session, source hashes, candidate count and labeled count. If official archives are unavailable, report the exact dates/statuses and fix the provider before continuing.

- [ ] **Step 7: Commit the replay unit without generated data**

```powershell
rtk git add -- .gitignore api/signal_model/providers.py api/signal_model/replay.py api/scripts/__init__.py api/scripts/build_signal_dataset.py api/test_signal_replay_v3.py
rtk git commit -m "feat: add reproducible signal replay dataset"
```

---

### Task 5: Purged training, calibration and safe JSON artifacts

**Files:**

- Create: `api/requirements-train.txt`
- Create: `api/signal_model/training.py`
- Create: `api/test_signal_training_v3.py`

**Interfaces:**

- Consumes: labeled dataframe from Task 4 and `FEATURE_SCHEMA_V1`.
- Produces: `purged_walk_forward_splits(dates, train_months=18, validation_months=3, test_months=3, embargo_sessions=5)`.
- Produces: `split_locked_holdout(frame, months=6) -> tuple[development, holdout]` before any model selection.
- Produces: `fit_calibrated_logistic(train, validation, feature_names, regularization_c=0.25) -> dict`.
- Produces: pure JSON artifact with scaler, coefficients, logistic intercept, Platt coefficients, schema, threshold, date ranges and checksum.

- [ ] **Step 1: Add the offline-only dependency file**

```text
# api/requirements-train.txt
-r requirements.txt
scikit-learn==1.9.0
```

Install only in the dedicated local training environment:

Run: `rtk python -m pip install -r api/requirements-train.txt`

Expected: `scikit-learn 1.9.0` installs successfully. Confirm with `rtk python -c "import sklearn; print(sklearn.__version__)"`, expected `1.9.0`.

- [ ] **Step 2: Write purging, calibration and artifact tests**

```python
# api/test_signal_training_v3.py
import json
import numpy as np
import pandas as pd

from api.signal_model.training import fit_calibrated_logistic, purged_walk_forward_splits


def synthetic_frame():
    rng = np.random.default_rng(48)
    x1 = rng.normal(size=400)
    x2 = rng.normal(size=400)
    probability = 1 / (1 + np.exp(-(0.8 * x1 - 0.4 * x2)))
    return pd.DataFrame({"x1": x1, "x2": x2,
                         "label": (rng.random(400) < probability).astype(int)})


def test_splits_have_five_session_purge_and_embargo():
    dates = pd.bdate_range("2022-01-03", "2025-12-31")
    splits = list(purged_walk_forward_splits(dates))
    assert splits
    for train, validation, test in splits:
        assert dates[validation[0]] - dates[train[-1]] >= pd.Timedelta(days=7)
        assert dates[test[0]] - dates[validation[-1]] >= pd.Timedelta(days=7)


def test_final_six_months_are_locked_out_of_development():
    from api.signal_model.training import split_locked_holdout
    frame = pd.DataFrame({"session_date": pd.bdate_range("2023-01-02", "2025-12-31")})
    development, holdout = split_locked_holdout(frame, months=6)
    assert development.session_date.max() < holdout.session_date.min()
    assert holdout.session_date.min() >= pd.Timestamp("2025-07-01")


def test_exported_artifact_contains_no_pickle_and_is_deterministic():
    frame = synthetic_frame()
    artifact_a = fit_calibrated_logistic(
        frame.iloc[:300], frame.iloc[300:400], ("x1", "x2"))
    artifact_b = fit_calibrated_logistic(
        frame.iloc[:300], frame.iloc[300:400], ("x1", "x2"))
    assert artifact_a == artifact_b
    assert set(artifact_a["model"]) == {"means", "scales", "coefficients", "intercept"}
    assert set(artifact_a["calibration"]) == {"coefficient", "intercept", "method"}
    json.dumps(artifact_a)
```

- [ ] **Step 3: Verify missing training failures**

Run: `rtk python -m pytest api/test_signal_training_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.training`.

- [ ] **Step 4: Implement chronological splits and logistic export**

```python
# api/signal_model/training.py
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


def fit_calibrated_logistic(train, validation, feature_names, regularization_c=0.25):
    scaler = StandardScaler().fit(train[list(feature_names)])
    model = LogisticRegression(C=regularization_c, penalty="l2", solver="lbfgs",
                               max_iter=2000, random_state=48)
    model.fit(scaler.transform(train[list(feature_names)]), train["label"])
    validation_scores = model.decision_function(
        scaler.transform(validation[list(feature_names)]))
    platt = LogisticRegression(C=1e6, solver="lbfgs", random_state=48)
    platt.fit(validation_scores.reshape(-1, 1), validation["label"])
    return {
        "artifact_format": 1,
        "feature_schema": list(feature_names),
        "model": {"means": scaler.mean_.tolist(), "scales": scaler.scale_.tolist(),
                  "coefficients": model.coef_[0].tolist(),
                  "intercept": float(model.intercept_[0])},
        "calibration": {"method": "platt",
                        "coefficient": float(platt.coef_[0][0]),
                        "intercept": float(platt.intercept_[0])},
    }
```

Add stable float rounding before hashing and implement split indexes from market-session dates, not calendar row positions. `split_locked_holdout` runs before feature/model/threshold selection; the holdout is evaluated once by Task 6. Raise an explicit error when a train or calibration split contains one class.

- [ ] **Step 5: Run training tests twice for determinism**

Run: `rtk python -m pytest api/test_signal_training_v3.py -q`

Run the same command a second time: `rtk python -m pytest api/test_signal_training_v3.py -q`

Expected: both runs pass with identical artifact hashes asserted by the test.

- [ ] **Step 6: Commit the training unit**

```powershell
rtk git add -- api/requirements-train.txt api/signal_model/training.py api/test_signal_training_v3.py
rtk git commit -m "feat: add purged calibrated signal training"
```

---

### Task 6: Locked validation report and market release gate

**Files:**

- Create: `api/signal_model/validation.py`
- Create: `api/scripts/train_signal_model.py`
- Create: `api/test_signal_validation_v3.py`
- Create on a passing run: `api/signal_model/artifacts/IN.json` and/or `api/signal_model/artifacts/US.json`
- Create on every full run: `research/signals/reports/IN-signals-v3-calibrated.json`
- Create on every full run: `research/signals/reports/US-signals-v3-calibrated.json`

**Interfaces:**

- Consumes: Tasks 4-5 dataset, folds, probabilities, net outcomes and simple trend baseline.
- Produces: `evaluate_release_gate(predictions, baseline_win_rate, threshold=0.60) -> dict`.
- Produces: `estimate_probability_of_backtest_overfit(configuration_returns) -> float` as a reported CSCV diagnostic.
- Produces: a report whose `release.approved` is true only when all gates pass.
- Produces: an approved runtime artifact only when `release.approved` is true.

- [ ] **Step 1: Write exact boundary tests for every release gate**

```python
# api/test_signal_validation_v3.py
import pandas as pd

from api.signal_model.validation import evaluate_release_gate


def predictions(wins=55, total=100):
    labels = [1] * wins + [0] * (total - wins)
    return pd.DataFrame({
        "probability": [0.60] * total,
        "label": labels,
        "net_return_pct": [1.0 if x else -1.0 for x in labels],
        "rr_net": [1.0] * total,
        "period": [f"p{i // 20}" for i in range(total)],
        "symbol": [f"S{i % 25}" for i in range(total)],
        "sector": [f"SEC{i % 5}" for i in range(total)],
    })


def test_gate_accepts_exact_minimum_when_stability_and_baseline_pass():
    report = evaluate_release_gate(predictions(), baseline_win_rate=0.45)
    assert report["approved"] is True
    assert report["metrics"]["trades"] == 100
    assert report["metrics"]["win_rate"] == 0.55


def test_gate_rejects_54_percent_wins():
    report = evaluate_release_gate(predictions(wins=54), baseline_win_rate=0.45)
    assert report["approved"] is False
    assert "win_rate_below_55pct" in report["failures"]


def test_gate_rejects_fewer_than_100_or_sub_one_rr():
    assert evaluate_release_gate(predictions(total=99, wins=60), 0.45)["approved"] is False
    frame = predictions()
    frame.loc[0, "rr_net"] = 0.99
    assert "rr_below_one" in evaluate_release_gate(frame, 0.45)["failures"]


def test_gate_rejects_probability_calibration_error_above_ten_points():
    frame = predictions()
    frame["probability"] = 0.70
    assert "calibration_error_above_10pct" in evaluate_release_gate(frame, 0.45)["failures"]


def test_pbo_diagnostic_is_bounded():
    from api.signal_model.validation import estimate_probability_of_backtest_overfit
    configurations = pd.DataFrame({
        "cfg_a": [1, -1, 1, -1, 1, -1, 1, -1],
        "cfg_b": [1, 1, -1, -1, 1, 1, -1, -1],
        "cfg_c": [-1, 1, -1, 1, -1, 1, -1, 1],
    })
    value = estimate_probability_of_backtest_overfit(configurations)
    assert 0.0 <= value <= 1.0
```

Extend this file with explicit frames for non-positive expectancy, majority-period failure, symbol/sector concentration and failure to beat the baseline. Each period used by the stability gate contains at least ten trades.

- [ ] **Step 2: Verify missing validation failures**

Run: `rtk python -m pytest api/test_signal_validation_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.validation`.

- [ ] **Step 3: Implement the hard gate**

```python
# api/signal_model/validation.py
RELEASE_LIMITS = {
    "min_trades": 100,
    "min_win_rate": 0.55,
    "min_rr": 1.0,
    "min_probability": 0.60,
    "max_symbol_share": 0.15,
    "max_sector_share": 0.35,
    "max_calibration_error": 0.10,
}


def evaluate_release_gate(predictions, baseline_win_rate, threshold=0.60):
    if threshold < RELEASE_LIMITS["min_probability"]:
        raise ValueError("threshold_below_0.60")
    published = predictions.loc[predictions.probability >= threshold].copy()
    metrics = compute_metrics(published)
    failures = []
    if len(published) < 100:
        failures.append("fewer_than_100_trades")
    if metrics["win_rate"] < 0.55:
        failures.append("win_rate_below_55pct")
    if published.empty or published.rr_net.min() < 1.0:
        failures.append("rr_below_one")
    if metrics["expectancy"] <= 0:
        failures.append("non_positive_expectancy")
    if metrics["eligible_periods_above_50pct"] <= metrics["eligible_periods"] / 2:
        failures.append("unstable_period_win_rate")
    if metrics["win_rate"] <= baseline_win_rate:
        failures.append("did_not_beat_baseline")
    if metrics["calibration_error"] > 0.10:
        failures.append("calibration_error_above_10pct")
    failures.extend(concentration_failures(published))
    return {"approved": not failures, "threshold": threshold,
            "metrics": metrics, "failures": failures}
```

`compute_metrics` must report trades, wins, losses, win rate, Wilson interval, average net return, expectancy, Brier score, log loss, absolute calibration error, maximum symbol/sector share and per-period results. Absolute calibration error is `abs(mean(probability) - mean(label))`; it must not exceed 0.10. An eligible period has at least ten published trades. The report also includes combinatorial-symmetric cross-validation paths and probability of backtest overfitting across the predeclared logistic `C` values `0.10`, `0.25`, `1.00` and thresholds `0.60`, `0.65`, `0.70`; this diagnostic cannot alter the already locked final holdout.

- [ ] **Step 4: Build the CLI with atomic report/artifact behavior**

```python
# api/scripts/train_signal_model.py
def main():
    args = parse_args()
    frame = pd.read_csv(args.dataset, compression="gzip")
    result = run_locked_validation(frame, market=args.market,
                                   model_version=args.model_version)
    report_path = Path(args.report)
    atomic_json_write(report_path, result.report)
    if not result.report["release"]["approved"]:
        print(json.dumps(result.report["release"], indent=2))
        return 2
    atomic_json_write(Path(args.artifact), result.artifact)
    return 0
```

The CLI must refuse to overwrite an approved artifact when the new run fails. It must include dataset-manifest hash, code commit, model/schema versions and exact train/validation/test dates in the report.

Add `--compare-report <path>` for verification runs. It compares dataset hash, fold boundaries, metrics, release decision and artifact checksum against an existing report, ignores only the report-generation timestamp, and exits 3 on any mismatch.

- [ ] **Step 5: Run focused validation tests**

Run: `rtk python -m pytest api/test_signal_training_v3.py api/test_signal_validation_v3.py -q`

Expected: all tests pass.

- [ ] **Step 6: Build the complete three-year datasets**

Run separately:

```powershell
rtk python -m api.scripts.build_signal_dataset --market IN --start 2023-08-01 --end 2026-07-31 --output data/signals_v3/in-20230801-20260731.csv.gz
rtk python -m api.scripts.build_signal_dataset --market US --start 2023-08-01 --end 2026-07-31 --output data/signals_v3/us-20230801-20260731.csv.gz
```

Expected: each successful dataset has at least 36 calendar months of coverage, no duplicate candidate IDs, no feature timestamp after its session date and a nonzero count for each label. If one market lacks defensible point-in-time inputs, mark that market failed in its report rather than substituting current constituents.

- [ ] **Step 7: Run locked validation for each market**

```powershell
rtk python -m api.scripts.train_signal_model --market IN --dataset data/signals_v3/in-20230801-20260731.csv.gz --model-version signals-v3-calibrated-in-1 --report research/signals/reports/IN-signals-v3-calibrated.json --artifact api/signal_model/artifacts/IN.json
rtk python -m api.scripts.train_signal_model --market US --dataset data/signals_v3/us-20230801-20260731.csv.gz --model-version signals-v3-calibrated-us-1 --report research/signals/reports/US-signals-v3-calibrated.json --artifact api/signal_model/artifacts/US.json
```

Expected per market: exit 0 only when the JSON report contains `release.approved=true`; otherwise exit 2 and no artifact is created or replaced.

- [ ] **Step 8: Enforce the scope gate**

Inspect both reports. If neither passes, skip Tasks 7-10 and proceed directly to Task 11 with the failed reports. If one or both pass, record the approved markets in `research/signals/reports/approved-markets.json`:

```json
{
  "approved_markets": ["IN"],
  "evaluated_at": "2026-08-22",
  "required_threshold": 0.60,
  "min_forward_win_rate": 0.55
}
```

The actual `approved_markets` array must match the reports; the example above is valid only when India alone passes.

- [ ] **Step 9: Commit research code, reports and only the passing artifacts**

```powershell
rtk git add -- api/signal_model/validation.py api/scripts/train_signal_model.py api/test_signal_validation_v3.py research/signals/reports
rtk git commit -m "feat: validate calibrated signal models"
```

Before the commit, add `api/signal_model/artifacts/IN.json` only if the India report passed and add `api/signal_model/artifacts/US.json` only if the US report passed. If neither passed, do not run an artifact `git add`. Never stage `data/signals_v3/`.

---

### Task 7: Dependency-light artifact registry and runtime scorer

**Condition:** Execute only for markets approved in Task 6.

**Files:**

- Create: `api/signal_model/runtime.py`
- Create: `api/test_signal_runtime_v3.py`
- Modify: `api/signal_model/__init__.py`

**Interfaces:**

- Consumes: approved JSON artifact and an exact `FEATURE_SCHEMA_V1` feature row.
- Produces: `load_artifact(path, expected_market) -> dict`.
- Produces: `score_probability(artifact, features) -> float` without scikit-learn.
- Produces: `score_candidate(artifact, features) -> {probability, probability_band, qualified, reasons}`.

- [ ] **Step 1: Write parity and fail-closed tests**

```python
# api/test_signal_runtime_v3.py
import json

import pytest

from api.signal_model.runtime import (
    ArtifactError, canonical_checksum, load_artifact, score_probability,
)
from api.signal_model.features import FEATURE_SCHEMA_V1


def artifact():
    size = len(FEATURE_SCHEMA_V1)
    value = {
        "artifact_format": 1, "market": "IN",
        "model_version": "signals-v3-calibrated-in-1",
        "feature_schema": list(FEATURE_SCHEMA_V1), "threshold": 0.60,
        "model": {"means": [0.0] * size, "scales": [1.0] * size,
                  "coefficients": [0.8, -0.4] + [0.0] * (size - 2),
                  "intercept": 0.1},
        "calibration": {"method": "platt", "coefficient": 1.1,
                        "intercept": -0.05},
    }
    raw = 0.1 + 0.8 * 1.0 + (-0.4 * -0.5)
    calibrated = -0.05 + 1.1 * raw
    value["reference_probability"] = 1.0 / (1.0 + __import__("math").exp(-calibrated))
    value["checksum"] = canonical_checksum(value)
    return value


def test_runtime_score_matches_exported_reference(tmp_path):
    valid_artifact = artifact()
    path = tmp_path / "IN.json"
    path.write_text(json.dumps(valid_artifact), encoding="utf-8")
    artifact = load_artifact(path, "IN")
    features = {name: 0.0 for name in FEATURE_SCHEMA_V1}
    features[FEATURE_SCHEMA_V1[0]] = 1.0
    features[FEATURE_SCHEMA_V1[1]] = -0.5
    score = score_probability(artifact, features)
    assert score == pytest.approx(valid_artifact["reference_probability"], abs=1e-12)


def test_checksum_or_schema_mismatch_fails_closed(tmp_path):
    valid_artifact = artifact()
    valid_artifact["feature_schema"] = ["wrong"]
    valid_artifact["checksum"] = canonical_checksum(valid_artifact)
    path = tmp_path / "IN.json"
    path.write_text(json.dumps(valid_artifact), encoding="utf-8")
    with pytest.raises(ArtifactError, match="feature_schema_mismatch"):
        load_artifact(path, "IN")
```

- [ ] **Step 2: Verify the runtime module is missing**

Run: `rtk python -m pytest api/test_signal_runtime_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.runtime`.

- [ ] **Step 3: Implement pure-Python scoring**

```python
# api/signal_model/runtime.py
import hashlib
import json
import math

from .features import FEATURE_SCHEMA_V1


class ArtifactError(RuntimeError):
    pass


def _sigmoid(value):
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exp_value = math.exp(value)
    return exp_value / (1.0 + exp_value)


def score_probability(artifact, features):
    names = artifact["feature_schema"]
    if tuple(features) != tuple(names):
        raise ArtifactError("feature_schema_mismatch")
    model = artifact["model"]
    scaled = [(features[name] - mean) / scale for name, mean, scale in
              zip(names, model["means"], model["scales"])]
    raw = model["intercept"] + sum(c * x for c, x in zip(model["coefficients"], scaled))
    calibration = artifact["calibration"]
    return _sigmoid(calibration["intercept"] + calibration["coefficient"] * raw)


def canonical_checksum(artifact):
    payload = {key: value for key, value in artifact.items() if key != "checksum"}
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                         allow_nan=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_artifact(path, expected_market):
    artifact = json.loads(path.read_text(encoding="utf-8"))
    if artifact.get("checksum") != canonical_checksum(artifact):
        raise ArtifactError("checksum_mismatch")
    if artifact.get("market") != expected_market:
        raise ArtifactError("market_mismatch")
    if tuple(artifact.get("feature_schema", ())) != FEATURE_SCHEMA_V1:
        raise ArtifactError("feature_schema_mismatch")
    if not str(artifact.get("model_version", "")).startswith("signals-v3-calibrated-"):
        raise ArtifactError("model_version_mismatch")
    return artifact
```

Before returning, recursively reject non-finite numeric values. Map probabilities to bands `60-64%`, `65-69%`, and `70%+`.

`score_candidate` calculates each standardized linear contribution as `coefficient * scaled_feature`, returns the three largest positive contributions as `supporting_factors`, and returns the most negative contribution as `contradicting_factor`. It qualifies only finite probabilities at or above the artifact threshold.

- [ ] **Step 4: Run runtime and training-export parity tests**

Run: `rtk python -m pytest api/test_signal_training_v3.py api/test_signal_runtime_v3.py -q`

Expected: all tests pass and runtime probability agrees with the offline reference to `1e-12`.

- [ ] **Step 5: Confirm the Vercel dependency set remains lightweight**

Run: `rtk rg -n "scikit-learn|sklearn" api/requirements.txt requirements.txt api/signal_model/runtime.py`

Expected: no matches. `sklearn` appears only in `api/requirements-train.txt` and `api/signal_model/training.py`, which are not part of this command or the runtime bundle.

- [ ] **Step 6: Commit the runtime scorer**

```powershell
rtk git add -- api/signal_model/__init__.py api/signal_model/runtime.py api/test_signal_runtime_v3.py
rtk git commit -m "feat: add lightweight calibrated signal scorer"
```

---

### Task 8: Shadow capture, activation and API integration

**Condition:** Execute only for markets approved in Task 6.

**Files:**

- Create: `api/test_signal_v3_api.py`
- Modify: `api/main.py:4080-5268`
- Modify: `api/main.py:5880-5917`
- Modify: `vercel.json:2-11` only after local endpoint tests pass

**Interfaces:**

- Consumes: ledger, feature builder, execution policy and approved runtime scorer.
- Produces: protected `GET /api/signals/v3/capture/{market}` after a completed session.
- Produces: protected `GET /api/signals/v3/activate/{market}` after the next official open is available.
- Extends `setups` with `model`, `state`, `plans`, `rejections` and `data_status` while preserving existing market context.

- [ ] **Step 1: Write API tests for shadow, live and fail-closed modes**

```python
# api/test_signal_v3_api.py
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="sigv3_api_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def test_shadow_capture_records_but_does_not_replace_visible_plans(monkeypatch):
    monkeypatch.setenv("SIGNALS_V3_MODE_IN", "shadow")
    monkeypatch.setattr(main, "_capture_v3_market",
                        lambda market: {"mode": "shadow", "captured": 1})
    response = client.get("/api/signals/v3/capture/IN")
    assert response.status_code == 200
    assert response.json()["mode"] == "shadow"
    assert response.json()["captured"] == 1


def test_live_mode_returns_only_approved_model_rows(monkeypatch):
    monkeypatch.setenv("SIGNALS_V3_MODE_IN", "live")
    monkeypatch.setattr(main, "_shadow_v3_gate_passed", lambda market: True)
    monkeypatch.setattr(main, "_v3_visible_payload", lambda market: {
        "state": "active",
        "model": {"version": "signals-v3-calibrated-in-1", "threshold": 0.60},
        "plans": [{"symbol": "ABC", "probability": 0.64}],
        "rejections": [], "data_status": {"fresh": True},
    })
    data = client.get("/api/signals?market=IN").json()
    assert data["setups"]["model"]["version"] == "signals-v3-calibrated-in-1"
    assert data["setups"]["plans"][0]["probability"] == 0.64


def test_missing_artifact_returns_scan_incomplete_not_v21(monkeypatch):
    monkeypatch.setenv("SIGNALS_V3_MODE_IN", "live")
    monkeypatch.setattr(main, "_shadow_v3_gate_passed", lambda market: True)
    monkeypatch.setattr(main, "_v3_visible_payload",
                        lambda market: main._v3_fail_closed_payload("missing_artifact"))
    data = client.get("/api/signals?market=IN").json()
    assert data["setups"]["state"] == "SCAN_INCOMPLETE"
    assert data["setups"]["plans"] == []
```

- [ ] **Step 2: Run the new tests and verify route failures**

Run: `rtk python -m pytest api/test_signal_v3_api.py -q`

Expected: FAIL because the v3 routes and adapters do not exist.

- [ ] **Step 3: Add explicit market modes and adapters**

```python
# api/main.py
def _signal_v3_mode(market):
    value = os.environ.get(f"SIGNALS_V3_MODE_{market}", "off").lower()
    return value if value in {"off", "shadow", "live"} else "off"


def _v3_fail_closed_payload(reason, model_version=None):
    return {"state": "SCAN_INCOMPLETE", "plans": [], "rejections": [],
            "data_status": {"fresh": False, "reason": reason},
            "model": {"version": model_version, "threshold": 0.60}}
```

Capture must persist every raw candidate and score/reject it without entering the legacy `signal_positions` table. Activation must use the official next open, apply the gap/chase and 1R rules, and transition rows atomically from `pending` to `active` or `expired`.

- [ ] **Step 4: Add protected capture and activation routes**

Use the existing `_require_cron` authorization and add:

```python
@app.get("/api/signals/v3/capture/{market_code}")
async def capture_signal_v3(market_code: str, authorization: str = Header(None)):
    _require_cron(authorization)
    market = market_code.upper()
    if market not in {"IN", "US"}:
        raise HTTPException(status_code=400, detail="market must be IN or US")
    if _signal_v3_mode(market) == "off":
        return {"market": market, "status": "skipped", "reason": "v3_off"}
    return await asyncio.to_thread(_capture_v3_market, market)


@app.get("/api/signals/v3/activate/{market_code}")
async def activate_signal_v3(market_code: str, authorization: str = Header(None)):
    _require_cron(authorization)
    market = market_code.upper()
    if market not in {"IN", "US"}:
        raise HTTPException(status_code=400, detail="market must be IN or US")
    if _signal_v3_mode(market) == "off":
        return {"market": market, "status": "skipped", "reason": "v3_off"}
    return await asyncio.to_thread(_activate_v3_market, market)
```

`_capture_v3_market` checks the completed-session date, scores every candidate, and writes pending/rejected rows in one pull/transaction/push cycle. `_activate_v3_market` reads only pending rows for the next market session, fetches the official open once per symbol, and uses guarded transitions so repeated calls are idempotent.

- [ ] **Step 5: Replace visible plans only in explicit live mode**

Wrap the existing setup selection with:

```python
mode = _signal_v3_mode(sig_market)
if mode == "shadow":
    data["setups"]["shadow_model"] = _v3_shadow_summary(sig_market)
elif mode == "live":
    if not _shadow_v3_gate_passed(sig_market):
        data["setups"].update(_v3_fail_closed_payload("shadow_gate_not_passed"))
    else:
        try:
            data["setups"].update(_v3_visible_payload(sig_market))
        except Exception as exc:
            data["setups"].update(_v3_fail_closed_payload(type(exc).__name__))
```

For `off`, do not change `setups`. `_v3_visible_payload` queries only active/pending rows whose market and model version match the approved artifact.

- [ ] **Step 6: Enforce the 20-candidate shadow promotion gate**

Add `shadow_parity_report(conn, market, model_version)` returning `{sample, schema_mismatches, timestamp_violations, level_mismatches, passed}`. Set `passed` only when `sample >= 20` and every mismatch count is zero. Setting either `SIGNALS_V3_MODE_IN=live` or `SIGNALS_V3_MODE_US=live` returns `SCAN_INCOMPLETE` with `shadow_gate_not_passed` until that market's report passes. Mode remains `shadow` by default; changing an environment variable is not itself approval.

- [ ] **Step 7: Run focused and existing API regressions**

Run: `rtk python -m pytest api/test_signal_v3_api.py api/test_main.py api/test_us_signals.py api/test_signal_tracking.py -q`

Expected: all tests pass.

- [ ] **Step 8: Add cron schedules only for approved markets**

Add only the entries belonging to approved markets:

```json
{"path": "/api/signals/v3/capture/IN", "schedule": "0 11 * * 1-5"}
{"path": "/api/signals/v3/activate/IN", "schedule": "0 4 * * 1-5"}
{"path": "/api/signals/v3/capture/US", "schedule": "30 22 * * 1-5"}
{"path": "/api/signals/v3/activate/US", "schedule": "45 14 * * 1-5"}
```

Schedules are UTC. The endpoints must still verify completed-session/open availability, so DST, holidays or duplicate invocations return `skipped` rather than creating a false activation. Do not add entries for failed markets.

- [ ] **Step 9: Commit shadow/API integration**

```powershell
rtk git add -- api/main.py api/test_signal_v3_api.py vercel.json
rtk git commit -m "feat: integrate calibrated signals in shadow mode"
```

---

### Task 9: Forward-only tracking and automatic pause monitor

**Condition:** Execute only for markets approved in Task 6.

**Files:**

- Create: `api/signal_model/monitor.py`
- Create: `api/test_signal_monitor_v3.py`
- Modify: `api/main.py:6604-7193`
- Modify: `api/test_signal_tracking.py`

**Interfaces:**

- Consumes: current-version v3 ledger rows.
- Produces: `forward_snapshot(rows, market, model_version) -> dict`.
- Produces: `evaluate_pause_state(rows, window=30, floor=0.45) -> dict`.
- Produces: `population_stability_index(reference_counts, live_counts) -> float`.
- `/api/signals/portfolio` returns `headline`, `open`, `closed`, `segments`, `model` and `as_of`.

- [ ] **Step 1: Write separation and pause tests**

```python
# api/test_signal_monitor_v3.py
from api.signal_model.monitor import evaluate_pause_state, forward_snapshot


def test_headline_excludes_legacy_backfill_shadow_and_old_versions():
    current = "signals-v3-calibrated-in-1"
    rows = [
        {"market": "IN", "model_version": current, "source": "forward",
         "state": "resolved", "outcome": outcome, "net_return_pct": ret,
         "exit_date": f"2026-08-{20 + i:02d}"}
        for i, (outcome, ret) in enumerate([
            ("win", 1.0), ("win", 1.2), ("win", 0.5), ("loss", -1.0)
        ])
    ]
    rows += [
        {"market": "IN", "model_version": "signals-backfill-eod-v1",
         "source": "backfill_eod", "state": "resolved", "outcome": "loss",
         "net_return_pct": -1.0, "exit_date": "2026-08-10"},
        {"market": "IN", "model_version": current, "source": "shadow",
         "state": "resolved", "outcome": "win", "net_return_pct": 1.0,
         "exit_date": "2026-08-11"},
    ]
    snap = forward_snapshot(rows, "IN", "signals-v3-calibrated-in-1")
    assert snap["headline"]["resolved"] == 4
    assert snap["headline"]["wins"] == 3
    assert snap["headline"]["win_rate"] == 75.0
    assert snap["segments"]["legacy"]["resolved"] > 0


def test_rolling_30_below_45_percent_pauses_new_publication():
    outcomes = ["win"] * 13 + ["loss"] * 17
    rows = [{"outcome": outcome, "exit_date": f"2026-07-{i + 1:02d}"}
            for i, outcome in enumerate(outcomes)]
    state = evaluate_pause_state(rows)
    assert state == {"paused": True, "reason": "rolling_30_win_rate_below_45pct",
                     "sample": 30, "win_rate": 43.3}


def test_material_feature_drift_pauses_publication():
    from api.signal_model.monitor import population_stability_index
    psi = population_stability_index([20, 20, 20, 20, 20], [5, 5, 10, 30, 50])
    assert psi > 0.25
```

- [ ] **Step 2: Verify missing monitor failures**

Run: `rtk python -m pytest api/test_signal_monitor_v3.py -q`

Expected: FAIL with `ModuleNotFoundError: api.signal_model.monitor`.

- [ ] **Step 3: Implement forward snapshots and pause state**

```python
# api/signal_model/monitor.py
def evaluate_pause_state(resolved_rows, window=30, floor=0.45):
    recent = sorted(resolved_rows, key=lambda row: row["exit_date"])[-window:]
    if len(recent) < window:
        return {"paused": False, "reason": None, "sample": len(recent), "win_rate": None}
    win_rate = sum(row["outcome"] == "win" for row in recent) / window
    return {"paused": win_rate < floor,
            "reason": "rolling_30_win_rate_below_45pct" if win_rate < floor else None,
            "sample": window, "win_rate": round(win_rate * 100, 1)}
```

`forward_snapshot` must filter headline rows to `source='forward'`, the requested market and exact current model version. It may return archived segments but never aggregate them into the headline.

Implement population stability index with a `1e-6` floor for empty bins. Pause new publication when any required feature has PSI above 0.25 against the artifact's training bins or when required-feature missingness rises by more than ten percentage points. Persist the exact feature/reason in `signal_model_state.pause_reason`.

- [ ] **Step 4: Integrate resolution and pause persistence**

Reuse the Task 1 resolver for each active v3 row. On resolution, update exit fields and outcome atomically. After each batch, write pause state to `signal_model_state`. Capture endpoints must check `paused=0`; activation and resolution continue while paused.

- [ ] **Step 5: Update the portfolio endpoint contract**

When a market is live on v3, `/api/signals/portfolio?market=IN|US` returns v3 forward data. In shadow/off modes, return the existing payload plus explicit legacy provenance. Load the immutable historical validation summary from the approved artifact into `segments.validation`; never recompute it from live rows. Remove the ten-slot assumption only for v3; every qualified v3 setup is tracked.

- [ ] **Step 6: Run tracking regressions**

Run: `rtk python -m pytest api/test_signal_monitor_v3.py api/test_signal_tracking.py api/test_signal_v3_api.py -q`

Expected: all tests pass.

- [ ] **Step 7: Commit tracking and pause controls**

```powershell
rtk git add -- api/signal_model/monitor.py api/test_signal_monitor_v3.py api/main.py api/test_signal_tracking.py
rtk git commit -m "feat: isolate calibrated signal forward results"
```

---

### Task 10: Signals and Track Record user interface

**Condition:** Execute only for markets approved in Task 6.

**Files:**

- Create: `web/src/lib/calibratedSignalsView.js`
- Create: `web/src/lib/calibratedSignalsContract.test.js`
- Modify: `web/src/pages/MarketSignals.jsx:298-369`
- Modify: `web/src/pages/MarketSignals.css`
- Modify: `web/src/components/SignalsPortfolio.jsx`
- Modify: `web/src/pages/TrackRecord.jsx:88-172`
- Modify: `web/src/lib/signalsPortfolioContract.test.js`

**Interfaces:**

- Consumes: Task 8-9 API fields.
- Produces: clear pending, active, expired, `NO SIGNAL` and `SCAN INCOMPLETE` states.
- Produces: probability band, net 1R levels, model version, freshness, expiry and supporting/contradicting factors.

- [ ] **Step 1: Write display-contract tests first**

```javascript
// web/src/lib/calibratedSignalsContract.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signalStateCopy, probabilityBand } from './calibratedSignalsView.js';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('probability bands use the approved thresholds', () => {
  assert.equal(probabilityBand(0.60), '60–64%');
  assert.equal(probabilityBand(0.65), '65–69%');
  assert.equal(probabilityBand(0.70), '70%+');
});

test('fail-closed copy distinguishes no edge from incomplete data', () => {
  assert.equal(signalStateCopy('NO SIGNAL').title, 'No qualifying setup');
  assert.equal(signalStateCopy('SCAN_INCOMPLETE').title, 'Signal scan incomplete');
});

test('signals table exposes calibrated decision fields', () => {
  const page = source('../pages/MarketSignals.jsx');
  for (const field of ['probability_band', 'rr_net', 'activation_date',
                       'expiry_date', 'model_version', 'data_status']) {
    assert.match(page, new RegExp(field));
  }
  assert.doesNotMatch(page, /Target \(1\.5R\)/);
});

test('track record labels forward and archived samples', () => {
  const page = source('../pages/TrackRecord.jsx');
  assert.match(page, /Current model · forward only/);
  assert.match(page, /Historical validation/);
  assert.match(page, /Archived legacy\/backfill/);
});
```

- [ ] **Step 2: Run the contract tests and verify failure**

Run from `web`: `rtk node --test src/lib/calibratedSignalsContract.test.js src/lib/signalsPortfolioContract.test.js`

Expected: FAIL because the helper and v3 fields do not exist.

- [ ] **Step 3: Implement view-state helpers**

```javascript
// web/src/lib/calibratedSignalsView.js
export const probabilityBand = (value) => {
  if (value >= 0.70) return '70%+';
  if (value >= 0.65) return '65–69%';
  if (value >= 0.60) return '60–64%';
  return 'Below threshold';
};

export const signalStateCopy = (state) => ({
  'NO SIGNAL': { title: 'No qualifying setup', detail: 'No candidate clears the calibrated probability and 1R gates.' },
  'SCAN_INCOMPLETE': { title: 'Signal scan incomplete', detail: 'Required market data or the approved model is unavailable.' },
  pending: { title: 'Pending next-session confirmation', detail: 'Entry activates only after the opening gap check.' },
  active: { title: 'Active calibrated setup', detail: 'Levels are locked for this model version.' },
  expired: { title: 'Entry expired', detail: 'Price moved too far to preserve the validated plan.' },
}[state] || { title: 'Signal unavailable', detail: 'The setup state could not be verified.' });
```

- [ ] **Step 4: Replace conviction presentation with calibrated setup fields**

Update the actionable table/cards to show probability band, pending/active state, immutable entry/stop/target, `rr_net`, activation/expiry, model version, freshness and top supporting/contradicting factors. Use `setups.state` for empty-state copy. Keep market context and Options Intelligence unchanged.

Use this row contract in `MarketSignals.jsx`:

```jsx
{setups.plans.map((plan) => (
  <article className="calibrated-setup" key={plan.candidate_id}>
    <div className="calibrated-setup__head">
      <strong>{plan.symbol}</strong>
      <span className={`side-${plan.side}`}>{plan.side}</span>
      <span className="probability-band">{plan.probability_band}</span>
      <span className={`setup-state setup-state--${plan.state}`}>{plan.state}</span>
    </div>
    <dl className="calibrated-setup__levels">
      <div><dt>Entry</dt><dd>{cur}{fmt(plan.entry)}</dd></div>
      <div><dt>Stop</dt><dd>{cur}{fmt(plan.stop)}</dd></div>
      <div><dt>Target</dt><dd>{cur}{fmt(plan.target)}</dd></div>
      <div><dt>Net R:R</dt><dd>{Number(plan.rr_net).toFixed(2)}R</dd></div>
    </dl>
    <p>{plan.supporting_factors.join(' · ')}</p>
    {plan.contradicting_factor && <p className="setup-risk">Risk: {plan.contradicting_factor}</p>}
    <small>{plan.model_version} · active {plan.activation_date} · expires {plan.expiry_date} · {plan.data_status}</small>
  </article>
))}
```

When `setups.plans` is empty, render `signalStateCopy(setups.state)` rather than the old 45/100 threshold copy.

- [ ] **Step 5: Make active signals and track record truthful**

`SignalsPortfolio` lists every active v3 setup and removes `slots`/ten-position implications. `TrackRecord` uses `headline` for the current model, shows sample size prominently, and renders historical validation, shadow and archived legacy/backfill as separately labeled sections.

- [ ] **Step 6: Add responsive styles**

Add CSS classes for state badges, probability bands, freshness, factors and stacked mobile setup cards. At 390px, levels must remain readable without horizontal overflow; lower-priority factor text wraps rather than forcing a wide table.

```css
.calibrated-setup { padding: 16px; border: 1px solid var(--border-subtle); border-radius: 14px; }
.calibrated-setup__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.calibrated-setup__levels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.calibrated-setup__levels dt { color: var(--text-secondary); font-size: 11px; }
.calibrated-setup__levels dd { margin: 3px 0 0; font-weight: 700; }
.probability-band { color: var(--primary-accent); font-weight: 800; }
.setup-risk { color: var(--red-loss); overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .calibrated-setup__levels { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [ ] **Step 7: Run frontend tests, lint and build**

Run from `web`: `rtk node --test src/lib/*.test.js`

Expected: all Node contract tests pass.

Run from `web`: `rtk npx eslint src/pages/MarketSignals.jsx src/pages/TrackRecord.jsx src/components/SignalsPortfolio.jsx src/lib/calibratedSignalsView.js src/lib/calibratedSignalsContract.test.js src/lib/signalsPortfolioContract.test.js`

Expected: exit 0.

Run from `web`: `rtk npm run build -- --outDir ../data/signals-v3-build`

Expected: Vite production build exits 0 and writes only to the ignored `data/signals-v3-build/` directory.

- [ ] **Step 8: Commit the user interface**

```powershell
rtk git add -- web/src/lib/calibratedSignalsView.js web/src/lib/calibratedSignalsContract.test.js web/src/lib/signalsPortfolioContract.test.js web/src/pages/MarketSignals.jsx web/src/pages/MarketSignals.css web/src/components/SignalsPortfolio.jsx web/src/pages/TrackRecord.jsx
rtk git commit -m "feat: show calibrated signal quality and provenance"
```

---

### Task 11: Full local verification and implementation handoff

**Files:**

- Modify only if validation findings require documentation: `research/signals/reports/IN-signals-v3-calibrated.json` and `research/signals/reports/US-signals-v3-calibrated.json`.
- Do not modify: `web/dist/**`; all verification builds use ignored `data/signals-v3-build/`.

**Interfaces:**

- Consumes: all completed tasks.
- Produces: a local verification report and explicit market-by-market status.

- [ ] **Step 1: Re-run the release report against unchanged datasets**

Run for every evaluated market; these exact examples cover both:

```powershell
rtk python -m api.scripts.train_signal_model --market IN --dataset data/signals_v3/in-20230801-20260731.csv.gz --model-version signals-v3-calibrated-in-1 --report data/signals_v3/verify-IN-report.json --artifact data/signals_v3/verify-IN-artifact.json --compare-report research/signals/reports/IN-signals-v3-calibrated.json
rtk python -m api.scripts.train_signal_model --market US --dataset data/signals_v3/us-20230801-20260731.csv.gz --model-version signals-v3-calibrated-us-1 --report data/signals_v3/verify-US-report.json --artifact data/signals_v3/verify-US-artifact.json --compare-report research/signals/reports/US-signals-v3-calibrated.json
```

Expected: identical dataset hashes, folds, metrics, release decisions and artifact checksum. Any mismatch blocks completion.

- [ ] **Step 2: Run the complete backend suite**

Run: `rtk python -m pytest api -q --ignore=api/test_live.py`

Expected: zero failures. Run from the repository root to avoid the known duplicate root/API test collection issue.

- [ ] **Step 3: Run the complete frontend suite**

Run from `web`: `rtk node --test src/lib/*.test.js`

Expected: zero failures.

- [ ] **Step 4: Run focused lint and production build**

Run from `web`: `rtk npx eslint src/pages/MarketSignals.jsx src/pages/TrackRecord.jsx src/components/SignalsPortfolio.jsx src/lib/calibratedSignalsView.js src/lib/calibratedSignalsContract.test.js src/lib/signalsPortfolioContract.test.js`

Expected: exit 0.

Run from `web`: `rtk npm run build -- --outDir ../data/signals-v3-build`

Expected: exit 0.

- [ ] **Step 5: Exercise local API and browser flows**

Start the API in one terminal from the repository root:

Run: `rtk python -m uvicorn api.main:app --host 127.0.0.1 --port 8000`

Start the web app in a second terminal from `web`:

Run: `rtk npm run dev -- --host 127.0.0.1 --port 5173`

Open `http://127.0.0.1:5173/signals` and verify for each approved market:

- `/api/signals?market=IN|US` returns the approved model version and never v2.1 in live mode;
- missing/stale artifacts produce `SCAN_INCOMPLETE` and zero plans;
- pending candidates activate or expire idempotently;
- `/api/signals/portfolio?market=IN|US` headline contains only exact current-version forward rows;
- `/signals` renders pending, active, no-signal and incomplete states correctly;
- `/track-record` labels forward, historical, shadow and archived samples separately; and
- desktop 1440×900 and mobile 390×844 have no console errors or horizontal overflow.

- [ ] **Step 6: Check repository hygiene**

Run: `rtk git diff --check`

Expected: no whitespace errors.

Run: `rtk git status --short`

Expected: only known unrelated user-owned paths remain; no dataset cache, temporary artifact or generated build output is staged.

- [ ] **Step 7: Commit verification-only corrections if necessary**

If verification required a correction, return to that component's explicit `git add` list and test command, repeat the failing command until it passes, then use commit message `test: verify calibrated signal release gates`. If no correction was required, do not create an empty commit.

- [ ] **Step 8: Report the result without deploying**

Report separately:

- India release-gate result and sample metrics;
- US release-gate result and sample metrics;
- whether live integration tasks were executed or skipped;
- backend/frontend/build/browser verification evidence;
- current model versions and default modes; and
- the explicit fact that production was not deployed.

Do not claim a 55% live win rate. The 55% gate is an out-of-sample eligibility result until 100 genuine forward trades resolve.
