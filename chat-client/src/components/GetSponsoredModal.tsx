/**
 * GetSponsoredModal — lists open sponsorship offers and lets the current
 * identity claim one, so an unsponsored chat user can get onboarded (SPEC_11).
 *
 * chat-client has no dedicated /sponsorship page (unlike forum/feed), so this
 * modal is the "Find a Sponsor" affordance surfaced by the SponsorshipBanner.
 *
 * The claim protocol mirrors the node's canonical contract (verified against
 * `claim_sponsorship_offer` in src/rpc/methods.rs), NOT chat's legacy rpc.ts
 * wrappers which send the wrong param names (`claimant_pk`/`content_id`):
 *   - PoW:  sha256(pow_nonce_space(32) || pow_nonce_le(8)) with N leading zero BITS
 *   - sig:  offer_id(16) || claimant(32) || timestamp(8 BE) || pow_hash(32)
 *
 * Signing routes through useChatIdentity().sign, so it works in BOTH node
 * (desktop) mode (node's sign_message RPC) and browser mode (local keypair).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { hexToBytes, bytesToHex } from '@swimchain/frontend';
import { useRpc } from '../hooks/useRpc';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { useToast } from './Toast';
import './GetSponsoredModal.css';

interface OfferRequirements {
  min_pow_difficulty: number;
  application_required: boolean;
}

interface SponsorshipOffer {
  offer_id: string;
  sponsor_pubkey: string;
  offer_type: string;
  slots_total: number;
  slots_remaining: number;
  expires_at: number;
  created_at: number;
  requirements: OfferRequirements;
  auto_approve?: boolean;
}

interface ListOffersResult {
  offers: SponsorshipOffer[];
  total: number;
  has_more: boolean;
}

interface ClaimResult {
  offer_id: string;
  status: string;
  message: string;
}

/**
 * Mine SHA-256 PoW: find a nonce where sha256(nonceSpace || nonce_le) has
 * `minZeroBits` leading zero BITS. The node validates bits (see
 * claim_sponsorship_offer in src/rpc/methods.rs); this miner previously
 * counted zero BYTES against the same number, over-mining 8x and exhausting
 * the attempt cap on any offer with difficulty above ~24 — claims never
 * completed and looked like a timeout.
 */
async function mineSha256Pow(
  minZeroBits: number,
  onProgress?: (attempts: number) => void,
  isCancelled?: () => boolean,
): Promise<{ nonce: number; nonceSpace: Uint8Array; powHash: Uint8Array }> {
  const nonceSpace = new Uint8Array(32);
  crypto.getRandomValues(nonceSpace);

  let nonce = 0;
  const maxAttempts = 10_000_000;

  while (nonce < maxAttempts) {
    if (isCancelled?.()) throw new Error('Mining cancelled');

    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    const view = new DataView(input.buffer);
    view.setUint32(32, nonce & 0xffffffff, true);
    view.setUint32(36, 0, true); // nonce fits in u32

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
    if (zeroBits >= minZeroBits) return { nonce, nonceSpace, powHash: hash };

    nonce++;
    if (nonce % 500 === 0) {
      onProgress?.(nonce);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw new Error('PoW mining exhausted max attempts');
}

/** Build the claim signature message: offer_id(16) + claimant(32) + timestamp(8 BE) + pow_hash(32) */
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
  new DataView(msg.buffer).setBigUint64(offset, BigInt(timestamp), false);
  offset += 8;
  msg.set(powHash, offset);
  return msg;
}

interface GetSponsoredModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a claim; `sponsored` is true when the claim was auto-approved. */
  onClaimed: (sponsored: boolean) => void;
}

export function GetSponsoredModal({ isOpen, onClose, onClaimed }: GetSponsoredModalProps): JSX.Element | null {
  const { rpc, connected } = useRpc();
  const { identity, sign } = useChatIdentity();
  const toast = useToast();

  const [offers, setOffers] = useState<SponsorshipOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationText, setApplicationText] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [mining, setMining] = useState(false);
  const [pubkeyCopied, setPubkeyCopied] = useState(false);
  const cancelledRef = useRef(false);

  const loadOffers = useCallback(async () => {
    if (!rpc || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const result = await rpc.call<ListOffersResult>('list_sponsorship_offers', {
        offset: 0,
        limit: 20,
      });
      // Hide the user's own offers — you can't sponsor yourself.
      const mine = identity?.publicKey?.toLowerCase();
      setOffers(result.offers.filter((o) => o.sponsor_pubkey.toLowerCase() !== mine));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, identity?.publicKey]);

  // Load offers + reset transient state when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    cancelledRef.current = false;
    setApplicationText('');
    setClaimingId(null);
    setMining(false);
    void loadOffers();
  }, [isOpen, loadOffers]);

  // Close on Escape (unless busy).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !claimingId) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, claimingId, onClose]);

  const handleClaim = useCallback(
    async (offer: SponsorshipOffer) => {
      if (!rpc || !connected || !identity?.publicKey) return;
      if (offer.requirements.application_required && !applicationText.trim()) {
        setError('This sponsor requires an application. Add a short note below first.');
        return;
      }

      setClaimingId(offer.offer_id);
      setMining(true);
      setError(null);
      cancelledRef.current = false;

      try {
        const minDifficulty = offer.requirements.min_pow_difficulty > 0 ? offer.requirements.min_pow_difficulty : 1;
        const { nonce, nonceSpace, powHash } = await mineSha256Pow(
          minDifficulty,
          undefined,
          () => cancelledRef.current,
        );
        setMining(false);

        const timestamp = Math.floor(Date.now() / 1000);
        const sigMsg = buildClaimSignatureMessage(offer.offer_id, identity.publicKey, timestamp, powHash);
        const sigBytes = await sign(sigMsg);
        if (!sigBytes) {
          setError('Failed to sign the claim. Check your identity and try again.');
          return;
        }

        const result = await rpc.call<ClaimResult>('claim_sponsorship_offer', {
          offer_id: offer.offer_id,
          claimant_pubkey: identity.publicKey,
          application_text: applicationText.trim() || undefined,
          pow_nonce: nonce,
          pow_difficulty: minDifficulty,
          pow_nonce_space: bytesToHex(nonceSpace),
          pow_hash: bytesToHex(powHash),
          signature: bytesToHex(sigBytes),
          timestamp,
        });

        const approved = result.status === 'approved';
        if (approved) {
          toast.success('You are now sponsored! You can post, reply, and react.');
        } else {
          toast.info('Claim submitted. The sponsor will review your request.');
        }
        onClaimed(approved);
        onClose();
      } catch (err) {
        if (err instanceof Error && err.message.includes('cancelled')) return;
        setError(err instanceof Error ? err.message : 'Failed to submit claim');
      } finally {
        setClaimingId(null);
        setMining(false);
      }
    },
    [rpc, connected, identity?.publicKey, applicationText, sign, toast, onClaimed, onClose],
  );

  const copyPubkey = useCallback(async () => {
    if (!identity?.publicKey) return;
    try {
      await navigator.clipboard.writeText(identity.publicKey);
      setPubkeyCopied(true);
      setTimeout(() => setPubkeyCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [identity?.publicKey]);

  if (!isOpen) return null;

  const busy = claimingId !== null;

  return (
    <div className="gsm-overlay" onClick={busy ? undefined : onClose}>
      <div
        className="gsm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gsm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gsm-header">
          <h2 id="gsm-title">Find a Sponsor</h2>
          <button type="button" className="gsm-close" onClick={onClose} disabled={busy} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="gsm-body">
          <p className="gsm-desc">
            An existing member must sponsor your identity before you can post, reply, or react (SPEC_11).
            Claim an open offer below, or share your public key with someone who can sponsor you.
          </p>

          {identity?.publicKey && (
            <div className="gsm-pubkey">
              <span className="gsm-pubkey-label">Your public key</span>
              <code className="gsm-pubkey-code">{identity.publicKey}</code>
              <button type="button" className="gsm-btn gsm-btn-ghost" onClick={copyPubkey}>
                {pubkeyCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          <div className="gsm-application">
            <label htmlFor="gsm-application-text">Application note (required by some sponsors)</label>
            <textarea
              id="gsm-application-text"
              value={applicationText}
              onChange={(e) => setApplicationText(e.target.value.slice(0, 2000))}
              placeholder="Tell the sponsor why you want to join..."
              rows={3}
              maxLength={2000}
              disabled={busy}
            />
          </div>

          {error && <div className="gsm-error">{error}</div>}

          {loading && <div className="gsm-muted">Loading offers...</div>}

          {!loading && offers.length === 0 && !error && (
            <div className="gsm-muted">
              No open sponsorship offers right now. Share your public key with an existing member
              and ask them to create an offer or invite.
            </div>
          )}

          <div className="gsm-offer-list">
            {offers.map((offer) => {
              const isClaiming = claimingId === offer.offer_id;
              const soldOut = offer.slots_remaining <= 0;
              return (
                <div key={offer.offer_id} className="gsm-offer">
                  <div className="gsm-offer-info">
                    <span className="gsm-offer-sponsor">
                      {offer.sponsor_pubkey.substring(0, 8)}…{offer.sponsor_pubkey.slice(-4)}
                    </span>
                    <span className="gsm-offer-meta">
                      {offer.offer_type === 'probationary' ? 'Probationary' : 'Open'}
                      {' · '}
                      {offer.slots_remaining}/{offer.slots_total} slots
                      {offer.auto_approve ? ' · instant' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="gsm-btn gsm-btn-primary"
                    onClick={() => handleClaim(offer)}
                    disabled={busy || soldOut}
                  >
                    {isClaiming ? (mining ? 'Mining…' : 'Claiming…') : soldOut ? 'Full' : 'Claim'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
