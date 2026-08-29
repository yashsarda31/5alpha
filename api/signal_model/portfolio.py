"""Evidence-aware paper-position resolution and portfolio aggregation.

The functions in this module are deterministic. Network and clock access are
injected by the FastAPI orchestration layer so outcome rules can be tested with
fixed bars and quotes.
"""

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


def _bar_resolution(
    side: str, stop: float, target: float, row: Mapping
) -> tuple[str, float] | None:
    """Resolve one complete bar, conservatively checking the stop first."""
    opening = float(row["Open"])
    high = float(row["High"])
    low = float(row["Low"])
    if side == "LONG":
        if opening <= stop:
            return "loss", opening
        if low <= stop:
            return "loss", stop
        if opening >= target:
            return "win", opening
        if high >= target:
            return "win", target
    else:
        if opening >= stop:
            return "loss", opening
        if high >= stop:
            return "loss", stop
        if opening <= target:
            return "win", opening
        if low <= target:
            return "win", target
    return None


def _entry_close_contradicts_open_position(
    side: str, close: float, stop: float, target: float
) -> bool:
    if side == "LONG":
        return close <= stop or close >= target
    return close >= stop or close <= target


def resolve_position(
    position: Mapping,
    intraday_bars: pd.DataFrame | None,
    daily_bars: pd.DataFrame | None,
    market_date: date,
    max_hold_days: int,
) -> Resolution | None:
    """Resolve a position using only bars observable after publication."""
    side = str(position["side"])
    stop = float(position["stop"])
    target = float(position["target"])
    entry_day = datetime.strptime(position["entry_date"], "%Y-%m-%d").date()
    signal_at = (
        pd.Timestamp(position["signal_at"]) if position.get("signal_at") else None
    )

    intraday_available = intraday_bars is not None and not intraday_bars.empty
    if signal_at is not None and intraday_available:
        for timestamp, row in intraday_bars.sort_index().iterrows():
            observed_at = pd.Timestamp(timestamp)
            if observed_at < signal_at:
                continue
            result = _bar_resolution(side, stop, target, row)
            if result:
                return Resolution(
                    result[0],
                    round(result[1], 2),
                    observed_at.strftime("%Y-%m-%d"),
                )

    entry_row = None
    if daily_bars is not None and not daily_bars.empty:
        for timestamp, row in daily_bars.sort_index().iterrows():
            observed_day = pd.Timestamp(timestamp).date()
            if observed_day == entry_day:
                entry_row = row
                continue
            if observed_day < entry_day:
                continue
            result = _bar_resolution(side, stop, target, row)
            if result:
                return Resolution(
                    result[0], round(result[1], 2), observed_day.isoformat()
                )

    if not intraday_available and entry_row is not None:
        close = float(entry_row["Close"])
        if _entry_close_contradicts_open_position(side, close, stop, target):
            return Resolution(
                UNRESOLVED_STATUS,
                None,
                entry_day.isoformat(),
                "missing_post_entry_intraday_evidence",
            )

    if (
        (market_date - entry_day).days >= max_hold_days
        and daily_bars is not None
        and not daily_bars.empty
    ):
        last = daily_bars.sort_index().iloc[-1]
        return Resolution(
            "closed",
            round(float(last["Close"]), 2),
            market_date.isoformat(),
            "time_stop",
        )
    return None


def _average(values: Iterable[float]) -> float:
    values = list(values)
    return round(sum(values) / len(values), 2) if values else 0.0


def _segment_stats(rows: Iterable[Mapping]) -> dict:
    rows = [row for row in rows if row.get("status") in FINAL_STATUSES]
    wins = [row for row in rows if float(row.get("ret_pct") or 0) > 0]
    losses = [row for row in rows if float(row.get("ret_pct") or 0) <= 0]
    return {
        "closed": len(rows),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / len(rows) * 100, 1) if rows else None,
        "avg_trade": _average(float(row.get("ret_pct") or 0) for row in rows),
    }


def build_portfolio_snapshot(
    rows: Iterable[Mapping],
    quote_loader: Callable[[str, str], float | None],
    market_date: date,
    slots: int,
    weight: float,
) -> dict:
    """Build the public portfolio without counting ambiguous outcomes."""
    rows = [dict(row) for row in rows]
    opened = [row for row in rows if row.get("status") == "open"]
    unresolved = [
        row for row in rows if row.get("status") == UNRESOLVED_STATUS
    ]
    closed = [row for row in rows if row.get("status") in FINAL_STATUSES]

    open_out = []
    unrealized = 0.0
    for row in opened:
        try:
            loaded = quote_loader(row["market"], row["symbol"])
        except Exception:
            loaded = None
        current = float(loaded) if loaded is not None else float(row["entry"])
        direction = 1 if row["side"] == "LONG" else -1
        unreal = (
            (current - float(row["entry"]))
            / float(row["entry"])
            * 100
            * direction
        )
        unrealized += weight * unreal
        try:
            days_held = (
                market_date
                - datetime.strptime(row["entry_date"], "%Y-%m-%d").date()
            ).days
        except (TypeError, ValueError):
            days_held = 0
        open_out.append(
            {
                **row,
                "current": round(current, 2),
                "unreal_pct": round(unreal, 2),
                "days_held": days_held,
                "weight_pct": round(weight * 100),
            }
        )
    open_out.sort(key=lambda row: -row["unreal_pct"])

    closed_sorted = sorted(
        closed, key=lambda row: (row.get("exit_date") or "", row.get("id", 0))
    )
    wins = [row for row in closed_sorted if float(row.get("ret_pct") or 0) > 0]
    losses = [row for row in closed_sorted if float(row.get("ret_pct") or 0) <= 0]
    realized = sum(weight * float(row.get("ret_pct") or 0) for row in closed_sorted)

    curve = []
    cumulative = 0.0
    peak = 0.0
    max_drawdown = 0.0
    for row in closed_sorted:
        cumulative += weight * float(row.get("ret_pct") or 0)
        point = {
            "date": (row.get("exit_date") or "")[:10],
            "cum_pct": round(cumulative, 2),
        }
        curve.append(point)
        peak = max(peak, point["cum_pct"])
        max_drawdown = min(max_drawdown, point["cum_pct"] - peak)

    stats = {
        "closed": len(closed_sorted),
        "wins": len(wins),
        "losses": len(losses),
        "unresolved": len(unresolved),
        "open": len(open_out),
        "slots": slots,
        "win_rate": (
            round(len(wins) / len(closed_sorted) * 100, 1)
            if closed_sorted
            else None
        ),
        "avg_win": _average(float(row["ret_pct"]) for row in wins),
        "avg_loss": _average(float(row["ret_pct"]) for row in losses),
        "avg_trade": _average(
            float(row.get("ret_pct") or 0) for row in closed_sorted
        ),
        "realized_pct": round(realized, 2),
        "unrealized_pct": round(unrealized, 2),
        "total_pct": round(realized + unrealized, 2),
        "best": max(
            (float(row["ret_pct"]) for row in closed_sorted), default=None
        ),
        "worst": min(
            (float(row["ret_pct"]) for row in closed_sorted), default=None
        ),
        "inception_date": min(
            (row["entry_date"] for row in rows if row.get("entry_date")),
            default=None,
        ),
        "max_drawdown_pct": round(max_drawdown, 2),
        "costs_status": "gross",
    }
    stats.update(
        {
            "forward": _segment_stats(
                row for row in rows if row.get("source") == "live_engine"
            ),
            "backfill": _segment_stats(
                row for row in rows if row.get("source") == "backfill_eod"
            ),
            "legacy_mixed": _segment_stats(
                row
                for row in rows
                if (row.get("source") or "legacy_mixed") == "legacy_mixed"
            ),
            "shadow": _segment_stats(
                row for row in rows if row.get("source") == "shadow"
            ),
            "by_side": {
                "LONG": _segment_stats(
                    row for row in rows if row.get("side") == "LONG"
                ),
                "SHORT": _segment_stats(
                    row for row in rows if row.get("side") == "SHORT"
                ),
            },
            "validation_note": (
                "Forward, reconstructed backfill, legacy mixed, and shadow "
                "samples are reported separately."
            ),
        }
    )

    unresolved_out = sorted(
        unresolved,
        key=lambda row: (row.get("entry_date") or "", row.get("id", 0)),
        reverse=True,
    )
    return {
        "stats": stats,
        "open": open_out,
        "closed": list(reversed(closed_sorted))[:50],
        "unresolved": unresolved_out,
        "equity_curve": curve,
    }
