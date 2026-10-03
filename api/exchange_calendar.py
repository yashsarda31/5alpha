"""Published NSE cash/F&O closures; never infer holidays from missing quotes.

2026 source: NSE/FAOP/71777, 12 December 2025:
https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf
Maintain the dated list when NSE publishes revisions or the next year's calendar.
Special trading sessions require their own published hours.
"""
from datetime import date

NSE_HOLIDAYS = frozenset(date.fromisoformat(day) for day in (
    "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31",
    "2026-04-03", "2026-04-14", "2026-05-01", "2026-05-28",
    "2026-06-26", "2026-09-14", "2026-10-02", "2026-10-20",
    "2026-11-10", "2026-11-24", "2026-12-25",
))


def is_nse_session(day: date) -> bool:
    return day.weekday() < 5 and day not in NSE_HOLIDAYS
