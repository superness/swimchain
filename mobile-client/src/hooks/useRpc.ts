/**
 * RPC Hooks for React Native
 *
 * Provides hooks for accessing Swimchain node data.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SwimchainRpc,
  getRpcClient,
  type SpaceInfo,
  type ContentItem,
  type ReplyItem,
} from '../services/SwimchainRpc';

/**
 * Hook for RPC connection state
 */
export function useRpcConnection() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const rpcRef = useRef<SwimchainRpc>(getRpcClient());

  useEffect(() => {
    const rpc = rpcRef.current;

    // Subscribe to connection changes
    const unsubscribe = rpc.onConnectionChange((isConnected: boolean) => {
      setConnected(isConnected);
      setConnecting(false);
    });

    // Start auto-reconnect
    rpc.startAutoReconnect(5000);

    return () => {
      unsubscribe();
      rpc.stopAutoReconnect();
    };
  }, []);

  const reconnect = useCallback(async () => {
    setConnecting(true);
    await rpcRef.current.connect();
    setConnecting(false);
  }, []);

  return {
    rpc: rpcRef.current,
    connected,
    connecting,
    reconnect,
  };
}

/**
 * Hook for fetching space list
 */
export function useSpaces() {
  const { rpc, connected } = useRpcConnection();
  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!connected) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.listSpaces();
      setSpaces(result.spaces);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch spaces'));
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    if (connected) {
      refresh();
    }
  }, [connected, refresh]);

  return { spaces, loading, error, refresh };
}

/**
 * Hook for fetching threads in a space
 */
export function useSpaceThreads(spaceId: string | null) {
  const { rpc, connected } = useRpcConnection();
  const [threads, setThreads] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!connected || !spaceId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.listSpaceContent(spaceId, { limit: 50, sort: 'recent' });
      // Filter to only top-level posts (no parent)
      setThreads(result.items.filter((item: ContentItem) => item.parent_id === null));
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch threads'));
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, spaceId]);

  useEffect(() => {
    if (connected && spaceId) {
      refresh();
    }
  }, [connected, spaceId, refresh]);

  return { threads, loading, error, refresh };
}

/**
 * Hook for fetching a single thread with replies
 */
export function useThread(contentId: string | null) {
  const { rpc, connected } = useRpcConnection();
  const [thread, setThread] = useState<ContentItem | null>(null);
  const [replies, setReplies] = useState<ReplyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!connected || !contentId) return;

    setLoading(true);
    setError(null);

    try {
      const [content, repliesResult] = await Promise.all([
        rpc.getContent(contentId),
        rpc.getReplies(contentId),
      ]);
      setThread(content);
      setReplies(repliesResult.replies);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch thread'));
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    if (connected && contentId) {
      refresh();
    }
  }, [connected, contentId, refresh]);

  return { thread, replies, loading, error, refresh };
}

/**
 * Hook for fetching recent content across all spaces
 */
export function useRecentContent(limit: number = 20) {
  const { rpc, connected } = useRpcConnection();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!connected) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getRecentContent(limit);
      setContent(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch content'));
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, limit]);

  useEffect(() => {
    if (connected) {
      refresh();
    }
  }, [connected, refresh]);

  return { content, loading, error, refresh };
}

/**
 * Hook for fetching pools at risk of decay
 */
export function usePoolsAtRisk(threshold: number = 0.1) {
  const { rpc, connected } = useRpcConnection();
  const [pools, setPools] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!connected) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.getPoolsAtRisk(threshold);
      setPools(result.items);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch pools'));
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, threshold]);

  useEffect(() => {
    if (connected) {
      refresh();
    }
  }, [connected, refresh]);

  return { pools, loading, error, refresh };
}
