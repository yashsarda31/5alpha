"""The just-expired weekly must never be picked as the active chain expiry.

NSE keeps yesterday's expiry in option-chain-contract-info expiryDates (and in
the OI-spurt rows) until the next session starts — pre-open, raw [0] is a dead
contract that yields ATM IV 0%, straddle ~0 and S/R pinned to max pain.
"""
from datetime import datetime, timedelta, timezone

from api.main import _first_live_nse_expiry, _nse_expiry_is_live

IST = timezone(timedelta(hours=5, minutes=30))


def _nse_fmt(d):
    return d.strftime("%d-%b-%Y")


def test_expired_expiry_is_skipped():
    today = datetime.now(IST).date()
    yesterday = _nse_fmt(today - timedelta(days=1))
    next_week = _nse_fmt(today + timedelta(days=6))
    assert _first_live_nse_expiry([yesterday, next_week]) == next_week


def test_today_counts_as_live():
    today = _nse_fmt(datetime.now(IST).date())
    assert _nse_expiry_is_live(today)
    assert _first_live_nse_expiry([today, "01-Jan-2099"]) == today


def test_all_expired_falls_back_to_first():
    today = datetime.now(IST).date()
    stale = [_nse_fmt(today - timedelta(days=d)) for d in (7, 1)]
    assert _first_live_nse_expiry(stale) == stale[0]


def test_unparseable_expiry_is_kept():
    # Unknown format must not silently drop contracts/expiries.
    assert _nse_expiry_is_live("garbage")
    assert _first_live_nse_expiry([]) is None
