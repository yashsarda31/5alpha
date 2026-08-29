from datetime import date

import pandas as pd

from api.signal_model.portfolio import build_portfolio_snapshot, resolve_position


def bars(*rows):
    return pd.DataFrame(rows).set_index("timestamp")


def position(**overrides):
    row = {
        "market": "IN",
        "symbol": "TEST",
        "side": "LONG",
        "entry": 100.0,
        "stop": 95.0,
        "target": 110.0,
        "entry_date": "2026-08-28",
        "signal_at": "2026-08-28T10:15:00+05:30",
        "status": "open",
        "source": "live_engine",
        "model_version": "test-v1",
    }
    row.update(overrides)
    return row


def test_post_publication_intraday_stop_resolves_loss():
    intraday = bars(
        {
            "timestamp": "2026-08-28T10:10:00+05:30",
            "Open": 100,
            "High": 101,
            "Low": 90,
            "Close": 99,
        },
        {
            "timestamp": "2026-08-28T10:20:00+05:30",
            "Open": 100,
            "High": 101,
            "Low": 94,
            "Close": 96,
        },
    )
    result = resolve_position(
        position(), intraday, pd.DataFrame(), date(2026, 8, 28), 5
    )
    assert (result.status, result.exit_price, result.exit_date) == (
        "loss",
        95.0,
        "2026-08-28",
    )


def test_same_bar_stop_and_target_uses_conservative_stop():
    intraday = bars(
        {
            "timestamp": "2026-08-28T10:20:00+05:30",
            "Open": 100,
            "High": 112,
            "Low": 94,
            "Close": 105,
        },
    )
    result = resolve_position(
        position(), intraday, pd.DataFrame(), date(2026, 8, 28), 5
    )
    assert result.status == "loss"
    assert result.exit_price == 95.0


def test_entry_close_beyond_stop_without_intraday_is_unresolved():
    daily = bars(
        {
            "timestamp": "2026-08-28",
            "Open": 100,
            "High": 103,
            "Low": 92,
            "Close": 94,
        },
    )
    result = resolve_position(
        position(), pd.DataFrame(), daily, date(2026, 8, 28), 5
    )
    assert result.status == "unresolved"
    assert result.reason == "missing_post_entry_intraday_evidence"


def test_post_entry_gap_through_stop_fills_at_open():
    daily = bars(
        {
            "timestamp": "2026-08-29",
            "Open": 90,
            "High": 92,
            "Low": 88,
            "Close": 91,
        },
    )
    result = resolve_position(
        position(), pd.DataFrame(), daily, date(2026, 8, 29), 5
    )
    assert (result.status, result.exit_price) == ("loss", 90.0)


def test_unresolved_rows_do_not_affect_stats_or_slots():
    rows = [
        {
            **position(symbol="WIN", status="win"),
            "exit": 110,
            "exit_date": "2026-08-29",
            "ret_pct": 10.0,
        },
        {
            **position(symbol="AMB", status="unresolved"),
            "resolution_reason": "missing_post_entry_intraday_evidence",
        },
        position(symbol="OPEN"),
    ]
    snapshot = build_portfolio_snapshot(
        rows,
        quote_loader=lambda market, symbol: 102.0,
        market_date=date(2026, 8, 29),
        slots=10,
        weight=0.10,
    )
    assert snapshot["stats"]["closed"] == 1
    assert snapshot["stats"]["unresolved"] == 1
    assert snapshot["stats"]["open"] == 1
    assert snapshot["stats"]["win_rate"] == 100.0
    assert [row["symbol"] for row in snapshot["unresolved"]] == ["AMB"]
