/**
 * Settling moves: the gap between "the submit succeeded" and "the chain says so".
 *
 * A move used to be deleted from the queue the instant its submission was
 * acknowledged. `withPending` synthesises the optimistic fold from the queue, so
 * deleting it there removed the credit — and the confirmed reply that replaces it
 * is not available until the node serves it, a poll or more later. The player saw
 * their purchase appear, vanish, and reappear. On a branch whose entire premise is
 * that a dip credits at the click, that is the same broken promise in slow motion.
 *
 * So an acked move now STAYS in the queue, stamped with `sentAt` (chipsQueue.ts),
 * and is retired here — normally the moment its confirmed twin shows up, and
 * failing that on a timeout.
 *
 * WHY KEEPING IT IS SAFE, i.e. why it cannot double-credit. Between the ack and
 * the twin's arrival both copies are folded at once, and the fold is built for
 * exactly that:
 *   - `orderReplies` (chipsEngine.ts) sorts unconfirmed replies last
 *     unconditionally (`block_height ?? MAX_SAFE_INTEGER`), so the confirmed twin
 *     is always folded FIRST;
 *   - a bank's chips are keyed by `proofKey(table, author, ms, nonce)` in
 *     `seenProofs`, so the synthetic copy folds `rejected-duplicate`;
 *   - a buy is keyed by upgrade key in `state.owned`, so the synthetic copy folds
 *     `rejected-owned`.
 * Neither branch credits or charges anything. That guarantee is what makes this
 * cheap, and it is why this module retires on the twin's ARRIVAL rather than
 * trying to swap the two atomically.
 *
 * PROVENANCE. Nothing here weakens it. A settling entry carries the same
 * `tableId`/`author` it was mined for and is filtered by `activeFor` in exactly
 * the same two places a queued one is (`withPending` before folding, `planSend`
 * before submitting). `moveKey` folds the table and author INTO the key, so a
 * confirmed reply on one table can never retire — nor stand in for — a settling
 * move belonging to another.
 */
import { parseMove, type ChipsReply } from './chipsEngine';
import { proofKey } from './proofKey';
import type { QueuedMove } from './chipsQueue';
import { noteMove } from './moveJournal';
// moveKey lives in its own module so the journal can use it without an import
// cycle; re-exported here because every existing caller and test imports it from
// this file.
import { moveKey } from './moveKey';
export { moveKey };

/** Whatever identifies a move to a human reading a journal line. */
function detailOf(m: QueuedMove): string | number | undefined {
  if (m.kind === 'dip') return m.amount;
  if (m.kind === 'buy') return m.key;
  if (m.kind === 'spend') return m.ability;
  if (m.kind === 'broke') return m.paid;
  return undefined;
}

/**
 * How long a settling move may go on asserting itself before the chain's silence
 * wins.
 *
 * Anchored to two real numbers, not a round one:
 *   - `TARGET_BLOCK_INTERVAL` is 600 s on this network (src/blocks/leader.rs). A
 *     reply is normally visible to `get_replies` from the mempool long before any
 *     block — that is the fast path, and it usually retires the move within one
 *     poll — but a client that only ever sees it once its block lands must still
 *     be given a full block interval to do so.
 *   - `POLL_MS` is 15 s (App.tsx), and observing something needs at least one
 *     poll AFTER it exists. Two are allowed, so a reply that becomes visible
 *     immediately before a poll fires is not missed by a single unlucky tick.
 *
 * 600 s + 2 x 15 s = 630 s. Past that, a submit that never produced a reply is
 * not going to: a reorg dropped it, the node never served it, or the write was
 * lost. The client must then stop claiming something the chain does not say, and
 * the display falls back to whatever the chain does say — which may mean crumbs
 * going back up and an upgrade un-owning itself. That is the correct outcome:
 * showing the truth late beats showing a fiction for ever.
 */
export const SETTLE_TTL_MS = 600_000 + 2 * 15_000;


/**
 * Every move the confirmed base already contains, in `moveKey` form.
 *
 * Built from the CONFIRMED replies only (the caller passes `confirmedRef`'s
 * copy, never the merged optimistic set) — otherwise a settling move would
 * retire itself the instant it was folded, which is the deletion-on-ack bug with
 * extra steps.
 *
 * `block_height` is deliberately not consulted. A reply the node serves from its
 * mempool is already as real as one in a block for this purpose: the client has
 * observed it, so the local echo is redundant and the fold is now crediting the
 * real thing. Waiting for a height would keep the echo alive for a whole block
 * interval on every single move, for nothing.
 *
 * A reply by any other author is skipped before anything is parsed — the same
 * DoS control `verifyReplies` applies, and it also means a stranger cannot
 * retire the player's settling moves by posting look-alike bodies.
 */
export function confirmedMoveKeys(replies: ChipsReply[], tableId: string, author: string): Set<string> {
  const keys = new Set<string>();
  const me = author.toLowerCase();
  for (const r of replies) {
    if (r.author_id.toLowerCase() !== me) continue;
    const parsed = parseMove(r.body);
    if (!parsed) continue;
    if (parsed.kind === 'bank') {
      for (const chip of parsed.chips) keys.add(proofKey(tableId, author, chip.ms, chip.nonce));
    } else if (parsed.kind === 'buy') {
      keys.add(`buy:${tableId}:${me}:${parsed.key}`);
    } else if (parsed.kind === 'dip') {
      keys.add(`dip:${tableId}:${me}:${parsed.ms}`);
    } else if (parsed.kind === 'tip') {
      keys.add(`tip:${tableId}:${me}:${parsed.ms}`);
    }
    // 'oversize' carries no move to retire.
  }
  return keys;
}

/**
 * Whether a settling move may still be folded.
 *
 * `Math.abs` is deliberate: a `sentAt` in the FUTURE means the wall clock moved
 * backwards (a manual clock change, an NTP correction, a suspended laptop), and a
 * move whose expiry is measured against a clock that has jumped must not become
 * immortal. Skew in either direction beyond the TTL retires it, which errs
 * towards "believe the chain", the safe direction.
 */
export function settlingStillValid(sentAt: number, now: number, ttlMs: number = SETTLE_TTL_MS): boolean {
  return Number.isFinite(sentAt) && Number.isFinite(now) && Math.abs(now - sentAt) < ttlMs;
}

/**
 * Drop settling moves whose confirmed twin has arrived, or which have waited
 * longer than `ttlMs`. Never touches a move still queued for submission.
 *
 * Returns `q` UNCHANGED (same reference) when nothing is retired. That is
 * load-bearing rather than tidy: this is called on the one-second clock tick to
 * drive expiry, and a fresh array every second would re-fold, re-render and
 * rewrite `localStorage` sixty times a minute for nothing.
 */
export function retireSettled(
  q: QueuedMove[],
  confirmed: ReadonlySet<string>,
  now: number,
  ttlMs: number = SETTLE_TTL_MS
): QueuedMove[] {
  let changed = false;
  const out = q.filter((m) => {
    /* THE CHAIN IS CHECKED FIRST, STAMP OR NO STAMP.
       This used to read `if (m.sentAt === undefined) return true;` — an
       unstamped entry was never compared against the confirmed twins at all.
       But `markSent` only stamps on the SUCCESS path, so a submission that
       reaches the chain and then loses its acknowledgement (a dropped
       response, a backgrounded WebView, a throw after the write) leaves a move
       that is simultaneously ON CHAIN and forever `sentAt: undefined`.

       `unsent()` keeps returning it, `takeBatch` only ever looks at `q[0]`, and
       so it is resubmitted every cycle — folding `rejected-duplicate` each
       time — while every move behind it waits for a turn that never comes.

       Observed on mainnet 2026-08-04, operator's table `Counter Fryer 303`:
       queue entry 181 `{kind:'dip', ms:1785897749124, amount:207960,
       sentAt:null}` against `dip 207960#1785897749124~` confirmed in block
       2351. Eight moves stranded behind it — 5.8M crumbs of dips and four
       jars — while the player watched dips credit nothing. Earlier the same
       evening, five `broke` moves in the same shape stranded eighteen.

       Retiring on the twin alone is also the SAFE direction: `confirmedMoveKeys`
       only admits replies authored by the player on this table, so the chain
       saying "I have this move" is the strongest evidence available, and it is
       exactly the condition under which the local echo is redundant. */
    const done = confirmed.has(moveKey(m));
    if (m.sentAt === undefined) {
      if (!done) return true; // genuinely still queued for submission
      changed = true;
      noteMove({
        at: now, id: m.id, kind: m.kind, key: moveKey(m),
        // NOT 'confirmed': this one never got a `sentAt`, so there is no
        // send-to-land duration to report and the distinction is the whole
        // point of the record. It landed without ever being marked away.
        phase: 'reconciled',
        detail: detailOf(m),
      });
      return false;
    }
    if (done || !settlingStillValid(m.sentAt, now, ttlMs)) {
      changed = true;
      // JOURNAL THE REASON. These two exits look identical from here and are
      // opposite outcomes: `confirmed` means the chain has it and the local echo
      // is redundant; `expired` means we sent it, never saw it land, and are now
      // deleting credit the player already watched arrive. Until 2026-07-29 the
      // difference was recorded nowhere, so a vanished upgrade was unprovable.
      // This is the one impure line in the module, and it is worth it.
      noteMove({
        at: now, id: m.id, kind: m.kind, key: moveKey(m),
        phase: done ? 'confirmed' : 'expired',
        sentForMs: now - m.sentAt,
        detail: detailOf(m),
      });
      return false;
    }
    return true;
  });
  return changed ? out : q;
}
