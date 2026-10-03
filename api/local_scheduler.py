"""Run the existing UTC cron routes while Alpha Nova is hosted on this machine."""

from __future__ import annotations

import json
import os
import queue
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


SCHEDULE_PATH = Path(__file__).resolve().parent.parent / "vercel.json"
LOCAL_BASE_URL = "http://127.0.0.1:8000"


def _field_matches(spec: str, value: int, minimum: int, maximum: int) -> bool:
    for part in spec.split(","):
        base, slash, step_text = part.partition("/")
        step = int(step_text) if slash else 1
        if step < 1:
            raise ValueError(f"Invalid cron step: {spec}")
        if base == "*":
            start, end = minimum, maximum
        elif "-" in base:
            start, end = map(int, base.split("-", 1))
        else:
            start = end = int(base)
        if minimum <= start <= value <= end <= maximum and (value - start) % step == 0:
            return True
    return False


def cron_matches(expression: str, moment: datetime) -> bool:
    """Match the five-field UTC cron syntax used by this project's routes."""
    fields = expression.split()
    if len(fields) != 5 or moment.tzinfo is None:
        raise ValueError("Expected a five-field cron and a timezone-aware datetime")
    utc = moment.astimezone(timezone.utc)
    minute, hour, day, month, weekday = fields
    return all((
        _field_matches(minute, utc.minute, 0, 59),
        _field_matches(hour, utc.hour, 0, 23),
        _field_matches(day, utc.day, 1, 31),
        _field_matches(month, utc.month, 1, 12),
        _field_matches(weekday, (utc.weekday() + 1) % 7, 0, 6),
    ))


def load_jobs(path: Path = SCHEDULE_PATH) -> list[tuple[str, str]]:
    jobs = json.loads(path.read_text(encoding="utf-8"))["crons"]
    result = []
    for job in jobs:
        route, schedule = job["path"], job["schedule"]
        if not route.startswith("/api/") or "?" in route or "#" in route:
            raise ValueError(f"Invalid local scheduler route: {route}")
        cron_matches(schedule, datetime.now(timezone.utc))
        result.append((route, schedule))
    return result


def start_local_scheduler(secret: str, *, base_url: str = LOCAL_BASE_URL) -> None:
    jobs = load_jobs()
    work: queue.Queue[str] = queue.Queue()
    pending: set[str] = set()
    pending_lock = threading.Lock()

    def enqueue(route: str) -> None:
        with pending_lock:
            if route in pending:
                return
            pending.add(route)
            work.put(route)

    def worker() -> None:
        while True:
            route = work.get()
            try:
                request = Request(
                    base_url + route,
                    headers={"Authorization": f"Bearer {secret}"},
                )
                with urlopen(request, timeout=120) as response:
                    status = response.status
                if status >= 400:
                    print(f"Local scheduled job {route} returned HTTP {status}", flush=True)
            except HTTPError as exc:
                print(f"Local scheduled job {route} returned HTTP {exc.code}", flush=True)
            except (URLError, TimeoutError, OSError) as exc:
                print(f"Local scheduled job {route} failed: {exc}", flush=True)
            finally:
                with pending_lock:
                    pending.discard(route)
                work.task_done()

    def schedule() -> None:
        last_minute: dict[str, str] = {}
        time.sleep(5)  # Let Uvicorn bind its loopback port first.
        enqueue("/api/delivery/refresh")  # Catch up after the local server was offline.
        enqueue("/api/fiidii/refresh")
        enqueue("/api/predict/resolve")
        while True:
            now = datetime.now(timezone.utc)
            minute_key = now.strftime("%Y-%m-%dT%H:%M")
            for route, expression in jobs:
                if last_minute.get(route) != minute_key and cron_matches(expression, now):
                    last_minute[route] = minute_key
                    enqueue(route)
            time.sleep(5)

    threading.Thread(target=worker, name="alpha-local-jobs", daemon=True).start()
    threading.Thread(target=schedule, name="alpha-local-schedule", daemon=True).start()
    print(f"Local scheduler active for {len(jobs)} UTC jobs", flush=True)
