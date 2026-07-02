/**
 * DM Inbox - Pending DM requests and active DM conversations
 *
 * DMs are private spaces with exactly 2 members. Accepting a request:
 * 1. Decrypts the requester's key share (X25519 box) to recover the space key
 * 2. Re-encrypts the space key for the requester as our key share (completes DH)
 * 3. Signs the acceptance with our Ed25519 identity key
 * 4. Stores the space key locally so the DM space can be decrypted
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { usePrivateSpaces, usePendingDMRequests, useAcceptDM, useDeclineDM } from '../hooks/useRpc';
import {
  bytesToHex,
  hexToBytes,
  deriveX25519Keys,
  ed25519PublicToX25519,
  decryptSpaceKey,
  encryptSpaceKeyForRecipient,
} from '../lib/x25519';
import './DmInbox.css';

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 604800) + 'w ago';
}

export function DmInbox(): JSX.Element {
  const navigate = useNavigate();
  const { publicKey, keypair } = useStoredKeypair();
  const userPublicKeyHex = useMemo(() => (publicKey ? bytesToHex(publicKey) : null), [publicKey]);
  const { storeSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex ?? undefined);
  const {
    spaces: allPrivateSpaces,
    loading: spacesLoading,
    refetch: refetchSpaces,
  } = usePrivateSpaces(userPublicKeyHex ?? undefined);
  const { requests: pendingRequests, refetch: refetchRequests } = usePendingDMRequests(
    userPublicKeyHex ?? undefined
  );
  const { accept, accepting } = useAcceptDM();
  const { decline, declining } = useDeclineDM();
  const [actionError, setActionError] = useState<string | null>(null);

  const dmSpaces = useMemo(() => {
    return (allPrivateSpaces ?? []).filter(
      s => s.memberCount <= 2 || (s.encryptedName ?? '').indexOf('<>') >= 0
    );
  }, [allPrivateSpaces]);

  const handleAcceptDm = async (req: { requester: string; keyShare: string }) => {
    if (!userPublicKeyHex || !keypair) {
      setActionError('No identity available');
      return;
    }
    setActionError(null);

    try {
      // Derive our X25519 keys from our Ed25519 seed
      const { secretKey: myX25519SecretKey } = deriveX25519Keys(keypair.seed());

      // Convert the requester's Ed25519 public key to X25519
      const requesterX25519Pk = ed25519PublicToX25519(hexToBytes(req.requester));

      // Decrypt the requester's key share to recover the DM space key
      const spaceKey = decryptSpaceKey(
        hexToBytes(req.keyShare),
        requesterX25519Pk,
        myX25519SecretKey
      );
      if (!spaceKey) {
        setActionError('Could not decrypt the key share in this request. It may be corrupted.');
        return;
      }

      // Our key share: the space key re-encrypted for the requester (completes the DH exchange)
      const keyShare = bytesToHex(
        encryptSpaceKeyForRecipient(spaceKey, requesterX25519Pk, myX25519SecretKey)
      );

      // Sign the acceptance with our Ed25519 identity key
      const timestamp = Math.floor(Date.now() / 1000);
      const message = new TextEncoder().encode(
        `dm_accept:${req.requester}:${userPublicKeyHex}:${timestamp}`
      );
      const signature = bytesToHex(keypair.sign(message));

      const result = await accept({
        requester: req.requester,
        acceptor: userPublicKeyHex,
        keyShare,
        signature,
        timestamp,
      });

      if (result) {
        // Persist the space key locally so we can decrypt the DM space
        const spaceName = `${truncateAddr(userPublicKeyHex)} <> ${truncateAddr(req.requester)}`;
        await storeSpaceKey(result.spaceId, spaceKey, req.requester, 0, spaceName);
        refetchRequests();
        refetchSpaces();
        navigate(`/space/${result.spaceId}`);
      }
    } catch (err) {
      console.error('[DmInbox] Failed to accept DM request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to accept DM request');
    }
  };

  const handleDeclineDm = async (requester: string) => {
    if (!userPublicKeyHex || !keypair) {
      setActionError('No identity available');
      return;
    }
    setActionError(null);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = new TextEncoder().encode(
        `dm_decline:${requester}:${userPublicKeyHex}:${timestamp}`
      );
      const signature = bytesToHex(keypair.sign(message));

      await decline({ requester, decliner: userPublicKeyHex, signature, timestamp });
      refetchRequests();
    } catch (err) {
      console.error('[DmInbox] Failed to decline DM request:', err);
      setActionError(err instanceof Error ? err.message : 'Failed to decline DM request');
    }
  };

  return (
    <div className="dm-inbox">
      <header className="dm-inbox__header">
        <h1 className="dm-inbox__title">Messages</h1>
        <Link to="/discover" className="btn btn-primary btn-sm">New Message</Link>
      </header>
      {actionError && (
        <div className="dm-inbox__error" role="alert">{actionError}</div>
      )}
      {pendingRequests.length > 0 && (
        <section className="dm-inbox__section">
          <h2 className="dm-inbox__section-title">Pending Requests ({pendingRequests.length})</h2>
          <div className="dm-inbox__list">
            {pendingRequests.map(req => (
              <div key={req.requestHash} className="dm-inbox__item dm-inbox__item--pending">
                <div className="dm-inbox__item-avatar">{req.requester.substring(0, 2).toUpperCase()}</div>
                <div className="dm-inbox__item-info">
                  <span className="dm-inbox__item-name">{truncateAddr(req.requester)}</span>
                  <span className="dm-inbox__item-preview">Wants to start a conversation</span>
                </div>
                <div className="dm-inbox__item-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleAcceptDm(req)}
                    disabled={accepting || declining}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDeclineDm(req.requester)}
                    disabled={accepting || declining}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="dm-inbox__section">
        <h2 className="dm-inbox__section-title">Conversations ({dmSpaces.length})</h2>
        {spacesLoading ? (
          <div className="dm-inbox__loading">Loading...</div>
        ) : dmSpaces.length === 0 ? (
          <div className="dm-inbox__empty">
            <h3>No conversations yet</h3>
            <p>Search for users in Discover to start a conversation.</p>
            <Link to="/discover" className="btn btn-primary">Find Users</Link>
          </div>
        ) : (
          <div className="dm-inbox__list">
            {dmSpaces.map(space => (
              <Link key={space.spaceId} to={`/space/${space.spaceId}`} className="dm-inbox__item">
                <div className="dm-inbox__item-avatar">#</div>
                <div className="dm-inbox__item-info">
                  <span className="dm-inbox__item-name">
                    {space.encryptedName ? truncateAddr(space.encryptedName) : 'Space ' + truncateAddr(space.spaceId)}
                  </span>
                  <span className="dm-inbox__item-preview">
                    {space.memberCount} member(s) &middot; Joined {formatTimeAgo(space.joinedAt)}
                  </span>
                </div>
                <span className="dm-inbox__item-arrow">&rsaquo;</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
