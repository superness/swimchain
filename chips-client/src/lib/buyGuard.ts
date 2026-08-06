/**
 * THE IN-FLIGHT BUY GUARD — which jars are already on their way.
 *
 * A buy is in flight from the moment it is enqueued until the fold has either
 * GRANTED the jar (it appears in `owned`) or REJECTED that attempt (the player
 * is free to try again). While it is in flight the shop must not offer it and
 * no gate may let a second copy through: a duplicate costs a real action PoW
 * and a chain write to be folded `rejected-owned`, and it makes a purchase that
 * actually succeeded appear in the report's `rejects` list as a failure.
 *
 * THE ENTRY IS TIMESTAMPED, AND THAT IS THE WHOLE POINT. The rule this
 * replaces scanned the entire move history:
 *
 *     moves.some(m => m.upgradeKey === key && m.outcome.startsWith('rejected'))
 *
 * The operator's table carries `rejected-order season4` from 1:44 PM, 2:11 PM,
 * 4:44 PM and 6:50 PM. So a season4 queued at 11:51 PM was freed by a rejection
 * from nine hours and four bowls earlier — the key left the set the same tick it
 * entered, the guard went blind, and a second copy queued. That is the
 * `id 263/264 buy fryer2` and `id 260/268 buy season1` pairs in his report.
 *
 * Only a rejection NEWER than the attempt says anything about the attempt.
 *
 * This is the third bug of one family in a single evening — the boss bar
 * (chipsConst's `bossHp`) and the queue reconcile (chipsSettling) were the
 * others. A rule that searches all of history for a key that is not unique in
 * time will always find an answer to a question nobody asked.
 *
 * PURE: no React, no clock, no storage. The caller supplies `now`.
 */

/** The subset of a folded move this guard reads. */
export interface GuardMove {
  upgradeKey?: string;
  outcome: string;
  ms: number;
}

/**
 * Drop every in-flight entry the fold has settled, in place.
 *
 * Settled means one of two things and nothing else:
 *   - the jar is OWNED — the buy landed, and `owned` is what the shop reads;
 *   - this ATTEMPT was rejected — a rejection at or after the moment it was
 *     made, never an older one.
 *
 * Mutates `pending` (it is a ref's contents in the caller, deliberately not
 * React state — see App.tsx) and returns the number of entries removed so a
 * caller can tell whether anything changed.
 */
export function prunePending(
  pending: Map<string, number>,
  owned: ReadonlySet<string>,
  moves: readonly GuardMove[],
): number {
  if (pending.size === 0) return 0;
  let dropped = 0;
  for (const [key, since] of [...pending]) {
    if (owned.has(key)) {
      pending.delete(key);
      dropped += 1;
      continue;
    }
    const refusedThisAttempt = moves.some(
      (m) => m.upgradeKey === key && m.outcome.startsWith('rejected') && m.ms >= since,
    );
    if (refusedThisAttempt) {
      pending.delete(key);
      dropped += 1;
    }
  }
  return dropped;
}
