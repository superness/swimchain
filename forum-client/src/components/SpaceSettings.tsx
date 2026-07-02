/**
 * Space Settings Component
 *
 * Admin controls for private spaces:
 * - View members and roles
 * - Invite new members
 * - Leave space
 * - Kick members (admin only)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpaceMembers, useLeaveSpace, useKickMember } from '../hooks/useRpc';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { bytesToHex, generateSpaceKey, encryptSpaceKeyForRecipient, deriveX25519Keys, hexToBytes } from '../lib/x25519';
import { useSign } from '../hooks/useSign';
import { useActionPow } from '../hooks/useActionPow';
import { ActionType } from '../lib/action-pow';
import { InviteModal } from './InviteModal';
import './SpaceSettings.css';

interface SpaceSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  isAdmin?: boolean;
}

export function SpaceSettings({
  isOpen,
  onClose,
  spaceId,
  spaceName,
  isAdmin = false,
}: SpaceSettingsProps): JSX.Element | null {
  const navigate = useNavigate();
  const { keypair, publicKey } = useStoredKeypair();
  const userPublicKeyHex = publicKey ? bytesToHex(publicKey) : undefined;
  const { members, loading: membersLoading, refetch: refetchMembers } = useSpaceMembers(spaceId);
  const { leaving } = useLeaveSpace();
  const { kick, kicking } = useKickMember();
  const { removeSpaceKey, storeSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);
  const { sign } = useSign();
  const { mine: mineKickPow } = useActionPow();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [kickingMember, setKickingMember] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

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
      if (e.key === 'Escape' && !leaving && !kicking) {
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
  }, [isOpen, leaving, kicking, onClose, getFocusableElements]);

  // Handle leaving the space
  const handleLeave = useCallback(async () => {
    if (!userPublicKeyHex) return;

    setError(null);

    try {
      // TODO: Call leave RPC with proper signature
      // For now, just remove local key and navigate away
      console.log('Leaving space:', spaceId);

      await removeSpaceKey(spaceId);
      onClose();
      navigate('/spaces');
    } catch (err) {
      console.error('Failed to leave space:', err);
      setError(err instanceof Error ? err.message : 'Failed to leave space');
    }
  }, [spaceId, userPublicKeyHex, removeSpaceKey, onClose, navigate]);

  // Handle kicking a member (admin only)
  const handleKick = useCallback(async (memberPk: string) => {
    if (!isAdmin || !userPublicKeyHex || !keypair) return;

    setKickingMember(memberPk);
    setError(null);

    try {
      // Generate new space key for rotation
      const newSpaceKey = generateSpaceKey();
      const newKeyVersion = Date.now(); // Simple version number

      // Encrypt new key for all remaining members (except the one being kicked)
      const remainingMembers = members.filter(m => m.member !== memberPk);
      const newEncryptedKeys: Record<string, string> = {};

      // Derive our X25519 keys for encryption (from Ed25519 seed)
      const myX25519Keys = deriveX25519Keys(keypair.seed());

      for (const member of remainingMembers) {
        try {
          const memberX25519Pk = hexToBytes(member.member).slice(0, 32);
          const encryptedKey = encryptSpaceKeyForRecipient(
            newSpaceKey,
            memberX25519Pk,
            myX25519Keys.secretKey
          );
          newEncryptedKeys[member.member] = bytesToHex(encryptedKey);
        } catch (err) {
          console.warn(`Failed to encrypt key for member ${member.member}:`, err);
        }
      }

      // Mine real PoW for the kick action
      const kickContent = new TextEncoder().encode(
        `kick_member:${spaceId}:${userPublicKeyHex}:${memberPk}`
      );
      const authorPubkey = hexToBytes(userPublicKeyHex);
      const powSolution = await mineKickPow(ActionType.Invite, kickContent, authorPubkey, true);

      const powParams = {
        pow_nonce: Number(powSolution.nonce),
        pow_difficulty: powSolution.challenge.difficulty,
        pow_nonce_space: Array.from(powSolution.challenge.nonceSpace)
          .map((b: number) => b.toString(16).padStart(2, '0')).join(''),
        pow_hash: Array.from(powSolution.hash)
          .map((b: number) => b.toString(16).padStart(2, '0')).join(''),
        timestamp: powSolution.challenge.timestamp,
      };

      // Sign the kick request
      const signatureMessage = new TextEncoder().encode(
        `kick_member:${spaceId}:${userPublicKeyHex}:${memberPk}:${powParams.timestamp}`
      );
      const signatureBytes = await sign(signatureMessage);
      if (!signatureBytes) {
        setError('Failed to sign kick request');
        return;
      }
      const signature = bytesToHex(signatureBytes);

      const result = await kick({
        spaceId,
        admin: userPublicKeyHex,
        member: memberPk,
        newEncryptedKeys,
        keyVersion: newKeyVersion,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature,
        timestamp: powParams.timestamp,
      });

      if (result?.success) {
        // Store our new space key
        await storeSpaceKey(spaceId, newSpaceKey, userPublicKeyHex);
        // Refresh members list
        await refetchMembers();
      }
    } catch (err) {
      console.error('Failed to kick member:', err);
      setError(err instanceof Error ? err.message : 'Failed to kick member');
    } finally {
      setKickingMember(null);
    }
  }, [isAdmin, userPublicKeyHex, keypair, members, spaceId, kick, storeSpaceKey, refetchMembers, sign, mineKickPow]);

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content space-settings"
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="space-settings-title"
          onClick={e => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="space-settings-title">Space Settings</h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div className="settings-content">
            {/* Space Info */}
            <section className="settings-section">
              <h3>Space Info</h3>
              <div className="space-info-card">
                <div className="space-info-name">{spaceName}</div>
                <div className="space-info-id">
                  <code>{spaceId.slice(0, 16)}...</code>
                </div>
              </div>
            </section>

            {/* Members */}
            <section className="settings-section">
              <div className="section-header">
                <h3>Members ({members.length})</h3>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowInviteModal(true)}
                >
                  Invite
                </button>
              </div>

              {membersLoading ? (
                <div className="members-loading">Loading members...</div>
              ) : (
                <ul className="members-list">
                  {members.map((member) => (
                    <li key={member.member} className="member-row">
                      <div className="member-info">
                        <span className="member-avatar">
                          {member.member.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="member-details">
                          <span className="member-address">
                            {member.member.slice(0, 8)}...{member.member.slice(-4)}
                          </span>
                          <span className={`member-role-badge ${member.role}`}>
                            {member.role}
                          </span>
                        </div>
                      </div>
                      {isAdmin && member.member !== userPublicKeyHex && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm kick-button"
                          onClick={() => handleKick(member.member)}
                          title="Kick member"
                          disabled={kicking || kickingMember !== null}
                        >
                          {kickingMember === member.member ? (
                            <span className="loading-spinner" />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Danger Zone */}
            <section className="settings-section danger-zone">
              <h3>Danger Zone</h3>

              {!confirmLeave ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmLeave(true)}
                  disabled={leaving}
                >
                  Leave Space
                </button>
              ) : (
                <div className="confirm-leave">
                  <p>Are you sure you want to leave this space? You'll need a new invite to rejoin.</p>
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setConfirmLeave(false)}
                      disabled={leaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleLeave}
                      disabled={leaving}
                    >
                      {leaving ? 'Leaving...' : 'Yes, Leave'}
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="settings-error" role="alert">{error}</div>}
            </section>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          refetchMembers();
        }}
        spaceId={spaceId}
        spaceName={spaceName}
      />
    </>
  );
}

export default SpaceSettings;
