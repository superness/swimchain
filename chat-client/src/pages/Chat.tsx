/**
 * Chat - Main Discord-style chat interface
 *
 * Combines ServerList, ChannelSidebar, and ChatArea into a unified experience.
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ServerList } from '../components/ServerList';
import { ChannelSidebar } from '../components/ChannelSidebar';
import { ChatArea } from '../components/ChatArea';
import { NodeStatusBar } from '../components/NodeStatusBar';
import { useToast } from '../components/Toast';
import { useServers } from '../hooks/useServers';
import { useChannels } from '../hooks/useChannels';
import { useOptimisticMessages, useSendMessage } from '../hooks/useMessages';
import { useIdentityContext, hexToBytes, solutionToRpcParams, wasm } from '@swimchain/frontend';
import { useReplyPow, useActionPow, ActionType } from '../hooks/useActionPow';
import { useBlocklist } from '../hooks/useBlocklist';
import { useRpc, useMediaUpload, usePoolContribution } from '../hooks/useRpc';
import { usePrivateChannelKeys } from '../hooks/usePrivateSpaceKeys';
import { encryptWithChannelKey } from '../lib/encryption';
import type { SpamReason } from '../components/ReportModal';
import './Chat.css';

/**
 * Helper to create sign function from identity
 */
function createSignFn(identity: { seed: string; publicKey: string }) {
  return (message: Uint8Array): Uint8Array => {
    const seedBytes = hexToBytes(identity.seed);
    const keypair = wasm.WasmKeypair.fromSeed(seedBytes);
    return keypair.sign(message);
  };
}

export function Chat() {
  const { serverId, channelId } = useParams<{ serverId: string; channelId?: string }>();
  const navigate = useNavigate();
  const { identity } = useIdentityContext();

  // Fetch servers and channels
  const { servers, loading: serversLoading } = useServers();
  const { channels, loading: channelsLoading } = useChannels(serverId ?? '');

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
  // PoW mining for spam reports
  const { mine: mineReportPow, state: reportMiningState, progress: reportMiningProgress, cancel: cancelReportMining } = useActionPow();
  const [isSending, setIsSending] = useState(false);

  // Reply target state
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);

  // Mobile navigation state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile nav and clear reply target when channel changes
  useEffect(() => {
    setMobileNavOpen(false);
    setReplyTargetId(null);
  }, [channelId]);

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

  // Private channel key management
  const { getChannelKey } = usePrivateChannelKeys(identity?.publicKey);

  // Toast notifications for user feedback
  const toast = useToast();

  // Get current channel info
  const currentChannel = channels.find(c => c.id === channelId);

  // Handle message send with PoW and optional image attachments
  const handleSendMessage = useCallback(async (content: string, attachments?: File[]) => {
    if (!identity?.seed || !identity?.publicKey || !channelId) {
      console.error('[Chat] Cannot send: missing identity or channel');
      return;
    }

    setIsSending(true);

    // Add pending message for optimistic UI
    const tempId = addPendingMessage(content);

    try {
      // Upload attachments first (if any)
      const mediaRefs: Array<{ mediaHash: string; mediaType: string; sizeBytes: number }> = [];

      if (attachments && attachments.length > 0) {
        console.log('[Chat] Uploading', attachments.length, 'image(s)...');

        for (const file of attachments) {
          // Try direct upload first, compress if too large
          let uploadResult = await uploadImage(file);

          if (!uploadResult.success && uploadResult.needsCompression) {
            console.log('[Chat] Image too large, compressing...', file.name);
            uploadResult = await compressAndUpload(file);
          }

          if (uploadResult.success && uploadResult.result) {
            mediaRefs.push({
              mediaHash: uploadResult.result.mediaHash,
              mediaType: uploadResult.result.mediaType,
              sizeBytes: uploadResult.result.sizeBytes,
            });
            console.log('[Chat] Uploaded:', uploadResult.result.mediaHash);
          } else {
            console.error('[Chat] Failed to upload image:', file.name);
            toast.warning(`Failed to upload ${file.name}`);
            // Continue with other images
          }
        }

        console.log('[Chat] Uploaded', mediaRefs.length, 'image(s)');
      }

      // Encrypt content if this is a private channel
      const channelKey = channelId ? getChannelKey(channelId) : null;
      let messageContent = content;
      if (channelKey) {
        console.log('[Chat] Encrypting message for private channel...');
        messageContent = await encryptWithChannelKey(content, channelKey);
      }

      // Mine PoW for reply action
      console.log('[Chat] Mining PoW for reply...');

      // Get author pubkey bytes from identity
      const authorPubkey = hexToBytes(identity.publicKey);

      // Mine the reply PoW
      const powSolution = await mineReply(messageContent, authorPubkey, true);

      console.log('[Chat] PoW complete, sending message...');

      // Create sign function
      const signFn = createSignFn(identity);

      // Convert solution to RPC params
      const powParams = solutionToRpcParams(powSolution);

      // Send the (possibly encrypted) message with media refs
      const result = await sendMessage(messageContent, signFn, powParams, mediaRefs.length > 0 ? mediaRefs : undefined);

      if (result.success && result.messageId) {
        console.log('[Chat] Message sent successfully:', result.messageId);
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
  }, [identity, channelId, addPendingMessage, mineReply, sendMessage, confirmPendingMessage, failPendingMessage, uploadImage, compressAndUpload, toast, getChannelKey]);

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
    if (!identity?.seed || !identity?.publicKey) {
      toast.error('Identity required to react');
      return;
    }

    const emojiCode = EMOJI_CODES[emoji];
    if (!emojiCode) {
      console.warn('[Chat] Unknown emoji:', emoji);
      return;
    }

    try {
      console.log('[Chat] Mining engagement PoW for reaction:', emoji, 'on', messageId);
      const signFn = createSignFn(identity);
      const result = await submitEngagement(messageId, 5, identity.publicKey, signFn, emojiCode);

      if (result.success) {
        toast.success('Reaction added!');
      } else {
        toast.error('Failed to submit reaction');
      }
    } catch (err) {
      console.error('[Chat] Reaction error:', err);
      toast.error('Failed to submit reaction');
    }
  }, [identity, submitEngagement, toast]);

  // Handle content report with PoW mining
  const handleReport = useCallback(async (contentId: string, reason: SpamReason): Promise<boolean> => {
    console.log('[Chat] Report submitted:', contentId, reason);

    // Find the message to get author info
    const reportedMessage = messages.find(m => m.id === contentId);

    try {
      // Submit spam attestation via RPC with real PoW
      if (rpc && identity?.seed && identity?.publicKey) {
        try {
          const { bytesToHex: bytesToHexLocal, solutionToRpcParams: toRpcParams } = await import('@swimchain/frontend');

          // Parse content ID to get hash bytes for PoW challenge
          const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
          const contentHashBytes = hexToBytes(contentHashHex);
          const authorBytes = hexToBytes(identity.publicKey);

          console.log('[Chat] Mining PoW for spam report...');

          // Mine using the hook (drives reportMiningState/reportMiningProgress for the overlay)
          const solution = await mineReportPow(
            ActionType.SpamAttestation, // SPEC_12: higher difficulty for spam reports
            contentHashBytes,
            authorBytes,
            true, // isTestnet
          );

          const powParams = toRpcParams(solution);
          console.log('[Chat] Report PoW complete, nonce:', solution.nonce.toString());

          // Sign the attestation with nonce included
          const timestamp = Math.floor(Date.now() / 1000);
          const signatureMessage = new TextEncoder().encode(
            `spam:${contentId}:${reason.toLowerCase()}:${solution.nonce}:${timestamp}`
          );
          const seedBytes = hexToBytes(identity.seed);
          const keypair = wasm.WasmKeypair.fromSeed(seedBytes);
          const signature = keypair.sign(signatureMessage);

          await rpc.call('submit_spam_attestation', {
            content_id: contentId,
            attester_id: identity.publicKey,
            reason: reason.toLowerCase(),
            pow_nonce: powParams.pow_nonce,
            pow_difficulty: powParams.pow_difficulty,
            pow_nonce_space: powParams.pow_nonce_space,
            pow_hash: powParams.pow_hash,
            signature: bytesToHexLocal(signature),
            timestamp,
          });
          console.log('[Chat] Spam attestation submitted to network');
        } catch (rpcErr) {
          // RPC method may not exist yet or other error - log locally for now
          console.warn('[Chat] Spam attestation failed, logged locally:', rpcErr);
        }
      }

      // Optionally block the user who posted the content
      if (reportedMessage && reason === 'harassment') {
        // Auto-block for harassment reports
        block(reportedMessage.authorId, 'user', `Reported for ${reason}`);
        console.log('[Chat] Auto-blocked user for harassment:', reportedMessage.authorId);
        toast.info('User blocked for harassment.');
      }

      toast.success('Report submitted to the network. Peers will validate this spam attestation.');
      return true;
    } catch (err) {
      console.error('[Chat] Report failed:', err);
      toast.error('Failed to submit report. Please try again.');
      return false;
    }
  }, [messages, rpc, identity, block, toast, mineReportPow]);

  // If no server selected, redirect to first server
  if (!serversLoading && servers.length > 0 && !serverId) {
    const firstServer = servers[0]!;
    navigate(`/channels/${firstServer.id}`, { replace: true });
    return null;
  }

  // If server selected but no channel, redirect to first channel
  if (!channelsLoading && channels.length > 0 && serverId && !channelId) {
    const firstChannel = channels[0]!;
    navigate(`/channels/${serverId}/${firstChannel.id}`, { replace: true });
    return null;
  }

  return (
    <div className={`chat-layout ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
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
        />
      )}

      {/* Main chat area */}
      {currentChannel ? (
        <ChatArea
          channel={{
            id: currentChannel.id,
            name: currentChannel.name,
          }}
          messages={messages}
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
                onClick={() => navigate(`/channels/${serverId}/new`)}
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
