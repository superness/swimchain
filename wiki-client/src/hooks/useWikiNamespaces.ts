/**
 * Hook to fetch wiki namespaces (Swimchain spaces mapped to wiki namespaces).
 * Uses list_spaces RPC.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { WIKI_APP } from '../lib/appNamespace';
import { resolveUnresolvedAppSpaces } from '../lib/resolveSpaces';
import type { WikiNamespace } from '../types/wiki';

interface UseWikiNamespacesResult {
  data: WikiNamespace[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface RpcSpaceSummary {
  space_id: string;
  name: string | null;
  post_count: number;
  last_activity: number | null;
  /** App-namespace tag; wiki namespaces come back as "wiki" with a clean display name. */
  app?: string | null;
  /** Space class: 'social' | 'profile' | 'dm' | 'private' | 'app' | 'unknown' */
  class?: string;
}

interface RpcListSpacesResult {
  spaces: RpcSpaceSummary[];
  total: number;
}

function mapToNamespace(raw: RpcSpaceSummary): WikiNamespace {
  return {
    id: raw.space_id,
    name: raw.name ?? raw.space_id,
    description: '',
    pageCount: raw.post_count,
    memberCount: 0,
    isPrivate: false,
  };
}

export function useWikiNamespaces(): UseWikiNamespacesResult {
  const { rpc, connected } = useRpc();
  const [data, setData] = useState<WikiNamespace[]>([]);
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

    rpc.call<RpcListSpacesResult>('list_spaces', { limit: 200, offset: 0 })
      .then(result => {
        if (!cancelled) {
          // Wiki content is segregated to the wiki client: only surface app-class spaces
          // (class comes from the space id's first byte — no name lookup needed) that
          // are tagged for the "wiki" app namespace specifically (cross-app disambiguation,
          // since other app clients also produce app-class spaces).
          const wikiOnly = result.spaces.filter(s => s.class === 'app' && s.app === WIKI_APP);
          setData(wikiOnly.map(mapToNamespace));
          // Self-sufficient discovery: app-class spaces whose name/app tag is
          // still unresolved on THIS node get their metadata fetched from
          // peers automatically, and the list refetches to pick them up —
          // wiki namespaces appear on fresh nodes without any manual RPC.
          if (resolveUnresolvedAppSpaces(rpc, result.spaces)) {
            setTimeout(() => {
              if (!cancelled) refetch();
            }, 4000);
          }
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch namespaces');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [rpc, connected, fetchKey]);

  return { data, loading, error, refetch };
}
