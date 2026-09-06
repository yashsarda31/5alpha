"""Daily OHLCV momentum research; every price level excludes the current bar."""
from datetime import datetime, timezone

import numpy as np
import pandas as pd


def scan_momentum(frame, tickers, market):
    histories = {}
    for ticker in tickers:
        try:
            h = frame[ticker].sort_index()
            h = h.loc[~h.index.duplicated(keep="last")]
            # Do not repair missing bars: a missing current bar must not turn
            # yesterday's move into a current-session event.
            h = h.dropna(how="all")
            values = h[["Open", "High", "Low", "Close"]]
            valid = (np.isfinite(values).all(axis=1) & (values > 0).all(axis=1)
                     & (h.High >= h[["Open", "Close", "Low"]].max(axis=1))
                     & (h.Low <= h[["Open", "Close", "High"]].min(axis=1)))
            if len(h) >= 21 and valid.all():
                histories[ticker] = h
        except (KeyError, TypeError, ValueError):
            continue
    session = max((h.index[-1].date() for h in histories.values()), default=None)
    rows, breakouts, breakdowns = [], [], []
    scanned = 0
    for ticker, h in histories.items():
        if h.index[-1].date() != session:
            continue
        scanned += 1
        c = h.Close
        last, prev = float(c.iloc[-1]), float(c.iloc[-2])
        change = (last / prev - 1) * 100
        delta = c.diff()
        gain = float(delta.clip(lower=0).ewm(com=13, adjust=False).mean().iloc[-1])
        loss = float((-delta.clip(upper=0)).ewm(com=13, adjust=False).mean().iloc[-1])
        rsi = 100 - 100 / (1 + gain / loss) if loss else (100 if gain else 50)
        volume = float(h.Volume.iloc[-1])
        avg_volume = float(h.Volume.iloc[-21:-1].mean())
        volume_ok = np.isfinite(h.Volume.iloc[-21:]).all() and (h.Volume.iloc[-21:] >= 0).all()
        vol_ratio = round(volume / avg_volume, 2) if volume_ok and avg_volume > 0 else None
        tail = h.tail(60)
        base = {
            "ticker": ticker, "price": round(last, 2), "chg_today": round(change, 2),
            "rsi": round(rsi, 1), "vol_ratio": vol_ratio,
            "session_date": session.isoformat(),
            "dist_50dma": round((last / float(c.tail(50).mean()) - 1) * 100, 2) if len(c) >= 50 else None,
            "off_52w_high": round((last / float(h.High.tail(252).max()) - 1) * 100, 2) if len(c) >= 252 else None,
            "spark": [round(float(x), 2) for x in c.tail(60)],
            "candles": {k: [round(float(x), 2) for x in tail[col]]
                        for k, col in (("o", "Open"), ("h", "High"), ("l", "Low"), ("c", "Close"))},
        }
        base["candles"]["v"] = [int(x) if np.isfinite(x) and x >= 0 else 0 for x in tail.Volume]
        for direction, destination, field, suffix in (
                (1, breakouts, "High", "HIGH"), (-1, breakdowns, "Low", "LOW")):
            for window, label in ((252, "52W"), (63, "3M"), (20, "20D")):
                if len(h) < window + 1:
                    continue
                prior = h[field].iloc[-window-1:-1]
                level = float(prior.max() if direction == 1 else prior.min())
                if direction * (last - level) > 0 and direction * change > 0:
                    destination.append({**base, "type": f"{label} {suffix}",
                                        "level": round(level, 4),
                                        "margin": round(abs(last / level - 1) * 100, 2),
                                        "_window": window})
                    break
        if len(c) < 253:
            continue
        returns = {key: (last / float(c.iloc[-period-1]) - 1) * 100
                   for key, period in (("mom_1m", 21), ("mom_6m", 126), ("mom_12m", 252))}
        score = sum(returns.values()) / 3
        rows.append({**base, **{k: round(v, 2) for k, v in returns.items()},
                     "score": round(score, 2), "_score": score})
    # Midrank ties on a 0-100 scale. Equal momentum receives equal RS.
    if len(rows) > 1:
        ranks = pd.Series([r["_score"] for r in rows]).rank(method="average")
        for row, rank in zip(rows, ranks):
            row["rs_percentile"] = round(100 * (float(rank) - 1) / (len(rows) - 1), 1)
    else:
        for row in rows:
            row["rs_percentile"] = None
    rows.sort(key=lambda r: (-r["_score"], r["ticker"]))
    rs_by_ticker = {r["ticker"]: r["rs_percentile"] for r in rows}
    for row in rows:
        row.pop("_score")
    for events in (breakouts, breakdowns):
        events.sort(key=lambda r: (-r["_window"], -abs(r["chg_today"]), r["ticker"]))
        for event in events:
            event.pop("_window")
            event["rs_percentile"] = rs_by_ticker.get(event["ticker"])
    return {
        "data": rows[:15], "ranked": rows, "breakouts": breakouts, "breakdowns": breakdowns,
        "low_rs": sorted((r for r in rows if r["rs_percentile"] is not None and r["rs_percentile"] <= 20),
                         key=lambda r: (r["rs_percentile"], r["ticker"])),
        "market": market, "universe": len(tickers), "scanned": scanned, "ranked_count": len(rows),
        "excluded_count": len(tickers) - scanned,
        "session_date": session.isoformat() if session else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance daily adjusted OHLCV",
        "rs_method": "Percentile of the mean 21 / 126 / 252-session returns within this scanned universe; low RS <= 20.",
    }
