/**
 * Chat View Component
 *
 * Main chat interface for private spaces.
 * Displays messages and allows sending new ones.
 *
 * NOTE: Uses submitReply + real Argon2id PoW (not the phantom post_to_private_space).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSpaceMembers, usePostSubmit, usePrivateContent, usePrivateSpaces } from '../hooks/useRpc';
import { usePostPow } from '../hooks/useActionPow';
import { solutionToRpcParams } from '../lib/action-pow';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { isInIframe } from '../hooks/useParentRpcConfig';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { usePrivateSpaceMessages } from '../hooks/usePrivateSpaceMessages';
import { encryptWithSpaceKey } from '../lib/encryption';
import { bytesToHex, hexToBytes } from '../lib/x25519';
import { InviteModal } from './InviteModal';
import { SpaceSettings } from './SpaceSettings';
import { PowProgress } from './PowProgress';
import './ChatView.css';

export function ChatView(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { publicKey } = useStoredKeypair();
  const { identity, sign } = useNodeIdentity();
  // Node-managed mode (desktop shell): the node owns the identity + space key, so we use
  // the node identity and node-side encrypt/decrypt instead of a local browser keypair.
  const embedded = isInIframe();
  const userPublicKeyHex = embedded ? (identity?.publicKey || undefined) : (publicKey ? bytesToHex(publicKey) : undefined);
  const { getSpaceKey, getSpaceKeyInfo } = usePrivateSpaceKeys(userPublicKeyHex);
  const { members, loading: membersLoading } = useSpaceMembers(spaceId);
  const { submitPost, submitting } = usePostSubmit();
  const { state: powState, progress: powProgress, minePost, cancel: cancelPow } = usePostPow();
  const { encryptForSpace } = usePrivateContent();
  const { spaces: myPrivateSpaces } = usePrivateSpaces(userPublicKeyHex);

  // Browser mode: local space key. Node mode: no local key — membership, the canonical
  // hex space id, and the decrypted name all come from the node's private-space list.
  const spaceKey = (!embedded && spaceId) ? getSpaceKey(spaceId) : null;
  const spaceKeyInfo = (!embedded && spaceId) ? getSpaceKeyInfo(spaceId) : null;
  const nodeSpace = (embedded && spaceId)
    ? myPrivateSpaces.find(s => s.spaceId === spaceId || s.spaceIdBech32 === spaceId)
    : undefined;
  // The node RPCs disagree on space-id format: submit_post / list_posts_for_space want
  // the sp1 BECH32 id; encrypt_private_content / decrypt_private_content want the 16-byte
  // HEX id. Resolve both from the node's private-space list.
  const listSpaceId = embedded ? (nodeSpace?.spaceIdBech32 ?? spaceId) : spaceId; // bech32
  const cryptoSpaceId = embedded ? (nodeSpace?.spaceId ?? spaceId) : spaceId;      // hex
  const isMember = embedded ? !!nodeSpace : !!spaceKey;

  // Fetch messages: list via bech32, decrypt (node mode) via the hex crypto id.
  const {
    messages: backendMessages,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = usePrivateSpaceMessages(listSpaceId, spaceKey, { pollInterval: 3000, nodeMode: embedded, cryptoSpaceId });

  const [spaceName, setSpaceName] = useState<string>('Private Space');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMining = powState === 'mining';
  const isBusy = sending || isMining || submitting;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Space name: node mode gets it decrypted from the node's private-space list; browser
  // mode reads it from the locally-stored space-key info.
  useEffect(() => {
    if (embedded) {
      if (nodeSpace?.name) setSpaceName(nodeSpace.name);
      return;
    }
    if (spaceKeyInfo?.spaceName) setSpaceName(spaceKeyInfo.spaceName);
  }, [embedded, nodeSpace, spaceKeyInfo]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [backendMessages]);

  // Handle sending a message with real Argon2id PoW
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !spaceId || !identity || !sign) return;
    // Membership/keys differ by mode: node mode needs the resolved hex space id;
    // browser mode needs the local space key + browser public key.
    if (embedded ? !cryptoSpaceId : (!spaceKey || !publicKey)) return;

    setSending(true);
    setError(null);

    try {
      // Encrypt the message. Node mode: the node holds the space key, so we ask it to
      // encrypt. Browser mode: encrypt locally with the stored space key.
      let encryptedContent: string;
      if (embedded) {
        const c = await encryptForSpace(cryptoSpaceId!, newMessage.trim());
        if (!c) {
          throw new Error('Could not encrypt for this space — are you a member?');
        }
        encryptedContent = c;
      } else {
        encryptedContent = await encryptWithSpaceKey(newMessage.trim(), spaceKey!);
      }

      // Author identity: node identity when embedded, local keypair otherwise.
      const authorHex = embedded ? identity.publicKey : bytesToHex(publicKey!);
      const authorBytes = embedded ? hexToBytes(identity.publicKey) : new Uint8Array(publicKey!);

      // Messages are POSTS to the space (empty title), NOT replies — a private space has
      // no root thread to reply to, and submit_reply requires a sha256 content-id parent.
      // submit_post binds PoW to sha256(`${title}\n\n${body}`), so mine over that exact
      // string (title empty → "\n\n" + ciphertext).
      const postContent = `\n\n${encryptedContent}`;
      const mined = await minePost(postContent, authorBytes, true);
      const powParams = solutionToRpcParams(mined);

      const result = await submitPost(
        embedded ? listSpaceId! : spaceId,   // submit_post wants the sp1 bech32 id
        '',
        encryptedContent,
        authorHex,
        sign,
        powParams,
      );

      if (!result.success) {
        throw new Error('Failed to post message');
      }

      // Clear input and refresh messages
      setNewMessage('');
      setTimeout(() => refetchMessages(), 500);

    } catch (err) {
      console.error('Failed to send message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }, [newMessage, embedded, cryptoSpaceId, listSpaceId, spaceKey, publicKey, spaceId, identity, sign, encryptForSpace, minePost, submitPost, refetchMessages]);

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Check if message is from current user
  const isOwnMessage = (sender: string): boolean => {
    return userPublicKeyHex === sender;
  };

  if (!spaceId) {
    return (
      <div className="chat-view">
        <div className="chat-error">
          <p>Invalid space ID</p>
          <Link to="/spaces" className="btn btn-primary">Go to Spaces</Link>
        </div>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="chat-view">
        <div className="chat-not-member">
          <h2>Not a Member</h2>
          <p>You don't have access to this private space.</p>
          <p>You need an invite from an existing member to join.</p>
          <Link to="/spaces" className="btn btn-primary">Go to Spaces</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-info">
          <Link to="/spaces" className="back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div className="chat-title">
            <h1>{spaceName}</h1>
            <span className="member-count">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="chat-header-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowMembers(!showMembers)}
            aria-label="Toggle members"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowInviteModal(true)}
          >
            Invite
          </button>
        </div>
      </header>

      <div className="chat-body">
        {/* Members sidebar */}
        {showMembers && (
          <aside className="members-sidebar">
            <h3>Members</h3>
            {membersLoading ? (
              <div className="members-loading">Loading...</div>
            ) : (
              <ul className="members-list">
                {members.map((member) => (
                  <li key={member.member} className="member-item">
                    <span className="member-avatar">
                      {member.member.slice(0, 2)}
                    </span>
                    <div className="member-info">
                      <span className="member-address" title={member.member}>
                        {member.member.slice(0, 8)}...{member.member.slice(-4)}
                      </span>
                      <span className={`member-role ${member.role}`}>
                        {member.role}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {/* Messages */}
        <div className="messages-container">
          {messagesLoading && backendMessages.length === 0 ? (
            <div className="messages-loading">
              <p>Loading messages...</p>
            </div>
          ) : messagesError ? (
            <div className="messages-error">
              <p>Error loading messages: {messagesError}</p>
              <button className="btn btn-ghost" onClick={() => refetchMessages()}>
                Retry
              </button>
            </div>
          ) : backendMessages.length === 0 ? (
            <div className="messages-empty">
              <p>No messages yet</p>
              <p className="hint">Be the first to say something!</p>
            </div>
          ) : (
            <div className="messages-list">
              {backendMessages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${isOwnMessage(message.sender) ? 'own' : ''} ${!message.isDecrypted ? 'encrypted' : ''}`}
                >
                  {!isOwnMessage(message.sender) && (
                    <span className="message-sender">
                      {message.sender.slice(0, 8)}...
                    </span>
                  )}
                  <div className="message-bubble">
                    <p className="message-content">
                      {message.content}
                      {message.decryptionError && (
                        <span className="decryption-error" title={message.decryptionError}>
                          (decryption failed)
                        </span>
                      )}
                    </p>
                    <span className="message-time">
                      {formatTime(message.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Message composer */}
      <footer className="chat-composer">
        {error && <div className="composer-error">{error}</div>}
        {isMining && (
          <PowProgress
            attempts={powProgress.attempts}
            elapsedMs={powProgress.elapsedMs}
            difficulty={8} /* Testnet Reply difficulty */
            onCancel={cancelPow}
          />
        )}
        <form onSubmit={handleSendMessage} className="composer-form">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="composer-input"
            disabled={isBusy}
          />
          <button
            type="submit"
            className="btn btn-primary send-button"
            disabled={isBusy || !newMessage.trim()}
          >
            {isMining ? (
              <span className="sending-indicator">Mining...</span>
            ) : sending ? (
              <span className="sending-indicator">Sending...</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </form>
      </footer>

      {/* Invite Modal */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        spaceId={spaceId}
        hexSpaceId={cryptoSpaceId}
        spaceName={spaceName}
      />

      {/* Space Settings Modal */}
      <SpaceSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        spaceId={spaceId}
        spaceName={spaceName}
        isAdmin={spaceKeyInfo?.invitedBy === userPublicKeyHex}
      />
    </div>
  );
}

export default ChatView;
