import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { calculatePositionSize } from '../src/legacy/lib/positionSizing.js';

test('profits and stop risk use the rounded quantity, not the unused budget', () => {
  const plan = calculatePositionSize({ capital: 100000, riskPercent: 1, entryPrice: 101, stopLoss: 98 });
  assert.equal(plan.shares, 333);
  assert.equal(plan.riskAmount, 1000);
  assert.equal(plan.actualRisk, 999);
  assert.deepEqual(plan.targets.map(t => t.profit), [999, 1498.5, 1998, 2997]);
  assert.deepEqual(plan.targets.map(t => t.price), [104, 105.5, 107, 110]);
});

test('invalid prices, risks, blank fields and overflow produce no plan', () => {
  const valid = { capital: 100000, riskPercent: 1, entryPrice: 100, stopLoss: 95 };
  for (const override of [{capital: 0}, {capital: -1}, {capital: ''}, {capital: Infinity},
    {riskPercent: -1}, {riskPercent: 101}, {riskPercent: NaN}, {entryPrice: 0},
    {stopLoss: -1}, {stopLoss: 100}, {capital: Number.MAX_VALUE}]) {
    const plan = calculatePositionSize({...valid, ...override});
    assert.ok(plan.error, JSON.stringify(override));
    assert.equal(plan.shares, 0);
    assert.equal(plan.positionSize, 0);
    assert.deepEqual(plan.targets, []);
  }
});

test('a budget below one share gives zero quantity while leveraged sizes remain explicit', () => {
  const small = calculatePositionSize({capital: 100, riskPercent: 1, entryPrice: 100, stopLoss: 95});
  assert.equal(small.shares, 0);
  assert.equal(small.error, null);
  const large = calculatePositionSize({capital: 100000, riskPercent: 1, entryPrice: 100, stopLoss: 99.5});
  assert.equal(large.shares, 2000);
  assert.equal(large.percentOfCapital, 200);
});

test('invalid saved capital and risk never render a negative quantity or exposure', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const { default: PositionSizing } = await server.ssrLoadModule('/src/legacy/pages/PositionSizing.jsx');
    for (const prefs of [{ capital: -100000, riskPercent: 1 }, { capital: 100000, riskPercent: -1 }]) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: key => key === 'alphanova_sizing_prefs' ? JSON.stringify(prefs) : null,
      } });
      const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(PositionSizing)));
      assert.doesNotMatch(html, />-200</, JSON.stringify(prefs));
      assert.doesNotMatch(html, /₹-20,000/, JSON.stringify(prefs));
      assert.match(html, /role="alert"/, 'invalid inputs must explain why no plan is calculated');
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
    await server.close();
  }
});
