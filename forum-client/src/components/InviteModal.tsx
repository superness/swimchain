/**
 * Invite Modal Component
 *
 * Modal for inviting users to private spaces.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useInviteToSpace } from '../hooks/useRpc';
import { useActionPow } from '../hooks/useActionPow';
import { ActionType, solutionToRpcParams } from '../lib/action-pow';
import { encryptSpaceKeyForRecipient, deriveX25519Keys, ed25519PublicToX25519, hexToBytes, bytesToHex } from '../lib/x25519';
import './InviteModal.css';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName?: string;
}

export function InviteModal({ isOpen, onClose, spaceId, spaceName }: InviteModalProps): JSX.Element | null {
  const { publicKey, keypair } = useStoredKeypair();
  const userPublicKeyHex = publicKey ? bytesToHex(publicKey) : undefined;
  const { getSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);
  const { invite: inviteToSpace, inviting } = useInviteToSpace();
  const { mine: mineInvitePow, state: inviteMiningState, progress: inviteMiningProgress, cancel: cancelInviteMining } = useActionPow();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [message, setMessage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Combined loading state
  const isMining = inviteMiningState === 'mining';
  const isLoading = loading || inviting || isMining;

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

    if (!keypair || !publicKey) {
      setInviteError('No keypair available');
      return;
    }

    // Validate recipient address
    const recipientHex = recipientAddress.trim();
    if (!recipientHex || recipientHex.length !== 64) {
      setInviteError('Invalid recipient address (must be 64 hex characters)');
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
      const seed = keypair.seed();
      const { secretKey: myX25519SecretKey } = deriveX25519Keys(seed);

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
      const signatureMessage = new TextEncoder().encode(
        `invite:${spaceId}:${bytesToHex(publicKey)}:${recipientHex}:${timestamp}`
      );
      const signature = keypair.sign(signatureMessage);

      // Mine PoW for the invite action
      console.log('[InviteModal] Mining PoW for invite...');
      const inviteeBytes = hexToBytes(recipientHex);
      const powSolution = await mineInvitePow(
        ActionType.Invite,
        inviteeBytes,
        publicKey,
        true, // isTestnet
      );
      const powParams = solutionToRpcParams(powSolution);
      console.log('[InviteModal] PoW complete, nonce:', powSolution.nonce.toString());

      // Send invite via RPC with real PoW
      const result = await inviteToSpace({
        spaceId,
        inviter: bytesToHex(publicKey),
        invitee: recipientHex,
        encryptedSpaceKey: bytesToHex(encryptedSpaceKey),
        signature: bytesToHex(signature),
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        timestamp,
        message: message.trim() || undefined,
      });

      if (result) {
        console.log('Invite sent:', result.inviteHash);
        setSuccess(true);
        setRecipientAddress('');
        setMessage('');

        // Auto-close after success
        setTimeout(() => {
          onClose();
          setSuccess(false);
        }, 1500);
      } else {
        setInviteError('Failed to send invite');
      }

    } catch (err) {
      console.error('Failed to prepare invite:', err);
      setInviteError(err instanceof Error ? err.message : 'Failed to prepare invite');
    } finally {
      setLoading(false);
    }
  }, [keypair, publicKey, spaceId, recipientAddress, message, getSpaceKey, onClose, inviteToSpace, mineInvitePow]);

  const handleClose = useCallback(() => {
    setRecipientAddress('');
    setMessage('');
    setInviteError(null);
    setSuccess(false);
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

          {isMining && (
            <div className="invite-mining" role="status" aria-live="polite">
              <div className="mining-spinner" />
              <p>Mining proof of work...</p>
              {inviteMiningProgress && (
                <div className="mining-stats">
                  <span>Attempts: {inviteMiningProgress.attempts.toLocaleString()}</span>
                  <span>Time: {(inviteMiningProgress.elapsedMs / 1000).toFixed(1)}s</span>
                </div>
              )}
              <button type="button" className="btn btn-ghost" onClick={cancelInviteMining}>
                Cancel Mining
              </button>
            </div>
          )}

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
              {isMining ? 'Mining...' : isLoading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InviteModal;
