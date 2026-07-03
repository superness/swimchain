/**
 * useNewPostsIndicator - Track new content in followed sources in real time
 *
 * Subscribes to the node's `content_new` WebSocket events and counts posts
 * from followed spaces (and followed users) that arrived since the last feed
 * refresh. Drives the "N new posts" pill on the Feed page: the pill triggers
 * a refetch on click and never force-scrolls the reader.
 */

import { useCallback, useMemo, useState } from 'react';
import { useNodeEvents } from '@swimchain/frontend';
import { useRpc } from './useRpc';
import { useFeedPreferences } from './useFeedPreferences';

export interface UseNewPostsIndicatorResult {
  /** Number of distinct new posts seen since the last clear. */
  newPostsCount: number;
  /** Reset the counter (call after refetching the feed). */
  clearNewPosts: () => void;
  /** True while the real-time event stream is connected. */
  realtimeConnected: boolean;
}

/**
 * Hook that counts new posts from followed sources via node WebSocket events.
 *
 * @param enabled - Set false to pause the subscription (default true)
 */
export function useNewPostsIndicator(enabled = true): UseNewPostsIndicatorResult {
  const { rpc, connected } = useRpc();
  const { preferences } = useFeedPreferences();

  // Distinct content IDs seen since the last clear (dedupes gossip replays)
  const [newPostIds, setNewPostIds] = useState<ReadonlySet<string>>(new Set());

  const followedSpaceIds = useMemo(
    () => new Set(preferences.followedSpaces.filter(s => s.id && !s.muted).map(s => s.id)),
    [preferences.followedSpaces]
  );
  const followedUserIds = useMemo(
    () => new Set(preferences.followedUsers.filter(u => u.id && !u.muted).map(u => u.id)),
    [preferences.followedUsers]
  );

  const { connected: realtimeConnected } = useNodeEvents({
    url: connected && rpc ? rpc.getEndpoint() : null,
    events: ['content_new'],
    enabled: enabled && (followedSpaceIds.size > 0 || followedUserIds.size > 0),
    onEvent: (event) => {
      const contentId = event.data['content_id'];
      const spaceId = event.data['space_id'];
      const authorId = event.data['author_id'];
      if (typeof contentId !== 'string' || !contentId) return;

      const inFollowedSpace = typeof spaceId === 'string' && followedSpaceIds.has(spaceId);
      const fromFollowedUser = typeof authorId === 'string' && followedUserIds.has(authorId);
      if (!inFollowedSpace && !fromFollowedUser) return;

      setNewPostIds(prev => {
        if (prev.has(contentId)) return prev;
        const next = new Set(prev);
        next.add(contentId);
        return next;
      });
    },
  });

  const clearNewPosts = useCallback(() => {
    setNewPostIds(new Set());
  }, []);

  return {
    newPostsCount: newPostIds.size,
    clearNewPosts,
    realtimeConnected,
  };
}
