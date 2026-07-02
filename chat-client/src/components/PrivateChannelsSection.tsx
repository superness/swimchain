/**
 * PrivateChannelsSection - Sidebar section for private channel management
 *
 * Shows:
 * - Pending invites inbox (badge + accept/decline via accept_invite/decline_invite)
 * - "My private channels" list (via get_my_private_spaces)
 *
 * Clicking a private channel opens the MembersPanel (member list + kick + invite).
 * On accept, the invite's encrypted space key is decrypted with our X25519 key
 * and stored locally so private messages can be decrypted.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  useIdentityContext,
  wasm,
  deriveX25519Keys,
  ed25519PublicToX25519,
  decryptSpaceKey,
  decryptSpaceName,
  hexToBytes,
  bytesToHex,
} from '@swimchain/frontend';
import {
  usePrivateSpaces,
  useMyInvites,
  useAcceptInvite,
  useDeclineInvite,
  type PendingInvite,
  type PrivateSpaceInfo,
} from '../hooks/useRpc';
import { usePrivateChannelKeys } from '../hooks/usePrivateSpaceKeys';
import { MembersPanel } from './MembersPanel';
import { useToast } from './Toast';
import './PrivateChannelsSection.css';

function truncatePk(pk: string): string {
  if (pk.length <= 16) return pk;
  return `${pk.slice(0, 8)}...${pk.slice(-6)}`;
}

export function PrivateChannelsSection(): JSX.Element | null {
  const { identity } = useIdentityContext();
  const myPk = identity?.publicKey;

  const { invites, refetch: refetchInvites } = useMyInvites(myPk);
  const { spaces, refetch: refetchSpaces } = usePrivateSpaces(myPk);
  const { accept, accepting } = useAcceptInvite();
  const { decline, declining } = useDeclineInvite();
  const { getChannelKey, getChannelKeyInfo, storeChannelKey } = usePrivateChannelKeys(myPk);
  const toast = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [openChannel, setOpenChannel] = useState<PrivateSpaceInfo | null>(null);
  const [decryptedNames, setDecryptedNames] = useState<Record<string, string>>({});

  // Decrypt channel names for spaces where we hold the key locally.
  useEffect(() => {
    let cancelled = false;

    const decryptNames = async () => {
      const names: Record<string, string> = {};
      for (const space of spaces) {
        // Prefer the locally stored name (set at create/accept time)
        const keyInfo = getChannelKeyInfo(space.spaceId);
        if (keyInfo?.channelName) {
          names[space.spaceId] = keyInfo.channelName;
          continue;
        }
        if (!space.encryptedName) continue;
        const key = getChannelKey(space.spaceId);
        if (!key) continue;
        try {
          const name = await decryptSpaceName(hexToBytes(space.encryptedName), key);
          if (name) names[space.spaceId] = name;
        } catch {
          // Leave undecrypted; we fall back to the truncated id
        }
      }
      if (!cancelled) setDecryptedNames(names);
    };

    if (spaces.length > 0) decryptNames();
    return () => { cancelled = true; };
  }, [spaces, getChannelKey, getChannelKeyInfo]);

  /** Sign a message with the identity seed */
  const sign = useCallback((message: string): string | null => {
    if (!identity?.seed) return null;
    const keypair = wasm.WasmKeypair.fromSeed(hexToBytes(identity.seed));
    return bytesToHex(keypair.sign(new TextEncoder().encode(message)));
  }, [identity]);

  const handleAccept = useCallback(async (invite: PendingInvite) => {
    if (!identity?.seed || !identity?.publicKey) {
      toast.error('Identity required to accept invites');
      return;
    }

    setBusyInvite(invite.inviteHash);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = sign(`accept_invite:${invite.inviteHash}:${timestamp}`);
      if (!signature) {
        toast.error('Failed to sign accept request');
        return;
      }

      const result = await accept({
        inviteHash: invite.inviteHash,
        acceptor: identity.publicKey,
        signature,
        timestamp,
      });

      if (!result) {
        toast.error('Failed to accept invite');
        return;
      }

      // Decrypt the channel key shared by the inviter (X25519 + AES).
      let storedKey = false;
      try {
        const seedBytes = hexToBytes(identity.seed);
        const { secretKey: myX25519SecretKey } = deriveX25519Keys(seedBytes);
        const inviterX25519Pk = ed25519PublicToX25519(hexToBytes(invite.inviter));
        const channelKey = decryptSpaceKey(
          hexToBytes(invite.encryptedSpaceKey),
          inviterX25519Pk,
          myX25519SecretKey
        );

        if (channelKey) {
          await storeChannelKey(result.spaceId, channelKey, invite.inviter, 0);
          storedKey = true;
        }
      } catch (decErr) {
        console.warn('[PrivateChannels] Failed to decrypt channel key:', decErr);
      }

      if (storedKey) {
        toast.success('Invite accepted! You joined the private channel.');
      } else {
        toast.warning('Invite accepted, but the channel key could not be decrypted. Ask the inviter to re-invite you.');
      }

      refetchInvites();
      refetchSpaces();
    } catch (err) {
      console.error('[PrivateChannels] Accept failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setBusyInvite(null);
    }
  }, [identity, sign, accept, storeChannelKey, refetchInvites, refetchSpaces, toast]);

  const handleDecline = useCallback(async (invite: PendingInvite) => {
    if (!identity?.publicKey) return;

    setBusyInvite(invite.inviteHash);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = sign(`decline_invite:${invite.inviteHash}:${timestamp}`);
      if (!signature) {
        toast.error('Failed to sign decline request');
        return;
      }

      const ok = await decline({
        inviteHash: invite.inviteHash,
        decliner: identity.publicKey,
        signature,
        timestamp,
      });

      if (ok) {
        toast.info('Invite declined.');
        refetchInvites();
      } else {
        toast.error('Failed to decline invite');
      }
    } catch (err) {
      console.error('[PrivateChannels] Decline failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to decline invite');
    } finally {
      setBusyInvite(null);
    }
  }, [identity, sign, decline, refetchInvites, toast]);

  // Nothing to show without an identity
  if (!myPk) return null;

  const hasContent = invites.length > 0 || spaces.length > 0;

  return (
    <div className="private-channels-section">
      <button
        type="button"
        className="private-section-header"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`private-section-arrow ${collapsed ? 'collapsed' : ''}`}
        >
          <path d="M7 10L12 15L17 10H7Z" />
        </svg>
        <span className="private-section-title">Private Channels</span>
        {invites.length > 0 && (
          <span className="invites-badge" title={`${invites.length} pending invite(s)`}>
            {invites.length}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="private-section-body">
          {/* Pending invites inbox */}
          {invites.map(invite => (
            <div key={invite.inviteHash} className="invite-item">
              <div className="invite-item-info">
                <span className="invite-item-title">Channel invite</span>
                <span className="invite-item-from" title={invite.inviter}>
                  from {truncatePk(invite.inviter)}
                </span>
              </div>
              <div className="invite-item-actions">
                <button
                  type="button"
                  className="invite-accept-btn"
                  onClick={() => handleAccept(invite)}
                  disabled={accepting || declining || busyInvite === invite.inviteHash}
                  title="Accept invite"
                  aria-label="Accept invite"
                >
                  {busyInvite === invite.inviteHash ? '...' : 'Accept'}
                </button>
                <button
                  type="button"
                  className="invite-decline-btn"
                  onClick={() => handleDecline(invite)}
                  disabled={accepting || declining || busyInvite === invite.inviteHash}
                  title="Decline invite"
                  aria-label="Decline invite"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}

          {/* My private channels */}
          {spaces.map(space => (
            <button
              key={space.spaceId}
              type="button"
              className="private-channel-item"
              onClick={() => setOpenChannel(space)}
              title={`${space.memberCount} member(s) — click to manage`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="private-channel-lock" aria-hidden="true">
                <path d="M17 11V7C17 4.243 14.756 2 12 2C9.243 2 7 4.243 7 7V11C5.897 11 5 11.896 5 13V20C5 21.103 5.897 22 7 22H17C18.103 22 19 21.103 19 20V13C19 11.896 18.103 11 17 11ZM15 11H9V7C9 5.346 10.346 4 12 4C13.654 4 15 5.346 15 7V11Z" />
              </svg>
              <span className="private-channel-name">
                {decryptedNames[space.spaceId] ?? truncatePk(space.spaceIdBech32 || space.spaceId)}
              </span>
              {space.role !== 'member' && (
                <span className={`private-channel-role private-channel-role--${space.role}`}>
                  {space.role === 'admin' ? 'owner' : 'mod'}
                </span>
              )}
            </button>
          ))}

          {!hasContent && (
            <div className="private-section-empty">No private channels or invites</div>
          )}
        </div>
      )}

      {/* Member management panel */}
      {openChannel && (
        <MembersPanel
          spaceId={openChannel.spaceId}
          channelName={decryptedNames[openChannel.spaceId]}
          myRole={openChannel.role}
          keyVersion={openChannel.keyVersion}
          onClose={() => setOpenChannel(null)}
          onMembershipChanged={refetchSpaces}
        />
      )}
    </div>
  );
}

export default PrivateChannelsSection;
