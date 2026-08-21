from datetime import date, timedelta

from api.signal_model.contracts import CandidateSnapshot, ExecutionPolicy, SessionBar
from api.signal_model.execution import build_execution_plan, resolve_outcome


def candidate(side="LONG", barrier_price=None):
    if barrier_price is None:
        barrier_price = 108.0 if side == "LONG" else 92.0
    return CandidateSnapshot(
        candidate_id=f"IN|2026-08-20|ABC|{side}",
        market="IN",
        symbol="ABC",
        side=side,
        kind="long_buildup" if side == "LONG" else "short_buildup",
        session_date=date(2026, 8, 20),
        observed_at="2026-08-20T15:45:00+05:30",
        reference_entry=100.0,
        atr14=4.0,
        session_low=98.0,
        session_high=103.0,
        barrier_price=barrier_price,
        features={},
        data_as_of={},
    )


def test_long_plan_is_net_one_to_one_after_costs():
    plan = build_execution_plan(
        candidate(), next_open=100.0, policy=ExecutionPolicy(), round_trip_cost_pct=0.20
    )
    assert plan.status == "active"
    assert plan.stop == 96.0
    assert plan.rr_net >= 1.0
    assert plan.target > 104.0


def test_short_plan_is_net_one_to_one_after_costs():
    plan = build_execution_plan(
        candidate("SHORT"), next_open=100.0, policy=ExecutionPolicy(), round_trip_cost_pct=0.20
    )
    assert plan.status == "active"
    assert plan.stop == 104.0
    assert plan.rr_net >= 1.0
    assert plan.target < 96.0


def test_chased_gap_expires_instead_of_moving_levels():
    plan = build_execution_plan(
        candidate(), next_open=101.1, policy=ExecutionPolicy(), round_trip_cost_pct=0.20
    )
    assert plan.status == "expired"
    assert plan.reason == "chased_open"


def test_barrier_inside_required_target_expires():
    plan = build_execution_plan(
        candidate(barrier_price=103.0), 100.0, ExecutionPolicy(), 0.20
    )
    assert plan.status == "expired"
    assert plan.reason == "insufficient_1r_room"


def test_ambiguous_daily_bar_resolves_stop_first():
    plan = build_execution_plan(candidate(), 100.0, ExecutionPolicy(), 0.20)
    bar = SessionBar(date(2026, 8, 21), 100.0, plan.target + 1, plan.stop - 1, 101.0)
    out = resolve_outcome(plan, [bar], round_trip_cost_pct=0.20)
    assert out.status == "loss"
    assert out.exit_price == plan.stop


def test_gap_through_target_uses_open_price():
    plan = build_execution_plan(candidate(), 100.0, ExecutionPolicy(), 0.20)
    bar = SessionBar(date(2026, 8, 21), plan.target + 1, plan.target + 2, 100, 101)
    out = resolve_outcome(plan, [bar], round_trip_cost_pct=0.20)
    assert out.status == "win"
    assert out.exit_price == round(plan.target + 1, 2)


def test_fifth_session_time_exit_uses_net_result():
    plan = build_execution_plan(candidate(), 100.0, ExecutionPolicy(), 0.20)
    start = date(2026, 8, 21)
    bars = [SessionBar(start + timedelta(days=i), 100, 103, 97, 100.5) for i in range(5)]
    out = resolve_outcome(plan, bars, round_trip_cost_pct=0.20)
    assert out.status == "win"
    assert out.reason == "time_exit"
    assert out.net_return_pct > 0


def test_incomplete_holding_period_has_no_outcome():
    plan = build_execution_plan(candidate(), 100.0, ExecutionPolicy(), 0.20)
    bars = [SessionBar(date(2026, 8, 21), 100, 103, 97, 100.1)]
    assert resolve_outcome(plan, bars, 0.20) is None
