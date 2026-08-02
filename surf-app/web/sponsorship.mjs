// Surf D1 — the set does not transmit until a person vouches for you.
//
// Surf claims ONLY unscoped offers. The games' own onboarding claims
// space-scoped offers (reef's offer grants action inside reef and nowhere
// else); running that funnel for the phone's node identity gave it a
// patchwork of per-game grants and never an actual sponsorship — WIKI still
// read "not sponsored" while REEF and CHESS were both mid-claim. A scoped
// offer is therefore never eligible here, no matter how many slots it has.

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/**
 * Pick the offer Surf may claim: unscoped, with room, most slots first.
 * `space_scope` absent or null both mean "grants everywhere".
 */
export function selectSponsorOffer(offers) {
  const eligible = (offers ?? []).filter(
    (o) => !o.space_scope && (o.slots_remaining ?? 0) > 0
  );
  return eligible.reduce(
    (best, o) => (best && best.slots_remaining >= o.slots_remaining ? best : o),
    null
  ) ?? null;
}

/**
 * Mine a nonce where sha256(nonceSpace || nonce_le) has >= minZeroBits leading
 * zero BITS. The node counts bits; a byte-counting miner over-mines 8x and
 * looks like a hang. `digest` is injected so this is testable under node:test.
 */
export async function mineClaimPow(minZeroBits, digest) {
  const nonceSpace = new Uint8Array(32);
  crypto.getRandomValues(nonceSpace);
  let nonce = 0;
  while (nonce < 10_000_000) {
    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    new DataView(input.buffer).setUint32(32, nonce >>> 0, true);
    const hash = new Uint8Array(await digest(input));
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) { zeroBits += 8; continue; }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= minZeroBits) return { nonce, nonceSpace, powHash: hash };
    nonce++;
    // Yield so the gate's UI keeps painting during the mine.
    if (nonce % 500 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('claim PoW exhausted');
}

/** offer_id(16) + claimant(32) + timestamp(8, big-endian) + pow_hash(32). */
export function buildClaimMessage(offerIdHex, claimantHex, timestamp, powHash) {
  const offerId = hexToBytes(offerIdHex);
  const claimant = hexToBytes(claimantHex);
  const msg = new Uint8Array(offerId.length + 32 + 8 + 32);
  let o = 0;
  msg.set(offerId, o); o += offerId.length;
  msg.set(claimant, o); o += 32;
  new DataView(msg.buffer, msg.byteOffset).setBigUint64(o, BigInt(timestamp), false); o += 8;
  msg.set(powHash, o);
  return msg;
}

/** True once the chain records a sponsorship for this identity. Never throws. */
export async function isSponsored(rpc, pubkeyHex) {
  try {
    const st = await rpc('get_sponsorship_status', { identity: pubkeyHex });
    return Boolean(st?.has_sponsorship ?? st?.is_sponsored);
  } catch {
    return false;
  }
}

/**
 * The fuller picture the gate needs: a set can have a claim already in flight
 * — even an APPROVED one the network knows about — while this node has not
 * applied it yet. Restarting the app in that window used to show a bare "no
 * one has vouched for this set", which was false: someone had. Observed live
 * (mainnet said has_sponsorship=true for the very identity the gate was
 * refusing). Never throws; unknown reads as "nothing in flight".
 */
export async function sponsorshipState(rpc, pubkeyHex) {
  try {
    const st = await rpc('get_sponsorship_status', { identity: pubkeyHex });
    return {
      sponsored: Boolean(st?.has_sponsorship ?? st?.is_sponsored),
      pending: Boolean(st?.pending_sponsorship),
    };
  } catch {
    return { sponsored: false, pending: false };
  }
}

/**
 * Claim an unscoped offer for this node identity. Resolves once the claim is
 * submitted — NOT once it is approved: a person still has to approve it, and
 * the caller polls `isSponsored` for that.
 *
 * @throws Error('no-unscoped-offer') when nothing unscoped has slots.
 */
export async function requestSponsorship({
  rpc, sign, pubkeyHex, applicationText,
  digest = (buf) => crypto.subtle.digest('SHA-256', buf),
  now = () => Date.now(),
}) {
  // A sponsor is a person deciding whether to vouch for a stranger. Nobody
  // approves a blind claim with no message attached, and offers can require
  // one outright (`requirements.application_required`, enforced node-side in
  // offer_validation.rs). Refuse to send an empty one.
  const application = (applicationText ?? '').trim();
  if (!application) throw new Error('application-required');

  // `list_sponsorship_offers` reads the node's LOCAL offer store, which a
  // seconds-old node has not filled yet (offers arrive on the periodic
  // SPONSORSHIP-SYNC sweep). An empty list therefore means "this set has not
  // met the network yet", NOT "the network has nothing open" — telling a
  // brand-new user the latter sends them off to find a sponsor by hand for no
  // reason. Observed live on a fresh install: zero offers, zero sync sweeps.
  const list = await rpc('list_sponsorship_offers', { limit: 200 }).catch(() => ({ offers: [] }));
  const offers = list?.offers ?? [];
  const pick = selectSponsorOffer(offers);
  if (!pick) throw new Error(offers.length ? 'no-unscoped-offer' : 'no-offers-yet');

  const minDifficulty = Math.max(pick.requirements?.min_pow_difficulty ?? 0, 1);
  const { nonce, nonceSpace, powHash } = await mineClaimPow(minDifficulty, digest);
  const timestamp = Math.floor(now() / 1000);
  const signature = await sign(
    bytesToHex(buildClaimMessage(pick.offer_id, pubkeyHex, timestamp, powHash))
  );
  if (!signature) throw new Error('signing the sponsorship request failed');

  await rpc('claim_sponsorship_offer', {
    offer_id: pick.offer_id,
    claimant_pubkey: pubkeyHex,
    application_text: application,
    pow_nonce: nonce,
    pow_difficulty: minDifficulty,
    pow_nonce_space: bytesToHex(nonceSpace),
    pow_hash: bytesToHex(powHash),
    signature,
    timestamp,
  });
  return { claimed: true, offerId: pick.offer_id };
}
