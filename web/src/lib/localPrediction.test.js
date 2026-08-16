import test from 'node:test';
import assert from 'node:assert/strict';

import { readLocalChoice, writeLocalChoice } from './localPrediction.js';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('local prediction is available only for its question date', () => {
  const storage = memoryStorage();
  assert.equal(writeLocalChoice(storage, '2026-08-16', 'UP'), true);
  assert.equal(readLocalChoice(storage, '2026-08-16'), 'UP');
  assert.equal(readLocalChoice(storage, '2026-08-17'), null);
});

test('invalid choices and blocked storage fail safely', () => {
  const storage = memoryStorage();
  assert.equal(writeLocalChoice(storage, '2026-08-16', 'SIDEWAYS'), false);
  assert.equal(readLocalChoice(storage, '2026-08-16'), null);

  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.equal(writeLocalChoice(blocked, '2026-08-16', 'DOWN'), false);
  assert.equal(readLocalChoice(blocked, '2026-08-16'), null);
});
