import os
import sqlite3
import tempfile
import threading
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

# Isolate the DB before main is imported (no-op if another test imported it first;
# fresh table names keep these tests correct either way)
os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

from main import (  # noqa: E402
    API_CACHE,
    _clv,
    _delivery_db,
    _delivery_expected_day,
    _delivery_score,
    _delivery_signals,
    _ingest_delivery_day,
    _persist_delivery_rows,
)
import main  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))

# Real header from sec_bhavdata_full (note the leading spaces NSE ships)
CSV_HEADER = ("SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE,"
              " LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS,"
              " NO_OF_TRADES, DELIV_QTY, DELIV_PER")

def _csv(rows):
    return "\n".join([CSV_HEADER] + rows)


def _clear_delivery():
    conn = _delivery_db()
    conn.execute("DELETE FROM delivery_daily")
    conn.commit()
    conn.close()
    API_CACHE.pop("delivery_signals", None)


# --- CLV ---

def test_clv_strong_close():
    assert abs(_clv(10.0, 8.0, 9.8) - 0.8) < 1e-9

def test_clv_weak_close():
    assert abs(_clv(10.0, 8.0, 8.2) - (-0.8)) < 1e-9

def test_clv_no_range():
    assert _clv(100.0, 100.0, 100.0) == 0.0


# --- expected trading day ---

def test_expected_day_weekday_before_publish():
    now = datetime(2026, 7, 1, 15, 0, tzinfo=IST)  # Wed 3pm
    assert _delivery_expected_day(now) == date(2026, 6, 30)  # Tue

def test_expected_day_weekday_after_publish():
    now = datetime(2026, 7, 1, 20, 0, tzinfo=IST)  # Wed 8pm
    assert _delivery_expected_day(now) == date(2026, 7, 1)

def test_expected_day_weekend_steps_to_friday():
    now = datetime(2026, 7, 4, 12, 0, tzinfo=IST)  # Sat
    assert _delivery_expected_day(now) == date(2026, 7, 3)  # Fri

def test_expected_day_monday_morning_is_friday():
    now = datetime(2026, 7, 6, 9, 0, tzinfo=IST)  # Mon 9am
    assert _delivery_expected_day(now) == date(2026, 7, 3)


# --- ingest ---

def test_ingest_filters_and_parses():
    _clear_delivery()
    conn = _delivery_db()
    text = _csv([
        "RELIANCE, EQ, 03-Jul-2026, 1303.50, 1312.00, 1312.00, 1302.00, 1305.00, 1304.00, 1305.14, 7839550, 102317.33, 209968, 5182007, 66.10",
        "RELIANCE, BE, 03-Jul-2026, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 50.00",          # non-EQ series
        "NOTINUNIV, EQ, 03-Jul-2026, 1, 1, 2, 1, 1, 1.5, 1, 1, 1, 1, 1, 40.00",        # outside universe
        "TCS, EQ, 03-Jul-2026, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, -",                    # malformed DELIV_PER
    ])
    n = _ingest_delivery_day(conn, date(2026, 7, 3), text, {"RELIANCE", "TCS"})
    assert n == 1
    row = conn.execute("SELECT * FROM delivery_daily").fetchone()
    assert row["symbol"] == "RELIANCE" and row["deliv_per"] == 66.10
    assert row["traded_qty"] == 7_839_550
    assert row["delivered_qty"] == 5_182_007
    assert row["turnover_lacs"] == 102_317.33
    assert row["prev_close"] == 1303.50
    assert row["validation_status"] == "valid"
    assert row["source_url"].endswith("sec_bhavdata_full_03072026.csv")
    # CLV: H 1312, L 1302, C 1304 -> ((2)-(8))/10 = -0.6
    assert abs(row["clv"] - (-0.6)) < 1e-9

    # Re-ingest is idempotent (INSERT OR REPLACE on the PK)
    n2 = _ingest_delivery_day(conn, date(2026, 7, 3), text, {"RELIANCE", "TCS"})
    assert n2 == 1
    assert conn.execute("SELECT COUNT(*) FROM delivery_daily").fetchone()[0] == 1
    conn.commit()
    conn.close()


def test_delivery_persistence_replays_rows_after_snapshot_retry(tmp_path, monkeypatch):
    db_path = tmp_path / "delivery-conflict.db"
    monkeypatch.setattr(main, "AUTH_DB_PATH", str(db_path))
    monkeypatch.setattr(main, "_blob_token", lambda: None)

    pulls = []
    pushes = []

    def fake_pull(force=False):
        if not force:
            return True
        pulls.append(force)
        if len(pulls) == 2:
            conn = sqlite3.connect(db_path)
            conn.execute("DELETE FROM delivery_daily")
            conn.execute("CREATE TABLE concurrent_marker (value TEXT)")
            conn.execute("INSERT INTO concurrent_marker VALUES ('preserved')")
            conn.commit()
            conn.close()
        return True

    def fake_push():
        pushes.append(True)
        if len(pushes) == 1:
            raise HTTPException(status_code=503, detail="concurrent write")
        return True

    monkeypatch.setattr(main, "_delivery_blob_pull", fake_pull)
    monkeypatch.setattr(main, "_delivery_blob_push", fake_push)
    rows = [{
        "symbol": "RELIANCE",
        "trade_date": "2026-09-04",
        "series": "EQ",
        "prev_close": 1390.0,
        "close": 1400.0,
        "deliv_per": 55.0,
        "traded_qty": 100,
        "delivered_qty": 55,
        "turnover_lacs": 10.0,
        "clv": 0.5,
        "source_url": "https://nsearchives.nseindia.com/example.csv",
        "ingested_at": "2026-09-04T14:00:00Z",
        "validation_status": "valid",
    }]

    latest = _persist_delivery_rows(rows, "2026-06-01", attempts=2)

    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT value FROM concurrent_marker").fetchone()[0] == "preserved"
    assert conn.execute("SELECT delivered_qty FROM delivery_daily").fetchone()[0] == 55
    conn.close()
    assert latest == "2026-09-04"
    assert pulls == [True, True]
    assert len(pushes) == 2


def test_cloud_delivery_database_is_isolated_from_auth_database(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "AUTH_DB_DIR", str(tmp_path))
    monkeypatch.setattr(main, "AUTH_DB_PATH", str(tmp_path / "alphanova.db"))
    monkeypatch.setattr(main, "_blob_token", lambda: "vercel_blob_rw_test_store_token")
    monkeypatch.setattr(main, "_delivery_blob_context", threading.local())

    path = main._delivery_operation_db_path()

    assert path != main.AUTH_DB_PATH
    assert os.path.dirname(path) == str(tmp_path)
    assert os.path.basename(path).startswith("delivery-")


# --- spurt signals ---

def _seed(conn, symbol, days_and_values):
    conn.executemany(
        "INSERT OR REPLACE INTO delivery_daily (symbol, trade_date, close, deliv_per, clv) VALUES (?, ?, ?, ?, ?)",
        [(symbol, d.isoformat(), 100.0, dp, clv) for d, dp, clv in days_and_values])

def test_delivery_signals_spurt_and_history_floor():
    _clear_delivery()
    conn = _delivery_db()
    latest = date(2026, 7, 3)
    # SPURTY: 20 prior days at 40%, latest at 60% into a strong close -> spurt 1.5
    hist = [(latest - timedelta(days=i), 40.0, 0.0) for i in range(1, 21)]
    _seed(conn, "SPURTY", hist + [(latest, 60.0, 0.8)])
    # SHY: only 5 days of history -> excluded
    _seed(conn, "SHY", [(latest - timedelta(days=i), 50.0, 0.0) for i in range(1, 6)] + [(latest, 80.0, 0.9)])
    conn.commit()
    conn.close()

    sig = _delivery_signals()
    assert "SHY" not in sig
    s = sig["SPURTY"]
    assert abs(s["spurt"] - 1.5) < 1e-9
    assert abs(s["clv01"] - 0.9) < 1e-9   # (0.8 + 1) / 2
    assert s["deliv_per"] == 60.0


# --- scoring ---

def test_delivery_score_bounds_and_direction():
    assert _delivery_score(None, "LONG") == 0.0
    full = {"spurt": 1.5, "clv01": 1.0, "deliv_per": 70.0}
    assert _delivery_score(full, "LONG") == 10.0
    assert _delivery_score(full, "SHORT") == 0.0          # strong close hurts shorts
    weak = {"spurt": 2.0, "clv01": 0.0, "deliv_per": 70.0}
    assert _delivery_score(weak, "SHORT") == 10.0
    approved_rule = {"spurt": 1.3, "clv01": 0.7, "deliv_per": 55.0}
    assert _delivery_score(approved_rule, "LONG") >= 7.0  # spec: HIGH CLV + HIGH delivery
    for spurt in (0.0, 0.5, 1.3, 5.0):
        for clv01 in (0.0, 0.3, 0.7, 1.0):
            for side in ("LONG", "SHORT"):
                s = _delivery_score({"spurt": spurt, "clv01": clv01, "deliv_per": 50.0}, side)
                assert 0.0 <= s <= 10.0
