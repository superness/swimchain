/**
 * Modal for claiming a sponsorship offer
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { logger } from '../lib/logger';
import type { SponsorshipOfferSummary } from '../lib/rpc';
import './ClaimOfferModal.css';

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
 * Mine SHA-256 PoW: find nonce where sha256(nonceSpace || nonce_le) has enough
 * leading zero BITS. The node validates bits (count_leading_zero_bits in
 * offer_validation.rs); this miner previously counted zero BYTES against the
 * same number, over-mining 8x and making any offer above ~24 difficulty
 * exhaust its attempt cap.
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
    if (isCancelled?.()) {
      throw new Error('Mining cancelled');
    }

    // Build input: nonceSpace(32) || nonce_le(8)
    const input = new Uint8Array(40);
    input.set(nonceSpace, 0);
    const view = new DataView(input.buffer);
    // Write nonce as u64 little-endian (split into two u32s)
    view.setUint32(32, nonce & 0xFFFFFFFF, true);
    view.setUint32(36, 0, true); // upper 32 bits = 0 since nonce fits in u32

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
      onProgress?.(nonce);
      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  throw new Error('PoW mining exhausted max attempts');
}

/**
 * Build the claim signature message: offer_id(16) + claimant(32) + timestamp(8 BE) + pow_hash(32)
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

interface ClaimOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  offer: SponsorshipOfferSummary | null;
}

export function ClaimOfferModal({
  isOpen,
  onClose,
  onSuccess,
  offer,
}: ClaimOfferModalProps): JSX.Element | null {
  const { rpc } = useRpc();
  const { identity } = useIdentityContext();
  // Unified signer: node's sign_message RPC when embedded, browser keypair otherwise.
  const { sign } = useFeedIdentity();
  const [applicationText, setApplicationText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mining, setMining] = useState(false);
  const [miningProgress, setMiningProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const previousActiveElement = useRef<Element | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
    }
    return () => {
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting && !mining) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, mining, onClose]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setApplicationText('');
      setError(null);
      setMining(false);
      setMiningProgress(0);
      setSubmitting(false);
      cancelledRef.current = false;
    }
  }, [isOpen]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    onClose();
  }, [onClose]);

  if (!isOpen || !offer) return null;

  const handleSubmit = async () => {
    if (!rpc || !identity?.publicKey || !sign) return;
    if (offer.requirements.application_required && !applicationText.trim()) {
      setError('Application text is required for this offer.');
      return;
    }

    setSubmitting(true);
    setMining(true);
    setError(null);
    setMiningProgress(0);
    cancelledRef.current = false;

    try {
      // Step 1: Mine SHA-256 PoW
      const minDifficulty = offer.requirements.min_pow_difficulty > 0
        ? offer.requirements.min_pow_difficulty
        : 1;

      logger.info('[ClaimOffer] Starting PoW mining, difficulty:', minDifficulty);

      const { nonce, nonceSpace, powHash } = await mineSha256Pow(
        minDifficulty,
        (attempts) => setMiningProgress(attempts),
        () => cancelledRef.current,
      );

      logger.info('[ClaimOffer] PoW mined, nonce:', nonce);
      setMining(false);

      // Step 2: Sign the claim message
      const timestamp = Math.floor(Date.now() / 1000);
      const sigMsg = buildClaimSignatureMessage(
        offer.offer_id,
        identity.publicKey,
        timestamp,
        powHash,
      );
      const sigBytes = await sign(sigMsg);
      if (!sigBytes) {
        setError('Failed to sign claim. Check your identity.');
        return;
      }

      // Step 3: Submit claim
      await rpc.claimSponsorshipOffer({
        offerId: offer.offer_id,
        claimantPubkey: identity.publicKey,
        applicationText: applicationText.trim() || undefined,
        powNonce: nonce,
        powDifficulty: minDifficulty,
        powNonceSpace: bytesToHex(nonceSpace),
        powHash: bytesToHex(powHash),
        signature: bytesToHex(sigBytes),
        timestamp,
      });

      logger.info('[ClaimOffer] Claim submitted successfully');
      onSuccess();
      onClose();
    } catch (err) {
      logger.error('[ClaimOffer] Failed to submit claim:', err);
      if (err instanceof Error && err.message.includes('cancelled')) {
        // User cancelled — don't show error
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to submit claim');
    } finally {
      setSubmitting(false);
      setMining(false);
    }
  };

  const typeLabel = offer.offer_type === 'probationary'
    ? 'Probationary (180-day trial period)'
    : 'Open (full sponsorship)';

  const expiresIn = (() => {
    const diff = offer.expires_at - Math.floor(Date.now() / 1000);
    if (diff <= 0) return 'expired';
    const days = Math.floor(diff / 86400);
    return days > 0 ? `in ${days} days` : `in ${Math.floor(diff / 3600)} hours`;
  })();

  const isBusy = submitting || mining;

  return (
    <div className="modal-overlay" onClick={isBusy ? undefined : onClose}>
      <div
        className="modal-content claim-offer-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="claim-modal-title"
      >
        <div className="modal-header">
          <h2 id="claim-modal-title">Claim Sponsorship Offer</h2>
          <button type="button" className="btn btn-ghost modal-close" onClick={handleCancel} disabled={isBusy}>
            X
          </button>
        </div>

        <div className="modal-body">
          <div className="claim-offer-info">
            <div className="claim-offer-row">
              <span className="claim-label">Sponsor:</span>
              <span className="claim-value claim-mono">
                {offer.sponsor_pubkey.substring(0, 8)}...{offer.sponsor_pubkey.substring(offer.sponsor_pubkey.length - 4)}
              </span>
            </div>
            <div className="claim-offer-row">
              <span className="claim-label">Type:</span>
              <span className="claim-value">{typeLabel}</span>
            </div>
            <div className="claim-offer-row">
              <span className="claim-label">Expires:</span>
              <span className="claim-value">{expiresIn}</span>
            </div>
          </div>

          <div className="claim-application">
            <label htmlFor="application-text" className="claim-application-label">
              Application {offer.requirements.application_required ? '(required by sponsor)' : '(optional)'}
            </label>
            <textarea
              id="application-text"
              className="claim-application-input"
              value={applicationText}
              onChange={(e) => setApplicationText(e.target.value.slice(0, 2000))}
              placeholder="Tell the sponsor why you want to join..."
              rows={4}
              maxLength={2000}
              disabled={isBusy}
            />
            <span className="claim-char-count">{applicationText.length}/2000 characters</span>
          </div>

          {mining && (
            <div className="claim-mining-progress">
              <div className="claim-mining-label">Mining proof-of-work...</div>
              <div className="claim-mining-bar">
                <div
                  className="claim-mining-bar-fill"
                  style={{ width: `${Math.min((miningProgress / 5000) * 100, 95)}%` }}
                />
              </div>
              <div className="claim-mining-attempts">{miningProgress.toLocaleString()} attempts</div>
            </div>
          )}

          {error && <div className="claim-error">{error}</div>}

          <p className="claim-disclaimer">
            By claiming, your public key is shared with the sponsor.
            They decide whether to approve your request.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={handleCancel} disabled={isBusy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isBusy}
          >
            {mining ? 'Mining...' : submitting ? 'Submitting...' : 'Submit Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
