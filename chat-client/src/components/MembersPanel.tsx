/**
 * MembersPanel - Member management for a private channel
 *
 * Shows the member list (via get_space_members) with roles, and lets
 * admins/moderators kick members (via kick_member with key rotation).
 * Also hosts the InviteModal so members can send new invites.
 */

import { useState, useCallback } from 'react';
import {
  useIdentityContext,
  wasm,
  generateSpaceKey,
  encryptSpaceKeyForRecipient,
  deriveX25519Keys,
  ed25519PublicToX25519,
  hexToBytes,
  bytesToHex,
  solutionToRpcParams,
} from '@swimchain/frontend';
import { useSpaceMembers, useKickMember, type SpaceMember } from '../hooks/useRpc';
import { usePrivateChannelKeys } from '../hooks/usePrivateSpaceKeys';
import { useActionPow, ActionType } from '../hooks/useActionPow';
import { InviteModal } from './InviteModal';
import { useToast } from './Toast';
import './MembersPanel.css';

interface MembersPanelProps {
  spaceId: string;
  channelName?: string;
  /** Current user's role in this space */
  myRole: 'admin' | 'moderator' | 'member';
  /** Current key version of the space */
  keyVersion: number;
  onClose: () => void;
  /** Called after a successful kick (key rotated) */
  onMembershipChanged?: () => void;
}

function truncatePk(pk: string): string {
  if (pk.length <= 16) return pk;
  return `${pk.slice(0, 8)}...${pk.slice(-6)}`;
}

/** Can `myRole` kick `target`? Mirrors the node's kick_member rules. */
function canKick(myRole: string, target: SpaceMember, myPk: string): boolean {
  if (target.member === myPk) return false; // cannot kick yourself
  if (myRole === 'admin') return true;
  if (myRole === 'moderator') return target.role === 'member';
  return false;
}

export function MembersPanel({
  spaceId,
  channelName,
  myRole,
  keyVersion,
  onClose,
  onMembershipChanged,
}: MembersPanelProps): JSX.Element {
  const { identity } = useIdentityContext();
  const myPk = identity?.publicKey ?? '';

  const { members, loading, error: membersError, refetch } = useSpaceMembers(spaceId);
  const { kick, kicking } = useKickMember();
  const { mine: mineKickPow, state: kickMiningState, progress: kickMiningProgress, cancel: cancelKickMining } = useActionPow();
  const { storeChannelKey, getChannelKeyInfo } = usePrivateChannelKeys(myPk || undefined);
  const toast = useToast();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);

  const isMining = kickMiningState === 'mining';
  const busy = kicking || isMining;

  const handleKick = useCallback(async (target: SpaceMember) => {
    if (!identity?.seed || !identity?.publicKey) {
      setKickError('No identity available');
      return;
    }

    setKickTarget(target.member);
    setKickError(null);

    try {
      // 1. Generate a fresh space key (key rotation: the kicked member must
      //    not be able to read messages sent after the kick).
      const newSpaceKey = generateSpaceKey();

      // 2. Encrypt the new key for every remaining member.
      const seedBytes = hexToBytes(identity.seed);
      const { secretKey: myX25519SecretKey } = deriveX25519Keys(seedBytes);

      const newEncryptedKeys: Record<string, string> = {};
      for (const m of members) {
        if (m.member === target.member) continue; // skip the kicked member
        try {
          const memberX25519Pk = ed25519PublicToX25519(hexToBytes(m.member));
          const encrypted = encryptSpaceKeyForRecipient(
            newSpaceKey,
            memberX25519Pk,
            myX25519SecretKey
          );
          newEncryptedKeys[m.member] = bytesToHex(encrypted);
        } catch (encErr) {
          console.warn('[MembersPanel] Failed to encrypt key for member:', m.member, encErr);
        }
      }

      const newKeyVersion = keyVersion + 1;

      // 3. Mine PoW for the kick action.
      console.log('[MembersPanel] Mining PoW for kick...');
      const powSolution = await mineKickPow(
        ActionType.Engage,
        hexToBytes(target.member),
        hexToBytes(identity.publicKey),
        true // isTestnet
      );
      const powParams = solutionToRpcParams(powSolution);

      // 4. Sign the kick request.
      const timestamp = Math.floor(Date.now() / 1000);
      const keypair = wasm.WasmKeypair.fromSeed(seedBytes);
      const signatureMessage = new TextEncoder().encode(
        `kick:${spaceId}:${identity.publicKey}:${target.member}:${newKeyVersion}:${timestamp}`
      );
      const signature = keypair.sign(signatureMessage);

      // 5. Submit the kick.
      const result = await kick({
        spaceId,
        admin: identity.publicKey,
        member: target.member,
        newEncryptedKeys,
        keyVersion: newKeyVersion,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: bytesToHex(signature),
        timestamp,
      });

      if (result?.success) {
        // 6. Store the rotated key locally so we keep decrypting messages.
        const existing = getChannelKeyInfo(spaceId);
        await storeChannelKey(
          spaceId,
          newSpaceKey,
          existing?.invitedBy ?? identity.publicKey,
          newKeyVersion,
          existing?.channelName ?? channelName
        );

        toast.success('Member kicked. Channel key rotated.');
        refetch();
        onMembershipChanged?.();
      } else {
        setKickError('Failed to kick member');
        toast.error('Failed to kick member. Please try again.');
      }
    } catch (err) {
      console.error('[MembersPanel] Kick failed:', err);
      const msg = err instanceof Error ? err.message : 'Failed to kick member';
      setKickError(msg);
      if (!msg.includes('cancelled')) {
        toast.error(msg);
      }
    } finally {
      setKickTarget(null);
    }
  }, [identity, members, keyVersion, spaceId, channelName, mineKickPow, kick, storeChannelKey, getChannelKeyInfo, refetch, onMembershipChanged, toast]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content members-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="members-panel-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="members-panel-title">
            {channelName ? `Members — ${channelName}` : 'Channel Members'}
          </h2>
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

        <div className="members-panel-body">
          {loading && <div className="members-loading">Loading members...</div>}

          {membersError && (
            <div className="members-error" role="alert">{membersError}</div>
          )}

          {!loading && !membersError && members.length === 0 && (
            <div className="members-empty">No members found.</div>
          )}

          {members.length > 0 && (
            <ul className="members-list">
              {members.map(m => (
                <li key={m.member} className="member-row">
                  <div className="member-avatar" aria-hidden="true">
                    {m.member.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="member-info">
                    <span className="member-pk" title={m.member}>
                      {truncatePk(m.member)}
                      {m.member === myPk && <span className="member-you"> (you)</span>}
                    </span>
                    <span className={`member-role member-role--${m.role}`}>{m.role}</span>
                  </div>
                  {canKick(myRole, m, myPk) && (
                    <button
                      type="button"
                      className="member-kick-btn"
                      onClick={() => handleKick(m)}
                      disabled={busy}
                      title="Kick member (rotates the channel key)"
                    >
                      {kickTarget === m.member ? 'Kicking...' : 'Kick'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isMining && (
            <div className="members-mining" role="status" aria-live="polite">
              <div className="mining-spinner" />
              <span>
                Mining proof of work for kick...
                {kickMiningProgress && ` (${kickMiningProgress.attempts.toLocaleString()} attempts)`}
              </span>
              <button type="button" className="btn btn-ghost" onClick={cancelKickMining}>
                Cancel
              </button>
            </div>
          )}

          {kickError && (
            <div className="members-error" role="alert">{kickError}</div>
          )}
        </div>

        <footer className="members-panel-footer">
          <span className="members-count">
            {members.length} member{members.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowInviteModal(true)}
          >
            Invite
          </button>
        </footer>

        <InviteModal
          isOpen={showInviteModal}
          onClose={() => {
            setShowInviteModal(false);
            refetch();
          }}
          channelId={spaceId}
          channelName={channelName}
        />
      </div>
    </div>
  );
}

export default MembersPanel;
