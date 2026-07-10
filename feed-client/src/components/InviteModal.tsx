/**
 * Invite Modal Component
 *
 * Modal for inviting users to private spaces.
 * Uses X25519 key exchange to securely share the space key.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIdentityContext } from '../providers/IdentityProvider';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useInviteToSpace, useSpaceInvites } from '../hooks/useRpc';
import { useToast } from './Toast';
import {
  encryptSpaceKeyForRecipient,
  deriveX25519Keys,
  ed25519PublicToX25519,
  hexToBytes,
  bytesToHex,
} from '../lib/x25519';
import { useActionPow } from '../hooks/useActionPow';
import { ActionType } from '../lib/action-pow';
import './InviteModal.css';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName?: string;
}

export function InviteModal({ isOpen, onClose, spaceId, spaceName }: InviteModalProps): JSX.Element | null {
  const { identity, hasValidIdentity, mode } = useIdentityContext();
  const userPublicKeyHex = identity?.publicKey;
  const { getSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);
  const { invite: inviteToSpace, inviting } = useInviteToSpace();
  const { createBlob } = useSpaceInvites();
  const { mine: minePow } = useActionPow();
  const toast = useToast();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [message, setMessage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  // Node-managed invite: the shareable blob the inviter sends out-of-band.
  const [inviteBlob, setInviteBlob] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Combined loading state
  const isLoading = loading || inviting;

  // Focus trap: get all focusable elements within the modal
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  }, []);

  // Focus management: move focus to modal on open, restore on close
  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement;
    const focusableElements = getFocusableElements();
    const firstEl = focusableElements[0];
    if (firstEl) {
      firstEl.focus();
    }
    return () => {
      previousActiveElement.current?.focus();
    };
  }, [isOpen, getFocusableElements]);

  // Keyboard handling: Escape to close, Tab trapping
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
        return;
      }

      // Focus trap: cycle through focusable elements
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) return;

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose, getFocusableElements]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate recipient address (needed in both modes).
    const recipientHex = recipientAddress.trim();
    if (!recipientHex || recipientHex.length !== 64) {
      setInviteError('Invalid recipient address (must be 64 hex characters)');
      return;
    }

    // Node-managed mode (desktop app): the node wraps the space key for the invitee and
    // returns a SELF-CONTAINED `swiminv1:...` blob. There is no reliable network invite
    // propagation, so instead of "sending" we produce a code the inviter shares
    // out-of-band; the invitee redeems it in their app to join.
    if (mode === 'node') {
      setInviteError(null);
      setSuccess(false);
      setLoading(true);
      try {
        const blob = await createBlob(spaceId, recipientHex);
        setInviteBlob(blob);
        toast.success('Invite code created — share it with your invitee.');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create invite';
        setInviteError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!identity?.seed || !identity?.publicKey || !hasValidIdentity) {
      setInviteError('No identity available');
      return;
    }

    // Get space key
    const spaceKey = getSpaceKey(spaceId);
    if (!spaceKey) {
      setInviteError('Space key not found - you may not be a member of this space');
      return;
    }

    setInviteError(null);
    setSuccess(false);
    setLoading(true);

    try {
      // Derive our X25519 secret key
      const seedBytes = hexToBytes(identity.seed);
      const { secretKey: myX25519SecretKey } = deriveX25519Keys(seedBytes);

      // Convert recipient's Ed25519 public key to X25519
      const recipientEd25519Pk = hexToBytes(recipientHex);
      const recipientX25519Pk = ed25519PublicToX25519(recipientEd25519Pk);

      // Encrypt the space key for the recipient
      const encryptedSpaceKey = encryptSpaceKeyForRecipient(
        spaceKey,
        recipientX25519Pk,
        myX25519SecretKey
      );

      // Sign the invite
      const timestamp = Math.floor(Date.now() / 1000);
      const { wasm } = await import('@swimchain/frontend');
      const keypair = wasm.WasmKeypair.fromSeed(seedBytes);
      const signatureMessage = new TextEncoder().encode(
        `invite:${spaceId}:${identity.publicKey}:${recipientHex}:${timestamp}`
      );
      const signature = keypair.sign(signatureMessage);

      // Mine real PoW for invite
      const powContent = new TextEncoder().encode(
        `invite:${spaceId}:${identity.publicKey}:${recipientHex}`
      );
      const authorPubkey = hexToBytes(identity.publicKey);
      const powSolution = await minePow(ActionType.Invite, powContent, authorPubkey, true);

      const powParams = {
        pow_nonce: Number(powSolution.nonce),
        pow_difficulty: powSolution.challenge.difficulty,
        pow_nonce_space: Array.from(powSolution.challenge.nonceSpace)
          .map((b: number) => b.toString(16).padStart(2, '0')).join(''),
        pow_hash: Array.from(powSolution.hash)
          .map((b: number) => b.toString(16).padStart(2, '0')).join(''),
        timestamp: powSolution.challenge.timestamp,
      };

      // Send invite via RPC
      const result = await inviteToSpace({
        spaceId,
        inviter: identity.publicKey,
        invitee: recipientHex,
        encryptedSpaceKey: bytesToHex(encryptedSpaceKey),
        signature: bytesToHex(signature),
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        timestamp: powParams.timestamp,
        message: message.trim() || undefined,
      });

      if (result) {
        setSuccess(true);
        setRecipientAddress('');
        setMessage('');
        toast.success('Invite sent successfully!');

        // Auto-close after success
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 1500);
      } else {
        setInviteError('Failed to send invite');
        toast.error('Failed to send invite. Please try again.');
      }

    } catch (err) {
      console.error('[InviteModal] Failed to prepare invite:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to prepare invite';
      setInviteError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [identity, hasValidIdentity, mode, spaceId, recipientAddress, message, getSpaceKey, onClose, inviteToSpace, createBlob, minePow, toast]);

  const handleClose = useCallback(() => {
    setRecipientAddress('');
    setMessage('');
    setInviteError(null);
    setSuccess(false);
    setInviteBlob(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content invite-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="invite-modal-title">Invite to {spaceName || 'Private Space'}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {inviteBlob ? (
          <div className="invite-form">
            <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
              Share this invite code with the person you invited. They paste it into
              <strong> Discover → Join a private space</strong> to join. It contains the
              space key encrypted just for them.
            </p>
            <textarea
              className="form-textarea"
              value={inviteBlob}
              readOnly
              rows={4}
              onFocus={(e) => e.currentTarget.select()}
              style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  navigator.clipboard?.writeText(inviteBlob).then(
                    () => toast.success('Invite code copied'),
                    () => toast.error('Copy failed — select and copy manually'),
                  );
                }}
              >
                Copy invite code
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="invite-form">
          <div className="form-group">
            <label htmlFor="recipient">Recipient Address</label>
            <input
              type="text"
              id="recipient"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Enter public key (64 hex characters)"
              className="form-input"
              disabled={isLoading}
              autoFocus
            />
            <small className="form-hint">
              The recipient's public key in hex format
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="message">Message (optional)</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message..."
              className="form-textarea"
              disabled={isLoading}
              rows={3}
            />
          </div>

          {inviteError && (
            <div className="invite-error" role="alert">
              {inviteError}
            </div>
          )}

          {success && (
            <div className="invite-success" role="status" aria-live="polite">
              Invite sent successfully!
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading || !recipientAddress.trim()}
            >
              {isLoading ? 'Creating…' : 'Create invite code'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

export default InviteModal;
