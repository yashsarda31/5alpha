"""Signed-out gate preview: the last setups the engine actually published.

The gate's only proof is a panel of scored setups. The live engine publishes
nothing outside market hours or when no candidate clears the quality bar, which
left the panel reading "No qualifying setups yet" for most of the clock. These
tests pin the fallback that keeps it populated — and pin that the trade levels
never leave the server, since those are what the account is for.
"""
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def _reset():
    for key in [k for k in main.API_CACHE if k.startswith("signals_preview_")]:
        main.API_CACHE.pop(key, None)
    conn = main._auth_db()
    conn.execute("DELETE FROM signal_positions")
    conn.commit()
    conn.close()


def _publish(symbol, entry_date, side="LONG", score=70.0, market="IN", status="open"):
    conn = main._auth_db()
    conn.execute(
        """INSERT INTO signal_positions
           (market, symbol, side, kind, score, entry, stop, target, entry_date, status)
           VALUES (?,?,?,'futures',?,100.0,95.0,110.0,?,?)""",
        (market, symbol, side, score, entry_date, status),
    )
    conn.commit()
    conn.close()


def _preview(market="IN"):
    res = client.get(f"/api/signals/preview?market={market}")
    assert res.status_code == 200, res.text
    return res.json()


def test_preview_serves_the_most_recent_published_session():
    _reset()
    _publish("OLDNAME", "2026-07-20", score=99.0)
    _publish("MCX", "2026-08-05", side="SHORT", score=78.0)
    _publish("BSE", "2026-08-05", side="SHORT", score=65.0)
    _publish("KEI", "2026-08-04", score=81.0)

    data = _preview()

    assert data["as_of"] == "2026-08-05"
    assert data["source"] == "recent"
    assert [s["symbol"] for s in data["setups"]] == ["MCX", "BSE", "KEI"], (
        "newest session first, best score first, then backfilled from earlier days"
    )
    assert data["setups"][0]["side"] == "SHORT"
    assert data["setups"][0]["score"] == 78.0


def test_preview_never_leaks_the_trade_levels():
    _reset()
    _publish("KEI", "2026-08-04", score=81.0)

    setup = _preview()["setups"][0]

    for locked in ("entry", "stop", "target"):
        assert locked not in setup, f"{locked} is what the account is for — keep it server-side"


def test_preview_keeps_one_row_per_symbol_and_caps_at_three():
    _reset()
    # The engine can publish several sides/kinds for one stock on the same day.
    _publish("KEI", "2026-08-05", side="LONG", score=81.0)
    _publish("KEI", "2026-08-05", side="SHORT", score=55.0)
    for i, sym in enumerate(("MCX", "BSE", "LICI", "SONACOMS")):
        _publish(sym, "2026-08-05", score=70.0 - i)

    setups = _preview()["setups"]

    assert len(setups) == main.SIGNAL_PREVIEW_SETUPS == 3
    assert [s["symbol"] for s in setups] == ["KEI", "MCX", "BSE"]
    assert setups[0]["score"] == 81.0, "the stronger KEI side wins the slot"


def test_preview_walks_back_when_the_latest_session_was_thin():
    _reset()
    _publish("MCX", "2026-08-05", score=78.0)
    _publish("KEI", "2026-08-04", score=81.0)
    _publish("BSE", "2026-08-03", score=65.0)

    data = _preview()

    assert data["as_of"] == "2026-08-05", "the label follows the newest call shown"
    assert [s["symbol"] for s in data["setups"]] == ["MCX", "KEI", "BSE"]


def test_preview_keeps_the_india_and_us_books_apart():
    _reset()
    _publish("KEI", "2026-08-05", score=81.0, market="IN")
    _publish("NVDA", "2026-08-05", score=77.0, market="US")

    assert [s["symbol"] for s in _preview("IN")["setups"]] == ["KEI"]
    assert [s["symbol"] for s in _preview("US")["setups"]] == ["NVDA"]


def test_preview_survives_an_empty_book():
    _reset()

    data = _preview()

    assert data["setups"] == []
    assert data["as_of"] is None, "no calls yet is a real state, not an error"


def test_preview_includes_closed_calls():
    _reset()
    # A stopped-out call is still a call the engine published. Hiding it would
    # make the panel a highlight reel, which is the opposite of the pitch.
    _publish("TRENT", "2026-08-05", score=72.0, status="closed")

    assert [s["symbol"] for s in _preview()["setups"]] == ["TRENT"]
