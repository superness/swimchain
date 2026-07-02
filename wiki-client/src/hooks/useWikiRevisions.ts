/**
 * Hook to fetch revision history for a wiki page.
 *
 * Uses the get_replies RPC (indexed by parent on the node — O(limit), complete)
 * instead of scanning list_space_content client-side. Revisions are replies
 * carrying the wiki-revision header (see lib/revision.ts); plain replies are
 * discussion comments and are excluded here.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { decodeRevisionBody } from '../lib/revision';
import type { SwimchainRpc } from '../lib/rpc';
import type { WikiRevision } from '../types/wiki';

interface UseWikiRevisionsResult {
  data: WikiRevision[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface RpcReplyInfo {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  created_at: number;
  last_engagement: number;
  depth: number;
  child_count: number;
  display_name?: string | null;
}

interface RpcGetRepliesResult {
  parent_id: string;
  replies: RpcReplyInfo[];
  total_count: number;
}

/** get_replies returns unix ms; the rest of the wiki UI uses unix seconds */
function toUnixSeconds(ts: number): number {
  return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

/**
 * Fetch all revisions for a page (newest first).
 * Shared by useWikiRevisions and useWikiPage.
 */
export async function fetchWikiRevisions(
  rpc: SwimchainRpc,
  pageId: string,
): Promise<WikiRevision[]> {
  const result = await rpc.call<RpcGetRepliesResult>('get_replies', {
    content_id: pageId,
    limit: 500,
    depth_limit: 0, // only direct children of the page
  });

  return result.replies
    .filter((r) => r.parent_id === pageId)
    .map((r) => ({ raw: r, decoded: decodeRevisionBody(r.body ?? '') }))
    .filter((x) => x.decoded.isRevision)
    .map((x) => ({
      id: x.raw.content_id,
      pageId,
      author: x.raw.display_name ?? x.raw.author_id,
      authorAddress: x.raw.author_id,
      timestamp: toUnixSeconds(x.raw.created_at),
      summary: x.decoded.summary,
      content: x.decoded.content,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function useWikiRevisions(pageId: string | null): UseWikiRevisionsResult {
  const { rpc, connected } = useRpc();
  const [data, setData] = useState<WikiRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    if (!rpc || !connected || !pageId) {
      setData([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchWikiRevisions(rpc, pageId)
      .then(revisions => {
        if (!cancelled) {
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
  }, [rpc, connected, pageId, fetchKey]);

  return { data, loading, error, refetch };
}
