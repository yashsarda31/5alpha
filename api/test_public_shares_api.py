import sqlite3

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from api import main


@pytest.fixture
def share_db(tmp_path, monkeypatch):
    path = tmp_path / "shares.sqlite"

    def connect():
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        return conn

    pushed = []
    monkeypatch.setattr(main, "_auth_db", connect)
    monkeypatch.setattr(main, "_blob_pull_db", lambda **kwargs: None)
    monkeypatch.setattr(main, "_blob_push_db", lambda: pushed.append(True))
    return pushed


def test_public_share_api_creates_durable_link_page_and_preview(share_db, monkeypatch):
    monkeypatch.setattr(main.secrets, "token_urlsafe", lambda size: "fixedShare123")
    limits = []
    monkeypatch.setattr(main, "_rate_limit", lambda request, bucket, limit, window_s: limits.append((bucket, limit, window_s)))
    created = main.create_public_share(main.PublicShareCreate(
        path="/screener", query="universe=nifty200&token=secret", title="Nifty 200 screen",
    ), request=object())
    assert created["url"] == "https://alphanova48.in/s/fixedShare123"
    assert created["target_url"].endswith("/screener?universe=nifty200")
    assert share_db == [True]
    assert limits == [("public-share", 20, 3600)]

    page = main.public_share_page("fixedShare123")
    assert page.media_type == "text/html"
    assert b"noindex, nofollow" in page.body
    assert b"Nifty 200 screen" in page.body

    preview = main.public_share_preview("fixedShare123")
    assert preview.media_type == "image/png"
    assert preview.body.startswith(b"\x89PNG")


def test_missing_public_share_is_404(share_db):
    with pytest.raises(HTTPException) as error:
        main.public_share_page("missing123")
    assert error.value.status_code == 404


def test_cloud_share_uses_immutable_record_instead_of_auth_database(monkeypatch):
    monkeypatch.setattr(main, "_blob_token", lambda: "vercel_blob_rw_test_store_token")
    monkeypatch.setattr(main.secrets, "token_urlsafe", lambda size: "cloudShare123")
    monkeypatch.setattr(main, "_rate_limit", lambda *args, **kwargs: None)
    monkeypatch.setattr(main, "_auth_db", lambda: pytest.fail("auth database must not be used"))
    stored = []
    monkeypatch.setattr(main, "_public_share_blob_put", lambda share: stored.append(share))

    created = main.create_public_share(main.PublicShareCreate(
        path="/delivery-radar",
        query="symbol=RELIANCE&token=secret",
        title="Delivery Radar",
    ), request=object())

    assert created["id"] == "cloudShare123"
    assert created["path"] == "/delivery-radar"
    assert created["query"] == "symbol=RELIANCE"
    assert stored == [created]


def test_public_share_request_rejects_oversized_fields():
    with pytest.raises(ValidationError):
        main.PublicShareCreate(path="/screener", query="x" * 2001)

    with pytest.raises(ValidationError):
        main.PublicShareCreate(path="/" + ("x" * 160))

    with pytest.raises(ValidationError):
        main.PublicShareCreate(path="/screener", title="x" * 201)
