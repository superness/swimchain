/** The queue's ordering rules. Run: npx tsx src/lib/chipsQueue.test.ts */
import { enqueue, takeBatch, ack, type QueuedMove } from './chipsQueue';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const chip = (n: number) => ({ ms: 1_000_000 + n, bits: 10, nonce: BigInt(n) });
const bankMove = (n: number) => ({ kind: 'bank' as const, chip: chip(n) });
const buyMove = (key: string) => ({ kind: 'buy' as const, key });

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
  const rest = ack(q, t.moves);
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

  const afterBanks = ack(q, first.moves);
  const second = takeBatch(afterBanks)!;
  check('then the buy, alone', second.kind === 'buy' && second.moves.length === 1);

  const afterBuy = ack(afterBanks, second.moves);
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

// 5) ack removes exactly what was taken, BY IDENTITY — not by position. A
//    positional `slice(taken.length)` would pass a naive "first N" test but
//    delete the wrong entries the moment an ack arrives out of queue order
//    (e.g. a retry that lands the 3rd queued move before the 1st after a
//    network hiccup), silently losing mined chips. So: ack a NON-prefix
//    subset (the 2nd and 4th of five) and check the exact survivors, in
//    order — plus acking an id absent from the queue is a no-op, not a shift.
{
  let q: QueuedMove[] = [];
  for (let i = 0; i < 5; i++) q = enqueue(q, bankMove(i), i + 1);

  const taken = [q[1], q[3]]; // ids 2 and 4 — not a prefix
  const rest = ack(q, taken);
  check('ack removes a non-prefix subset by id', rest.length === 3, rest.map((m) => m.id));
  check('order preserved', rest[0].id === 1 && rest[1].id === 3 && rest[2].id === 5, rest.map((m) => m.id));

  const untouched = ack(q, [{ id: 999, kind: 'buy', key: 'ghost' }]);
  check('acking an id absent from the queue is a no-op', untouched.length === q.length &&
    untouched.every((m, i) => m.id === q[i].id), untouched.map((m) => m.id));
}

// 6) Empty queue takes nothing.
check('empty takes null', takeBatch([]) === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
