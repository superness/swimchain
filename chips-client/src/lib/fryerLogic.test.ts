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
} from './fryerLogic';
import type { FryerRecord } from './fryerLogic';
import type { CrunchRes } from './crunch.worker';
import { bankBody } from './chipsBody';
import { parseMove } from './chipsEngine';
import { BANK_MIN_BITS } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
