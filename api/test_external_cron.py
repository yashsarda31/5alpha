import importlib.util
from pathlib import Path
from datetime import datetime, timezone

def load_cron(monkeypatch):
    monkeypatch.setenv('CRON_SECRET', 'test-only')
    spec = importlib.util.spec_from_file_location('external_cron', Path(__file__).parents[1] / '.github/workflows/cron.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def test_delayed_runs_do_not_miss_daily_refresh(monkeypatch):
    cron = load_cron(monkeypatch)
    delivery = next(job for job in cron.JOBS if job[0] == '/api/delivery/refresh')
    assert cron.due(delivery, datetime(2026, 10, 1, 14, 17, tzinfo=timezone.utc))
    assert not cron.due(delivery, datetime(2026, 10, 1, 13, 59, tzinfo=timezone.utc))

def test_delayed_five_minute_tick_still_refreshes_signals(monkeypatch):
    cron = load_cron(monkeypatch)
    job = next(job for job in cron.JOBS if job[0] == '/api/signals/run/IN')
    assert cron.due(job, datetime(2026, 10, 1, 7, 13, tzinfo=timezone.utc))
    assert not cron.due(job, datetime(2026, 10, 3, 7, 13, tzinfo=timezone.utc))

def test_scheduled_routes_exist(monkeypatch):
    from api import main
    routes = [route.path_regex for route in main.app.routes if hasattr(route, 'path_regex')]
    for path, *_ in load_cron(monkeypatch).JOBS:
        assert any(pattern.fullmatch(path) for pattern in routes), path

def test_targeted_delivery_refresh_never_dispatches_alerts(monkeypatch):
    cron = load_cron(monkeypatch)
    monkeypatch.setenv('MAINTENANCE_ROUTE', '/api/delivery/refresh')
    fired = []
    monkeypatch.setattr(cron, 'fire', lambda route: fired.append(route) or 0)
    assert cron.main() == 0
    assert fired == ['/api/delivery/refresh']
