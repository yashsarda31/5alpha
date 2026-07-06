"""Dashboard top-movers market selection: US megacaps during the US cash
session window (20:00-02:00 IST), NSE names the rest of the day."""
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import _dashboard_movers_market

IST = timezone(timedelta(hours=5, minutes=30))


def _at(hour, minute=0):
    return datetime(2026, 7, 6, hour, minute, tzinfo=IST)


def test_us_window():
    assert _dashboard_movers_market(_at(20, 0)) == "US"
    assert _dashboard_movers_market(_at(23, 30)) == "US"
    assert _dashboard_movers_market(_at(0, 45)) == "US"
    assert _dashboard_movers_market(_at(1, 59)) == "US"


def test_indian_window():
    assert _dashboard_movers_market(_at(2, 0)) == "IN"
    assert _dashboard_movers_market(_at(9, 30)) == "IN"
    assert _dashboard_movers_market(_at(15, 15)) == "IN"
    assert _dashboard_movers_market(_at(19, 59)) == "IN"
