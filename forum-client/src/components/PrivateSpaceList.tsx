/**
 * Private Space List Component
 *
 * Shows user's private spaces (DMs and group chats) and pending invites.
 * Decrypts space names using stored space keys.
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { usePrivateSpaces, usePrivateSpaceInvites, useAcceptInvite, useDeclineDM, PrivateSpaceInfo, InviteInfo } from '../hooks/useRpc';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { decryptSpaceName } from '../lib/encryption';
import { hexToBytes, bytesToHex, deriveX25519Keys, decryptSpaceKey, ed25519PublicToX25519 } from '../lib/x25519';
import './PrivateSpaceList.css';

interface DecryptedSpace extends PrivateSpaceInfo {
  decryptedName: string | null;
}

interface DecryptedInvite extends InviteInfo {
  decryptedName: string | null;
}

export function PrivateSpaceList(): JSX.Element {
  const { publicKey, keypair } = useStoredKeypair();
  const { identity: nodeIdentity } = useNodeIdentity();

  // Use node identity public key if available, otherwise fall back to stored keypair
  const userPublicKeyHex = nodeIdentity?.publicKey || (publicKey ? bytesToHex(publicKey) : undefined);

  const { spaces, loading: spacesLoading, error: spacesError, refetch: refetchSpaces } = usePrivateSpaces(userPublicKeyHex);
  const { invites, loading: invitesLoading, error: invitesError, refetch: refetchInvites } = usePrivateSpaceInvites(userPublicKeyHex);
  const { accept: acceptInvite, accepting: acceptLoading } = useAcceptInvite();
  const { decline: declineInvite, declining: declineLoading } = useDeclineDM();
  const { getSpaceKey, storeSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);

  const [decryptedSpaces, setDecryptedSpaces] = useState<DecryptedSpace[]>([]);
  const [decryptedInvites, setDecryptedInvites] = useState<DecryptedInvite[]>([]);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [decliningInvite, setDecliningInvite] = useState<string | null>(null);

  // Decrypt space names when spaces change
  useEffect(() => {
    async function decryptNames() {
      const decrypted: DecryptedSpace[] = [];

      for (const space of spaces) {
        // Node-managed mode: the node holds the key and returns the name
        // pre-decrypted — browser-side key lookup below would find nothing and
        // every space rendered as the generic "Private Space" label.
        let decryptedName: string | null = space.name ?? null;

        if (!decryptedName && space.encryptedName) {
          const spaceKey = getSpaceKey(space.spaceId);
          if (spaceKey) {
            try {
              const encryptedBytes = hexToBytes(space.encryptedName);
              decryptedName = await decryptSpaceName(encryptedBytes, spaceKey);
            } catch (err) {
              console.error('Failed to decrypt space name:', err);
            }
          }
        }

        decrypted.push({
          ...space,
          // Disambiguate the no-key fallback — two spaces both labeled
          // "Private Space" are indistinguishable in the sidebar.
          decryptedName: decryptedName || `Private Space ${space.spaceIdBech32.slice(3, 9)}`,
        });
      }

      setDecryptedSpaces(decrypted);
    }

    if (spaces.length > 0) {
      decryptNames();
    } else {
      setDecryptedSpaces([]);
    }
  }, [spaces, getSpaceKey]);

  // Process invites (no decryption until accepted - we don't have the key yet)
  useEffect(() => {
    setDecryptedInvites(invites.map(invite => ({
      ...invite,
      decryptedName: null, // Name will be decrypted after accepting
    })));
  }, [invites]);

  // Handle accepting an invite
  const handleAcceptInvite = useCallback(async (invite: InviteInfo) => {
    if (!keypair || !publicKey || !userPublicKeyHex) return;

    setProcessingInvite(invite.inviteHash);

    try {
      // 1. Sign the accept message
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureMessage = new TextEncoder().encode(
        `accept_invite:${invite.inviteHash}:${userPublicKeyHex}:${timestamp}`
      );
      const signature = keypair.sign(signatureMessage);

      // 2. Call the accept RPC
      const result = await acceptInvite({
        inviteHash: invite.inviteHash,
        acceptor: userPublicKeyHex,
        signature: bytesToHex(signature),
        timestamp,
      });

      if (result) {

        // 3. Decrypt the space key using our X25519 secret key
        const encryptedKeyBytes = hexToBytes(invite.encryptedSpaceKey);
        const myX25519Keys = deriveX25519Keys(keypair.seed());
        const inviterEd25519Pk = hexToBytes(invite.inviter);
        const inviterX25519Pk = ed25519PublicToX25519(inviterEd25519Pk);

        const decryptedKey = decryptSpaceKey(
          encryptedKeyBytes,
          inviterX25519Pk,
          myX25519Keys.secretKey
        );

        if (decryptedKey) {
          // 4. Store the decrypted space key locally
          await storeSpaceKey(
            invite.spaceId,
            decryptedKey,
            invite.inviter,
            0,
            undefined
          );
        } else {
          console.error('Failed to decrypt space key');
        }
      }

      // Refresh both lists
      await Promise.all([refetchSpaces(), refetchInvites()]);
    } catch (err) {
      console.error('Failed to accept invite:', err);
    } finally {
      setProcessingInvite(null);
    }
  }, [keypair, publicKey, userPublicKeyHex, storeSpaceKey, refetchSpaces, refetchInvites, acceptInvite]);

  // Handle declining an invite
  const handleDeclineInvite = useCallback(async (invite: InviteInfo) => {
    if (!keypair || !publicKey || !userPublicKeyHex) return;

    setDecliningInvite(invite.inviteHash);

    try {
      // Sign the decline message
      const timestamp = Math.floor(Date.now() / 1000);
      const signatureMessage = new TextEncoder().encode(
        `decline_dm:${invite.inviter}:${userPublicKeyHex}:${timestamp}`
      );
      const signature = keypair.sign(signatureMessage);

      // Call the decline RPC
      await declineInvite({
        requester: invite.inviter,
        decliner: userPublicKeyHex,
        signature: bytesToHex(signature),
        timestamp,
      });

      // Refresh invites list
      await refetchInvites();
    } catch (err) {
      console.error('Failed to decline invite:', err);
    } finally {
      setDecliningInvite(null);
    }
  }, [keypair, publicKey, userPublicKeyHex, declineInvite, refetchInvites]);

  // Format time ago
  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const loading = spacesLoading || invitesLoading;
  const error = spacesError || invitesError;

  // Check if we have any identity (node or browser-stored)
  if (!userPublicKeyHex) {
    return (
      <div className="private-space-list">
        <div className="private-space-list-empty">
          Create an identity to access private spaces
        </div>
      </div>
    );
  }

  if (loading && spaces.length === 0 && invites.length === 0) {
    return (
      <div className="private-space-list">
        <div className="private-space-list-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="private-space-list">
      {/* Pending Invites Section */}
      {decryptedInvites.length > 0 && (
        <section className="invites-section">
          <h3 className="section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Invites ({decryptedInvites.length})
          </h3>
          <ul className="invite-list">
            {decryptedInvites.map((invite) => (
              <li key={invite.inviteHash} className="invite-item">
                <div className="invite-info">
                  <span className="invite-from">
                    From: {invite.inviter.slice(0, 8)}...
                  </span>
                  <span className="invite-time">
                    {formatTimeAgo(invite.createdAt)}
                  </span>
                </div>
                {invite.message && (
                  <p className="invite-message">{invite.message}</p>
                )}
                <div className="invite-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleAcceptInvite(invite)}
                    disabled={acceptLoading || processingInvite === invite.inviteHash}
                  >
                    {processingInvite === invite.inviteHash ? 'Accepting...' : 'Accept'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeclineInvite(invite)}
                    disabled={declineLoading || decliningInvite === invite.inviteHash}
                  >
                    {decliningInvite === invite.inviteHash ? 'Declining...' : 'Decline'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Private Spaces Section */}
      <section className="spaces-section">
        <div className="section-header">
          <h3 className="section-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Private Spaces
          </h3>
          <NavLink to="/spaces/new/private" className="btn-create-space" title="Create Private Space">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </NavLink>
        </div>

        {decryptedSpaces.length === 0 ? (
          <div className="spaces-empty">
            <p>No private spaces yet</p>
            <NavLink to="/spaces/new/private" className="btn btn-primary btn-sm">
              Create Private Space
            </NavLink>
          </div>
        ) : (
          <ul className="space-list">
            {decryptedSpaces.map((space) => (
              <li key={space.spaceId} className="space-item">
                <NavLink
                  to={`/chat/${space.spaceIdBech32}`}
                  className={({ isActive }) =>
                    `space-link ${isActive ? 'active' : ''}`
                  }
                >
                  <span className="space-icon">
                    {space.memberCount === 2 ? (
                      // DM icon (two people)
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    ) : (
                      // Group icon
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    )}
                  </span>
                  <span className="space-name">{space.decryptedName}</span>
                  <span className="space-member-count">
                    {space.memberCount}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <div className="private-space-error">
          {error}
        </div>
      )}
    </div>
  );
}

export default PrivateSpaceList;
