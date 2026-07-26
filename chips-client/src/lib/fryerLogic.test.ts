/**
 * Pure fryer-scheduling rules: the u64 nonce ceiling (checked against the
 * REAL bankBody/parseMove, not just fryerLogic's own literal), the bankable
 * gate, the ms allocator's distinctness guarantee, and the two state
 * transitions (`applyFryerMessage`, `takeChip`) useFryers.ts builds on. No
 * Worker, no DOM, no Argon2id — runs instantly.
 * Run: npx tsx src/lib/fryerLogic.test.ts
 */
import {
  nextNonce, isBankable, createMsAllocator, applyFryerMessage, takeChip, grindLoop, U64_MAX,
  restartRecord, nextRetryDelay, planResize,
} from './fryerLogic';
import type { FryerRecord } from './fryerLogic';
import type { CrunchRes } from './crunch.worker';
import { bankBody } from './chipsBody';
import { parseMove } from './chipsEngine';
import { BANK_MIN_BITS } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  // BigInt-safe: a FryerRecord carries a bigint nonce, and a bare
  // JSON.stringify THROWS on it — so a genuine failure used to crash the run
  // with "Do not know how to serialize a BigInt" instead of printing which
  // assertion failed and why. Hit while mutation-testing planResize.
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`); }
}

// 1) nextNonce: ordinary increments, and the u64 ceiling — checked against
// the REAL bankBody/parseMove (chipsBody.ts / chipsEngine.ts), not just
// restated as fryerLogic's own `2n ** 64n - 1n` literal. A change to
// bankBody's ceiling assert or parseMove's `{1,16}` hex-length regex must
// be able to fail this test.
check('nextNonce increments', nextNonce(0n) === 1n);
check('nextNonce increments a large value', nextNonce(1000n) === 1001n);

{
  let threw = false;
  try { bankBody(BANK_MIN_BITS, U64_MAX, 1); } catch { threw = true; }
  check("bankBody accepts nextNonce's ceiling (U64_MAX)", !threw);

  threw = false;
  try { bankBody(BANK_MIN_BITS, U64_MAX + 1n, 1); } catch { threw = true; }
  check("bankBody rejects one past nextNonce's ceiling", threw);

  const body = bankBody(BANK_MIN_BITS, U64_MAX, 1);
  const parsed = parseMove(body);
  check(
    'parseMove round-trips the exact U64_MAX nonce bankBody just accepted (pins the {1,16} hex regex too)',
    parsed?.kind === 'bank' && parsed.chips[0].nonce === U64_MAX,
    body
  );
}

check('nextNonce at U64_MAX - 1 still steps', nextNonce(U64_MAX - 1n) === U64_MAX);
check('nextNonce at U64_MAX stops (returns null)', nextNonce(U64_MAX) === null);
check('nextNonce never returns a value > U64_MAX', (() => {
  for (const n of [0n, 1n, U64_MAX - 2n, U64_MAX - 1n, U64_MAX]) {
    const next = nextNonce(n);
    if (next !== null && next > U64_MAX) return false;
  }
  return true;
})());

// 2) isBankable: gated at exactly BANK_MIN_BITS, matching the fold's own
// `parsed.bits < BANK_MIN_BITS` rejection in chipsEngine.ts.
check(`isBankable(${BANK_MIN_BITS - 1}) is false (one below the gate)`, isBankable(BANK_MIN_BITS - 1) === false);
check(`isBankable(${BANK_MIN_BITS}) is true (exactly at the gate)`, isBankable(BANK_MIN_BITS) === true);
check(`isBankable(${BANK_MIN_BITS + 1}) is true (above the gate)`, isBankable(BANK_MIN_BITS + 1) === true);
check('isBankable(0) is false', isBankable(0) === false);
check('isBankable(-1) is false (defensive)', isBankable(-1) === false);

// 3) createMsAllocator: every value it ever hands out, across many calls,
// is distinct, positive, and strictly increasing — the property two fryers
// (or one fryer across a rebank) actually depend on to never share a
// preimage.
{
  const allocate = createMsAllocator(1_000_000);
  const seen = new Set<number>();
  let prev = -Infinity;
  let strictlyIncreasing = true;
  let allPositive = true;
  for (let i = 0; i < 500; i++) {
    const ms = allocate();
    if (ms <= prev) strictlyIncreasing = false;
    if (ms <= 0) allPositive = false;
    seen.add(ms);
    prev = ms;
  }
  check('allocator never repeats a value across 500 draws', seen.size === 500, seen.size);
  check('allocator is strictly increasing', strictlyIncreasing);
  check('allocator only hands out positive integers', allPositive);
}

// 4) Two independently-seeded allocators (standing in for two fryers created
// in the same effect run, or a fresh mount racing an old one in the same
// millisecond) never hand out the same ms if seeded from the same instant —
// the actual failure mode a naive `Date.now() + index` scheme has.
{
  const seed = 42_000;
  const a = createMsAllocator(seed);
  const b = createMsAllocator(seed);
  const fromA = new Set([a(), a(), a()]);
  const fromB = new Set([b(), b(), b()]);
  const overlap = [...fromA].some((v) => fromB.has(v));
  // This documents the allocator's actual contract: distinctness is
  // guaranteed WITHIN one allocator's sequence (one per hook instance), not
  // across two independently-seeded ones — useFryers.ts relies on there
  // being exactly one allocator per hook instance, held in a ref, not one
  // freshly seeded per fryer or per effect run.
  check('same-seeded allocators alias (documents why useFryers must use ONE allocator, not one per fryer)', overlap);
}

// 5) applyFryerMessage: the stale-drop transition useFryers.ts's onmessage
// handler delegates to. A matching ms applies; a stale, out-of-range, or
// 'exhausted' message is a no-op (returns null) — including the case
// Worker.terminate() can actually produce: a message for an index the
// basket no longer tracks.
{
  const records: FryerRecord[] = [
    { ms: 100, bits: -1, attempts: 0, nonce: 0n },
    { ms: 200, bits: 3, attempts: 5, nonce: 0x7n },
  ];

  const crisper: CrunchRes = { type: 'crisper', ms: 100, bits: 12, nonce: 'ab', attempts: 7 };
  const applied = applyFryerMessage(records, 0, crisper);
  check(
    'matching-ms crisper message applies (bits/attempts/nonce updated)',
    applied !== null && applied[0].bits === 12 && applied[0].attempts === 7 && applied[0].nonce === 0xabn,
    applied?.[0]
  );
  check(
    'applying a message to index 0 does not touch fryer 1',
    applied !== null && applied[1].ms === 200 && applied[1].bits === 3 && applied[1].nonce === 0x7n
  );

  const stale: CrunchRes = { type: 'crisper', ms: 99, bits: 20, nonce: 'ff', attempts: 1 };
  check(
    "a stale ms (from a chip this fryer has already moved past) is dropped",
    applyFryerMessage(records, 0, stale) === null
  );

  const progress: CrunchRes = { type: 'progress', ms: 200, bits: 3, attempts: 21 };
  const afterProgress = applyFryerMessage(records, 1, progress);
  check(
    "a 'progress' message keeps the previous nonce (progress carries no nonce)",
    afterProgress !== null && afterProgress[1].nonce === records[1].nonce
  );
  check("a 'progress' message updates attempts", afterProgress !== null && afterProgress[1].attempts === 21);

  const exhausted: CrunchRes = { type: 'exhausted', ms: 100 };
  check("an 'exhausted' message never applies, even for a matching ms", applyFryerMessage(records, 0, exhausted) === null);

  // Worker.terminate() cannot retract an already-queued message: a late
  // post can arrive for an index the basket has since shrunk past, or
  // against an entirely empty basket (cleared on logout). Both must be
  // no-ops, not an out-of-bounds write.
  check('a message for an out-of-range index is dropped, not written past the array', applyFryerMessage(records, 5, crisper) === null);
  check('a message against an empty basket is dropped', applyFryerMessage([], 0, crisper) === null);
}

// 6) takeChip: the retire-and-reallocate transition bank() delegates to.
// Bankable -> retired and replaced with a fresh placeholder; a second take
// on the just-emptied fryer -> null; sub-BANK_MIN_BITS or out-of-range ->
// null and no mutation.
{
  const bankableRec: FryerRecord = { ms: 500, bits: 10, attempts: 40, nonce: 0xdeadbeefn };
  const notBankableRec: FryerRecord = { ms: 501, bits: 3, attempts: 5, nonce: 0n };
  const records: FryerRecord[] = [bankableRec, notBankableRec];

  const taken1 = takeChip(records, 0, 999);
  check(
    'takeChip returns the chip when it is bankable',
    taken1.taken !== null && taken1.taken.nonce === 0xdeadbeefn && taken1.taken.bits === 10 && taken1.taken.ms === 500,
    taken1.taken
  );
  check(
    'takeChip leaves a fresh, non-bankable placeholder at the new ms',
    taken1.records[0].ms === 999 && taken1.records[0].bits === -1
  );
  check(
    'takeChip does not touch the other fryer',
    taken1.records[1].ms === 501 && taken1.records[1].bits === 3
  );
  check('the original records array passed in is not mutated', records[0].ms === 500 && records[0].bits === 10);

  const taken2 = takeChip(taken1.records, 0, 1000);
  check('a second takeChip on the just-taken fryer returns null (it is now a fresh placeholder)', taken2.taken === null);
  check('a no-op takeChip still returns a records array (safe to apply unconditionally)', taken2.records[0].ms === 999 && taken2.records[0].bits === -1);

  const takenLow = takeChip(records, 1, 777);
  check('takeChip refuses a sub-BANK_MIN_BITS chip', takenLow.taken === null);
  check('a refused takeChip leaves the original chip in place', takenLow.records[1].ms === 501 && takenLow.records[1].bits === 3);

  const takenOob = takeChip(records, 9, 1);
  check('takeChip on an out-of-range index returns null rather than throwing', takenOob.taken === null);
}

// 6) grindLoop — the reporting cadence, and THE SCHEDULING FACT that decides
// how useFryers.ts has to stop a fryer.
{
  // 6a) A grind never returns to the macrotask queue.
  //
  // This is the whole reason `bank()` terminates its worker instead of posting
  // it a new `start`. The fake hash below resolves the way a warm hash-wasm
  // Argon2id call does — in a microtask, with no I/O — and a microtask chain is
  // drained to empty before the event loop runs again. So a timer scheduled
  // BEFORE the grind started still has not fired when it ends, which in a
  // Worker means an incoming `message` is never delivered and `isCurrent()`
  // can never flip from outside. Reusing a running worker cannot work, and the
  // symptom when it is tried is a basket frozen at `bits: -1` forever.
  let macrotaskRan = false;
  setTimeout(() => { macrotaskRan = true; }, 0);
  let calls = 0;
  let current = true;
  await grindLoop(1, {
    hash: async () => { if (++calls >= 40) current = false; return new Uint8Array([0xff]); },
    post: () => { /* ignored here */ },
    isCurrent: () => current,
  });
  check('a grind ran 40 hashes', calls === 40, calls);
  check(
    'a grind never yields to the macrotask queue (so a running worker cannot be messaged)',
    macrotaskRan === false
  );
}

{
  // 6b) Reporting cadence: `crisper` only on a real improvement, `progress`
  // every 16 attempts, every message stamped with THIS chip's ms.
  const posts: CrunchRes[] = [];
  let n = 0;
  await grindLoop(77, {
    // 0xff -> 0 leading zero bits; 0x0f -> 4. The one good hash lands on the
    // 5th attempt, where nonce is 4n.
    hash: async () => { n++; return new Uint8Array([n === 5 ? 0x0f : 0xff]); },
    post: (m) => posts.push(m),
    // 33, not 32: the post-hash `isCurrent()` recheck is what drops a
    // superseded result, so the attempt that flips this to false is correctly
    // never reported. Stopping at exactly 32 would silently swallow the second
    // progress message this test exists to see.
    isCurrent: () => n < 33,
  });

  const crispers = posts.filter((p) => p.type === 'crisper');
  const progress = posts.filter((p) => p.type === 'progress');
  check('every message carries this chip\'s ms', posts.every((p) => p.ms === 77), posts.map((p) => p.ms));
  check('the first hash always reports (it beats the -1 sentinel)',
    crispers[0]?.type === 'crisper' && crispers[0].bits === 0 && crispers[0].attempts === 1, crispers[0]);
  check('an improvement reports its bits, attempt and nonce',
    crispers[1]?.type === 'crisper' && crispers[1].bits === 4 && crispers[1].attempts === 5 && crispers[1].nonce === '4',
    crispers[1]);
  check('no crisper is posted for a hash that does not beat the best', crispers.length === 2, crispers.length);
  check('progress is posted every 16 attempts, carrying the best so far',
    progress.length === 2 && progress.every((p) => p.type === 'progress' && p.bits === 4)
    && progress.map((p) => p.attempts).join() === '16,32',
    progress);
  check('a grind that is stopped does not report exhaustion', !posts.some((p) => p.type === 'exhausted'));
}

{
  // 6c) Superseded WHILE awaiting its hash: the result is dropped, not posted.
  // Without this a rebanked fryer would report a `crisper` for the chip that
  // just left the basket, stamped with the retired chip's ms.
  const posts: CrunchRes[] = [];
  let current = true;
  await grindLoop(9, {
    hash: async () => { current = false; return new Uint8Array([0x00, 0x00]); },
    post: (m) => posts.push(m),
    isCurrent: () => current,
  });
  check('a grind superseded mid-hash posts nothing at all', posts.length === 0, posts);
}

/* ── respawning a fryer whose worker died ──────────────────────────────────
 *
 * HONEST SCOPE. The bug these back — a Worker whose module script never loads
 * fires one `error` and then goes silent for ever, leaving the basket at
 * `bits: -1, attempts: 0` until the page is reloaded — is NOT reproducible
 * here. It needs a real Worker and a real failed fetch; it was reproduced and
 * the fix verified in a live browser instead (see
 * .superpowers/sdd/2026-07-25-chips-batched-banking/fryer-freeze-report.md).
 * What IS pure logic, and is tested below, is the two decisions the respawn
 * path makes: which record the replacement fryer gets, and how long to wait.
 */
{
  // 7) restartRecord: a fresh placeholder at a NEW ms, nothing else touched.
  const records: FryerRecord[] = [
    { ms: 10, bits: 11, attempts: 900, nonce: 5n },
    { ms: 20, bits: 4, attempts: 30, nonce: 7n },
  ];
  const out = restartRecord(records, 1, 99);
  check('restartRecord replaces the named fryer with a placeholder at the new ms',
    out !== null && out[1].ms === 99 && out[1].bits === -1 && out[1].attempts === 0 && out[1].nonce === 0n, out?.[1]);
  check('restartRecord leaves every other fryer alone',
    out !== null && out[0].ms === 10 && out[0].bits === 11 && out[0].attempts === 900, out?.[0]);
  check('restartRecord does not mutate the input',
    records[1].ms === 20 && records[1].bits === 4, records[1]);
  // The ms MUST change. Reusing the dead worker's ms would let the replacement
  // — which walks nonces from 0 again — post a `crisper` at ~0 bits that
  // applyFryerMessage writes straight in, silently downgrading a good chip.
  const reused = restartRecord(records, 0, 10);
  const downgraded = reused && applyFryerMessage(reused, 0, { type: 'crisper', ms: 10, bits: 0, nonce: '0', attempts: 1 });
  check('reusing the dead chip\'s ms is exactly what would downgrade the basket',
    downgraded !== null && downgraded !== undefined && downgraded[0].bits === 0, downgraded?.[0]);
  const fresh = restartRecord(records, 0, 11);
  const ignored = fresh && applyFryerMessage(fresh, 0, { type: 'crisper', ms: 10, bits: 0, nonce: '0', attempts: 1 });
  check('a new ms makes the dead worker\'s in-flight messages inert', ignored === null, ignored);
  check('restartRecord returns null for a fryer this basket no longer has',
    restartRecord(records, 5, 99) === null);
  check('restartRecord returns null on an emptied basket', restartRecord([], 0, 99) === null);
}

{
  // 8) nextRetryDelay: 1s, doubling, capped — never 0 (a 0 would respawn a
  // failing worker on the next tick, i.e. a Worker per frame against a build
  // that is genuinely broken).
  check('the first retry waits a second', nextRetryDelay(0) === 1000);
  check('retries double', nextRetryDelay(1000) === 2000 && nextRetryDelay(2000) === 4000);
  check('retries cap at 30s', nextRetryDelay(16_000) === 30_000 && nextRetryDelay(30_000) === 30_000);
  check('a nonsense previous delay still yields a real wait',
    nextRetryDelay(-5) === 1000 && nextRetryDelay(NaN) === 1000);
  let d = 0;
  for (let i = 0; i < 50; i++) { d = nextRetryDelay(d); check_ge(d); }
  function check_ge(v: number) { if (v < 1000 || v > 30_000) { failures++; console.log(`FAIL  retry delay out of range ${v}`); } }
  check('50 consecutive failures stay inside [1s, 30s]', d === 30_000, d);
}

/* ── planResize: a count change must not confiscate the player's work ────── */
{
  // A basket mid-grind. `mid` and `deep` are the chips a fryer purchase used to
  // destroy: real Argon2id seconds, unrecoverable once their worker is
  // terminated.
  const deep: FryerRecord = { ms: 101, bits: 12, attempts: 4352, nonce: 0xabcn };
  const mid: FryerRecord = { ms: 102, bits: 9, attempts: 480, nonce: 0x7n };
  const basket: FryerRecord[] = [deep, mid];
  const alloc = (start: number) => { let n = start; return () => ++n; };

  // 9a) GROWING preserves what is already frying, by identity.
  {
    let draws = 0;
    const a = alloc(900);
    const grown = planResize(basket, 3, () => { draws++; return a(); });
    check('growing keeps every existing fryer\'s record BY IDENTITY (not a copy)',
      grown.records[0] === deep && grown.records[1] === mid,
      grown.records.slice(0, 2));
    check('growing stops nothing at all', grown.stopped.length === 0, grown.stopped);
    check('growing starts only the new slot', grown.started.length === 1 && grown.started[0].index === 2, grown.started);
    check('the new slot is a fresh placeholder at the allocated ms',
      grown.records[2].bits === -1 && grown.records[2].attempts === 0 && grown.records[2].ms === grown.started[0].ms,
      grown.records[2]);
    check('growing by one draws exactly one ms', draws === 1, draws);
    check('growing does not mutate the input',
      basket.length === 2 && basket[0] === deep && basket[1] === mid);
  }

  // 9b) SHRINKING drops only the removed tail.
  {
    let draws = 0;
    const shrunk = planResize(basket, 1, () => { draws++; return 0; });
    check('shrinking keeps the surviving fryer\'s record BY IDENTITY', shrunk.records[0] === deep, shrunk.records[0]);
    check('shrinking drops exactly the removed tail', shrunk.records.length === 1, shrunk.records.length);
    check('shrinking reports exactly the removed indices', shrunk.stopped.join() === '1', shrunk.stopped);
    check('shrinking starts nothing and draws no ms', shrunk.started.length === 0 && draws === 0);
  }

  // 9c) An UNCHANGED count is a true no-op. Load-bearing: the resize effect runs
  // on StrictMode's double-invoke and on every identity/table rebuild, so a
  // "same size" call that drew an ms or restarted a slot would still confiscate
  // the very chips this function exists to protect.
  {
    let draws = 0;
    const same = planResize(basket, 2, () => { draws++; return 0; });
    check('an unchanged count starts nothing, stops nothing, draws no ms',
      same.started.length === 0 && same.stopped.length === 0 && draws === 0);
    check('an unchanged count leaves every record identical',
      same.records[0] === deep && same.records[1] === mid);
  }

  // 9d) A rebuild (identity/table change) — useFryers clears its records first,
  // so every slot is new. This is how "a different table restarts everything"
  // reaches this function.
  {
    const a = alloc(500);
    const fresh = planResize([], 3, a);
    check('from an emptied basket every fryer is started', fresh.started.map((s) => s.index).join() === '0,1,2', fresh.started);
    check('from an emptied basket nothing is stopped (the cleanup already did)', fresh.stopped.length === 0);
    check('a rebuilt basket carries no record from the old game',
      fresh.records.length === 3 && fresh.records.every((r) => r.bits === -1 && r.attempts === 0 && r.nonce === 0n),
      fresh.records);
    check('every rebuilt slot gets its own distinct ms',
      new Set(fresh.records.map((r) => r.ms)).size === 3, fresh.records.map((r) => r.ms));
  }

  // 9e) Teardown and nonsense counts.
  {
    const gone = planResize(basket, 0, () => 0);
    check('a count of zero stops every fryer', gone.stopped.join() === '0,1' && gone.records.length === 0, gone);
    const neg = planResize(basket, -3, () => 0);
    check('a negative count is treated as zero, not as a crash', neg.stopped.join() === '0,1' && neg.records.length === 0, neg);
    const nan = planResize(basket, NaN, () => 0);
    check('a NaN count is treated as zero', nan.records.length === 0 && nan.stopped.join() === '0,1', nan);
  }

  // 9f) The property that actually matters, stated end-to-end: a fryer purchase
  // (grow), then the fold's ack/refresh flicker (shrink then grow again), must
  // leave basket 0's deep chip untouched throughout.
  {
    const a = alloc(700);
    const afterBuy = planResize(basket, 3, a);
    const afterBlipDown = planResize(afterBuy.records, 2, a);
    const afterBlipUp = planResize(afterBlipDown.records, 3, a);
    check('a buy plus a fold flicker never touches the chip already frying',
      afterBuy.records[0] === deep && afterBlipDown.records[0] === deep && afterBlipUp.records[0] === deep);
    check('...nor the second basket, which the flicker does not reach',
      afterBlipUp.records[1] === mid, afterBlipUp.records[1]);
    check('...and only the slot the flicker actually removed is ever stopped',
      afterBuy.stopped.length === 0 && afterBlipDown.stopped.join() === '2' && afterBlipUp.stopped.length === 0);
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
