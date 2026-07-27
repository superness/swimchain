/**
 * THE REVEAL GATE — the bottom of the bowl opens on CHAIN-CONFIRMED depth only.
 *
 * The reveal is a one-shot. It latches `chips.bowl.v1:<table>:<tips>` to 'seen'
 * the moment it opens (App.tsx) so the game's one twist cannot turn into a nag
 * on every reload — which means it gets exactly one showing per run and has to
 * spend it well.
 *
 * Everything else in the game reads the OPTIMISTIC fold, on purpose: a dip
 * credits at the click, with no network round trip (App.tsx `foldNow`). But
 * optimistic credit is revocable. chipsSettling.ts spells out both ways it goes
 * back: the confirmed twin can fold `rejected-*`, and a submit that never
 * produces a reply expires after 630s — "crumbs going back up and an upgrade
 * un-owning itself. That is the correct outcome". Lifetime rides along with it.
 *
 * So a pending dip that crosses TIP_FLOOR could open the reveal, be taken back
 * a poll later, and leave the player looking at the twist with a dead "not deep
 * enough yet" button and no second showing coming. Observed live 2026-07-27.
 *
 * This gate is therefore deliberately slower than the rest of the UI: it waits
 * for the chain. A poll or two of delay costs nothing — the offer is permanent
 * once struck — and it buys the guarantee that the modal is actionable whenever
 * it is on screen.
 *
 * IT TAKES THE QUEUE IT MUST NOT USE. Every caller has the pending queue in
 * hand and merging it first is the natural mistake (that merge is what `foldNow`
 * does one line away). Accepting it here puts the decision to ignore it next to
 * the reason for ignoring it, and lets bowlGate.test.ts prove the ignoring by
 * passing a queue that would otherwise open the reveal.
 */
import { foldChips, saltFor, type ChipsHeader, type ChipsReply } from './chipsEngine';
import type { QueuedMove } from './chipsQueue';

export function bowlReady(
  header: ChipsHeader, tableId: string,
  confirmed: ChipsReply[], verified: Map<string, number>,
  _pending: QueuedMove[], _author: string,
): boolean {
  return saltFor(foldChips(header, tableId, confirmed, verified).lifetimeChips) > 0;
}

/**
 * Whether the offer belongs on screen at all — the reveal and the standing
 * ticket share this, so neither can appear on a button that cannot be pressed.
 *
 * `chainReady` is `bowlReady` above: deep enough, and the chain says so.
 * `liveSalt` is what the player would actually bank by tipping right now, read
 * from the same optimistic fold as the rest of the UI. It is normally the
 * larger of the two — pending moves only ADD lifetime — with one exception
 * that matters: a queued `tip` resets lifetime to 0 in the optimistic fold
 * while the chain still remembers the run's full depth. Without the second
 * condition the ticket would come back mid-tip advertising "0 old salt".
 */
export function bowlOfferVisible(chainReady: boolean, liveSalt: number): boolean {
  return chainReady && liveSalt > 0;
}
