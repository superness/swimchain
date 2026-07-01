/**
 * React hooks for Swimchain RPC integration - Analytics Client
 * Read-focused hooks for network stats and space metrics
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  SwimchainRpc,
  RpcConfig,
  initRpc,
  LOCAL_CONFIG,
} from '../lib/rpc';

// =========================================================================
// Constants
// =========================================================================

// Exponential backoff: 5s -> 10s -> 20s -> 40s -> 60s (cap)
const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;

// =========================================================================
// Context
// =========================================================================

interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
}

const RpcContext = createContext<RpcContextValue | null>(null);

/**
 * RPC Provider component
 */
export function RpcProvider({ children }: { children: ReactNode }) {
  const [rpc, setRpc] = useState<SwimchainRpc | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeInfo, setNodeInfo] = useState<RpcContextValue['nodeInfo']>(null);

  const connect = useCallback(async (config: RpcConfig): Promise<boolean> => {
    setConnecting(true);
    setError(null);

    try {
      const client = initRpc(config);
      const success = await client.connect();

      if (success) {
        const info = client.getNodeInfo();
        setRpc(client);
        setConnected(true);
        setNodeInfo(info ? {
          version: info.version,
          network: info.network,
          peerCount: info.peer_count,
        } : null);
        return true;
      } else {
        setError('Failed to connect to node');
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  // Auto-connect to local node with exponential backoff
  const retryDelayRef = useRef(INITIAL_RETRY_DELAY_MS);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const autoConnect = async () => {
      if (await connect(LOCAL_CONFIG)) {
        retryDelayRef.current = INITIAL_RETRY_DELAY_MS; // Reset backoff on success
        return;
      }

      if (cancelled) return;

      // Schedule retry with exponential backoff
      const delay = retryDelayRef.current;

      retryTimeoutRef.current = setTimeout(() => {
        if (!cancelled) {
          // Increase delay for next retry (capped at MAX_RETRY_DELAY_MS)
          retryDelayRef.current = Math.min(delay * 2, MAX_RETRY_DELAY_MS);
          autoConnect();
        }
      }, delay);
    };

    autoConnect();

    return () => {
      cancelled = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return (
    <RpcContext.Provider value={{ rpc, connected, connecting, error, nodeInfo }}>
      {children}
    </RpcContext.Provider>
  );
}

/**
 * Hook to access RPC context
 */
export function useRpc() {
  const context = useContext(RpcContext);
  if (!context) {
    throw new Error('useRpc must be used within RpcProvider');
  }
  return context;
}

// =========================================================================
// Data fetching hooks for Analytics
// =========================================================================

export interface NetworkStats {
  activeSwimmers: number;
  totalPosts: number;
  postsAtRisk: number;
  avgHeat: number;
  lastSyncTimestamp: string;
  lastSyncAgeMinutes: number;
  peerCount: number;
  chainPercent: number;
}

export interface SpaceStats {
  spaceId: string;
  name: string;
  postCount: number;
  memberCount: number;
  posts: Array<{
    id: string;
    heat: number;
    authorId: string;
    createdAt: string;
    lastEngagement: string;
    engagementCount: number;
  }>;
}

/**
 * Hook to fetch network-wide statistics
 */
export function useNetworkStats(): {
  stats: NetworkStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [syncStatus, peers, spaces] = await Promise.all([
        rpc.getSyncStatus(),
        rpc.getPeers(),
        rpc.listSpaces(),
      ]);

      // Calculate aggregate stats from spaces
      let totalPosts = 0;
      let postsAtRisk = 0;
      let totalHeat = 0;
      let postCount = 0;

      for (const space of spaces.spaces) {
        totalPosts += space.post_count;
        // Get content for each space to calculate heat
        try {
          const content = await rpc.listSpaceContent(space.space_id);
          for (const item of content.items) {
            const heat = item.survival_probability ?? 1.0;
            totalHeat += heat;
            postCount++;
            if (heat < 0.25) { // At-risk threshold per SPEC_09 section 6.1.2
              postsAtRisk++;
            }
          }
        } catch {
          // Space might not have content
        }
      }

      const avgHeat = postCount > 0 ? (totalHeat / postCount) * 100 : 0;
      const lastSyncTime = syncStatus.last_block_time ?? Math.floor(Date.now() / 1000);
      const lastSyncAgeMinutes = (Date.now() / 1000 - lastSyncTime) / 60;

      setStats({
        activeSwimmers: peers.length,
        totalPosts,
        postsAtRisk,
        avgHeat,
        lastSyncTimestamp: new Date(lastSyncTime * 1000).toISOString(),
        lastSyncAgeMinutes,
        peerCount: syncStatus.peer_count,
        chainPercent: syncStatus.chain_percent,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { stats, loading, error, refetch };
}

/**
 * Hook to fetch space-specific statistics
 */
export function useSpaceStats(spaceId: string): {
  stats: SpaceStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected || !spaceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const content = await rpc.listSpaceContent(spaceId);

      const posts = content.items.map(item => ({
        id: item.content_id,
        heat: (item.survival_probability ?? 1.0) * 100,
        authorId: item.author_id,
        createdAt: new Date(item.created_at).toISOString(),
        lastEngagement: new Date(item.last_engagement).toISOString(),
        engagementCount: item.reply_count ?? 0,
      }));

      // Get unique authors as member count proxy
      const uniqueAuthors = new Set(posts.map(p => p.authorId));

      setStats({
        spaceId,
        name: spaceId, // Could be enhanced with space metadata
        postCount: posts.length,
        memberCount: uniqueAuthors.size,
        posts,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch space stats');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, spaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { stats, loading, error, refetch };
}

/**
 * Hook to list all spaces
 */
export function useSpaceList(): {
  spaces: Array<{ id: string; name: string; postCount: number }>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string; postCount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaces();
      setSpaces(result.spaces.map(s => ({
        id: s.space_id,
        name: s.name ?? s.space_id.substring(0, 12) + '...',
        postCount: s.post_count,
      })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spaces');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { spaces, loading, error, refetch };
}
