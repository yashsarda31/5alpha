"""Normalize NSE corporate announcements for the saved-stock research view."""

from datetime import datetime
from urllib.parse import quote


def normalize_event(row):
    symbol = str(row.get("symbol") or "").strip().upper()
    title = str(row.get("desc") or "Company filing").strip()
    detail = str(row.get("attchmntText") or "").strip()
    timestamp = str(row.get("sort_date") or row.get("an_dt") or "").strip()
    parsed = None
    for pattern in ("%Y-%m-%d %H:%M:%S", "%d-%b-%Y %H:%M:%S"):
        try:
            parsed = datetime.strptime(timestamp, pattern)
            break
        except ValueError:
            pass
    url = str(row.get("attchmntFile") or "").strip()
    if not url.startswith("https://nsearchives.nseindia.com/"):
        url = "https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=" + quote(symbol)
    label = f"{title} {detail}".lower()
    category = "Results" if any(term in label for term in ("financial result", "quarterly result", "annual result", "integrated filing - financial")) else "Filing"
    return {
        "id": str(row.get("seq_id") or f"{symbol}:{timestamp}:{title}"),
        "symbol": symbol,
        "category": category,
        "title": title,
        "detail": detail,
        "published_at": parsed.isoformat() + "+05:30" if parsed else None,
        "url": url,
        "source": "NSE company filing",
    }


def events_for_symbols(rows, symbols, limit=80):
    allowed = {symbol.upper() for symbol in symbols}
    events = [normalize_event(row) for row in rows if str(row.get("symbol") or "").upper() in allowed]
    events.sort(key=lambda event: event["published_at"] or "", reverse=True)
    return events[:limit]
