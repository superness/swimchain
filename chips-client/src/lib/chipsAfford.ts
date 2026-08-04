/**
 * Whether a jar can be bought right now — the ONE predicate both the shelf
 * (render) and the buy handler (the actual spend) must agree on. Before this
 * file existed the two lived as separate arithmetic in App.tsx/Bowl.tsx and
 * drifted: the shelf lit a jar as affordable while the handler, computing
 * "committed" differently, silently rejected the click. A player who clicks a
 * lit, enabled jar and gets nothing — no error, no flash, no queued move — has
 * no way to tell the game heard them at all.
 *
 * THE DOUBLE-CHARGE BUG THIS REPLACES. `crumbsNow` comes from the fold
 * (App.tsx's `state`), which already reflects every queued buy the last
 * completed fold consumed — `withPending` (chipsPending.ts) folds the queue's
 * active buys in, and the resulting `crumbs` has their cost already taken out.
 * The old `onBuy` additionally summed the cost of EVERY active queued buy
 * ("committed") and subtracted that AGAIN from `crumbsNow` before comparing to
 * a new jar's cost — double-charging every buy for its entire queued-plus-
 * settling life, not just for the one tick it was meant to cover.
 *
 * The one tick it WAS meant to cover: two different jars clicked before any
 * re-fold happens (React batches both `setQueue` calls into the same render).
 * The second click's functional updater sees the first click's move already in
 * `q`, and — because neither has been folded yet — that cost is NOT yet
 * reflected in `crumbsNow`, so it must still be subtracted once. `pendingBuyCost`
 * isolates exactly that: it charges a queued buy only while its id is absent
 * from `foldedIds`, the id set the LAST COMPLETED fold actually consumed. The
 * moment a fold runs against a buy (updating `foldedIds`), `pendingBuyCost`
 * stops charging for it — because `crumbsNow` already has.
 */
import type { QueuedMove } from './chipsQueue';

export type BuyMove = Extract<QueuedMove, { kind: 'buy' }>;

export function isBuyMove(m: QueuedMove): m is BuyMove {
  return m.kind === 'buy';
}

/**
 * Jars with a buy already queued for this table/author — the exact set
 * `onBuy` refuses to queue a second time.
 *
 * IT EXISTS SO THAT REFUSAL CANNOT BE A SURPRISE. `onBuy` drops a duplicate
 * with a bare `return q`, and the vendor path (`onFeed`) eats the chip you
 * paid with BEFORE it calls `onBuy` — so a buy dropped here was a chip gone
 * for nothing, silently. It is reachable because a bought jar does not enter
 * `owned` until the chain confirms it, which on the operator's phone took a
 * median of 14s and up to 44s: for that whole window the shop looks untouched
 * and invites the second purchase that eats the chip (operator, 2026-08-04:
 * "I am buying upgrades but it keeps not giving me them - but it takes my
 * chip").
 *
 * Every gate that can consume something must ask THIS function, not its own
 * copy of the predicate — three call sites drifting apart is how the hole
 * opened in the first place. `queue` must already be `activeFor`-filtered.
 */
export function queuedBuyKeys(activeQueue: readonly QueuedMove[]): Set<string> {
  return new Set(activeQueue.filter(isBuyMove).map((m) => m.key));
}

/**
 * Sum of cost for queued buys whose id the last completed fold did NOT yet
 * consume — i.e. buys queued after (or in the same tick as, before) that
 * fold, whose cost `crumbsNow` therefore does not yet reflect.
 *
 * `activeBuys` must already be filtered to the current table/author (see
 * `activeFor` in chipsQueue.ts) — this function does no provenance filtering
 * of its own, the same division of labour every other caller of a queue
 * snapshot in this codebase follows.
 */
export function pendingBuyCost(
  activeBuys: readonly BuyMove[],
  foldedIds: ReadonlySet<number>,
  costOf: (key: string) => number | undefined
): number {
  let sum = 0;
  for (const m of activeBuys) {
    if (foldedIds.has(m.id)) continue;
    sum += costOf(m.key) ?? 0;
  }
  return sum;
}

/**
 * THE predicate. `crumbsNow` is the fold's number; `committed` is whatever
 * `pendingBuyCost` reports for the buys that number has not seen yet (0 in the
 * overwhelming common case — only nonzero inside the same-tick race described
 * above). Shelf's `afford` and onBuy's guard must both call this, with the
 * same two numbers, or they can disagree again.
 */
export function canAffordBuy(crumbsNow: number, committed: number, cost: number): boolean {
  return crumbsNow - committed >= cost;
}
