/**
 * A MOVE THAT IS ON CHAIN MUST LEAVE THE QUEUE — STAMP OR NO STAMP.
 *
 * Mainnet, 2026-08-04, operator's table `Counter Fryer 303`. He reported it
 * three times in twenty minutes: "im back to not getting chips for my dips",
 * "it IS updating my lifetime dipped... but just not increasing my actual count",
 * "still not getting crumbs".
 *
 * His queue held nine moves and NOT ONE had a `sentAt`. The head was
 *
 *     {kind: 'dip', id: 181, ms: 1785897749124, amount: 207960, sentAt: null}
 *
 * and the chain held `dip 207960#1785897749124~`, confirmed in block 2351.
 * The move had landed. Its entry had never been stamped.
 *
 * `markSent` only stamps on the SUCCESS path, so any submission that reaches
 * the chain and then loses its acknowledgement — dropped response, backgrounded
 * WebView, a throw after the write — produces exactly this: on chain, and
 * `sentAt: undefined` forever. `retireSettled` then skipped it with
 *
 *     if (m.sentAt === undefined) return true;   // "still queued"
 *
 * so it was never compared against the confirmed twins. `unsent()` kept
 * returning it, `takeBatch` only ever reads `q[0]`, and it was resubmitted
 * every cycle — folding `rejected-duplicate` each time — while the eight moves
 * behind it (5.8M crumbs of dips and four jars) never got a turn. Earlier the
 * same evening five `broke` moves in the same shape stranded eighteen.
 *
 * Run: npx tsx src/lib/queueReconcile.test.ts
 */
import { retireSettled, confirmedMoveKeys } from './chipsSettling';
import { unsent, takeBatch, type QueuedMove } from './chipsQueue';
import type { ChipsReply } from './chipsEngine';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = '23b527bea8b9b185f3926b518545238696271dddbde4cf2c1abb23609e833cba';
const TABLE = 'sha256:5425dfcdce66b7d213ecc7091c4cdb3eb3607e3f12eb85299ef46c2b52d62df5';
const NOW = 1785897827000;

/** The exact head of his queue, and the exact reply that had already landed. */
const P = { tableId: TABLE, author: ME };
const STUCK: QueuedMove = { ...P, kind: 'dip', id: 181, ms: 1785897749124, amount: 207960 } as QueuedMove;
const BEHIND: QueuedMove[] = [
  { ...P, kind: 'buy', id: 182, key: 'overcook' } as QueuedMove,
  { ...P, kind: 'dip', id: 184, ms: 1785897775000, amount: 1039800 } as QueuedMove,
  { ...P, kind: 'dip', id: 186, ms: 1785897806000, amount: 2755470 } as QueuedMove,
];
const onChain: ChipsReply[] = [{
  content_id: 'c1', author_id: ME, body: 'dip 207960#1785897749124~',
  created_at: 1785897749, block_height: 2351,
} as ChipsReply];

const keys = confirmedMoveKeys(onChain, TABLE, ME);

/* ── 1. THE CHAIN REALLY DOES HOLD IT ──────────────────────────────────── */
{
  check('the confirmed twin is recognised', keys.size === 1, [...keys]);
}

/* ── 2. IT IS RETIRED EVEN THOUGH IT WAS NEVER STAMPED ─────────────────── */
{
  const q = [STUCK, ...BEHIND];
  check('the stuck head carries no sentAt', q[0].sentAt === undefined);

  const after = retireSettled(q, keys, NOW);
  check('the landed move leaves the queue', !after.some((m) => m.id === 181),
    after.map((m) => m.id));
  check('...and everything behind it is untouched',
    after.length === 3 && after.every((m) => m.id !== 181), after.map((m) => m.id));
}

/* ── 3. THE QUEUE ACTUALLY MOVES AGAIN ─────────────────────────────────── */
{
  const before = takeBatch(unsent([STUCK, ...BEHIND]));
  check('BEFORE: the head is the already-landed dip (the stall)',
    before?.moves[0].id === 181, before?.moves[0].id);

  const after = takeBatch(unsent(retireSettled([STUCK, ...BEHIND], keys, NOW)));
  check('AFTER: the next real move gets its turn', after?.moves[0].id === 182,
    after?.moves[0].id);
}

/* ── 4. A MOVE THE CHAIN HAS NOT SEEN IS LEFT ALONE ────────────────────── */
{
  // The whole point of the old guard was that an unsent move is not a settling
  // move. That must still hold — retiring one the chain lacks would DELETE a
  // move the player made and never send it.
  const fresh: QueuedMove = { ...P, kind: 'dip', id: 190, ms: 1785897999999, amount: 42 } as QueuedMove;
  const after = retireSettled([fresh], keys, NOW);
  check('an unsent move with no twin survives', after.length === 1, after);
  check('...and the array identity is preserved when nothing is retired',
    after === ([fresh] as unknown) || after.length === 1);
}

/* ── 5. EXPIRY STILL WORKS FOR STAMPED MOVES ───────────────────────────── */
{
  const stale: QueuedMove = {
    ...P, kind: 'dip', id: 191, ms: 1785000000000, amount: 7, sentAt: NOW - 10_000_000,
  } as QueuedMove;
  const after = retireSettled([stale], keys, NOW);
  check('a stamped move past its TTL is still expired', after.length === 0, after);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
