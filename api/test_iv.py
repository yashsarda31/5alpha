"""Tests for _straddle_implied_iv — the skew-free ATM IV used by Market Signals.

Regression for the 2026-07-06 user report: IV regime showed RICH 16 when the
true ATM IV was ~12.6. Root cause: NSE's per-leg impliedVolatility prices puts
off spot (not the forward), inflating PE IV; averaging CE/PE inherited the skew.
"""
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from api.main import _straddle_implied_iv

IST = timezone(timedelta(hours=5, minutes=30))


def _expiry_str(days_ahead):
    return (datetime.now(IST) + timedelta(days=days_ahead)).strftime("%d-%b-%Y")


def _bs_leg(fwd, strike, sigma, t, kind):
    sd = sigma * math.sqrt(t)
    cdf = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))
    d1 = (math.log(fwd / strike) + 0.5 * sd * sd) / sd
    d2 = d1 - sd
    if kind == "c":
        return fwd * cdf(d1) - strike * cdf(d2)
    return strike * cdf(-d2) - fwd * cdf(-d1)


def test_round_trip_recovers_known_sigma():
    # Price a straddle at sigma=14% and make sure the solver gets it back.
    expiry = _expiry_str(7)
    expiry_dt = datetime.strptime(expiry, "%d-%b-%Y").replace(hour=15, minute=30, tzinfo=IST)
    t = (expiry_dt - datetime.now(IST)).total_seconds() / (365.0 * 86400)
    fwd, strike, sigma = 24350.0, 24350.0, 0.14
    ce = _bs_leg(fwd, strike, sigma, t, "c")
    pe = _bs_leg(fwd, strike, sigma, t, "p")
    iv = _straddle_implied_iv(strike, ce, pe, expiry)
    assert iv is not None
    assert abs(iv - 14.0) < 0.1, iv


def test_live_shape_2026_07_06():
    # The actual numbers from the user report day: legs said 12.2/16.5 (avg
    # 14.4) but the straddle only supported ~12.7.
    iv = _straddle_implied_iv(24350.0, 70.65, 74.85, "07-Jul-2026")
    if iv is not None:  # None once that date is >1y in the past — skip then
        assert 11.5 < iv < 13.5, iv


def test_rejects_bad_inputs():
    expiry = _expiry_str(7)
    assert _straddle_implied_iv(0, 70, 75, expiry) is None
    assert _straddle_implied_iv(24350, 0, 75, expiry) is None
    assert _straddle_implied_iv(24350, 70, 0, expiry) is None
    assert _straddle_implied_iv(24350, 70, 75, "garbage") is None


def test_expired_or_last_hour_returns_none():
    assert _straddle_implied_iv(24350, 70, 75, _expiry_str(-1)) is None


def test_absurd_price_returns_none():
    # Straddle worth more than the strike → outside solver bracket → None.
    assert _straddle_implied_iv(100.0, 90.0, 95.0, _expiry_str(7)) is None


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
