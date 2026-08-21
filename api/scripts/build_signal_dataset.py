from __future__ import annotations

import argparse
import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from api.signal_model.costs import round_trip_cost_pct
from api.signal_model.features import FEATURE_SCHEMA_V1
from api.signal_model.providers import fetch_daily_bars, fetch_india_fo_session
from api.signal_model.replay import replay_market


def _calendar_days(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _daily_contexts(
    frames: dict[str, pd.DataFrame], symbols: list[str], benchmark: str, vix: str
) -> dict[date, dict[str, float]]:
    benchmark_frame = frames.get(benchmark, pd.DataFrame())
    vix_frame = frames.get(vix, pd.DataFrame())
    benchmark_returns = (
        benchmark_frame.close.pct_change() * 100
        if not benchmark_frame.empty
        else pd.Series(dtype=float)
    )
    vix_close = vix_frame.close if not vix_frame.empty else pd.Series(dtype=float)
    symbol_returns = {
        symbol: frame.close.pct_change() * 100
        for symbol, frame in frames.items()
        if symbol in symbols and not frame.empty
    }
    all_dates = sorted(
        {
            pd.Timestamp(index).date()
            for frame in frames.values()
            for index in frame.index
        }
    )
    contexts: dict[date, dict[str, float]] = {}
    for day in all_dates:
        timestamp = pd.Timestamp(day)
        index_return = (
            float(benchmark_returns.loc[timestamp])
            if timestamp in benchmark_returns.index and pd.notna(benchmark_returns.loc[timestamp])
            else 0.0
        )
        daily_returns = [
            float(series.loc[timestamp])
            for series in symbol_returns.values()
            if timestamp in series.index and pd.notna(series.loc[timestamp])
        ]
        breadth = (
            sum(value > 0 for value in daily_returns) / len(daily_returns) * 100.0
            if daily_returns
            else 50.0
        )
        if timestamp in vix_close.index and pd.notna(vix_close.loc[timestamp]):
            vix_window = vix_close.loc[:timestamp].tail(252).dropna()
            vix_percentile = float((vix_window <= vix_window.iloc[-1]).mean())
        else:
            vix_percentile = 0.5
        if timestamp in benchmark_frame.index:
            benchmark_history = benchmark_frame.close.loc[:timestamp].tail(50).dropna()
            regime = (
                1.0
                if len(benchmark_history) >= 20
                and float(benchmark_history.iloc[-1]) >= float(benchmark_history.mean())
                else -1.0
            )
        else:
            regime = 0.0
        contexts[day] = {
            "index_return_pct": index_return,
            # Sector history is not present in the archive bundle. Use the
            # broad index proxy and disclose this explicitly in the manifest.
            "sector_return_pct": index_return,
            "breadth_pct": breadth,
            "vix_percentile": vix_percentile,
            "regime": regime,
        }
    return contexts


def _build_india_dataset(
    start: date, end: date, cache_dir: Path
) -> tuple[pd.DataFrame, dict[str, Any]]:
    raw_cache = cache_dir / "raw"
    fo_start = start - timedelta(days=75)
    fo_by_date: dict[date, list[dict[str, Any]]] = {}
    retrieval_errors: list[dict[str, str]] = []
    for day in _calendar_days(fo_start, end):
        try:
            rows = fetch_india_fo_session(day, raw_cache)
        except RuntimeError as exc:
            retrieval_errors.append({"date": day.isoformat(), "error": str(exc)})
            continue
        if rows:
            fo_by_date[day] = rows
    if retrieval_errors:
        details = ";".join(f'{item["date"]}:{item["error"]}' for item in retrieval_errors[:10])
        raise RuntimeError(f"fo_provider_errors:{details}")

    requested_fo = {
        day: rows for day, rows in fo_by_date.items() if start <= day <= end
    }
    symbols = sorted({row["symbol"] for rows in requested_fo.values() for row in rows})
    if not symbols:
        raise RuntimeError(f"no_india_fo_sessions:{start}:{end}")

    benchmark, vix = "^NSEI", "^INDIAVIX"
    daily_start = start - timedelta(days=400)
    daily_end = end + timedelta(days=15)
    frames = fetch_daily_bars(
        [*symbols, benchmark, vix], daily_start, daily_end + timedelta(days=1), "IN"
    )
    missing_symbols = sorted(set(symbols) - set(frames))
    if missing_symbols:
        raise RuntimeError(
            f"daily_bars_missing:{len(missing_symbols)}:{','.join(missing_symbols[:20])}"
        )

    contexts = _daily_contexts(frames, symbols, benchmark, vix)
    all_session_dates = sorted(
        {
            pd.Timestamp(index).date()
            for symbol in symbols
            for index in frames[symbol].index
            if daily_start <= pd.Timestamp(index).date() <= daily_end
        }
    )
    fo_lookup = {
        (day, row["symbol"]): row for day, rows in fo_by_date.items() for row in rows
    }
    last_oi: dict[str, float] = {}
    sessions: list[dict[str, Any]] = []
    for day in all_session_dates:
        timestamp = pd.Timestamp(day)
        bars: dict[str, dict[str, float]] = {}
        for symbol in symbols:
            frame = frames[symbol]
            if timestamp not in frame.index:
                continue
            daily = frame.loc[timestamp]
            official = fo_lookup.get((day, symbol))
            if official is not None:
                last_oi[symbol] = float(official["oi"])
            oi = last_oi.get(symbol, float(daily["volume"]))
            bars[symbol] = {
                "open": float(daily["open"]),
                "high": float(daily["high"]),
                "low": float(daily["low"]),
                "close": float(daily["close"]),
                "volume": float(daily["volume"]),
                "oi": oi,
            }
        candidate_rows: list[dict[str, Any]] = []
        if day in requested_fo:
            for raw_row in requested_fo[day]:
                underlying = bars.get(raw_row["symbol"])
                if underlying is None:
                    continue
                candidate_rows.append(
                    {
                        **raw_row,
                        "reference_entry": underlying["close"],
                        "low": underlying["low"],
                        "high": underlying["high"],
                        "data_as_of": {
                            "fo": day.isoformat(),
                            "daily_bar": day.isoformat(),
                        },
                    }
                )
        sessions.append(
            {
                "session_date": day,
                "fo_rows": candidate_rows,
                "bars": bars,
                "context": contexts.get(day, {}),
            }
        )

    frame = replay_market(sessions, contexts, round_trip_cost_pct, "IN")
    source_hashes = {
        path.with_suffix(".csv.zip").name: path.read_text(encoding="ascii").strip()
        for path in sorted(raw_cache.glob("fo_*.sha256"))
        if fo_start <= date.fromisoformat(path.stem.removeprefix("fo_")[:4] + "-" + path.stem.removeprefix("fo_")[4:6] + "-" + path.stem.removeprefix("fo_")[6:8]) <= end
    }
    manifest = {
        "dataset_format": 1,
        "market": "IN",
        "requested_start": start.isoformat(),
        "requested_end": end.isoformat(),
        "retrieved_trading_sessions": len(requested_fo),
        "candidate_count": int(len(frame)),
        "eligible_count": int(frame.eligible.fillna(0).sum()) if not frame.empty else 0,
        "labeled_count": int(frame.label.notna().sum()) if not frame.empty else 0,
        "feature_schema": list(FEATURE_SCHEMA_V1),
        "source_hashes": source_hashes,
        "daily_price_source": "Yahoo Finance adjusted OHLCV",
        "fo_source": "NSE official derivatives archives",
        "sector_context": "broad-index proxy",
        "retrieval_errors": [],
    }
    return frame, manifest


def build_dataset(
    market: str, start: date, end: date, cache_dir: str | Path
) -> tuple[pd.DataFrame, dict[str, Any]]:
    normalized_market = market.upper()
    if start > end:
        raise ValueError("start_after_end")
    if normalized_market == "IN":
        return _build_india_dataset(start, end, Path(cache_dir))
    raise ValueError("unsupported_market_dataset")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a point-in-time signal dataset")
    parser.add_argument("--market", choices=("IN", "US"), required=True)
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--cache-dir", default="data/signals_v3")
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    frame, manifest = build_dataset(args.market, args.start, args.end, args.cache_dir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False, compression="gzip")
    manifest_path = output.with_suffix(".manifest.json")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
    )
    print(json.dumps({**manifest, "output": str(output), "manifest": str(manifest_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
