from datetime import date

import pandas as pd

from api.sector_rotation_data import (
    build_top_sector_stocks,
    fetch_index_constituents,
    fetch_weekly_index_closes,
    rank_relative_momentum,
    weekly_snapshot_dates,
)


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


def test_fetch_index_constituents_reads_symbols_and_ignores_blank_rows():
    body = "Company Name,Industry,Symbol,Series,ISIN Code\nInfosys,IT,INFY,EQ,INE009A01021\nBlank,, ,EQ,\n"
    response = FakeResponse(body)
    symbols = fetch_index_constituents("ind_niftyitlist.csv", fetcher=lambda *_args, **_kwargs: response)
    assert symbols == ["INFY"]


def test_rank_relative_momentum_returns_top_three_vs_benchmark():
    index = pd.date_range("2026-07-01", periods=22, freq="B")
    benchmark = pd.Series([100 + i for i in range(22)], index=index, dtype="float64")
    closes = {
        "AAA.NS": pd.Series([100 + 2 * i for i in range(22)], index=index, dtype="float64"),
        "BBB.NS": pd.Series([100 + 1.5 * i for i in range(22)], index=index, dtype="float64"),
        "CCC.NS": pd.Series([100 + i for i in range(22)], index=index, dtype="float64"),
        "DDD.NS": pd.Series([100 + 0.5 * i for i in range(22)], index=index, dtype="float64"),
    }
    rows, excluded = rank_relative_momentum(closes, benchmark, limit=3)
    assert [row["symbol"] for row in rows] == ["AAA", "BBB", "CCC"]
    assert rows[0]["relative_1m"] > rows[1]["relative_1m"]
    assert excluded == 0


def test_rank_relative_momentum_counts_short_histories_as_excluded():
    index = pd.date_range("2026-07-01", periods=22, freq="B")
    benchmark = pd.Series(range(100, 122), index=index, dtype="float64")
    closes = {"SHORT.NS": pd.Series([100, 101], index=index[:2], dtype="float64")}
    rows, excluded = rank_relative_momentum(closes, benchmark, limit=3)
    assert rows == []
    assert excluded == 1


def test_build_top_sector_stocks_uses_first_three_groups_and_one_price_batch():
    index = pd.date_range("2026-07-01", periods=22, freq="B")
    tickers = ["AAA.NS", "AAB.NS", "AAC.NS", "BAA.NS", "BAB.NS", "BAC.NS", "CAA.NS", "CAB.NS", "CAC.NS", "^NSEI"]
    frames = {}
    for rank, ticker in enumerate(tickers):
        slope = 1 if ticker == "^NSEI" else 2 + rank / 10
        frames[ticker] = pd.DataFrame({"Close": [100 + slope * i for i in range(22)]}, index=index)
    batch = pd.concat(frames, axis=1)
    memberships = {
        "a.csv": ["AAA", "AAB", "AAC"],
        "b.csv": ["BAA", "BAB", "BAC"],
        "c.csv": ["CAA", "CAB", "CAC"],
    }
    calls = []

    def downloader(symbols, **kwargs):
        calls.append((symbols, kwargs))
        return batch

    groups = build_top_sector_stocks(
        [{"name": "A"}, {"name": "B"}, {"name": "C"}, {"name": "D"}],
        {"A": "a.csv", "B": "b.csv", "C": "c.csv", "D": "d.csv"},
        constituent_fetcher=lambda filename: memberships.get(filename, []),
        price_downloader=downloader,
    )

    assert [group["sector"] for group in groups] == ["A", "B", "C"]
    assert all(len(group["stocks"]) == 3 for group in groups)
    assert len(calls) == 1
    assert calls[0][1]["period"] == "3mo"


def test_build_top_sector_stocks_isolates_constituent_failure():
    groups = build_top_sector_stocks(
        [{"name": "A"}, {"name": "B"}, {"name": "C"}],
        {"A": "a.csv", "B": "b.csv", "C": "c.csv"},
        constituent_fetcher=lambda filename: [] if filename == "b.csv" else [filename[0].upper()],
        price_downloader=lambda *_args, **_kwargs: pd.DataFrame(),
    )
    assert [group["sector"] for group in groups] == ["A", "B", "C"]
    assert groups[1]["status"] == "provider_limited"
    assert groups[1]["stocks"] == []
    assert "membership" in groups[1]["message"].lower()
