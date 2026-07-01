/**
 * Hook to fetch wiki namespaces (Swimchain spaces mapped to wiki namespaces).
 * Uses list_spaces RPC.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
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
          setData(result.spaces.map(mapToNamespace));
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
