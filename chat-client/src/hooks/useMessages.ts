/**
 * useMessages - Hook for managing messages (replies) within a channel (thread)
 *
 * Maps: Message = Reply in Swimchain terminology
 * Real-time updates come from the node's WebSocket event stream (content_new /
 * content_engaged); a slow poll remains as a fallback when the socket is down.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc, useReplySubmit } from './useRpc';
import type { Message } from '../components/MessageItem';
import { useIdentityContext, useNodeEvents } from '@swimchain/frontend';

/** Poll interval for messages (ms) when WebSocket events are unavailable */
const MESSAGE_POLL_INTERVAL = 5000;

/** Slow fallback poll interval (ms) while real-time events are connected */
const MESSAGE_POLL_INTERVAL_REALTIME = 30000;

/**
 * Transform RPC reply to MessageItem Message format
 */
function replyToMessage(reply: {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  created_at: number;
  last_engagement: number;
  media_refs?: Array<{
    media_hash: string;
    media_type: string;
    size_bytes: number;
  }>;
}): Message {
  return {
    id: reply.content_id,
    authorId: reply.author_id,
    authorName: undefined, // Display name resolved by MessageItem via authorId
    authorAvatar: undefined,
    content: reply.body,
    createdAt: Math.floor(reply.created_at / 1000), // Convert to seconds
    status: 'sent',
    reactions: [], // Reactions not included in reply RPC response
    isPinned: false,
    mediaRefs: reply.media_refs?.map(mr => ({
      mediaHash: mr.media_hash,
      mediaType: mr.media_type,
      sizeBytes: mr.size_bytes,
    })),
  };
}

/**
 * Hook to fetch messages (replies) for a channel (thread)
 *
 * New messages arrive without reload: the hook subscribes to the node's
 * `content_new` / `content_engaged` WebSocket events (filtered to the active
 * space when `spaceId` is provided) and refetches on each event. Polling is
 * kept as a fallback and slows down while the event stream is connected.
 *
 * @param channelId - The thread content ID
 * @param pollInterval - Optional custom poll interval (default 5000ms)
 * @param spaceId - Optional space (server) ID used to filter real-time events
 */
export function useMessages(
  channelId: string,
  pollInterval = MESSAGE_POLL_INTERVAL,
  spaceId?: string
) {
  const { rpc, connected, authReady } = useRpc();
  const { identity } = useIdentityContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchMessages = useCallback(async () => {
    if (!rpc || !connected || !authReady || !channelId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch both the original post and its replies
      const [postResult, repliesResult] = await Promise.all([
        rpc.getContent(channelId).catch(() => null),
        rpc.getReplies(channelId).catch(() => ({ replies: [] })),
      ]);

      const transformedMessages: Message[] = [];

      // Add original post as the first message if it has content
      if (postResult && (postResult.title || postResult.body)) {
        const postContent = postResult.title
          ? `**${postResult.title}**\n\n${postResult.body || ''}`
          : postResult.body || '';

        transformedMessages.push({
          id: postResult.content_id,
          authorId: postResult.author_id,
          authorName: undefined,
          authorAvatar: undefined,
          content: postContent,
          createdAt: Math.floor((postResult.created_at || Date.now()) / 1000),
          status: 'sent',
          reactions: [],
          isPinned: true, // Mark original post as pinned
        });
      }

      // Add replies
      const replies = repliesResult.replies.map(replyToMessage);
      transformedMessages.push(...replies);

      // Sort by creation time (oldest first for chat style)
      transformedMessages.sort((a, b) => a.createdAt - b.createdAt);

      setMessages(transformedMessages);
      setError(null);
      lastFetchRef.current = Date.now();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch messages';
      // Only set error if it's not a "no replies" case
      if (!errorMessage.includes('not found')) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, channelId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchMessages();
  }, [fetchMessages]);

  // Real-time: refetch when the node reports new content or engagement in
  // this space (or anywhere on the node when no spaceId filter is provided).
  const { connected: eventsConnected } = useNodeEvents({
    url: connected && rpc ? rpc.getEndpoint() : null,
    events: ['content_new', 'content_engaged'],
    spaceId,
    enabled: !!channelId,
    onEvent: () => {
      fetchMessages();
    },
  });

  // Poll for new messages (fallback; slows down while events are live)
  useEffect(() => {
    if (!connected || !authReady || !channelId) return;

    const effectiveInterval = eventsConnected
      ? Math.max(pollInterval, MESSAGE_POLL_INTERVAL_REALTIME)
      : pollInterval;
    const interval = setInterval(fetchMessages, effectiveInterval);
    return () => clearInterval(interval);
  }, [connected, authReady, channelId, pollInterval, eventsConnected, fetchMessages]);

  return {
    messages,
    loading,
    error,
    refetch: fetchMessages,
    currentUserId: identity?.publicKey,
  };
}

/**
 * Hook for sending messages (replies) in a channel (thread)
 */
export function useSendMessage(channelId: string) {
  const { submitReply, submitting, error: submitError } = useReplySubmit();
  const { identity } = useIdentityContext();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (
    content: string,
    signFn: (message: Uint8Array) => Uint8Array,
    powParams: {
      pow_nonce: number;
      pow_difficulty: number;
      pow_nonce_space: string;
      pow_hash: string;
      timestamp: number;
    },
    mediaRefs?: Array<{ mediaHash: string; mediaType: string; sizeBytes: number }>
  ): Promise<{ success: boolean; messageId: string | null }> => {
    if (!identity?.publicKey) {
      setError('No identity available');
      return { success: false, messageId: null };
    }

    if (!content.trim() && (!mediaRefs || mediaRefs.length === 0)) {
      setError('Message cannot be empty');
      return { success: false, messageId: null };
    }

    setSending(true);
    setError(null);

    try {
      const result = await submitReply(
        channelId,
        content,
        identity.publicKey,
        signFn,
        powParams,
        mediaRefs
      );

      if (result.success) {
        return { success: true, messageId: result.contentId };
      } else {
        setError('Failed to send message');
        return { success: false, messageId: null };
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      return { success: false, messageId: null };
    } finally {
      setSending(false);
    }
  }, [channelId, identity, submitReply]);

  return {
    sendMessage,
    sending: sending || submitting,
    error: error || submitError,
  };
}

/**
 * Hook for optimistic message updates
 *
 * Adds pending messages to the list immediately, then confirms when sent.
 *
 * @param channelId - The thread content ID
 * @param spaceId - Optional space (server) ID used to filter real-time events
 */
export function useOptimisticMessages(channelId: string, spaceId?: string) {
  const { messages, loading, error, refetch, currentUserId } = useMessages(
    channelId,
    undefined,
    spaceId
  );
  const [pendingMessages, setPendingMessages] = useState<Message[]>([]);

  // Add a pending message (shown with 'sending' status)
  const addPendingMessage = useCallback((content: string) => {
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pendingMessage: Message = {
      id: tempId,
      authorId: currentUserId ?? 'unknown',
      content,
      createdAt: Math.floor(Date.now() / 1000),
      status: 'sending',
      reactions: [],
    };
    setPendingMessages(prev => [...prev, pendingMessage]);
    return tempId;
  }, [currentUserId]);

  // Confirm a pending message was sent
  const confirmPendingMessage = useCallback((tempId: string, actualId: string) => {
    setPendingMessages(prev =>
      prev.map(msg =>
        msg.id === tempId
          ? { ...msg, id: actualId, status: 'sent' as const }
          : msg
      )
    );

    // Refetch to get the actual message from server
    refetch();

    // Remove from pending after a short delay
    setTimeout(() => {
      setPendingMessages(prev => prev.filter(msg => msg.id !== tempId && msg.id !== actualId));
    }, 1000);
  }, [refetch]);

  // Mark a pending message as failed
  const failPendingMessage = useCallback((tempId: string) => {
    setPendingMessages(prev =>
      prev.map(msg =>
        msg.id === tempId
          ? { ...msg, status: 'failed' as const }
          : msg
      )
    );
  }, []);

  // Remove a pending message
  const removePendingMessage = useCallback((tempId: string) => {
    setPendingMessages(prev => prev.filter(msg => msg.id !== tempId));
  }, []);

  // Combine real messages with pending messages
  const allMessages = [...messages, ...pendingMessages];

  return {
    messages: allMessages,
    loading,
    error,
    refetch,
    currentUserId,
    addPendingMessage,
    confirmPendingMessage,
    failPendingMessage,
    removePendingMessage,
  };
}
