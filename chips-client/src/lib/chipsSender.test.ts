/**
 * The sender's pure decisions: `planSend` (what to submit next) and
 * `afterSubmit` (what the queue becomes once a submission succeeds).
 * Run: npx tsx src/lib/chipsSender.test.ts
 */
import { planSend, afterSubmit } from './chipsSender';
import { enqueue, type QueuedMove } from './chipsQueue';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const TABLE = 'sha256:table-a';
const OTHER_TABLE = 'sha256:table-b';
const ME = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const chip = (n: number) => ({ ms: 1_000_000 + n, bits: 10, nonce: BigInt(n) });
let nextId = 1;
const bankMove = (tableId: string, author: string) => ({ tableId, author, kind: 'bank' as const, chip: chip(nextId) });
const buyMove = (tableId: string, author: string, key: string) => ({ tableId, author, kind: 'buy' as const, key });

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
//    resolves while `cancelled` is true still acks. Before this fix, the
//    effect's own `if (cancelled) return` sat BEFORE the ack, so a move
//    enqueued while a submit was in flight would suppress the ack of the
//    batch that had ALREADY landed — the sender would then resubmit an
//    already-confirmed batch on its next run, forever, under continuous play.
//    Mutation check: gating the ack itself on `!cancelled` (`return cancelled
//    ? { queue, shouldRefresh: false } : { queue: ack(queue, taken), ... }`)
//    makes this FAIL — confirmed by making exactly that edit, observing the
//    failure below, and reverting.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  q = enqueue(q, bankMove(TABLE, ME), nextId++);
  const taken = [q[0]];

  const cancelledResult = afterSubmit(q, taken, true);
  check('a successful submit acks EVEN when cancelled is true',
    !cancelledResult.queue.some((m) => m.id === taken[0].id), cancelledResult.queue.map((m) => m.id));
  check('cancelled suppresses ONLY the refresh, not the ack',
    cancelledResult.shouldRefresh === false, cancelledResult.shouldRefresh);
  check('the untaken entry survives either way',
    cancelledResult.queue.some((m) => m.id === q[1].id), cancelledResult.queue.map((m) => m.id));

  const normalResult = afterSubmit(q, taken, false);
  check('an uncancelled successful submit also acks',
    !normalResult.queue.some((m) => m.id === taken[0].id), normalResult.queue.map((m) => m.id));
  check('an uncancelled successful submit requests a refresh',
    normalResult.shouldRefresh === true, normalResult.shouldRefresh);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
