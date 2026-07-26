/** The queue's ordering rules. Run: npx tsx src/lib/chipsQueue.test.ts */
import { enqueue, takeBatch, activeFor, nextIdAfter, type QueuedMove } from './chipsQueue';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
}

const TABLE = 'sha256:table-a';
const ME = 'aaaa';

const chip = (n: number) => ({ ms: 1_000_000 + n, bits: 10, nonce: BigInt(n) });
const bankMove = (n: number, tableId = TABLE, author = ME) => ({ tableId, author, kind: 'bank' as const, chip: chip(n) });
const buyMove = (key: string, tableId = TABLE, author = ME) => ({ tableId, author, kind: 'buy' as const, key });

/** Test-only scaffolding: drop moves BY ID, the way a real caller would once
 *  it no longer needs them staged (production never does this anymore —
 *  `markSent` marks rather than drops, chipsQueue.ts's `sentAt` doc — but
 *  these tests are exercising `takeBatch`'s GROUPING across several calls, not
 *  the marking/retirement machinery, so a minimal local drop is all the
 *  scaffolding needs). Not exported from chipsQueue.ts: nothing in production
 *  drops by id anymore. */
function dropTaken(q: QueuedMove[], taken: QueuedMove[]): QueuedMove[] {
  const gone = new Set(taken.map((m) => m.id));
  return q.filter((m) => !gone.has(m.id));
}

// 1) A lone chip goes out alone — an idle player waits for nothing.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  const t = takeBatch(q);
  check('single chip taken', t?.moves.length === 1, t?.moves.length);
  check('taken as a bank', t?.kind === 'bank');
}

// 2) Banks batch up to MAX_BATCH, never beyond.
{
  let q: QueuedMove[] = [];
  for (let i = 0; i < MAX_BATCH + 5; i++) q = enqueue(q, bankMove(i), i + 1);
  const t = takeBatch(q)!;
  check('batch capped at MAX_BATCH', t.moves.length === MAX_BATCH, t.moves.length);
  const rest = dropTaken(q, t.moves);
  check('remainder stays queued', rest.length === 5, rest.length);
}

// 3) A buy is NEVER batched with banks, and never overtakes them. This is what
//    stops an upgrade folding as rejected-cost because its funding chips have
//    not landed yet.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  q = enqueue(q, buyMove('season1'), 2);
  q = enqueue(q, bankMove(2), 3);

  const first = takeBatch(q)!;
  check('banks before the buy go first', first.kind === 'bank' && first.moves.length === 1, first.moves.length);

  const afterBanks = dropTaken(q, first.moves);
  const second = takeBatch(afterBanks)!;
  check('then the buy, alone', second.kind === 'buy' && second.moves.length === 1);

  const afterBuy = dropTaken(afterBanks, second.moves);
  const third = takeBatch(afterBuy)!;
  check('then the later bank', third.kind === 'bank' && third.moves.length === 1);
}

// 4) Batching stops at the first buy — it must not reach past it for more banks.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  q = enqueue(q, buyMove('season1'), 2);
  for (let i = 2; i < 6; i++) q = enqueue(q, bankMove(i), i + 1);
  const t = takeBatch(q)!;
  check('batch stops at the buy', t.moves.length === 1, t.moves.length);
}

// 5) Empty queue takes nothing.
check('empty takes null', takeBatch([]) === null);

// 6) `activeFor` is the provenance gate — this is the fix for the "stale
//    queue on a new identity/table phantom-credits it" bug. A mismatched
//    tableId AND a mismatched author must each be excluded on their own (not
//    only when both differ at once), and a genuinely matching entry must
//    survive being filtered alongside stale ones from BOTH other tables and
//    other identities.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1, 'sha256:table-a', 'aaaa'), 1);   // matches
  q = enqueue(q, bankMove(2, 'sha256:table-b', 'aaaa'), 2);   // wrong table only
  q = enqueue(q, bankMove(3, 'sha256:table-a', 'bbbb'), 3);   // wrong author only
  q = enqueue(q, bankMove(4, 'sha256:table-b', 'bbbb'), 4);   // wrong on both
  q = enqueue(q, buyMove('season1', 'sha256:table-a', 'aaaa'), 5); // matches

  const active = activeFor(q, 'sha256:table-a', 'aaaa');
  check('activeFor keeps only matching-table, matching-author entries',
    active.length === 2 && active.every((m) => m.id === 1 || m.id === 5),
    active.map((m) => m.id));

  check('activeFor does not mutate the input array (still has all 5)', q.length === 5, q.length);

  // A table match with the WRONG author must still be excluded — the fold
  // has no way to attribute a proof mined by a different identity, even on
  // the same table.
  const wrongAuthorOnly = activeFor(q, 'sha256:table-a', 'zzzz');
  check('a matching table but no matching author yields nothing', wrongAuthorOnly.length === 0, wrongAuthorOnly.length);
}

// 7) `nextIdAfter` must never collide with an id already on a restored queue
//    — that is precisely what would let one `markSent` call stamp two
//    unrelated entries as settled when only one of them actually landed (see
//    the doc comment).
{
  check('empty queue seeds at 1', nextIdAfter([]) === 1, nextIdAfter([]));

  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  q = enqueue(q, bankMove(2), 2);
  q = enqueue(q, bankMove(3), 7); // ids need not be contiguous
  check('seeds strictly above the highest id present, not highest+ordinal',
    nextIdAfter(q) === 8, nextIdAfter(q));

  // The critical property: minting `nextIdAfter(q)` and enqueuing with it
  // can never produce a duplicate id anywhere in the resulting queue.
  const seeded = nextIdAfter(q);
  const q2 = enqueue(q, bankMove(4), seeded);
  const ids = q2.map((m) => m.id);
  check('a freshly minted id never collides with a restored one',
    new Set(ids).size === ids.length, ids);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
