import sqlite3

import pytest

from api.public_shares import create_share, ensure_share_schema, get_share, render_share_page


def database():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    ensure_share_schema(conn)
    return conn


def test_share_snapshot_keeps_only_public_route_state():
    conn = database()
    result = create_share(
        conn,
        path="/screener",
        query="?token=secret&universe=nifty200&benchmark=%5ENSEI&max_pe=30#results",
        title=" High P/E screen ",
        share_id="abc123",
        created_at="2026-09-06T10:00:00Z",
    )
    assert result["id"] == "abc123"
    assert result["target_url"] == "https://alphanova48.in/screener?benchmark=%5ENSEI&max_pe=30&universe=nifty200"
    assert "secret" not in str(dict(conn.execute("SELECT * FROM public_shares").fetchone()))
    assert get_share(conn, "abc123")["title"] == "High P/E screen"
    conn.close()


@pytest.mark.parametrize("path", ["/login", "/watchlist", "/trading-game", "https://evil.test/screener", "/api/signals"])
def test_share_snapshot_rejects_private_or_external_paths(path):
    conn = database()
    with pytest.raises(ValueError, match="not shareable"):
        create_share(conn, path=path, query="", title="No", share_id="bad")
    conn.close()


def test_shared_result_page_is_noindex_and_reopens_saved_analysis():
    conn = database()
    create_share(conn, path="/option-chain", query="symbol=NIFTY&expiryDate=2026-09-10", title="Nifty OI", share_id="oi123")
    page = render_share_page(get_share(conn, "oi123"))
    assert 'content="noindex, nofollow"' in page
    assert 'href="https://alphanova48.in/option-chain?expiryDate=2026-09-10&amp;symbol=NIFTY"' in page
    assert 'content="https://alphanova48.in/api/public-preview/share/oi123.png"' in page
    conn.close()
