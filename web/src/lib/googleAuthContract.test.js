import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('AuthContext posts Google credentials and persists the returned session', () => {
  const auth = source('../AuthContext.jsx');

  assert.match(auth, /const loginWithGoogle = async \(credential\)/);
  assert.match(auth, /apiClient\.post\('\/api\/auth\/google', \{ credential \}\)/);
  assert.match(auth, /loginWithGoogle,/);
});

test('Login renders the official Google Identity Services button when configured', () => {
  const login = source('../pages/Login.jsx');

  assert.match(login, /VITE_GOOGLE_CLIENT_ID/);
  assert.match(login, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(login, /google\.accounts\.id\.renderButton/);
  assert.match(login, /aria-label="Continue with Google"/);
  assert.match(login, /loginWithGoogle/);
  assert.match(login, /or use email/);
});
