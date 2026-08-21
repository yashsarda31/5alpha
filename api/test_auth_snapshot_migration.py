import importlib
import importlib.util
import sqlite3


def _database(users, sessions=()):
    connection = sqlite3.connect(":memory:")
    connection.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        );
        CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE auth_identities (
            provider TEXT NOT NULL,
            provider_subject TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (provider, provider_subject)
        );
        CREATE TABLE watchlist (user_id INTEGER NOT NULL, symbol TEXT NOT NULL);
        CREATE TABLE predictions (user_id INTEGER NOT NULL, qdate TEXT NOT NULL);
        CREATE TABLE streak_stats (user_id INTEGER PRIMARY KEY);
        CREATE TABLE push_subs (endpoint TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
        CREATE TABLE mcp_pending_authorizations (request_id TEXT PRIMARY KEY);
        CREATE TABLE mcp_authorization_codes (code_hash TEXT PRIMARY KEY);
        CREATE TABLE mcp_access_tokens (token_hash TEXT PRIMARY KEY);
        CREATE TABLE mcp_refresh_tokens (token_hash TEXT PRIMARY KEY);
        """
    )
    ids = {}
    for email, password_hash in users:
        cursor = connection.execute(
            """INSERT INTO users
               (email, password_hash, salt, display_name, created_at, last_login_at)
               VALUES (?, ?, 'salt', 'User', '2026-07-01T00:00:00+00:00', NULL)""",
            (email, password_hash),
        )
        ids[email] = cursor.lastrowid
    for token, email in sessions:
        connection.execute(
            """INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
               VALUES (?, ?, '2026-07-01T00:00:00+00:00', '2099-01-01T00:00:00+00:00')""",
            (token, ids[email]),
        )
    connection.commit()
    data = connection.serialize()
    connection.close()
    return data


def _with_google_identity(data, email):
    connection = sqlite3.connect(":memory:")
    connection.deserialize(data)
    user_id = connection.execute(
        "SELECT id FROM users WHERE email = ?", (email,)
    ).fetchone()[0]
    connection.execute(
        """INSERT INTO auth_identities
           (provider, provider_subject, user_id, created_at)
           VALUES ('google', 'google-subject', ?, '2026-08-11T00:00:00+00:00')""",
        (user_id,),
    )
    connection.commit()
    result = connection.serialize()
    connection.close()
    return result


def test_merge_restores_only_real_missing_users_and_forces_fresh_login():
    assert importlib.util.find_spec("api.auth_snapshot_migration") is not None, (
        "auth snapshot migration helper is missing"
    )
    migration = importlib.import_module("api.auth_snapshot_migration")
    active = _database(
        [("owner@gmail.com", "current-google-password")],
        sessions=[("current-session", "owner@gmail.com")],
    )
    legacy = _database(
        [
            ("owner@gmail.com", "legacy-password"),
            ("client@yahoo.com", "client-password"),
            ("qa@test.local", "qa-password"),
            ("robot@example.com", "robot-password"),
        ],
        sessions=[("legacy-session", "client@yahoo.com")],
    )

    merged, stats = migration.merge_missing_email_users(active, legacy)
    connection = sqlite3.connect(":memory:")
    connection.deserialize(merged)

    users = connection.execute(
        "SELECT email, password_hash FROM users ORDER BY email"
    ).fetchall()
    assert users == [
        ("client@yahoo.com", "client-password"),
        ("owner@gmail.com", "current-google-password"),
    ]
    assert connection.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
    assert stats == {
        "restored_users": 1,
        "restored_passwords": 0,
        "removed_test_users": 0,
        "removed_sessions": 1,
        "cleared_oauth_records": 0,
    }
    connection.close()


def test_merge_restores_legacy_password_for_google_recreated_account():
    migration = importlib.import_module("api.auth_snapshot_migration")
    active = _with_google_identity(
        _database([("owner@gmail.com", "random-google-password")]),
        "owner@gmail.com",
    )
    legacy = _database([("owner@gmail.com", "original-email-password")])

    merged, stats = migration.merge_missing_email_users(active, legacy)
    connection = sqlite3.connect(":memory:")
    connection.deserialize(merged)

    assert connection.execute(
        "SELECT password_hash FROM users WHERE email = 'owner@gmail.com'"
    ).fetchone()[0] == "original-email-password"
    assert connection.execute(
        "SELECT COUNT(*) FROM auth_identities WHERE provider = 'google'"
    ).fetchone()[0] == 1
    assert stats["restored_passwords"] == 1
    connection.close()
