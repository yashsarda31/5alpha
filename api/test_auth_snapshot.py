import sqlite3

import pytest
from fastapi import HTTPException

from api import main
from api.main import _sqlite_user_count


def _snapshot(user_count):
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    conn.executemany("INSERT INTO users (id) VALUES (?)", [(i,) for i in range(user_count)])
    data = conn.serialize()
    conn.close()
    return data


def test_snapshot_user_count_distinguishes_populated_and_empty_databases():
    assert _sqlite_user_count(_snapshot(3)) == 3
    assert _sqlite_user_count(_snapshot(0)) == 0
    assert _sqlite_user_count(b"not a database") == -1


def test_blob_pull_reads_only_the_versioned_snapshot(monkeypatch, tmp_path):
    prefixes = []
    snapshot = _snapshot(1)

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(tmp_path / "alphanova.db"))
    monkeypatch.setattr(main, "_blob_synced", False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(
        main,
        "_blob_list",
        lambda prefix: prefixes.append(prefix) or [{"pathname": "latest", "url": "snapshot"}],
    )
    monkeypatch.setattr(main, "_blob_download", lambda _url, _token: snapshot)

    assert main._blob_pull_db(force=True) is True

    assert prefixes == [main.BLOB_DB_PREFIX]
    assert (tmp_path / "alphanova.db").read_bytes() == snapshot


def test_forced_blob_pull_fails_closed_and_remains_retryable(monkeypatch, tmp_path):
    existing = tmp_path / "alphanova.db"
    existing.write_bytes(_snapshot(1))

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(existing))
    monkeypatch.setattr(main, "_blob_synced", True)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(
        main,
        "_blob_list",
        lambda _prefix: (_ for _ in ()).throw(RuntimeError("blob unavailable")),
    )

    with pytest.raises(HTTPException) as error:
        main._blob_pull_db(force=True)

    assert error.value.status_code == 503
    assert main._blob_synced is False
    assert existing.read_bytes() == _snapshot(1)


def test_empty_blob_store_allows_an_empty_local_database_to_bootstrap(monkeypatch, tmp_path):
    existing = tmp_path / "alphanova.db"
    existing.write_bytes(_snapshot(0))

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(existing))
    monkeypatch.setattr(main, "_blob_synced", False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_list", lambda _prefix: [])

    assert main._blob_pull_db(force=True) is True
    assert main._blob_synced is True
