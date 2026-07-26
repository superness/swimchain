/**
 * `withPending`: provenance, dedupe against confirmed history, and
 * malformed-entry safety. Run: npx tsx src/lib/chipsPending.test.ts
 */
import { withPending } from './chipsPending';
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { proofKey } from './proofKey';
import { CRUMBS_PER_CHIP, BANK_MIN_BITS, MAX_BITS } from './chipsConst';
import type { QueuedMove } from './chipsQueue';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
}

const ME = 'a'.repeat(64);
const TABLE = 'sha256:table-a';
const OTHER_TABLE = 'sha256:table-b';
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'Test Table', owner: ME };

const bankQueued = (id: number, ms: number, bits: number, nonce: bigint, tableId = TABLE, author = ME): QueuedMove =>
  ({ id, tableId, author, kind: 'bank', chip: { ms, bits, nonce } });

// 1) An entry whose tableId does not match the CURRENT table is never
//    credited. This is the exact bug the provenance fields exist to close:
//    a queue is global to the origin, so a leftover entry from a different
//    table must be invisible to a fold over THIS table.
//    Mutation check: replacing `withPending`'s `activeFor(...)` filter with
//    the raw `queue` (i.e. crediting everything regardless of provenance) —
//    the literal shape of the original bug — makes this FAIL (crumbs > 0,
//    one banked move) instead of passing. Confirmed by temporarily doing
//    exactly that edit, observing the failure, and reverting.
{
  const queue: QueuedMove[] = [bankQueued(1, 5_000, 12, 1n, OTHER_TABLE, ME)];
  const merged = withPending([], new Map(), queue, ME, TABLE);
  check('a stale-table entry adds no synthetic reply', merged.replies.length === 0, merged.replies.length);

  const state = foldChips(H, TABLE, merged.replies, merged.verified);
  check('a stale-table entry credits no crumbs', state.crumbs === 0, state.crumbs);
  check('a stale-table entry produces no moves at all', state.moves.length === 0, state.moves.length);
}

// 1b) Same story for a mismatched AUTHOR on the right table — a different
//     identity's leftover queue entry must be equally invisible.
{
  const queue: QueuedMove[] = [bankQueued(1, 5_000, 12, 1n, TABLE, 'b'.repeat(64))];
  const merged = withPending([], new Map(), queue, ME, TABLE);
  const state = foldChips(H, TABLE, merged.replies, merged.verified);
  check('a stale-author entry (right table, wrong identity) credits nothing', state.crumbs === 0, state.crumbs);
}

// 2) A confirmed reply and its still-queued twin credit EXACTLY ONCE. This is
//    the property that makes "no second ledger" actually true: the same chip
//    can legitimately appear both in `confirmed` (it landed) and in the local
//    `queue` (the sender hasn't ack'd it yet, or a reload restored it before
//    the ack ever ran) — `proofKey` makes them collide in the fold's own
//    `seenProofs` set regardless of which copy sorts first.
{
  const ms = 9_000_000;
  const nonce = 42n;
  const bits = 14;
  const confirmed: ChipsReply[] = [{
    author_id: ME, body: `bank ${bits} ${nonce.toString(16)}#${ms}~`,
    block_height: 1, content_id: 'sha256:real', created_at: ms,
  }];
  const verified = new Map([[proofKey(TABLE, ME, ms, nonce), bits]]);
  const queue: QueuedMove[] = [bankQueued(1, ms, bits, nonce)]; // the same chip, still queued

  const merged = withPending(confirmed, verified, queue, ME, TABLE);
  check('withPending appends the synthetic twin alongside the confirmed reply',
    merged.replies.length === 2, merged.replies.length);

  const state = foldChips(H, TABLE, merged.replies, merged.verified);
  const banked = state.moves.filter((m) => m.outcome === 'banked');
  const dup = state.moves.filter((m) => m.outcome === 'rejected-duplicate');
  check('exactly one of the two credits as banked', banked.length === 1, state.moves.map((m) => m.outcome));
  check('the other folds as rejected-duplicate, not a second credit', dup.length === 1, state.moves.map((m) => m.outcome));
  check('crumbs equal ONE payout, not two',
    state.crumbs === CRUMBS_PER_CHIP * 2 ** (bits - BANK_MIN_BITS), state.crumbs);

  // Confirm this holds independent of array order too — `orderReplies` sorts
  // confirmed (real height) before pending (`block_height: null`)
  // unconditionally, so the confirmed copy must win regardless of where the
  // synthetic entry lands in the concatenation.
  const reversed = { replies: [...merged.replies].reverse(), verified: merged.verified };
  const state2 = foldChips(H, TABLE, reversed.replies, reversed.verified);
  check('order-independent: reversing the reply array does not change crumbs',
    state2.crumbs === state.crumbs, { forward: state.crumbs, reversed: state2.crumbs });
}

// 3) A malformed queue entry must not take the fold down with it — the
//    napkin this replaced was written so a parse failure could never crash
//    the game, and `withPending` calling `bankBatchBody` (which asserts and
//    throws on out-of-range input) must not lose that property. A bad entry
//    is skipped from the optimistic display; a GOOD entry in the same queue,
//    right next to it, must still be credited.
{
  const good = bankQueued(1, 1_000, 12, 1n);
  const bad = bankQueued(2, 1_000, MAX_BITS + 5, 2n); // bankBatchBody rejects bits > MAX_BITS
  const queue: QueuedMove[] = [good, bad];

  let threw = false;
  let merged: ReturnType<typeof withPending> | undefined;
  try {
    merged = withPending([], new Map(), queue, ME, TABLE);
  } catch {
    threw = true;
  }
  check('a malformed entry does not throw out of withPending', !threw);
  check('the malformed entry contributes no synthetic reply', merged?.replies.length === 1, merged?.replies.length);

  const state = foldChips(H, TABLE, merged!.replies, merged!.verified);
  check('the well-formed entry next to it still credits',
    state.crumbs === CRUMBS_PER_CHIP * 2 ** (12 - BANK_MIN_BITS), state.crumbs);
}

// 4) Baseline sanity: a single matching, well-formed pending bank credits
//    like a real one would, with the decay clock untouched (pending replies
//    never advance `lastConfirmedAt`).
{
  const queue: QueuedMove[] = [bankQueued(1, 1_000, 10, 5n)];
  const merged = withPending([], new Map(), queue, ME, TABLE);
  const state = foldChips(H, TABLE, merged.replies, merged.verified);
  check('a lone pending bank credits crumbs', state.crumbs === CRUMBS_PER_CHIP * 4, state.crumbs);
  check('a pending-only fold never advances the confirmed clock', state.lastConfirmedAt === 0, state.lastConfirmedAt);
}

// 5) Empty queue is a cheap no-op: returns the SAME confirmed/verified
//    references rather than copying, so a caller polling every render
//    doesn't pay to reconstruct identical data.
{
  const confirmed: ChipsReply[] = [];
  const verified = new Map<string, number>();
  const merged = withPending(confirmed, verified, [], ME, TABLE);
  check('empty queue returns the same replies reference', merged.replies === confirmed);
  check('empty queue returns the same verified reference', merged.verified === verified);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
