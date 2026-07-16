/**
 * Hook to search wiki pages using the search RPC method.
 * Returns WikiPage[] results matching a query string.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { toUnixSeconds } from '../lib/time';
import type { WikiPage } from '../types/wiki';
import type { SearchResult, ThreadInfo, ReplyInfo } from '../types';

interface UseWikiSearchResult {
  data: WikiPage[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

function resultToWikiPage(result: SearchResult): WikiPage | null {
  if (result.type === 'thread') {
    const info = result.data as ThreadInfo;
    return {
      id: info.contentId,
      namespaceId: info.spaceId,
      title: info.title,
      content: info.body,
      author: info.authorName ?? info.authorId,
      authorAddress: info.authorId,
      createdAt: toUnixSeconds(info.createdAt),
      lastEdited: toUnixSeconds(info.lastEngagement),
      revisionCount: 0,
      discussionCount: info.replyCount,
      tags: [],
      isDecaying: false,
      decayProbability: 0,
    };
  }
  if (result.type === 'reply') {
    const info = result.data as ReplyInfo;
    return {
      id: info.contentId,
      namespaceId: info.spaceId,
      title: info.threadTitle ?? '(Reply)',
      content: info.body,
      author: info.authorName ?? info.authorId,
      authorAddress: info.authorId,
      createdAt: toUnixSeconds(info.createdAt),
      lastEdited: toUnixSeconds(info.createdAt),
      revisionCount: 0,
      discussionCount: 0,
      tags: [],
      isDecaying: false,
      decayProbability: 0,
    };
  }
  return null;
}

export function useWikiSearch(query: string): UseWikiSearchResult {
  const { rpc, connected } = useRpc();
  const [data, setData] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!rpc || !connected || !trimmed) {
      setData([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    rpc.search({
      query: trimmed,
      types: ['thread', 'reply'],
      sortBy: 'relevance',
      limit: 50,
      offset: 0,
    })
      .then(response => {
        if (!cancelled) {
          const pages = response.results
            .map(resultToWikiPage)
            .filter((p): p is WikiPage => p !== null);
          setData(pages);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Search failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [rpc, connected, query, fetchKey]);

  return { data, loading, error, refetch };
}
