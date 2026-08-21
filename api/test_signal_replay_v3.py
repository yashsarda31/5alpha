from datetime import date

import pandas as pd
import pytest

from api.signal_model.replay import reconstruct_india_candidates, replay_market


@pytest.fixture
def fo_rows():
    return [
        {
            "symbol": "LONGOI",
            "open": 99,
            "high": 102,
            "low": 98,
            "close": 101,
            "prev_close": 99,
            "price_change_pct": 2.02,
            "oi": 1100,
            "oi_change_pct": 10,
            "volume": 10_000,
            "delivery_change_pct": 0,
        },
        {
            "symbol": "SHORTOI",
            "open": 101,
            "high": 102,
            "low": 98,
            "close": 99,
            "prev_close": 101,
            "price_change_pct": -1.98,
            "oi": 1100,
            "oi_change_pct": 10,
            "volume": 10_000,
            "delivery_change_pct": 0,
        },
        {
            "symbol": "COVER",
            "open": 99,
            "high": 102,
            "low": 98,
            "close": 101,
            "prev_close": 99,
            "price_change_pct": 2.02,
            "oi": 900,
            "oi_change_pct": -10,
            "volume": 10_000,
            "delivery_change_pct": 0,
        },
        {
            "symbol": "UNWIND",
            "price_change_pct": -2,
            "oi_change_pct": -10,
        },
    ]


@pytest.fixture
def replay_sessions(fo_rows):
    dates = pd.bdate_range("2026-06-15", periods=40)
    signal_index = 33
    symbols = ("LONGOI", "SHORTOI", "COVER")
    sessions = []
    for index, timestamp in enumerate(dates):
        bars = {}
        for symbol in symbols:
            bar = {
                "open": 100.0,
                "high": 102.0,
                "low": 98.0,
                "close": 100.0,
                "volume": 9_000 + index,
                "oi": 1_000 + index,
            }
            if index == signal_index + 1 and symbol == "LONGOI":
                bar.update(open=100.0, high=105.0, low=99.0, close=104.0)
            bars[symbol] = bar
        sessions.append(
            {
                "session_date": timestamp.date(),
                "fo_rows": fo_rows if index == signal_index else [],
                "bars": bars,
                "context": {
                    "index_return_pct": 0.2,
                    "sector_return_pct": 0.1,
                    "breadth_pct": 55,
                    "vix_percentile": 0.4,
                    "regime": 1,
                },
            }
        )
    return sessions


def test_reconstruction_keeps_every_directional_candidate(fo_rows):
    rows = reconstruct_india_candidates(fo_rows, date(2026, 8, 20))
    assert {(row["symbol"], row["side"]) for row in rows} == {
        ("LONGOI", "LONG"),
        ("SHORTOI", "SHORT"),
        ("COVER", "LONG"),
    }
    assert all("legacy_score" not in row for row in rows)


def test_replay_enters_next_session_and_labels_after_costs(replay_sessions):
    frame = replay_market(replay_sessions, {}, lambda market, day: 0.20, "IN")
    row = frame.loc[frame.symbol == "LONGOI"].iloc[0]
    assert row.entry_date > row.session_date
    assert row.hold_sessions <= 5
    assert row.label in (0, 1)
    assert row.label == int(row.net_return_pct > 0)
    assert row.eligible == 1


def test_replay_retains_execution_rejections(replay_sessions):
    for row in replay_sessions[33]["fo_rows"]:
        if row["symbol"] == "COVER":
            row["barrier_price"] = 101.0
    frame = replay_market(replay_sessions, {}, lambda market, day: 0.20, "IN")
    row = frame.loc[frame.symbol == "COVER"].iloc[0]
    assert row.eligible == 0
    assert row.rejection_reason == "insufficient_1r_room"
    assert pd.isna(row.label)
