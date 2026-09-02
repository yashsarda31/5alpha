import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('daily visitor tracking wraps login and every application route', () => {
  assert.match(
    app,
    /import \{ trackDailySiteVisit \} from '\.\/lib\/productAnalytics\.js';/,
  );
  assert.match(
    app,
    /const SiteVisitTracker = \(\) => \{[\s\S]*const \{ pathname \} = useLocation\(\);[\s\S]*void trackDailySiteVisit\(\);[\s\S]*\}, \[pathname\]\);[\s\S]*return null;[\s\S]*\};/,
  );
  assert.match(app, /<BrowserRouter>\s*<SiteVisitTracker \/>\s*<Routes>/);
});
