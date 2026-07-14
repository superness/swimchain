/**
 * Modal for creating a shareable invite link (SWIM-INV-2)
 *
 * Creates an auto-approve sponsorship offer (default 1 slot) and renders
 * the resulting invite URL with a copy button. Anyone who opens the link
 * and pastes the code during onboarding is sponsored immediately.
 */

import { useState, useEffect, useRef } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { encodeInviteToken, buildInviteUrl } from '../lib/invite';
import { logger } from '../lib/logger';
import './CreateOfferModal.css';
import './CreateInviteLinkModal.css';

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
 * Build the create-offer signature message (same format as CreateOfferModal):
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

/** Invite links always expire after 7 days */
const INVITE_EXPIRES_DAYS = 7;

interface CreateInviteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateInviteLinkModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateInviteLinkModalProps): JSX.Element | null {
  const { rpc } = useRpc();
  const { identity } = useIdentityContext();
  const { sign } = useFeedIdentity();
  const [slots, setSlots] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      setSlots(1);
      setError(null);
      setInviteUrl(null);
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!rpc || !identity?.publicKey || !sign) return;

    if (slots < 1 || slots > 10) {
      setError('Uses must be between 1 and 10.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const offerType = 'probationary' as const;

      // The node floors offers at 8 bits — a 0-PoW invite offer is rejected
      // with "min_pow_difficulty must be >= 8 bits". 8 keeps invite-link
      // onboarding near-instant while carrying real proof-of-work.
      const INVITE_MIN_POW = 8;
      const sigMsg = buildCreateOfferSignatureMessage(
        identity.publicKey, slots, offerType, INVITE_EXPIRES_DAYS,
        INVITE_MIN_POW, false /* applicationRequired */, timestamp,
      );
      const sigBytes = await sign(sigMsg);
      if (!sigBytes) {
        setError('Failed to sign the invite. Check your identity.');
        return;
      }

      const result = await rpc.createSponsorshipOffer({
        sponsorPubkey: identity.publicKey,
        slots,
        offerType,
        expiresDays: INVITE_EXPIRES_DAYS,
        minPowDifficulty: INVITE_MIN_POW,
        applicationRequired: false,
        autoApprove: true,
        signature: bytesToHex(sigBytes),
        timestamp,
      });

      logger.info('[CreateInviteLink] Invite offer created:', result.offer_id);

      const token = encodeInviteToken({
        v: 1,
        offer_id: result.offer_id,
        sponsor: identity.publicKey,
        net: 'testnet',
      });
      setInviteUrl(buildInviteUrl(token));
      onSuccess();
    } catch (err) {
      logger.error('[CreateInviteLink] Failed to create invite:', err);
      setError(err instanceof Error ? err.message : 'Failed to create invite link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('[CreateInviteLink] Copy failed:', err);
    }
  };

  const usesText = slots === 1 ? 'One use' : `Up to ${slots} uses`;

  return (
    <div className="modal-overlay" onClick={submitting ? undefined : onClose}>
      <div
        className="modal-content create-offer-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-invite-link-title"
      >
        <div className="modal-header">
          <h2 id="create-invite-link-title">Create Invite Link</h2>
          <button type="button" className="btn btn-ghost modal-close" onClick={onClose} disabled={submitting}>
            X
          </button>
        </div>

        <div className="modal-body">
          {!inviteUrl ? (
            <>
              <p className="invite-link-intro">
                An invite link lets someone join instantly — no waiting for approval.
                They become part of your sponsorship tree, so only invite people you trust.
              </p>

              <div className="create-offer-field">
                <label htmlFor="invite-slots" className="create-offer-label">
                  Number of Uses
                </label>
                <input
                  id="invite-slots"
                  type="number"
                  className="create-offer-input"
                  value={slots}
                  onChange={(e) => setSlots(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={10}
                  disabled={submitting}
                />
                <span className="create-offer-hint">How many people can join with this link (1-10)</span>
              </div>

              {error && <div className="create-offer-error">{error}</div>}

              <p className="create-offer-warning">
                Note: People who join through your link are sponsored by you immediately.
                You are responsible for their behavior on the network.
              </p>
            </>
          ) : (
            <>
              <p className="invite-link-intro">
                Send this to someone you want to bring in.{' '}
                {usesText}, expires in {INVITE_EXPIRES_DAYS} days.
              </p>

              <div className="invite-link-box">
                <code className="invite-link-url">{inviteUrl}</code>
                <button
                  type="button"
                  className="btn btn-primary invite-link-copy"
                  onClick={handleCopy}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              <p className="create-offer-hint">
                When they open the link they'll get the app, paste the code,
                and land in the network already connected to you.
              </p>
            </>
          )}
        </div>

        <div className="modal-actions">
          {!inviteUrl ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={submitting}
              >
                {submitting ? 'Creating...' : 'Create Invite Link'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
