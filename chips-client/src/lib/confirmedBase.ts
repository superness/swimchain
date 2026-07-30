/**
 * THE CONFIRMED BASE ONLY EVER GROWS.
 *
 * WHY THIS EXISTS — measured, 2026-07-29. The ⚑ report caught the fold going
 * backwards eight times in three minutes, and every single regression had the
 * same shape:
 *
 *     lifetimeChips 1991 -> 1967   moves 65 -> 64
 *     lifetimeChips 1992 -> 1967   moves 65 -> 64      (climbed back first)
 *     lifetimeChips 2141 -> 2065   moves 67 -> 66
 *     lifetimeChips 2087 -> 2065   moves 67 -> 66
 *
 * `movesTo === movesFrom - 1` every time: EXACTLY ONE REPLY disappearing, and
 * reappearing between drops. Crumbs fell by exactly one dip's worth (24,120 /
 * 25,460 / 76,380). `lostMoves: 0`, so the pending queue never expired
 * anything — the queue was innocent and the ground moved under it.
 *
 * The cause was `refresh()` doing this:
 *
 *     confirmedRef.current = { replies: confirmed, verified };
 *
 * i.e. trusting the MOST RECENT poll unconditionally. A reply is normally
 * served from the mempool and later from a block, and during that handoff it can
 * be briefly in neither; a poll that lands in the gap comes back one reply short
 * and the fold dutifully un-credits it. The next poll restores it. To a player
 * that is crumbs walking backwards and an upgrade un-buying itself, for no
 * reason they could ever act on.
 *
 * THE INVARIANT. A reply that has been fetched AND signature-verified is valid
 * forever. Nothing about a later poll failing to mention it makes it less
 * signed. So the base is a UNION keyed by content id, never a replacement, and
 * the fold's input cannot shrink.
 *
 * THE TRADEOFF, STATED. A reply legitimately removed by a reorg is retained, so
 * the display could sit high rather than correcting downward. That is the same
 * optimistic-credit bet the pending queue already makes, it is bounded by the
 * table's own history, and it is strictly better than the alternative — which is
 * believing whichever poll happened to know the least. A player can act on
 * "slightly stale"; they cannot act on "flickering".
 *
 * PURE: no React, no clock, no I/O.
 */
import type { ChipsReply } from './chipsEngine';

export interface ConfirmedBase {
  replies: ChipsReply[];
  /** content id -> verification result, as produced by verifyReplies. */
  verified: Map<string, number>;
}

export const EMPTY_BASE: ConfirmedBase = { replies: [], verified: new Map() };

/**
 * Fold a freshly fetched poll into the running base. Returns the SAME object
 * when the poll adds nothing new.
 *
 * Returning the same reference matters and is not just tidiness: `refresh` runs
 * on a 15 s poll and most polls are pure repeats, so a fresh object every time
 * would re-fold and re-render for nothing.
 *
 * A reply already in the base is NOT overwritten by the incoming copy. Once
 * verified, its verification stands; re-adopting a later copy of the same
 * content id would let a re-served reply arrive with a different
 * `block_height` and quietly reorder the fold (`orderReplies` sorts on it),
 * which is a second way to make the same number move for no reason.
 */
export function mergeConfirmed(
  base: ConfirmedBase,
  incoming: readonly ChipsReply[],
  verified: ReadonlyMap<string, number>,
): ConfirmedBase {
  const seen = new Set(base.replies.map((r) => r.content_id));
  const fresh = incoming.filter((r) => !seen.has(r.content_id));

  // A poll that told us nothing new — the common case by far.
  if (fresh.length === 0) return base;

  const nextVerified = new Map(base.verified);
  for (const r of fresh) {
    const v = verified.get(r.content_id);
    if (v !== undefined) nextVerified.set(r.content_id, v);
  }
  return { replies: [...base.replies, ...fresh], verified: nextVerified };
}

/**
 * How many replies the latest poll FAILED to mention that the base already had.
 *
 * Not used to discard anything — it is the measurement that proves this module
 * is earning its keep, and it belongs in the ⚑ report. A non-zero value is a
 * poll that would have caused a visible regression before this existed.
 */
export function droppedByPoll(base: ConfirmedBase, incoming: readonly ChipsReply[]): number {
  const now = new Set(incoming.map((r) => r.content_id));
  let n = 0;
  for (const r of base.replies) if (!now.has(r.content_id)) n++;
  return n;
}
