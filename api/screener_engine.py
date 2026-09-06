"""Completed-session screening with explicit evidence and bounded provider work."""
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timezone, time as day_time
from threading import BoundedSemaphore, Lock
from time import monotonic
from typing import Literal
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator
import yfinance as yf


class ScreenerRules(BaseModel):
    price_trend: Literal["below_200", "above_200", "crossed_below_200", "strong_trend"] | None = None
    rs_screen: Literal["new_high", "leading_price"] | None = None
    rs_lookback: Literal[63, 126, 252] = 252
    benchmark: Literal["auto", "^NSEI", "^CNX200", "^GSPC", "^NDX"] = "auto"
    volume_breakout: bool = False
    max_pe: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    min_pe: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    min_div_yield: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    min_roe: float | None = Field(default=None, allow_inf_nan=False)
    min_eps_growth: float | None = Field(default=None, allow_inf_nan=False)
    min_momentum: float | None = Field(default=None, allow_inf_nan=False)
    min_alpha_score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_pe_range(self):
        if self.min_pe is not None and self.max_pe is not None and self.min_pe > self.max_pe:
            raise ValueError("Minimum P/E must not exceed maximum P/E")
        return self


_POOL = ThreadPoolExecutor(max_workers=12, thread_name_prefix="screener")
_SLOTS = BoundedSemaphore(240)
_CACHE = {}
_LOCK = Lock()
FUNDAMENTAL_RULES = ("max_pe", "min_pe", "min_div_yield", "min_roe", "min_eps_growth", "min_alpha_score")


def _number(value):
    try:
        return float(value) if value is not None and np.isfinite(float(value)) else None
    except (ValueError, TypeError):
        return None


def _indian(ticker):
    return ticker.endswith((".NS", ".BO")) or ticker in ("^NSEI", "^CNX200")


def completed_history(frame, ticker, now=None):
    """Conservative post-close buffer; keep provider session dates, never fill gaps."""
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(ZoneInfo("Asia/Kolkata" if _indian(ticker) else "America/New_York"))
    cutoff = day_time(16, 0) if _indian(ticker) else day_time(16, 15)
    h = frame.copy().sort_index()
    h.index = pd.DatetimeIndex([pd.Timestamp(x).date() for x in h.index])
    h = h.loc[~h.index.duplicated(keep="last")]
    dates = h.index.date
    return h.loc[(dates < local.date()) | ((dates == local.date()) & (local.time().replace(tzinfo=None) >= cutoff))]


def _load(ticker, fundamentals):
    key = (ticker, fundamentals)
    with _LOCK:
        item = _CACHE.get(key)
        if item and monotonic() - item[0] < 300:
            return item[1].copy(), dict(item[2])
    stock = yf.Ticker(ticker)
    h = stock.history(period="2y", interval="1d", auto_adjust=True, timeout=8)
    info = stock.info if fundamentals and not h.empty else {}
    if not h.empty:
        with _LOCK:
            if len(_CACHE) >= 500:
                _CACHE.pop(next(iter(_CACHE)))
            _CACHE[key] = (monotonic(), h.copy(), dict(info or {}))
    return h, info or {}


def _incomplete(reason):
    return {"status": "incomplete", "reason": reason, "metrics": {}, "reasons": []}


def evaluate_history(h, benchmark, rules):
    """Pure rules: new levels exclude today; moving averages include today."""
    trend = rules.get("price_trend")
    rs = rules.get("rs_screen")
    lookback = rules.get("rs_lookback", 252)
    need = max(1, {"below_200": 200, "above_200": 200, "crossed_below_200": 201,
                   "strong_trend": 220}.get(trend, 1),
               21 if rules.get("volume_breakout") else 1,
               253 if rules.get("min_momentum") is not None or rs == "leading_price" else 1,
               lookback + 1 if rs else 1)
    if "Close" not in h or len(h) < need:
        return _incomplete(f"Needs {need} completed sessions")
    c = pd.to_numeric(h.Close, errors="coerce")
    required = c.tail(need)
    if not np.isfinite(required).all() or (required <= 0).any():
        return _incomplete("Missing or invalid daily closes")
    last = float(c.iloc[-1])
    metrics = {"price": last, "priceDate": h.index[-1].date().isoformat(),
               "sma200": None, "dist200": None, "rsNewHigh": None, "rsRatio": None,
               "volumeRatio": None, "momentum": None}
    checks = []
    if len(c) >= 200 and np.isfinite(c.tail(200)).all() and (c.tail(200) > 0).all():
        sma = float(c.tail(200).mean())
        metrics.update(sma200=sma, dist200=(last / sma - 1) * 100)
    if trend:
        sma = metrics["sma200"]
        if trend == "below_200":
            checks.append((last < sma, "Close below 200 DMA"))
        elif trend == "above_200":
            checks.append((last > sma, "Close above 200 DMA"))
        elif trend == "crossed_below_200":
            checks.append((last < sma and float(c.iloc[-2]) >= float(c.iloc[-201:-1].mean()), "Crossed below 200 DMA"))
        else:
            checks.append((last > c.tail(50).mean() > c.tail(150).mean() > sma
                           and sma > c.iloc[-220:-20].mean(), "Strong trend; rising 200 DMA"))
    if rs:
        if benchmark is None or "Close" not in benchmark or len(benchmark) < lookback + 1:
            return _incomplete("Benchmark history unavailable or too short")
        b = pd.to_numeric(benchmark.Close.tail(lookback + 1), errors="coerce")
        aligned = c.reindex(b.index)
        if h.index[-1] != b.index[-1] or not np.isfinite(aligned).all() or not np.isfinite(b).all() or (b <= 0).any() or (aligned <= 0).any():
            return _incomplete("Stock and benchmark sessions are incomplete or misaligned")
        ratio = aligned / b
        new_high = bool(ratio.iloc[-1] > ratio.iloc[:-1].max())
        metrics.update(rsNewHigh=new_high, rsRatio=float(ratio.iloc[-1]))
        checks.append((new_high, f"RS above prior {lookback}-session high"))
        if rs == "leading_price":
            checks.append((last < c.iloc[-253:-1].max(), "Price below prior 252-session closing high"))
    if "Volume" in h and len(h) >= 21:
        v = pd.to_numeric(h.Volume.tail(21), errors="coerce")
        if np.isfinite(v).all() and (v >= 0).all() and v.iloc[:-1].mean() > 0:
            metrics["volumeRatio"] = float(v.iloc[-1] / v.iloc[:-1].mean())
    if rules.get("volume_breakout"):
        high = pd.to_numeric(h.High.tail(21), errors="coerce") if "High" in h else pd.Series(dtype=float)
        if metrics["volumeRatio"] is None or len(high) < 21 or not np.isfinite(high).all() or (high <= 0).any() or (high < c.tail(21)).any():
            return _incomplete("Missing or invalid highs/volume")
        checks.append((last > float(high.iloc[:-1].max()) and metrics["volumeRatio"] > 1.5,
                       "20-session breakout with volume > 1.5× average"))
    if rules.get("min_momentum") is not None:
        metrics["momentum"] = sum((last / float(c.iloc[-n-1]) - 1) * 100 for n in (21, 126, 252)) / 3
        checks.append((metrics["momentum"] >= rules["min_momentum"], f"Momentum ≥ {rules['min_momentum']:g}%"))
    return {"status": "match" if all(bool(x[0]) for x in checks) else "no_match",
            "metrics": metrics, "reasons": [label for passed, label in checks if passed]}


def run_scan(req, tickers, score_fn, *, loader=None, now=None, time_budget=45):
    now = now or datetime.now(timezone.utc)
    loader = loader or _load
    rules = vars(req)
    technical = bool(req.price_trend or req.rs_screen or req.volume_breakout or req.min_momentum is not None)
    fundamentals = not technical or any(rules.get(k) is not None for k in FUNDAMENTAL_RULES)
    tickers = list(dict.fromkeys(t.strip().upper() for t in tickers if t.strip()))
    deadline = monotonic() + time_budget
    tasks, outcomes, benchmarks = {}, {}, {}

    def submit(fn, *args):
        if not _SLOTS.acquire(blocking=False):
            return None
        try:
            future = _POOL.submit(fn, *args)
            future.add_done_callback(lambda _: _SLOTS.release())
            return future
        except Exception:
            _SLOTS.release()
            raise

    def load_completed(symbol, wants_info):
        h, info = loader(symbol, wants_info)
        h = completed_history(h, symbol, now)
        if h.empty:
            raise ValueError("No completed daily candles")
        if (now.date() - h.index[-1].date()).days > 7:
            raise ValueError("Daily history is over seven days old")
        return h, info

    def benchmark_for(ticker):
        return ("^NSEI" if _indian(ticker) else "^GSPC") if req.benchmark == "auto" else req.benchmark

    if req.rs_screen:
        jobs = {b: submit(load_completed, b, False) for b in {benchmark_for(t) for t in tickers}}
        active = [f for f in jobs.values() if f is not None]
        if active:
            wait(active, timeout=max(0, deadline - monotonic()))
        for symbol, future in jobs.items():
            if future is not None and future.done():
                try:
                    benchmarks[symbol] = future.result()[0]
                except Exception:
                    pass
            elif future is not None:
                future.cancel()

    def process(ticker):
        try:
            if req.rs_screen and _indian(ticker) != _indian(benchmark_for(ticker)):
                return _incomplete("Choose a benchmark from the stock's market")
            if req.rs_screen and benchmark_for(ticker) not in benchmarks:
                return _incomplete("Benchmark history unavailable")
            h, info = load_completed(ticker, fundamentals)
            evaluation = evaluate_history(h, benchmarks.get(benchmark_for(ticker)), rules)
            if evaluation["status"] == "incomplete":
                return evaluation
            metrics = evaluation["metrics"]
            pe = _number(info.get("trailingPE"))
            pe = pe if pe is not None and pe > 0 else None
            values = {"peRatio": pe, "divYield": _number(info.get("dividendYield")),
                      "roe": _number(info.get("returnOnEquity")), "epsGrowth": _number(info.get("earningsGrowth")),
                      "marketCap": _number(info.get("marketCap")), "alphaScore": None}
            for key in ("roe", "epsGrowth"):
                if values[key] is not None:
                    values[key] *= 100
            if values["marketCap"] is not None:
                values["marketCap"] /= 1e9
            if fundamentals:
                def pct(key):
                    v = _number(info.get(key))
                    return v * 100 if v is not None else None
                values["alphaScore"] = score_fn(metrics["price"], _number(info.get("trailingEps")), pe,
                    values["epsGrowth"], rev_growth_pct=pct("revenueGrowth"), roe_pct=values["roe"],
                    margin_pct=pct("profitMargins"), dte_pct=_number(info.get("debtToEquity")), div_pct=values["divYield"])
            checks = [("max_pe", "peRatio", "P/E", False), ("min_pe", "peRatio", "P/E", True),
                      ("min_div_yield", "divYield", "Dividend yield", True), ("min_roe", "roe", "ROE", True),
                      ("min_eps_growth", "epsGrowth", "EPS growth", True), ("min_alpha_score", "alphaScore", "Alpha Score", True)]
            matched = evaluation["status"] == "match"
            reasons = evaluation["reasons"]
            for key, field, label, minimum in checks:
                threshold = rules.get(key)
                if threshold is None:
                    continue
                value = values[field]
                if value is None:
                    return _incomplete(f"Missing {label} required by filter")
                passed = value >= threshold if minimum else value <= threshold
                matched = matched and passed
                if passed:
                    reasons.append(f"{label} {'≥' if minimum else '≤'} {threshold:g}")
            return {"status": "match" if matched else "no_match", "row": {
                "ticker": ticker, **values, **metrics, "reasons": reasons or ["No filters applied"],
                "benchmark": benchmark_for(ticker) if req.rs_screen else None}}
        except ValueError as exc:
            return _incomplete(str(exc) if str(exc) in ("No completed daily candles", "Daily history is over seven days old") else "Invalid provider data")
        except Exception:
            return _incomplete("Provider data unavailable")

    for ticker in tickers:
        if monotonic() >= deadline:
            outcomes[ticker] = _incomplete("Scan time budget reached")
            continue
        future = submit(process, ticker)
        if future is None:
            outcomes[ticker] = _incomplete("Scanner busy; retry shortly")
        else:
            tasks[future] = ticker
    if tasks:
        done, pending = wait(tasks, timeout=max(0, deadline - monotonic()))
        for future in done:
            outcomes[tasks[future]] = future.result()
        for future in pending:
            future.cancel()
            outcomes[tasks[future]] = _incomplete("Scan time budget reached")
    rows = [outcomes[t]["row"] for t in tickers if outcomes[t]["status"] == "match"]
    incomplete = [{"ticker": t, "reason": outcomes[t]["reason"]} for t in tickers if outcomes[t]["status"] == "incomplete"]
    non_matches = sum(o["status"] == "no_match" for o in outcomes.values())
    dates = sorted({o["row"]["priceDate"] for o in outcomes.values() if "row" in o})
    return {"data": rows, "requested": len(tickers), "scanned": len(rows) + non_matches,
            "matched": len(rows), "non_matches": non_matches, "incomplete_count": len(incomplete),
            "incomplete": incomplete, "truncated": any(x["reason"] == "Scan time budget reached" for x in incomplete),
            "price_dates": dates, "generated_at": now.isoformat(), "technical": technical,
            "source": "Yahoo Finance · adjusted daily candles · 5-minute cache",
            "benchmark": req.benchmark if req.rs_screen else None}
