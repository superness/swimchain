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
import { hexToBytes, bytesToHex } from './utils';

/** Minimal identity shape this helper needs. `sign` may be sync or async. */
export interface SponsorableIdentity {
  publicKeyHex: string;
  sign: (message: Uint8Array) => Uint8Array | null | Promise<Uint8Array | null>;
}

/** A sponsorship offer as returned by list_sponsorship_offers. */
interface OpenOffer {
  offer_id: string;
  sponsor_pubkey: string;
  auto_approve?: boolean;
  slots_remaining: number;
  requirements?: { min_pow_difficulty?: number };
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
  /** Phase text callback for UI ("Finding a sponsor", "Waiting for approval"). */
  onProgress?: (phase: string) => void;
  /** How long to wait for the chain to record the sponsorship (ms). */
  timeoutMs?: number;
}

/**
 * Mine the small SHA-256 claim PoW: a nonce where sha256(nonceSpace || nonce_le)
 * has >= `minZeroBits` leading zero BITS (the node counts bits, not bytes).
 */
async function mineClaimPow(
  minZeroBits: number
): Promise<{ nonce: number; nonceSpace: Uint8Array; powHash: Uint8Array }> {
  const nonceSpace = new Uint8Array(32);
  crypto.getRandomValues(nonceSpace);
  let nonce = 0;
  while (nonce < 10_000_000) {
    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    new DataView(input.buffer).setUint32(32, nonce & 0xffffffff, true);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        zeroBits += 8;
        continue;
      }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= minZeroBits) return { nonce, nonceSpace, powHash: hash };
    nonce++;
    if (nonce % 500 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('claim PoW exhausted');
}

/** Claim signature message: offer_id(16) + claimant(32) + timestamp(8 BE) + pow_hash(32). */
function buildClaimSigMessage(
  offerIdHex: string,
  claimantHex: string,
  timestamp: number,
  powHash: Uint8Array
): Uint8Array {
  const offerId = hexToBytes(offerIdHex);
  const claimant = hexToBytes(claimantHex);
  const msg = new Uint8Array(offerId.length + 32 + 8 + 32);
  let o = 0;
  msg.set(offerId, o);
  o += offerId.length;
  msg.set(claimant, o);
  o += 32;
  new DataView(msg.buffer).setBigUint64(o, BigInt(timestamp), false);
  o += 8;
  msg.set(powHash, o);
  return msg;
}

/**
 * Claim a standing auto-approve offer and wait until the chain records the
 * sponsorship. Idempotent: returns early if already sponsored.
 *
 * @throws if no offer is open, signing fails, or the wait times out.
 */
export async function ensureSponsored(
  rpc: SwimchainRpc,
  id: SponsorableIdentity,
  options: EnsureSponsoredOptions = {}
): Promise<void> {
  const { preferredSponsorHex, onProgress, timeoutMs = 180_000 } = options;

  const isSponsored = async (): Promise<boolean> => {
    try {
      const st = await rpc.call<{ has_sponsorship?: boolean; is_sponsored?: boolean }>(
        'get_sponsorship_status',
        { identity: id.publicKeyHex }
      );
      return Boolean(st.has_sponsorship ?? st.is_sponsored);
    } catch {
      return false;
    }
  };

  if (await isSponsored()) return;

  onProgress?.('Finding a sponsor');
  const list = await rpc
    .call<{ offers?: OpenOffer[] }>('list_sponsorship_offers', {})
    .catch(() => ({ offers: [] as OpenOffer[] }));
  const offers = list.offers ?? [];
  const hasRoom = (o: OpenOffer) => o.slots_remaining > 0;
  const preferred = (o: OpenOffer) =>
    !!preferredSponsorHex &&
    o.sponsor_pubkey?.toLowerCase() === preferredSponsorHex.toLowerCase();
  // Within each tier, take the offer with the MOST remaining slots. Public
  // pages have many concurrent newcomers; picking the first match kept landing
  // everyone on the same near-exhausted 1-slot invite (which then auto-approves
  // only the first claimant and drops the rest with "no slots"). Preferring the
  // largest standing offer spreads the load and avoids that thundering herd.
  const mostSlots = (candidates: OpenOffer[]): OpenOffer | undefined =>
    candidates.reduce<OpenOffer | undefined>(
      (best, o) => (best && best.slots_remaining >= o.slots_remaining ? best : o),
      undefined
    );
  const pick =
    mostSlots(offers.filter((o) => preferred(o) && o.auto_approve && hasRoom(o))) ??
    mostSlots(offers.filter((o) => preferred(o) && hasRoom(o))) ??
    mostSlots(offers.filter((o) => o.auto_approve && hasRoom(o))) ??
    mostSlots(offers.filter(hasRoom));
  if (!pick) throw new Error('No sponsorship offers are open right now — try again shortly.');

  onProgress?.('Requesting sponsorship (proof-of-work)');
  const minDifficulty = Math.max(pick.requirements?.min_pow_difficulty ?? 0, 1);
  const { nonce, nonceSpace, powHash } = await mineClaimPow(minDifficulty);
  const timestamp = Math.floor(Date.now() / 1000);
  const sigMsg = buildClaimSigMessage(pick.offer_id, id.publicKeyHex, timestamp, powHash);
  const signature = await id.sign(sigMsg);
  if (!signature) throw new Error('signing the sponsorship request failed');

  await rpc.call('claim_sponsorship_offer', {
    offer_id: pick.offer_id,
    claimant_pubkey: id.publicKeyHex,
    application_text: null,
    pow_nonce: nonce,
    pow_difficulty: minDifficulty,
    pow_nonce_space: bytesToHex(nonceSpace),
    pow_hash: bytesToHex(powHash),
    signature: bytesToHex(signature),
    timestamp,
  });

  onProgress?.('Waiting for approval');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    if (await isSponsored()) return;
  }
  throw new Error(
    'Sponsorship is taking longer than expected — it may still complete; try again shortly.'
  );
}
