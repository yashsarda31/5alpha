import math

from .contracts import CandidateSnapshot, ExecutionPlan, ExecutionPolicy, Outcome, SessionBar


def _expired(candidate: CandidateSnapshot, policy: ExecutionPolicy, reason: str) -> ExecutionPlan:
    return ExecutionPlan(
        candidate.candidate_id,
        "expired",
        candidate.side,
        None,
        None,
        None,
        None,
        None,
        policy.max_hold_sessions,
        reason,
    )


def _round_away_from_entry(price: float, direction: int, tick_size: float) -> float:
    ticks = price / tick_size
    rounded_ticks = math.ceil(ticks - 1e-12) if direction == 1 else math.floor(ticks + 1e-12)
    return round(rounded_ticks * tick_size, 8)


def build_execution_plan(
    candidate: CandidateSnapshot,
    next_open: float,
    policy: ExecutionPolicy,
    round_trip_cost_pct: float,
) -> ExecutionPlan:
    """Freeze entry, stop, and a target that is at least 1:1 after costs."""
    numeric_inputs = (
        next_open,
        candidate.reference_entry,
        candidate.atr14,
        candidate.session_low,
        candidate.session_high,
        policy.atr_multiple,
        policy.max_chase_r,
        policy.tick_size,
        round_trip_cost_pct,
    )
    if (
        candidate.side not in ("LONG", "SHORT")
        or not all(math.isfinite(value) for value in numeric_inputs)
        or next_open <= 0
        or candidate.reference_entry <= 0
        or candidate.atr14 <= 0
        or policy.atr_multiple <= 0
        or policy.max_chase_r < 0
        or policy.max_hold_sessions <= 0
        or policy.tick_size <= 0
        or round_trip_cost_pct < 0
    ):
        return _expired(candidate, policy, "invalid_candidate")

    direction = 1 if candidate.side == "LONG" else -1
    base_risk = candidate.atr14 * policy.atr_multiple
    swing_risk = (
        next_open - candidate.session_low + policy.tick_size
        if direction == 1
        else candidate.session_high - next_open + policy.tick_size
    )
    risk = max(base_risk, swing_risk)
    chase = direction * (next_open - candidate.reference_entry)
    if chase > policy.max_chase_r * risk:
        return _expired(candidate, policy, "chased_open")

    stop = next_open - direction * risk
    cost_amount = next_open * round_trip_cost_pct / 100.0
    required_target_distance = risk + 2.0 * cost_amount
    raw_target = next_open + direction * required_target_distance
    target = _round_away_from_entry(raw_target, direction, policy.tick_size)
    target_distance = direction * (target - next_open)

    if candidate.barrier_price is not None:
        if not math.isfinite(candidate.barrier_price):
            return _expired(candidate, policy, "invalid_candidate")
        room = direction * (candidate.barrier_price - next_open)
        if 0 < room < target_distance:
            return _expired(candidate, policy, "insufficient_1r_room")

    rr_net = (target_distance - cost_amount) / (risk + cost_amount)
    return ExecutionPlan(
        candidate.candidate_id,
        "active",
        candidate.side,
        round(next_open, 8),
        round(stop, 8),
        target,
        round(risk, 8),
        round(rr_net, 8),
        policy.max_hold_sessions,
        "qualified",
    )


def resolve_outcome(
    plan: ExecutionPlan,
    bars: list[SessionBar],
    round_trip_cost_pct: float,
) -> Outcome | None:
    """Resolve daily bars conservatively, with gaps before intraday ambiguity."""
    if plan.status != "active":
        return None
    if plan.entry is None or plan.stop is None or plan.target is None:
        return None

    direction = 1 if plan.side == "LONG" else -1

    def finish(price: float, bar: SessionBar, reason: str) -> Outcome:
        gross = direction * (price - plan.entry) / plan.entry * 100.0
        net = gross - round_trip_cost_pct
        return Outcome(
            "win" if net > 0 else "loss",
            reason,
            round(price, 8),
            bar.session_date,
            round(gross, 8),
            round(net, 8),
        )

    eligible = list(bars)[: plan.max_hold_sessions]
    for bar in eligible:
        if direction == 1:
            if bar.open <= plan.stop:
                return finish(bar.open, bar, "stop")
            if bar.open >= plan.target:
                return finish(bar.open, bar, "target")
            if bar.low <= plan.stop:
                return finish(plan.stop, bar, "stop")
            if bar.high >= plan.target:
                return finish(plan.target, bar, "target")
        else:
            if bar.open >= plan.stop:
                return finish(bar.open, bar, "stop")
            if bar.open <= plan.target:
                return finish(bar.open, bar, "target")
            if bar.high >= plan.stop:
                return finish(plan.stop, bar, "stop")
            if bar.low <= plan.target:
                return finish(plan.target, bar, "target")

    if len(eligible) == plan.max_hold_sessions:
        return finish(eligible[-1].close, eligible[-1], "time_exit")
    return None
