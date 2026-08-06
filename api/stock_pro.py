"""Deterministic, VCP-led Stock Pro signal calculations.

This module deliberately contains no network, cache, database, or FastAPI code.
Callers provide OHLCV history plus optional options-flow/market context.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any

import numpy as np
import pandas as pd


VERSION = "stock-pro-v2.0"
REQUIRED_COLUMNS = ("Open", "High", "Low", "Close", "Volume")


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _round(value: Any, digits: int = 2) -> float | None:
    number = _finite(value)
    return round(number, digits) if number is not None else None


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return _round(value, 4)
    return value


def _empty_contract(summary: str, coverage: int = 0) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    checks = {name: False for name in (
        "trend_alignment", "long_term_slope", "adverse_extreme_distance",
        "directional_proximity", "contraction_quality",
    )}
    return {
        "version": VERSION,
        "calculated_at": now,
        "label": "NEUTRAL",
        "direction": None,
        "confidence": 0,
        "data_coverage": int(max(0, min(100, coverage))),
        "summary": summary,
        "vcp": {
            "rating": 0,
            "direction": None,
            "bullish_checks": dict(checks),
            "bearish_checks": dict(checks),
        },
        "factors": {
            name: {"score": 0, "max": maximum, "status": "unavailable", "detail": summary}
            for name, maximum in (
                ("vcp", 40), ("structure", 20), ("momentum", 10),
                ("participation", 10), ("options", 15), ("regime", 5),
            )
        },
        "flow": {
            "status": "unavailable", "alignment": "unavailable",
            "evidence": "Options flow unavailable", "as_of": None, "stale": False,
        },
        "plan": None,
        "invalidation": None,
        "upgrade_condition": "Load at least 200 valid daily sessions.",
    }


def _prepare(history: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(history, pd.DataFrame) or any(column not in history for column in REQUIRED_COLUMNS):
        return pd.DataFrame(columns=REQUIRED_COLUMNS)
    frame = history.loc[:, REQUIRED_COLUMNS].copy()
    for column in REQUIRED_COLUMNS:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.replace([np.inf, -np.inf], np.nan)
    frame = frame.dropna(subset=("Open", "High", "Low", "Close"))
    frame = frame[(frame["Close"] > 0) & (frame["High"] > 0) & (frame["Low"] > 0)]
    frame["Volume"] = frame["Volume"].where(frame["Volume"] >= 0)
    return frame.sort_index()


def _features(frame: pd.DataFrame) -> dict[str, float]:
    close = frame["Close"]
    high = frame["High"]
    low = frame["Low"]
    volume = frame["Volume"]
    previous = close.shift(1)
    true_range = pd.concat(
        ((high - low).abs(), (high - previous).abs(), (low - previous).abs()), axis=1
    ).max(axis=1)
    atr_series = true_range.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    normalized_range = true_range / close.replace(0, np.nan)

    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    if loss.iloc[-1] == 0 and gain.iloc[-1] > 0:
        rsi.iloc[-1] = 100.0

    prior = frame.iloc[:-1]
    return {
        "last": float(close.iloc[-1]),
        "sma20": float(close.tail(20).mean()),
        "sma50": float(close.tail(50).mean()),
        "sma150": float(close.tail(150).mean()),
        "sma200": float(close.tail(200).mean()),
        "sma200_20ago": float(close.iloc[-220:-20].mean()),
        "atr": float(atr_series.iloc[-1]),
        "rsi": float(rsi.iloc[-1]) if pd.notna(rsi.iloc[-1]) else 50.0,
        "mom5": float(close.iloc[-1] / close.iloc[-6] - 1),
        "mom21": float(close.iloc[-1] / close.iloc[-22] - 1),
        "range10": float(normalized_range.tail(10).mean()),
        "range50": float(normalized_range.tail(50).mean()),
        "volume_now": float(volume.iloc[-1]) if pd.notna(volume.iloc[-1]) else 0.0,
        "volume20": float(volume.tail(20).mean(skipna=True)),
        "volume50": float(volume.tail(50).mean(skipna=True)),
        "high20": float(prior["High"].tail(20).max()),
        "low20": float(prior["Low"].tail(20).min()),
        "swing_high": float(prior["High"].tail(10).max()),
        "swing_low": float(prior["Low"].tail(10).min()),
        "high52": float(high.tail(252).max()),
        "low52": float(low.tail(252).min()),
    }


def _vcp(metrics: dict[str, float]) -> dict[str, Any]:
    last = metrics["last"]
    contraction = (
        metrics["range10"] < metrics["range50"]
        and metrics["volume20"] <= metrics["volume50"]
    )
    bull = {
        "trend_alignment": last > metrics["sma50"] > metrics["sma150"] > metrics["sma200"],
        "long_term_slope": metrics["sma200"] > metrics["sma200_20ago"],
        "adverse_extreme_distance": last / metrics["low52"] - 1 >= 0.30,
        "directional_proximity": last >= metrics["high52"] * 0.75,
        "contraction_quality": contraction,
    }
    bear = {
        "trend_alignment": last < metrics["sma50"] < metrics["sma150"] < metrics["sma200"],
        "long_term_slope": metrics["sma200"] < metrics["sma200_20ago"],
        "adverse_extreme_distance": metrics["high52"] / last - 1 >= 0.30,
        "directional_proximity": last <= metrics["low52"] * 1.25,
        "contraction_quality": contraction,
    }
    bull_score, bear_score = sum(bull.values()), sum(bear.values())
    if bull_score > bear_score:
        direction = "bull"
    elif bear_score > bull_score:
        direction = "bear"
    elif last > metrics["high20"]:
        direction = "bull"
    elif last < metrics["low20"]:
        direction = "bear"
    else:
        direction = None
    rating = bull_score if direction == "bull" else bear_score if direction == "bear" else bull_score
    return {
        "rating": int(rating), "direction": direction,
        "bullish_checks": bull, "bearish_checks": bear,
    }


def _flow_context(context: dict[str, Any] | None, direction: str) -> dict[str, Any]:
    raw = (context or {}).get("flow") or {}
    status = raw.get("status") if raw.get("status") in {"available", "unavailable"} else "unavailable"
    alignment = raw.get("alignment")
    if alignment not in {"aligned", "mixed", "conflicting"}:
        bias = raw.get("directional_bias")
        if bias == "mixed":
            alignment = "mixed"
        elif bias in {"bull", "bear"}:
            alignment = "aligned" if bias == direction else "conflicting"
    if status != "available" or alignment not in {"aligned", "mixed", "conflicting"}:
        alignment = "unavailable"
    return {
        "status": status,
        "alignment": alignment,
        "evidence": raw.get("evidence") or "Options flow unavailable",
        "as_of": raw.get("as_of"),
        "stale": bool(raw.get("stale")),
    }


def _plan(metrics: dict[str, float], direction: str) -> dict[str, Any] | None:
    atr = metrics["atr"]
    if not atr or atr <= 0:
        return None
    if direction == "bull":
        entry_low = metrics["high20"]
        entry_high = entry_low + 0.5 * atr
        midpoint = (entry_low + entry_high) / 2
        stop = max(metrics["sma20"], metrics["swing_low"]) - 0.5 * atr
        if stop >= entry_low:
            stop = entry_low - atr
        risk = midpoint - stop
        target = midpoint + 2 * risk
        current_risk = metrics["last"] - stop
        available_reward = target - metrics["last"]
        extended = metrics["last"] > entry_high or metrics["last"] - entry_low > 2 * atr
    else:
        entry_high = metrics["low20"]
        entry_low = entry_high - 0.5 * atr
        midpoint = (entry_low + entry_high) / 2
        stop = min(metrics["sma20"], metrics["swing_high"]) + 0.5 * atr
        if stop <= entry_high:
            stop = entry_high + atr
        risk = stop - midpoint
        target = midpoint - 2 * risk
        current_risk = stop - metrics["last"]
        available_reward = metrics["last"] - target
        extended = metrics["last"] < entry_low or entry_high - metrics["last"] > 2 * atr
    available_rr = available_reward / current_risk if current_risk > 0 else 0.0
    return {
        "entry_low": _round(entry_low),
        "entry_high": _round(entry_high),
        "stop": _round(stop),
        "target": _round(target),
        "risk_reward": _round(max(0.0, available_rr)),
        "holding_period": "2–20 sessions",
        "extended": bool(extended),
    }


def calculate_stock_pro_signal(
    history: pd.DataFrame,
    context: dict[str, Any] | None = None,
    *,
    calculated_at: str | None = None,
) -> dict[str, Any]:
    """Return the versioned Stock Pro signal contract for one symbol."""
    frame = _prepare(history)
    if len(frame) < 200:
        return _empty_contract("Insufficient price history for Stock Pro signal.", int(len(frame) / 200 * 40))

    metrics = _features(frame)
    vcp = _vcp(metrics)
    direction = vcp["direction"]
    if direction is None:
        result = _empty_contract("VCP direction is unresolved; evidence is neutral.", 80)
        result["vcp"] = vcp
        result["calculated_at"] = calculated_at or result["calculated_at"]
        return _json_safe(result)

    aligned = 1 if direction == "bull" else -1
    resolved = metrics["last"] > metrics["high20"] if direction == "bull" else metrics["last"] < metrics["low20"]
    sma20_ok = metrics["last"] > metrics["sma20"] if direction == "bull" else metrics["last"] < metrics["sma20"]
    sma50_ok = metrics["last"] > metrics["sma50"] if direction == "bull" else metrics["last"] < metrics["sma50"]
    near_level = abs(metrics["last"] - (metrics["high20"] if direction == "bull" else metrics["low20"])) <= 2 * metrics["atr"]

    vcp_score = vcp["rating"] * 8
    structure_score = (4 if sma20_ok else 0) + (4 if sma50_ok else 0) + (8 if resolved else 0) + (4 if near_level else 0)
    momentum_score = 0
    momentum_score += 4 if metrics["mom5"] * aligned > 0 else 0
    momentum_score += 4 if metrics["mom21"] * aligned > 0 else 0
    rsi_confirms = 50 <= metrics["rsi"] <= 78 if direction == "bull" else 22 <= metrics["rsi"] <= 50
    momentum_score += 2 if rsi_confirms else 0

    volume_breakout = metrics["volume20"] > 0 and metrics["volume_now"] >= metrics["volume20"] * 1.2
    dry_up = metrics["volume20"] <= metrics["volume50"]
    delivery = (context or {}).get("delivery") or {}
    delivery_alignment = delivery.get("alignment")
    if delivery_alignment not in {"aligned", "conflicting", "mixed"}:
        delivery_bias = delivery.get("directional_bias")
        delivery_alignment = (
            "aligned" if delivery_bias == direction else
            "conflicting" if delivery_bias in {"bull", "bear"} else
            "mixed"
        )
    participation_score = (5 if resolved and volume_breakout else 0) + (3 if dry_up else 0) + (2 if delivery_alignment == "aligned" else 0)

    flow = _flow_context(context, direction)
    options_score = {"aligned": 15, "mixed": 7, "conflicting": 0, "unavailable": 0}[flow["alignment"]]
    if flow["stale"]:
        options_score = round(options_score * 0.5)

    regime = (context or {}).get("regime") or {}
    regime_available = regime.get("status") == "available"
    regime_direction = regime.get("direction")
    if not regime_available:
        regime_score, regime_status = 0, "unavailable"
    elif regime_direction == direction:
        regime_score, regime_status = 5, "aligned"
    elif regime_direction == "flat":
        regime_score, regime_status = 3, "mixed"
    else:
        regime_score, regime_status = 0, "conflicting"
    if regime.get("stale"):
        regime_score = round(regime_score * 0.5)

    confidence = int(round(min(100, vcp_score + structure_score + momentum_score + participation_score + options_score + regime_score)))
    coverage = 80 + (15 if flow["status"] == "available" else 0) + (5 if regime_available else 0)
    plan = _plan(metrics, direction)
    actionable = bool(
        vcp["rating"] >= 4 and resolved and confidence >= 75 and coverage >= 70
        and plan and not plan["extended"] and (plan["risk_reward"] or 0) >= 1.5
    )
    structure_intact = sma20_ok or sma50_ok
    hold = bool(
        confidence >= 55 and structure_intact and plan
        and (plan["extended"] or (plan["risk_reward"] or 0) < 1.5)
    )
    if actionable:
        label = "BUY" if direction == "bull" else "SELL"
    elif hold:
        label = "HOLD"
    elif confidence >= 55 or vcp["rating"] >= 3:
        label = "BULLISH" if direction == "bull" else "BEARISH"
    else:
        label = "NEUTRAL"

    if flow["alignment"] == "aligned":
        summary = f"Options flow confirms {direction} VCP structure."
    elif flow["alignment"] == "conflicting":
        summary = f"Options flow conflicts with {direction} VCP structure."
    elif flow["alignment"] == "mixed":
        summary = f"Options flow is mixed; {direction} VCP structure leads."
    else:
        summary = f"Options flow unavailable; {direction} VCP structure is technical-only."

    factor_specs = {
        "vcp": (vcp_score, 40, "aligned" if vcp["rating"] >= 3 else "weak", f"{vcp['rating']}/5 VCP checks"),
        "structure": (structure_score, 20, "aligned" if structure_score >= 12 else "forming", "20-session price structure"),
        "momentum": (momentum_score, 10, "aligned" if momentum_score >= 6 else "conflicting", f"RSI {metrics['rsi']:.1f}"),
        "participation": (participation_score, 10, "aligned" if participation_score >= 5 else "weak", "Volume and delivery participation"),
        "options": (options_score, 15, flow["alignment"], flow["evidence"]),
        "regime": (regime_score, 5, regime_status, f"Market regime {regime_direction or 'unavailable'}"),
    }
    factors = {
        name: {"score": score, "max": maximum, "status": status, "detail": detail}
        for name, (score, maximum, status, detail) in factor_specs.items()
    }
    invalidation = None
    upgrade = None
    if plan:
        invalidation = f"Structure invalid below {plan['stop']:.2f}" if direction == "bull" else f"Structure invalid above {plan['stop']:.2f}"
        level = plan["entry_low"] if direction == "bull" else plan["entry_high"]
        upgrade = f"Close through {level:.2f} with confirming participation."

    result = {
        "version": VERSION,
        "calculated_at": calculated_at or datetime.now(timezone.utc).isoformat(),
        "label": label,
        "direction": direction,
        "confidence": confidence,
        "data_coverage": coverage,
        "summary": summary,
        "vcp": vcp,
        "factors": factors,
        "flow": flow,
        "plan": plan,
        "invalidation": invalidation,
        "upgrade_condition": upgrade,
    }
    return _json_safe(result)
