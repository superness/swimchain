/**
 * useChannels - Hook for managing channels (threads) within a server (space)
 *
 * Maps: Channel = Thread in Swimchain terminology
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import type { Channel } from '../components/ChannelSidebar';

const LAST_READ_KEY = 'chat-channel-last-read';

/** Read last-read timestamps from localStorage */
function getLastReadMap(): Record<string, number> {
  try {
    const stored = localStorage.getItem(LAST_READ_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/** Mark a channel as read (call when user opens a channel) */
export function markChannelRead(channelId: string): void {
  try {
    const map = getLastReadMap();
    map[channelId] = Date.now();
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(map));
  } catch {
    // Silently fail on storage errors
  }
}

/**
 * Hook to fetch channels (threads) for a server (space)
 */
export function useChannels(serverId: string) {
  const { rpc, connected, authReady } = useRpc();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    if (!rpc || !connected || !authReady || !serverId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch more content to show all channels (default was 50)
      const result = await rpc.listSpaceContent(serverId, { limit: 200 });

      // Filter to only top-level posts (threads) - not replies
      const threads = result.items.filter(
        item => item.content_type === 'Post' || (!item.parent_id && item.content_type !== 'Reply')
      );

      // Get last-read timestamps for unread counting
      const lastReadMap = getLastReadMap();

      // Transform to Channel format for ChannelSidebar
      const transformedChannels: Channel[] = threads.map(thread => {
        // Extract category from title if it has [Category] prefix
        const title = thread.title ?? thread.body?.split('\n')[0] ?? 'Untitled';
        let category: string | undefined;
        let cleanTitle = title;

        const categoryMatch = title.match(/^\[([^\]]+)\]\s*/);
        if (categoryMatch) {
          category = categoryMatch[1]?.toUpperCase();
          cleanTitle = title.replace(/^\[([^\]]+)\]\s*/, '');
        }

        const lastMessageAt = thread.last_engagement || thread.created_at || Date.now();
        const lastRead = lastReadMap[thread.content_id] ?? 0;
        // If lastMessageAt (unix seconds) is after lastRead (unix ms), mark as unread
        const lastMessageMs = lastMessageAt < 1e12 ? lastMessageAt * 1000 : lastMessageAt;
        const unreadCount = lastMessageMs > lastRead ? 1 : 0;

        return {
          id: thread.content_id,
          name: cleanTitle,
          type: 'text' as const,
          category,
          isPinned: false,
          isEncrypted: false,
          unreadCount,
          lastMessageAt,
        };
      });

      // Sort by last activity (newest first)
      transformedChannels.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

      setChannels(transformedChannels);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch channels');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, authReady, serverId]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Refresh channels periodically (every 15 seconds for more real-time feel)
  useEffect(() => {
    if (!connected || !authReady || !serverId) return;

    const interval = setInterval(fetchChannels, 15000);
    return () => clearInterval(interval);
  }, [connected, authReady, serverId, fetchChannels]);

  return {
    channels,
    loading,
    error,
    refetch: fetchChannels,
    markChannelRead,
  };
}

/**
 * Hook to create a new channel (thread) in a server (space)
 */
export function useCreateChannel() {
  const { rpc, connected, authReady } = useRpc();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createChannel = useCallback(async (
    serverId: string,
    name: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
    powParams: {
      pow_nonce: number;
      pow_difficulty: number;
      pow_nonce_space: string;
      pow_hash: string;
      timestamp: number;
    }
  ): Promise<{ success: boolean; channelId: string | null }> => {
    if (!rpc || !connected || !authReady) {
      return { success: false, channelId: null };
    }

    setCreating(true);
    setError(null);

    try {
      // Sign the post
      const signMessage = new TextEncoder().encode(
        `post:${serverId}:${name}::${powParams.timestamp}`
      );
      const signature = signFn(signMessage);
      const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

      // Submit as a post (thread)
      const result = await rpc.submitPost({
        spaceId: serverId,
        title: name,
        body: '', // Empty body for channel-like threads
        authorId: identityPublicKey,
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        signature: signatureHex,
        timestamp: powParams.timestamp,
      });

      return {
        success: true,
        channelId: result.content_id,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create channel';
      setError(errorMessage);
      return { success: false, channelId: null };
    } finally {
      setCreating(false);
    }
  }, [rpc, connected, authReady]);

  return { createChannel, creating, error };
}
