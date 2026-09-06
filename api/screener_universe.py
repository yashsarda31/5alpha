"""Refresh Indian index membership; disclose every configured-list fallback."""
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
import re

_CACHE = {}
_LOCK = Lock()
FILES = {'nifty100': ('ind_nifty100list.csv', 100), 'nifty200': ('ind_nifty200list.csv', 200)}


def resolve_universe(key, fallback, fetcher):
    metadata = {'universe_source': 'Configured constituent list · membership not verified',
                'universe_fallback': True, 'universe_checked_at': None}
    if key not in FILES:
        return list(fallback), metadata
    with _LOCK:
        cached = _CACHE.get(key)
        if cached and monotonic() - cached[0] < 21600:
            return list(cached[1]), dict(cached[2])
    filename, expected = FILES[key]
    try:
        symbols = list(dict.fromkeys(str(s).strip().upper() for s in fetcher(filename)))
    except Exception:
        return list(fallback), metadata
    # Temporary demerger additions can take an official index above its nameplate count.
    if not expected <= len(symbols) <= expected + 10 or any(not re.fullmatch(r'[A-Z0-9][A-Z0-9&-]{0,29}', s) for s in symbols):
        return list(fallback), metadata
    tickers = [f'{s}.NS' for s in symbols]
    metadata = {'universe_source': 'Nifty Indices official constituents', 'universe_fallback': False,
                'universe_checked_at': datetime.now(timezone.utc).isoformat()}
    with _LOCK:
        _CACHE[key] = (monotonic(), tickers, metadata)
    return list(tickers), dict(metadata)
