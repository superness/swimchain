/**
 * Hook to fetch a single wiki page by content ID.
 *
 * Fetches the page post plus its revision chain (revision replies — see
 * lib/revision.ts) and surfaces the latest revision as the current content.
 * The original post body is kept as `baseContent` for history diffs.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { fetchWikiRevisions } from './useWikiRevisions';
import type { WikiPage } from '../types/wiki';
import type { WikiRevision } from '../types/wiki';

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

function mapToWikiPage(raw: RpcContentResult, revisions: WikiRevision[]): WikiPage {
  const latest = revisions[0] ?? null;
  const baseContent = raw.body ?? '';

  return {
    id: raw.content_id,
    namespaceId: raw.space_id,
    title: raw.title ?? '(Untitled)',
    content: latest ? latest.content : baseContent,
    baseContent,
    author: raw.display_name ?? raw.author_id,
    authorAddress: raw.author_id,
    createdAt: raw.created_at,
    lastEdited: latest ? latest.timestamp : raw.last_engagement,
    revisionCount: revisions.length,
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

    const load = async () => {
      const result = await rpc.call<RpcContentResult>('get_content', { content_id: contentId });

      // Revision fetch failure should not hide the page itself
      let revisions: WikiRevision[] = [];
      try {
        revisions = await fetchWikiRevisions(rpc, contentId);
      } catch {
        revisions = [];
      }

      return mapToWikiPage(result, revisions);
    };

    load()
      .then(page => {
        if (!cancelled) {
          setData(page);
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
