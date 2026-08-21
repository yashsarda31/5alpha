import json
import sqlite3
from datetime import date

import pytest

from api.signal_model.contracts import CandidateSnapshot
from api.signal_model.ledger import (
    append_candidate,
    ensure_schema,
    list_current_model_rows,
    transition_candidate,
)


def db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)
    return conn


def snapshot(candidate_id="IN|2026-08-20|ABC|LONG"):
    return CandidateSnapshot(
        candidate_id=candidate_id,
        market="IN",
        symbol="ABC",
        side="LONG",
        kind="long_buildup",
        session_date=date(2026, 8, 20),
        observed_at="2026-08-20T15:45:00+05:30",
        reference_entry=100.0,
        atr14=4.0,
        session_low=98.0,
        session_high=103.0,
        barrier_price=108.0,
        features={"side_return_atr": 1.0},
        data_as_of={"fo": "2026-08-20"},
    )


def test_candidate_insert_is_append_only_and_idempotent():
    candidate_snapshot = snapshot()
    conn = db()
    assert append_candidate(conn, candidate_snapshot, {"price": 100}) is True
    assert append_candidate(conn, candidate_snapshot, {"price": 999}) is False
    row = conn.execute("SELECT * FROM signal_candidates_v3").fetchone()
    assert row["reference_entry"] == 100
    assert json.loads(row["raw_json"]) == {"price": 100}
    assert conn.execute("SELECT COUNT(*) FROM signal_candidates_v3").fetchone()[0] == 1


def test_transition_requires_expected_previous_state():
    candidate_snapshot = snapshot()
    conn = db()
    append_candidate(conn, candidate_snapshot, {})
    assert (
        transition_candidate(
            conn,
            candidate_snapshot.candidate_id,
            "candidate",
            "rejected",
            rejection_reasons=["low_probability"],
        )
        is True
    )
    assert (
        transition_candidate(conn, candidate_snapshot.candidate_id, "candidate", "active")
        is False
    )


def test_transition_rejects_arbitrary_sql_columns():
    conn = db()
    append_candidate(conn, snapshot(), {})
    with pytest.raises(ValueError, match="unsupported_transition_fields"):
        transition_candidate(conn, snapshot().candidate_id, "candidate", "active", source="bad")


def test_current_model_rows_are_market_and_version_scoped():
    conn = db()
    first = snapshot()
    second = snapshot("IN|2026-08-21|ABC|LONG")
    append_candidate(conn, first, {})
    append_candidate(conn, second, {})
    transition_candidate(
        conn,
        first.candidate_id,
        "candidate",
        "active",
        probability=0.65,
        threshold=0.60,
        model_version="in-v3-test",
    )
    transition_candidate(
        conn,
        second.candidate_id,
        "candidate",
        "rejected",
        probability=0.50,
        threshold=0.60,
        model_version="in-v3-test",
    )
    rows = list_current_model_rows(conn, "IN", "in-v3-test")
    assert [row["candidate_id"] for row in rows] == [first.candidate_id, second.candidate_id]
    assert rows[0]["features"] == {"side_return_atr": 1.0}
