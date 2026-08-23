from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO

import pandas as pd
import requests


ARCHIVE_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_{stamp}.csv"
CONSTITUENT_URL = "https://www.niftyindices.com/IndexConstituent/{filename}"
ARCHIVE_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _key(value):
    return " ".join(str(value or "").upper().split())


def weekly_snapshot_dates(as_of, weeks=32):
    friday = as_of - timedelta(days=(as_of.weekday() - 4) % 7)
    return [friday - timedelta(days=7 * offset) for offset in range(weeks)]


def fetch_weekly_index_closes(index_names, dates, fetcher=requests.get, min_points=18):
    requested = {_key(name): name for name in index_names}

    def fetch_one(snapshot_date):
        url = ARCHIVE_URL.format(stamp=snapshot_date.strftime("%d%m%Y"))
        try:
            response = fetcher(url, headers=ARCHIVE_HEADERS, timeout=10)
            if response.status_code != 200:
                return None
            frame = pd.read_csv(BytesIO(response.content))
            frame.columns = [str(column).strip() for column in frame.columns]
            names = frame["Index Name"].map(_key)
            values = pd.to_numeric(frame["Closing Index Value"], errors="coerce")
            return snapshot_date, dict(zip(names, values))
        except Exception:
            return None

    workers = min(8, max(1, len(dates)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        snapshots = [item for item in pool.map(fetch_one, dates) if item]
    snapshots.sort(key=lambda item: item[0])

    history = {}
    missing = []
    for normalized, display_name in requested.items():
        points = [(stamp, values.get(normalized)) for stamp, values in snapshots]
        points = [(stamp, value) for stamp, value in points if pd.notna(value)]
        if len(points) < min_points:
            missing.append(display_name)
            continue
        history[display_name] = pd.Series(
            [float(value) for _, value in points],
            index=pd.DatetimeIndex([stamp for stamp, _ in points]),
            dtype="float64",
        )
    return history, missing


def fetch_index_constituents(filename, fetcher=requests.get):
    try:
        response = fetcher(
            CONSTITUENT_URL.format(filename=filename),
            headers=ARCHIVE_HEADERS,
            timeout=12,
        )
    except Exception:
        return []
    if response.status_code != 200 or response.content.lstrip().startswith(b"<!DOCTYPE html"):
        return []
    try:
        frame = pd.read_csv(BytesIO(response.content))
    except Exception:
        return []
    frame.columns = [str(column).strip() for column in frame.columns]
    if "Symbol" not in frame.columns:
        return []
    return [
        symbol
        for symbol in frame["Symbol"].astype(str).str.strip()
        if symbol and symbol.lower() != "nan"
    ]


def rank_relative_momentum(close_by_symbol, benchmark, limit=3):
    ranked = []
    excluded = 0
    for ticker, closes in close_by_symbol.items():
        aligned = pd.concat(
            [closes.rename("stock"), benchmark.rename("benchmark")],
            axis=1,
            join="inner",
        ).dropna()
        if len(aligned) < 22:
            excluded += 1
            continue
        window = aligned.tail(22)
        stock_return = (float(window.stock.iloc[-1]) / float(window.stock.iloc[0]) - 1) * 100
        benchmark_return = (float(window.benchmark.iloc[-1]) / float(window.benchmark.iloc[0]) - 1) * 100
        ranked.append({
            "symbol": ticker.removesuffix(".NS"),
            "return_1m": round(stock_return, 2),
            "relative_1m": round(stock_return - benchmark_return, 2),
        })
    ranked.sort(key=lambda row: row["relative_1m"], reverse=True)
    return ranked[:limit], excluded


def _batch_close(frame, ticker):
    try:
        if isinstance(frame.columns, pd.MultiIndex):
            if ticker in frame.columns.get_level_values(0):
                return frame[ticker]["Close"].dropna()
            if ticker in frame.columns.get_level_values(1):
                return frame["Close"][ticker].dropna()
        if ticker == "^NSEI" and "Close" in frame:
            return frame["Close"].dropna()
    except (KeyError, TypeError):
        pass
    return pd.Series(dtype="float64")


def build_top_sector_stocks(
    sector_rows,
    constituent_files,
    constituent_fetcher,
    price_downloader,
    limit_sectors=3,
    limit_stocks=3,
):
    groups = []
    memberships = {}
    for row in sector_rows[:limit_sectors]:
        sector = row["name"]
        filename = constituent_files.get(sector)
        try:
            symbols = constituent_fetcher(filename) if filename else []
        except Exception:
            symbols = []
        memberships[sector] = [f"{symbol}.NS" for symbol in symbols]
        groups.append({
            "sector": sector,
            "status": "pending" if symbols else "provider_limited",
            "stocks": [],
            "excluded": 0,
            "message": None if symbols else "Official index membership is unavailable.",
        })

    requested = sorted({ticker for symbols in memberships.values() for ticker in symbols})
    if not requested:
        return groups
    try:
        batch = price_downloader(
            " ".join(requested + ["^NSEI"]),
            period="3mo",
            group_by="ticker",
            threads=True,
            progress=False,
            auto_adjust=True,
        )
        benchmark = _batch_close(batch, "^NSEI")
    except Exception:
        benchmark = pd.Series(dtype="float64")
        batch = pd.DataFrame()

    for group in groups:
        if group["status"] == "provider_limited":
            continue
        closes = {
            ticker: _batch_close(batch, ticker)
            for ticker in memberships[group["sector"]]
        }
        stocks, excluded = rank_relative_momentum(closes, benchmark, limit=limit_stocks)
        complete = len(stocks) == limit_stocks and excluded == 0
        group.update({
            "status": "complete" if complete else "provider_limited",
            "stocks": stocks,
            "excluded": excluded,
            "message": None if complete else "Some constituent price histories were unavailable.",
        })
    return groups
