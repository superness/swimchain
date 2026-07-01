/**
 * @swimchain/react - React Hooks for Swimchain
 *
 * Connect your React app to the Swimchain network.
 * The app automatically connects to YOUR local node (which the app runs).
 *
 * @example
 * ```tsx
 * import { SwimchainProvider, useNode, useSpaceContent } from '@swimchain/react';
 *
 * function App() {
 *   return (
 *     <SwimchainProvider network="testnet">
 *       <MyForumApp />
 *     </SwimchainProvider>
 *   );
 * }
 *
 * function MyForumApp() {
 *   const { status, peerCount } = useNode();
 *   const { posts, loading } = useSpaceContent('space_123');
 *
 *   if (status !== 'connected') {
 *     return <div>Connecting to network...</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <header>Connected to {peerCount} peers</header>
 *       {posts.map(post => <PostCard key={post.content_id} post={post} />)}
 *     </div>
 *   );
 * }
 * ```
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  SwimchainClient,
  NodeInfo,
  PeerInfo,
  SyncStatus,
  Content,
  SpaceContentList,
  PoolInfo,
  ForkInfo,
  SubmitResult,
  SwimchainRpcError,
} from '@swimchain/rpc';

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SwimchainContextValue {
  /** Current connection status */
  status: ConnectionStatus;

  /** Error message if status is 'error' */
  error: string | null;

  /** RPC client instance (null if not connected) */
  client: SwimchainClient | null;

  /** Network info from the node */
  nodeInfo: NodeInfo | null;

  /** Number of connected peers */
  peerCount: number;

  /** Sync status */
  syncStatus: SyncStatus | null;

  /** Manually reconnect */
  reconnect: () => Promise<void>;

  /** Current network */
  network: 'mainnet' | 'testnet' | 'regtest';

  /** RPC endpoint URL */
  endpoint: string;
}

export interface SwimchainProviderProps {
  children: React.ReactNode;

  /** Network to connect to (default: testnet) */
  network?: 'mainnet' | 'testnet' | 'regtest';

  /** Override RPC endpoint (default: localhost based on network) */
  endpoint?: string;

  /** Auth cookie for RPC (default: reads from daemon state) */
  authCookie?: string;

  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;

  /** Reconnect interval in ms (default: 5000) */
  reconnectInterval?: number;

  /** Poll interval for status updates in ms (default: 10000) */
  pollInterval?: number;
}

// ============================================================================
// Context
// ============================================================================

const SwimchainContext = createContext<SwimchainContextValue | null>(null);

// Default ports per network
const DEFAULT_RPC_PORTS = {
  mainnet: 9100,
  testnet: 19100,
  regtest: 29100,
};

// ============================================================================
// Provider Component
// ============================================================================

export function SwimchainProvider({
  children,
  network = 'testnet',
  endpoint: customEndpoint,
  authCookie,
  autoReconnect = true,
  reconnectInterval = 5000,
  pollInterval = 10000,
}: SwimchainProviderProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<SwimchainClient | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Compute endpoint
  const endpoint = customEndpoint ?? `http://127.0.0.1:${DEFAULT_RPC_PORTS[network]}`;

  // Connect to node
  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    setStatus('connecting');
    setError(null);

    try {
      const newClient = new SwimchainClient({
        endpoint,
        auth: authCookie ? { username: '__cookie__', password: authCookie } : undefined,
        timeout: 10000,
      });

      // Test connection
      const info = await newClient.getInfo();

      if (!mountedRef.current) return;

      setClient(newClient);
      setNodeInfo(info);
      setStatus('connected');

      // Get initial sync status
      try {
        const sync = await newClient.getSyncStatus();
        if (mountedRef.current) {
          setSyncStatus(sync);
        }
      } catch {
        // Sync status might not be available
      }

    } catch (err) {
      if (!mountedRef.current) return;

      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      setStatus('error');
      setClient(null);
      setNodeInfo(null);

      // Schedule reconnect
      if (autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    }
  }, [endpoint, authCookie, autoReconnect, reconnectInterval]);

  // Poll for status updates
  const pollStatus = useCallback(async () => {
    if (!client || status !== 'connected' || !mountedRef.current) return;

    try {
      const [info, sync] = await Promise.all([
        client.getInfo(),
        client.getSyncStatus().catch(() => null),
      ]);

      if (mountedRef.current) {
        setNodeInfo(info);
        if (sync) setSyncStatus(sync);
      }
    } catch (err) {
      // Connection lost
      if (mountedRef.current) {
        setStatus('error');
        setError('Connection lost');

        if (autoReconnect) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      }
    }
  }, [client, status, autoReconnect, reconnectInterval, connect]);

  // Initial connection
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [connect]);

  // Status polling
  useEffect(() => {
    if (status !== 'connected') return;

    const poll = () => {
      pollStatus();
      if (mountedRef.current) {
        pollTimeoutRef.current = setTimeout(poll, pollInterval);
      }
    };

    pollTimeoutRef.current = setTimeout(poll, pollInterval);

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [status, pollInterval, pollStatus]);

  const value: SwimchainContextValue = {
    status,
    error,
    client,
    nodeInfo,
    peerCount: nodeInfo?.peer_count ?? 0,
    syncStatus,
    reconnect: connect,
    network,
    endpoint,
  };

  return (
    <SwimchainContext.Provider value={value}>
      {children}
    </SwimchainContext.Provider>
  );
}

// ============================================================================
// Core Hooks
// ============================================================================

/**
 * Get the Swimchain context
 * @throws if used outside SwimchainProvider
 */
export function useSwimchain(): SwimchainContextValue {
  const context = useContext(SwimchainContext);
  if (!context) {
    throw new Error('useSwimchain must be used within a SwimchainProvider');
  }
  return context;
}

/**
 * Get node status information
 */
export function useNode() {
  const { status, error, nodeInfo, peerCount, syncStatus, reconnect, network } = useSwimchain();

  return {
    status,
    error,
    network,
    version: nodeInfo?.version ?? null,
    blockHeight: nodeInfo?.block_height ?? 0,
    peerCount,
    uptime: nodeInfo?.uptime_seconds ?? 0,
    syncStatus,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    hasError: status === 'error',
    reconnect,
  };
}

/**
 * Get list of connected peers
 */
export function usePeers() {
  const { client, status } = useSwimchain();
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client || status !== 'connected') return;

    setLoading(true);
    setError(null);

    try {
      const peerList = await client.getPeers();
      setPeers(peerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch peers');
    } finally {
      setLoading(false);
    }
  }, [client, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { peers, loading, error, refresh };
}

// ============================================================================
// Content Hooks
// ============================================================================

/**
 * Get content in a space
 */
export function useSpaceContent(
  spaceId: string | null,
  options: { limit?: number; offset?: number; sort?: 'recent' | 'hot' | 'top' } = {}
) {
  const { client, status } = useSwimchain();
  const [content, setContent] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const refresh = useCallback(async () => {
    if (!client || status !== 'connected' || !spaceId) {
      setContent([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await client.listSpaceContent(spaceId, optionsRef.current);
      setContent(result.items);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof SwimchainRpcError && err.code === 1006) {
        // Space not found - empty result
        setContent([]);
        setTotal(0);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch content');
      }
    } finally {
      setLoading(false);
    }
  }, [client, status, spaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    posts: content,
    total,
    loading,
    error,
    refresh,
    hasMore: content.length < total,
  };
}

/**
 * Get a single piece of content by ID
 */
export function useContent(contentId: string | null) {
  const { client, status } = useSwimchain();
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client || status !== 'connected' || !contentId) {
      setContent(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await client.getContent(contentId);
      setContent(result);
    } catch (err) {
      if (err instanceof SwimchainRpcError && err.code === 1006) {
        // Content not found locally - request from network
        try {
          await client.requestContent(contentId);
          setError('Content requested from network, please wait...');
        } catch {
          setError('Content not found');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch content');
      }
    } finally {
      setLoading(false);
    }
  }, [client, status, contentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { content, loading, error, refresh };
}

// ============================================================================
// Pool Hooks
// ============================================================================

/**
 * Get engagement pool information
 */
export function usePool(poolId: string | null) {
  const { client, status } = useSwimchain();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client || status !== 'connected' || !poolId) {
      setPool(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await client.getPoolInfo(poolId);
      setPool(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pool');
    } finally {
      setLoading(false);
    }
  }, [client, status, poolId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pool, loading, error, refresh };
}

// ============================================================================
// Fork Hooks
// ============================================================================

/**
 * Get active fork and list all forks
 */
export function useForks() {
  const { client, status } = useSwimchain();
  const [forks, setForks] = useState<ForkInfo[]>([]);
  const [activeFork, setActiveFork] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!client || status !== 'connected') return;

    setLoading(true);
    setError(null);

    try {
      const [forkList, active] = await Promise.all([
        client.listForks(),
        client.getActiveFork(),
      ]);

      // Get full info for each fork
      const fullForks = await Promise.all(
        forkList.forks.map(f => client.getForkInfo(f.fork_id).catch(() => ({
          fork_id: f.fork_id,
          name: f.name,
          is_active: f.is_active,
        })))
      );

      setForks(fullForks as ForkInfo[]);
      setActiveFork(active.fork_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forks');
    } finally {
      setLoading(false);
    }
  }, [client, status]);

  const switchFork = useCallback(async (forkId: string) => {
    if (!client || status !== 'connected') return;

    try {
      const result = await client.switchFork(forkId);
      if (result.success) {
        setActiveFork(result.active_fork);
      }
      return result.success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch fork');
      return false;
    }
  }, [client, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { forks, activeFork, loading, error, refresh, switchFork };
}

// ============================================================================
// Action Hooks
// ============================================================================

/**
 * Hook for submitting content (posts/replies)
 *
 * Note: Requires @swimchain/core for PoW computation
 */
export function useSubmitContent() {
  const { client, status } = useSwimchain();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SubmitResult | null>(null);

  const submitPost = useCallback(async (params: {
    spaceId: string;
    title: string;
    body: string;
    authorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }) => {
    if (!client || status !== 'connected') {
      setError('Not connected to node');
      return null;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await client.submitPost({
        space_id: params.spaceId,
        title: params.title,
        body: params.body,
        author_id: params.authorId,
        pow_nonce: params.powNonce,
        pow_difficulty: params.powDifficulty,
        pow_nonce_space: params.powNonceSpace,
        pow_hash: params.powHash,
        signature: params.signature,
        timestamp: params.timestamp,
      });

      setLastResult(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit post';
      setError(message);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [client, status]);

  const submitReply = useCallback(async (params: {
    parentId: string;
    body: string;
    authorId: string;
    powNonce: number;
    powDifficulty: number;
    powNonceSpace: string;
    powHash: string;
    signature: string;
    timestamp: number;
  }) => {
    if (!client || status !== 'connected') {
      setError('Not connected to node');
      return null;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await client.submitReply({
        parent_id: params.parentId,
        body: params.body,
        author_id: params.authorId,
        pow_nonce: params.powNonce,
        pow_difficulty: params.powDifficulty,
        pow_nonce_space: params.powNonceSpace,
        pow_hash: params.powHash,
        signature: params.signature,
        timestamp: params.timestamp,
      });

      setLastResult(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit reply';
      setError(message);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [client, status]);

  return {
    submitPost,
    submitReply,
    submitting,
    error,
    lastResult,
    clearError: () => setError(null),
  };
}

// ============================================================================
// Re-export types from @swimchain/rpc
// ============================================================================

export type {
  NodeInfo,
  PeerInfo,
  SyncStatus,
  Content,
  SpaceContentList,
  PoolInfo,
  ForkInfo,
  SubmitResult,
  SwimchainRpcError,
} from '@swimchain/rpc';
