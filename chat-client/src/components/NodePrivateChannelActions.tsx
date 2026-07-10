/**
 * NodePrivateChannelActions — node-mode (desktop shell) shareable-invite flow.
 *
 * The browser-mode private-channel UI (PrivateChannelsSection / MembersPanel) relies on
 * a local browser keypair and returns null when the node owns the identity. In node mode
 * the node instead mints a self-contained `swiminv1:` invite code (create_space_invite_blob)
 * and redeems one to join (redeem_space_invite). This component surfaces both:
 *
 *  - "Invite to this channel" — shown when the current server is a private space the node
 *    is a member of. Opens the InviteModal, which in node mode returns a copyable code.
 *  - "Join a private channel" — paste a `swiminv1:` code to redeem + navigate to it.
 *
 * Only renders in node mode; browser mode is unchanged (this returns null).
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { usePrivateSpaces, useSpaceInvites } from '../hooks/useRpc';
import { InviteModal } from './InviteModal';
import { useToast } from './Toast';
import './PrivateChannelsSection.css';

export function NodePrivateChannelActions({ serverId }: { serverId?: string }): JSX.Element | null {
  const { mode, identity } = useChatIdentity();
  const { spaces } = usePrivateSpaces(identity?.publicKey);
  const { redeem } = useSpaceInvites();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [showInvite, setShowInvite] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [blob, setBlob] = useState('');
  const [joining, setJoining] = useState(false);

  // Resolve the current server's private-space entry. create_space_invite_blob requires
  // the 16-byte HEX space id (the `spaceId` field here), NOT the sp1 bech32 form — so we
  // look the current server up in the private-space list and use its hex id.
  const currentPrivate = serverId
    ? spaces.find(s => s.spaceId === serverId || s.spaceIdBech32 === serverId)
    : undefined;

  const handleJoin = useCallback(async () => {
    const code = blob.trim();
    if (!code) return;
    setJoining(true);
    try {
      const { spaceId, name } = await redeem(code);
      success(`Joined ${name || 'private channel'}`);
      setBlob('');
      setShowJoin(false);
      // Chat routes to a server by its hex space id (matches how servers are keyed).
      navigate(`/channels/${spaceId}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not redeem this invite');
    } finally {
      setJoining(false);
    }
  }, [blob, redeem, navigate, success, showError]);

  // Node mode only; browser mode keeps its existing PrivateChannelsSection flow.
  if (mode !== 'node') return null;

  return (
    <div className="private-channels-section">
      {currentPrivate && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', justifyContent: 'flex-start' }}
          onClick={() => setShowInvite(true)}
        >
          Invite to this channel
        </button>
      )}

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', justifyContent: 'flex-start' }}
        onClick={() => setShowJoin(v => !v)}
      >
        Join a private channel
      </button>

      {showJoin && (
        <div style={{ padding: '0.25rem 0.5rem' }}>
          <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
            Paste an invite code (starts with <code>swiminv1:</code>) someone shared with you.
          </p>
          <textarea
            className="form-textarea"
            value={blob}
            onChange={(e) => setBlob(e.target.value)}
            placeholder="swiminv1:…"
            rows={3}
            disabled={joining}
            style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={joining || !blob.trim()}
            style={{ marginTop: '0.5rem' }}
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        </div>
      )}

      {currentPrivate && (
        <InviteModal
          isOpen={showInvite}
          onClose={() => setShowInvite(false)}
          channelId={currentPrivate.spaceId}
          channelName={currentPrivate.spaceIdBech32}
        />
      )}
    </div>
  );
}

export default NodePrivateChannelActions;
