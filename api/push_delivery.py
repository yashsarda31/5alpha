"""Durable per-device push outbox. The caller persists each transaction via CAS."""
import json
from datetime import timedelta, timezone

SIGNAL_TTL = 300
LEASE_SECONDS = 90
MAX_ATTEMPTS = 3
IST = timezone(timedelta(hours=5, minutes=30))


def ensure_schema(conn):
    conn.execute('''CREATE TABLE IF NOT EXISTS push_deliveries (
        event_key TEXT NOT NULL, endpoint TEXT NOT NULL, payload TEXT NOT NULL,
        created_at REAL NOT NULL, expires_at REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at REAL NOT NULL DEFAULT 0, lease_until REAL NOT NULL DEFAULT 0,
        lease_token TEXT, PRIMARY KEY(event_key, endpoint)
    )''')
    conn.execute('''CREATE INDEX IF NOT EXISTS push_delivery_due
                    ON push_deliveries(status, next_attempt_at, lease_until)''')
    conn.execute('''CREATE TRIGGER IF NOT EXISTS push_subscription_deleted
        AFTER DELETE ON push_subs BEGIN
            DELETE FROM push_deliveries WHERE endpoint=OLD.endpoint;
        END''')


def enqueue(conn, key, payload, now, expires_at):
    # Snapshot only the currently opted-in audience; new subscriptions never
    # receive historical trade alerts. Keys remain in push_subs, not the outbox.
    return conn.execute('''INSERT OR IGNORE INTO push_deliveries
        (event_key, endpoint, payload, created_at, expires_at)
        SELECT ?, endpoint, ?, ?, ? FROM push_subs''',
        (key, json.dumps(payload), now, expires_at)).rowcount


def enqueue_watchlist_buy(conn, key, payload, market, symbol, now, expires_at):
    """Target only subscribed accounts that still watch this exact market/symbol."""
    return conn.execute('''INSERT OR IGNORE INTO push_deliveries
        (event_key, endpoint, payload, created_at, expires_at)
        SELECT ?, s.endpoint, ?, ?, ? FROM push_subs s
        JOIN watchlist w ON w.user_id=s.user_id
        WHERE w.market=? AND w.symbol=?''',
        (key, json.dumps(payload), now, expires_at, market, symbol)).rowcount


def enqueue_morning(conn, now):
    local = now.astimezone(IST)
    minute = local.hour * 60 + local.minute
    if local.weekday() >= 5 or not 540 <= minute < 550:
        return 0
    key = f'{local.date()}|MORNING|IN'
    if not conn.execute('SELECT 1 FROM push_subs LIMIT 1').fetchone():
        return 0
    if not conn.execute('INSERT OR IGNORE INTO push_sent VALUES (?, ?)',
                        (key, now.isoformat())).rowcount:
        return 0
    expires = local.replace(hour=9, minute=15, second=0, microsecond=0).timestamp()
    return enqueue(conn, key, {
        'title': 'Alpha Nova | Your morning market check',
        'body': 'Before the open, check the market regime and review your setups. Open Alpha Nova to prepare for the session.',
        'tag': key, 'url': '/signals?market=IN',
    }, now.timestamp(), expires)


def claim(conn, now, token, limit=32):
    conn.execute('DELETE FROM push_deliveries WHERE created_at < ? OR endpoint NOT IN (SELECT endpoint FROM push_subs)',
                 (now - 3 * 86400,))
    conn.execute("UPDATE push_deliveries SET status='expired' WHERE status='pending' AND expires_at <= ?", (now,))
    conn.execute("UPDATE push_deliveries SET status='failed' WHERE status='pending' AND attempts >= ? AND lease_until <= ?",
                 (MAX_ATTEMPTS, now))
    rows = conn.execute('''WITH due AS (
        SELECT d.*, d.rowid AS sequence, s.p256dh, s.auth FROM push_deliveries d
        JOIN push_subs s ON s.endpoint=d.endpoint
        WHERE d.status='pending' AND d.expires_at > ? AND d.next_attempt_at <= ?
        AND d.lease_until <= ? AND d.attempts < ?),
        batch AS (SELECT event_key FROM due GROUP BY event_key
                  ORDER BY min(created_at), min(sequence) LIMIT 4)
        SELECT * FROM due WHERE event_key IN (SELECT event_key FROM batch)
        ORDER BY created_at, sequence LIMIT ?''',
        (now, now, now, MAX_ATTEMPTS, limit)).fetchall()
    for row in rows:
        conn.execute('''UPDATE push_deliveries SET lease_token=?, lease_until=?, attempts=attempts+1
                        WHERE event_key=? AND endpoint=?''',
                     (token, now + LEASE_SECONDS, row['event_key'], row['endpoint']))
    return [dict(row) for row in rows]


def complete(conn, results, token, now):
    for row, status in results:
        # Only the current lease holder may acknowledge a job. A crashed worker
        # can be retried after the lease expires (at-least-once delivery).
        if status == 'ok':
            state = 'accepted'
        elif status in ('dead', 'expired'):
            state = status
        else:
            state = 'failed' if row['attempts'] + 1 >= MAX_ATTEMPTS else 'pending'
        updated = conn.execute('''UPDATE push_deliveries SET status=?, lease_until=0,
            lease_token=NULL, next_attempt_at=? WHERE event_key=? AND endpoint=? AND lease_token=?''',
            (state, now + 60, row['event_key'], row['endpoint'], token)).rowcount
        parts = row['event_key'].split('|')
        if updated and row.get('attempted_at') and len(parts) == 3 and parts[1] in ('IN', 'US'):
            conn.execute('''UPDATE signal_events
                SET features_json=json_set(features_json, '$.push_attempted_at', ?)
                WHERE market_date=? AND market=? AND symbol=? AND actionable=1
                AND json_extract(features_json, '$.push_attempted_at') IS NULL''',
                (row['attempted_at'], *parts))
        if updated and status == 'dead':
            # Do not remove a subscription whose keys changed during the send.
            conn.execute('DELETE FROM push_subs WHERE endpoint=? AND p256dh=? AND auth=?',
                         (row['endpoint'], row['p256dh'], row['auth']))
