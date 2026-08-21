import os
import tempfile
from datetime import datetime, timezone, timedelta

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main  # noqa: E402
from main import _admin_metrics_data, _require_admin, _parse_ts, _auth_db  # noqa: E402
from fastapi import HTTPException  # noqa: E402
import pytest  # noqa: E402


def _seed_users(rows):
    conn = _auth_db()
    conn.execute("DELETE FROM users")
    for email, created, last in rows:
        conn.execute(
            "INSERT INTO users (email, password_hash, salt, display_name, created_at, last_login_at)"
            " VALUES (?,?,?,?,?,?)",
            (email, "h", "s", email.split("@")[0], created, last))
    conn.commit()
    conn.close()


def test_parse_ts_handles_z_and_offset_and_junk():
    assert _parse_ts("2026-07-04T10:00:00+00:00") is not None
    assert _parse_ts("2026-07-04T10:00:00Z") is not None
    assert _parse_ts(None) is None
    assert _parse_ts("not-a-date") is None


def test_totals_and_growth_math():
    now = datetime.now(timezone.utc)
    iso = lambda d: (now - timedelta(days=d)).isoformat()
    _seed_users([
        ("a@test.local", iso(50), iso(2)),    # old signup, recently active
        ("b@test.local", iso(20), iso(40)),   # month-old signup, dormant
        ("c@test.local", iso(3), iso(1)),     # new + active
        ("d@test.local", iso(1), None),       # brand new, never logged in
    ])
    m = _admin_metrics_data(growth_days=60)
    t = m["totals"]
    assert t["users"] == 4
    assert t["new_7d"] == 2          # c, d
    assert t["new_30d"] == 3         # b, c, d
    assert t["active_7d"] == 2       # a, c
    assert t["ever_logged_in"] == 3  # a, b, c

    # Growth series spans the window and ends at the cumulative total
    assert len(m["growth"]) == 60
    assert m["growth"][-1]["total"] == 4
    assert all(m["growth"][i]["total"] <= m["growth"][i + 1]["total"]
               for i in range(len(m["growth"]) - 1))  # monotonic non-decreasing


def test_signups_before_window_counted_in_baseline():
    now = datetime.now(timezone.utc)
    _seed_users([
        ("ancient@test.local", (now - timedelta(days=400)).isoformat(), None),
        ("recent@test.local", (now - timedelta(days=1)).isoformat(), None),
    ])
    m = _admin_metrics_data(growth_days=30)
    # The 400-day-old user is before the 30-day window but still in the running total
    assert m["growth"][0]["total"] == 1
    assert m["growth"][-1]["total"] == 2


def test_recent_sorted_newest_first_and_limited():
    now = datetime.now(timezone.utc)
    _seed_users([(f"u{i}@test.local", (now - timedelta(days=i)).isoformat(), None)
                 for i in range(10)])
    m = _admin_metrics_data(recent_limit=3)
    assert len(m["recent"]) == 3
    assert m["recent"][0]["email"] == "u0@test.local"  # most recent
    assert m["recent"][-1]["email"] == "u2@test.local"


def test_invalid_or_future_timestamps_do_not_break_growth_totals_or_recency():
    now = datetime.now(timezone.utc)
    _seed_users([
        ("valid@test.local", (now - timedelta(days=1)).isoformat(),
         (now - timedelta(hours=1)).isoformat()),
        ("future@test.local", (now + timedelta(days=10)).isoformat(),
         (now + timedelta(days=10)).isoformat()),
        ("unknown@test.local", "not-a-date", "not-a-date"),
    ])

    metrics = _admin_metrics_data(growth_days=30)

    assert metrics["totals"]["users"] == 3
    assert metrics["totals"]["new_7d"] == 1
    assert metrics["totals"]["active_7d"] == 1
    assert metrics["totals"]["ever_logged_in"] == 1
    assert metrics["growth"][-1]["total"] == 3


def test_require_admin_gating():
    orig = main.ADMIN_METRICS_KEY
    try:
        main.ADMIN_METRICS_KEY = "sekret"
        with pytest.raises(HTTPException):
            _require_admin(None)
        with pytest.raises(HTTPException):
            _require_admin("wrong")
        _require_admin("sekret")  # correct key: no raise
    finally:
        main.ADMIN_METRICS_KEY = orig
