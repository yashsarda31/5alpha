import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUEST_GATE_DEFAULT,
  isGuestGateEnabled,
  isPublicPath,
  previewSetups,
  readGateOverride,
  destinationLabel,
  resolveGateSetups,
  formatGateDate,
} from './accessGate.js';

const storage = (value) => ({ getItem: () => value });

test('marketing, proof and legal pages stay reachable while signed out', () => {
  assert.equal(isPublicPath('/'), true);
  assert.equal(isPublicPath('/login'), true);
  assert.equal(isPublicPath('/track-record'), true);
  assert.equal(isPublicPath('/privacy'), true);
  assert.equal(isPublicPath('/terms'), true);
  assert.equal(isPublicPath('/support'), true);
  assert.equal(isPublicPath('/dashboard'), false);
  assert.equal(isPublicPath('/signals'), false);
});

test('the gate override reads on/off and ignores anything else', () => {
  assert.equal(readGateOverride(storage('on')), true);
  assert.equal(readGateOverride(storage('off')), false);
  assert.equal(readGateOverride(storage('maybe')), null);
  assert.equal(readGateOverride(storage(null)), null);
});

test('an unset override falls back to the shipped default', () => {
  assert.equal(isGuestGateEnabled(storage(null)), GUEST_GATE_DEFAULT);
  assert.equal(isGuestGateEnabled(storage('off')), false);
  assert.equal(isGuestGateEnabled(storage('on')), true);
});

test('blocked storage degrades to the default instead of throwing', () => {
  const hostile = { getItem() { throw new Error('SecurityError'); } };
  assert.equal(readGateOverride(hostile), null);
  assert.equal(isGuestGateEnabled(hostile), GUEST_GATE_DEFAULT);
});

test('preview keeps the best-scoring plan per symbol, ranked', () => {
  const signals = {
    setups: {
      plans: [
        { symbol: 'GAIL', side: 'LONG', score: 72 },
        { symbol: 'GAIL', side: 'SHORT', score: 55 },   // same symbol, weaker
        { symbol: 'HYUNDAI', side: 'LONG', score: 69 },
        { symbol: 'BAJFINANCE', side: 'LONG', score: 68 },
        { symbol: 'TATASTEEL', side: 'LONG', score: 51 },
      ],
    },
  };
  const top = previewSetups(signals);
  assert.deepEqual(top.map((p) => p.symbol), ['GAIL', 'HYUNDAI', 'BAJFINANCE']);
  assert.equal(top[0].score, 72, 'the stronger GAIL side wins the slot');
});

test('preview tolerates missing, empty and malformed payloads', () => {
  assert.deepEqual(previewSetups(null), []);
  assert.deepEqual(previewSetups({}), []);
  assert.deepEqual(previewSetups({ setups: { plans: [] } }), []);
  assert.deepEqual(previewSetups({ setups: { plans: [{ score: 90 }, null] } }), []);
});

test('the gate falls back to recently published calls when nothing is live', () => {
  const preview = {
    as_of: '2026-08-05',
    setups: [
      { symbol: 'MCX', side: 'SHORT', score: 78 },
      { symbol: 'BSE', side: 'SHORT', score: 65 },
    ],
  };
  const resolved = resolveGateSetups({ setups: { plans: [] } }, preview);
  assert.equal(resolved.live, false);
  assert.equal(resolved.asOf, '2026-08-05');
  assert.deepEqual(resolved.setups.map((s) => s.symbol), ['MCX', 'BSE']);
});

test('live calls always beat the recent fallback', () => {
  const signals = { setups: { plans: [{ symbol: 'KEI', side: 'LONG', score: 81 }] } };
  const preview = { as_of: '2026-08-04', setups: [{ symbol: 'MCX', side: 'SHORT', score: 78 }] };
  const resolved = resolveGateSetups(signals, preview);
  assert.equal(resolved.live, true);
  assert.equal(resolved.asOf, null, 'live calls need no as-of label');
  assert.deepEqual(resolved.setups.map((s) => s.symbol), ['KEI']);
});

test('the fallback drops malformed rows and respects the limit', () => {
  const preview = {
    as_of: '2026-08-05',
    setups: [
      { symbol: 'MCX', side: 'SHORT', score: 78 },
      { score: 90 },                                  // no symbol
      { symbol: 'BSE', score: 65 },                   // no side
      { symbol: 'KEI', side: 'LONG', score: 81 },
      { symbol: 'LICI', side: 'SHORT', score: 60 },
      { symbol: 'SONACOMS', side: 'LONG', score: 73 },
    ],
  };
  const resolved = resolveGateSetups(null, preview);
  assert.deepEqual(resolved.setups.map((s) => s.symbol), ['MCX', 'KEI', 'LICI']);
});

test('both sources empty degrades to an empty panel, not a crash', () => {
  assert.deepEqual(resolveGateSetups(null, null).setups, []);
  assert.deepEqual(resolveGateSetups({}, {}).setups, []);
  assert.equal(resolveGateSetups(null, null).live, false);
  assert.equal(resolveGateSetups(null, { setups: [] }).asOf, null);
});

test('published dates read as a short human date', () => {
  assert.equal(formatGateDate('2026-08-05'), '5 Aug 2026');
  assert.equal(formatGateDate(null), '');
  assert.equal(formatGateDate('nonsense'), '');
});

test('the gate can name the page the visitor was reaching for', () => {
  assert.equal(destinationLabel('/screener'), 'the Quant Screener');
  assert.equal(destinationLabel('/signals'), 'Market Signals');
  assert.equal(destinationLabel('/nonsense'), null);
});

test('deep-link gates explain the requested tool instead of repeating the Signals pitch', () => {
  const gate = readFileSync(new URL('./accessGate.js', import.meta.url), 'utf8');
  assert.match(gate, /export const gateContent/);
  assert.match(gate, /\/screener[\s\S]*screen/i);
  assert.match(gate, /\/dcf[\s\S]*(value|valuation)/i);
  assert.match(gate, /\/signals[\s\S]*showSignals:\s*true/i);
});
