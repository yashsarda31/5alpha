import sqlite3
from datetime import date, timedelta

import pytest
from fastapi import HTTPException, Response

from api import main
from api.delivery_research import ensure_delivery_columns, upsert_delivery_rows


def prepare_database(path, history=20):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE delivery_daily (
            symbol TEXT NOT NULL, trade_date TEXT NOT NULL, close REAL,
            deliv_per REAL, clv REAL, PRIMARY KEY(symbol, trade_date)
        )"""
    )
    ensure_delivery_columns(conn)
    latest = date(2026, 7, 31)
    rows = []
    for offset in range(history, -1, -1):
        day = latest - timedelta(days=offset)
        rows.append({
            "symbol": "RELIANCE", "trade_date": day.isoformat(), "series": "EQ",
            "prev_close": 99, "close": 100, "deliv_per": 60 if offset == 0 else 40,
            "traded_qty": 4000 if offset == 0 else 2500,
            "delivered_qty": 3000 if offset == 0 else 1000,
            "turnover_lacs": 12, "clv": 0.5,
            "source_url": "https://nsearchives.nseindia.com/source.csv",
            "ingested_at": "2026-07-31T14:30:00Z", "validation_status": "valid",
        })
    upsert_delivery_rows(conn, rows)
    conn.close()


@pytest.fixture
def delivery_db(tmp_path, monkeypatch):
    path = tmp_path / "delivery.sqlite"
    prepare_database(path)

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(main, "_delivery_db", connect)
    monkeypatch.setattr(main, "_delivery_expected_day", lambda: date(2026, 7, 31))
    return path


def test_delivery_radar_endpoint_has_source_date_coverage_and_cache_header(delivery_db):
    response = Response()
    result = main.get_delivery_radar(response=response, limit=25)

    assert result["source_status"] == "fresh"
    assert result["trade_date"] == "2026-07-31"
    assert result["coverage"]["eligible"] == 1
    assert result["data"][0]["symbol"] == "RELIANCE"
    assert result["methodology"]["baseline_sessions"] == 20
    assert response.headers["Cache-Control"] == "public, max-age=300, stale-while-revalidate=1800"


def test_delivery_radar_endpoint_labels_old_snapshot_stale(delivery_db, monkeypatch):
    monkeypatch.setattr(main, "_delivery_expected_day", lambda: date(2026, 8, 7))
    result = main.get_delivery_radar(response=Response(), limit=10)
    assert result["source_status"] == "stale"
    assert "2026-07-31" in result["availability_message"]


def test_stock_delivery_endpoint_normalizes_symbol_and_rejects_junk(delivery_db):
    result = main.get_stock_delivery("reliance.ns", response=Response(), limit=30)
    assert result["symbol"] == "RELIANCE"
    assert result["canonical_url"].endswith("/stocks/RELIANCE/delivery-percentage")

    with pytest.raises(HTTPException) as error:
        main.get_stock_delivery("BAD/SYMBOL", response=Response(), limit=30)
    assert error.value.status_code == 400


def test_stock_delivery_endpoint_returns_404_for_unknown_symbol(delivery_db):
    with pytest.raises(HTTPException) as error:
        main.get_stock_delivery("UNKNOWN", response=Response(), limit=30)
    assert error.value.status_code == 404


def test_public_delivery_routes_return_crawler_html_and_png(delivery_db):
    page = main.public_delivery_radar_page()
    assert page.status_code == 200
    assert page.media_type == "text/html"
    assert b"High Delivery Volume Stocks Today" in page.body
    assert b"2026-07-31" in page.body

    stock = main.public_stock_delivery_page("RELIANCE")
    assert stock.status_code == 200
    assert b"RELIANCE delivery percentage" in stock.body

    preview = main.public_research_preview("delivery-radar")
    assert preview.media_type == "image/png"
    assert preview.body.startswith(b"\x89PNG")
    assert preview.headers["Cache-Control"] == "public, max-age=300, stale-while-revalidate=1800"
