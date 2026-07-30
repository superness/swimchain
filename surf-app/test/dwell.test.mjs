import test from 'node:test';
import assert from 'node:assert/strict';
import { createDwell, selectForEngage, ledgerHas, ledgerMark } from '../web/dwell.mjs';

// --- fakes -----------------------------------------------------------------

function fakeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    _map: m,
  };
}

// Fake timer harness: setTimer/clearTimer are the only clock surface
// dwell.mjs uses, so tests drive the "45s elapsed" event by directly
// invoking the stored callback rather than waiting on a real clock.
// dwell.mjs's scheduled callback RETURNS fire()'s promise (a deliberate,
// documented one-line addition over the brief's reference sketch — a real
// setTimeout ignores a callback's return value, so this changes nothing in
// the browser), which is what lets `fire(id)` below be awaited
// deterministically instead of racing fire()'s internal `await engageOne()`
// calls.
function fakeTimers() {
  const handles = new Map();
  let nextId = 1;
  return {
    setTimer(fn) {
      const id = nextId++;
      handles.set(id, fn);
      return id;
    },
    clearTimer(id) {
      handles.delete(id);
    },
    async fire(id) {
      const fn = handles.get(id);
      handles.delete(id);
      if (fn) return fn();
    },
    lastId() {
      return nextId - 1;
    },
    pendingCount() {
      return handles.size;
    },
  };
}

function fakeEngageOne(results) {
  // results: array of {ok, receiveOnly} to return in call order; last one
  // repeats if more calls happen than entries provided.
  const calls = [];
  const fn = async (contentId) => {
    calls.push(contentId);
    const r = results[Math.min(calls.length - 1, results.length - 1)];
    return r;
  };
  fn.calls = calls;
  return fn;
}

const item = (id, body, created_at) => ({ content_id: id, body, created_at });

// --- tests -------------------------------------------------------------

test('1a. tuned + 45s elapsed engages the rendered items', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [item('sha256:a', 'A', 1000), item('sha256:b', 'B', 2000), item('sha256:c', 'C', 3000)];
  const rpc = async (method, params) => {
    assert.equal(method, 'list_space_content');
    assert.equal(params.space_id, 's1');
    return { items };
  };
  const engageOne = fakeEngageOne([{ ok: true }, { ok: true }, { ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  assert.equal(engageOne.calls.length, 0, 'no attempt before the timer fires');

  await timers.fire(timers.lastId());
  assert.equal(engageOne.calls.length, 3, 'all 3 rendered items attempted (under the K=3 cap)');
  assert.deepEqual(engageOne.calls, ['sha256:c', 'sha256:b', 'sha256:a'], 'newest first');
});

test('1b. flip before 45s (untuned) cancels the timer — no attempt', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [item('sha256:a', 'A', 1000)];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  dwell.untuned();
  assert.equal(timers.pendingCount(), 0, 'the scheduled timer was actually cancelled');

  await timers.fire(timers.lastId()); // no-op: cleared, fn is gone
  assert.equal(engageOne.calls.length, 0);
});

test('2. re-tuned to the same channel resets the timer (no double-fire)', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [item('sha256:a', 'A', 1000)];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  const firstId = timers.lastId();
  await dwell.tuned('feed', ['s1']); // re-tune before firing
  const secondId = timers.lastId();
  assert.notEqual(firstId, secondId);

  await timers.fire(firstId); // stale handle: already cleared internally
  assert.equal(engageOne.calls.length, 0, 'the stale (first) timer must not fire');

  await timers.fire(secondId);
  assert.equal(engageOne.calls.length, 1, 'the fresh (second) timer fires exactly once');
});

test('3. ledger: content engaged 1h ago is skipped, 25h ago is retried', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const NOW = 10_000_000;
  store.setItem('engage:sha256:recent', String(NOW - 1 * 3600_000)); // 1h ago
  store.setItem('engage:sha256:stale', String(NOW - 25 * 3600_000)); // 25h ago
  const items = [item('sha256:recent', 'x', 1), item('sha256:stale', 'y', 2)];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => NOW, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  await timers.fire(timers.lastId());

  assert.deepEqual(engageOne.calls, ['sha256:stale'], 'only the 25h-old (ledger-expired) item is retried');
});

test('4. receive-only latch stops the rest of THIS fire and no error propagates', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [item('sha256:c', 'C', 3), item('sha256:b', 'B', 2), item('sha256:a', 'A', 1)];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: false, receiveOnly: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  await assert.doesNotReject(() => timers.fire(timers.lastId()));

  assert.equal(engageOne.calls.length, 1, 'only the first (newest) item was attempted');
  assert.equal(dwell.isReceiveOnly('feed'), true);
});

test('5. receive-only latch persists across a SECOND tuned->fire cycle (session persistence)', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [item('sha256:c', 'C', 3), item('sha256:b', 'B', 2)];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: false, receiveOnly: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  await timers.fire(timers.lastId());
  assert.equal(engageOne.calls.length, 1);
  assert.equal(dwell.isReceiveOnly('feed'), true);

  // Re-invoke tuned() on the SAME channel and advance the timer past 45s
  // again — this proves the latch is session state (a Set checked at the
  // top of fire()), not just the early-return inside the fire() call where
  // the rejection originally happened.
  await dwell.tuned('feed', ['s1']);
  await timers.fire(timers.lastId());

  assert.equal(engageOne.calls.length, 1, 'zero ADDITIONAL engageOne calls on the re-armed cycle');
});

test('6. K cap: 5 rendered items -> at most 3 attempts, newest first', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [
    item('sha256:1', 'a', 100),
    item('sha256:2', 'b', 500),
    item('sha256:3', 'c', 300),
    item('sha256:4', 'd', 900),
    item('sha256:5', 'e', 700),
  ];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: true }, { ok: true }, { ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  await timers.fire(timers.lastId());

  assert.equal(engageOne.calls.length, 3, 'capped at K=3 even though 5 items rendered');
  assert.deepEqual(engageOne.calls, ['sha256:4', 'sha256:5', 'sha256:2'], 'newest-first by created_at: 900, 700, 500');
});

test('7. body:null items are never selected', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  const items = [item('sha256:nobody', null, 5000), item('sha256:hasbody', 'ok', 1000)];
  const rpc = async () => ({ items });
  const engageOne = fakeEngageOne([{ ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']);
  await timers.fire(timers.lastId());

  assert.deepEqual(engageOne.calls, ['sha256:hasbody'], 'the body-null row (never-fetched bytes) is excluded');
});

test('8. an item first listed AFTER tuned() is not engaged (snapshot, not fire-time fetch)', async () => {
  const store = fakeStore();
  const timers = fakeTimers();
  let liveItems = [item('sha256:early', 'seen at tune time', 1)];
  const rpc = async () => ({ items: liveItems }); // returns whatever is "live" right now
  const engageOne = fakeEngageOne([{ ok: true }, { ok: true }]);
  const dwell = createDwell({ rpc, engageOne, store, now: () => 10_000_000, setTimer: timers.setTimer, clearTimer: timers.clearTimer });

  await dwell.tuned('feed', ['s1']); // snapshot taken here: just 'early'

  // Simulate a new post landing on the channel's space AFTER tune time, but
  // before the 45s dwell timer fires.
  liveItems = liveItems.concat([item('sha256:late', 'arrived after tuned()', 2)]);

  await timers.fire(timers.lastId());

  assert.deepEqual(engageOne.calls, ['sha256:early'], 'the late-arriving item must not appear');
});

// --- direct selectForEngage / ledger unit coverage (fast, no timers) ------

test('selectForEngage / ledgerHas / ledgerMark: direct unit sanity', () => {
  const store = fakeStore();
  const now = 10_000_000;
  assert.equal(ledgerHas(store, 'sha256:x', now), false);
  ledgerMark(store, 'sha256:x', now);
  assert.equal(ledgerHas(store, 'sha256:x', now), true);
  assert.equal(ledgerHas(store, 'sha256:x', now + 25 * 3600_000), false);

  const items = [item('sha256:x', 'body', 1), item('sha256:y', 'body', 2), item('sha256:z', null, 3)];
  assert.deepEqual(selectForEngage(items, store, now), ['sha256:y']);
});
