/**
 * Hook to fetch revision history for a wiki page.
 * Uses list_space_content RPC filtered by parent_id to get the revision chain.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import type { WikiRevision } from '../types/wiki';

interface UseWikiRevisionsResult {
  data: WikiRevision[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
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
  display_name?: string;
}

interface RpcListContentResult {
  items: RpcContentSummary[];
  total: number;
}

function mapToRevision(raw: RpcContentSummary, pageId: string): WikiRevision {
  return {
    id: raw.content_id,
    pageId,
    author: raw.display_name ?? raw.author_id,
    authorAddress: raw.author_id,
    timestamp: raw.created_at,
    summary: raw.title ?? raw.body_preview ?? '',
    content: raw.body ?? '',
  };
}

export function useWikiRevisions(pageId: string | null, spaceId: string | null): UseWikiRevisionsResult {
  const { rpc, connected } = useRpc();
  const [data, setData] = useState<WikiRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    if (!rpc || !connected || !pageId || !spaceId) {
      setData([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Fetch replies to this content — each reply represents a revision/edit
    rpc.call<RpcListContentResult>('list_space_content', {
      space_id: spaceId,
      limit: 100,
      offset: 0,
      sort: 'recent',
      content_type: 'Reply',
    })
      .then(result => {
        if (!cancelled) {
          // Filter to only replies that are direct children of this page
          const revisions = result.items
            .filter(item => item.parent_id === pageId)
            .map(item => mapToRevision(item, pageId))
            .sort((a, b) => b.timestamp - a.timestamp);
          setData(revisions);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch revisions');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [rpc, connected, pageId, spaceId, fetchKey]);

  return { data, loading, error, refetch };
}
