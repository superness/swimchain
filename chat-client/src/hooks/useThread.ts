/**
 * Hook for managing thread state - uses real RPC data
 */

import { useState, useCallback, useEffect } from 'react';
import type { Message, MessageInputState } from '../types';
import { useReplies } from './useRpc';

interface UseThreadReturn {
  expandedThreadId: string | null;
  toggleThread: (messageId: string) => void;
  closeThread: () => void;
  threadReplies: Message[];
  isLoadingReplies: boolean;
  replyState: MessageInputState;
}

export function useThread(): UseThreadReturn {
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [replyState] = useState<MessageInputState>('ready');

  // Fetch replies when thread is expanded
  const { replies: rpcReplies, loading: repliesLoading, refetch: refetchReplies } = useReplies(expandedThreadId ?? '');

  // Convert RPC Reply format to Message format for display
  const threadReplies: Message[] = rpcReplies.map(reply => ({
    id: reply.id,
    authorAddress: reply.author,
    content: reply.content,
    createdAt: reply.createdAt,
    lastEngagement: reply.lastEngagement,
    heatPercent: Math.round(reply.heat * 100),
    poolCurrent: 0,
    poolTarget: 60,
    replyCount: reply.children.length,
    parentId: reply.parentId ?? expandedThreadId,
    spaceId: '', // Not tracked in replies
    reactions: { quickCount: 0, standardCount: 0 },
  }));

  const toggleThread = useCallback((messageId: string) => {
    if (expandedThreadId === messageId) {
      // Close thread
      setExpandedThreadId(null);
    } else {
      // Open thread
      setExpandedThreadId(messageId);
    }
  }, [expandedThreadId]);

  const closeThread = useCallback(() => {
    setExpandedThreadId(null);
  }, []);

  // Refetch replies when thread changes
  useEffect(() => {
    if (expandedThreadId) {
      refetchReplies();
    }
  }, [expandedThreadId, refetchReplies]);

  return {
    expandedThreadId,
    toggleThread,
    closeThread,
    threadReplies,
    isLoadingReplies: repliesLoading,
    replyState,
  };
}
