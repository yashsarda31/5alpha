import test from 'node:test';
import assert from 'node:assert/strict';
import { nextQuality, particleCountFor, shouldUseMagic } from '../src/magic/qualityGovernor.js';

test('low fps degrades full to reduced to static', () => {
  assert.equal(nextQuality(20, 'full'), 'reduced');
  assert.equal(nextQuality(20, 'reduced'), 'static');
  assert.equal(nextQuality(20, 'static'), 'static');
});

test('high fps never upgrades automatically', () => {
  assert.equal(nextQuality(60, 'reduced'), 'reduced');
  assert.equal(nextQuality(60, 'full'), 'full');
});

test('particle budgets respect level and mobile', () => {
  assert.equal(particleCountFor('full', false), 900);
  assert.equal(particleCountFor('reduced', false), 450);
  assert.equal(particleCountFor('static', false), 0);
  assert.equal(particleCountFor('full', true), 350);
});

test('magic disables on flag, no WebGL, or reduced motion', () => {
  assert.equal(shouldUseMagic({ flag: 'off', webgl: true, reducedMotion: false }), false);
  assert.equal(shouldUseMagic({ flag: 'on', webgl: false, reducedMotion: false }), false);
  assert.equal(shouldUseMagic({ flag: 'on', webgl: true, reducedMotion: false }), true);
  assert.equal(shouldUseMagic({ flag: 'on', webgl: true, reducedMotion: true }), false);
});
