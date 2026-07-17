/**
 * NodePrivateChannelActions — node-mode (desktop shell) shareable-invite flow.
 *
 * The browser-mode private-channel UI (PrivateChannelsSection / MembersPanel) relies on
 * a local browser keypair and returns null when the node owns the identity. In node mode
 * the node instead mints a self-contained `swiminv1:` invite code (create_space_invite_blob).
 *
 *  - "Invite to this channel" — shown when the current server is a private space the node
 *    is a member of. Opens the InviteModal, which in node mode returns a copyable code.
 *
 * Redeeming an invite ("Join a private channel") lives in the SpaceBrowserModal behind
 * the rail's + button — the single curation surface — not here.
 *
 * Only renders in node mode; browser mode is unchanged (this returns null).
 */

import { useState } from 'react';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { usePrivateSpaces } from '../hooks/useRpc';
import { InviteModal } from './InviteModal';
import './PrivateChannelsSection.css';

export function NodePrivateChannelActions({ serverId }: { serverId?: string }): JSX.Element | null {
  const { mode, identity } = useChatIdentity();
  const { spaces } = usePrivateSpaces(identity?.publicKey);

  const [showInvite, setShowInvite] = useState(false);

  // Resolve the current server's private-space entry. create_space_invite_blob requires
  // the 16-byte HEX space id (the `spaceId` field here), NOT the sp1 bech32 form — so we
  // look the current server up in the private-space list and use its hex id.
  const currentPrivate = serverId
    ? spaces.find(s => s.spaceId === serverId || s.spaceIdBech32 === serverId)
    : undefined;

  // Node mode only; browser mode keeps its existing PrivateChannelsSection flow.
  if (mode !== 'node' || !currentPrivate) return null;

  return (
    <div className="private-channels-section">
      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', justifyContent: 'flex-start' }}
        onClick={() => setShowInvite(true)}
      >
        Invite to this channel
      </button>

      <InviteModal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        channelId={currentPrivate.spaceId}
        channelName={currentPrivate.spaceIdBech32}
      />
    </div>
  );
}

export default NodePrivateChannelActions;
