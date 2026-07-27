/**
 * Queued moves as synthetic PENDING replies.
 *
 * `block_height: null` is what makes this correct rather than a hack: the
 * fold already credits pending replies without advancing the decay clock, so
 * a queued chip reads exactly as it will once it lands. Because the same fold
 * produces both, there is no second accounting path to drift and nothing to
 * reconcile when the batch confirms — the synthetic entry drops out and the
 * real one arrives.
 *
 * Bits are known locally (we mined them), so the verification map is seeded
 * directly; on confirmation the same proof is re-verified from the chain by
 * the normal path.
 *
 * PROVENANCE. The queue is global to the browser origin (see chipsQueue.ts's
 * header) — this function folds ONLY entries whose `tableId` and `author`
 * match the table and identity currently in play (`activeFor`). A leftover
 * entry from a different table/identity is invisible here: not credited, not
 * counted toward lifetime crunch, not reflected in owned upgrades. It stays
 * in the persisted queue untouched (this is a read, not a prune) in case that
 * identity/table is ever current again.
 *
 * DEFENSIVE: a malformed queue entry (out-of-range bits, a bad ms — the kind
 * of thing that should never happen but a hand-edited or corrupted
 * localStorage row could produce) must not take the whole fold down with it.
 * `bankBatchBody`/`buyBody` assert and throw on exactly that; the try/catch
 * below skips the OFFENDING ENTRY from the optimistic display only. The entry
 * itself is untouched in the real queue, so a real, valid proof for a
 * DIFFERENT entry is never dropped by this guard.
 */
import { bankBatchBody, buyBody, dipBody, tipBody } from './chipsBody';
import { proofKey } from './proofKey';
import { activeFor, type QueuedMove } from './chipsQueue';
import type { ChipsReply } from './chipsEngine';

export function withPending(
  confirmed: ChipsReply[],
  verified: Map<string, number>,
  queue: QueuedMove[],
  me: string,
  table: string
): { replies: ChipsReply[]; verified: Map<string, number> } {
  const active = activeFor(queue, table, me);
  if (active.length === 0) return { replies: confirmed, verified };
  const v = new Map(verified);
  const extra: ChipsReply[] = [];
  let seq = 0;
  // One timestamp for the whole pass: `created_at` is shared (pending
  // replies never advance the decay clock — see chipsEngine.ts — so its
  // exact value doesn't matter beyond "now"), and hoisting it out of the
  // loop keeps every synthetic entry's ordering keyed on `seq` alone rather
  // than on `Date.now()` ticking mid-loop, which could otherwise invert two
  // entries' relative order (e.g. a buy landing "before" the bank that funds
  // it) purely from clock granularity.
  const at = Date.now();

  for (const m of active) {
    // Synthetic ids never collide with a chain content_id (`sha256:…`).
    const cid = `pending:${m.id}`;
    try {
      if (m.kind === 'bank') {
        v.set(proofKey(table, me, m.chip.ms, m.chip.nonce), m.chip.bits);
        extra.push({ author_id: me, body: bankBatchBody([m.chip], at + seq++), block_height: null, content_id: cid, created_at: at });
      } else if (m.kind === 'dip') {
        // The dip's OWN ms is the body's authoring ms — identity across the
        // pending -> confirmed swap, exactly like a bank chip's ms.
        extra.push({ author_id: me, body: dipBody(m.amount, m.ms), block_height: null, content_id: cid, created_at: at });
      } else if (m.kind === 'tip') {
        extra.push({ author_id: me, body: tipBody(m.ms), block_height: null, content_id: cid, created_at: at });
      } else {
        extra.push({ author_id: me, body: buyBody(m.key, at + seq++), block_height: null, content_id: cid, created_at: at });
      }
    } catch {
      // A malformed entry must never take the fold down with it (see the
      // doc comment above) — it's simply absent from the optimistic display
      // until/unless it's fixed; the real queue entry is untouched.
    }
  }
  return { replies: [...confirmed, ...extra], verified: v };
}
