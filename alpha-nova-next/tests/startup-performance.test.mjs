import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('global ticker search implementation is loaded only when search opens', () => {
  assert.doesNotMatch(app, /import TickerSearch from/);
  assert.match(app, /const TickerSearch = lazy\(\(\) => import\('\.\/legacy\/components\/TickerSearch'\)\)/);
});

test('analytics SDK is deferred until after the application starts', () => {
  assert.doesNotMatch(main, /import \{ inject \} from '@vercel\/analytics'/);
  assert.match(main, /import\('@vercel\/analytics'\)/);
  assert.match(main, /requestIdleCallback/);
});
