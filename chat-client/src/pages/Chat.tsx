/**
 * Chat - Main Discord-style chat interface
 *
 * Combines ServerList, ChannelSidebar, and ChatArea into a unified experience.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ServerList } from '../components/ServerList';
import { ChannelSidebar } from '../components/ChannelSidebar';
import { CreateChannelModal } from '../components/CreateChannelModal';
import { ChatArea } from '../components/ChatArea';
import { NodeStatusBar } from '../components/NodeStatusBar';
import { SponsorshipBanner } from '../components/SponsorshipBanner';
import { useToast } from '../components/Toast';
import { useServers } from '../hooks/useServers';
import { useChannels } from '../hooks/useChannels';
import { useOptimisticMessages, useSendMessage } from '../hooks/useMessages';
import { hexToBytes, solutionToRpcParams } from '@swimchain/frontend';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { useReplyPow, useActionPow } from '../hooks/useActionPow';
import { useIsSponsored } from '../hooks/useIsSponsored';
import { useBlocklist } from '../hooks/useBlocklist';
import { useRpc, useMediaUpload, usePoolContribution, usePrivateContent, usePrivateSpaceIds, isPrivateCiphertext } from '../hooks/useRpc';
import { usePrivateChannelKeys } from '../hooks/usePrivateSpaceKeys';
import { encryptWithChannelKey } from '../lib/encryption';
import type { SpamReason } from '../components/ReportModal';
import './Chat.css';

export function Chat() {
  const { serverId, channelId } = useParams<{ serverId: string; channelId?: string }>();
  const navigate = useNavigate();
  // Unified identity: the node's identity when embedded in the desktop shell,
  // otherwise the browser keypair. `sign` routes to the node's sign_message RPC
  // in node mode and to the local keypair in browser mode.
  const { identity, sign: signAsync, publicKeyBytes, hasIdentity, mode } = useChatIdentity();

  // Fetch servers and channels
  const { servers, loading: serversLoading } = useServers();
  const { channels, loading: channelsLoading, markRead: markChannelRead, refetch: refetchChannels } = useChannels(serverId ?? '');

  // Get current server info
  const currentServer = servers.find(s => s.id === serverId);

  // Message handling
  const {
    messages,
    loading: messagesLoading,
    refetch: _refetchMessages,
    addPendingMessage,
    confirmPendingMessage,
    failPendingMessage,
    currentUserId,
  } = useOptimisticMessages(channelId ?? '', serverId);

  const { sendMessage, sending: _sending } = useSendMessage(channelId ?? '');

  // PoW mining for replies
  const { mineReply, state: miningState, progress: miningProgress, cancel: cancelMining } = useReplyPow();
  const isSponsored = useIsSponsored();
  // PoW mining for spam reports
  const { mine: mineReportPow, state: reportMiningState, progress: reportMiningProgress, cancel: cancelReportMining } = useActionPow();
  const [isSending, setIsSending] = useState(false);

  // Reply target state
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);

  // Create-channel modal (a channel is a thread inside the current server/space).
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const handleChannelCreated = useCallback(async (newChannelId: string) => {
    await refetchChannels();
    if (serverId) navigate(`/channels/${serverId}/${newChannelId}`);
  }, [refetchChannels, serverId, navigate]);

  // Mobile navigation state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile nav and clear reply target when channel changes
  useEffect(() => {
    setMobileNavOpen(false);
    setReplyTargetId(null);
  }, [channelId]);

  // Mark the opened channel as read so its unread "(1)" badge clears (#13).
  useEffect(() => {
    if (channelId) markChannelRead(channelId);
  }, [channelId, markChannelRead]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Blocklist for blocking reported users
  const { block } = useBlocklist();

  // RPC for report submission
  const { rpc } = useRpc();

  // Media upload for images
  const { uploadImage, compressAndUpload, getMediaUrl, uploading: uploadingMedia } = useMediaUpload();

  // Engagement submission (reactions)
  const { contribute: submitEngagement, contributing: engagementMining } = usePoolContribution();

  const mining = miningState === 'mining' || reportMiningState === 'mining' || engagementMining;

  // Private channel key management (browser mode: local E2E key per channel)
  const { getChannelKey } = usePrivateChannelKeys(identity?.publicKey);

  // Node-managed private channels (desktop mode): a private chat server/space is
  // encrypted by the node, which holds the space key. We detect membership via the
  // node's private-space list and use node-side encrypt/decrypt RPCs.
  const { encryptForSpace, decryptForSpace } = usePrivateContent();
  const privateSpaceIds = usePrivateSpaceIds(identity?.publicKey);
  const isPrivateServer = mode === 'node' && !!serverId && privateSpaceIds.has(serverId);

  // Toast notifications for user feedback
  const toast = useToast();

  // Get current channel info
  const currentChannel = channels.find(c => c.id === channelId);

  // Auto-select the first server, then its first channel. These MUST run as effects
  // (post-commit), not during render: calling navigate() during render is unreliable
  // in React Router and made a space require a SECOND click before its content loaded
  // (#12) — on the first click the new server's channels were still loading, so the
  // render-phase redirect didn't fire and nothing advanced to a channel.
  useEffect(() => {
    if (!serversLoading && servers.length > 0 && !serverId) {
      navigate(`/channels/${servers[0]!.id}`, { replace: true });
    }
  }, [serversLoading, servers, serverId, navigate]);

  useEffect(() => {
    if (!channelsLoading && channels.length > 0 && serverId && !channelId) {
      navigate(`/channels/${serverId}/${channels[0]!.id}`, { replace: true });
    }
  }, [channelsLoading, channels, serverId, channelId, navigate]);

  // Handle message send with PoW and optional image attachments
  const handleSendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!hasIdentity || !identity?.publicKey || !channelId) {
      console.error('[Chat] Cannot send: missing identity or channel');
      return;
    }
    // Gate on sponsorship BEFORE spending PoW — the node rejects unsponsored posts
    // (SPEC_11), so mining first only wastes the user's time.
    if (isSponsored === false) {
      toast.error(
        'You need a sponsor before you can post. Redeem an invite or request sponsorship — no proof-of-work is spent until then.'
      );
      return;
    }

    setIsSending(true);

    // Add pending message for optimistic UI
    const tempId = addPendingMessage(content);

    try {
      // Upload attachments first (if any)
      const mediaRefs: Array<{ mediaHash: string; mediaType: string; sizeBytes: number }> = [];

      if (attachments && attachments.length > 0) {
        for (const file of attachments) {
          // Try direct upload first, compress if too large
          let uploadResult = await uploadImage(file);

          if (!uploadResult.success && uploadResult.needsCompression) {
            uploadResult = await compressAndUpload(file);
          }

          if (uploadResult.success && uploadResult.result) {
            mediaRefs.push({
              mediaHash: uploadResult.result.mediaHash,
              mediaType: uploadResult.result.mediaType,
              sizeBytes: uploadResult.result.sizeBytes,
            });
          } else {
            console.error('[Chat] Failed to upload image:', file.name);
            toast.warning(`Failed to upload ${file.name}`);
            // Continue with other images
          }
        }
      }

      // Encrypt content if this is a private channel.
      let messageContent = content;
      if (mode === 'node') {
        // Node-managed private channel: ask the node (which holds the space key) to
        // encrypt BEFORE mining, so PoW binds to the ciphertext. All-or-nothing —
        // if encryption fails we abort rather than leak plaintext into a private channel.
        if (isPrivateServer && serverId) {
          const cipher = await encryptForSpace(serverId, content);
          if (!cipher) {
            failPendingMessage(tempId);
            toast.error('Could not encrypt your message for this private channel. Nothing was sent.');
            return;
          }
          messageContent = cipher;
        }
      } else {
        // Browser mode: local E2E channel key (unchanged).
        const channelKey = channelId ? getChannelKey(channelId) : null;
        if (channelKey) {
          messageContent = await encryptWithChannelKey(content, channelKey);
        }
      }

      // Mine PoW for reply action
      // Get author pubkey bytes from identity
      const authorPubkey = publicKeyBytes ?? hexToBytes(identity.publicKey);

      // Mine the reply PoW
      const powSolution = await mineReply(messageContent, authorPubkey, true);

      // Convert solution to RPC params
      const powParams = solutionToRpcParams(powSolution);

      // Send the (possibly encrypted) message with media refs.
      // `signAsync` signs via the node in node mode, or the local keypair otherwise.
      const result = await sendMessage(messageContent, signAsync, powParams, mediaRefs.length > 0 ? mediaRefs : undefined);

      if (result.success && result.messageId) {
        confirmPendingMessage(tempId, result.messageId);
        setReplyTargetId(null);
      } else {
        console.error('[Chat] Failed to send message');
        failPendingMessage(tempId);
        toast.error('Failed to send message. Please try again.');
      }
    } catch (err) {
      console.error('[Chat] Send error:', err);
      failPendingMessage(tempId);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [identity, hasIdentity, signAsync, publicKeyBytes, channelId, serverId, mode, isPrivateServer, encryptForSpace, addPendingMessage, mineReply, sendMessage, confirmPendingMessage, failPendingMessage, uploadImage, compressAndUpload, toast, getChannelKey, isSponsored]);

  // Node-managed private channels: decrypt `[PRIVATE:v1:...]` message bodies for
  // display via the node (which holds the space key). Cache plaintext by message id
  // so we only decrypt each message once; show a lock placeholder until it resolves.
  const [decryptedById, setDecryptedById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isPrivateServer || !serverId) return;
    const pending = messages.filter(
      m => isPrivateCiphertext(m.content) && decryptedById[m.id] === undefined
    );
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const m of pending) {
        const plain = await decryptForSpace(serverId, m.content);
        if (plain !== null) updates[m.id] = plain;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDecryptedById(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [isPrivateServer, serverId, messages, decryptForSpace, decryptedById]);

  // What we actually render: in a node-managed private channel, swap ciphertext for
  // decrypted plaintext (or a lock placeholder while it decrypts). Non-private and
  // browser modes pass messages through unchanged.
  const displayMessages = useMemo(() => {
    if (!isPrivateServer) return messages;
    return messages.map(m => {
      if (!isPrivateCiphertext(m.content)) return m;
      const plain = decryptedById[m.id];
      return { ...m, content: plain ?? '🔒 Encrypted — decrypting…' };
    });
  }, [isPrivateServer, messages, decryptedById]);

  // Handle reply - sets reply target and focuses input
  const handleReply = useCallback((messageId: string) => {
    setReplyTargetId(messageId);
    // Focus the message input area
    const inputEl = document.querySelector<HTMLTextAreaElement>('.message-textarea');
    inputEl?.focus();
  }, []);

  // Emoji-to-code mapping matching the protocol (1-8)
  const EMOJI_CODES: Record<string, number> = {
    '❤️': 1, '👍': 2, '😂': 3, '🔥': 4,
    '🤔': 5, '🎉': 6, '😢': 7, '💯': 8,
  };

  // Handle reaction with PoW mining and RPC submission
  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!hasIdentity || !identity?.publicKey) {
      toast.error('Identity required to react');
      return;
    }

    const emojiCode = EMOJI_CODES[emoji];
    if (!emojiCode) {
      console.warn('[Chat] Unknown emoji:', emoji);
      return;
    }

    try {
      const result = await submitEngagement(messageId, 5, identity.publicKey, signAsync, emojiCode);

      if (result.success) {
        toast.success('Reaction added!');
      } else {
        toast.error('Failed to submit reaction');
      }
    } catch (err) {
      console.error('[Chat] Reaction error:', err);
      toast.error('Failed to submit reaction');
    }
  }, [identity, hasIdentity, signAsync, submitEngagement, toast]);

  // Handle content report with PoW mining
  const handleReport = useCallback(async (contentId: string, reason: SpamReason): Promise<boolean> => {
    // Find the message to get author info
    const reportedMessage = messages.find(m => m.id === contentId);

    try {
      // Submit spam attestation via RPC with real PoW
      if (rpc && hasIdentity && identity?.publicKey) {
        try {
          const { bytesToHex: bytesToHexLocal } = await import('@swimchain/frontend');

          // Parse content ID to get hash bytes
          const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
          const contentHashBytes = hexToBytes(contentHashHex);
          const attesterBytes = hexToBytes(identity.publicKey);
          const timestamp = Math.floor(Date.now() / 1000);
          const REASON_U8: Record<string, number> = {
            advertising: 1, repetitive: 2, off_topic: 3, harassment: 4, illegal_content: 5,
          };
          const reasonByte = REASON_U8[reason.toLowerCase()] ?? 0;

          // Spam-attestation PoW (SPEC_12): find a u64 nonce so that
          //   sha256(pow_message || nonce_LE) has >= 12 leading ZERO BITS,
          // pow_message = content_hash(32) || attester(32) || reason(1) || timestamp(8 LE).
          // The old code mined Argon2id over an unrelated challenge, so the node saw 0
          // leading zeros -> -32602 "required 12 ... got 0". sha256 at 12 bits is fast.
          const POW_DIFFICULTY = 12;
          const powMessage = new Uint8Array(32 + 32 + 1 + 8);
          powMessage.set(contentHashBytes, 0);
          powMessage.set(attesterBytes, 32);
          powMessage[64] = reasonByte;
          new DataView(powMessage.buffer).setBigUint64(65, BigInt(timestamp), true);
          const powBuf = new Uint8Array(powMessage.length + 8);
          powBuf.set(powMessage, 0);
          const powNonceView = new DataView(powBuf.buffer, powMessage.length, 8);
          const leadingZeroBits = (h: Uint8Array): number => {
            let c = 0;
            for (const b of h) { if (b === 0) { c += 8; } else { c += Math.clz32(b) - 24; break; } }
            return c;
          };
          let powNonce = 0n;
          let powHashBytes = new Uint8Array(32);
          // eslint-disable-next-line no-constant-condition
          while (true) {
            powNonceView.setBigUint64(0, powNonce, true);
            powHashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', powBuf));
            if (leadingZeroBits(powHashBytes) >= POW_DIFFICULTY) break;
            powNonce++;
          }

          // Sign over the EXACT bytes the node verifies (SPEC_12):
          // "SPAM_ATTESTATION" || content_hash(32) || reason(1) || timestamp(8, LE).
          const label = new TextEncoder().encode('SPAM_ATTESTATION');
          const signatureMessage = new Uint8Array(label.length + 32 + 1 + 8);
          signatureMessage.set(label, 0);
          signatureMessage.set(contentHashBytes, label.length);
          signatureMessage[label.length + 32] = reasonByte;
          new DataView(signatureMessage.buffer).setBigUint64(label.length + 33, BigInt(timestamp), true);
          const signature = await signAsync(signatureMessage);
          if (!signature) {
            throw new Error('Failed to sign spam report');
          }

          await rpc.call('submit_spam_attestation', {
            content_id: contentHashHex,
            attester_id: identity.publicKey,
            reason: reason.toLowerCase(),
            pow_nonce: Number(powNonce),
            pow_difficulty: POW_DIFFICULTY,
            pow_nonce_space: '0000000000000000',
            pow_hash: bytesToHexLocal(powHashBytes),
            signature: bytesToHexLocal(signature),
            timestamp,
          });
        } catch (rpcErr) {
          // RPC method may not exist yet or other error - log locally for now
          console.warn('[Chat] Spam attestation failed, logged locally:', rpcErr);
        }
      }

      // Optionally block the user who posted the content
      if (reportedMessage && reason === 'harassment') {
        // Auto-block for harassment reports
        block(reportedMessage.authorId, 'user', `Reported for ${reason}`);
        toast.info('User blocked for harassment.');
      }

      toast.success('Report submitted to the network. Peers will validate this spam attestation.');
      return true;
    } catch (err) {
      console.error('[Chat] Report failed:', err);
      toast.error('Failed to submit report. Please try again.');
      return false;
    }
  }, [messages, rpc, identity, hasIdentity, signAsync, block, toast, mineReportPow]);

  // While the auto-select effects above resolve the server/channel, render nothing to
  // avoid flashing an empty layout. (The navigation itself now happens in the effects.)
  if (!serversLoading && servers.length > 0 && !serverId) {
    return null;
  }
  if (!channelsLoading && channels.length > 0 && serverId && !channelId) {
    return null;
  }

  return (
    <div className={`chat-layout ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
      {/* Sponsorship onboarding: persistent banner when the identity isn't
          sponsored yet (SPEC_11). Sits above the panel row in the flex column. */}
      <SponsorshipBanner />

      {/* Mobile navigation toggle */}
      <button
        type="button"
        className="mobile-nav-toggle"
        onClick={() => setMobileNavOpen(!mobileNavOpen)}
        aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileNavOpen}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {mobileNavOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile sidebar overlay */}
      <div
        className={`mobile-sidebar-overlay ${mobileNavOpen ? 'visible' : ''}`}
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />

      {/* Horizontal panel row (fills height, bounds the message scroll). */}
      <div className="chat-body">
      {/* Server list (left sidebar) */}
      <ServerList
        servers={servers.map(s => ({
          ...s,
          hasNotification: false,
        }))}
        currentServerId={serverId}
      />

      {/* Channel sidebar */}
      {currentServer && (
        <ChannelSidebar
          server={{
            id: currentServer.id,
            name: currentServer.name,
            icon: currentServer.icon,
            description: currentServer.description,
          }}
          channels={channels}
          currentChannelId={channelId}
          onCreateChannel={() => setShowCreateChannel(true)}
        />
      )}

      {serverId && (
        <CreateChannelModal
          isOpen={showCreateChannel}
          onClose={() => setShowCreateChannel(false)}
          serverId={serverId}
          onCreated={handleChannelCreated}
        />
      )}

      {/* Main chat area */}
      {currentChannel ? (
        <ChatArea
          channel={{
            id: currentChannel.id,
            name: currentChannel.name,
          }}
          messages={displayMessages}
          loading={messagesLoading}
          onSendMessage={handleSendMessage}
          onReaction={handleReaction}
          onReport={handleReport}
          onReply={handleReply}
          currentUserId={currentUserId}
          isSending={isSending || mining || uploadingMedia}
          getMediaUrl={getMediaUrl}
          replyTargetId={replyTargetId ?? undefined}
          onCancelReply={() => setReplyTargetId(null)}
        />
      ) : (
        <div className="no-channel-selected">
          {channelsLoading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading channels...</p>
            </div>
          ) : channels.length === 0 ? (
            <div className="empty-server">
              <h2>Welcome to {currentServer?.name ?? 'this server'}!</h2>
              <p>There are no channels yet. Create one to get started.</p>
              <button
                className="create-channel-btn"
                onClick={() => setShowCreateChannel(true)}
              >
                Create Channel
              </button>
            </div>
          ) : (
            <div className="select-channel">
              <h2>Select a channel</h2>
              <p>Choose a channel from the sidebar to start chatting.</p>
            </div>
          )}
        </div>
      )}

      </div>
      {/* end .chat-body */}

      {/* Mining progress overlay */}
      {mining && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          className="mining-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mining-modal-title"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (reportMiningState === 'mining') cancelReportMining();
              else cancelMining();
            }
          }}
        >
          <div className="mining-modal">
            <div className="mining-spinner" />
            <h3 id="mining-modal-title">
              {reportMiningState === 'mining' ? 'Mining proof of work for report...' : 'Mining proof of work...'}
            </h3>
            <p>This may take a few seconds.</p>
            {reportMiningState === 'mining' && reportMiningProgress && (
              <div className="mining-stats">
                <span>Attempts: {reportMiningProgress.attempts.toLocaleString()}</span>
                <span>Time: {(reportMiningProgress.elapsedMs / 1000).toFixed(1)}s</span>
              </div>
            )}
            {miningState === 'mining' && miningProgress && (
              <div className="mining-stats">
                <span>Attempts: {miningProgress.attempts.toLocaleString()}</span>
                <span>Time: {(miningProgress.elapsedMs / 1000).toFixed(1)}s</span>
              </div>
            )}
            <button
              className="mining-cancel-btn"
              onClick={reportMiningState === 'mining' ? cancelReportMining : cancelMining}
              aria-label="Cancel mining"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Node status bar (only shows in Tauri desktop app) */}
      <NodeStatusBar />
    </div>
  );
}
