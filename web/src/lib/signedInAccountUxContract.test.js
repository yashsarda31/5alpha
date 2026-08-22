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
  assert.match(app, /inert: ''/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(settings, /closeRef\.current\?\.focus\(\)/);
  assert.match(settings, /trapFocus\(event, dialogRef\.current\)/);
});
