"""Validate published signal snapshots before they reach research clients."""

from copy import deepcopy
from datetime import datetime, timezone
import math


SCHEMA = 1
LIVE_MAX_AGE_SECONDS = 180
LEVEL_FIELDS = ("entry", "stop", "target", "trigger", "initial_stop", "qty")


def make_record(market, payload, session_date, generated_at=None):
    generated_at = generated_at or datetime.now(timezone.utc)
    return {
        "schema": SCHEMA,
        "market": market,
        "session_date": str(session_date),
        "generated_at": generated_at.astimezone(timezone.utc).isoformat(timespec="seconds"),
        "payload": payload,
    }


def _timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except (AttributeError, TypeError, ValueError):
        return None


def _withhold_levels(setups):
    for lane in ("plans", "watchlist"):
        for plan in setups.get(lane) or []:
            if not isinstance(plan, dict):
                continue
            for field in LEVEL_FIELDS:
                if field in plan:
                    plan[field] = None
            plan["actionable"] = False


def public_view(record, market, market_open, market_note, expected_session, now,
                capital=1_000_000, risk_pct=1.0):
    """Return an independent, time-checked view or None for an invalid record."""
    if not isinstance(record, dict) or record.get("schema") != SCHEMA or record.get("market") != market:
        return None
    generated_at = _timestamp(record.get("generated_at"))
    payload = record.get("payload")
    if not generated_at or not isinstance(payload, dict) or payload.get("signals_market") != market:
        return None
    status = payload.get("data_status")
    setups = payload.get("setups")
    if not isinstance(status, dict) or not isinstance(setups, dict) or not isinstance(setups.get("plans"), list):
        return None
    if not math.isfinite(capital) or not math.isfinite(risk_pct) or capital <= 0 or risk_pct <= 0:
        return None

    now = now.astimezone(timezone.utc)
    age = (now - generated_at).total_seconds()
    observed_at = _timestamp(status.get("observed_at"))
    source_age = (now - observed_at).total_seconds() if observed_at else None
    stale = (age < -60 or record.get("session_date") != expected_session
             or (market_open and (age > LIVE_MAX_AGE_SECONDS or source_age is None
                                  or source_age < -30 or source_age > LIVE_MAX_AGE_SECONDS)))
    result = deepcopy(payload)
    result["market_open"] = bool(market_open)
    result["market_note"] = market_note
    result["snapshot"] = {"generated_at": record["generated_at"], "age_seconds": max(0, int(age))}
    result_status = result["data_status"]
    warnings = list(result_status.get("warnings") or [])
    if stale:
        result_status["status"] = "stale"
        if "published_snapshot_delayed" not in warnings:
            warnings.append("published_snapshot_delayed")
    elif not market_open and result_status.get("status") == "fresh":
        result_status["status"] = "last_session"
    result_status["warnings"] = warnings
    if observed_at and isinstance(result.get("timing"), dict):
        result["timing"]["source_age_seconds"] = max(0, int((now - observed_at).total_seconds()))
    result["setups"]["capital"] = capital
    result["setups"]["risk_pct"] = risk_pct

    actionable = (result_status.get("required_inputs_complete") is True
                  and result_status.get("status") in {"fresh", "last_session"})
    if not actionable:
        _withhold_levels(result["setups"])
        return result

    # Publication is market-wide. Only the display quantity depends on the
    # visitor's capital and risk; locked paper positions retain their original size.
    vol_scale = result.get("regime", {}).get("vol_scale", 1.0)
    vol_scale = vol_scale if isinstance(vol_scale, (int, float)) and math.isfinite(vol_scale) else 1.0
    for plan in result["setups"]["plans"]:
        if not isinstance(plan, dict) or plan.get("levels_locked"):
            continue
        entry, stop = plan.get("entry"), plan.get("stop")
        if (isinstance(entry, (int, float)) and isinstance(stop, (int, float))
                and math.isfinite(entry) and math.isfinite(stop) and entry != stop):
            plan["qty"] = int(capital * risk_pct / 100 * vol_scale / abs(entry - stop))
        else:
            plan["qty"] = None
    return result
