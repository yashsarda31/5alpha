from __future__ import annotations

import csv
import hashlib
import io
import time
import zipfile
from datetime import date
from pathlib import Path
from typing import Any, Callable, Iterable

import pandas as pd
import requests
import yfinance as yf

FO_ARCHIVE_URL = (
    "https://nsearchives.nseindia.com/content/fo/"
    "BhavCopy_NSE_FO_0_0_0_{ymd}_F_0000.csv.zip"
)
NSE_ARCHIVE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/",
}


def _number(value: Any) -> float | None:
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return parsed if pd.notna(parsed) else None


def _parse_fo_archive(payload: bytes) -> list[dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        if not names:
            raise ValueError("fo_archive_has_no_csv")
        raw_text = archive.read(names[0]).decode("utf-8-sig", "ignore")

    nearest: dict[str, dict[str, str]] = {}
    for raw_row in csv.DictReader(io.StringIO(raw_text)):
        row = {str(key).strip(): value for key, value in raw_row.items()}
        if str(row.get("FinInstrmTp", "")).strip() != "STF":
            continue
        symbol = str(row.get("TckrSymb", "")).strip()
        expiry = str(row.get("XpryDt", "")).strip()
        if symbol and (symbol not in nearest or expiry < nearest[symbol].get("XpryDt", "z")):
            nearest[symbol] = row

    normalized: list[dict[str, Any]] = []
    for symbol, row in sorted(nearest.items()):
        close = _number(row.get("ClsPric"))
        previous_close = _number(row.get("PrvsClsgPric"))
        open_price = _number(row.get("OpnPric"))
        high = _number(row.get("HghPric"))
        low = _number(row.get("LwPric"))
        oi = _number(row.get("OpnIntrst"))
        oi_delta = _number(row.get("ChngInOpnIntrst"))
        if None in (close, previous_close, open_price, high, low, oi, oi_delta):
            continue
        if close <= 0 or previous_close <= 0:
            continue
        previous_oi = oi - oi_delta
        normalized.append(
            {
                "symbol": symbol,
                "expiry": row.get("XpryDt"),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "prev_close": previous_close,
                "price_change_pct": (close - previous_close) / previous_close * 100.0,
                "oi": oi,
                "oi_change": oi_delta,
                "oi_change_pct": oi_delta / previous_oi * 100.0 if previous_oi > 0 else 0.0,
                "volume": _number(row.get("TtlTradgVol")) or 0.0,
                "trades": _number(row.get("TtlNbOfTxsExctd")) or 0.0,
                "delivery_change_pct": 0.0,
            }
        )
    return normalized


def fetch_india_fo_session(
    session_date: date,
    cache_dir: str | Path,
    http_get: Callable[..., Any] = requests.get,
) -> list[dict[str, Any]]:
    """Return normalized near-month stock futures; cache immutable archives."""
    cache_path = Path(cache_dir)
    cache_path.mkdir(parents=True, exist_ok=True)
    ymd = session_date.strftime("%Y%m%d")
    archive_path = cache_path / f"fo_{ymd}.csv.zip"
    hash_path = cache_path / f"fo_{ymd}.sha256"

    if archive_path.exists():
        payload = archive_path.read_bytes()
    else:
        url = FO_ARCHIVE_URL.format(ymd=ymd)
        last_error: Exception | None = None
        payload = b""
        for attempt in range(3):
            try:
                response = http_get(url, headers=NSE_ARCHIVE_HEADERS, timeout=25)
                if response.status_code == 404:
                    return []
                if response.status_code == 200:
                    payload = response.content
                    break
                last_error = RuntimeError(f"fo_archive_http_{response.status_code}:{session_date}")
            except requests.RequestException as exc:
                last_error = exc
            if attempt < 2:
                time.sleep(0.25 * (attempt + 1))
        if not payload:
            raise RuntimeError(f"fo_archive_unavailable:{session_date}:{last_error}")
        _parse_fo_archive(payload)
        archive_path.write_bytes(payload)

    digest = hashlib.sha256(payload).hexdigest()
    if not hash_path.exists() or hash_path.read_text(encoding="ascii").strip() != digest:
        hash_path.write_text(digest + "\n", encoding="ascii")
    return _parse_fo_archive(payload)


def _yf_symbol(symbol: str, market: str) -> str:
    if market == "IN" and not symbol.endswith((".NS", ".BO")) and not symbol.startswith("^"):
        return f"{symbol}.NS"
    return symbol


def fetch_daily_bars(
    symbols: Iterable[str],
    start: date,
    end: date,
    market: str,
    downloader: Callable[..., pd.DataFrame] = yf.download,
) -> dict[str, pd.DataFrame]:
    """Return adjusted daily OHLCV frames keyed by the caller's symbols."""
    originals = list(dict.fromkeys(str(symbol) for symbol in symbols))
    yahoo_to_original = {_yf_symbol(symbol, market): symbol for symbol in originals}
    result: dict[str, pd.DataFrame] = {}
    for offset in range(0, len(yahoo_to_original), 50):
        batch = list(yahoo_to_original)[offset : offset + 50]
        downloaded = downloader(
            batch,
            start=start.isoformat(),
            end=end.isoformat(),
            auto_adjust=True,
            actions=False,
            progress=False,
            threads=True,
            group_by="ticker",
        )
        if downloaded is None or downloaded.empty:
            continue
        for yahoo_symbol in batch:
            if isinstance(downloaded.columns, pd.MultiIndex):
                if yahoo_symbol not in downloaded.columns.get_level_values(0):
                    continue
                frame = downloaded[yahoo_symbol].copy()
            elif len(batch) == 1:
                frame = downloaded.copy()
            else:
                continue
            frame.columns = [str(column).strip().lower() for column in frame.columns]
            needed = ["open", "high", "low", "close", "volume"]
            if any(column not in frame for column in needed):
                continue
            frame = frame[needed].dropna(subset=["open", "high", "low", "close"])
            frame.index = pd.to_datetime(frame.index).tz_localize(None)
            if not frame.empty:
                result[yahoo_to_original[yahoo_symbol]] = frame
    return result
