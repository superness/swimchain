/**
 * The sender's pure decisions.
 *
 * The React effect in App.tsx is glue: it owns the single-flight ref, the
 * network call and the backoff timer. Everything it needs to DECIDE — what to
 * send next, and what the queue looks like after a send settles — is pure and
 * lives here, so the two invariants that matter most (a stale entry is never
 * submitted; a successful submission is never left unacknowledged) are
 * pinned by a unit test rather than only by reading the effect.
 */
import { activeFor, takeBatch, ack, type QueuedMove } from './chipsQueue';
import { bankBatchBody, buyBody } from './chipsBody';
import type { ChipEntry } from './chipsEngine';

export interface PlannedSend {
  moves: QueuedMove[];
  kind: 'bank' | 'buy';
  body: string;
}

/**
 * Whether a single queued entry can ever build a valid body — i.e. whether
 * `withPending` would also accept it (see chipsPending.ts's own per-entry
 * try/catch). `loadQueue` range-checks neither `bits` nor `nonce`, so a
 * corrupt or hand-edited row (`bits: 3`, a nonce with too many hex digits)
 * can survive persistence and reach here; `bankBatchBody`/`buyBody` assert
 * and throw on exactly that. Checked ONE ENTRY AT A TIME, by attempting to
 * build its body alone — `bankBatchBody` validates every chip in whatever
 * array it's given, so this is the same validation the real batch call below
 * will apply, just run early enough to exclude the bad entry instead of
 * failing the whole batch.
 */
function submittable(m: QueuedMove, at: number): boolean {
  try {
    if (m.kind === 'bank') bankBatchBody([m.chip], at);
    else buyBody(m.key, at);
    return true;
  } catch {
    return false;
  }
}

/**
 * What to submit next, or `null` if there is nothing eligible.
 *
 * Filters to `activeFor(queue, tableId, author)` BEFORE calling `takeBatch` —
 * a stale entry (a different table/identity than the one currently in play)
 * must never be batched, let alone submitted: the fold cannot verify it (the
 * Argon2id preimage binds a different table id), so submitting it spends a
 * real action PoW only to land as `rejected-bits`, and the caller's `ack`
 * would then destroy the mined proof for nothing.
 *
 * ALSO filters out entries `submittable` rejects, for the same reason
 * `withPending` skips them from the optimistic display: a corrupt entry the
 * fold could never credit is not worth a real action PoW, and — the more
 * urgent reason — `bankBatchBody`/`buyBody` THROW on one, and letting that
 * throw reach the caller un-filtered previously stranded the whole sender
 * (see the caller's comment). Excluded either way, such an entry is
 * permanently inert: never submitted, never credited, same treatment as a
 * provenance mismatch. It is not pruned from the persisted queue (this
 * function only reads); nothing here can fix a corrupt row, so there is
 * nothing productive to do with it except leave it alone.
 *
 * `at` is supplied by the caller (rather than read here via `Date.now()`) so
 * this stays a pure, deterministic function — the real caller passes the
 * current time, and a test can pass whatever it needs to.
 */
export function planSend(queue: QueuedMove[], tableId: string, author: string, at: number): PlannedSend | null {
  const active = activeFor(queue, tableId, author).filter((m) => submittable(m, at));
  const take = takeBatch(active);
  if (!take) return null;
  const body = take.kind === 'bank'
    ? bankBatchBody(take.moves.map((m) => (m as { chip: ChipEntry }).chip), at)
    : buyBody((take.moves[0] as { key: string }).key, at);
  return { moves: take.moves, kind: take.kind, body };
}

/**
 * What the queue becomes after a submission SUCCEEDS, and whether the caller
 * should follow up with a network refresh.
 *
 * The ack is unconditional — `cancelled` (a newer attempt superseded this one
 * while it was in flight) suppresses only the refresh, never the ack.
 * Skipping the ack here would leave an already-landed batch sitting in the
 * queue; the next sender attempt would then resubmit it. The fold dedupes
 * that (`proofKey` makes the synthetic and confirmed copies the same key, so
 * the second folds `rejected-duplicate`) — nothing is credited twice — but it
 * burns a real action PoW and a chain write every single time, forever,
 * under ordinary continuous play (dip while a submit is in flight -> that
 * submit's cleanup sets `cancelled` -> without this, its ack never runs).
 */
export function afterSubmit(
  queue: QueuedMove[], taken: QueuedMove[], cancelled: boolean
): { queue: QueuedMove[]; shouldRefresh: boolean } {
  return { queue: ack(queue, taken), shouldRefresh: !cancelled };
}
