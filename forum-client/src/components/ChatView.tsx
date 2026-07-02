/**
 * Chat View Component
 *
 * Main chat interface for private spaces.
 * Displays messages and allows sending new ones.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSpaceMembers, useRpc, useReplySubmit } from '../hooks/useRpc';
import { useReplyPow } from '../hooks/useActionPow';
import { solutionToRpcParams } from '../lib/action-pow';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { usePrivateSpaceMessages } from '../hooks/usePrivateSpaceMessages';
import { encryptWithSpaceKey } from '../lib/encryption';
import { bytesToHex } from '../lib/x25519';
import { InviteModal } from './InviteModal';
import { SpaceSettings } from './SpaceSettings';
import { PowProgress } from './PowProgress';
import './ChatView.css';

export function ChatView(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { publicKey, keypair } = useStoredKeypair();
  const userPublicKeyHex = publicKey ? bytesToHex(publicKey) : undefined;
  const { getSpaceKey, getSpaceKeyInfo } = usePrivateSpaceKeys(userPublicKeyHex);
  const { members, loading: membersLoading } = useSpaceMembers(spaceId);
  const { identity, sign } = useNodeIdentity();
  const { submitReply, submitting: replySubmitting } = useReplySubmit();
  const { state: powState, progress: powProgress, mineReply, cancel: cancelPow } = useReplyPow();

  // Get space key for this space
  const spaceKey = spaceId ? getSpaceKey(spaceId) : null;
  const spaceKeyInfo = spaceId ? getSpaceKeyInfo(spaceId) : null;
  const isMember = !!spaceKey;

  // Fetch messages from backend
  const {
    messages: backendMessages,
    loading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = usePrivateSpaceMessages(spaceId, spaceKey, { pollInterval: 3000 });

  const [spaceName, setSpaceName] = useState<string>('Private Space');
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMining = powState === 'mining';
  const isBusy = sending || isMining || replySubmitting;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Decrypt space name
  useEffect(() => {
    async function decryptName() {
      if (!spaceKeyInfo?.spaceName || !spaceKey) return;

      try {
        // If we have a stored decrypted name, use it
        if (spaceKeyInfo.spaceName) {
          setSpaceName(spaceKeyInfo.spaceName);
        }
      } catch (err) {
        console.error('Failed to decrypt space name:', err);
      }
    }

    decryptName();
  }, [spaceKeyInfo, spaceKey]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [backendMessages]);

  // Handle sending a message with real Argon2id PoW
  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !spaceKey || !publicKey || !spaceId || !identity || !sign) return;

    setSending(true);
    setError(null);

    try {
      // Encrypt the message with the space key
      const encryptedContent = await encryptWithSpaceKey(newMessage.trim(), spaceKey);

      // Mine real Argon2id PoW for the reply
      const publicKeyBytes = new Uint8Array(publicKey);
      const mined = await mineReply(bytesToHex(encryptedContent), publicKeyBytes, true);
      const powParams = solutionToRpcParams(mined);

      // Submit the reply with PoW via useReplySubmit
      const result = await submitReply(
        spaceId,
        bytesToHex(encryptedContent),
        bytesToHex(publicKey),
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
  }, [newMessage, spaceKey, publicKey, spaceId, identity, sign, mineReply, submitReply, refetchMessages]);

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
        {isMining && <PowProgress progress={powProgress} />}
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
