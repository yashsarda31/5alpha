"""Issue-list regressions against the local app, with deterministic API fixtures."""
import unittest
from playwright.sync_api import sync_playwright, expect


class NewUserIssues(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.p = sync_playwright().start()
        cls.browser = cls.p.chromium.launch(channel='chrome', headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.p.stop()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1280,'height':720}, service_workers='block')
        self.context.route('**/api/**', lambda r: r.fulfill(json={}))
        self.page = self.context.new_page()

    def tearDown(self):
        self.context.unroute_all(behavior='ignoreErrors')
        self.context.close()

    def open(self, path):
        self.page.goto('http://127.0.0.1:5178'+path)

    def test_account_and_settings_are_reachable(self):
        self.open('/dashboard')
        self.page.get_by_role('link', name='AN Your personal workspace').click(timeout=4000)
        expect(self.page).to_have_url('http://127.0.0.1:5178/login')
        self.page.get_by_role('button', name='Notification settings').click()
        expect(self.page.get_by_role('dialog', name='Settings', exact=True)).to_be_visible()

    def test_aliases_preserve_context(self):
        for alias, target in [('analyse','chart'),('auth','login'),('tools','explore'),('sector-rotation','sectors'),('institutional-flows','fiidii')]:
            self.open('/'+alias+'?symbol=RELIANCE.NS&market=IN#context')
            expect(self.page).to_have_url('http://127.0.0.1:5178/'+target+'?symbol=RELIANCE.NS&market=IN#context')

    def test_missing_page_is_identified(self):
        self.open('/nonexistent123')
        expect(self.page.get_by_text('Page not found', exact=True)).to_be_visible()
        expect(self.page).to_have_title('Page not found | Alpha Nova')

    def test_signup_and_fundamentals_on_mobile(self):
        self.page.set_viewport_size({'width':375,'height':812})
        self.open('/dashboard')
        self.page.get_by_role('link', name='Create your workspace').click()
        expect(self.page.get_by_role('button', name='Create free account', exact=True)).to_be_visible()
        self.open('/fundamentals')
        expect(self.page.get_by_role('combobox')).to_be_visible()
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),375)

    def test_watchlist_selection_survives_signup(self):
        self.context.route('**/api/dashboard?*', lambda r: r.fulfill(json={'movers':[{'ticker':'RELIANCE','last':1248}], 'movers_market':'IN'}))
        self.context.route('**/api/auth/signup', lambda r: r.fulfill(json={'token':'fixture-token','user':{'uid':'fixture','displayName':'Test'}}))
        saved = []
        def watchlist(route):
            if route.request.method == 'POST':
                saved.append(route.request.post_data_json)
            route.fulfill(json={'symbols':[{'symbol':'RELIANCE','market':'IN'}] if saved else []})
        self.context.route('**/api/watchlist', watchlist)
        self.open('/dashboard?market=IN')
        self.page.get_by_role('button', name='Add RELIANCE to watchlist', exact=True).click()
        expect(self.page.get_by_role('status')).to_contain_text('Sign in to save RELIANCE')
        self.page.get_by_label('Email Address').fill('fixture@example.test')
        self.page.get_by_label('Password', exact=True).fill('fixture-pass-123')
        self.page.get_by_role('button', name='Create free account', exact=True).click()
        expect(self.page).to_have_url('http://127.0.0.1:5178/dashboard?market=IN')
        expect(self.page.get_by_role('button', name='Remove RELIANCE from watchlist')).to_be_visible()
        self.assertEqual(saved, [{'symbol':'RELIANCE','market':'IN'}])

    def test_index_charts_and_search(self):
        self.context.route('**/api/dashboard?*', lambda r: r.fulfill(json={'indices':[
            {'name':name,'last':20,'spark':[10,20],'spark_dates':['2026-09-22','2026-09-23'],'source':'Fixture','as_of':'2026-09-23'}
            for name in ['NIFTY 50','INDIA VIX','USD/INR']]}))
        self.open('/dashboard')
        self.page.get_by_role('button', name='INDIA VIX VOLATILITY', exact=False).click()
        expect(self.page.get_by_role('img', name='INDIA VIX recent closing prices',exact=False)).to_be_visible()
        expect(self.page.get_by_text('22 Sept 2026',exact=True)).to_be_visible()
        self.page.keyboard.press('Control+k')
        expect(self.page.get_by_role('dialog',name='Search stocks and tools')).to_be_visible()
        self.page.get_by_role('button', name='RELIANCE.NS',exact=True).click()
        expect(self.page).to_have_url('http://127.0.0.1:5178/chart?symbol=RELIANCE.NS&market=IN')

    def test_screener_cancel(self):
        pending = []
        self.context.route('**/api/screener',lambda r: pending.append(r))
        self.open('/screener')
        self.page.get_by_role('button',name='Run screen',exact=True).click()
        self.page.get_by_role('button',name='Cancel scan',exact=True).click()
        expect(self.page.get_by_text('Scan cancelled.',exact=True)).to_be_visible()
        expect(self.page.get_by_role('button',name='Run screen',exact=True)).to_be_enabled()
        for route in pending:
            route.abort()

    def test_unfiltered_universe_is_not_labelled_as_matches(self):
        self.context.route('**/api/screener',lambda r: r.fulfill(json={
            'data':[{'ticker':'RELIANCE.NS','price':1248,'priceDate':'2026-09-23','reasons':['No filters applied']}],
            'matched':1,'requested':100,'scanned':1,'non_matches':0,'incomplete_count':99,
            'incomplete':[], 'source':'Fixture', 'generated_at':'2026-09-24T00:00:00Z'}))
        self.open('/screener')
        self.page.get_by_role('button',name='Run screen',exact=True).click()
        expect(self.page.get_by_role('heading',name='1 stocks in unfiltered universe / 100 stocks')).to_be_visible()
        expect(self.page.get_by_role('columnheader',name='Coverage',exact=True)).to_be_visible()


if __name__ == '__main__':
    unittest.main()
