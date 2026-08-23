from datetime import date

import pandas as pd

from api.sector_rotation_data import fetch_weekly_index_closes, weekly_snapshot_dates


class FakeResponse:
    def __init__(self, body, status_code=200):
        self.content = body.encode("utf-8")
        self.status_code = status_code


def test_weekly_snapshot_dates_end_on_or_before_as_of_friday():
    dates = weekly_snapshot_dates(date(2026, 8, 23), weeks=3)
    assert dates == [date(2026, 8, 21), date(2026, 8, 14), date(2026, 8, 7)]


def test_fetch_weekly_index_closes_parses_official_archive_rows():
    csv_by_date = {
        "21082026": "Index Name,Index Date,Closing Index Value\nNIFTY 50,21-08-2026,25000\nNIFTY Midcap 100,21-08-2026,63000\n",
        "14082026": "Index Name,Index Date,Closing Index Value\nNIFTY 50,14-08-2026,24800\nNIFTY Midcap 100,14-08-2026,62000\n",
    }

    def fetcher(url, **_kwargs):
        key = url.rsplit("_", 1)[-1].replace(".csv", "")
        return FakeResponse(csv_by_date[key])

    history, missing = fetch_weekly_index_closes(
        ["NIFTY 50", "NIFTY MIDCAP 100"],
        [date(2026, 8, 21), date(2026, 8, 14)],
        fetcher=fetcher,
        min_points=2,
    )
    assert missing == []
    assert list(history["NIFTY MIDCAP 100"].astype(float)) == [62000.0, 63000.0]
    assert isinstance(history["NIFTY 50"].index, pd.DatetimeIndex)
