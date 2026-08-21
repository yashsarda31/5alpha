from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any, Callable, Iterable, Mapping

import pandas as pd

from .contracts import CandidateSnapshot, ExecutionPolicy, SessionBar
from .execution import build_execution_plan, resolve_outcome
from .features import FEATURE_SCHEMA_V1, _wilder_atr, build_feature_row


def reconstruct_india_candidates(
    fo_rows: Iterable[Mapping[str, Any]], session_date: date
) -> list[dict[str, Any]]:
    """Classify every directional stock-future row without a score cutoff."""
    candidates: list[dict[str, Any]] = []
    for raw_row in fo_rows:
        row = dict(raw_row)
        try:
            price_change = float(row["price_change_pct"])
            oi_change = float(row["oi_change_pct"])
        except (KeyError, TypeError, ValueError):
            continue
        if price_change > 0 and oi_change > 0:
            side, kind = "LONG", "long_buildup"
        elif price_change < 0 and oi_change > 0:
            side, kind = "SHORT", "short_buildup"
        elif price_change > 0 and oi_change < 0:
            side, kind = "LONG", "short_covering"
        else:
            continue
        row.pop("legacy_score", None)
        row.update(side=side, kind=kind, session_date=session_date.isoformat())
        candidates.append(row)
    return candidates


def _date(value: Any) -> date:
    return pd.Timestamp(value).date()


def _context_for(
    session: Mapping[str, Any], contexts: Mapping[Any, Mapping[str, float]], day: date
) -> dict[str, float]:
    neutral = {
        "index_return_pct": 0.0,
        "sector_return_pct": 0.0,
        "breadth_pct": 50.0,
        "vix_percentile": 0.5,
        "regime": 0.0,
    }
    supplied = (
        contexts.get(day)
        or contexts.get(day.isoformat())
        or session.get("context")
        or {}
    )
    return {**neutral, **dict(supplied)}


def _candidate_rows(session: Mapping[str, Any], market: str, day: date) -> list[dict[str, Any]]:
    rows = session.get("fo_rows", session.get("candidate_rows", []))
    if market == "IN":
        return reconstruct_india_candidates(rows, day)
    return [
        {**dict(row), "session_date": day.isoformat()}
        for row in rows
        if row.get("side") in ("LONG", "SHORT")
    ]


def _row_base(row: Mapping[str, Any], day: date, market: str) -> dict[str, Any]:
    return {
        "candidate_id": f'{market}|{day.isoformat()}|{row.get("symbol", "")}|{row.get("side", "")}',
        "market": market,
        "symbol": row.get("symbol"),
        "side": row.get("side"),
        "kind": row.get("kind"),
        "session_date": day,
        "eligible": 0,
        "rejection_reason": None,
        "entry_date": None,
        "hold_sessions": None,
        "entry": None,
        "stop": None,
        "target": None,
        "rr_net": None,
        "gross_return_pct": None,
        "net_return_pct": None,
        "label": None,
    }


def replay_market(
    sessions: Iterable[Mapping[str, Any]],
    contexts: Mapping[Any, Mapping[str, float]],
    cost_schedule: Callable[[str, date], float],
    market: str,
    policy: ExecutionPolicy | None = None,
) -> pd.DataFrame:
    """Replay candidates into next-session entries and five-session net labels."""
    execution_policy = policy or ExecutionPolicy()
    ordered = sorted((dict(session) for session in sessions), key=lambda item: _date(item["session_date"]))
    histories: dict[str, list[dict[str, Any]]] = defaultdict(list)
    output: list[dict[str, Any]] = []

    for session_index, session in enumerate(ordered):
        day = _date(session["session_date"])
        session_bars = session.get("bars", {})
        for symbol, raw_bar in session_bars.items():
            bar = dict(raw_bar)
            bar["session_date"] = day
            histories[symbol].append(bar)

        for candidate_row in _candidate_rows(session, market, day):
            base = _row_base(candidate_row, day, market)
            symbol = str(candidate_row.get("symbol") or "")
            if not symbol or symbol not in histories:
                output.append({**base, "rejection_reason": "missing_history"})
                continue

            history = pd.DataFrame(histories[symbol]).set_index("session_date")
            try:
                features = build_feature_row(
                    candidate_row,
                    history,
                    _context_for(session, contexts, day),
                    day,
                )
                atr14 = float(_wilder_atr(history).iloc[-1])
            except (KeyError, TypeError, ValueError) as exc:
                reason = str(exc) or "invalid_features"
                output.append({**base, "rejection_reason": reason})
                continue

            future: list[tuple[date, Mapping[str, Any]]] = []
            for later in ordered[session_index + 1 :]:
                later_day = _date(later["session_date"])
                later_bar = later.get("bars", {}).get(symbol)
                if later_bar is not None:
                    future.append((later_day, later_bar))
                if len(future) >= execution_policy.max_hold_sessions:
                    break
            if not future:
                output.append({**base, **features, "rejection_reason": "no_next_session"})
                continue

            entry_date, entry_bar = future[0]
            reference_entry = float(
                candidate_row.get(
                    "reference_entry", candidate_row.get("close", history.close.iloc[-1])
                )
            )
            signal_low = float(candidate_row.get("low", history.low.iloc[-1]))
            signal_high = float(candidate_row.get("high", history.high.iloc[-1]))
            candidate = CandidateSnapshot(
                candidate_id=base["candidate_id"],
                market=market,
                symbol=symbol,
                side=candidate_row["side"],
                kind=candidate_row["kind"],
                session_date=day,
                observed_at=str(
                    candidate_row.get("observed_at", f"{day.isoformat()}T15:45:00+05:30")
                ),
                reference_entry=reference_entry,
                atr14=atr14,
                session_low=signal_low,
                session_high=signal_high,
                barrier_price=(
                    float(candidate_row["barrier_price"])
                    if candidate_row.get("barrier_price") is not None
                    else None
                ),
                features=features,
                data_as_of=dict(candidate_row.get("data_as_of", {"session": day.isoformat()})),
            )
            cost_pct = float(cost_schedule(market, entry_date))
            plan = build_execution_plan(
                candidate,
                float(entry_bar["open"]),
                execution_policy,
                cost_pct,
            )
            plan_values = {
                "entry_date": entry_date,
                "entry": plan.entry,
                "stop": plan.stop,
                "target": plan.target,
                "rr_net": plan.rr_net,
            }
            if plan.status != "active":
                output.append(
                    {**base, **features, **plan_values, "rejection_reason": plan.reason}
                )
                continue

            bars = [
                SessionBar(
                    session_date=future_day,
                    open=float(raw_bar["open"]),
                    high=float(raw_bar["high"]),
                    low=float(raw_bar["low"]),
                    close=float(raw_bar["close"]),
                )
                for future_day, raw_bar in future
            ]
            outcome = resolve_outcome(plan, bars, cost_pct)
            if outcome is None:
                output.append(
                    {
                        **base,
                        **features,
                        **plan_values,
                        "eligible": 1,
                        "rejection_reason": "outcome_pending",
                    }
                )
                continue
            hold_sessions = next(
                index + 1
                for index, bar in enumerate(bars)
                if bar.session_date == outcome.exit_date
            )
            output.append(
                {
                    **base,
                    **features,
                    **plan_values,
                    "eligible": 1,
                    "hold_sessions": hold_sessions,
                    "gross_return_pct": outcome.gross_return_pct,
                    "net_return_pct": outcome.net_return_pct,
                    "label": int(outcome.net_return_pct > 0),
                    "exit_date": outcome.exit_date,
                    "exit": outcome.exit_price,
                    "outcome_reason": outcome.reason,
                }
            )

    columns = [
        "candidate_id",
        "market",
        "symbol",
        "side",
        "kind",
        "session_date",
        *FEATURE_SCHEMA_V1,
        "eligible",
        "rejection_reason",
        "entry_date",
        "hold_sessions",
        "entry",
        "stop",
        "target",
        "rr_net",
        "gross_return_pct",
        "net_return_pct",
        "label",
        "exit_date",
        "exit",
        "outcome_reason",
    ]
    return pd.DataFrame(output).reindex(columns=columns)
