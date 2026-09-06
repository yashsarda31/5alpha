import sqlite3
import threading

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


def test_blob_pull_migrates_legacy_snapshot_to_stable_cas_object(monkeypatch, tmp_path):
    snapshot = _snapshot(1)

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(tmp_path / "alphanova.db"))
    monkeypatch.setattr(main._blob_context, "path", str(tmp_path / "worker.db"), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", None, raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_current_metadata", lambda _token: None)
    monkeypatch.setattr(
        main,
        "_blob_list",
        lambda prefix: [{"pathname": "latest", "url": "snapshot"}],
    )
    monkeypatch.setattr(main, "_blob_download", lambda _url, _token: snapshot)
    monkeypatch.setattr(main, "_blob_put_current", lambda data, token, **kw: 'etag-1')

    assert main._blob_pull_db(force=True) is True

    assert (tmp_path / "worker.db").read_bytes() == snapshot
    assert main._blob_context.revision == 'etag-1'


def test_forced_blob_pull_fails_closed_and_remains_retryable(monkeypatch, tmp_path):
    existing = tmp_path / "alphanova.db"
    existing.write_bytes(_snapshot(1))

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(existing))
    monkeypatch.setattr(main._blob_context, "path", str(existing), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", "old", raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_current_metadata",
                        lambda _token: (_ for _ in ()).throw(RuntimeError("blob unavailable")))

    with pytest.raises(HTTPException) as error:
        main._blob_pull_db(force=True)

    assert error.value.status_code == 503
    assert main._blob_context.revision is None
    assert existing.read_bytes() == _snapshot(1)


def test_empty_blob_store_allows_an_empty_local_database_to_bootstrap(monkeypatch, tmp_path):
    existing = tmp_path / "alphanova.db"
    existing.write_bytes(_snapshot(0))

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(existing))
    monkeypatch.setattr(main._blob_context, "path", str(existing), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", None, raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_current_metadata", lambda _token: None)
    monkeypatch.setattr(main, "_blob_list", lambda _prefix: [])
    monkeypatch.setattr(main, "_blob_put_current", lambda data, token, **kw: 'etag-new')

    assert main._blob_pull_db(force=True) is True
    assert main._blob_context.revision == 'etag-new'


def test_cas_push_rejects_stale_revision_without_retrying_bytes(monkeypatch, tmp_path):
    path = tmp_path / "worker.db"
    path.write_bytes(_snapshot(1))
    monkeypatch.setattr(main._blob_context, "path", str(path), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", "etag-old", raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    calls = []
    monkeypatch.setattr(main, "_blob_put_current",
                        lambda data, token, **kw: calls.append(kw) or None)
    with pytest.raises(HTTPException) as error:
        main._blob_push_db()
    assert error.value.status_code == 503
    assert calls == [{"create_only": False, "revision": "etag-old"}]
    assert main._blob_context.revision is None


def test_network_push_failure_invalidates_local_revision(monkeypatch, tmp_path):
    path = tmp_path / "worker.db"
    path.write_bytes(_snapshot(1))
    monkeypatch.setattr(main._blob_context, "path", str(path), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", "etag-old", raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_put_current",
                        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("network")))
    with pytest.raises(HTTPException) as error:
        main._blob_push_db()
    assert error.value.status_code == 503
    assert main._blob_context.revision is None


def test_auth_db_rejects_failed_nonforced_pull(monkeypatch):
    monkeypatch.setattr(main, "_blob_pull_db", lambda force=False: False)
    with pytest.raises(HTTPException) as error:
        main._auth_db()
    assert error.value.status_code == 503


def test_current_pull_pairs_bytes_with_download_response_revision(monkeypatch, tmp_path):
    snapshot = _snapshot(2)
    path = tmp_path / "worker.db"
    monkeypatch.setattr(main._blob_context, "path", str(path), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", None, raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_current_metadata",
                        lambda token: {"downloadUrl": "download-current"})
    monkeypatch.setattr(main, "_blob_download",
                        lambda url, token, with_revision=False: (snapshot, "etag-current"))
    assert main._blob_pull_db(force=True)
    assert path.read_bytes() == snapshot
    assert main._blob_context.revision == "etag-current"


@pytest.mark.parametrize("legacy", [None, b"not sqlite"])
def test_legacy_download_failure_never_bootstraps_empty_authority(monkeypatch, tmp_path, legacy):
    path = tmp_path / "worker.db"
    monkeypatch.setattr(main._blob_context, "path", str(path), raising=False)
    monkeypatch.setattr(main._blob_context, "revision", None, raising=False)
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    monkeypatch.setattr(main, "_blob_current_metadata", lambda token: None)
    monkeypatch.setattr(main, "_blob_list", lambda prefix: [{"pathname": "legacy", "url": "url"}])
    monkeypatch.setattr(main, "_blob_download", lambda url, token: legacy)
    puts = []
    monkeypatch.setattr(main, "_blob_put_current", lambda *args, **kwargs: puts.append(1))
    with pytest.raises(HTTPException) as error:
        main._blob_pull_db(force=True)
    assert error.value.status_code == 503
    assert puts == []
    assert not path.exists()


def test_concurrent_workers_use_separate_files_and_one_stale_cas_loses(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "_blob_token", lambda: "test-token")
    gate = threading.Barrier(2)
    winner_lock = threading.Lock()
    winner = {"chosen": False}
    outcomes = []

    def conditional_put(data, token, **kwargs):
        gate.wait(timeout=2)
        with winner_lock:
            if winner["chosen"]:
                return None
            winner["chosen"] = True
            return "etag-next"

    monkeypatch.setattr(main, "_blob_put_current", conditional_put)

    def worker(index):
        path = tmp_path / f"worker-{index}.db"
        path.write_bytes(_snapshot(index + 1))
        main._blob_context.path = str(path)
        main._blob_context.revision = "etag-shared"
        try:
            main._blob_push_db()
            outcomes.append(("ok", str(path)))
        except HTTPException as error:
            outcomes.append((error.status_code, str(path)))

    threads = [threading.Thread(target=worker, args=(index,)) for index in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=3)
    assert sorted((item[0] for item in outcomes), key=str) == [503, "ok"]
    assert outcomes[0][1] != outcomes[1][1]
