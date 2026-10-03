"""Validate Yahoo one-minute bars for the Analyse intraday view."""

from datetime import datetime, timezone
import math


def intraday_payload(symbol, history):
    if history is None or history.empty:
        return None
    bars = []
    for stamp, row in history.iterrows():
        try:
            observed = stamp.to_pydatetime() if hasattr(stamp, "to_pydatetime") else stamp
            if observed.tzinfo is None:
                continue
            prices = [float(row[key]) for key in ("Open", "High", "Low", "Close")]
            volume = float(row["Volume"])
            if not all(math.isfinite(value) and value > 0 for value in prices):
                continue
            if prices[1] < max(prices[0], prices[2], prices[3]) or prices[2] > min(prices[0], prices[3]):
                continue
            if not math.isfinite(volume) or volume < 0:
                volume = 0
            bars.append((observed, [round(value, 2) for value in prices], int(volume)))
        except (KeyError, TypeError, ValueError, OverflowError):
            continue
    if not bars:
        return None
    # Exchange-local half-hour candles start at 09:15 for NSE and 09:30 for US.
    # Keep the latest five sessions, while the quote always uses the last 1m bar.
    sessions = sorted({bar[0].date() for bar in bars})[-5:]
    bars = [bar for bar in bars if bar[0].date() in sessions]
    start_minute = 9 * 60 + (15 if symbol.upper().endswith((".NS", ".BO")) or symbol.upper().startswith("^NSE") else 30)
    candles = []
    for stamp, prices, volume in bars:
        elapsed = stamp.hour * 60 + stamp.minute - start_minute
        if elapsed < 0:
            continue
        slot = elapsed // 30
        key = (stamp.date(), slot)
        if candles and candles[-1][0] == key:
            candle = candles[-1]
            candle[3] = max(candle[3], prices[1])
            candle[4] = min(candle[4], prices[2])
            candle[5] = prices[3]
            candle[6] += volume
        else:
            candles.append([key, stamp, prices[0], prices[1], prices[2], prices[3], volume])
    if not candles:
        return None
    return {
        "ticker": symbol.upper(),
        "source": "Yahoo Finance",
        "interval": "1m",
        "as_of": bars[-1][0].isoformat(),
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "last_price": bars[-1][1][3],
        "dates": [candle[1].isoformat() for candle in candles],
        "open": [candle[2] for candle in candles],
        "high": [candle[3] for candle in candles],
        "low": [candle[4] for candle in candles],
        "close": [candle[5] for candle in candles],
        "volume": [candle[6] for candle in candles],
    }
