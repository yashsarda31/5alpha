"""First-party browser counts. No account identity, IP or full URLs are stored."""
from collections import Counter
from datetime import datetime, timedelta, timezone
import re
import uuid

IST = timezone(timedelta(hours=5, minutes=30))
RETENTION_DAYS = 90
PUBLIC_PATHS = frozenset({
    '/', '/dashboard', '/signals', '/chart', '/screener', '/momentum', '/sectors',
    '/track-record', '/fiidii', '/option-chain', '/news', '/deals', '/learn',
    '/arima', '/dcf', '/fundamentals', '/flcl', '/druck-minervini',
    '/position-sizing', '/delivery-radar', '/leaderboard', '/login', '/watchlist',
    '/trading-game', '/high-delivery-volume-stocks-today', '/stocks-at-52-week-high-today',
    '/fii-dii-data-today', '/nifty-pcr-today', '/bank-nifty-oi-analysis',
    '/bulk-block-deals-today', '/stocks/:symbol/delivery-percentage', '/other',
})


def utc(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def browser_id(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError('identifier must be a UUID') from exc


def _seen(conn, device, occurred, now):
    occurred = utc(occurred)
    if occurred > now:
        return
    stamp = occurred.isoformat()
    conn.execute('''INSERT INTO traffic_browsers VALUES(?,?,?)
        ON CONFLICT(device_id) DO UPDATE SET
        first_seen=MIN(first_seen,excluded.first_seen), last_seen=MAX(last_seen,excluded.last_seen)''',
                 (browser_id(device), stamp, stamp))
    conn.execute('INSERT OR IGNORE INTO traffic_days VALUES(?,?)',
                 (browser_id(device), occurred.astimezone(IST).date().isoformat()))
    conn.execute('''INSERT INTO traffic_meta VALUES('tracked_since',?)
        ON CONFLICT(name) DO UPDATE SET value=MIN(value,excluded.value)''', (stamp,))


def ensure_schema(conn, now):
    now = utc(now)
    conn.execute('CREATE TABLE IF NOT EXISTS traffic_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL)')
    conn.execute('''CREATE TABLE IF NOT EXISTS traffic_browsers(
        device_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS traffic_days(
        device_id TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(device_id,day))''')
    conn.execute('CREATE INDEX IF NOT EXISTS traffic_days_day ON traffic_days(day)')
    conn.execute('''CREATE TABLE IF NOT EXISTS traffic_arrivals(
        event_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, received_at TEXT NOT NULL,
        landing TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL)''')
    conn.execute('CREATE INDEX IF NOT EXISTS traffic_arrivals_time ON traffic_arrivals(received_at)')
    conn.execute('''CREATE TABLE IF NOT EXISTS traffic_receipts(
        event_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, received_at TEXT NOT NULL, digest TEXT NOT NULL)''')
    if not conn.execute("SELECT 1 FROM traffic_meta WHERE name='backfill_v1'").fetchone():
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='analytics_events'").fetchone():
            for device, occurred in conn.execute("SELECT device_id,occurred_at FROM analytics_events WHERE event='site_visit'").fetchall():
                try:
                    _seen(conn, device, occurred, now)
                except (ValueError, TypeError, AttributeError):
                    continue
        conn.execute("INSERT INTO traffic_meta VALUES('backfill_v1',?)", (now.isoformat(),))


def prune(conn, now):
    cutoff = (utc(now) - timedelta(days=RETENTION_DAYS)).isoformat()
    day = (utc(now).astimezone(IST).date() - timedelta(days=RETENTION_DAYS - 1)).isoformat()
    conn.execute('DELETE FROM traffic_arrivals WHERE received_at < ?', (cutoff,))
    conn.execute('DELETE FROM traffic_receipts WHERE received_at < ?', (cutoff,))
    conn.execute('DELETE FROM traffic_days WHERE day < ?', (day,))


def note_site_visit(conn, device, occurred, now):
    ensure_schema(conn, now)
    _seen(conn, device, occurred, utc(now))


def arrival_payload(payload):
    if set(payload) != {'event_id', 'device_id', 'landing', 'source', 'medium', 'campaign'}:
        raise ValueError('unexpected or missing arrival fields')
    clean = dict(payload)
    clean['event_id'] = browser_id(clean['event_id'])
    clean['device_id'] = browser_id(clean['device_id'])
    if clean['landing'] not in PUBLIC_PATHS:
        raise ValueError('landing must be an approved page path')
    for key in ('source', 'medium', 'campaign'):
        value = clean[key]
        if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{0,64}', value):
            raise ValueError('campaign labels must use up to 64 letters, numbers, underscores or hyphens')
    return clean


def record_arrival(conn, payload, now):
    clean = arrival_payload(payload)
    now = utc(now)
    ensure_schema(conn, now)
    values = tuple(clean[key] for key in ('device_id', 'landing', 'source', 'medium', 'campaign'))
    existing = conn.execute('''SELECT device_id,landing,source,medium,campaign
        FROM traffic_arrivals WHERE event_id=?''', (clean['event_id'],)).fetchone()
    if existing:
        if tuple(existing) != values:
            raise ValueError('event ID already belongs to another arrival')
        return False
    conn.execute('INSERT INTO traffic_arrivals VALUES(?,?,?,?,?,?,?)',
                 (clean['event_id'], clean['device_id'], now.isoformat(), *values[1:]))
    _seen(conn, clean['device_id'], now, now)
    conn.execute("INSERT OR REPLACE INTO traffic_meta VALUES('last_received_at',?)", (now.isoformat(),))
    prune(conn, now)
    conn.commit()
    return True


def delete_browser(conn, device, now):
    ensure_schema(conn, now)
    device = browser_id(device)
    for table in ('traffic_browsers', 'traffic_days', 'traffic_arrivals', 'traffic_receipts'):
        conn.execute(f'DELETE FROM {table} WHERE device_id=?', (device,))
    conn.commit()


def aggregate_traffic(conn, now):
    now = utc(now)
    ensure_schema(conn, now)
    today = now.astimezone(IST).date()
    first_day = today - timedelta(days=89)
    rows = conn.execute('SELECT device_id,day FROM traffic_days WHERE day BETWEEN ? AND ?',
                        (first_day.isoformat(), today.isoformat())).fetchall()
    daily_visitors = Counter(row[1] for row in rows)
    unique7 = {row[0] for row in rows if row[1] >= (today - timedelta(days=6)).isoformat()}
    unique30 = {row[0] for row in rows if row[1] >= (today - timedelta(days=29)).isoformat()}
    starts = datetime.combine(first_day, datetime.min.time(), tzinfo=IST).astimezone(timezone.utc)
    arrivals = conn.execute('''SELECT received_at,source,medium,campaign,landing FROM traffic_arrivals
        WHERE received_at BETWEEN ? AND ?''', (starts.isoformat(), now.isoformat())).fetchall()
    campaigns, visits = Counter(), Counter()
    for stamp, source, medium, campaign, landing in arrivals:
        day = utc(stamp).astimezone(IST).date().isoformat()
        campaigns[(day, source, medium, campaign, landing)] += 1
        visits[day] += 1
    meta = dict(conn.execute('SELECT name,value FROM traffic_meta').fetchall())
    days = [(first_day + timedelta(days=i)).isoformat() for i in range(90)]
    return {
        'unique_ever': conn.execute('SELECT COUNT(*) FROM traffic_browsers').fetchone()[0],
        'unique_7d': len(unique7), 'unique_30d': len(unique30), 'today': daily_visitors[today.isoformat()],
        'tracked_since': meta.get('tracked_since'), 'last_received_at': meta.get('last_received_at'),
        'coverage': 'Recorded browsers only; earlier unrecorded visits unavailable. Browser resets remove their history.',
        'timezone': 'Asia/Kolkata',
        'daily': [{'date': day, 'visitors': daily_visitors[day], 'visits': visits[day]} for day in days],
        'campaigns': [dict(zip(('date', 'source', 'medium', 'campaign', 'landing'), key), visits=count)
                      for key, count in sorted(campaigns.items())],
    }
