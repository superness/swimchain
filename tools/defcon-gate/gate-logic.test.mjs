import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeMatches, gateDecision, offerPlan, hourlyCount } from './gate-logic.mjs';

test('codeMatches: trim + case-insensitive; empty never matches', () => {
  assert.equal(codeMatches('  test-code-1234 ', 'TEST-CODE-1234'), true);
  assert.equal(codeMatches('TEST-CODE-1234', 'TEST-CODE-1234'), true);
  assert.equal(codeMatches('wrong', 'TEST-CODE-1234'), false);
  assert.equal(codeMatches('', 'TEST-CODE-1234'), false);
  assert.equal(codeMatches(undefined, 'TEST-CODE-1234'), false);
  assert.equal(codeMatches('TEST-CODE-1234', ''), false); // unset gate code fails closed
});

const baseArgs = { gateCode: 'TEST-CODE-1234', nowMs: 1_000_000_000,
  endAtMs: 2_000_000_000, totalApproved: 0, approvedAtMs: [], totalCap: 500, hourlyCap: 60 };

test('gateDecision approves a good code under caps', () => {
  assert.deepEqual(gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234' }),
    { action: 'approve', reason: 'ok' });
});
test('gateDecision rejects a bad code', () => {
  assert.equal(gateDecision({ ...baseArgs, applicationText: 'nope' }).action, 'reject');
});
test('gateDecision skips (not rejects) at total cap', () => {
  const d = gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', totalApproved: 500 });
  assert.deepEqual([d.action, d.reason], ['skip', 'total-cap']);
});
test('gateDecision skips at hourly cap using the trailing window', () => {
  const approvedAtMs = Array.from({ length: 60 }, (_, i) => baseArgs.nowMs - i * 1000);
  const d = gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', approvedAtMs });
  assert.deepEqual([d.action, d.reason], ['skip', 'hourly-cap']);
});
test('hourly window slides: old approvals free the cap', () => {
  const approvedAtMs = Array.from({ length: 60 }, () => baseArgs.nowMs - 3_700_000);
  assert.equal(hourlyCount(approvedAtMs, baseArgs.nowMs), 0);
  assert.equal(gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', approvedAtMs }).action, 'approve');
});
test('gateDecision skips everything after END_AT even with a good code', () => {
  const d = gateDecision({ ...baseArgs, applicationText: 'TEST-CODE-1234', nowMs: 3_000_000_000 });
  assert.deepEqual([d.action, d.reason], ['skip', 'ended']);
});
test('gateDecision after END_AT with a BAD code still skips — never signs a reject after end', () => {
  const d = gateDecision({ ...baseArgs, applicationText: 'wrong-code', nowMs: 3_000_000_000 });
  assert.deepEqual([d.action, d.reason], ['skip', 'ended']);
});

test('offerPlan wants a new offer only when the tier has no live capacity', () => {
  const live = { slots_remaining: 3, expires_at: 2_000_000 };
  const full = { slots_remaining: 0, expires_at: 2_000_000 };
  const expired = { slots_remaining: 10, expires_at: 900 };
  const args = { tierScopeHex: null, nowSec: 1_000, endAtSec: 2_000_000, totalApproved: 0, totalCap: 500 };
  assert.equal(offerPlan({ ...args, myOffers: [live] }).needNew, false);
  assert.equal(offerPlan({ ...args, myOffers: [full, expired] }).needNew, true);
  assert.equal(offerPlan({ ...args, myOffers: [] }).needNew, true);
  assert.equal(offerPlan({ ...args, myOffers: [], totalApproved: 500 }).needNew, false); // cap reached
  assert.equal(offerPlan({ ...args, myOffers: [], nowSec: 3_000_000 }).needNew, false);  // ended
});
