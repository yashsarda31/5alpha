"""Sequential, point-in-time timing policy tests; no market/provider calls."""
from datetime import datetime, timezone
import sqlite3

import pytest

from api.signal_timing import classify_batch, ensure_schema, timing_comparison, source_is_fresh


def candidate(side="LONG", price=99.9, score=70):
    return dict(symbol="ABC", side=side, entry=price, score=score, coverage_pct=100,
                day_high=100, day_low=98, risk=1, stop=98.9, target=101.9,
                oi_pct=3, px=0.5, qty=100, model_version="signals-v2.3-timing")


def scan(conn, plans, minute=0, fresh=True):
    stamp = f"2026-09-04T04:{minute:02d}:00+00:00"
    return classify_batch(conn, plans, observed_at=stamp, detected_at=stamp,
                          market_date="2026-09-04", data_fresh=fresh,
                          capital=100000, risk_pct=1, vol_scale=1)


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)
    yield connection
    connection.close()


def test_first_observation_is_forming_even_if_score_already_high(conn):
    plan = scan(conn, [candidate()])[0]
    assert plan["lifecycle"] == "forming"
    assert plan["actionable"] is False
    assert plan["trigger"] == 100


def test_later_crossing_triggers_without_moving_anchor(conn):
    first = scan(conn, [candidate(score=50)])[0]
    second = scan(conn, [candidate(price=100.1)], 1)[0]
    assert second["lifecycle"] == "triggered"
    assert second["trigger"] == first["trigger"]
    assert second["stop"] == first["initial_stop"]
    assert second["target"] == first["initial_target"]
    assert second["entry"] == 100.1
    assert second["remaining_rr"] >= 1.5


def test_duplicate_or_out_of_order_source_cannot_trigger(conn):
    scan(conn, [candidate()])
    assert scan(conn, [candidate(price=100.1)])[0]["lifecycle"] == "forming"
    assert scan(conn, [candidate(price=100.1)], 2)[0]["actionable"]
    assert not scan(conn, [candidate(price=99.9)], 1)[0]["actionable"]
    assert not scan(conn, [candidate(price=100.1)], 2)[0]["actionable"]


def test_extended_move_and_invalidated_stop_are_not_entries(conn):
    first = scan(conn, [candidate()])[0]
    price = first["trigger"] + first["initial_risk"] * 0.6
    assert scan(conn, [candidate(price=price)], 1)[0]["lifecycle"] == "extended"
    assert scan(conn, [candidate(price=first["initial_stop"] - .1)], 2)[0]["lifecycle"] == "invalidated"
    assert scan(conn, [candidate(price=100.1)], 3)[0]["lifecycle"] == "invalidated"


def test_insufficient_remaining_room_blocks_before_half_r_chase(conn):
    first = scan(conn, [candidate()])[0]
    price = first["trigger"] + first["initial_risk"] * 0.3
    p = scan(conn, [candidate(price=price)], 1)[0]
    assert p["chase_r"] < .5
    assert p["lifecycle"] == "extended"
    assert p["timing_reason"] == "insufficient_remaining_room"


def test_short_direction_is_symmetric(conn):
    first = scan(conn, [candidate("SHORT", 98.1)])[0]
    second = scan(conn, [candidate("SHORT", 97.9)], 1)[0]
    assert first["trigger"] == 98
    assert second["lifecycle"] == "triggered"
    assert second["target"] < second["entry"] < second["stop"]


def test_stale_data_cannot_seed_or_advance_anchor(conn):
    assert scan(conn, [candidate()], fresh=False)[0]["actionable"] is False
    assert conn.execute("SELECT count(*) FROM signal_timing_state").fetchone()[0] == 0
    scan(conn, [candidate()])
    assert scan(conn, [candidate(price=100.1)], 1, fresh=False)[0]["lifecycle"] == "forming"


def test_anchor_survives_serialization_and_first_baseline_is_preserved(conn):
    first = scan(conn, [candidate()])[0]
    restored = sqlite3.connect(":memory:")
    restored.row_factory = sqlite3.Row
    restored.deserialize(conn.serialize())
    second = scan(restored, [candidate(price=100.1)], 1)[0]
    assert second["first_seen_at"] == first["first_seen_at"]
    assert second["baseline_first_entry"] == 99.9
    assert second["shadow_features"]["price_change_pct"] == pytest.approx(.2002, abs=.0001)
    restored.close()


def test_missing_and_nonfinite_prices_fail_closed(conn):
    for value in (None, float("nan"), -1):
        p = candidate(price=value)
        assert scan(conn, [p])[0]["actionable"] is False


def test_below_quality_threshold_never_becomes_actionable(conn):
    scan(conn, [candidate(score=50)])
    p = scan(conn, [candidate(price=100.1, score=50)], 1)[0]
    assert p["lifecycle"] == "forming"
    assert not p["actionable"]


def test_forward_comparison_reports_worse_entry_without_claiming_returns(conn):
    assert timing_comparison(conn)["median_entry_improvement_bps"] is None
    scan(conn, [candidate()])
    scan(conn, [candidate(price=100.1)], 1)
    report = timing_comparison(conn)
    assert report["paired_entries"] == 1
    assert report["median_entry_improvement_bps"] < 0
    assert report["median_extra_confirmation_seconds"] == 60
    assert report["returns_evaluated"] is False


def test_freshness_rejects_same_day_old_naive_and_future_timestamps():
    detected = "2026-09-04T04:10:00+00:00"
    assert source_is_fresh("2026-09-04T04:09:00+00:00", detected)
    assert not source_is_fresh("2026-09-04T04:00:00+00:00", detected)
    assert not source_is_fresh("2026-09-04T04:09:00", detected)
    assert not source_is_fresh("2026-09-04T04:11:00+00:00", detected)
