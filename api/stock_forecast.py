"""Deterministic, research-only one-month scenarios; no external calls here."""
from datetime import datetime, timezone
from urllib.parse import urlparse

import numpy as np
import pandas as pd

HORIZON = 21
MIN_BARS = 252


def finite(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        value = float(value)
        return value if np.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def display_provider(value):
    """User-facing data-source label. Internal pipeline names (fallback
    plumbing, aggregation internals) must never reach the interface."""
    text = str(value or "").strip()
    if not text or text == "Unavailable":
        return "Unavailable"
    lowered = text.lower()
    if "openbb" in lowered:
        return "OpenBB"
    if "yfinance" in lowered or "yahoo" in lowered:
        return "Yahoo Finance"
    return text


def stamp(value):
    try:
        value = pd.Timestamp(value)
        if pd.isna(value):
            return None
        return value.tz_localize("UTC") if value.tzinfo is None else value.tz_convert("UTC")
    except (TypeError, ValueError):
        return None


def quantiles(close):
    sample = close[-273:]
    returns = np.log(sample[HORIZON:] / sample[:-HORIZON])
    return np.quantile(returns, [0.1, 0.5, 0.9])


def fundamental_context(facts):
    facts = facts if isinstance(facts, dict) else {}
    eps, forward = finite(facts.get("trailingEps")), finite(facts.get("forwardEps"))
    pe = finite(facts.get("trailingPE"))
    evidence = facts.get("roeEvidence") or {}
    raw_history = evidence.get("history") or []
    annual = [item for item in raw_history if isinstance(item, dict)
              and isinstance(item.get("period"), str) and finite(item.get("roe_pct")) is not None]
    outlook = "ROE improvement cannot be established from a single snapshot. Confirm sustained margin expansion and asset turnover across comparable financial periods; higher leverage can lift ROE without improving operations."
    if len(annual) >= 2:
        before, latest = annual[-2:]
        delta = latest['roe_pct'] - before['roe_pct']
        outlook = f"Annual ROE {'rose' if delta > 0 else 'fell' if delta < 0 else 'was unchanged'} from {before['roe_pct']:.2f}% ({before['period']}) to {latest['roe_pct']:.2f}% ({latest['period']}). "
        for label, key in (("Net margin", "net_margin_pct"), ("Asset turnover", "asset_turnover"), ("Equity multiplier", "equity_multiplier")):
            if latest.get(key) is not None and before.get(key) is not None:
                outlook += f"{label} {'increased' if latest[key] > before[key] else 'decreased' if latest[key] < before[key] else 'was stable'}. "
        outlook += "Further margin or turnover improvement could support ROE if equity growth and leverage remain stable. A rising equity multiplier reflects leverage, not necessarily better operations. This is conditional context, not a future ROE forecast."
    return {
        "name": facts.get("name"), "roe_pct": finite(facts.get("returnOnEquity")),
        "trailing_pe": pe, "forward_pe": finite(facts.get("forwardPE")),
        "earnings_growth_pct": finite(facts.get("earningsGrowth")),
        "revenue_growth_pct": finite(facts.get("revenueGrowth")),
        "profit_margin_pct": finite(facts.get("profitMargin")),
        "debt_to_equity_pct": finite(facts.get("debtToEquity")),
        "trailing_eps": eps, "forward_eps": forward,
        "forward_eps_change_pct": round((forward / eps - 1) * 100, 2) if eps and eps > 0 and forward is not None else None,
        "forward_note": "Provider forward EPS versus trailing EPS; estimate horizon is not supplied and is not a one-month earnings forecast.",
        "valuation_note": "P/E is not meaningful for loss-making companies." if pe is not None and pe < 0 else "P/E needs sector and growth context; a low multiple alone does not imply upside.",
        "roe_forecast_pct": None,
        "roe_outlook": outlook, "roe_history": annual,
        "roe_basis": "Annual · " + annual[-1]['period'] if annual and evidence.get('used_as_snapshot') else "Provider snapshot",
        "roe_source": evidence.get('source'), "roe_method": evidence.get('method'),
        "quality": facts.get("dataQuality") or {},
    }


def recent_news(news, now):
    output = []
    articles = (news or {}).get("articles") if isinstance(news, dict) else []
    for item in articles or []:
        if not isinstance(item, dict):
            continue
        date = stamp(item.get("publishedAt"))
        url = item.get("url")
        try:
            parsed = urlparse(url) if isinstance(url, str) else None
            safe = parsed and parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username
        except ValueError:
            safe = False
        if not safe or date is None or date > now or (now - date).total_seconds() > 14 * 86400:
            continue
        if not isinstance(item.get("title"), str) or not item["title"].strip():
            continue
        provider = item.get("provider") or item.get("source") or "News provider"
        output.append({"title": item["title"][:400], "url": url, "published_at": date.isoformat(),
                       "provider": provider if isinstance(provider, str) else "News provider"})
    return sorted(output, key=lambda item: item["published_at"], reverse=True)[:5]


def build_forecast(ticker, history, fundamentals, news=None, now=None, ticker_unknown=False):
    now = pd.Timestamp(now or datetime.now(timezone.utc))
    now = now.tz_localize("UTC") if now.tzinfo is None else now.tz_convert("UTC")
    market = "IN" if str(ticker).upper().endswith((".NS", ".BO")) else "US"
    local_today = now.tz_convert("Asia/Kolkata" if market == "IN" else "America/New_York").date()
    facts = fundamentals if isinstance(fundamentals, dict) else {}
    context = fundamental_context(facts)
    quality = context["quality"]
    result = {
        "ticker": ticker, "market": market, "currency": "INR" if market == "IN" else "USD",
        "status": "insufficient_data", "current_price": None, "prediction": None,
        "range": None, "risk_level": None, "direction": None, "change_pct": None,
        "risk_note": "No directional invalidation is available.",
        "horizon_sessions": HORIZON, "horizon_label": "Approximately one month · 21 trading sessions",
        "generated_at": now.isoformat(), "sources": {
            "prices": "Yahoo Finance · adjusted daily OHLC · completed dates only",
            "price_as_of": None, "fundamentals": display_provider(quality.get("provider")),
            "fundamentals_retrieved_at": quality.get("retrievedAt"),
            "statement_period": quality.get("statementPeriod"),
        },
        "fundamentals": context, "technicals": None, "validation": None,
        "news": recent_news(news, now), "warnings": [],
        "methodology": "The target applies the median of trailing 21-session log returns to the latest completed close. The range applies the historical 10th and 90th percentiles, using up to 252 overlapping observations. It is an empirical scenario range, not an 80% probability or a calibrated confidence interval. Fundamentals and news are separate context and do not numerically adjust this price-only model. No predictive edge has been established.",
    }
    warnings = result["warnings"]
    if ticker_unknown:
        warnings.append(f"Ticker '{ticker}' was not found on the provider. Check the symbol and market, then retry.")
        return result
    if not result["news"]:
        warnings.append("No dated news from the past 14 days was available; event risk is unassessed.")
    if not quality.get("statementPeriod") and not context["roe_history"]:
        warnings.append("Fundamental reporting period unavailable; retrieval time does not establish financial-period freshness.")
    if not isinstance(history, pd.DataFrame) or len(history) < MIN_BARS:
        warnings.append("At least 252 completed daily price observations are required.")
        return result
    if not all(column in history for column in ("Open", "High", "Low", "Close")):
        warnings.append("Daily OHLC data is incomplete.")
        return result
    try:
        dates = pd.DatetimeIndex(history.index)
        values = history[["Open", "High", "Low", "Close"]].to_numpy(dtype=float)
        if dates.hasnans or not dates.is_monotonic_increasing or not dates.is_unique:
            raise ValueError("Price dates must be unique and increasing.")
        if not np.isfinite(values).all() or (values <= 0).any():
            raise ValueError("Prices contain missing, non-finite or non-positive observations.")
        op, high, low, close = values.T
        if ((high < np.maximum(op, close)) | (low > np.minimum(op, close)) | (low > high)).any():
            raise ValueError("OHLC observations are inconsistent.")
        last_day = dates[-1].date()
        if last_day >= local_today:
            raise ValueError("Price history contains an uncompleted or future session.")
        if (local_today - last_day).days > 5 or np.busday_count(last_day, local_today) > 2:
            raise ValueError("Price history is stale; refresh before producing a target.")
        if max(np.diff(dates.values).astype('timedelta64[D]').astype(int)) > 10:
            raise ValueError("Price history has a gap longer than ten calendar days.")
        if (np.abs(close[1:] / close[:-1] - 1) > 0.35).any():
            raise ValueError("A daily price discontinuity exceeds 35%; verify corporate actions before forecasting.")
        if np.std(np.diff(np.log(close[-63:]))) < 1e-6:
            raise ValueError("Recent prices have insufficient variation for a useful risk estimate.")
    except (ValueError, TypeError, OverflowError) as error:
        warnings.append(str(error))
        return result
    result["current_price"] = round(float(close[-1]), 2)
    result["sources"]["price_as_of"] = last_day.isoformat()
    if np.busday_count(last_day, local_today) > 1:
        warnings.append("The latest completed price is more than one weekday old; provider data may be delayed.")
    missing = [name for name, key in (("ROE", "roe_pct"), ("P/E", "trailing_pe"), ("earnings growth", "earnings_growth_pct")) if context[key] is None]
    if context["trailing_pe"] == 0:
        missing.append("meaningful P/E")
    if missing:
        warnings.append("Core fundamental evidence unavailable: " + ", ".join(missing) + ". Target withheld.")
        return result
    if str(facts.get("ticker") or "").upper() != str(ticker).upper():
        warnings.append("Fundamental ticker does not match the requested listing. Target withheld.")
        return result
    retrieved = stamp(quality.get("retrievedAt"))
    if retrieved is None or retrieved > now + pd.Timedelta(minutes=5) or now - retrieved > pd.Timedelta(days=7):
        warnings.append("Fundamental retrieval date is missing, invalid or older than seven days. Target withheld.")
        return result
    if quality.get("currency") and quality["currency"] != result["currency"]:
        warnings.append("Fundamental currency does not match the selected market. Target withheld.")
        return result
    previous = close[:-1]
    tr = np.maximum(high[1:] - low[1:], np.maximum(np.abs(high[1:] - previous), np.abs(low[1:] - previous)))
    atr = float(tr[-14:].mean())
    bounds = close[-1] * np.exp(quantiles(close))
    change = float((bounds[1] / close[-1] - 1) * 100)
    direction = "bullish" if change >= 1 else "bearish" if change <= -1 else "neutral"
    risk = float(close[-1] - 2 * atr if direction == "bullish" else close[-1] + 2 * atr)
    if not np.isfinite(bounds).all() or not np.isfinite(atr) or atr <= 0 or risk <= 0:
        warnings.append("Price or risk estimates are invalid. Target withheld.")
        return result
    gains = np.maximum(np.diff(close[-15:]), 0).mean()
    losses = np.maximum(-np.diff(close[-15:]), 0).mean()
    if losses == 0:
        rsi = 100.0 if gains > 0 else 50.0
    else:
        rsi = 100 - 100 / (1 + gains / losses)
    result.update(status="ready", prediction=round(float(bounds[1]), 2),
                  range={"low": round(float(bounds[0]), 2), "high": round(float(bounds[2]), 2)},
                  direction=direction, change_pct=round(change, 2),
                  risk_level=None if direction == "neutral" else round(risk, 2),
                  risk_note="No directional invalidation: the central estimate is within ±1% of the current close." if direction == "neutral" else
                  f"The {direction} scenario is invalidated on a daily close {'below' if direction == 'bullish' else 'above'} this level (two 14-session ATRs from the reference close). Gaps can pass this level; it is not a guaranteed exit price.")
    result["technicals"] = {"atr14": atr, "sma50": round(float(close[-50:].mean()), 2),
                            "sma200": round(float(close[-200:].mean()), 2),
                            "rsi14": round(float(rsi), 1),
                            "observations": len(close)}
    # Non-overlapping 21-session historical checks; each estimate uses only prior prices.
    errors, baseline, coverage = [], [], []
    for end in range(MIN_BARS - 1, len(close) - HORIZON, HORIZON):
        expected = close[end] * np.exp(quantiles(close[:end + 1]))
        actual = close[end + HORIZON]
        errors.append(abs(expected[1] / actual - 1) * 100)
        baseline.append(abs(close[end] / actual - 1) * 100)
        coverage.append(expected[0] <= actual <= expected[2])
    result["validation"] = {"windows": len(errors), "mape_pct": round(float(np.mean(errors)), 2) if errors else None,
                            "flat_price_mape_pct": round(float(np.mean(baseline)), 2) if baseline else None,
                            "range_coverage_pct": round(float(np.mean(coverage) * 100), 1) if coverage else None,
                            "note": "Non-overlapping historical 21-session checks using only prior prices; small sample, no transaction costs, not evidence of investable returns."}
    if not errors:
        warnings.append("Price history is too short for historical validation checks.")
    return result
