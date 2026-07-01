/**
 * Hook to fetch recent content changes across all namespaces.
 * Uses list_spaces + list_space_content RPCs to aggregate recent activity.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import type { WikiPage } from '../types/wiki';

interface UseRecentChangesResult {
  data: WikiPage[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface RpcSpaceSummary {
  space_id: string;
  name: string | null;
  post_count: number;
  last_activity: number | null;
}

interface RpcListSpacesResult {
  spaces: RpcSpaceSummary[];
  total: number;
}

interface RpcContentSummary {
  content_id: string;
  content_type: string;
  author_id: string;
  space_id: string;
  parent_id: string | null;
  created_at: number;
  last_engagement: number;
  title: string | null;
  body: string | null;
  body_preview: string | null;
  engagement_count: number;
  reply_count: number;
  decay_state: string;
  survival_probability: number;
  display_name?: string;
}

interface RpcListContentResult {
  items: RpcContentSummary[];
  total: number;
}

function mapToWikiPage(raw: RpcContentSummary): WikiPage {
  return {
    id: raw.content_id,
    namespaceId: raw.space_id,
    title: raw.title ?? raw.body_preview ?? '(Untitled)',
    content: raw.body ?? '',
    author: raw.display_name ?? raw.author_id,
    authorAddress: raw.author_id,
    createdAt: raw.created_at,
    lastEdited: raw.last_engagement,
    revisionCount: raw.reply_count,
    discussionCount: 0,
    tags: [],
    isDecaying: raw.decay_state === 'stale' || raw.decay_state === 'decayed',
    decayProbability: 1 - raw.survival_probability,
  };
}

export function useRecentChanges(limit = 50): UseRecentChangesResult {
  const { rpc, connected } = useRpc();
  const [data, setData] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    if (!rpc || !connected) {
      setData([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Get all spaces first
        const spacesResult = await rpc.call<RpcListSpacesResult>('list_spaces', {
          limit: 50,
          offset: 0,
        });

        // Sort spaces by last_activity descending, take top active ones
        const activeSpaces = spacesResult.spaces
          .filter(s => s.last_activity != null && s.post_count > 0)
          .sort((a, b) => (b.last_activity ?? 0) - (a.last_activity ?? 0))
          .slice(0, 10);

        // Fetch recent content from each active space in parallel
        const contentPromises = activeSpaces.map(space =>
          rpc.call<RpcListContentResult>('list_space_content', {
            space_id: space.space_id,
            limit: 20,
            offset: 0,
            sort: 'recent',
          }).catch(() => ({ items: [], total: 0 }) as RpcListContentResult)
        );

        const contentResults = await Promise.all(contentPromises);
        if (cancelled) return;

        // Merge all content, sort by last_engagement descending, take top N
        const allItems = contentResults
          .flatMap(r => r.items)
          .sort((a, b) => b.last_engagement - a.last_engagement)
          .slice(0, limit);

        setData(allItems.map(mapToWikiPage));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch recent changes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, limit, fetchKey]);

  return { data, loading, error, refetch };
}
