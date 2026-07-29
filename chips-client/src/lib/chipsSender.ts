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
import { activeFor, takeBatch, unsent, markSent, type QueuedMove } from './chipsQueue';
import { bankBatchBody, buyBody, burnBody, brokeBody, dipBody, tipBody } from './chipsBody';
import type { ChipEntry } from './chipsEngine';

export interface PlannedSend {
  moves: QueuedMove[];
  kind: 'bank' | 'buy' | 'dip' | 'tip' | 'burn' | 'broke';
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
    else if (m.kind === 'dip') dipBody(m.amount, m.ms);
    else if (m.kind === 'tip') tipBody(m.ms);
    else if (m.kind === 'burn') burnBody(m.key, m.ms);
    else if (m.kind === 'broke') brokeBody(m.ms);
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
  // `unsent` FIRST, and it is not optional: a settling entry has already landed
  // on the chain (chipsSettling.ts). It stays in the queue only so the
  // optimistic fold keeps crediting it until the confirmed twin arrives — it is
  // NOT a submission. Resubmitting one spends a real action PoW and a chain
  // write to be folded `rejected-duplicate`, which is precisely the waste the
  // ack was introduced to stop.
  const active = unsent(activeFor(queue, tableId, author)).filter((m) => submittable(m, at));
  const take = takeBatch(active);
  if (!take) return null;
  const body = take.kind === 'bank'
    ? bankBatchBody(take.moves.map((m) => (m as { chip: ChipEntry }).chip), at)
    : take.kind === 'dip'
      ? dipBody((take.moves[0] as { amount: number }).amount, (take.moves[0] as { ms: number }).ms)
      : take.kind === 'tip'
        ? tipBody((take.moves[0] as { ms: number }).ms)
        : take.kind === 'burn'
          ? burnBody((take.moves[0] as { key: string }).key, (take.moves[0] as { ms: number }).ms)
          : take.kind === 'broke'
            ? brokeBody((take.moves[0] as { ms: number }).ms)
            : buyBody((take.moves[0] as { key: string }).key, at);
  return { moves: take.moves, kind: take.kind, body };
}

/**
 * What the queue becomes after a submission SUCCEEDS, and whether the caller
 * should follow up with a network refresh.
 *
 * The ack is unconditional — `cancelled` (a newer attempt superseded this one
 * while it was in flight) suppresses only the refresh, never the ack.
 * Skipping the ack here would leave an already-landed batch submittable; the
 * next sender attempt would then resubmit it. The fold dedupes that (`proofKey`
 * makes the synthetic and confirmed copies the same key, so the second folds
 * `rejected-duplicate`) — nothing is credited twice — but it burns a real
 * action PoW and a chain write every single time, forever, under ordinary
 * continuous play (dip while a submit is in flight -> that submit's cleanup
 * sets `cancelled` -> without this, its ack never runs).
 *
 * The ack now MARKS rather than deletes. That is what the ack has always meant
 * operationally — "stop submitting this" — and marking says exactly that,
 * whereas deleting also said "stop crediting this", which was never intended
 * and is what made a purchase flicker. chipsSettling.ts owns the deletion, once
 * the chain has actually supplied the move (or long since failed to).
 *
 * `at` is supplied by the caller rather than read here, for the same reason
 * `planSend` takes it: this stays pure and deterministic.
 */
export function afterSubmit(
  queue: QueuedMove[], taken: QueuedMove[], cancelled: boolean, at: number
): { queue: QueuedMove[]; shouldRefresh: boolean } {
  return { queue: markSent(queue, taken, at), shouldRefresh: !cancelled };
}
