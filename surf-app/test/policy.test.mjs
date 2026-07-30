import test from 'node:test';
import assert from 'node:assert/strict';
import { glow } from '../web/policy.mjs';

const DAY = 86400;

test('glow(0) is fully lit', () => {
  assert.equal(glow(0), 1);
});

test('glow(null/undefined) is dark (no signal yet)', () => {
  assert.equal(glow(null), 0);
  assert.equal(glow(undefined), 0);
});

test('mid-curve anchors freeze the log-8 shape (±0.001)', () => {
  // These two anchors are the load-bearing check: they only hold for a
  // log base of 8 (the 7-day half-life). A base swap (e.g. log2(4)) shifts
  // both values outside the tolerance below.
  assert.ok(Math.abs(glow(1 * DAY) - 0.6667) < 0.001, `glow(1d)=${glow(1 * DAY)}`);
  assert.ok(Math.abs(glow(3 * DAY) - 0.3333) < 0.001, `glow(3d)=${glow(3 * DAY)}`);
});

test('glow(7d) sits at the 0.06 floor', () => {
  assert.ok(Math.abs(glow(7 * DAY) - 0.06) < 0.001);
});

test('glow is monotonically non-increasing across 0.1d..7d', () => {
  let prev = glow(0.1 * DAY);
  for (let days = 0.2; days <= 7; days += 0.1) {
    const v = glow(days * DAY);
    assert.ok(v <= prev + 1e-9, `glow regressed at day ${days.toFixed(1)}: ${v} > ${prev}`);
    prev = v;
  }
});
