"""Fire due AlphaNova cron routes against the Render backend.

Same job table as vercel.json crons, evaluated on a 5-minute GitHub Actions
grid (per-minute Vercel schedules degrade to every-5-min on free infra).
Only the jobs whose window matches the current UTC time are fired, each with
`Authorization: Bearer $CRON_SECRET`. Exits nonzero only on unexpected HTTP
statuses (401/403/5xx are surfaced, 200/204 pass).
"""

import os
import sys
import urllib.request
from datetime import datetime, timezone

BASE_URL = os.environ.get("ALPHANOVA_API_URL", "https://alphanova-api.onrender.com")
SECRET = os.environ["CRON_SECRET"]

# (route, minute_spec, hour_spec, weekday_spec) — weekday 0=Sunday..6=Saturday
# in GitHub cron terms (Mon=1..Sat=6, Sun=0), matching the vercel.json table.
JOBS = [
    ("/api/push/dispatch", "*/5", "3-10", "1-5"),
    ("/api/signals/run/IN", "*/5", "3-10", "1-5"),
    ("/api/signals/run/US", "*/5", "13-21", "1-5"),
    ("/api/delivery/refresh", "0", "14", "1-5"),
    ("/api/fiidii/refresh", "30", "13", "1-5"),
    ("/api/predict/resolve", "30", "10", "1-5"),
    ("/api/watchlist/buy-alerts/IN", "0", "14,16", "1-5"),
    ("/api/watchlist/buy-alerts/US", "0", "2,4", "2-6"),
    ("/api/push/dispatch", "*/5", "14-16", "1-5"),
    ("/api/push/dispatch", "*/5", "2-4", "2-6"),
]


def _in(spec: str, value: int) -> bool:
    for part in spec.split(","):
        base, slash, step = part.partition("/")
        step = int(step) if slash else 1
        if base == "*":
            lo, hi = 0, 59
        elif "-" in base:
            lo, hi = map(int, base.split("-", 1))
        else:
            lo = hi = int(base)
        if lo <= value <= hi and (value - lo) % step == 0:
            return True
    return False


def due(route_spec, now: datetime) -> bool:
    _, minute_spec, hour_spec, weekday_spec = route_spec
    # Python Monday=0..Sunday=6 -> cron Sunday=0..Saturday=6
    cron_weekday = (now.weekday() + 1) % 7
    return (
        # Actions starts can be delayed off the five-minute grid. Daily jobs
        # are idempotent, so retry in the remainder of their scheduled hour.
        (minute_spec.startswith("*/") or now.minute >= int(minute_spec))
        and _in(hour_spec, now.hour)
        and _in(weekday_spec, cron_weekday)
    )


def fire(route: str) -> int:
    req = urllib.request.Request(
        BASE_URL + route, headers={"Authorization": f"Bearer {SECRET}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            print(f"{route} -> HTTP {resp.status}", flush=True)
            return 0 if resp.status < 400 else 1
    except Exception as exc:  # noqa: BLE001 — surfaced, not swallowed
        print(f"{route} -> FAILED: {exc}", flush=True)
        return 1


def main() -> int:
    maintenance = os.environ.get("MAINTENANCE_ROUTE", "")
    if maintenance:
        if maintenance not in {"/api/delivery/refresh", "/api/fiidii/refresh"}:
            print("Unsupported maintenance route", flush=True)
            return 1
        return fire(maintenance)
    now = datetime.now(timezone.utc)
    print(f"cron tick {now.strftime('%Y-%m-%dT%H:%M')}Z", flush=True)
    failures = 0
    fired = 0
    fired_routes = set()
    for job in JOBS:
        if due(job, now) and job[0] not in fired_routes:
            fired_routes.add(job[0])
            fired += 1
            failures += fire(job[0])
    print(f"fired={fired} failures={failures}", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
