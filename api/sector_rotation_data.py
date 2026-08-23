from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO

import pandas as pd
import requests


ARCHIVE_URL = "https://nsearchives.nseindia.com/content/indices/ind_close_all_{stamp}.csv"
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
