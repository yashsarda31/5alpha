"""Point-in-time India setup lifecycle. Scores remain the baseline model's.

One bounded row per symbol/side/session stores an immutable anchor and latest
observation. This is forward evidence, not a reconstructed intraday backtest.
"""
from datetime import datetime, timedelta, timezone
import json
import math
from statistics import median

VERSION = "signals-v2.3-timing"
MAX_SOURCE_AGE_SECONDS = 180
MAX_CHASE_R = 0.5
MIN_REMAINING_RR = 1.5


def parsed_time(value):
    try:
        stamp = datetime.fromisoformat(value)
        return stamp if stamp.tzinfo is not None else None
    except (TypeError, ValueError):
        return None


def source_age_seconds(observed_at, detected_at):
    observed, detected = parsed_time(observed_at), parsed_time(detected_at)
    return (detected - observed).total_seconds() if observed and detected else None


def source_is_fresh(observed_at, detected_at):
    age = source_age_seconds(observed_at, detected_at)
    return age is not None and -30 <= age <= MAX_SOURCE_AGE_SECONDS


def ensure_schema(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS signal_timing_state (
        market_date TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
        model_version TEXT NOT NULL, state_json TEXT NOT NULL,
        PRIMARY KEY (market_date, symbol, side, model_version)
    )""")


def timing_comparison(conn):
    """Observed entry timing only. This is not a return or win-rate estimate."""
    ensure_schema(conn)
    rows = conn.execute("SELECT side, state_json FROM signal_timing_state WHERE model_version=?",
                        (VERSION,)).fetchall()
    paired, delays, improvements = 0, [], []
    counts = {"forming": 0, "triggered": 0, "extended": 0, "invalidated": 0}
    for side, payload in rows:
        state = json.loads(payload)
        counts[state["lifecycle"]] += 1
        base, timed = state.get("baseline_first_entry"), state.get("timed_first_entry")
        if base and timed:
            paired += 1
            direction = 1 if side == "LONG" else -1
            improvements.append(direction * (base - timed) / base * 10000)
            delays.append(source_age_seconds(state["baseline_first_at"], state["published_at"]))
    return {"model_version": VERSION, "observed_candidates": len(rows), "states": counts,
            "paired_entries": paired,
            "median_entry_improvement_bps": round(median(improvements), 2) if improvements else None,
            "median_extra_confirmation_seconds": round(median(delays), 1) if delays else None,
            "returns_evaluated": False,
            "note": "Forward observations only. Positive entry improvement means a better observed price; "
                    "costs, fills, missed trades and returns are not evaluated."}


def _number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def _initial_anchor(plan, observed_at, detected_at):
    price, high, low = plan.get("entry"), plan.get("day_high"), plan.get("day_low")
    if (plan.get("side") not in {"LONG", "SHORT"}
            or not all(_number(v) and v > 0 for v in (price, high, low))
            or high <= low or price > high or price < low):
        return None
    direction = 1 if plan["side"] == "LONG" else -1
    trigger = high if direction == 1 else low
    # Same range-based risk convention as the baseline, anchored at the trigger.
    risk = max(trigger * .003, max(high - low, trigger * .006) * .5)
    stop, target = trigger - direction * risk, trigger + direction * 2 * risk
    if min(stop, target) <= 0:
        return None
    return dict(trigger=trigger, initial_stop=stop, initial_target=target,
                initial_risk=risk, first_seen_at=detected_at,
                first_source_at=observed_at, last_source_at=observed_at,
                lifecycle="forming", last_price=price,
                last_oi_pct=plan.get("oi_pct"), baseline_first_entry=None,
                baseline_first_at=None, published_at=None,
                timed_first_entry=None, push_attempted_at=None)


def classify_batch(conn, candidates, *, observed_at, detected_at, market_date,
                   data_fresh, capital, risk_pct, vol_scale):
    """Caller owns commit/persistence. Never invent a trigger on stale data."""
    ensure_schema(conn)
    fresh = data_fresh and source_is_fresh(observed_at, detected_at)
    if fresh:
        cutoff = (datetime.fromisoformat(market_date) - timedelta(days=35)).date().isoformat()
        conn.execute("DELETE FROM signal_timing_state WHERE market_date < ?", (cutoff,))
    output = []
    for original in candidates:
        plan = dict(original, actionable=False, lifecycle="forming",
                    timing_reason="inputs_unavailable", observed_at=observed_at,
                    detected_at=detected_at, model_version=VERSION)
        key = (market_date, plan.get("symbol"), plan.get("side"), VERSION)
        row = conn.execute("SELECT state_json FROM signal_timing_state WHERE market_date=? "
                           "AND symbol=? AND side=? AND model_version=?", key).fetchone()
        state = json.loads(row[0]) if row else None
        first = state is None
        if first and fresh:
            state = _initial_anchor(plan, observed_at, detected_at)
        if state is None:
            plan["timing_reason"] = "inputs_unavailable" if not fresh else "invalid_price_structure"
            output.append(plan)
            continue
        plan.update({k: state[k] for k in (
            "trigger", "initial_stop", "initial_target", "initial_risk",
            "first_seen_at", "published_at", "baseline_first_entry", "baseline_first_at")})
        price = plan.get("entry")
        newer = (parsed_time(observed_at) is not None and
                 parsed_time(observed_at) > parsed_time(state["last_source_at"]))
        if not fresh or not _number(price) or price <= 0:
            plan["timing_reason"] = "stale_observation" if not fresh else "invalid_price_structure"
            output.append(plan)
            continue
        direction = 1 if plan["side"] == "LONG" else -1
        risk = direction * (price - state["initial_stop"])
        room = direction * (state["initial_target"] - price)
        chase = direction * (price - state["trigger"]) / state["initial_risk"]
        rr = room / risk if risk > 0 else None
        plan.update(chase_r=round(chase, 4), remaining_rr=round(rr, 4) if rr is not None else None)
        quality = plan.get("score", 0) >= 65 and plan.get("coverage_pct", 0) >= 80
        if newer:
            seconds = source_age_seconds(state["last_source_at"], observed_at)
            # Only comparable 30s-5m windows; missing history is explicitly null.
            if seconds is not None and 30 <= seconds <= 300:
                oi_now, oi_prev = plan.get("oi_pct"), state.get("last_oi_pct")
                plan["shadow_features"] = {
                    "window_seconds": seconds,
                    "price_change_pct": round((price / state["last_price"] - 1) * 100, 4),
                    "oi_change_percentage_points": round(oi_now - oi_prev, 4)
                    if _number(oi_now) and _number(oi_prev) else None,
                    "used_for_publication": False,
                }
        plan.setdefault("shadow_features", None)
        if quality and state.get("baseline_first_at") is None and (first or newer):
            state.update(baseline_first_at=detected_at, baseline_first_entry=price)
        if state["lifecycle"] == "invalidated" or risk <= 0:
            lifecycle, reason = "invalidated", "original_stop_broken"
        elif chase > MAX_CHASE_R:
            lifecycle, reason = "extended", "beyond_chase_limit"
        elif chase >= 0 and rr < MIN_REMAINING_RR:
            lifecycle, reason = "extended", "insufficient_remaining_room"
        elif first or not newer:
            lifecycle, reason = "forming", "awaiting_fresh_observation"
        elif chase >= 0 and quality:
            lifecycle, reason = "triggered", "trigger_confirmed"
        else:
            lifecycle = "forming"
            reason = "awaiting_quality" if chase >= 0 else "awaiting_trigger"
        # Out-of-order/repeated input cannot move state or establish a new call.
        can_update = first or newer
        actionable = lifecycle == "triggered" and quality and newer
        if actionable:
            state["published_at"] = state.get("published_at") or detected_at
            state["timed_first_entry"] = state.get("timed_first_entry") or price
            plan.update(stop=state["initial_stop"], target=state["initial_target"], risk=risk,
                        qty=int(capital * risk_pct / 100 / risk * vol_scale),
                        signal_at=detected_at, reward_risk=round(rr, 4),
                        execution_policy="immutable-trigger-no-chase")
        if can_update:
            state.update(last_source_at=observed_at, last_price=price,
                         last_oi_pct=plan.get("oi_pct"), lifecycle=lifecycle)
            conn.execute("INSERT INTO signal_timing_state VALUES (?,?,?,?,?) "
                         "ON CONFLICT(market_date,symbol,side,model_version) DO UPDATE "
                         "SET state_json=excluded.state_json", (*key, json.dumps(state, allow_nan=False)))
        plan.update(lifecycle=lifecycle, timing_reason=reason, actionable=actionable,
                    published_at=state.get("published_at"),
                    baseline_first_at=state.get("baseline_first_at"),
                    baseline_first_entry=state.get("baseline_first_entry"))
        output.append(plan)
    return output
