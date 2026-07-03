/**
 * Invite redemption (SWIM-INV-3, desktop)
 *
 * Runs right after the node starts when the newcomer arrived with an invite
 * code. It mirrors feed-client/src/components/InviteRedemption.tsx, but the
 * desktop shell has no local seed — the node owns the identity — so every
 * signature goes through the node's `sign_message` RPC instead of a local
 * WASM keypair.
 *
 * Steps:
 *   1. Ask the node who it is (`get_identity_info`) — the claimant pubkey.
 *   2. Look up the offer (`get_sponsorship_offer`) to validate + read the PoW
 *      requirement.
 *   3. Mine the small SHA-256 claim PoW, have the node sign the claim, submit
 *      it (`claim_sponsorship_offer`). Auto-approve invites return "approved".
 *   4. Best-effort: open a DM request to the sponsor (`request_dm`) so a
 *      conversation is waiting. The key share is the requester's X25519 public
 *      key, derived from the node's Ed25519 public key (no seed required).
 */

import type { InvitePayload } from './invite';

/* ------------------------------------------------------------------ */
/* Hex helpers                                                         */
/* ------------------------------------------------------------------ */

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/* ------------------------------------------------------------------ */
/* JSON-RPC over HTTP                                                  */
/* ------------------------------------------------------------------ */

export interface RpcClient {
  endpoint: string;
  auth: string;
}

async function rpcCall<T>(client: RpcClient, method: string, params: unknown): Promise<T> {
  const res = await fetch(client.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: client.auth,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!res.ok) {
    throw new Error(`node returned HTTP ${res.status}`);
  }

  const body = (await res.json()) as {
    result?: T;
    error?: { message?: string; code?: number };
  };

  if (body.error) {
    throw new Error(body.error.message || `RPC error ${body.error.code ?? ''}`);
  }
  return body.result as T;
}

/* ------------------------------------------------------------------ */
/* Claim PoW + signature message                                       */
/* ------------------------------------------------------------------ */

/**
 * Mine SHA-256 PoW for the claim: find a nonce where
 * sha256(nonceSpace || nonce_le_u64) has `minZeroBytes` leading zero bytes.
 * Matches the node's verification in claim_sponsorship_offer.
 */
async function mineSha256Pow(
  minZeroBytes: number,
): Promise<{ nonce: number; nonceSpace: Uint8Array; powHash: Uint8Array }> {
  const nonceSpace = new Uint8Array(32);
  crypto.getRandomValues(nonceSpace);

  let nonce = 0;
  const maxAttempts = 10_000_000;

  while (nonce < maxAttempts) {
    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    const view = new DataView(input.buffer);
    view.setUint32(32, nonce & 0xffffffff, true);
    view.setUint32(36, 0, true);

    const hashBuf = await crypto.subtle.digest('SHA-256', input);
    const hash = new Uint8Array(hashBuf);

    let zeros = 0;
    for (const byte of hash) {
      if (byte === 0) zeros++;
      else break;
    }

    if (zeros >= minZeroBytes) {
      return { nonce, nonceSpace, powHash: hash };
    }

    nonce++;
    if (nonce % 500 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw new Error('PoW mining exhausted max attempts');
}

/**
 * Build the claim signature message:
 * offer_id(16) + claimant(32) + timestamp(8 BE) + pow_hash(32)
 */
function buildClaimSignatureMessage(
  offerIdHex: string,
  claimantPubkeyHex: string,
  timestamp: number,
  powHash: Uint8Array,
): Uint8Array {
  const offerId = hexToBytes(offerIdHex);
  const claimant = hexToBytes(claimantPubkeyHex);
  const msg = new Uint8Array(offerId.length + 32 + 8 + 32);
  let offset = 0;
  msg.set(offerId, offset);
  offset += offerId.length;
  msg.set(claimant, offset);
  offset += 32;
  const view = new DataView(msg.buffer);
  view.setBigUint64(offset, BigInt(timestamp), false);
  offset += 8;
  msg.set(powHash, offset);
  return msg;
}

/* ------------------------------------------------------------------ */
/* Ed25519 public key -> X25519 public key (for the DM key share)      */
/* Dependency-free BigInt port of feed-client's convertEdPublicToX25519.*/
/* ------------------------------------------------------------------ */

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [a, m];
  let [oldS, s] = [BigInt(1), BigInt(0)];
  while (r !== BigInt(0)) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return mod(oldS, m);
}

/** Birational map u = (1 + y) / (1 - y) mod p, Ed25519 -> Curve25519. */
function ed25519PublicToX25519(edPkHex: string): Uint8Array {
  const edPk = hexToBytes(edPkHex);
  const p = BigInt(
    '57896044618658097711785492504343953926634992332820282019728792003956564819949',
  );

  let y = BigInt(0);
  for (let i = 0; i < 32; i++) {
    y |= BigInt(edPk[i] ?? 0) << BigInt(8 * i);
  }
  y &= (BigInt(1) << BigInt(255)) - BigInt(1); // clear sign bit

  const one = BigInt(1);
  const u = mod(mod(one + y, p) * modInverse(mod(one - y, p), p), p);

  const out = new Uint8Array(32);
  let temp = u;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(temp & BigInt(0xff));
    temp >>= BigInt(8);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Error messages                                                      */
/* ------------------------------------------------------------------ */

export function friendlyClaimError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('already sponsored')) {
    return "You're already part of Swimchain on this network — no invite needed.";
  }
  if (m.includes('expired')) {
    return 'This invite has expired. Ask your friend to send you a new one.';
  }
  if (
    m.includes('no slots') || m.includes('slots remaining') ||
    m.includes('already claimed') || m.includes('already used') || m.includes('full')
  ) {
    return 'This invite has already been used. Ask your friend to send you a new one.';
  }
  if (m.includes('not found') || m.includes('unknown offer')) {
    return "This invite doesn't seem to exist anymore. Ask your friend to send you a new one.";
  }
  if (
    m.includes('failed to fetch') || m.includes('http ') || m.includes('network') ||
    m.includes('not connected') || m.includes('econnrefused') || m.includes('timeout')
  ) {
    return "Can't reach your Swimchain node right now. Make sure it's running, then try again.";
  }
  return `Something went wrong redeeming your invite: ${raw}`;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export type RedeemStatus = 'approved' | 'pending';

export interface RedeemResult {
  status: RedeemStatus;
  /** Whether the intro DM request was created. */
  dmSent: boolean;
  /** Sponsor pubkey (hex) from the invite. */
  sponsor: string;
}

interface IdentityInfo {
  has_identity: boolean;
  public_key: string | null;
  address: string | null;
}

interface SignResult {
  signature: string;
  public_key: string;
}

interface OfferResult {
  slots_remaining: number;
  expires_at: number;
  requirements: { min_pow_difficulty: number; application_required: boolean };
}

interface ClaimResult {
  status: string;
  message: string;
}

/** Have the node sign a raw byte message and return the 64-byte signature hex. */
async function nodeSign(client: RpcClient, message: Uint8Array): Promise<string> {
  const res = await rpcCall<SignResult>(client, 'sign_message', {
    message: bytesToHex(message),
  });
  return res.signature;
}

/**
 * Best-effort intro DM request to the sponsor, so the newcomer lands with a
 * conversation waiting. Never throws — returns false on any failure.
 */
async function sendIntroDM(
  client: RpcClient,
  requesterPubkey: string,
  sponsorPubkey: string,
): Promise<boolean> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = new TextEncoder().encode(
      `dm_request:${requesterPubkey}:${sponsorPubkey}:${timestamp}`,
    );
    const signature = await nodeSign(client, message);

    // 32-byte key share for the DH: our X25519 public key, derived from the
    // node's Ed25519 public key (no private material needed here).
    const keyShare = ed25519PublicToX25519(requesterPubkey);

    // request_dm does not verify PoW, but the params are required — a trivial
    // 1-byte-difficulty proof keeps us forward-compatible.
    const { nonce, nonceSpace, powHash } = await mineSha256Pow(1);

    await rpcCall(client, 'request_dm', {
      requester: requesterPubkey,
      recipient: sponsorPubkey,
      key_share: bytesToHex(keyShare),
      pow_nonce: nonce,
      pow_difficulty: 1,
      pow_nonce_space: bytesToHex(nonceSpace),
      pow_hash: bytesToHex(powHash),
      signature,
      timestamp,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Redeem an invite through the running node. Throws on claim failure with a
 * raw message; the caller should surface friendlyClaimError(...).
 */
export async function redeemInvite(
  client: RpcClient,
  invite: InvitePayload,
  onStatus: (text: string) => void,
): Promise<RedeemResult> {
  onStatus('Checking your invite...');

  // --- Step 1: who is the node? ---
  const identity = await rpcCall<IdentityInfo>(client, 'get_identity_info', {});
  if (!identity.has_identity || !identity.public_key) {
    throw new Error('node not connected');
  }
  const claimant = identity.public_key;

  // --- Step 2: look up + validate the offer ---
  const offer = await rpcCall<OfferResult>(client, 'get_sponsorship_offer', {
    offer_id: invite.offer_id,
  });
  const now = Math.floor(Date.now() / 1000);
  if (offer.expires_at <= now) {
    throw new Error('offer expired');
  }
  if (offer.slots_remaining <= 0) {
    throw new Error('no slots remaining');
  }

  // --- Step 3: mine the claim PoW + sign + submit ---
  onStatus('Doing a little math to prove you are human...');
  const minDifficulty = Math.max(offer.requirements.min_pow_difficulty, 1);
  const { nonce, nonceSpace, powHash } = await mineSha256Pow(minDifficulty);

  const timestamp = Math.floor(Date.now() / 1000);
  const sigMsg = buildClaimSignatureMessage(invite.offer_id, claimant, timestamp, powHash);
  const signature = await nodeSign(client, sigMsg);

  onStatus('Redeeming your invite...');
  const claim = await rpcCall<ClaimResult>(client, 'claim_sponsorship_offer', {
    offer_id: invite.offer_id,
    claimant_pubkey: claimant,
    pow_nonce: nonce,
    pow_difficulty: minDifficulty,
    pow_nonce_space: bytesToHex(nonceSpace),
    pow_hash: bytesToHex(powHash),
    signature,
    timestamp,
  });

  if (claim.status !== 'approved') {
    return { status: 'pending', dmSent: false, sponsor: invite.sponsor };
  }

  // --- Step 4: best-effort intro DM ---
  onStatus('Setting up a chat with your friend...');
  const dmSent = await sendIntroDM(client, claimant, invite.sponsor);

  return { status: 'approved', dmSent, sponsor: invite.sponsor };
}

/** Short, non-scary sponsor label from the sponsor pubkey hex. */
export function shortSponsor(sponsorHex: string): string {
  const h = sponsorHex.trim();
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}
