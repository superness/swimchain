/**
 * Hook to fetch a single wiki page by content ID.
 * Maps Swimchain content to WikiPage type.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import type { WikiPage } from '../types/wiki';

interface UseWikiPageResult {
  data: WikiPage | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface RpcContentResult {
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
  survival_probability: number;
  reply_count?: number;
  display_name?: string;
}

function mapToWikiPage(raw: RpcContentResult): WikiPage {
  return {
    id: raw.content_id,
    namespaceId: raw.space_id,
    title: raw.title ?? '(Untitled)',
    content: raw.body ?? '',
    author: raw.display_name ?? raw.author_id,
    authorAddress: raw.author_id,
    createdAt: raw.created_at,
    lastEdited: raw.last_engagement,
    revisionCount: raw.reply_count ?? 0,
    discussionCount: 0,
    tags: [],
    isDecaying: raw.decay_state === 'stale' || raw.decay_state === 'decayed',
    decayProbability: 1 - raw.survival_probability,
  };
}

export function useWikiPage(contentId: string | null): UseWikiPageResult {
  const { rpc, connected } = useRpc();
  const [data, setData] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    if (!rpc || !connected || !contentId) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    rpc.call<RpcContentResult>('get_content', { content_id: contentId })
      .then(result => {
        if (!cancelled) {
          setData(mapToWikiPage(result));
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch page');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [rpc, connected, contentId, fetchKey]);

  return { data, loading, error, refetch };
}
