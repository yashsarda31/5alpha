"""One-way helpers for safely merging the legacy Alpha Nova auth snapshot."""

from __future__ import annotations

import sqlite3


_TEST_EMAILS = {"testuser99@gmail.com"}
_TEST_DOMAINS = {"example.com", "test.com", "test.local"}
_USER_CHILD_TABLES = (
    "auth_identities",
    "sessions",
    "watchlist",
    "predictions",
    "streak_stats",
    "push_subs",
)
_OAUTH_TABLES = (
    "mcp_oauth_clients",
    "mcp_pending_authorizations",
    "mcp_authorization_codes",
    "mcp_access_tokens",
    "mcp_refresh_tokens",
)


def _connect_snapshot(data: bytes) -> sqlite3.Connection:
    if not data.startswith(b"SQLite format 3"):
        raise ValueError("snapshot is not a SQLite database")
    connection = sqlite3.connect(":memory:")
    connection.deserialize(data)
    connection.row_factory = sqlite3.Row
    return connection


def _tables(connection: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }


def _is_test_email(email: str) -> bool:
    normalized = (email or "").strip().lower()
    domain = normalized.rsplit("@", 1)[-1]
    return normalized in _TEST_EMAILS or domain in _TEST_DOMAINS


def merge_missing_email_users(active_data: bytes, legacy_data: bytes):
    """Restore missing real users, discard QA identities, and revoke sessions.

    The active snapshot remains authoritative for identities and user IDs. If a
    user was recreated through Google, the legacy password hash is restored so
    the original email/password login continues to work too.
    """
    active = _connect_snapshot(active_data)
    legacy = _connect_snapshot(legacy_data)
    try:
        active_tables = _tables(active)
        if "users" not in active_tables or "users" not in _tables(legacy):
            raise ValueError("both snapshots must contain a users table")

        test_rows = active.execute("SELECT id, email FROM users").fetchall()
        test_ids = [row["id"] for row in test_rows if _is_test_email(row["email"])]
        for table in _USER_CHILD_TABLES:
            if table in active_tables:
                active.executemany(
                    f"DELETE FROM {table} WHERE user_id = ?",
                    [(user_id,) for user_id in test_ids],
                )
        if test_ids:
            active.executemany(
                "DELETE FROM users WHERE id = ?",
                [(user_id,) for user_id in test_ids],
            )

        legacy_rows = legacy.execute(
            """SELECT email, password_hash, salt, display_name, created_at, last_login_at
               FROM users ORDER BY id"""
        ).fetchall()
        legacy_by_email = {
            row["email"].strip().lower(): row
            for row in legacy_rows
            if not _is_test_email(row["email"])
        }

        restored_passwords = 0
        if "auth_identities" in active_tables:
            google_users = active.execute(
                """SELECT DISTINCT users.id, users.email
                   FROM users
                   JOIN auth_identities ON auth_identities.user_id = users.id
                   WHERE auth_identities.provider = 'google'"""
            ).fetchall()
            for user in google_users:
                legacy_user = legacy_by_email.get(user["email"].strip().lower())
                if legacy_user is None:
                    continue
                active.execute(
                    "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
                    (
                        legacy_user["password_hash"],
                        legacy_user["salt"],
                        user["id"],
                    ),
                )
                restored_passwords += 1

        active_emails = {
            row[0].strip().lower()
            for row in active.execute("SELECT email FROM users")
        }
        restored = 0
        for row in legacy_rows:
            email = row["email"].strip().lower()
            if _is_test_email(email) or email in active_emails:
                continue
            active.execute(
                """INSERT INTO users
                   (email, password_hash, salt, display_name, created_at, last_login_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    email,
                    row["password_hash"],
                    row["salt"],
                    row["display_name"],
                    row["created_at"],
                    row["last_login_at"],
                ),
            )
            active_emails.add(email)
            restored += 1

        removed_sessions = 0
        if "sessions" in active_tables:
            removed_sessions = active.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
            active.execute("DELETE FROM sessions")

        cleared_oauth = 0
        for table in _OAUTH_TABLES:
            if table in active_tables:
                cleared_oauth += active.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                active.execute(f"DELETE FROM {table}")

        active.commit()
        if active.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("merged snapshot failed SQLite integrity_check")
        merged = active.serialize()
        return merged, {
            "restored_users": restored,
            "restored_passwords": restored_passwords,
            "removed_test_users": len(test_ids),
            "removed_sessions": removed_sessions,
            "cleared_oauth_records": cleared_oauth,
        }
    finally:
        active.close()
        legacy.close()
