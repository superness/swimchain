/**
 * useFeed - Build and fetch aggregated feed from followed sources
 *
 * Combines posts from followed spaces and users, deduplicates,
 * and provides pagination with infinite scroll support.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRpc, stripTitleSeparator } from './useRpc';
import { useFeedPreferences } from './useFeedPreferences';
import { useBlocklist } from './useBlocklist';
import { logger } from '../lib/logger';
import type { FeedItem, FeedCursor, FeedSource } from '../types/feed';

const ITEMS_PER_PAGE = 20;
const FETCH_LIMIT_PER_SOURCE = 50;

/**
 * Filter items by search query (title, body, author)
 */
function filterBySearch(items: FeedItem[], query: string): FeedItem[] {
  if (!query.trim()) return items;

  const normalizedQuery = query.toLowerCase().trim();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return items.filter(item => {
    const searchableText = [
      item.title ?? '',
      item.body,
      item.authorName ?? '',
      item.spaceName ?? '',
    ].join(' ').toLowerCase();

    // All terms must match
    return terms.every(term => searchableText.includes(term));
  });
}

/**
 * Map RPC content to FeedItem
 */
function mapContentToFeedItem(
  content: {
    content_id: string;
    content_type: string;
    author_id: string;
    space_id: string;
    parent_id: string | null;
    created_at: number;
    last_engagement: number;
    body: string | null;
    title: string | null;
    engagement_count: number;
    decay_state: string;
    seconds_until_decay: number | null;
    reply_count?: number;
    media_refs?: Array<{ media_hash: string; media_type: string; size_bytes: number }>;
  },
  source: 'space' | 'user',
  sourceId: string,
  spaceName?: string
): FeedItem {
  return {
    id: content.content_id,
    type: content.parent_id ? 'reply' : 'post',
    spaceId: content.space_id,
    spaceName: spaceName,
    authorId: content.author_id,
    title: content.title ?? undefined,
    // The node stores bodies as title + double-newline + body; strip the
    // prefix or the title renders twice (bold header, then again as the
    // body's first line).
    body: stripTitleSeparator(content.body ?? ''),
    createdAt: content.created_at,
    lastEngagement: content.last_engagement,
    engagementCount: content.engagement_count,
    replyCount: content.reply_count ?? 0,
    decayState: content.decay_state as FeedItem['decayState'],
    secondsUntilDecay: content.seconds_until_decay,
    source,
    sourceId,
    // Attached images: this transform silently dropped media_refs, so feed
    // cards never showed post images even though the detail page did.
    mediaRefs: content.media_refs?.map(mr => ({
      mediaHash: mr.media_hash,
      mediaType: mr.media_type,
      sizeBytes: mr.size_bytes,
    })),
  };
}

/**
 * Deduplicate and sort feed items
 */
function dedupeAndSort(
  items: FeedItem[],
  sortOrder: 'recent' | 'hot',
  cursor?: FeedCursor,
  limit: number = ITEMS_PER_PAGE
): { items: FeedItem[]; hasMore: boolean; nextCursor?: FeedCursor } {
  // Deduplicate by content ID (same post from multiple sources)
  // Also filter out items with no content (body or title)
  const seen = new Set<string>();
  const unique: FeedItem[] = [];

  for (const item of items) {
    if (!seen.has(item.id) && (item.body || item.title)) {
      seen.add(item.id);
      unique.push(item);
    }
  }

  // Sort with secondary sort by ID for deterministic ordering (F-05)
  // This prevents items with identical timestamps from being skipped during pagination
  if (sortOrder === 'recent') {
    unique.sort((a, b) => {
      const timeDiff = b.createdAt - a.createdAt;
      if (timeDiff !== 0) return timeDiff;
      // Secondary sort by ID for deterministic ordering
      return a.id.localeCompare(b.id);
    });
  } else {
    // "hot" - sort by engagement + recency, then by ID
    unique.sort((a, b) => {
      const scoreA = a.engagementCount + (a.createdAt / 1000000);
      const scoreB = b.engagementCount + (b.createdAt / 1000000);
      const scoreDiff = scoreB - scoreA;
      if (scoreDiff !== 0) return scoreDiff;
      // Secondary sort by ID for deterministic ordering
      return a.id.localeCompare(b.id);
    });
  }

  // Apply cursor filter with proper handling for items with same timestamp (F-05)
  let filtered = unique;
  if (cursor) {
    const cursorIndex = filtered.findIndex(
      item => item.createdAt < cursor.timestamp ||
              (item.createdAt === cursor.timestamp && item.id.localeCompare(cursor.lastId) > 0)
    );
    if (cursorIndex > 0) {
      filtered = filtered.slice(cursorIndex);
    } else if (cursorIndex === -1) {
      // All items are before cursor, nothing to return
      filtered = [];
    }
  }

  // Paginate
  const page = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  // Build next cursor
  const lastItem = page[page.length - 1];
  const nextCursor: FeedCursor | undefined = lastItem && hasMore
    ? { timestamp: lastItem.createdAt, lastId: lastItem.id }
    : undefined;

  return { items: page, hasMore, nextCursor };
}

/**
 * Hook result type
 */
export interface UseFeedResult {
  items: FeedItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  isEmpty: boolean;
  hasFollows: boolean;
}

/**
 * Hook options
 */
export interface UseFeedOptions {
  sortOrder?: 'recent' | 'hot';
  filter?: 'all' | 'spaces' | 'users';
  searchQuery?: string;
  /**
   * When set, show ONLY this author's posts (the "View Posts" action). Fetched
   * via get_user_posts, which takes the author's pubkey/id directly, so it
   * works regardless of whether the caller has the hex pubkey or cs1 address.
   */
  authorFilter?: string;
}

/**
 * Hook to build and manage the aggregated feed
 */
export function useFeed(options: UseFeedOptions = {}): UseFeedResult {
  const { sortOrder = 'recent', filter = 'all', searchQuery = '', authorFilter } = options;
  const { rpc, connected } = useRpc();
  const { preferences, loading: prefsLoading } = useFeedPreferences();
  const { filterBlocked, isSpaceBlocked } = useBlocklist();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<FeedCursor | undefined>();

  // Track if initial load has happened
  const initialLoadDone = useRef(false);

  // Cache of all fetched items (for pagination)
  const allItemsRef = useRef<FeedItem[]>([]);

  // Get active sources (non-muted, with valid IDs)
  const activeSources = useMemo(() => {
    const spaces = filter === 'users'
      ? []
      : preferences.followedSpaces.filter(s => s.id && !s.muted);
    const users = filter === 'spaces'
      ? []
      : preferences.followedUsers.filter(u => u.id && !u.muted);
    return { spaces, users };
  }, [preferences.followedSpaces, preferences.followedUsers, filter]);

  const hasFollows = activeSources.spaces.length > 0 || activeSources.users.length > 0;

  /**
   * Fetch content from all followed sources
   */
  const fetchFromSources = useCallback(async (
    spaces: FeedSource[],
    users: FeedSource[]
  ): Promise<FeedItem[]> => {
    if (!rpc) return [];

    const items: FeedItem[] = [];
    const errors: string[] = [];

    // SWIM-FEED-DIAG (#6): trace exactly which followed spaces get fetched and what
    // comes back — routed via logger so it lands in the desktop log. A followed
    // space that silently returns 0 items (or throws on a bad space.id) is why it
    // never shows in the feed.
    logger.info(
      `[Feed] fetching followed sources: spaces=[${spaces.map(s => s.id).join(', ')}] users=${users.length}`
    );

    // Fetch from spaces in parallel
    const spacePromises = spaces.map(async (space) => {
      try {
        const result = await rpc.listSpaceContent(space.id, {
          limit: FETCH_LIMIT_PER_SOURCE,
          sort: 'recent',
        });
        logger.info(`[Feed] followed space ${space.id} -> ${result.items.length} item(s)`);
        return result.items.map(item =>
          mapContentToFeedItem(item, 'space', space.id, space.displayName)
        );
      } catch (err) {
        logger.error(`[Feed] Failed to fetch followed space ${space.id}:`, err);
        errors.push(`Space ${space.displayName ?? space.id}: ${err}`);
        return [];
      }
    });

    // Fetch posts from followed users via get_user_posts RPC
    const userPromises = users.map(async (user) => {
      try {
        const result = await rpc.getUserPosts({
          userId: user.id,
          limit: FETCH_LIMIT_PER_SOURCE,
        });
        return result.items.map(item =>
          mapContentToFeedItem(item, 'user', user.id, user.displayName)
        );
      } catch (err) {
        console.error(`[Feed] Failed to fetch user ${user.id}:`, err);
        errors.push(`User ${user.displayName ?? user.id}: ${err}`);
        return [];
      }
    });

    const allResults = await Promise.all([...spacePromises, ...userPromises]);
    for (const sourceItems of allResults) {
      items.push(...sourceItems);
    }

    if (errors.length > 0 && items.length === 0) {
      throw new Error(errors.join('; '));
    }

    return items;
  }, [rpc]);

  /**
   * Load feed (initial or refresh)
   */
  const loadFeed = useCallback(async (isRefresh = false) => {
    if (!connected || prefsLoading) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Author-filtered view ("View Posts"): fetch only this author's posts.
      const allItems = authorFilter
        ? (await rpc!.getUserPosts({ userId: authorFilter, limit: FETCH_LIMIT_PER_SOURCE }))
            .items.map(item => mapContentToFeedItem(item, 'user', authorFilter))
        : await fetchFromSources(activeSources.spaces, activeSources.users);

      // Filter out blocked content/authors, and — unless "Show Replies in Feed" is
      // on — reply items (the feed fetches posts + replies together; without this the
      // toggle did nothing and replies always showed).
      const unblockedItems = filterBlocked(
        allItems.filter(item =>
          !isSpaceBlocked(item.spaceId) &&
          (preferences.showRepliesInFeed || item.type !== 'reply')
        ),
        'post',
        { alsoFilterByAuthor: true }
      );

      // Store in ref for pagination
      allItemsRef.current = unblockedItems;

      // Apply search filter
      const filteredItems = filterBySearch(unblockedItems, searchQuery);

      // Dedupe, sort, and paginate
      const result = dedupeAndSort(filteredItems, sortOrder, undefined, ITEMS_PER_PAGE);

      setItems(result.items);
      setHasMore(result.hasMore);
      setCursor(result.nextCursor);
      initialLoadDone.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [connected, prefsLoading, activeSources, fetchFromSources, sortOrder, preferences.showRepliesInFeed, filterBlocked, isSpaceBlocked, authorFilter, rpc]);

  /**
   * Load more items (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || !cursor) return;

    // Apply search filter and paginate from cached items
    const filteredItems = filterBySearch(allItemsRef.current, searchQuery);
    const result = dedupeAndSort(
      filteredItems,
      sortOrder,
      cursor,
      ITEMS_PER_PAGE
    );

    setItems(prev => [...prev, ...result.items]);
    setHasMore(result.hasMore);
    setCursor(result.nextCursor);
  }, [hasMore, loading, cursor, sortOrder, searchQuery]);

  /**
   * Refresh feed
   */
  const refresh = useCallback(async () => {
    await loadFeed(true);
  }, [loadFeed]);

  // Initial load when connected and preferences ready
  useEffect(() => {
    if (!initialLoadDone.current && connected && !prefsLoading) {
      loadFeed();
    }
  }, [connected, prefsLoading, loadFeed]);

  // Reload when sort order or search query changes
  useEffect(() => {
    if (initialLoadDone.current) {
      // Apply search filter and re-sort existing cached items
      const filteredItems = filterBySearch(allItemsRef.current, searchQuery);
      const result = dedupeAndSort(
        filteredItems,
        sortOrder,
        undefined,
        ITEMS_PER_PAGE
      );
      setItems(result.items);
      setHasMore(result.hasMore);
      setCursor(result.nextCursor);
    }
  }, [sortOrder, searchQuery]);

  // Reload when followed sources change
  useEffect(() => {
    if (initialLoadDone.current) {
      loadFeed(true);
    }
  }, [activeSources.spaces.length, activeSources.users.length]);

  return {
    items,
    loading,
    refreshing,
    error,
    hasMore,
    loadMore,
    refresh,
    isEmpty: !loading && items.length === 0,
    hasFollows,
  };
}
