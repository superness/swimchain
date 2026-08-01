/**
 * The one pure piece of the DEF CON join flow: picking the GLOBAL (unscoped)
 * sponsorship offer from a known sponsor — the tier `<RunANode/>` advertises
 * in its copy-paste `sw sponsor claim` block. Extracted from the component so
 * it's testable without a running node.
 */
import { selectClaimableOffer, type OpenOffer } from '@swimchain/react';

/**
 * Pick the sponsor's global (unscoped) offer, or null if it has none open.
 *
 * Deliberately filters to unscoped offers BEFORE delegating to
 * `selectClaimableOffer`, rather than calling it on the full list and
 * rejecting a scoped result afterward. `selectClaimableOffer`'s tie-break
 * (`mostSlots`) keeps the FIRST offer it sees when two are tied on
 * `slots_remaining` — so with a scoped and a global offer both open and
 * tied on slots, "select then reject if scoped" can silently return null
 * (rejecting a scoped pick) even though a perfectly good global offer was
 * sitting right there in the list. Pre-filtering to only-unscoped offers
 * means the tie-break, preferred-sponsor tiering, and manual-offer opt-in
 * all run over candidates that are ALREADY guaranteed global — so the
 * result is either the correct global offer or a true "none open", never a
 * false negative caused by a scoped offer winning a slots tie.
 */
export function pickGlobalOffer(offers: OpenOffer[], sponsorHex: string): OpenOffer | null {
  const globalOffers = offers.filter((o) => !o.space_scope);
  return (
    selectClaimableOffer(globalOffers, {
      preferredSponsorHex: sponsorHex,
      strictPreferred: true,
      allowManualOffers: true,
    }) ?? null
  );
}
