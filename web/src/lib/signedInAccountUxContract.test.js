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
