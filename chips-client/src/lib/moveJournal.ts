/**
 * WHAT THE CLIENT DID, as events. The other half of every discrepancy.
 *
 * WHY THIS EXISTS. 2026-07-29, operator: "it is pretty pointless to get a
 * snapshot in time — we are trying to find discrepancies between client and on
 * the chain, so we need to be tracking what HAPPENED ON THE CLIENT."
 *
 * Exactly right, and the ⚑ report was built the wrong way round. It photographed
 * state: the fold, the queue, the rack. A discrepancy is not a state, it is two
 * histories that disagree, and you cannot see a disagreement from one side. The
 * chain's side is already a list of events. This is the client's side, in the
 * same shape, so the two can simply be lined up.
 *
 * THE HOLE IT CLOSES. A queue entry is the only record that a move exists, and
 * `retireSettled` deletes it on either of two completely different outcomes:
 *
 *   - the chain CONFIRMED it            — correct, nothing to see
 *   - SETTLE_TTL_MS expired (10.5 min)  — we sent it, never saw it land, and
 *                                         gave up. The optimistic credit it was
 *                                         holding up vanishes with it.
 *
 * The second one is a silent loss of something the player already watched
 * arrive: an upgrade un-buys itself, crumbs walk backwards. Operator, the same
 * evening: "I definitely just lost upgrades.. lost a fryer, lost queso angel
 * upgrade. things are whiplashing around." Nothing anywhere recorded that the
 * move had ever existed, so the report could only show the state after the
 * whiplash — individually plausible, and evidence of nothing.
 *
 * So a move's whole life is written down here, and a DROP CARRIES ITS REASON.
 * That single field is the difference between "the chain never got it" and "the
 * chain has it and we are not showing it", which are opposite bugs.
 *
 * PURE and dependency-free, like [[dipRing]], [[foldWatch]] and [[errorRing]]:
 * it runs where something has already gone wrong and must never be the thing
 * that breaks.
 */

export type MovePhase =
  /** Created locally, not yet submitted. */
  | 'queued'
  /** Handed to the node. */
  | 'sent'
  /** Seen in the confirmed base. The happy ending. */
  | 'confirmed'
  /** Sent, never seen, TTL ran out, deleted. THE ONE THAT COSTS UPGRADES. */
  | 'expired';

export interface MoveEvent {
  at: number;
  /** Queue id — joins every event for one move together. */
  id: number;
  /** dip | buy | tip | broke | burn | spend | bank */
  kind: string;
  phase: MovePhase;
  /**
   * The chain identity this move WILL have (`moveKey`), so an entry can be
   * grepped for directly in a chain dump. This is the join key between the two
   * histories and the reason the report stops needing arithmetic.
   */
  key: string;
  /** How long it had been sent when it was retired, for drops. */
  sentForMs?: number;
  /** Whatever identifies the move to a human: an amount, an upgrade key. */
  detail?: string | number;
}

import { moveKey } from './moveKey';
import type { QueuedMove } from './chipsQueue';

export const MOVE_RING_MAX = 60;

const ring: MoveEvent[] = [];

export function noteMove(e: MoveEvent): void {
  try {
    ring.push(e);
    if (ring.length > MOVE_RING_MAX) ring.splice(0, ring.length - MOVE_RING_MAX);
  } catch {
    /* a journal may not be the thing that breaks */
  }
}

/** A copy, oldest first. Callers may not mutate the ring. */
export function moveEvents(): MoveEvent[] {
  return ring.slice();
}

export function clearMoveRing(): void {
  ring.length = 0;
}

/**
 * Moves that were sent and then thrown away without ever being confirmed.
 *
 * This is the answer to "did I lose an upgrade", pulled out as its own function
 * because it is the first thing to look at and should not require reading the
 * whole journal to find. A non-empty result means the client discarded work the
 * player had already been shown.
 */
export function expiredMoves(): MoveEvent[] {
  return ring.filter((e) => e.phase === 'expired');
}

/** Whatever identifies a move to a human reading a journal line. */
function detailOf(m: QueuedMove): string | number | undefined {
  if (m.kind === 'dip') return m.amount;
  if (m.kind === 'buy') return m.key;
  if (m.kind === 'spend') return m.ability;
  if (m.kind === 'broke') return m.paid;
  return undefined;
}

/**
 * A move was created locally. Called from chipsQueue.enqueue — the ONE place
 * every move is born, which is the only reason this journal is complete.
 */
export function journalQueued(m: QueuedMove, at: number = Date.now()): void {
  noteMove({ at, id: m.id, kind: m.kind, key: moveKey(m), phase: 'queued', detail: detailOf(m) });
}

/** A move was handed to the node. */
export function journalSent(m: QueuedMove, at: number): void {
  noteMove({ at, id: m.id, kind: m.kind, key: moveKey(m), phase: 'sent', detail: detailOf(m) });
}
