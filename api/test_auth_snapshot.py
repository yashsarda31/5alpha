import sqlite3

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
