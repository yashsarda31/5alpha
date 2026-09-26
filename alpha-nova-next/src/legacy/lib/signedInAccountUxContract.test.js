import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('login inputs have programmatic labels', () => {
  const login = source('../pages/Login.jsx');
  assert.match(login, /<label htmlFor="login-email">Email Address<\/label>/);
  assert.match(login, /id="login-email"/);
  assert.match(login, /<label htmlFor="login-password">Password<\/label>/);
  assert.match(login, /id="login-password"/);
});

test('signed-in overlays use focus containment', () => {
  const app = source('../App.jsx');
  const settings = source('../components/SettingsSheet.jsx');
  assert.match(app, /aria-expanded=\{menuOpen\}/);
  assert.match(app, /inert: true/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(settings, /closeRef\.current\?\.focus\(\)/);
  assert.match(settings, /trapFocus\(event, dialogRef\.current\)/);
});

test('closing settings restores focus to its visible trigger', () => {
  const app = source('../App.jsx');
  assert.match(app, /settingsTriggerRef\.current = event\.currentTarget/);
  assert.match(app, /settingsTriggerRef\.current\?\.focus\(\)/);
});

test('signed-out settings uses one interactive element for its account action', () => {
  const settings = source('../components/SettingsSheet.jsx');
  assert.match(settings, /className="settings-auth-cta"/);
  assert.doesNotMatch(settings, /<Link[\s\S]*?<button[^>]*>[\s\S]*?Save watchlist &amp; enable alerts/);
});

test('mover cards do not nest the watchlist button inside a chart link', () => {
  const dashboard = source('../pages/Dashboard.jsx');
  const mover = dashboard.match(/const MoverTile[\s\S]*?\n};/)[0];
  assert.match(mover, /className="dash-mover-link"/);
  assert.match(mover, /<WatchlistStar symbol=\{sym\} market=\{market\} size=\{15\} className="dash-mover-star" \/>/);
  assert.doesNotMatch(mover, /<Link[\s\S]*<WatchlistStar/);
});

test('empty signed-in watchlists retry bounded shared-store reads without overwriting a mutation', () => {
  const watchlist = source('../WatchlistContext.jsx');
  assert.match(watchlist, /EMPTY_WATCHLIST_RETRY_DELAYS_MS = \[1000, 2000\]/);
  assert.match(watchlist, /mutationVersionRef\.current !== version/);
});
