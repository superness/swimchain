/**
 * Modal for creating a new sponsorship offer (sponsor-only)
 */

import { useState, useEffect, useRef } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useSign } from '../hooks/useSign';
import { logger } from '../lib/logger';
import './CreateOfferModal.css';

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
 * Build the create-offer signature message per design doc:
 * "swimchain-sponsor-offer:" || sponsor(32) || slots(1) || offer_type(1) ||
 * expires_days(4 BE) || min_pow(1) || app_required(1) || timestamp(8 BE)
 */
function buildCreateOfferSignatureMessage(
  sponsorPubkeyHex: string,
  slots: number,
  offerType: 'open' | 'probationary',
  expiresDays: number,
  minPowDifficulty: number,
  applicationRequired: boolean,
  timestamp: number,
): Uint8Array {
  const prefix = new TextEncoder().encode('swimchain-sponsor-offer:');
  const sponsorBytes = hexToBytes(sponsorPubkeyHex);
  const msg = new Uint8Array(prefix.length + 32 + 1 + 1 + 4 + 1 + 1 + 8);
  let offset = 0;
  msg.set(prefix, offset); offset += prefix.length;
  msg.set(sponsorBytes, offset); offset += 32;
  msg[offset] = slots; offset += 1;
  msg[offset] = offerType === 'open' ? 0 : 1; offset += 1;
  const view = new DataView(msg.buffer);
  view.setUint32(offset, expiresDays, false); offset += 4;
  msg[offset] = minPowDifficulty; offset += 1;
  msg[offset] = applicationRequired ? 1 : 0; offset += 1;
  view.setBigUint64(offset, BigInt(timestamp), false);
  return msg;
}

interface CreateOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateOfferModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateOfferModalProps): JSX.Element | null {
  const { rpc, connected } = useRpc();
  const { identity } = useIdentityContext();
  const { sign, canSign } = useSign();

  // Log state for debugging - use console.log to avoid logger formatting issues
  useEffect(() => {
    if (isOpen) {
      console.log('[CreateOfferModal] Modal state - hasRpc:', !!rpc, 'connected:', connected, 'hasIdentity:', !!identity?.publicKey, 'canSign:', canSign);
    }
  }, [isOpen, rpc, connected, identity?.publicKey, canSign]);
  const [offerType, setOfferType] = useState<'open' | 'probationary'>('probationary');
  const [slots, setSlots] = useState(1);
  const [expiresDays, setExpiresDays] = useState(7);
  const [applicationRequired, setApplicationRequired] = useState(false);
  // Node floors offers at 8 bits (min_pow_difficulty must be >= 8).
  const [minPowDifficulty, setMinPowDifficulty] = useState(8);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousActiveElement = useRef<Element | null>(null);

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
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setOfferType('probationary');
      setSlots(1);
      setExpiresDays(7);
      setApplicationRequired(false);
      setMinPowDifficulty(0);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    logger.info('[CreateOffer] handleSubmit called', {
      hasRpc: !!rpc,
      hasIdentity: !!identity?.publicKey,
      canSign,
      identityPubkey: identity?.publicKey?.substring(0, 16),
    });

    if (!rpc || !connected) {
      logger.warn('[CreateOffer] RPC check failed - hasRpc:', !!rpc, 'connected:', connected);
      setError('Not connected to node - please wait for connection');
      return;
    }
    if (!identity?.publicKey) {
      logger.warn('[CreateOffer] No identity');
      setError('No identity loaded');
      return;
    }
    if (!canSign) {
      logger.warn('[CreateOffer] Cannot sign - no signing capability');
      setError('Cannot sign - no identity keypair available');
      return;
    }

    if (slots < 1 || slots > 10) {
      setError('Slots must be between 1 and 10.');
      return;
    }
    if (expiresDays < 1 || expiresDays > 365) {
      setError('Expiration must be between 1 and 365 days.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const timestamp = Math.floor(Date.now() / 1000);

      // Build deterministic signature message and sign with keypair
      const sigMsg = buildCreateOfferSignatureMessage(
        identity.publicKey, slots, offerType, expiresDays,
        minPowDifficulty, applicationRequired, timestamp,
      );
      logger.info('[CreateOffer] Signing message...');
      const sigBytes = await sign(sigMsg);
      if (!sigBytes) {
        logger.error('[CreateOffer] Signing failed - no signature returned');
        setError('Failed to sign request. Check your identity.');
        return;
      }
      const signature = bytesToHex(sigBytes);
      logger.info('[CreateOffer] Signature obtained, calling RPC...');

      const result = await rpc.createSponsorshipOffer({
        sponsorPubkey: identity.publicKey,
        slots,
        offerType,
        expiresDays,
        minPowDifficulty,
        applicationRequired,
        signature,
        timestamp,
      });

      logger.info('[CreateOffer] Offer created:', result);
      onSuccess();
      onClose();
    } catch (err) {
      logger.error('[CreateOffer] Failed to create offer:', err);
      setError(err instanceof Error ? err.message : 'Failed to create offer');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content create-offer-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-offer-modal-title"
      >
        <div className="modal-header">
          <h2 id="create-offer-modal-title">Create Sponsorship Offer</h2>
          <button type="button" className="btn btn-ghost modal-close" onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="create-offer-field">
            <label className="create-offer-label">Offer Type</label>
            <div className="create-offer-radio-group">
              <label className="create-offer-radio">
                <input
                  type="radio"
                  name="offerType"
                  value="probationary"
                  checked={offerType === 'probationary'}
                  onChange={() => setOfferType('probationary')}
                  disabled={submitting}
                />
                <span className="create-offer-radio-text">
                  <strong>Probationary (recommended)</strong> — New member has a 180-day trial.
                  Reduced consequences for you if they misbehave.
                </span>
              </label>
              <label className="create-offer-radio">
                <input
                  type="radio"
                  name="offerType"
                  value="open"
                  checked={offerType === 'open'}
                  onChange={() => setOfferType('open')}
                  disabled={submitting}
                />
                <span className="create-offer-radio-text">
                  <strong>Open</strong> — Full sponsorship. You bear full consequence responsibility.
                </span>
              </label>
            </div>
          </div>

          <div className="create-offer-field">
            <label htmlFor="offer-slots" className="create-offer-label">
              Number of Slots
            </label>
            <input
              id="offer-slots"
              type="number"
              className="create-offer-input"
              value={slots}
              onChange={(e) => setSlots(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              min={1}
              max={10}
              disabled={submitting}
            />
            <span className="create-offer-hint">How many users can claim this offer (1-10)</span>
          </div>

          <div className="create-offer-field">
            <label htmlFor="offer-expires" className="create-offer-label">
              Expires After (days)
            </label>
            <input
              id="offer-expires"
              type="number"
              className="create-offer-input"
              value={expiresDays}
              onChange={(e) => setExpiresDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 7)))}
              min={1}
              max={365}
              disabled={submitting}
            />
            <span className="create-offer-hint">Offer will be removed after this period (1-365 days)</span>
          </div>

          <div className="create-offer-field">
            <label className="create-offer-checkbox">
              <input
                type="checkbox"
                checked={applicationRequired}
                onChange={(e) => setApplicationRequired(e.target.checked)}
                disabled={submitting}
              />
              <span>Require application text from claimants</span>
            </label>
          </div>

          <div className="create-offer-field">
            <label htmlFor="offer-pow" className="create-offer-label">
              Minimum PoW Difficulty
            </label>
            <input
              id="offer-pow"
              type="number"
              className="create-offer-input"
              value={minPowDifficulty}
              onChange={(e) => setMinPowDifficulty(Math.max(8, Math.min(255, parseInt(e.target.value) || 0)))}
              min={8}
              max={255}
              disabled={submitting}
            />
            <span className="create-offer-hint">
              Minimum 8 bits — the network requires real proof-of-work from claimants (8-255).
            </span>
          </div>

          {error && <div className="create-offer-error">{error}</div>}

          <p className="create-offer-warning">
            Note: You are responsible for the behavior of people you sponsor.
            If a sponsored identity is flagged for spam, you may receive a penalty.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Creating...' : 'Create Offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
