"""Pure Alpha Cockpit V3 response shaping.

The live data acquisition remains in ``api.main`` for the first V3 slice. This
module turns the existing, battle-tested signal payload into one auditable
contract for the Cockpit. It deliberately performs no network or database I/O.
"""

from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any


SCORE_VERSION = "2.0.0"
CONTRACT_VERSION = "3.0.0"


def _finite(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _round(value: float | None, places: int = 2) -> float | None:
    return round(value, places) if value is not None and math.isfinite(value) else None


def _market_currency(market: str) -> str:
    return "$" if market == "US" else "₹"


def _component(
    name: str,
    value: float | None,
    weight: float,
    evidence: list[str],
    missing: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "value": _round(value, 0),
        "weight": weight,
        "available": value is not None,
        "evidence": evidence,
        "missing": missing or [],
    }


def score_opportunity(plan: dict[str, Any], regime: dict[str, Any], market_open: bool) -> dict[str, Any]:
    """Create transparent swing-trade score components from a V2 plan.

    Quality and catalyst remain explicitly unavailable in the first vertical
    slice instead of being invented. Available pillars renormalize, and coverage
    lowers confidence. The output therefore improves explainability immediately
    while preserving honest gaps for later provider enrichment.
    """
    side = str(plan.get("side") or "").upper()
    direction = str(regime.get("dir") or "flat").lower()
    legacy_score = _finite(plan.get("score")) or 0.0
    why = str(plan.get("why") or "").lower()
    kind = str(plan.get("kind") or "").lower()

    wanted_direction = "bull" if side == "LONG" else "bear"
    aligned = direction == wanted_direction
    trend_value = _clamp(48 + (18 if aligned else 4 if direction == "flat" else -8)
                         + max(0.0, legacy_score - 45.0) * 0.55)
    trend_evidence = [
        f"{side.title()} setup versus {direction or 'flat'} index regime",
        f"Legacy scored setup strength {legacy_score:.0f}/100",
    ]
    if aligned:
        trend_evidence.append("Trade direction agrees with the market regime")

    participation_base = {
        "long_buildup": 68,
        "short_buildup": 68,
        "short_covering": 55,
        "long_unwinding": 48,
    }.get(kind, 52)
    participation_bonus = 0
    participation_evidence = [kind.replace("_", " ").title() if kind else "Directional participation"]
    for flag, points, label in (
        ("opt", 10, "Options flow confirms direction"),
        ("dlv", 9, "Delivery participation confirms the move"),
        ("vol", 9, "Volume expanded versus its recent baseline"),
        ("rng", 6, "Price held near the favorable end of its range"),
        ("oi", 6, "Open-interest change supports participation"),
    ):
        if flag in why:
            participation_bonus += points
            participation_evidence.append(label)
    participation_value = _clamp(participation_base + participation_bonus)

    entry = _finite(plan.get("entry"))
    stop = _finite(plan.get("stop"))
    target = _finite(plan.get("target"))
    risk = abs(entry - stop) if entry is not None and stop is not None else None
    reward = abs(target - entry) if entry is not None and target is not None else None
    rr = reward / risk if risk and reward is not None else None
    vol_scale = _finite(regime.get("vol_scale")) or 1.0
    risk_value = None
    risk_evidence: list[str] = []
    risk_missing: list[str] = []
    if risk is not None and risk > 0 and rr is not None:
        risk_value = _clamp(48 + min(rr, 2.5) * 14 + min(vol_scale, 1.0) * 14)
        risk_evidence = [f"Defined invalidation is {risk / entry * 100:.2f}% from entry" if entry else "Defined invalidation",
                         f"First target offers {rr:.1f}R"]
        if vol_scale < 1:
            risk_evidence.append(f"Volatility regime reduces size to {vol_scale:.2f}×")
    else:
        risk_missing = ["valid entry, stop and target"]

    components = [
        _component("Trend", trend_value, 0.30, trend_evidence),
        _component("Participation", participation_value, 0.25, participation_evidence),
        _component("Quality", None, 0.20, [], ["point-in-time company quality feed"]),
        _component("Catalyst", None, 0.10, [], ["timestamped catalyst feed"]),
        _component("Risk", risk_value, 0.15, risk_evidence, risk_missing),
    ]
    available_weight = sum(c["weight"] for c in components if c["available"])
    earned = sum(float(c["value"]) * c["weight"] for c in components if c["available"])
    score = round(earned / available_weight) if available_weight else None
    coverage = available_weight
    freshness_factor = 1.0 if market_open else 0.92
    confidence_value = round(coverage * freshness_factor * 100)
    confidence_label = "HIGH" if confidence_value >= 85 else "MEDIUM" if confidence_value >= 60 else "LOW"
    missing = [item for c in components for item in c["missing"]]
    return {
        "version": SCORE_VERSION,
        "score": score,
        "components": components,
        "coverage": _round(coverage, 2),
        "confidence": {"label": confidence_label, "value": confidence_value},
        "missing_inputs": missing,
        "legacy_score": round(legacy_score),
    }


def build_regime(signals: dict[str, Any]) -> dict[str, Any]:
    raw = signals.get("regime") or {}
    overall = str(raw.get("overall") or "MIXED").upper()
    market_open = bool(signals.get("market_open"))
    breadth = raw.get("breadth") or {}
    adv = _finite(breadth.get("adv")) or 0
    dec = _finite(breadth.get("dec")) or 0
    breadth_pct = adv / (adv + dec) * 100 if adv + dec else None

    if overall == "RISK-ON":
        posture, cash_pct = "Favor selective longs", 18
        summary = "Constructive trend. Favor selective longs and keep dry powder for cleaner entries."
    elif overall == "RISK-OFF":
        posture, cash_pct = "Protect capital", 55
        summary = "Risk is elevated. Protect capital, reduce size and demand stronger confirmation."
    else:
        posture, cash_pct = "Prioritize confirmation", 35
        summary = "Mixed conditions. Prioritize confirmation and keep portfolio risk below normal."

    if not market_open:
        summary += " The market is closed, so levels reflect the latest completed snapshot."

    components = [
        {"label": "Nifty trend", "value": (raw.get("nifty") or {}).get("label") or "Unavailable"},
        {"label": "Volatility", "value": (raw.get("vol") or {}).get("label") or "Unavailable"},
        {"label": "Breadth", "value": f"{breadth_pct:.0f}% advancing" if breadth_pct is not None else "Unavailable"},
        {"label": "Near-expiry IV", "value": (raw.get("iv") or {}).get("label") or "Unavailable"},
    ]
    return {
        "label": overall,
        "direction": raw.get("dir") or "flat",
        "posture": posture,
        "cash_guidance_pct": cash_pct,
        "summary": summary,
        "vix": _finite(raw.get("vix")),
        "vol_scale": _finite(raw.get("vol_scale")) or 1.0,
        "components": components,
    }


def _trade_levels(plan: dict[str, Any], side: str) -> dict[str, Any] | None:
    entry = _finite(plan.get("entry"))
    stop = _finite(plan.get("stop"))
    first_target = _finite(plan.get("target"))
    if entry is None or stop is None or first_target is None or entry <= 0:
        return None
    risk = abs(entry - stop)
    if risk <= 0:
        return None
    if side == "LONG" and not (stop < entry < first_target):
        return None
    if side == "SHORT" and not (first_target < entry < stop):
        return None
    if side == "LONG":
        zone = [entry - 0.10 * risk, entry + 0.15 * risk]
        second_target = entry + 2.25 * risk
    else:
        zone = [entry - 0.15 * risk, entry + 0.10 * risk]
        second_target = entry - 2.25 * risk
    return {
        "entry": _round(entry),
        "entry_zone": [_round(min(zone)), _round(max(zone))],
        "stop": _round(stop),
        "targets": [_round(first_target), _round(second_target)],
        "risk_per_share": _round(risk),
        "risk_reward": _round(abs(first_target - entry) / risk, 1),
    }


def _holding_period(score: int | None, regime: dict[str, Any]) -> str:
    if score is not None and score >= 82 and regime.get("label") == "RISK-ON":
        return "5–15 sessions"
    if regime.get("label") == "RISK-OFF":
        return "2–7 sessions"
    return "3–12 sessions"


def _build_opportunity(
    plan: dict[str, Any],
    signals: dict[str, Any],
    regime: dict[str, Any],
    capital: float,
    risk_pct: float,
) -> dict[str, Any] | None:
    side = str(plan.get("side") or "").upper()
    if side not in {"LONG", "SHORT"}:
        return None
    levels = _trade_levels(plan, side)
    if not levels:
        return None
    score = score_opportunity(plan, signals.get("regime") or {}, bool(signals.get("market_open")))
    if score["score"] is None:
        return None

    risk_budget = capital * risk_pct / 100
    raw_qty = math.floor(risk_budget / levels["risk_per_share"])
    max_position = capital * 0.14
    max_qty = math.floor(max_position / levels["entry"])
    quantity = max(0, min(raw_qty, max_qty))
    allocation = quantity * levels["entry"]
    market = str(signals.get("signals_market") or "IN").upper()
    symbol = str(plan.get("symbol") or "").upper()
    as_of = str(signals.get("as_of") or datetime.now(timezone.utc).isoformat())
    evidence = [item for component in score["components"] for item in component["evidence"]]
    state = "CONFIRMED" if score["score"] >= 60 else "EMERGING"
    return {
        "id": f"{market}:{symbol}:{side}:{as_of[:10]}",
        "symbol": symbol,
        "market": market,
        "currency": _market_currency(market),
        "side": side,
        "state": state,
        "score": score,
        "levels": levels,
        "holding_period": _holding_period(score["score"], regime),
        "allocation": {
            "quantity": quantity,
            "value": _round(allocation),
            "portfolio_pct": _round(allocation / capital * 100, 1) if capital else None,
            "risk_rupees": _round(quantity * levels["risk_per_share"]),
            "risk_pct": _round(quantity * levels["risk_per_share"] / capital * 100, 2) if capital else None,
        },
        "why_it_qualifies": evidence[:4],
        "what_changes_our_mind": [
            f"A close through the {levels['stop']:,.2f} invalidation level",
            "Participation fades while price fails to progress",
            "The market regime turns against the trade direction",
        ],
        "as_of": as_of,
    }


def _portfolio_guidance(
    opportunities: list[dict[str, Any]],
    capital: float,
    regime: dict[str, Any],
) -> dict[str, Any]:
    deploy_limit = capital * (1 - regime["cash_guidance_pct"] / 100)
    deployed = 0.0
    total_risk = 0.0
    for opportunity in opportunities:
        allocation = opportunity["allocation"]
        allowed = max(0.0, deploy_limit - deployed)
        if allocation["value"] > allowed and opportunity["levels"]["entry"]:
            quantity = math.floor(allowed / opportunity["levels"]["entry"])
            value = quantity * opportunity["levels"]["entry"]
            risk = quantity * opportunity["levels"]["risk_per_share"]
            allocation.update({
                "quantity": quantity,
                "value": _round(value),
                "portfolio_pct": _round(value / capital * 100, 1),
                "risk_rupees": _round(risk),
                "risk_pct": _round(risk / capital * 100, 2),
            })
        deployed += allocation["value"] or 0
        total_risk += allocation["risk_rupees"] or 0
    return {
        "reference_capital": _round(capital, 0),
        "deployed": _round(deployed, 0),
        "deployed_pct": _round(deployed / capital * 100, 1) if capital else None,
        "cash": _round(capital - deployed, 0),
        "cash_pct": _round((capital - deployed) / capital * 100, 1) if capital else None,
        "total_risk": _round(total_risk, 0),
        "total_risk_pct": _round(total_risk / capital * 100, 2) if capital else None,
        "per_trade_risk_pct": None if not opportunities else opportunities[0]["allocation"]["risk_pct"],
        "warnings": ["Model allocation only — confirm liquidity and current prices before acting"],
    }


def build_cockpit(
    signals: dict[str, Any] | None,
    dashboard: dict[str, Any] | None,
    capital: float = 10_000_000,
    risk_pct: float = 0.75,
    signal_error: str | None = None,
    dashboard_error: str | None = None,
) -> dict[str, Any]:
    """Build the V3 response from existing endpoint payloads."""
    signals = signals or {}
    dashboard = dashboard or {}
    now = datetime.now(timezone.utc).isoformat()
    regime = build_regime(signals)
    plans = (signals.get("setups") or {}).get("plans") or []
    opportunities = []
    seen = set()
    for plan in sorted(plans, key=lambda row: _finite(row.get("score")) or 0, reverse=True):
        symbol = str(plan.get("symbol") or "").upper()
        if not symbol or symbol in seen:
            continue
        opportunity = _build_opportunity(plan, signals, regime, capital, risk_pct)
        if opportunity:
            opportunities.append(opportunity)
            seen.add(symbol)
        if len(opportunities) == 7:
            break

    allocation = _portfolio_guidance(opportunities, capital, regime)
    sources = [
        {
            "source": "Market signals",
            "state": "unavailable" if signal_error or not signals else "fresh" if signals.get("market_open") else "stale",
            "market_time": signals.get("as_of"),
            "retrieved_at": now,
            "warning": signal_error,
        },
        {
            "source": "Market dashboard",
            "state": "unavailable" if dashboard_error or not dashboard else "fresh",
            "market_time": None,
            "retrieved_at": now,
            "warning": dashboard_error,
        },
        {
            "source": "Company quality & catalysts",
            "state": "partial",
            "market_time": None,
            "retrieved_at": now,
            "warning": "Not yet available in the first V3 vertical slice; confidence is reduced, not fabricated.",
        },
    ]
    attention = []
    if not signals.get("market_open"):
        attention.append({"priority": "info", "type": "session", "message": regime["summary"]})
    if opportunities:
        top = opportunities[0]
        attention.append({
            "priority": "high",
            "type": "opportunity",
            "opportunity_id": top["id"],
            "message": f"{top['symbol']} leads the current list at {top['score']['score']}/100, with {top['score']['confidence']['label'].lower()} data confidence.",
        })
    else:
        attention.append({
            "priority": "normal",
            "type": "opportunity",
            "message": "No setup currently clears the Cockpit's confirmation and risk gates.",
        })
    if any(source["state"] in {"partial", "unavailable"} for source in sources):
        attention.append({
            "priority": "normal",
            "type": "data",
            "message": "Some evidence is incomplete. Scores show reduced confidence and expose every missing input.",
        })

    return {
        "contract_version": CONTRACT_VERSION,
        "as_of": signals.get("as_of") or now,
        "market": {
            "code": str(signals.get("signals_market") or dashboard.get("movers_market") or "IN").upper(),
            "is_open": bool(signals.get("market_open")),
            "note": signals.get("market_note") or ("live" if signals.get("market_open") else "latest snapshot"),
            "indices": dashboard.get("indices") or [],
        },
        "regime": regime,
        "opportunities": opportunities,
        "allocation": allocation,
        "attention": attention,
        "sources": sources,
    }
