import importlib.util
from pathlib import Path
from datetime import datetime, timezone
import http.client
import urllib.error

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

def test_delivery_refresh_retries_interrupted_connection_once(monkeypatch):
    cron = load_cron(monkeypatch)
    calls = []
    class Response:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *args): pass
    def request(*args, **kwargs):
        calls.append(args[0].full_url)
        if len(calls) == 1:
            raise http.client.RemoteDisconnected('connection closed')
        return Response()
    monkeypatch.setattr(cron.urllib.request, 'urlopen', request)
    assert cron.fire('/api/delivery/refresh') == 0
    assert len(calls) == 2

def test_dispatch_and_http_errors_are_not_retried(monkeypatch):
    cron = load_cron(monkeypatch)
    calls = []
    def interrupted(*args, **kwargs):
        calls.append(1)
        raise http.client.RemoteDisconnected('connection closed')
    monkeypatch.setattr(cron.urllib.request, 'urlopen', interrupted)
    assert cron.fire('/api/push/dispatch') == 1
    assert len(calls) == 1
    calls.clear()
    def unauthorized(*args, **kwargs):
        calls.append(1)
        raise urllib.error.HTTPError(args[0].full_url, 401, 'unauthorized', {}, None)
    monkeypatch.setattr(cron.urllib.request, 'urlopen', unauthorized)
    assert cron.fire('/api/delivery/refresh') == 1
    assert len(calls) == 1
