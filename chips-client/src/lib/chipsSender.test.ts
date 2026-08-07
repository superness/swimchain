/**
 * The sender's pure decisions: `planSend` (what to submit next) and
 * `afterSubmit` (what the queue becomes once a submission succeeds).
 * Run: npx tsx src/lib/chipsSender.test.ts
 */
import { planSend, afterSubmit } from './chipsSender';
import { enqueue, activeFor, takeBatch, type QueuedMove } from './chipsQueue';
import { bankBatchBody } from './chipsBody';
import { MAX_BATCH, MAX_BITS } from './chipsConst';
import type { ChipEntry } from './chipsEngine';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
}

const TABLE = 'sha256:table-a';
const OTHER_TABLE = 'sha256:table-b';
const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const chip = (n: number) => ({ ms: 1_000_000 + n, bits: 10, nonce: BigInt(n) });
let nextId = 1;
const bankMove = (tableId: string, author: string) => ({ tableId, author, kind: 'bank' as const, chip: chip(nextId) });
const buyMove = (tableId: string, author: string, key: string) => ({ tableId, author, kind: 'buy' as const, key, ms: 1_500_000 + nextId });

// 1) A stale entry (wrong table, wrong author, or both) is never submitted —
//    `planSend` must filter through `activeFor` BEFORE `takeBatch`, or a
//    stale entry either gets batched into a real submission (spending a real
//    action PoW on a proof the target table's fold will reject as
//    `rejected-bits`) or blocks a live entry behind it forever.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(OTHER_TABLE, ME), nextId++);
  q = enqueue(q, bankMove(TABLE, OTHER), nextId++);
  const plan = planSend(q, TABLE, ME, 1_700_000_000_000);
  check('a queue containing ONLY stale entries plans nothing', plan === null, plan && { kind: plan.kind, ids: plan.moves.map((m) => m.id) });
}

// 2) A stale entry sitting AHEAD of live ones in the raw queue does not block
//    or pollute the batch — the live entries behind it still go out, and the
//    stale one is not among them.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(OTHER_TABLE, ME), nextId++);   // stale, first in queue order
  const liveIds = [nextId, nextId + 1];
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  const plan = planSend(q, TABLE, ME, 1_700_000_000_000)!;
  check('the stale entry ahead of live ones is excluded from the batch',
    plan !== null && plan.moves.length === 2 && plan.moves.every((m) => liveIds.includes(m.id)),
    plan?.moves.map((m) => m.id));
  check('the planned body is non-empty and well-formed', typeof plan.body === 'string' && plan.body.length > 0, plan.body);
}

// 3) Ordinary wiring sanity: respects MAX_BATCH and the buy-never-batches
//    rule via the underlying `takeBatch` — this is a thin wiring check (the
//    grouping rules themselves are chipsQueue.test.ts's job), just confirming
//    `planSend` doesn't bypass them.
{
  let q: QueuedMove[] = [];
  for (let i = 0; i < MAX_BATCH + 3; i++) q = enqueue(q, bankMove(TABLE, ME), nextId++);
  const plan = planSend(q, TABLE, ME, 1_700_000_000_000)!;
  check('planSend respects MAX_BATCH', plan.moves.length === MAX_BATCH, plan.moves.length);
  check('planSend reports the batch kind', plan.kind === 'bank');
}
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  q = enqueue(q, buyMove(TABLE, ME, 'season1'), nextId++);
  const plan = planSend(q, TABLE, ME, 1_700_000_000_000)!;
  check('a buy never gets batched with the bank ahead of it', plan.kind === 'bank' && plan.moves.length === 1, plan);
}

// 4) `afterSubmit`: THE pinned property from the fix — a submission that
//    resolves while `cancelled` is true still acks. Before that fix, the
//    effect's own `if (cancelled) return` sat BEFORE the ack, so a move
//    enqueued while a submit was in flight would suppress the ack of the
//    batch that had ALREADY landed — the sender would then resubmit an
//    already-confirmed batch on its next run, forever, under continuous play.
//
//    The ack now MARKS rather than deletes (settling moves — chipsSettling.ts),
//    so "acked" is asserted as what it has always MEANT operationally: the
//    entry is no longer submittable. Asserting mere absence would have quietly
//    stopped testing that once the representation changed.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  const taken = [q[0]];
  const AT = 1_700_000_000_000;

  const cancelledResult = afterSubmit(q, taken, true, AT);
  const ackedC = cancelledResult.queue.find((m) => m.id === taken[0].id);
  check('a successful submit acks EVEN when cancelled is true (the entry is marked sent)',
    ackedC !== undefined && ackedC.sentAt === AT, ackedC && { id: ackedC.id, sentAt: ackedC.sentAt });
  check('an acked entry is no longer submittable — the sender plans the NEXT one instead',
    planSend(cancelledResult.queue, TABLE, ME, AT)?.moves.map((m) => m.id).join() === String(q[1].id),
    planSend(cancelledResult.queue, TABLE, ME, AT)?.moves.map((m) => m.id));
  check('cancelled suppresses ONLY the refresh, not the ack',
    cancelledResult.shouldRefresh === false, cancelledResult.shouldRefresh);
  check('the untaken entry survives, still unsent',
    cancelledResult.queue.find((m) => m.id === q[1].id)?.sentAt === undefined,
    cancelledResult.queue.map((m) => ({ id: m.id, sentAt: m.sentAt })));

  const normalResult = afterSubmit(q, taken, false, AT);
  check('an uncancelled successful submit also acks',
    normalResult.queue.find((m) => m.id === taken[0].id)?.sentAt === AT,
    normalResult.queue.map((m) => ({ id: m.id, sentAt: m.sentAt })));
  check('an uncancelled successful submit requests a refresh',
    normalResult.shouldRefresh === true, normalResult.shouldRefresh);

  // A whole batch of acked entries plans nothing at all — the "resubmits
  // forever" regression in its most direct form.
  const allAcked = afterSubmit(q, [q[0], q[1]], false, AT).queue;
  check('a queue of ONLY settling entries plans nothing', planSend(allAcked, TABLE, ME, AT) === null,
    planSend(allAcked, TABLE, ME, AT)?.moves.map((m) => m.id));
}

// 5) A corrupt persisted row that survives `loadQueue`'s validation must not
//    be able to strand the sender. `loadQueue` range-checks neither `bits`
//    nor `nonce`, so a hand-edited or corrupted row (`bits` above `MAX_BITS`,
//    say) can reach here looking well-formed. `bankBatchBody` — which
//    `planSend` calls to build the real submission body — asserts and
//    throws on exactly that. Before this fix, `planSend` was called OUTSIDE
//    the sender effect's `try`/`finally` in App.tsx, so that throw escaped as
//    an unhandled rejection and stranded the single-flight lock at `true`
//    PERMANENTLY: no notice, no backoff, no further submission for the rest
//    of the session, reproducing on every reload. `planSend` itself must
//    never throw — it filters an unsubmittable entry out instead, the same
//    treatment `withPending` (chipsPending.ts) already gives one.
//    Mutation check: this is proven below by constructing `planSend` WITHOUT
//    its per-entry `submittable` filter (i.e. calling `takeBatch` on the raw
//    `activeFor` result, unfiltered — exactly what `planSend` did before this
//    fix) and confirming it actually throws where the real, fixed `planSend`
//    does not.
{
  const corruptMove = bankMove(TABLE, ME);
  corruptMove.chip.bits = MAX_BITS + 5; // out of range — bankBatchBody rejects this
  const corruptId = nextId++;
  let q: QueuedMove[] = [];
  q = enqueue(q, corruptMove, corruptId);

  let threw = false;
  let plan: ReturnType<typeof planSend> = null;
  try {
    plan = planSend(q, TABLE, ME, 1_700_000_000_000);
  } catch {
    threw = true;
  }
  check('planSend never throws on a corrupt-but-well-formed-looking row', !threw);
  check('a queue containing ONLY a corrupt row plans nothing (not a crash)', plan === null, plan);

  // The unfiltered shape of the bug this replaced: taking straight from
  // `activeFor` (skipping `planSend`'s per-entry `submittable` filter) DOES
  // throw on the same input — proving the filter is load-bearing, not
  // incidental, and reproducing exactly what escaped as an unhandled
  // rejection when `planSend`'s call sat outside App.tsx's `try`.
  let unfilteredThrew = false;
  try {
    const take = takeBatch(activeFor(q, TABLE, ME));
    if (take?.kind === 'bank') bankBatchBody(take.moves.map((m) => (m as { chip: ChipEntry }).chip), 1_700_000_000_000);
  } catch {
    unfilteredThrew = true;
  }
  check('...confirmed: the UNFILTERED path (pre-fix shape) does throw on the same corrupt row', unfilteredThrew);

  // A corrupt row sitting next to a GOOD one must not take the good one down
  // with it — the good one still plans and submits normally.
  let q2: QueuedMove[] = [];
  q2 = enqueue(q2, corruptMove, corruptId);
  const goodId = nextId++;
  q2 = enqueue(q2, bankMove(TABLE, ME), goodId);
  let plan2: ReturnType<typeof planSend> = null;
  let threw2 = false;
  try {
    plan2 = planSend(q2, TABLE, ME, 1_700_000_000_000);
  } catch {
    threw2 = true;
  }
  check('a good row next to a corrupt one still plans, without throwing', !threw2 && plan2 !== null && plan2.moves.length === 1);
  check('the corrupt row itself is excluded from that plan', plan2 !== null && plan2.moves[0].id === goodId, plan2?.moves.map((m) => m.id));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
