"""Deterministic local browser regressions. Start Vite on 5178 before running.

Run: py -3.11 -m unittest discover -s tests -p test_quality_browser.py -v
All API calls are intercepted in the browser; no account/provider requests leave it.
"""
import unittest
from playwright.sync_api import sync_playwright

NETWORK = """
window.requests = [];
window.polls = new Map();
window.deadlines = new Map();
const originalInterval = window.setInterval;
const originalClearInterval = window.clearInterval;
const originalTimeout = window.setTimeout;
const originalClearTimeout = window.clearTimeout;
let timerId = 100000;
window.setInterval = (fn, delay, ...args) => {
  if (delay !== 30000) return originalInterval(fn, delay, ...args);
  const id = ++timerId; polls.set(id, fn); return id;
};
window.clearInterval = id => { polls.delete(id); originalClearInterval(id); };
window.setTimeout = (fn, delay, ...args) => {
  if (![15000, 45000].includes(delay)) return originalTimeout(fn, delay, ...args);
  const id = ++timerId; deadlines.set(id, fn); return id;
};
window.clearTimeout = id => { deadlines.delete(id); originalClearTimeout(id); };
const originalFetch = window.fetch;
window.fetch = (url, options = {}) => {
  if (!String(url).startsWith('/api/')) return originalFetch(url, options);
  return new Promise((resolve, reject) => {
    const request = {url, options, aborted: false,
      ok: data => resolve(new Response(JSON.stringify(data), {status:200})),
      fail: status => resolve(new Response(JSON.stringify({detail:'Test failure'}), {status})),
      reject};
    options.signal?.addEventListener('abort', () => {
      request.aborted = true; reject(new DOMException('Aborted', 'AbortError'));
    });
    requests.push(request);
  });
};
"""


class QualityBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = sync_playwright().start()
        cls.browser = cls.runtime.chromium.launch(channel='chrome', headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.runtime.stop()

    def setUp(self):
        self.context = self.browser.new_context(service_workers='block')
        self.context.add_init_script(NETWORK)
        self.page = self.context.new_page()

    def tearDown(self):
        self.context.close()

    def open(self, auth=False, cached=True):
        if auth:
            self.context.add_init_script("""
              localStorage.setItem('alphanova_auth_token', 'fixture-token-A');
            """ + ("localStorage.setItem('alphanova_auth_user', JSON.stringify({uid:'A'}));" if cached else ""))
        self.page.goto('http://127.0.0.1:5178/tests/quality-harness.html' + ('?auth' if auth else ''))
        self.page.wait_for_function('requests.length === 1')

    def test_poll_does_not_cancel_slow_request(self):
        self.open()
        self.page.evaluate('polls.forEach(fn => fn())')
        self.assertFalse(self.page.evaluate('requests[0].aborted'))
        self.assertEqual(self.page.evaluate('requests.length'), 1)
        self.page.evaluate('requests[0].ok({value:42})')
        self.page.wait_for_function('quality.data?.value === 42')

    def test_refresh_error_remains_until_success(self):
        self.open()
        self.page.evaluate('requests[0].ok({value:42})')
        self.page.wait_for_function('quality.data?.value === 42')
        self.page.evaluate('quality.refresh()')
        self.page.wait_for_function('requests.length === 2')
        self.page.evaluate('requests[1].fail(503)')
        self.page.wait_for_function('quality.error !== null')
        self.page.evaluate('polls.forEach(fn => fn())')
        self.page.wait_for_function('quality.refreshing')
        self.assertIsNotNone(self.page.evaluate('quality.error'))
        self.assertEqual(self.page.evaluate('quality.data.value'), 42)
        self.page.evaluate('requests[2].ok({value:43})')
        self.page.wait_for_function('quality.data?.value === 43 && quality.error === null')

    def test_timeout_produces_retryable_error(self):
        self.open()
        self.page.evaluate('deadlines.forEach(fn => fn())')
        self.page.wait_for_function('quality.error !== null && !quality.refreshing')
        self.assertIn('too long', self.page.evaluate('quality.error'))

    def test_changing_resource_aborts_and_hides_previous_data(self):
        self.open()
        self.page.evaluate('quality.setUrl("/api/quality/second")')
        self.page.wait_for_function('requests.length === 2')
        self.assertTrue(self.page.evaluate('requests[0].aborted'))
        self.assertIsNone(self.page.evaluate('quality.data'))
        self.page.evaluate('requests[1].ok({value:99})')
        self.page.wait_for_function('quality.data?.value === 99')

    def test_late_restore_does_not_sign_user_back_in(self):
        self.open(auth=True)
        self.page.evaluate('void quality.logout()')
        self.page.wait_for_function('requests.length === 2')
        self.page.evaluate('requests[1].ok({ok:true})')
        self.page.wait_for_function('quality.currentUser === null')
        self.page.evaluate('requests[0].ok({user:{uid:"A"}})')
        self.page.wait_for_timeout(50)
        self.assertIsNone(self.page.evaluate('quality.currentUser'))

    def test_late_restore_rejection_does_not_remove_new_login(self):
        self.open(auth=True)
        self.page.evaluate('void quality.loginWithEmail("fixture@example.test", "fixture")')
        self.page.wait_for_function('requests.length === 2')
        self.page.evaluate('requests[1].ok({token:"fixture-token-B",user:{uid:"B"}})')
        self.page.wait_for_function('quality.currentUser?.uid === "B"')
        self.page.evaluate('requests[0].fail(401)')
        self.page.wait_for_timeout(50)
        self.assertEqual(self.page.evaluate('quality.currentUser?.uid'), 'B')
        self.assertEqual(self.page.evaluate('localStorage.getItem("alphanova_auth_token")'), 'fixture-token-B')

    def test_logout_clears_local_session_while_server_is_pending(self):
        self.open(auth=True)
        self.page.evaluate('void quality.logout()')
        self.page.wait_for_timeout(50)
        self.assertIsNone(self.page.evaluate('quality.currentUser'))
        self.assertIsNone(self.page.evaluate('localStorage.getItem("alphanova_auth_token")'))

    def test_session_restore_has_a_deadline(self):
        self.open(auth=True, cached=False)
        self.assertGreater(self.page.evaluate('deadlines.size'), 0)
        self.page.evaluate('deadlines.forEach(fn => fn())')
        self.page.wait_for_function('window.quality?.loading === false')

    def test_global_search_escape_closes_dialog_from_empty_input(self):
        self.page.goto('http://127.0.0.1:5178/dashboard')
        self.page.locator('.an-global-search').click()
        search = self.page.get_by_role('combobox', name='Search stocks')
        search.wait_for()
        search.press('Escape')
        self.page.wait_for_timeout(50)
        self.assertEqual(self.page.locator('dialog[open]').count(), 0)

    def test_global_search_dialog_has_an_accessible_name(self):
        self.page.goto('http://127.0.0.1:5178/dashboard')
        self.page.locator('.an-global-search').click()
        self.page.locator('dialog[open]').wait_for()
        self.assertEqual(self.page.get_by_role('dialog', name='Search stocks and tools').count(), 1)

    def test_escape_dismisses_suggestions_before_closing_search(self):
        self.page.goto('http://127.0.0.1:5178/dashboard')
        self.page.locator('.an-global-search').click()
        search = self.page.get_by_role('combobox', name='Search stocks')
        search.fill('RELIANCE')
        self.page.wait_for_function('requests.some(r => r.url.includes("symbol-search"))')
        self.page.evaluate('requests.find(r => r.url.includes("symbol-search")).ok({results:[{symbol:"RELIANCE.NS",name:"Reliance"}]})')
        self.page.get_by_role('option').wait_for()
        search.press('Escape')
        self.assertEqual(self.page.locator('dialog[open]').count(), 1)
        self.assertEqual(self.page.get_by_role('option').count(), 0)
        search.press('Escape')
        self.page.wait_for_timeout(50)
        self.assertEqual(self.page.locator('dialog[open]').count(), 0)

    def test_expired_session_is_still_cleared(self):
        self.open(auth=True)
        self.page.evaluate('requests[0].fail(401)')
        self.page.wait_for_function('quality.currentUser === null')
        self.assertIsNone(self.page.evaluate('localStorage.getItem("alphanova_auth_token")'))

    def test_late_login_cannot_undo_sign_out(self):
        self.open(auth=True)
        self.page.evaluate('void quality.loginWithEmail("fixture@example.test", "fixture")')
        self.page.wait_for_function('requests.length === 2')
        self.page.evaluate('void quality.logout()')
        self.page.wait_for_function('requests.length === 3')
        self.page.evaluate('requests[1].ok({token:"fixture-token-B",user:{uid:"B"}})')
        self.page.wait_for_timeout(50)
        self.assertIsNone(self.page.evaluate('quality.currentUser'))
        self.assertIsNone(self.page.evaluate('localStorage.getItem("alphanova_auth_token")'))


if __name__ == '__main__':
    unittest.main()
