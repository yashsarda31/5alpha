import sqlite3
from datetime import date, timedelta

import pytest

from delivery_research import (
    delivery_quantity_backfill_dates,
    delivery_radar_rows,
    ensure_delivery_columns,
    parse_delivery_rows,
    stock_delivery_history,
    upsert_delivery_rows,
)


HEADER = (
    "SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE,"
    " LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS,"
    " NO_OF_TRADES, DELIV_QTY, DELIV_PER"
)


def csv_text(*rows):
    return "\n".join((HEADER, *rows))


def database():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE delivery_daily (
            symbol TEXT NOT NULL, trade_date TEXT NOT NULL, close REAL,
            deliv_per REAL, clv REAL, PRIMARY KEY(symbol, trade_date)
        )"""
    )
    ensure_delivery_columns(conn)
    return conn


def test_parse_delivery_rows_keeps_auditable_quantity_fields():
    rows = parse_delivery_rows(
        csv_text(
            "RELIANCE, EQ, 03-Jul-2026, 1303.50, 1312, 1312, 1302, 1305, 1304, 1305.14, 7839550, 102317.33, 209968, 5182007, 66.10"
        ),
        {"RELIANCE"},
        date(2026, 7, 3),
        source_url="https://nsearchives.nseindia.com/example.csv",
        ingested_at="2026-07-03T14:00:00Z",
    )

    assert rows == [{
        "symbol": "RELIANCE", "trade_date": "2026-07-03", "series": "EQ",
        "prev_close": 1303.5, "close": 1304.0, "deliv_per": 66.1,
        "traded_qty": 7_839_550, "delivered_qty": 5_182_007,
        "turnover_lacs": 102_317.33, "clv": pytest.approx(-0.6),
        "source_url": "https://nsearchives.nseindia.com/example.csv",
        "ingested_at": "2026-07-03T14:00:00Z", "validation_status": "valid",
    }]


@pytest.mark.parametrize("invalid_tail", [
    "100, 101, 50.0",   # delivered quantity exceeds traded quantity
    "100, -1, 50.0",    # negative quantity
    "100, 50, 101.0",   # delivery percentage outside its domain
])
def test_parse_delivery_rows_rejects_invalid_quantities(invalid_tail):
    row = f"TEST, EQ, 03-Jul-2026, 99, 100, 101, 98, 100, 100, 100, {invalid_tail}"
    assert parse_delivery_rows(csv_text(row), {"TEST"}, date(2026, 7, 3)) == []


def test_parse_delivery_rows_rejects_percentage_that_disagrees_with_quantities():
    row = "TEST, EQ, 03-Jul-2026, 99, 100, 101, 98, 100, 100, 100, 100, 10, 5, 50, 60.0"
    assert parse_delivery_rows(csv_text(row), {"TEST"}, date(2026, 7, 3)) == []


def seed_symbol(conn, symbol, start, delivered_latest=3000, history=20):
    rows = []
    for offset in range(history, -1, -1):
        session = start - timedelta(days=offset)
        delivered = delivered_latest if offset == 0 else 1000
        rows.append({
            "symbol": symbol, "trade_date": session.isoformat(), "series": "EQ",
            "prev_close": 99, "close": 100, "deliv_per": 60 if offset == 0 else 40,
            "traded_qty": 4000 if offset == 0 else 2500,
            "delivered_qty": delivered, "turnover_lacs": 10,
            "clv": 0.5, "source_url": "https://nsearchives.nseindia.com/source.csv",
            "ingested_at": "2026-07-03T14:00:00Z", "validation_status": "valid",
        })
    upsert_delivery_rows(conn, rows)


def test_delivery_radar_requires_twenty_prior_sessions_and_ranks_quantity_spurt():
    conn = database()
    latest = date(2026, 7, 31)
    seed_symbol(conn, "RELIANCE", latest, delivered_latest=3000, history=20)
    seed_symbol(conn, "TCS", latest, delivered_latest=2000, history=20)
    seed_symbol(conn, "SHORT", latest, delivered_latest=9000, history=19)

    result = delivery_radar_rows(conn, limit=10)

    assert [row["symbol"] for row in result["data"]] == ["RELIANCE", "TCS"]
    assert result["trade_date"] == "2026-07-31"
    assert result["coverage"] == {"eligible": 2, "latest_rows": 3, "required_baseline_sessions": 20}
    assert result["data"][0]["delivered_qty_ratio"] == pytest.approx(3.0)
    assert result["data"][0]["delivery_pct_ratio"] == pytest.approx(1.5)
    assert result["data"][0]["price_change_pct"] == pytest.approx(1.010101, rel=1e-5)
    conn.close()


def test_stock_history_returns_latest_first_and_marks_incomplete_baseline():
    conn = database()
    latest = date(2026, 7, 31)
    seed_symbol(conn, "INFY", latest, history=4)

    result = stock_delivery_history(conn, "infy.ns", limit=3)

    assert result["symbol"] == "INFY"
    assert result["baseline_complete"] is False
    assert result["baseline_samples"] == 4
    assert len(result["data"]) == 3
    assert result["data"][0]["trade_date"] == "2026-07-31"
    for row in result["data"]:
        assert row["delivery_pct_avg_20"] is None
        assert row["delivered_qty_avg_20"] is None
        assert row["delivery_pct_ratio"] is None
        assert row["delivered_qty_ratio"] is None
    conn.close()


def test_stock_history_rejects_non_nse_symbol_syntax():
    conn = database()
    with pytest.raises(ValueError, match="Invalid NSE symbol"):
        stock_delivery_history(conn, "BAD/SYMBOL", limit=30)
    conn.close()


def test_quantity_backfill_finds_recent_sessions_missing_auditable_quantities():
    conn = database()
    expected = date(2026, 7, 10)  # Friday
    conn.execute(
        "INSERT INTO delivery_daily (symbol, trade_date, close, deliv_per, clv) VALUES (?, ?, ?, ?, ?)",
        ("LEGACY", "2026-07-09", 100, 50, 0),
    )
    conn.execute(
        "INSERT INTO delivery_daily (symbol, trade_date, close, deliv_per, clv, delivered_qty, validation_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("VALID", "2026-07-10", 100, 50, 0, 1000, "valid"),
    )
    conn.commit()

    missing = delivery_quantity_backfill_dates(conn, expected, target_weekdays=3)

    assert missing == [date(2026, 7, 8), date(2026, 7, 9)]
    conn.close()
