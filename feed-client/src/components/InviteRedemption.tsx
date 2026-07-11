/**
 * Invite redemption flow (SWIM-INV-2)
 *
 * Runs right after identity creation/import when the user provided an
 * invite code. Steps:
 *   1. Claim the auto-approve sponsorship offer from the invite token
 *      (mines the small SHA-256 claim PoW, signs, submits).
 *   2. On "approved", the newcomer is sponsored immediately.
 *   3. Sends a DM request to the sponsor so the newcomer lands with a
 *      conversation waiting.
 *
 * All errors are surfaced in plain language (expired, already used,
 * node offline).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRpc, useRequestDM } from '../hooks/useRpc';
import { useSponsorship } from '../hooks/useSponsorship';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useSwimchain } from '../providers/SwimchainProvider';
import { WasmKeypair, encode_address } from '../wasm/loader';
import type { InvitePayload } from '../lib/invite';
import {
  ActionType,
  createChallenge,
  computePow,
  getDifficulty,
  getConfig,
  solutionToRpcParams,
} from '../lib/action-pow';
import {
  deriveX25519Keys,
  ed25519PublicToX25519,
  encryptSpaceKeyForRecipient,
  generateSpaceKey,
} from '../lib/x25519';
import { getDMSpaceId, getDMSpaceName, truncateKey } from '../lib/dm';
import { logger } from '../lib/logger';
import './InviteRedemption.css';

/** Convert Uint8Array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Mine SHA-256 PoW for the claim: find nonce where
 * sha256(nonceSpace || nonce_le) has enough leading zero BITS (the node
 * validates bits; counting bytes here over-mined 8x and exhausted the
 * attempt cap on any offer above ~24 difficulty).
 */
async function mineSha256Pow(
  minZeroBits: number,
): Promise<{ nonce: number; nonceSpace: Uint8Array; powHash: Uint8Array }> {
  const nonceSpace = new Uint8Array(32);
  crypto.getRandomValues(nonceSpace);

  let nonce = 0;
  const maxAttempts = 10_000_000;

  while (nonce < maxAttempts) {
    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    const view = new DataView(input.buffer);
    view.setUint32(32, nonce & 0xFFFFFFFF, true);
    view.setUint32(36, 0, true);

    const hashBuf = await crypto.subtle.digest('SHA-256', input);
    const hash = new Uint8Array(hashBuf);

    // Count leading zero bits (matches node-side count_leading_zero_bits)
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        zeroBits += 8;
        continue;
      }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }

    if (zeroBits >= minZeroBits) {
      return { nonce, nonceSpace, powHash: hash };
    }

    nonce++;
    if (nonce % 500 === 0) {
      // Yield to the UI thread
      await new Promise(resolve => setTimeout(resolve, 0));
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
  msg.set(offerId, offset); offset += offerId.length;
  msg.set(claimant, offset); offset += 32;
  const view = new DataView(msg.buffer);
  view.setBigUint64(offset, BigInt(timestamp), false); offset += 8;
  msg.set(powHash, offset);
  return msg;
}

/** Translate raw node errors into plain language */
function friendlyClaimError(raw: string): string {
  const m = raw.toLowerCase();
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
    m.includes('failed to fetch') || m.includes('network') ||
    m.includes('not connected') || m.includes('econnrefused') || m.includes('timeout')
  ) {
    return "Can't reach your Swimchain node right now. Make sure it's running, then try again.";
  }
  return `Something went wrong redeeming your invite: ${raw}`;
}

type Stage =
  | 'waiting'       // Waiting for node connection / WASM
  | 'claiming'      // Mining claim PoW + submitting claim
  | 'sending-dm'    // Claim approved; sending intro DM request
  | 'done'          // All done (DM sent or DM skipped)
  | 'pending'       // Claim submitted but not auto-approved
  | 'error';        // Claim failed

interface InviteRedemptionProps {
  invite: InvitePayload;
  /** Hex seed of the just-created identity */
  seed: string;
  /** Hex public key of the just-created identity */
  publicKey: string;
  /** Called when the user clicks through from the final screen */
  onDone: () => void;
}

export function InviteRedemption({
  invite,
  seed,
  publicKey,
  onDone,
}: InviteRedemptionProps): JSX.Element {
  const { rpc, connected } = useRpc();
  const { isLoaded: wasmLoaded } = useSwimchain();
  const { refresh: refreshSponsorship } = useSponsorship();
  const { request: requestDM } = useRequestDM();
  const { storeSpaceKey } = usePrivateSpaceKeys(publicKey);

  const [stage, setStage] = useState<Stage>('waiting');
  const [statusText, setStatusText] = useState('Connecting to your node...');
  const [error, setError] = useState<string | null>(null);
  const [dmSent, setDmSent] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const runningRef = useRef(false);

  // Sponsor display: prefer the bech32m address, fall back to short hex
  const sponsorShort = (() => {
    try {
      const addr = encode_address(hexToBytes(invite.sponsor));
      return truncateKey(addr);
    } catch {
      return truncateKey(invite.sponsor);
    }
  })();

  const sendIntroDM = useCallback(async (keypair: WasmKeypair): Promise<boolean> => {
    try {
      setStatusText('Setting up a chat with your friend...');

      // Generate the DM space key and encrypt it for the sponsor
      const spaceKey = generateSpaceKey();
      const { secretKey: myX25519SecretKey } = deriveX25519Keys(keypair.seed());
      const sponsorX25519Pk = ed25519PublicToX25519(hexToBytes(invite.sponsor));
      const encryptedKeyForSponsor = encryptSpaceKeyForRecipient(
        spaceKey,
        sponsorX25519Pk,
        myX25519SecretKey,
      );

      // Sign the request
      const timestamp = Math.floor(Date.now() / 1000);
      const message = new TextEncoder().encode(
        `dm_request:${publicKey}:${invite.sponsor}:${timestamp}`
      );
      const signature = keypair.sign(message);

      // Mine action PoW for the request (Post difficulty, testnet)
      const isTestnet = true;
      const challenge = await createChallenge(
        ActionType.Post,
        message,
        keypair.publicKey(),
        getDifficulty(ActionType.Post, isTestnet),
      );
      const solution = await computePow(challenge, getConfig(isTestnet));
      const powParams = solutionToRpcParams(solution);

      const result = await requestDM({
        requester: publicKey,
        recipient: invite.sponsor,
        keyShare: bytesToHex(encryptedKeyForSponsor),
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: bytesToHex(signature),
        timestamp,
      });

      // Store the space key locally so the DM decrypts once accepted
      const dmSpaceId = getDMSpaceId(publicKey, invite.sponsor);
      await storeSpaceKey(
        dmSpaceId,
        spaceKey,
        publicKey,
        0,
        getDMSpaceName(publicKey, invite.sponsor),
      );

      logger.info('[InviteRedemption] DM request sent:', result?.requestHash);
      return result !== null;
    } catch (err) {
      logger.error('[InviteRedemption] DM request failed:', err);
      return false;
    }
  }, [invite.sponsor, publicKey, requestDM, storeSpaceKey]);

  useEffect(() => {
    if (!rpc || !connected || !wasmLoaded) {
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;

    let keypair: WasmKeypair | null = null;

    const run = async () => {
      try {
        keypair = WasmKeypair.fromSeed(hexToBytes(seed));

        // --- Step 1: look up the offer for validation + requirements ---
        setStage('claiming');
        setStatusText('Checking your invite...');
        const offer = await rpc.getSponsorshipOffer(invite.offer_id);

        const now = Math.floor(Date.now() / 1000);
        if (offer.expires_at <= now) {
          throw new Error('offer expired');
        }
        if (offer.slots_remaining <= 0) {
          throw new Error('no slots remaining');
        }

        // --- Step 2: mine the claim PoW and submit the claim ---
        setStatusText('Doing a little math to prove you are human...');
        const minDifficulty = Math.max(offer.requirements.min_pow_difficulty, 1);
        const { nonce, nonceSpace, powHash } = await mineSha256Pow(minDifficulty);

        const timestamp = Math.floor(Date.now() / 1000);
        const sigMsg = buildClaimSignatureMessage(
          invite.offer_id, publicKey, timestamp, powHash,
        );
        const signature = keypair.sign(sigMsg);

        setStatusText('Redeeming your invite...');
        const claim = await rpc.claimSponsorshipOffer({
          offerId: invite.offer_id,
          claimantPubkey: publicKey,
          powNonce: nonce,
          powDifficulty: minDifficulty,
          powNonceSpace: bytesToHex(nonceSpace),
          powHash: bytesToHex(powHash),
          signature: bytesToHex(signature),
          timestamp,
        });

        logger.info('[InviteRedemption] Claim result:', claim.status);

        if (claim.status !== 'approved') {
          // Not an auto-approve offer (or node predates auto-approve)
          setStage('pending');
          refreshSponsorship();
          return;
        }

        // Sponsored! Refresh the app-wide sponsorship state.
        refreshSponsorship();

        // --- Step 3: send the intro DM request ---
        setStage('sending-dm');
        const sent = await sendIntroDM(keypair);
        setDmSent(sent);
        setStage('done');
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        logger.error('[InviteRedemption] Failed:', raw);
        setError(friendlyClaimError(raw));
        setStage('error');
      } finally {
        keypair?.free();
      }
    };

    run();
  }, [rpc, connected, wasmLoaded, attempt, invite.offer_id, publicKey, seed, refreshSponsorship, sendIntroDM]);

  const handleRetry = () => {
    setError(null);
    setStage('waiting');
    setStatusText('Connecting to your node...');
    runningRef.current = false;
    setAttempt(a => a + 1);
  };

  return (
    <section className="invite-redemption" aria-live="polite">
      {(stage === 'waiting' || stage === 'claiming' || stage === 'sending-dm') && (
        <div className="invite-redemption__card">
          <div className="loading-spinner" />
          <h2>Redeeming your invite</h2>
          <p className="invite-redemption__status">{statusText}</p>
        </div>
      )}

      {stage === 'done' && (
        <div className="invite-redemption__card invite-redemption__card--success">
          <h2>You're in — sponsored by {sponsorShort}</h2>
          {dmSent ? (
            <p className="invite-redemption__status">
              We've sent your friend a message request, so there's already a
              conversation waiting for you. Say hi!
            </p>
          ) : (
            <p className="invite-redemption__status">
              You're all set. (We couldn't start a chat with your friend
              automatically — you can message them from their profile later.)
            </p>
          )}
          <button type="button" className="btn btn-primary" onClick={onDone}>
            Start exploring
          </button>
        </div>
      )}

      {stage === 'pending' && (
        <div className="invite-redemption__card">
          <h2>Almost there</h2>
          <p className="invite-redemption__status">
            Your request went through, but this invite needs your friend's
            approval before you can post. You'll be in as soon as they accept —
            usually within a day.
          </p>
          <button type="button" className="btn btn-primary" onClick={onDone}>
            Continue
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="invite-redemption__card invite-redemption__card--error">
          <h2>That invite didn't work</h2>
          <p className="invite-redemption__status" role="alert">{error}</p>
          <p className="invite-redemption__status">
            Your new identity is safe — this only affects the invite.
          </p>
          <div className="invite-redemption__actions">
            <button type="button" className="btn btn-primary" onClick={handleRetry}>
              Try again
            </button>
            <button type="button" className="btn btn-secondary" onClick={onDone}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
