"""Dated Chart Analyser BUY transitions for opted-in watchlist push alerts."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


IST = timezone(timedelta(hours=5, minutes=30))
NEW_YORK = ZoneInfo("America/New_York")


def _chart_label(close, rsi, sma20):
    """Match the rounded RSI/SMA20 rule in chartTechnicalSignal.js."""
    try:
        close, rsi, sma20 = (round(float(value), 2) for value in (close, rsi, sma20))
    except (TypeError, ValueError, OverflowError):
        return None
    if not all(math.isfinite(value) for value in (close, rsi, sma20)):
        return None
    if close <= 0 or sma20 <= 0 or not 0 <= rsi <= 100:
        return None
    if rsi > 70 or close < sma20 * 0.95:
        return "SELL"
    if rsi < 30 or close > sma20 * 1.05:
        return "BUY"
    return "BULLISH" if close > sma20 else "HOLD"


def buy_transition_date(history, market: str, now: datetime) -> str | None:
    """Return the candle date only for a fresh non-BUY -> BUY transition."""
    if market not in ("IN", "US") or history is None or len(history) < 21:
        return None
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    try:
        close = history["Close"]
        if not close.index.is_monotonic_increasing or close.index.has_duplicates:
            return None
        candle_date = close.index[-1].date()
        zone = IST if market == "IN" else NEW_YORK
        if candle_date != now.astimezone(zone).date():
            return None
        sma20 = close.rolling(window=20).mean()
        delta = close.diff()
        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)
        rs = gain.ewm(com=13, adjust=False).mean() / loss.ewm(com=13, adjust=False).mean()
        rsi = 100 - (100 / (1 + rs))
        previous = _chart_label(close.iloc[-2], rsi.iloc[-2], sma20.iloc[-2])
        latest = _chart_label(close.iloc[-1], rsi.iloc[-1], sma20.iloc[-1])
        return candle_date.isoformat() if previous and previous != "BUY" and latest == "BUY" else None
    except (AttributeError, KeyError, TypeError, ValueError):
        return None
