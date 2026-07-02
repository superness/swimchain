/**
 * useActiveAuthors - Discover users by aggregating recent content authors
 *
 * There is no node-side user-listing RPC, so we source users from the
 * authors of recent content in a set of spaces (list_space_content).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRpc } from './useRpc';

export interface ActiveAuthor {
  /** Author public key (hex) */
  userPk: string;
  /** Number of recent posts/replies seen from this author */
  postCount: number;
  /** Most recent post timestamp (unix seconds) */
  lastActive: number;
  /** Number of distinct spaces the author was seen in */
  spaceCount: number;
}

const CONTENT_PER_SPACE = 50;
const MAX_SPACES = 10;
const MAX_AUTHORS = 30;

/**
 * Aggregate recent content authors across the given spaces.
 *
 * @param spaceIds - Spaces to scan for authors (e.g. followed spaces)
 * @param excludePk - Public key to exclude (typically the current user)
 */
export function useActiveAuthors(spaceIds: string[], excludePk?: string | null): {
  authors: ActiveAuthor[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [authors, setAuthors] = useState<ActiveAuthor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable key so effect only re-runs when the actual set of spaces changes
  const spacesKey = useMemo(() => spaceIds.slice(0, MAX_SPACES).join(','), [spaceIds]);

  const fetchAuthors = useCallback(async () => {
    if (!rpc || !connected) return;
    const ids = spacesKey ? spacesKey.split(',') : [];
    if (ids.length === 0) {
      setAuthors([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        ids.map(async spaceId => {
          try {
            const result = await rpc.listSpaceContent(spaceId, {
              limit: CONTENT_PER_SPACE,
              sort: 'recent',
            });
            return result.items.map(item => ({
              authorId: item.author_id,
              spaceId,
              createdAt: item.created_at,
            }));
          } catch (err) {
            console.error(`[ActiveAuthors] Failed to fetch space ${spaceId}:`, err);
            return [];
          }
        })
      );

      const byAuthor = new Map<string, { postCount: number; lastActive: number; spaces: Set<string> }>();
      for (const items of results) {
        for (const item of items) {
          if (!item.authorId) continue;
          if (excludePk && item.authorId.toLowerCase() === excludePk.toLowerCase()) continue;
          const entry = byAuthor.get(item.authorId) ?? { postCount: 0, lastActive: 0, spaces: new Set<string>() };
          entry.postCount += 1;
          entry.lastActive = Math.max(entry.lastActive, item.createdAt);
          entry.spaces.add(item.spaceId);
          byAuthor.set(item.authorId, entry);
        }
      }

      const aggregated: ActiveAuthor[] = Array.from(byAuthor.entries())
        .map(([userPk, info]) => ({
          userPk,
          postCount: info.postCount,
          lastActive: info.lastActive,
          spaceCount: info.spaces.size,
        }))
        .sort((a, b) => b.postCount - a.postCount || b.lastActive - a.lastActive)
        .slice(0, MAX_AUTHORS);

      setAuthors(aggregated);
    } catch (err) {
      console.error('[ActiveAuthors] Failed to aggregate authors:', err);
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, spacesKey, excludePk]);

  useEffect(() => {
    if (connected) {
      fetchAuthors();
    }
  }, [connected, fetchAuthors]);

  return { authors, loading, error, refetch: fetchAuthors };
}
