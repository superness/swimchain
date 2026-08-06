/**
 * Settling moves: an acked move keeps crediting until the chain supplies its
 * confirmed twin, or until it expires.
 *
 * Every assertion here is end-to-end over the REAL fold — `withPending` +
 * `foldChips`, the same two calls App.tsx makes — rather than over
 * `retireSettled`'s return value alone. The property that matters to a player
 * is "my crumbs did not flicker", and only the fold can say that; a test that
 * merely counted queue entries would keep passing if the fold started
 * double-crediting.
 *
 * Run: npx tsx src/lib/chipsSettling.test.ts
 */
import {
  SETTLE_TTL_MS, moveKey, confirmedMoveKeys, settlingStillValid, retireSettled,
} from './chipsSettling';
import { enqueue, markSent, unsent, type QueuedMove } from './chipsQueue';
import { planSend, afterSubmit } from './chipsSender';
import { withPending } from './chipsPending';
import { proofKey } from './proofKey';
import { bankBatchBody, buyBody } from './chipsBody';
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { UPGRADES } from './chipsConst';

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
const HEADER: ChipsHeader = { v: 1, kind: 'chips-table', name: 'Test Cook', owner: ME };
const T0 = 1_700_000_000_000;

let nextId = 1;
const chipOf = (n: number) => ({ ms: 1_000_000 + n, bits: 12, nonce: BigInt(n) });

/** Fold a queue exactly the way App.tsx's `foldNow` does. */
function foldWith(confirmed: ChipsReply[], verified: Map<string, number>, q: QueuedMove[]) {
  const merged = withPending(confirmed, verified, q, ME, TABLE);
  return foldChips(HEADER, TABLE, merged.replies, merged.verified);
}

/* ── 1) A settling move credits before its twin arrives ─────────────────── */
{
  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: chipOf(nextId) }, nextId); nextId++;
  const queuedCrumbs = foldWith([], new Map(), q).crumbs;

  // Through the REAL ack (`afterSubmit`), not `markSent` directly — the flicker
  // was a property of what the ack did, so the ack is what has to be exercised.
  // Under the old model this DELETED the entry.
  const settling = afterSubmit(q, q, false, T0).queue;
  const settlingCrumbs = foldWith([], new Map(), settling).crumbs;
  const deletedCrumbs = foldWith([], new Map(), []).crumbs;

  check('a queued bank credits', queuedCrumbs > deletedCrumbs, { queuedCrumbs, deletedCrumbs });
  check('a SETTLING bank still credits, exactly as it did while queued',
    settlingCrumbs === queuedCrumbs, { settlingCrumbs, queuedCrumbs });
  check('...and deleting it instead — the old ack — is what dropped the credit',
    deletedCrumbs < queuedCrumbs, { deletedCrumbs, queuedCrumbs });
}

/* ── 2) It credits EXACTLY ONCE when the twin arrives ───────────────────── */
{
  let q: QueuedMove[] = [];
  const chip = chipOf(nextId);
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip }, nextId); nextId++;
  const settling = markSent(q, q, T0);

  const beforeTwin = foldWith([], new Map(), settling).crumbs;

  // The twin lands: the same chip, now a real reply from the chain.
  const twin: ChipsReply = {
    author_id: ME, body: bankBatchBody([chip], chip.ms), block_height: 7,
    content_id: 'sha256:twin-1', created_at: T0 / 1000,
  };
  const verified = new Map([[proofKey(TABLE, ME, chip.ms, chip.nonce), chip.bits]]);

  // The OVERLAP — both copies folded at once, which is what the ack window
  // really looks like. This is the double-credit risk the whole design rests on
  // not happening.
  const overlap = foldWith([twin], verified, settling).crumbs;
  // And after retirement, the twin alone.
  const keys = confirmedMoveKeys([twin], TABLE, ME);
  const retired = retireSettled(settling, keys, T0 + 1000);
  const afterRetire = foldWith([twin], verified, retired).crumbs;

  check('the confirmed twin retires the settling move', retired.length === 0, retired);
  check('folding BOTH copies at once credits exactly once (rejected-duplicate)',
    overlap === beforeTwin, { overlap, beforeTwin });
  check('...and the credit is unchanged after the settling copy is retired',
    afterRetire === overlap, { afterRetire, overlap });
  check('the player never sees a dip: queued == settling == overlap == confirmed',
    beforeTwin === overlap && overlap === afterRetire, { beforeTwin, overlap, afterRetire });
}

/* ── 3) A settling BUY holds its upgrade, then hands over ───────────────── */
{
  // `season1` (30k) is the head of its chain, so no `rejected-order`, and it
  // sits well inside the starting bowl cap (100k) that everything else here is
  // clamped to.
  const KEY = 'season1';
  const funding: ChipsReply[] = [];
  const fverified = new Map<string, number>();
  for (let i = 0; i < 4; i++) {
    const c = { ms: 2_000_000 + i, bits: 16, nonce: BigInt(i) };
    funding.push({ author_id: ME, body: bankBatchBody([c], c.ms), block_height: 1, content_id: `sha256:f${i}`, created_at: T0 / 1000 });
    // `proofKey` directly, NOT `moveKey`: a fixture built with the function
    // under test would move with it under mutation and hide the failure.
    fverified.set(proofKey(TABLE, ME, c.ms, c.nonce), c.bits);
  }
  const opening = foldWith(funding, fverified, []);
  check('the funding fixture affords the upgrade, and does not already own it',
    opening.crumbs >= UPGRADES[KEY].cost && !opening.owned.has(KEY), opening.crumbs);

  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'buy', key: KEY }, nextId); nextId++;

  const settling = markSent(q, q, T0);
  const settlingState = foldWith(funding, fverified, settling);
  check('a SETTLING buy keeps the upgrade owned', settlingState.owned.has(KEY), [...settlingState.owned]);
  check('...and keeps its cost charged, rather than refunding it mid-flight',
    settlingState.crumbs === opening.crumbs - UPGRADES[KEY].cost,
    { settling: settlingState.crumbs, opening: opening.crumbs, cost: UPGRADES[KEY].cost });

  const twin: ChipsReply = {
    author_id: ME, body: buyBody(KEY, T0), block_height: 9, content_id: 'sha256:buy-twin', created_at: T0 / 1000,
  };
  const overlapState = foldWith([...funding, twin], fverified, settling);
  const keys = confirmedMoveKeys([twin], TABLE, ME);
  const retired = retireSettled(settling, keys, T0 + 1000);
  const afterState = foldWith([...funding, twin], fverified, retired);

  check('the confirmed buy twin retires the settling buy', retired.length === 0, retired);
  check('the upgrade stays owned across the whole handover',
    overlapState.owned.has(KEY) && afterState.owned.has(KEY));
  check('the cost is charged exactly once, not twice (rejected-owned)',
    overlapState.crumbs === afterState.crumbs && afterState.crumbs === settlingState.crumbs,
    { settling: settlingState.crumbs, overlap: overlapState.crumbs, after: afterState.crumbs });
}

/* ── 4) Expiry: it stops crediting once the chain has stayed silent ─────── */
{
  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: chipOf(nextId) }, nextId); nextId++;
  const settling = markSent(q, q, T0);

  const justBefore = retireSettled(settling, new Map(), T0 + SETTLE_TTL_MS - 1);
  const justAfter = retireSettled(settling, new Map(), T0 + SETTLE_TTL_MS);

  check('a settling move still credits one ms before the TTL',
    justBefore.length === 1 && foldWith([], new Map(), justBefore).crumbs > 0, justBefore.length);
  check('it is retired AT the TTL', justAfter.length === 0, justAfter);
  check('and once retired it credits nothing — the display falls back to the chain',
    foldWith([], new Map(), justAfter).crumbs === foldWith([], new Map(), []).crumbs);

  check('the TTL is anchored to a block interval plus two polls, not a round number',
    SETTLE_TTL_MS === 600_000 + 2 * 15_000, SETTLE_TTL_MS);

  // A clock that jumps must not make a settling move immortal.
  check('a sentAt in the far future is treated as expired, not as immortal',
    !settlingStillValid(T0 + SETTLE_TTL_MS + 1, T0), true);
  check('a small forward skew is still tolerated', settlingStillValid(T0 + 5_000, T0));
  check('a non-finite sentAt never validates',
    !settlingStillValid(NaN, T0) && !settlingStillValid(Infinity, T0));
  check('a settling move whose clock jumped backwards is retired',
    retireSettled(settling, new Map(), T0 - SETTLE_TTL_MS - 1).length === 0);
}

/* ── 5) Provenance: a settling move is scoped exactly like a queued one ─── */
{
  const chip = chipOf(nextId);
  let foreign: QueuedMove[] = [];
  foreign = enqueue(foreign, { tableId: OTHER_TABLE, author: ME, kind: 'bank', chip }, nextId); nextId++;
  foreign = enqueue(foreign, { tableId: TABLE, author: OTHER, kind: 'bank', chip: chipOf(nextId) }, nextId); nextId++;
  const settling = markSent(foreign, foreign, T0);

  check('a settling move on a FOREIGN table credits nothing here',
    foldWith([], new Map(), settling).crumbs === foldWith([], new Map(), []).crumbs,
    foldWith([], new Map(), settling).crumbs);
  check('a settling move from a FOREIGN identity credits nothing here',
    foldWith([], new Map(), [settling[1]]).crumbs === foldWith([], new Map(), []).crumbs);
  check('a settling move on a foreign table is never submitted here',
    planSend(settling, TABLE, ME, T0) === null, planSend(settling, TABLE, ME, T0));

  // A confirmed reply on THIS table must not retire a settling move that
  // belongs to another one, even when the chip is byte-identical.
  const twinHere: ChipsReply = {
    author_id: ME, body: bankBatchBody([chip], chip.ms), block_height: 3, content_id: 'sha256:here', created_at: T0 / 1000,
  };
  const keysHere = confirmedMoveKeys([twinHere], TABLE, ME);
  check('a confirmed reply on THIS table cannot retire a move mined for another',
    retireSettled([settling[0]], keysHere, T0 + 1).length === 1, retireSettled([settling[0]], keysHere, T0 + 1));
  check('moveKey folds the table in, so identical chips on two tables differ',
    moveKey(settling[0]) !== moveKey({ ...settling[0], tableId: TABLE }));

  // A stranger posting a look-alike body must not retire the player's move.
  const stranger: ChipsReply = {
    author_id: OTHER, body: bankBatchBody([chip], chip.ms), block_height: 3, content_id: 'sha256:x', created_at: T0 / 1000,
  };
  check('a stranger\'s look-alike reply contributes no retirement keys',
    confirmedMoveKeys([stranger], TABLE, ME).size === 0, [...confirmedMoveKeys([stranger], TABLE, ME)]);
}

/* ── 6) The sender never resubmits a settling move ──────────────────────── */
{
  let q: QueuedMove[] = [];
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: chipOf(nextId) }, nextId); nextId++;
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'bank', chip: chipOf(nextId) }, nextId); nextId++;
  q = enqueue(q, { tableId: TABLE, author: ME, kind: 'buy', key: 'season2' }, nextId); nextId++;

  const settled = markSent(q, [q[0]], T0);
  check('unsent() drops the settling entry and keeps the rest in order',
    unsent(settled).map((m) => m.id).join() === [q[1].id, q[2].id].join(), unsent(settled).map((m) => m.id));

  const plan = planSend(settled, TABLE, ME, T0);
  check('the sender plans the next UNSENT move, never the settling one',
    plan !== null && !plan.moves.some((m) => m.id === q[0].id) && plan.moves.some((m) => m.id === q[1].id),
    plan?.moves.map((m) => m.id));
  check('...and strict FIFO is preserved among what remains: banks first, buy not batched with them',
    plan?.kind === 'bank' && !plan.moves.some((m) => m.kind === 'buy'), plan?.moves.map((m) => m.kind));

  const allSettled = markSent(q, q, T0);
  check('a fully settling queue plans nothing at all', planSend(allSettled, TABLE, ME, T0) === null);

  // Retirement must never touch an UNSENT move. An unsent bank is a mined
  // Argon2id proof that has not reached the chain by any route — deleting it
  // destroys the player's CPU outright, which is the one loss the persisted
  // queue exists to prevent. Expiry in particular must not reach it: an unsent
  // move has no `sentAt`, so there is no clock it could be measured against.
  const mixed = markSent(settled, [q[0]], T0);
  const swept = retireSettled(mixed, new Map(), T0 + SETTLE_TTL_MS + 1);
  check('retiring sweeps the expired settling entry and NOTHING else',
    swept.map((m) => m.id).join() === [q[1].id, q[2].id].join(), swept.map((m) => ({ id: m.id, sentAt: m.sentAt })));
  check('the surviving unsent entries are still submittable afterwards',
    planSend(swept, TABLE, ME, T0)?.moves.some((m) => m.id === q[1].id) === true,
    planSend(swept, TABLE, ME, T0)?.moves.map((m) => m.id));
  check('an all-unsent queue is never touched at all, at any clock value',
    retireSettled(q, new Map(), T0 + SETTLE_TTL_MS * 100) === q, q.length);

  // Re-marking must not restart the expiry clock, or a move re-acked on every
  // sender pass would never expire.
  const reMarked = markSent(allSettled, q, T0 + 500_000);
  check('re-marking a settling move keeps its ORIGINAL sentAt',
    reMarked.every((m) => m.sentAt === T0), reMarked.map((m) => m.sentAt));
  check('markSent returns the SAME array when there is nothing to mark', reMarked === allSettled);
  check('retireSettled returns the SAME array when nothing is retired',
    retireSettled(allSettled, new Map(), T0 + 1) === allSettled);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
