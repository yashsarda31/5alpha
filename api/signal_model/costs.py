from datetime import date

OTHER_ROUND_TRIP_BPS = {"IN": 12.0, "US": 10.0}
INDIA_FUTURES_STT_CHANGE_DATE = date(2026, 4, 1)


def round_trip_cost_pct(market: str, session_date: date) -> float:
    """Return the conservative all-in round-trip cost as percent of entry."""
    normalized_market = market.upper()
    if normalized_market == "IN":
        # Futures STT on the sell leg is 0.02% through 2026-03-31 and
        # 0.05% from 2026-04-01. The remaining envelope covers conservative
        # slippage, brokerage, exchange charges, GST, and stamp duty.
        stt_bps = 5.0 if session_date >= INDIA_FUTURES_STT_CHANGE_DATE else 2.0
        return (OTHER_ROUND_TRIP_BPS["IN"] + stt_bps) / 100.0
    if normalized_market == "US":
        return OTHER_ROUND_TRIP_BPS["US"] / 100.0
    raise ValueError("unsupported_market")

