"""Superstar investor portfolios, built from official exchange filings.

Holdings come from the quarterly shareholding patterns every listed company
files with the exchanges under SEBI (LODR) Regulation 31, read straight from
NSE's filing archive by :mod:`shareholding_filings`. Nothing here depends on a
third-party aggregator.

The data lives in a single JSON snapshot rather than the auth database. The
snapshot is a few megabytes of holdings; putting it in the auth DB would drag
that payload through every serverless cold start, where it sits on the critical
path for login.

Refreshes are incremental. NSE's archive host rate-limits hard -- a full sweep
of ~2,300 filings will start returning 403s and then block the IP outright, so
each run fetches only filings the snapshot has not seen, in small paced batches,
and gives up early once the archive starts refusing. Filings trickle in over the
~45 days after a quarter ends, so a daily run keeps pace comfortably.
"""

from datetime import datetime, timedelta, timezone
import concurrent.futures
import csv
import io
import re
import time

import requests

try:
    from api import shareholding_filings as sf
except ImportError:  # local `uvicorn main:app` with api/ as working directory
    import shareholding_filings as sf


SNAPSHOT_VERSION = 2
# Per-run fetch budget. Well under the point where the archive starts refusing,
# and enough to absorb a quarter's filings within a few days of daily runs.
REFRESH_BATCH = 240
REFRESH_WORKERS = 4
REFRESH_PAUSE = 0.15
# Consecutive archive refusals tolerated before a run stops and leaves the rest
# pending. Pushing past this is what gets the IP banned rather than throttled.
REFUSAL_LIMIT = 12

MIN_STOCKS = 5
TOP_INVESTORS = 10

BHAVCOPY_URL = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{d}.csv"
_SLUG_RE = re.compile(r"[^a-z0-9]+")

_METHODOLOGY_URL = (
    "https://www.sebi.gov.in/legal/regulations/"
    "may-2025/securities-and-exchange-board-of-india-listing-obligations-and-"
    "disclosure-requirements-regulations-2015-last-amended-on-may-19-2025-_93748.html"
)
_DISCLAIMER = (
    "Built from quarterly shareholding patterns filed with the exchanges under SEBI "
    "(LODR) Regulation 31. Only public shareholders holding more than 1% must be named, "
    "so positions below that threshold are invisible unless the company also discloses "
    "a persons-acting-in-concert block. Filing dates vary and the latest quarter fills "
    "in over several weeks. Share counts are exactly as filed; values are those share "
    "counts at the most recent close."
)


def empty_snapshot():
    return {
        "version": SNAPSHOT_VERSION,
        "updated_at": None,
        "filings": {},
        "prices": {},
        "price_date": None,
        "last_index_at": None,
    }


def _slug(value):
    return _SLUG_RE.sub("-", (value or "").lower()).strip("-") or "investor"


def _filing_id(symbol, quarter_date):
    return f"{symbol}|{quarter_date}"


# --- ingest ---------------------------------------------------------------

def fetch_close_prices(session=None):
    """{symbol: close} from the official NSE full bhavcopy.

    One request covers every EQ-series scrip, which beats thousands of quote
    lookups. Walks back day by day because the file does not exist on holidays
    and is only published in the evening.
    """
    session = session or sf.new_session()
    headers = {"Referer": "https://www.nseindia.com/all-reports"}
    day = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    for _ in range(8):
        try:
            response = session.get(BHAVCOPY_URL.format(d=day.strftime("%d%m%Y")),
                                   headers=headers, timeout=25)
            if response.status_code == 200:
                prices = {}
                for row in csv.DictReader(io.StringIO(response.text)):
                    row = {(k or "").strip(): (v or "").strip() for k, v in row.items()}
                    if row.get("SERIES") != "EQ":
                        continue
                    try:
                        prices[row["SYMBOL"]] = float(row["CLOSE_PRICE"])
                    except (KeyError, ValueError):
                        continue
                if prices:
                    return prices, day.isoformat()
        except requests.RequestException:
            pass
        day -= timedelta(days=1)
    return {}, None


def pending_filings(snapshot, index):
    """Index entries the snapshot has not ingested at their current revision."""
    stored = snapshot.get("filings", {})
    pending = []
    for entry in index:
        known = stored.get(_filing_id(entry["symbol"], entry["quarter_date"]))
        if not known or known.get("record_id") != entry["record_id"]:
            pending.append(entry)
    return pending


def refresh_snapshot(snapshot, session=None, batch=REFRESH_BATCH, quarters=1):
    """Ingest up to ``batch`` unseen filings into ``snapshot`` in place.

    Returns stats describing what moved, so the caller can decide whether the
    snapshot is worth persisting.
    """
    snapshot.setdefault("filings", {})
    session = session or sf.new_session()
    stats = {"indexed": 0, "pending": 0, "ingested": 0, "failed": 0,
             "refused": False, "remaining": 0}

    windows = [None]
    if quarters > 1:
        # Previous quarter's filings land in the two months after that quarter
        # closed; a dated window is the only way to reach them from the master.
        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=200)
        end = today - timedelta(days=100)
        windows.append((start.strftime("%d-%m-%Y"), end.strftime("%d-%m-%Y")))

    index = {}
    for window in windows:
        try:
            entries = sf.fetch_filing_index(
                session,
                from_date=window[0] if window else None,
                to_date=window[1] if window else None,
            )
        except (requests.RequestException, ValueError):
            continue
        for entry in entries:
            index[_filing_id(entry["symbol"], entry["quarter_date"])] = entry
    if not index:
        raise RuntimeError("NSE shareholding filing index is unavailable.")
    snapshot["last_index_at"] = sf.utc_now_iso()
    stats["indexed"] = len(index)

    queue = pending_filings(snapshot, list(index.values()))
    stats["pending"] = len(queue)
    batch_queue = queue[:batch]
    stats["remaining"] = len(queue) - len(batch_queue)

    refusals = {"streak": 0}

    def ingest(entry):
        if refusals["streak"] >= REFUSAL_LIMIT:
            return None
        try:
            time.sleep(REFRESH_PAUSE)
            result = sf.fetch_filing_holdings(entry, session)
            refusals["streak"] = 0
            return result
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code in (401, 403, 429):
                refusals["streak"] += 1
            return None
        except (requests.RequestException, ValueError):
            return None

    if batch_queue:
        with concurrent.futures.ThreadPoolExecutor(max_workers=REFRESH_WORKERS) as pool:
            for entry, result in zip(batch_queue, pool.map(ingest, batch_queue)):
                if result is None:
                    stats["failed"] += 1
                    continue
                snapshot["filings"][_filing_id(entry["symbol"], entry["quarter_date"])] = {
                    "symbol": result["symbol"],
                    "company": result["company"],
                    "quarter_date": result["quarter_date"],
                    "record_id": entry["record_id"],
                    "total_shares": result["total_shares"],
                    "rows": result["rows"],
                }
                stats["ingested"] += 1

    stats["refused"] = refusals["streak"] >= REFUSAL_LIMIT
    stats["remaining"] += stats["failed"]

    prices, price_date = fetch_close_prices(session)
    if prices:
        snapshot["prices"] = prices
        snapshot["price_date"] = price_date
    snapshot["updated_at"] = sf.utc_now_iso()
    snapshot["version"] = SNAPSHOT_VERSION
    return stats


# --- aggregation ----------------------------------------------------------

def _quarters(snapshot):
    """The two real quarter-ends present, newest first.

    Selected by how many companies filed for a date, not by the date itself.
    A handful of companies file off-cycle after a listing or merger, so the
    raw date order is littered with one-filing dates like 2026-04-23 that would
    otherwise be picked as "the previous quarter" and make every
    quarter-on-quarter comparison meaningless.
    """
    counts = {}
    for filing in snapshot.get("filings", {}).values():
        quarter = filing.get("quarter_date")
        if quarter:
            counts[quarter] = counts.get(quarter, 0) + 1
    if not counts:
        return None, None
    threshold = max(counts.values()) * 0.2
    real = sorted((q for q, n in counts.items() if n >= threshold), reverse=True)
    return (real[0] if real else None,
            real[1] if len(real) > 1 else None)


def _positions_for_quarter(snapshot, quarter):
    """{holder_key: {symbol: position}} for one quarter-end."""
    investors = {}
    for filing in snapshot.get("filings", {}).values():
        if filing.get("quarter_date") != quarter:
            continue
        symbol = filing["symbol"]
        for row in filing.get("rows", []):
            investor = investors.setdefault(row["holder_key"], {
                "name": row["holder_name"], "class": row["class"], "positions": {}})
            position = investor["positions"].setdefault(symbol, {
                "symbol": symbol,
                "company": filing.get("company", ""),
                "shares": 0,
                "pct": 0.0,
                "entities": [],
            })
            position["shares"] += row["shares"]
            position["pct"] = round(position["pct"] + (row.get("pct") or 0), 4)
            if row["entity_name"] not in position["entities"]:
                position["entities"].append(row["entity_name"])
    return investors


def _value_cr(shares, price):
    """Crore value of a position, or None when the scrip had no closing price.

    Renamed and newly listed scrips can be missing from a given bhavcopy. That
    is an unknown value, not a worthless one, so it must not render as Rs 0 Cr
    next to a multi-crore holding.
    """
    return round(shares * price / 1e7, 2) if price else None


def build_investors(snapshot, min_stocks=MIN_STOCKS):
    """Rank every disclosed investor by the value of their disclosed holdings."""
    current_q, previous_q = _quarters(snapshot)
    if not current_q:
        raise RuntimeError("No shareholding filings have been ingested yet.")
    prices = snapshot.get("prices", {})
    current = _positions_for_quarter(snapshot, current_q)
    previous = _positions_for_quarter(snapshot, previous_q) if previous_q else {}

    investors = []
    for key, investor in current.items():
        positions = investor["positions"]
        if len(positions) < min_stocks:
            continue
        prior = (previous.get(key) or {}).get("positions", {})

        holdings, value_cr, priced = [], 0.0, 0
        held_now = held_before = 0.0
        for symbol, position in positions.items():
            price = prices.get(symbol)
            holding_value = _value_cr(position["shares"], price)
            value_cr += holding_value or 0.0
            priced += 1 if price else 0
            before = (prior.get(symbol) or {}).get("shares")
            if price:
                held_now += position["shares"] * price
                held_before += (before or 0) * price
            holdings.append({
                "symbol": symbol,
                "company": position["company"],
                "current_qty": position["shares"],
                "previous_qty": before,
                "qty_change": (position["shares"] - before) if before is not None else None,
                "qty_change_pct": (round((position["shares"] - before) / before * 100, 2)
                                   if before else None),
                "pct_of_company": position["pct"],
                "value_cr": holding_value,
                "entities": position["entities"],
                "status": sf_status(position["shares"], before, previous_q),
            })

        for symbol, gone in prior.items():
            if symbol in positions:
                continue
            price = prices.get(symbol)
            if price:
                held_before += gone["shares"] * price
            holdings.append({
                "symbol": symbol,
                "company": gone["company"],
                "current_qty": 0,
                "previous_qty": gone["shares"],
                "qty_change": -gone["shares"],
                "qty_change_pct": -100.0,
                "pct_of_company": 0.0,
                "value_cr": 0.0,
                "entities": gone["entities"],
                "status": "exited",
            })

        # Unpriced positions carry a null value, so they sort last rather than
        # blowing up the comparison against real crore figures.
        holdings.sort(key=lambda h: (-(h["value_cr"] if h["value_cr"] is not None else -1),
                                     -h["current_qty"]))
        movers = [h for h in holdings if h["qty_change"]]
        movers.sort(key=lambda h: h["qty_change"], reverse=True)
        investors.append({
            "investor_id": _slug(key),
            "holder_key": key,
            "name": investor["name"],
            "class": investor["class"],
            "portfolio_value_cr": round(value_cr, 2),
            "stock_count": len(positions),
            "priced_stock_count": priced,
            # Value change with prices held constant, so this reflects the
            # investor buying and selling rather than the market moving.
            "quarterly_change_pct": (round((held_now - held_before) / held_before * 100, 2)
                                     if held_before else None),
            "top_holdings": holdings[:5],
            "recent_buys": [h for h in movers if h["qty_change"] > 0][:3],
            "recent_sells": [h for h in movers if h["qty_change"] < 0][-3:][::-1],
            "holdings": holdings,
        })

    investors.sort(key=lambda i: -i["portfolio_value_cr"])
    return investors, current_q, previous_q


def sf_status(current_qty, previous_qty, previous_quarter):
    """Quarter-on-quarter direction for one position."""
    if not previous_quarter:
        return "unavailable"
    if previous_qty is None:
        return "new" if (current_qty or 0) > 0 else "unavailable"
    if current_qty > previous_qty:
        return "increased"
    if current_qty < previous_qty:
        return "reduced" if current_qty > 0 else "exited"
    return "unchanged"


def _summarise(investor):
    """Investor row for the directory, without the full holdings list."""
    return {k: v for k, v in investor.items() if k != "holdings"}


def build_superstar_payload(snapshot, limit=TOP_INVESTORS, min_stocks=MIN_STOCKS):
    investors, current_q, previous_q = build_investors(snapshot, min_stocks)
    groups = {"individuals": [], "institutions": []}
    for investor in investors:
        bucket = "institutions" if investor["class"] == "institution" else "individuals"
        if len(groups[bucket]) < limit:
            groups[bucket].append(_summarise(investor))

    for rows in groups.values():
        for rank, row in enumerate(rows, start=1):
            row["rank"] = rank

    warnings = []
    if not previous_q:
        warnings.append(
            "Only one quarter of filings has been ingested, so quarter-on-quarter "
            "share changes are not available yet."
        )
    filings = snapshot.get("filings", {})
    current_filings = sum(1 for f in filings.values() if f.get("quarter_date") == current_q)

    return {
        "as_of": snapshot.get("updated_at") or sf.utc_now_iso(),
        "quarter": current_q,
        "previous_quarter": previous_q,
        "individuals": groups["individuals"],
        "institutions": groups["institutions"],
        "warnings": warnings,
        "coverage": {
            "companies_current_quarter": current_filings,
            "filings_total": len(filings),
            "price_date": snapshot.get("price_date"),
        },
        "source": {
            "name": "Exchange shareholding pattern filings (NSE)",
            "basis": (
                "Quarterly shareholding patterns filed by listed companies under "
                "SEBI (LODR) Regulation 31, read from NSE's filing archive."
            ),
            "individual_url": "https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern",
            "institutional_url": "https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern",
            "methodology_url": _METHODOLOGY_URL,
            "disclaimer": _DISCLAIMER,
        },
    }


def build_investor_detail(snapshot, investor_id, min_stocks=MIN_STOCKS):
    investors, current_q, previous_q = build_investors(snapshot, min_stocks)
    match = next((i for i in investors if i["investor_id"] == investor_id), None)
    if not match:
        raise LookupError("No filed investor matches that identifier.")

    holdings = match["holdings"]
    counts = {status: sum(1 for h in holdings if h["status"] == status)
              for status in ("increased", "unchanged", "reduced", "new", "exited", "unavailable")}
    return {
        "as_of": snapshot.get("updated_at") or sf.utc_now_iso(),
        "investor_id": match["investor_id"],
        "name": match["name"],
        "class": match["class"],
        "portfolio_value_cr": match["portfolio_value_cr"],
        "stock_count": match["stock_count"],
        "current_quarter": current_q,
        "previous_quarter": previous_q,
        "holdings": holdings,
        "status_counts": counts,
        "scope_note": (
            "Every disclosed position for this investor in the latest filed quarter, "
            "with exact share counts as filed. Percentages are of the company's total shares."
        ),
    }
