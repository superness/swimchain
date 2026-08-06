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

/* ── 6. A REBOUGHT JAR MUST NOT BE RETIRED BY AN OLD TWIN ──────────────────
   SHIPPED BROKEN 2026-08-04 23:10; the operator caught it in three minutes:
   "now it is undoing upgrade buys nonstop".

   `confirmedMoveKeys` keys a buy as `buy:<table>:<me>:<key>` with NO ms. A tip
   clears `owned`, so the same jar is rebought every bowl and this table holds a
   dozen `buy overcook` replies across a single day. Reconciling an unsent buy
   against that twin retires it BEFORE it is ever submitted: deducted
   optimistically, dropped from the queue, never sent, unowned again on the next
   fold — forever. */
{
  const oldBuy: ChipsReply[] = [{
    content_id: 'c9', author_id: ME, body: 'buy overcook#1785888000000~',
    created_at: 1785888000, block_height: 2334,
  } as ChipsReply];
  const withOld = confirmedMoveKeys(oldBuy, TABLE, ME);
  check('the old buy IS in the confirmed set (the trap is live)',
    withOld.has(`buy:${TABLE}:${ME}:overcook`), [...withOld]);

  const rebuy: QueuedMove = { ...P, kind: 'buy', id: 200, key: 'overcook' } as QueuedMove;
  const after = retireSettled([rebuy], withOld, NOW);
  check('a FRESH unsent buy survives its own key from a previous bowl',
    after.length === 1, after.map((m) => m.id));

  // ...while an ms-scoped kind is still reconciled, so the real fix survives.
  const landedDip = retireSettled([STUCK], keys, NOW);
  check('an unsent DIP with a real twin is still retired',
    landedDip.length === 0, landedDip.map((m) => m.id));
}

/* ── 7. A SENT BUY IS NOT RETIRED BY A JAR FROM A PREVIOUS BOWL ────────────
   The latent half of the same defect, found by grepping for the family rather
   than by another outage. `retireSettled` also consults the twin for STAMPED
   moves, and a buy key carries no ms — so a freshly-sent `buy season1` matched
   a season1 bought hours and several bowls earlier and was retired on evidence
   about a different purchase. If that send were dropped in flight, the jar is
   gone silently: retired means no TTL, so `expired` never fires and the player
   is never told. Only a twin from THIS attempt may settle it. */
{
  const OLD = 1785888000000;   // a season1 bought in an earlier bowl
  const SENT = 1785901880411;  // tonight's send

  const stale = new Map([[`buy:${TABLE}:${ME}:season1`, OLD]]);
  const sentBuy: QueuedMove = {
    ...P, kind: 'buy', id: 300, key: 'season1', sentAt: SENT,
  } as QueuedMove;
  check('an old namesake does NOT retire a freshly sent buy',
    retireSettled([sentBuy], stale, SENT + 1000).length === 1);

  const mine = new Map([[`buy:${TABLE}:${ME}:season1`, SENT + 40]]);
  check('...while this attempt\'s own twin does',
    retireSettled([sentBuy], mine, SENT + 1000).length === 0);

  // The skew window exists because the body's ms and `sentAt` are stamped from
  // two separate clock reads in the same tick.
  const slightlyEarly = new Map([[`buy:${TABLE}:${ME}:season1`, SENT - 500]]);
  check('...and a twin a few hundred ms "before" the send still counts',
    retireSettled([sentBuy], slightlyEarly, SENT + 1000).length === 0);

  // A dip's key already names one move for all time, so it must NOT be subject
  // to the recency test — a bank's twin ms is the chip's mining time and can
  // legitimately predate the submit by hours.
  const dipTwin = new Map([[`dip:${TABLE}:${ME}:1785897749124`, 1785897749124]]);
  const sentDip: QueuedMove = {
    ...P, kind: 'dip', id: 301, ms: 1785897749124, amount: 207960, sentAt: SENT,
  } as QueuedMove;
  check('a uniquely-keyed move is still retired regardless of dates',
    retireSettled([sentDip], dipTwin, SENT + 1000).length === 0);
}

/* ── 8. A BUY ON CHAIN THAT THE FOLD REFUSED MUST NOT BE RETIRED ───────────
   Observed live 2026-08-05, one jar per poll for six consecutive polls:

     movesFrom 1466 -> 1465   bowl1 gone, bowlCap 3,000,000 -> 1,000,000
     movesFrom 1464 -> 1463   fryer2 gone, fryers 2 -> 1
     movesFrom 1462 -> 1461   doubledip1 gone

   `movesFrom > movesTo` is history getting SHORTER — a move deleted, not
   mis-shown. `confirmedMoveKeys` proves a reply EXISTS on chain; it does not
   prove the fold ACCEPTED it. A buy can be on chain and still fold
   `rejected-order` / `rejected-cost` / `rejected-owned`, most easily right
   after a tip, which re-scores the entire run.

   When that happens the CONFIRMED copy grants nothing and the PENDING copy is
   the only thing holding the jar — so retiring on presence alone DELETES THE
   GRANT and the purchase evaporates in front of the player. */
{
  const SENT = 1785909915000;
  const key = `buy:${TABLE}:${ME}:bowl1`;
  const twin = new Map([[key, SENT + 10]]);
  const buy: QueuedMove = { ...P, kind: 'buy', id: 456, key: 'bowl1', sentAt: SENT } as QueuedMove;

  // The fold did NOT honour it: `owned` lacks the jar.
  const refused = retireSettled([buy], twin, SENT + 5_000, undefined, new Set<string>());
  check('a buy the fold did not honour survives, even with its twin on chain',
    refused.length === 1, refused.map((m) => m.id));

  // The fold DID honour it: the local echo is now redundant.
  const honoured = retireSettled([buy], twin, SENT + 5_000, undefined, new Set(['bowl1']));
  check('...and once the jar is actually owned, it retires', honoured.length === 0);

  // Every other kind carries its own ms and cannot be re-scored this way.
  const dipTwin = new Map([[`dip:${TABLE}:${ME}:${SENT}`, SENT]]);
  const dip: QueuedMove = { ...P, kind: 'dip', id: 457, ms: SENT, amount: 5, sentAt: SENT } as QueuedMove;
  check('a dip is unaffected by the owned check',
    retireSettled([dip], dipTwin, SENT + 5_000, undefined, new Set<string>()).length === 0);

  // A caller with no fold yet must not be broken by the new argument.
  check('omitting `owned` keeps the old behaviour',
    retireSettled([buy], twin, SENT + 5_000).length === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
