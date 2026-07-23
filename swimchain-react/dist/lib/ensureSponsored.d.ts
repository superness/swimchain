/**
 * One-click onboarding: make a brand-new identity able to act on the network.
 *
 * Public game/app pages (reef, chess) mint a browser identity but have no
 * sponsor UI, so an unsponsored visitor's first post/move fails with a raw
 * "-32015 Identity is not sponsored". `ensureSponsored` turns onboarding into a
 * single automatic step: it claims a standing auto-approve sponsorship offer
 * and waits for the chain to record the sponsorship. It reuses the node-side
 * cross-node auto-approve sweep, so the claim gossips to the sponsor's node, is
 * auto-approved, and the Sponsor action is mined — no operator action.
 *
 * Shared by all clients so the claim-construction (identity PoW + claim
 * signature) lives in exactly one place.
 */
import type { SwimchainRpc } from './rpc';
/** Minimal identity shape this helper needs. `sign` may be sync or async. */
export interface SponsorableIdentity {
    publicKeyHex: string;
    sign: (message: Uint8Array) => Uint8Array | null | Promise<Uint8Array | null>;
}
export interface EnsureSponsoredOptions {
    /**
     * Preferred sponsor's public key (hex). Auto-sponsor claims an offer from
     * THIS sponsor first — it must be an always-online node so the claim is
     * approved promptly. Without it, onboarding could pick a stale auto-approve
     * offer from an offline sponsor and hang forever. Falls back to any
     * auto-approve offer, then any offer.
     */
    preferredSponsorHex?: string;
    /**
     * When true, claim ONLY offers from `preferredSponsorHex` — never fall back
     * to some other sponsor's offer. Games (reef/chess) set this: their sponsor
     * is a dedicated always-online node, and the fallback is exactly what let a
     * player land on a stale offer from an offline sponsor and hang forever
     * (observed 2026-07-18). If the pinned sponsor has no open slot we fail fast
     * with a clear message instead of silently onboarding onto a dead offer.
     */
    strictPreferred?: boolean;
    /**
     * If set (bech32 `sp1…` space id), only claim offers that grant action IN
     * this space — i.e. a scoped offer for this exact space, or a global
     * (unscoped) offer. Offers scoped to a DIFFERENT space are skipped. Games
     * pass their own space so a reef player onboards into reef, a chess player
     * into chess, and neither can drain the other's offer.
     */
    requiredSpaceId?: string;
    /** Phase text callback for UI ("Finding a sponsor", "Waiting for approval"). */
    onProgress?: (phase: string) => void;
    /** How long to wait for the chain to record the sponsorship (ms). */
    timeoutMs?: number;
}
/**
 * Claim a standing auto-approve offer and wait until the chain records the
 * sponsorship. Idempotent: returns early if already sponsored.
 *
 * @throws if no offer is open, signing fails, or the wait times out.
 */
export declare function ensureSponsored(rpc: SwimchainRpc, id: SponsorableIdentity, options?: EnsureSponsoredOptions): Promise<void>;
//# sourceMappingURL=ensureSponsored.d.ts.map