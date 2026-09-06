"""Auditable NSE delivery parsing and read-only research views."""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone


DELIVERY_COLUMNS = {
    "series": "TEXT",
    "prev_close": "REAL",
    "traded_qty": "INTEGER",
    "delivered_qty": "INTEGER",
    "turnover_lacs": "REAL",
    "source_url": "TEXT",
    "ingested_at": "TEXT",
    "validation_status": "TEXT NOT NULL DEFAULT 'legacy'",
}
BASELINE_SESSIONS = 20
SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9&.-]{0,24}$")


def ensure_delivery_columns(conn) -> None:
    """Apply an additive migration that keeps existing signal rows intact."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(delivery_daily)")}
    for name, declaration in DELIVERY_COLUMNS.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE delivery_daily ADD COLUMN {name} {declaration}")
    conn.commit()


def delivery_quantity_backfill_dates(conn, expected: date, target_weekdays: int = 30) -> list[date]:
    """Return recent weekdays that have no validated delivered-quantity data."""
    ensure_delivery_columns(conn)
    candidates = []
    cursor = expected
    while len(candidates) < max(1, target_weekdays):
        if cursor.weekday() < 5:
            candidates.append(cursor)
        cursor -= timedelta(days=1)
    available = {
        row[0]
        for row in conn.execute(
            """SELECT DISTINCT trade_date FROM delivery_daily
               WHERE delivered_qty IS NOT NULL AND validation_status = 'valid'
                 AND trade_date >= ? AND trade_date <= ?""",
            (candidates[-1].isoformat(), candidates[0].isoformat()),
        )
    }
    return sorted(day for day in candidates if day.isoformat() not in available)


def _number(raw, *, integer=False):
    value = float(str(raw).strip())
    return int(value) if integer else value


def _clv(high: float, low: float, close: float) -> float:
    if high <= low:
        return 0.0
    return ((close - low) - (high - close)) / (high - low)


def parse_delivery_rows(
    text: str,
    universe: set[str],
    trade_date: date,
    *,
    source_url: str = "",
    ingested_at: str | None = None,
) -> list[dict]:
    """Parse and validate one official NSE security-wise delivery file."""
    reader = csv.reader(io.StringIO(text))
    try:
        header = [cell.strip() for cell in next(reader)]
    except StopIteration:
        return []
    required = (
        "SYMBOL", "SERIES", "PREV_CLOSE", "HIGH_PRICE", "LOW_PRICE",
        "CLOSE_PRICE", "TTL_TRD_QNTY", "TURNOVER_LACS", "DELIV_QTY", "DELIV_PER",
    )
    try:
        col = {name: header.index(name) for name in required}
    except ValueError:
        return []
    ingested = ingested_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    allowed = {symbol.upper().removesuffix(".NS") for symbol in universe}
    parsed = []
    for raw in reader:
        try:
            symbol = raw[col["SYMBOL"]].strip().upper()
            series = raw[col["SERIES"]].strip().upper()
            if series != "EQ" or symbol not in allowed:
                continue
            prev_close = _number(raw[col["PREV_CLOSE"]])
            high = _number(raw[col["HIGH_PRICE"]])
            low = _number(raw[col["LOW_PRICE"]])
            close = _number(raw[col["CLOSE_PRICE"]])
            traded_qty = _number(raw[col["TTL_TRD_QNTY"]], integer=True)
            delivered_qty = _number(raw[col["DELIV_QTY"]], integer=True)
            turnover_lacs = _number(raw[col["TURNOVER_LACS"]])
            delivery_pct = _number(raw[col["DELIV_PER"]])
            if (
                min(prev_close, high, low, close, turnover_lacs) < 0
                or traded_qty < 0
                or delivered_qty < 0
                or delivered_qty > traded_qty
                or not 0 <= delivery_pct <= 100
                or (traded_qty > 0 and abs(delivery_pct - (delivered_qty / traded_qty * 100)) > 0.2)
                or high < low
                or not low <= close <= high
            ):
                continue
            parsed.append({
                "symbol": symbol,
                "trade_date": trade_date.isoformat(),
                "series": series,
                "prev_close": prev_close,
                "close": close,
                "deliv_per": delivery_pct,
                "traded_qty": traded_qty,
                "delivered_qty": delivered_qty,
                "turnover_lacs": turnover_lacs,
                "clv": _clv(high, low, close),
                "source_url": source_url,
                "ingested_at": ingested,
                "validation_status": "valid",
            })
        except (IndexError, TypeError, ValueError):
            continue
    return parsed


def upsert_delivery_rows(conn, rows: list[dict]) -> int:
    if not rows:
        return 0
    ensure_delivery_columns(conn)
    fields = (
        "symbol", "trade_date", "series", "prev_close", "close", "deliv_per",
        "traded_qty", "delivered_qty", "turnover_lacs", "clv", "source_url",
        "ingested_at", "validation_status",
    )
    conn.executemany(
        f"INSERT OR REPLACE INTO delivery_daily ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
        [tuple(row.get(field) for field in fields) for row in rows],
    )
    conn.commit()
    return len(rows)


def normalize_symbol(symbol: str) -> str:
    normalized = str(symbol or "").strip().upper().removesuffix(".NS")
    if not SYMBOL_PATTERN.fullmatch(normalized):
        raise ValueError("Invalid NSE symbol")
    return normalized


def _ratio(value, baseline):
    if value is None or baseline is None or baseline <= 0:
        return None
    return value / baseline


def _public_row(row, baseline: list) -> dict:
    avg_pct = sum(item["deliv_per"] for item in baseline) / len(baseline) if baseline else None
    qty_values = [item["delivered_qty"] for item in baseline if item["delivered_qty"] is not None]
    avg_qty = sum(qty_values) / len(qty_values) if len(qty_values) == len(baseline) and baseline else None
    prev_close = row["prev_close"]
    price_change = ((row["close"] / prev_close) - 1) * 100 if prev_close and row["close"] is not None else None
    return {
        "symbol": row["symbol"],
        "trade_date": row["trade_date"],
        "close": row["close"],
        "price_change_pct": price_change,
        "delivery_pct": row["deliv_per"],
        "delivery_pct_avg_20": avg_pct,
        "delivery_pct_ratio": _ratio(row["deliv_per"], avg_pct),
        "traded_qty": row["traded_qty"],
        "delivered_qty": row["delivered_qty"],
        "delivered_qty_avg_20": avg_qty,
        "delivered_qty_ratio": _ratio(row["delivered_qty"], avg_qty),
        "turnover_lacs": row["turnover_lacs"],
        "baseline_samples": len(baseline),
        "source_url": row["source_url"],
        "ingested_at": row["ingested_at"],
    }


def delivery_radar_rows(conn, limit: int = 100) -> dict:
    ensure_delivery_columns(conn)
    limit = max(1, min(int(limit), 100))
    latest = conn.execute(
        "SELECT MAX(trade_date) FROM delivery_daily WHERE validation_status = 'valid'"
    ).fetchone()[0]
    if not latest:
        return {"trade_date": None, "coverage": {"eligible": 0, "latest_rows": 0, "required_baseline_sessions": BASELINE_SESSIONS}, "data": []}
    rows = conn.execute(
        "SELECT * FROM delivery_daily WHERE validation_status = 'valid' ORDER BY symbol, trade_date DESC"
    ).fetchall()
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["symbol"]].append(row)
    latest_rows = [items[0] for items in grouped.values() if items and items[0]["trade_date"] == latest]
    eligible = []
    for row in latest_rows:
        history = grouped[row["symbol"]][1:BASELINE_SESSIONS + 1]
        if len(history) != BASELINE_SESSIONS or row["delivered_qty"] is None or any(item["delivered_qty"] is None for item in history):
            continue
        eligible.append(_public_row(row, history))
    eligible.sort(key=lambda item: (item["delivered_qty_ratio"] or -1, item["delivery_pct_ratio"] or -1), reverse=True)
    return {
        "trade_date": latest,
        "coverage": {"eligible": len(eligible), "latest_rows": len(latest_rows), "required_baseline_sessions": BASELINE_SESSIONS},
        "data": eligible[:limit],
    }


def stock_delivery_history(conn, symbol: str, limit: int = 90) -> dict:
    ensure_delivery_columns(conn)
    normalized = normalize_symbol(symbol)
    limit = max(1, min(int(limit), 120))
    all_rows = conn.execute(
        "SELECT * FROM delivery_daily WHERE symbol = ? AND validation_status = 'valid' ORDER BY trade_date DESC",
        (normalized,),
    ).fetchall()
    if not all_rows:
        return {"symbol": normalized, "trade_date": None, "baseline_complete": False, "baseline_samples": 0, "data": []}
    baseline = all_rows[1:BASELINE_SESSIONS + 1]
    output = []
    for index, row in enumerate(all_rows[:limit]):
        prior = all_rows[index + 1:index + 1 + BASELINE_SESSIONS]
        output.append(_public_row(row, prior))
    return {
        "symbol": normalized,
        "trade_date": all_rows[0]["trade_date"],
        "baseline_complete": len(baseline) == BASELINE_SESSIONS and all(item["delivered_qty"] is not None for item in baseline),
        "baseline_samples": len(baseline),
        "data": output,
    }
