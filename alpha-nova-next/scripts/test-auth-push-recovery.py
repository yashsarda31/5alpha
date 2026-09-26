"""Browser regressions against local app with isolated auth/push fixtures."""
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5179'
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context()
    context.add_init_script("""
        localStorage.setItem('alphanova_disclaimer_acknowledged_v1', '1');
        localStorage.setItem('alphanova_auth_token', 'fixture-token');
        localStorage.setItem('alphanova_auth_user', JSON.stringify({uid: 1, displayName: 'Fixture'}));
        class FakeNotification {
            static permission = 'default';
            static async requestPermission() { this.permission = 'granted'; return 'granted'; }
        }
        window.Notification = FakeNotification;
        window.PushManager = class {};
        const sub = {options: {}, toJSON: () => ({endpoint: 'https://push.example/fixture', keys: {p256dh: 'key', auth: 'auth'}})};
        const reg = {active: true, pushManager: {getSubscription: async () => null, subscribe: async () => sub}};
        Object.defineProperty(navigator, 'serviceWorker', {value: {getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg)}});
    """)
    page = context.new_page()
    errors, registrations = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def api(route):
        path = urlparse(route.request.url).path
        if path == '/api/auth/me':
            route.fulfill(json={'user': {'uid': 1, 'displayName': 'Fixture'}})
        elif path == '/api/push/vapid':
            route.fulfill(json={'key': 'BA' + 'A' * 85})
        elif path == '/api/push/subscribe':
            registrations.append(route.request.post_data_json)
            route.fulfill(status=503 if len(registrations) == 1 else 200,
                          json={'detail': 'Temporary storage failure'} if len(registrations) == 1 else {'ok': True})
        else:
            route.fulfill(json={})

    page.route('**/api/**', api)
    page.goto(base + '/watchlist', wait_until='domcontentloaded')
    banner = page.get_by_role('dialog', name='Enable notifications')
    banner.get_by_role('button', name='Enable', exact=True).click()
    expect(banner.get_by_role('alert')).to_contain_text('Could not register')
    assert len(registrations) == 1
    banner.get_by_role('button', name='Retry', exact=True).click()
    expect(banner).not_to_be_visible()
    assert len(registrations) == 2
    assert not errors, errors
    print('PASS: failed push registration stays visible; retry registers and clears the warning')
    browser.close()
