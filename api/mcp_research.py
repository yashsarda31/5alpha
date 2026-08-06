"""Read-only Alpha Nova research services for MCP tools.

This module intentionally never imports or calls the Signals engine, signal ledger,
watchlist writes, predictions, alerts, or account mutations.
"""

from __future__ import annotations

import asyncio
import csv
import io
import math
from datetime import datetime, time as dt_time, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Awaitable, Callable

import requests


ALLOWED_UNIVERSES = {"nifty100", "nifty200"}
MAX_CUSTOM_SYMBOLS = 25
MAX_CANDIDATES = 20
MAX_COMPARE = 10
UNIVERSE_URLS = {
    "nifty100": "https://nsearchives.nseindia.com/content/indices/ind_nifty100list.csv",
    "nifty200": "https://nsearchives.nseindia.com/content/indices/ind_nifty200list.csv",
}
MIN_ADTV_INR = 100_000_000
MAX_POSITION_ADTV_PCT = 2.0
TRADE_COST_BUFFER_BPS = 30
_UNIVERSE_CACHE: dict[str, tuple[float, dict]] = {}
UNIVERSE_CACHE_SECONDS = 24 * 3600


def _main():
    try:
        import main
        return main
    except ImportError:
        from api import main
        return main


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_symbol(raw: str) -> str:
    symbol = (raw or "").strip().upper()
    if symbol.endswith(".NS"):
        symbol = symbol[:-3]
    normalized = _main()._normalize_symbol(symbol)
    if not normalized:
        raise ValueError(f"Invalid Indian equity symbol: {raw!r}")
    return normalized


def _safe(value: Any) -> Any:
    return _main()._json_safe(value)


def _parse_observed_at(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = str(value or "").strip()
        if not raw:
            return None
        raw = raw.replace(" IST", "").replace("Z", "+00:00")
        try:
            if len(raw) == 10:
                parsed = datetime.combine(datetime.fromisoformat(raw).date(), dt_time(10, 0), tzinfo=timezone.utc)
            else:
                parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _source_state(
    source: str,
    observed_at: Any,
    max_age_hours: float,
    *,
    required: bool = True,
    now: datetime | None = None,
    coverage: dict | None = None,
) -> dict:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    parsed = _parse_observed_at(observed_at)
    if parsed is None:
        age_seconds = None
        freshness = "unknown"
    else:
        age_seconds = max(0, int((now - parsed).total_seconds()))
        max_age_seconds = max_age_hours * 3600
        freshness = "live" if age_seconds < max_age_seconds * 0.25 else "recent" if age_seconds <= max_age_seconds else "stale"
    actionable = not required or freshness in {"live", "recent"}
    state = {
        "source": source,
        "observed_at": parsed.isoformat() if parsed else None,
        "age_seconds": age_seconds,
        "freshness": freshness,
        "required": required,
        "actionable": actionable,
    }
    if coverage is not None:
        state["coverage"] = coverage
    return state


def _envelope(
    result: Any,
    sources: list[str],
    warnings: list[str] | None = None,
    as_of: str | None = None,
    *,
    source_status: list[dict] | None = None,
) -> dict:
    warnings = warnings or []
    source_status = source_status or []
    required_states = [item for item in source_status if item.get("required", True)]
    actionable = result not in (None, [], {}) and all(item.get("actionable", False) for item in required_states)
    if not source_status:
        actionable = result not in (None, [], {}) and not warnings
    freshness_order = {"live": 0, "recent": 1, "unknown": 2, "stale": 3}
    freshness = (
        max((item.get("freshness", "unknown") for item in required_states), key=lambda item: freshness_order.get(item, 2))
        if required_states
        else ("live" if not warnings else "recent")
    )
    quality = "complete" if actionable and not warnings else "partial"
    if result in (None, [], {}):
        quality = "insufficient"
        actionable = False
    return _safe({
        "as_of": as_of or _now(),
        "sources": sources,
        "source_status": source_status,
        "freshness": freshness,
        "data_quality": quality,
        "actionable": actionable,
        "warnings": warnings,
        "result": result,
    })


async def _attempt(name: str, awaitable: Awaitable, timeout: float = 25) -> tuple[Any, str | None]:
    try:
        return await asyncio.wait_for(awaitable, timeout=timeout), None
    except asyncio.TimeoutError:
        return None, f"{name} timed out after {int(timeout)} seconds."
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc) or exc.__class__.__name__
        return None, f"{name} unavailable: {detail}"


def _fetch_index_universe(universe: str) -> dict:
    cached = _UNIVERSE_CACHE.get(universe)
    now_ts = datetime.now(timezone.utc).timestamp()
    if cached and now_ts - cached[0] < UNIVERSE_CACHE_SECONDS:
        return cached[1]
    url = UNIVERSE_URLS[universe]
    try:
        response = requests.get(
            url,
            headers={"User-Agent": "AlphaNova/1.0 (+https://alphanova48.in)"},
            timeout=15,
        )
        response.raise_for_status()
        rows = csv.DictReader(io.StringIO(response.content.decode("utf-8-sig")))
        symbols = []
        for row in rows:
            raw = row.get("Symbol") or row.get("SYMBOL") or row.get("symbol")
            if not raw:
                continue
            symbol = normalize_symbol(raw)
            if symbol not in symbols:
                symbols.append(symbol)
        expected_floor = 90 if universe == "nifty100" else 180
        if len(symbols) < expected_floor:
            raise ValueError(f"NSE returned only {len(symbols)} valid {universe} constituents.")
        last_modified = response.headers.get("Last-Modified")
        try:
            constituent_as_of = parsedate_to_datetime(last_modified).date().isoformat() if last_modified else None
        except (TypeError, ValueError):
            constituent_as_of = None
        source_mode = "live_official_csv"
        source_warning = None
    except Exception as exc:
        try:
            from api.index_universe_snapshots import SNAPSHOT_AS_OF, SNAPSHOTS
        except ImportError:
            from index_universe_snapshots import SNAPSHOT_AS_OF, SNAPSHOTS
        symbols = list(SNAPSHOTS[universe])
        constituent_as_of = SNAPSHOT_AS_OF
        source_mode = "bundled_official_snapshot"
        source_warning = (
            f"Live NSE constituent download unavailable; using official snapshot dated {SNAPSHOT_AS_OF} "
            f"({exc.__class__.__name__})."
        )
    result = {
        "symbols": symbols,
        "source": "NSE index constituents",
        "source_url": url,
        "constituent_as_of": constituent_as_of,
        "retrieved_at": _now(),
        "source_mode": source_mode,
        "source_warning": source_warning,
    }
    _UNIVERSE_CACHE[universe] = (now_ts, result)
    return result


async def _load_index_universe(universe: str) -> dict:
    return await asyncio.to_thread(_fetch_index_universe, universe)


def _scan_momentum_sync(symbols: list[str], allow_retry: bool = True) -> dict:
    main = _main()
    attempted = list(dict.fromkeys(normalize_symbol(symbol) for symbol in symbols))
    leaders: list[dict] = []
    breakouts: list[dict] = []
    failures: list[dict] = []
    latest_observed: str | None = None
    for start in range(0, len(attempted), 50):
        chunk = attempted[start:start + 50]
        yf_tickers = [f"{symbol}.NS" for symbol in chunk]
        try:
            frame = main.yf.download(
                " ".join(yf_tickers),
                period="14mo",
                group_by="ticker",
                threads=True,
                progress=False,
                auto_adjust=True,
            )
        except Exception:
            failures.extend({"symbol": symbol, "reason": "provider_batch_error"} for symbol in chunk)
            continue
        for symbol, ticker in zip(chunk, yf_tickers):
            try:
                history = frame[ticker].dropna(how="all") if len(chunk) > 1 else frame.dropna(how="all")
                closes = history["Close"].dropna()
                if len(closes) < 252:
                    failures.append({"symbol": symbol, "reason": "insufficient_history"})
                    continue
                last = float(closes.iloc[-1])
                previous = float(closes.iloc[-2])
                delta = closes.diff()
                gain = delta.clip(lower=0).ewm(com=13, adjust=False).mean()
                loss = (-delta.clip(upper=0)).ewm(com=13, adjust=False).mean()
                rs = gain.iloc[-1] / loss.iloc[-1] if loss.iloc[-1] else float("inf")
                rsi = 100 - (100 / (1 + rs)) if math.isfinite(rs) else 100.0
                high_52w = float(history["High"].tail(252).max())
                sma50 = float(closes.tail(50).mean())
                latest_volume = float(history["Volume"].iloc[-1] or 0)
                average_volume = float(history["Volume"].iloc[-21:-1].mean() or 0)
                vol_ratio = latest_volume / average_volume if average_volume else 0.0
                mom_1m = (last / float(closes.iloc[-21]) - 1) * 100
                mom_6m = (last / float(closes.iloc[-126]) - 1) * 100
                mom_12m = (last / float(closes.iloc[-252]) - 1) * 100
                score = (mom_1m + mom_6m + mom_12m) / 3
                values = (last, rsi, high_52w, sma50, vol_ratio, mom_1m, mom_6m, mom_12m, score)
                if not all(math.isfinite(value) for value in values):
                    failures.append({"symbol": symbol, "reason": "non_finite_market_data"})
                    continue
                observed = closes.index[-1].date().isoformat()
                latest_observed = max(latest_observed or observed, observed)
                leaders.append({
                    "ticker": ticker,
                    "mom_1m": round(mom_1m, 2),
                    "mom_6m": round(mom_6m, 2),
                    "mom_12m": round(mom_12m, 2),
                    "score": round(score, 2),
                    "price": round(last, 2),
                    "chg_today": round((last / previous - 1) * 100 if previous else 0, 2),
                    "rsi": round(rsi, 1),
                    "off_52w_high": round((last / high_52w - 1) * 100, 2),
                    "dist_50dma": round((last / sma50 - 1) * 100, 2),
                    "vol_ratio": round(vol_ratio, 2),
                })
                prior_highs = history["High"].iloc[:-1]
                high_20 = float(prior_highs.tail(20).max())
                if last > high_20:
                    breakouts.append({
                        "ticker": ticker,
                        "price": round(last, 2),
                        "type": "20D HIGH",
                        "level": round(high_20, 2),
                        "vol_ratio": round(vol_ratio, 2),
                        "rsi": round(rsi, 1),
                    })
            except Exception:
                failures.append({"symbol": symbol, "reason": "provider_symbol_error"})
    if allow_retry and failures:
        retry_symbols = list(dict.fromkeys(item["symbol"] for item in failures))
        retried = _scan_momentum_sync(retry_symbols, allow_retry=False)
        retried_set = set(retry_symbols)
        failures = [item for item in failures if item["symbol"] not in retried_set]
        failures.extend(retried["failures"])
        leaders.extend(retried["data"])
        breakouts.extend(retried["breakouts"])
        retry_observed = retried.get("observed_at")
        if retry_observed:
            latest_observed = max(latest_observed or retry_observed, retry_observed)
    leaders.sort(key=lambda item: item["score"], reverse=True)
    return {
        "data": leaders,
        "breakouts": breakouts,
        "observed_at": latest_observed,
        "attempted_symbols": attempted,
        "successful_symbols": [normalize_symbol(row["ticker"]) for row in leaders],
        "failures": failures,
    }


async def _scan_momentum_universe(symbols: list[str]) -> dict:
    return await asyncio.to_thread(_scan_momentum_sync, symbols)


async def get_market_pulse(include_institutional_flow: bool = True) -> dict:
    main = _main()
    retrieved_at = _now()
    calls = [
        _attempt("dashboard", main.get_dashboard(), 30),
        _attempt("sector rotation", main.get_sector_rotation("IN"), 25),
        _attempt("deals", main.get_deals(), 20),
    ]
    if include_institutional_flow:
        calls.append(_attempt("FII/DII", main.get_fiidii_fast(), 15))
    values = await asyncio.gather(*calls)
    (dashboard, dash_error), (sectors, sector_error), (deals, deals_error) = values[:3]
    fiidii, fii_error = values[3] if include_institutional_flow else (None, None)
    warnings = [item for item in (dash_error, sector_error, deals_error, fii_error) if item]

    deal_rows = []
    if isinstance(deals, dict):
        for key in ("block", "bulk", "insider"):
            for row in (deals.get(key) or [])[:5]:
                deal_rows.append({"kind": key, **row})
    flow_rows = (fiidii or {}).get("data", [])[:7] if isinstance(fiidii, dict) else []
    result = {
        "market": "IN",
        "indices": (dashboard or {}).get("indices", []),
        "top_movers": (dashboard or {}).get("movers", []),
        "market_status": (dashboard or {}).get("market_status") or (dashboard or {}).get("status"),
        "sector_rotation": {
            "benchmark": (sectors or {}).get("benchmark"),
            "leaders": (sectors or {}).get("leaders", []),
            "laggards": (sectors or {}).get("laggards", []),
            "sectors": (sectors or {}).get("sectors", [])[:12],
        },
        "institutional_flow": {
            "rows": flow_rows,
            "source_status": (fiidii or {}).get("source_status") if isinstance(fiidii, dict) else None,
            "modeled_history_warning": "FII/DII history beyond the freshest provisional row may be structurally modeled.",
        } if include_institutional_flow else None,
        "notable_deals": deal_rows[:15],
    }
    as_of = (dashboard or {}).get("as_of") or (sectors or {}).get("as_of") or retrieved_at
    dashboard_state = _source_state(
        "dashboard",
        (dashboard or {}).get("as_of") if isinstance(dashboard, dict) else None,
        2,
    )
    if dashboard is not None and dashboard_state["freshness"] == "unknown":
        dashboard_state = _source_state("dashboard", retrieved_at, 2)
        dashboard_state["timestamp_kind"] = "retrieved_at"
    source_status = [
        dashboard_state,
        _source_state(
            "sector_rotation",
            (sectors or {}).get("as_of") if isinstance(sectors, dict) else None,
            24,
            required=False,
        ),
        _source_state("deals", None, 24, required=False),
    ]
    if include_institutional_flow:
        source_status.append(
            _source_state(
                "fiidii",
                (fiidii or {}).get("updated_at") if isinstance(fiidii, dict) else None,
                48,
                required=False,
            )
        )
    return _envelope(
        result,
        ["dashboard", "sector_rotation", "deals"] + (["fiidii"] if include_institutional_flow else []),
        warnings,
        as_of,
        source_status=source_status,
    )


def _candidate_score(row: dict, breakout: dict | None = None, deal_count: int = 0) -> float:
    score = float(row.get("score") or 0)
    rsi = float(row.get("rsi") or 0)
    volume = float(row.get("vol_ratio") or 0)
    off_high = float(row.get("off_52w_high") or -100)
    if breakout:
        score += 5
    if volume >= 1.2:
        score += min(4, volume)
    if -8 <= off_high <= 0:
        score += 2
    if rsi > 76:
        score -= 4
    if rsi and rsi < 42:
        score -= 3
    score += min(3, deal_count)
    return round(score, 2)


async def discover_trade_candidates(
    universe: str = "nifty100",
    custom_symbols: list[str] | None = None,
    holding_days: int = 10,
    max_candidates: int = 10,
    min_momentum: float | None = None,
    min_roe: float | None = None,
    min_eps_growth: float | None = None,
    min_alpha_score: float | None = None,
) -> dict:
    if universe not in ALLOWED_UNIVERSES and not custom_symbols:
        raise ValueError("universe must be nifty100 or nifty200")
    if not 2 <= int(holding_days) <= 20:
        raise ValueError("holding_days must be between 2 and 20")
    max_candidates = max(3, min(int(max_candidates), MAX_CANDIDATES))
    normalized_custom = [normalize_symbol(item) for item in (custom_symbols or [])]
    normalized_custom = list(dict.fromkeys(normalized_custom))
    if len(normalized_custom) > MAX_CUSTOM_SYMBOLS:
        raise ValueError(f"custom_symbols is limited to {MAX_CUSTOM_SYMBOLS}")

    main = _main()
    if normalized_custom:
        universe_snapshot = {
            "symbols": normalized_custom,
            "source": "user supplied custom universe",
            "source_url": None,
            "constituent_as_of": None,
            "retrieved_at": _now(),
        }
        universe_error = None
    else:
        universe_snapshot, universe_error = await _attempt(
            "NSE index constituents", _load_index_universe(universe), 20
        )
    if universe_error or not universe_snapshot:
        warnings = [universe_error or "NSE index constituents unavailable."]
        result = {
            "market": "IN",
            "universe": universe,
            "holding_days": holding_days,
            "candidates": [],
            "candidate_count": 0,
            "coverage": {"requested": 0, "attempted": 0, "successful": 0, "coverage_pct": 0.0},
            "exclusions": [],
            "signals_excluded": True,
        }
        response = _envelope(result, ["nse_index_constituents"], warnings)
        response["data_quality"] = "insufficient"
        response["actionable"] = False
        return response

    requested_symbols = universe_snapshot["symbols"]
    (momentum, momentum_error), (sectors, sector_error), (deals, deals_error) = await asyncio.gather(
        _attempt("momentum", _scan_momentum_universe(requested_symbols), 55),
        _attempt("sector rotation", main.get_sector_rotation("IN"), 25),
        _attempt("deals", main.get_deals(), 20),
    )
    warnings = [
        item for item in (
            universe_snapshot.get("source_warning"),
            momentum_error,
            sector_error,
            deals_error,
        ) if item
    ]
    leaders = list((momentum or {}).get("data", [])) if isinstance(momentum, dict) else []
    breakouts = list((momentum or {}).get("breakouts", [])) if isinstance(momentum, dict) else []
    breakout_by_symbol = {normalize_symbol(row.get("ticker", "")): row for row in breakouts if row.get("ticker")}

    deal_counts: dict[str, int] = {}
    if isinstance(deals, dict):
        for key in ("block", "bulk", "insider"):
            for row in deals.get(key, []) or []:
                raw_symbol = row.get("symbol") or row.get("ticker")
                try:
                    symbol = normalize_symbol(raw_symbol)
                except ValueError:
                    continue
                deal_counts[symbol] = deal_counts.get(symbol, 0) + 1

    # Apply fundamental filters only to the already-bounded momentum shortlist.
    screen_rows: dict[str, dict] = {}
    needs_screen = bool(normalized_custom) or any(value is not None for value in (min_momentum, min_roe, min_eps_growth, min_alpha_score))
    if needs_screen:
        shortlist = [row.get("ticker") for row in leaders[:MAX_CUSTOM_SYMBOLS] if row.get("ticker")]
        if normalized_custom:
            shortlist = [f"{symbol}.NS" for symbol in normalized_custom]
        if shortlist:
            req = main.ScreenerRequest(
                tickers=",".join(shortlist),
                min_momentum=min_momentum,
                min_roe=min_roe,
                min_eps_growth=min_eps_growth,
                min_alpha_score=min_alpha_score,
            )
            screened, screen_error = await _attempt("screener", asyncio.to_thread(main.run_screener, req), 45)
            if screen_error:
                warnings.append(screen_error)
            elif isinstance(screened, dict):
                screen_rows = {normalize_symbol(row["ticker"]): row for row in screened.get("data", [])}
                leaders = [row for row in leaders if normalize_symbol(row.get("ticker", "")) in screen_rows]
                present = {normalize_symbol(row.get("ticker", "")) for row in leaders}
                for symbol in normalized_custom:
                    if symbol not in present and symbol in screen_rows:
                        screened_row = screen_rows[symbol]
                        leaders.append({
                            "ticker": f"{symbol}.NS",
                            "score": (screened_row.get("alphaScore") or 0) / 5,
                            "price": screened_row.get("price"),
                            "rsi": None,
                            "vol_ratio": None,
                            "off_52w_high": None,
                            "dist_50dma": None,
                        })

    candidates = []
    for row in leaders:
        symbol = normalize_symbol(row.get("ticker", ""))
        breakout = breakout_by_symbol.get(symbol)
        reasons = ["Momentum leader"]
        if breakout:
            reasons.append(str(breakout.get("type") or "Price breakout"))
        if float(row.get("vol_ratio") or 0) >= 1.2:
            reasons.append("Above-average volume")
        if deal_counts.get(symbol):
            reasons.append("Recent disclosed deal activity")
        candidates.append({
            "symbol": symbol,
            "rank_score": _candidate_score(row, breakout, deal_counts.get(symbol, 0)),
            "discovery_reasons": reasons,
            "momentum": {key: row.get(key) for key in ("mom_1m", "mom_6m", "mom_12m", "score")},
            "price": row.get("price"),
            "change_today_pct": row.get("chg_today"),
            "rsi": row.get("rsi"),
            "distance_52w_high_pct": row.get("off_52w_high"),
            "distance_50dma_pct": row.get("dist_50dma"),
            "volume_ratio": row.get("vol_ratio"),
            "breakout": breakout,
            "fundamental_screen": screen_rows.get(symbol),
            "deal_mentions": deal_counts.get(symbol, 0),
        })
    candidates.sort(key=lambda item: item["rank_score"], reverse=True)
    attempted = list((momentum or {}).get("attempted_symbols", requested_symbols)) if isinstance(momentum, dict) else requested_symbols
    successful = list((momentum or {}).get("successful_symbols", [])) if isinstance(momentum, dict) else []
    exclusions = list((momentum or {}).get("failures", [])) if isinstance(momentum, dict) else []
    coverage_pct = round((len(successful) / len(attempted) * 100), 1) if attempted else 0.0
    coverage = {
        "requested": len(requested_symbols),
        "attempted": len(attempted),
        "successful": len(successful),
        "coverage_pct": coverage_pct,
    }
    if coverage_pct < 80:
        warnings.append(f"Momentum coverage is only {coverage_pct:.1f}% of the requested universe.")
    result = {
        "market": "IN",
        "universe": "custom" if normalized_custom else universe,
        "constituent_as_of": universe_snapshot.get("constituent_as_of"),
        "constituent_source": universe_snapshot.get("source_url"),
        "constituent_source_mode": universe_snapshot.get("source_mode") or (
            "custom" if normalized_custom else "live_official_csv"
        ),
        "holding_days": holding_days,
        "sector_leaders": (sectors or {}).get("leaders", []) if isinstance(sectors, dict) else [],
        "sector_laggards": (sectors or {}).get("laggards", []) if isinstance(sectors, dict) else [],
        "candidates": candidates[:max_candidates],
        "candidate_count": min(len(candidates), max_candidates),
        "coverage": coverage,
        "exclusions": exclusions,
        "signals_excluded": True,
    }
    if not candidates and not warnings:
        warnings.append("No candidates met the requested constraints.")
    momentum_state = _source_state(
        "momentum",
        (momentum or {}).get("observed_at") if isinstance(momentum, dict) else None,
        96,
        coverage=coverage,
    )
    if coverage_pct < 80:
        momentum_state["actionable"] = False
    source_status = [
        _source_state(
            "nse_index_constituents" if not normalized_custom else "custom_universe",
            universe_snapshot.get("retrieved_at") if normalized_custom else universe_snapshot.get("constituent_as_of"),
            48 if normalized_custom else 220 * 24,
        ),
        momentum_state,
        _source_state(
            "sector_rotation",
            (sectors or {}).get("as_of") if isinstance(sectors, dict) else None,
            24,
            required=False,
        ),
    ]
    sources = ([] if normalized_custom else ["nse_index_constituents"]) + ["momentum", "sector_rotation", "deals"] + (["screener"] if needs_screen else [])
    response = _envelope(
        result,
        sources,
        warnings,
        (momentum or {}).get("observed_at") if isinstance(momentum, dict) else None,
        source_status=source_status,
    )
    if not candidates:
        response["data_quality"] = "insufficient"
    return response


def _technical_summary(chart: dict | None) -> dict | None:
    if not chart or not chart.get("close"):
        return None
    close = [float(value) for value in chart["close"] if value is not None]
    high = [float(value) for value in chart.get("high", []) if value is not None]
    low = [float(value) for value in chart.get("low", []) if value is not None]
    if not close:
        return None
    current = close[-1]
    sma20_values = chart.get("sma20") or []
    rsi_values = chart.get("rsi") or []
    sma20 = next((float(v) for v in reversed(sma20_values) if v is not None), None)
    rsi = next((float(v) for v in reversed(rsi_values) if v is not None), None)
    window = min(20, len(close), len(high), len(low))
    support = min(low[-window:]) if window else None
    resistance = max(high[-window:-1] or high[-window:]) if window else None
    true_ranges = []
    for index in range(max(1, len(close) - 14), len(close)):
        if index < len(high) and index < len(low):
            previous = close[index - 1]
            true_ranges.append(max(high[index] - low[index], abs(high[index] - previous), abs(low[index] - previous)))
    atr = sum(true_ranges) / len(true_ranges) if true_ranges else None
    resistance_levels = []
    prior_highs = high[:-1]
    for lookback in (20, 60, 252):
        if prior_highs:
            level = max(prior_highs[-lookback:])
            if level > current and all(abs(level - existing) / current > 0.002 for existing in resistance_levels):
                resistance_levels.append(level)
    resistance_levels.sort()
    volume = [float(value) for value in chart.get("volume", []) if value is not None]
    value_window = min(20, len(close), len(volume))
    average_daily_value = (
        sum(price * shares for price, shares in zip(close[-value_window:], volume[-value_window:])) / value_window
        if value_window else None
    )
    trend = "bullish" if sma20 and current > sma20 else "bearish" if sma20 and current < sma20 else "unknown"
    return _safe({
        "current_price": current,
        "sma20": sma20,
        "rsi14": rsi,
        "trend": trend,
        "support_20d": support,
        "resistance_20d": resistance,
        "resistance_levels": [round(level, 2) for level in resistance_levels],
        "atr14_estimate": round(atr, 2) if atr else None,
        "average_daily_value_20d": round(average_daily_value, 2) if average_daily_value else None,
        "vcp_rating": chart.get("vcp_rating"),
        "latest_date": (chart.get("dates") or [None])[-1],
    })


async def get_options_context(symbol: str, expiry: str | None = None) -> dict:
    main = _main()
    symbol = normalize_symbol(symbol)
    expiries, expiry_error = await _attempt("option expiries", main.get_option_chain_expiries(symbol), 20)
    selected = expiry or ((expiries or {}).get("expiries") or [""])[0]
    chain, chain_error = await _attempt("option chain", main.get_option_chain_data(symbol, selected or ""), 30)
    warnings = [item for item in (expiry_error, chain_error) if item]
    result = {
        "symbol": symbol,
        "selected_expiry": selected or None,
        "available_expiries": (expiries or {}).get("expiries", []) if isinstance(expiries, dict) else [],
        "context": chain,
        "standalone_recommendation": False,
    }
    observed_at = (chain or {}).get("timestamp") if isinstance(chain, dict) else None
    return _envelope(
        result,
        ["option_chain"],
        warnings,
        observed_at,
        source_status=[_source_state("option_chain", observed_at, 24, required=False)],
    )


async def analyze_stock(symbol: str, include_options: bool = False, holding_days: int = 10) -> dict:
    if not 2 <= int(holding_days) <= 20:
        raise ValueError("holding_days must be between 2 and 20")
    main = _main()
    symbol = normalize_symbol(symbol)
    yf_symbol = f"{symbol}.NS"
    flcl_req = main.FLCLRequest(ticker=yf_symbol, days=252, swing_window=5, atr_mult=1.5)
    calls = [
        _attempt("chart", main.get_chart(yf_symbol), 35),
        _attempt("fundamentals", main.get_fundamentals(yf_symbol), 30),
        _attempt("news", main.get_news(yf_symbol, None), 30),
        _attempt("FLCL", asyncio.to_thread(main.flcl_analysis, flcl_req), 35),
        _attempt("DCF inputs", main.get_dcf_data(yf_symbol), 30),
    ]
    values = await asyncio.gather(*calls)
    names = ["chart", "fundamentals", "news", "flcl", "dcf"]
    data = {name: value for name, (value, _) in zip(names, values)}
    warnings = [error for _, error in values if error]
    options = await get_options_context(symbol) if include_options else None
    if options and options.get("warnings"):
        warnings.extend(options["warnings"])

    news = data["news"]
    if isinstance(news, dict):
        articles = news.get("articles") or news.get("news") or []
        news = {**news, "articles": articles[:8]}
    flcl = data["flcl"]
    if isinstance(flcl, dict):
        flcl = {
            key: flcl.get(key)
            for key in ("ticker", "summary", "current", "scorecard", "as_of")
            if key in flcl
        }
    result = {
        "symbol": symbol,
        "holding_days": holding_days,
        "technical": _technical_summary(data["chart"]),
        "fundamentals": data["fundamentals"],
        "news": news,
        "flcl": flcl,
        "dcf_inputs": data["dcf"],
        "options": options.get("result") if options else None,
        "signals_excluded": True,
    }
    sources = ["chart", "fundamentals", "news", "flcl", "dcf_data"] + (["option_chain"] if include_options else [])
    latest_date = (result["technical"] or {}).get("latest_date")
    source_status = [
        _source_state("chart", latest_date, 96),
        _source_state(
            "fundamentals",
            (data["fundamentals"] or {}).get("as_of") if isinstance(data["fundamentals"], dict) else None,
            168,
            required=False,
        ),
        _source_state(
            "news",
            (data["news"] or {}).get("as_of") if isinstance(data["news"], dict) else None,
            24,
            required=False,
        ),
        _source_state(
            "flcl",
            (flcl or {}).get("as_of") if isinstance(flcl, dict) else None,
            96,
            required=False,
        ),
        _source_state(
            "dcf_data",
            (data["dcf"] or {}).get("as_of") if isinstance(data["dcf"], dict) else None,
            168,
            required=False,
        ),
    ]
    if include_options and options:
        source_status.extend(options.get("source_status", []))
    return _envelope(result, sources, warnings, latest_date, source_status=source_status)


def _analysis_score(analysis: dict) -> tuple[float, list[str], list[str]]:
    result = analysis.get("result") or {}
    tech = result.get("technical") or {}
    fundamentals = result.get("fundamentals") or {}
    score, strengths, risks = 0.0, [], []
    if tech.get("trend") == "bullish":
        score += 20; strengths.append("Price above SMA20")
    else:
        risks.append("Price is not above SMA20")
    rsi = tech.get("rsi14")
    if rsi is not None and 50 <= rsi <= 72:
        score += 15; strengths.append("Constructive RSI")
    elif rsi and rsi > 76:
        score -= 10; risks.append("RSI is extended")
    vcp = tech.get("vcp_rating") or 0
    score += min(15, float(vcp) * 3)
    alpha = fundamentals.get("alphaScore") if isinstance(fundamentals, dict) else None
    if alpha is not None:
        score += min(30, float(alpha) * 0.3)
        if alpha >= 65:
            strengths.append("Strong Alpha Nova fundamental score")
    if analysis.get("data_quality") == "complete":
        score += 10
    elif analysis.get("data_quality") == "insufficient":
        score -= 30; risks.append("Insufficient data")
    return round(score, 2), strengths, risks


async def compare_candidates(symbols: list[str], holding_days: int = 10) -> dict:
    normalized = list(dict.fromkeys(normalize_symbol(symbol) for symbol in symbols))
    if not 2 <= len(normalized) <= MAX_COMPARE:
        raise ValueError(f"symbols must contain 2 to {MAX_COMPARE} unique tickers")
    analyses = await asyncio.gather(*(analyze_stock(symbol, False, holding_days) for symbol in normalized))
    rows = []
    warnings = []
    source_status = []
    for symbol, analysis in zip(normalized, analyses):
        score, strengths, risks = _analysis_score(analysis)
        result = analysis.get("result") or {}
        rows.append({
            "symbol": symbol,
            "comparison_score": score,
            "technical": result.get("technical"),
            "alpha_score": (result.get("fundamentals") or {}).get("alphaScore") if isinstance(result.get("fundamentals"), dict) else None,
            "strengths": strengths,
            "disqualifiers": risks,
            "data_quality": analysis.get("data_quality"),
        })
        warnings.extend(f"{symbol}: {warning}" for warning in analysis.get("warnings", []))
        for state in analysis.get("source_status", []):
            source_status.append({**state, "source": f"{symbol}:{state.get('source')}"})
    rows.sort(key=lambda row: row["comparison_score"], reverse=True)
    return _envelope(
        {"ranking": rows, "signals_excluded": True},
        ["chart", "fundamentals", "news", "flcl", "dcf_data"],
        warnings,
        source_status=source_status,
    )


def _market_gate_reasons(market_context: dict | None, analysis_result: dict) -> list[str]:
    if not market_context:
        return []
    if market_context.get("actionable") is False:
        return ["Market context is stale, incomplete, or unavailable."]
    context = market_context.get("result", market_context)
    reasons = []
    nifty = next(
        (
            row for row in context.get("indices", [])
            if str(row.get("name", "")).upper().replace(" ", "") in {"NIFTY50", "NIFTY"}
        ),
        None,
    )
    if nifty and float(nifty.get("change_pct") or 0) <= -1.5:
        reasons.append("Broad market gate failed: NIFTY 50 is down at least 1.5%.")

    fundamentals = analysis_result.get("fundamentals") or {}
    company_sector = str(fundamentals.get("sector") or "").casefold()
    sector_aliases = {
        "information technology": "it",
        "technology": "it",
        "financial services": "fin",
        "financial": "fin",
        "bank": "bank",
        "healthcare": "pharma",
        "pharmaceutical": "pharma",
        "consumer cyclical": "auto",
        "basic materials": "metal",
        "real estate": "realty",
        "energy": "energy",
    }
    company_key = next((value for key, value in sector_aliases.items() if key in company_sector), None)
    sector_rows = ((context.get("sector_rotation") or {}).get("sectors") or [])
    if company_key:
        matching = next(
            (row for row in sector_rows if company_key in str(row.get("name", "")).casefold()),
            None,
        )
        if matching and str(matching.get("outlook", "")).casefold() in {"avoid", "unfavorable"}:
            reasons.append(f"Sector gate failed: {matching.get('name')} is rated {matching.get('outlook')}.")
    return reasons


async def build_trade_plan(
    symbol: str,
    capital: float = 10_000_000,
    risk_pct: float = 0.75,
    holding_days: int = 10,
    analysis: dict | None = None,
    market_context: dict | None = None,
) -> dict:
    if not 100_000 <= float(capital) <= 1_000_000_000:
        raise ValueError("capital must be between ₹1 lakh and ₹100 crore")
    if not 0.1 <= float(risk_pct) <= 1.0:
        raise ValueError("risk_pct must be between 0.1 and 1.0")
    if not 2 <= int(holding_days) <= 20:
        raise ValueError("holding_days must be between 2 and 20")
    symbol = normalize_symbol(symbol)
    if analysis is None:
        analysis, pulse = await asyncio.gather(
            analyze_stock(symbol, False, holding_days),
            get_market_pulse(False),
        )
        market_context = market_context or pulse
    result = analysis.get("result") or {}
    tech = result.get("technical") or {}
    current = tech.get("current_price")
    atr = tech.get("atr14_estimate")
    support = tech.get("support_20d")
    if not current or not atr or atr <= 0:
        response = _envelope(
            {
                "symbol": symbol,
                "not_actionable": True,
                "reason": "Current price or volatility data is missing.",
                "not_actionable_reasons": ["Current price or volatility data is missing."],
            },
            analysis.get("sources", []),
            analysis.get("warnings", []) + ["Trade plan could not be calculated."],
            source_status=analysis.get("source_status", []),
        )
        response["actionable"] = False
        return response

    structural_stop = support if support and support < current else current - 2 * atr
    stop = max(0.01, min(structural_stop, current - atr))
    entry_low = max(stop + 0.01, current - 0.25 * atr)
    worst_entry = current
    cost_buffer_per_share = worst_entry * TRADE_COST_BUFFER_BPS / 10_000
    risk_per_share = worst_entry - stop + cost_buffer_per_share
    max_rupee_risk = capital * risk_pct / 100
    risk_size = math.floor(max_rupee_risk / risk_per_share) if risk_per_share > 0 else 0
    cash_size = math.floor(capital / worst_entry)
    average_daily_value = float(tech.get("average_daily_value_20d") or 0)
    liquidity_size = (
        math.floor((average_daily_value * MAX_POSITION_ADTV_PCT / 100) / worst_entry)
        if average_daily_value > 0 else 0
    )
    quantity = max(0, min(risk_size, cash_size, liquidity_size))
    resistance_levels = sorted({
        float(level)
        for level in (tech.get("resistance_levels") or [])
        if level is not None and float(level) > worst_entry
    })
    target1 = resistance_levels[0] if resistance_levels else None
    target2 = resistance_levels[1] if len(resistance_levels) > 1 else None
    reward_per_share = target1 - worst_entry - cost_buffer_per_share if target1 else 0
    rr = reward_per_share / risk_per_share if risk_per_share else 0
    rsi = tech.get("rsi14")
    reasons = []
    if analysis.get("actionable") is False:
        reasons.append("Required research data is stale or otherwise not actionable.")
    if tech.get("trend") != "bullish":
        reasons.append("Price is not in a confirmed short-term uptrend.")
    if rsi is not None and rsi > 76:
        reasons.append("RSI is extended; avoid chasing.")
    if analysis.get("data_quality") == "insufficient":
        reasons.append("Research data is insufficient.")
    if average_daily_value < MIN_ADTV_INR:
        reasons.append(
            f"Liquidity gate failed: 20-day average traded value is below INR {MIN_ADTV_INR / 10_000_000:.0f} crore."
        )
    if not target1:
        reasons.append("No observed structural resistance above the entry can support a defensible target.")
    elif rr < 2:
        reasons.append("Observed structural upside is below 2:1 reward-to-risk after the cost buffer.")
    reasons.extend(_market_gate_reasons(market_context, result))
    if quantity <= 0:
        reasons.append("Position size is zero under the requested risk constraints.")
    plan = {
        "symbol": symbol,
        "entry_zone": [round(entry_low, 2), round(worst_entry, 2)],
        "reference_price": round(current, 2),
        "stop": round(stop, 2),
        "targets": [round(target, 2) for target in (target1, target2) if target is not None],
        "target_basis": "observed_resistance" if target1 else None,
        "reward_to_risk_target1": round(rr, 2) if target1 else None,
        "capital": round(capital, 2),
        "risk_pct": risk_pct,
        "maximum_rupee_risk": round(max_rupee_risk, 2),
        "estimated_quantity": quantity,
        "estimated_position_value": round(quantity * worst_entry, 2),
        "estimated_total_risk": round(quantity * risk_per_share, 2),
        "risk_per_share_including_cost_buffer": round(risk_per_share, 2),
        "cost_buffer_bps": TRADE_COST_BUFFER_BPS,
        "average_daily_value_20d": round(average_daily_value, 2) if average_daily_value else None,
        "maximum_position_pct_of_adtv": MAX_POSITION_ADTV_PCT,
        "holding_days": holding_days,
        "invalidation": f"Daily close below ₹{stop:.2f}",
        "not_actionable": bool(reasons),
        "not_actionable_reasons": reasons,
        "signals_excluded": True,
        "execution_enabled": False,
    }
    response = _envelope(
        plan,
        analysis.get("sources", []),
        analysis.get("warnings", []),
        analysis.get("as_of"),
        source_status=analysis.get("source_status", []),
    )
    response["actionable"] = not plan["not_actionable"]
    if plan["not_actionable"] and response["data_quality"] == "complete":
        response["data_quality"] = "partial"
    return response


async def find_best_trades(
    universe: str = "nifty100",
    custom_symbols: list[str] | None = None,
    capital: float = 10_000_000,
    risk_pct: float = 0.75,
    holding_days: int = 10,
    max_results: int = 3,
) -> dict:
    max_results = max(1, min(int(max_results), 3))
    pulse, discovered = await asyncio.gather(
        get_market_pulse(True),
        discover_trade_candidates(universe, custom_symbols, holding_days, 10),
    )
    if pulse.get("actionable") is False or discovered.get("actionable") is False:
        result = {
            "market_regime": pulse.get("result"),
            "ranked_plans": [],
            "rejected_finalists": [],
            "outcome": "No qualifying trade",
            "reason": "Market context or candidate discovery did not meet coverage and freshness requirements.",
            "signals_excluded": True,
            "execution_enabled": False,
        }
        response = _envelope(
            result,
            sorted(set(pulse.get("sources", []) + discovered.get("sources", []))),
            pulse.get("warnings", []) + discovered.get("warnings", []),
            source_status=pulse.get("source_status", []) + discovered.get("source_status", []),
        )
        response["actionable"] = False
        return response
    candidates = ((discovered.get("result") or {}).get("candidates") or [])[:10]
    analyses = await asyncio.gather(*(analyze_stock(row["symbol"], False, holding_days) for row in candidates))
    ranked = []
    for candidate, analysis in zip(candidates, analyses):
        score, strengths, risks = _analysis_score(analysis)
        ranked.append({"symbol": candidate["symbol"], "score": score + candidate.get("rank_score", 0) * 0.25, "analysis": analysis, "strengths": strengths, "risks": risks})
    ranked.sort(key=lambda item: item["score"], reverse=True)
    plans, rejected = [], []
    for item in ranked:
        plan = await build_trade_plan(
            item["symbol"],
            capital,
            risk_pct,
            holding_days,
            item["analysis"],
            pulse,
        )
        plan_result = plan.get("result") or {}
        if plan_result.get("not_actionable"):
            rejected.append({"symbol": item["symbol"], "reasons": plan_result.get("not_actionable_reasons", [])})
        elif len(plans) < max_results:
            plans.append({"rank_score": round(item["score"], 2), "strengths": item["strengths"], "plan": plan_result})
        if len(plans) >= max_results:
            break
    warnings = pulse.get("warnings", []) + discovered.get("warnings", [])
    result = {
        "market_regime": pulse.get("result"),
        "ranked_plans": plans,
        "rejected_finalists": rejected[:5],
        "outcome": "qualifying_trades_found" if plans else "No qualifying trade",
        "signals_excluded": True,
        "execution_enabled": False,
    }
    source_status = pulse.get("source_status", []) + discovered.get("source_status", [])
    for item in ranked:
        for state in item["analysis"].get("source_status", []):
            source_status.append({**state, "source": f"{item['symbol']}:{state.get('source')}"})
    response = _envelope(
        result,
        sorted(set(pulse.get("sources", []) + discovered.get("sources", []) + ["chart", "fundamentals", "news", "flcl", "dcf_data"])),
        warnings,
        source_status=source_status,
    )
    response["actionable"] = bool(plans)
    return response
