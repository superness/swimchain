/**
 * useNamespacePages — the (title, contentId) index of a wiki namespace.
 *
 * Used to resolve [[wikilinks]] to real page routes and to color existing
 * pages blue vs missing ones red. Same top-level-post filter as NamespacePage
 * (wiki pages are stored as content_type 'Post'; padded 16-byte ids are
 * artifacts, not pages).
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';

export interface NamespacePageRef {
  title: string;
  contentId: string;
}

interface RpcContentItem {
  content_id: string;
  title?: string | null;
  content_type?: string;
  parent_id?: string | null;
}

interface RpcListContentResult {
  items: RpcContentItem[];
}

export function useNamespacePages(namespaceId: string | undefined | null): {
  pages: NamespacePageRef[];
  loading: boolean;
} {
  const { rpc, connected } = useRpc();
  const [pages, setPages] = useState<NamespacePageRef[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPages = useCallback(async () => {
    if (!rpc || !connected || !namespaceId) return;
    setLoading(true);
    try {
      const result = await rpc.call<RpcListContentResult>('list_space_content', {
        space_id: namespaceId,
        limit: 500,
        offset: 0,
        sort: 'recent',
      });
      setPages(
        (result.items ?? [])
          .filter(
            (item) =>
              (item.content_type === 'Post' ||
                (!item.parent_id && item.content_type !== 'Reply')) &&
              !/0{24,}$/.test(item.content_id) &&
              !!item.title,
          )
          .map((item) => ({ title: item.title as string, contentId: item.content_id })),
      );
    } catch {
      /* best-effort: without the index, wikilinks fall back to the slug resolver */
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, namespaceId]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  return { pages, loading };
}

/** Slug used by [[wikilinks]] hrefs — must match lib/wikilinks.ts. */
export function wikiSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}
