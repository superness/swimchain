/**
 * RPC Hook for Bridge Client
 *
 * Provides access to Swimchain node connection and content watching.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { SwimchainRpc, LOCAL_CONFIG } from '../lib/rpc';

interface RpcContextValue {
  rpc: SwimchainRpc | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnect: () => Promise<void>;
}

const RpcContext = createContext<RpcContextValue>({
  rpc: null,
  connected: false,
  connecting: true,
  error: null,
  reconnect: async () => {},
});

const RETRY_INTERVAL = 5000;

export function RpcProvider({ children }: { children: ReactNode }): JSX.Element {
  const [rpc] = useState(() => new SwimchainRpc(LOCAL_CONFIG));
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const success = await rpc.connect();
      setConnected(success);
      if (!success) {
        setError('Failed to connect to node');
      }
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Connection error');
    } finally {
      setConnecting(false);
    }
  }, [rpc]);

  const reconnect = useCallback(async () => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    await connect();
  }, [connect]);

  useEffect(() => {
    connect();

    // Auto-retry on failure
    const scheduleRetry = () => {
      if (!connected && !connecting) {
        retryRef.current = setTimeout(() => {
          connect().then(() => {
            if (!connected) scheduleRetry();
          });
        }, RETRY_INTERVAL);
      }
    };

    scheduleRetry();

    return () => {
      if (retryRef.current) {
        clearTimeout(retryRef.current);
      }
    };
  }, [connect, connected, connecting]);

  return (
    <RpcContext.Provider value={{ rpc, connected, connecting, error, reconnect }}>
      {children}
    </RpcContext.Provider>
  );
}

export function useRpc(): RpcContextValue {
  return useContext(RpcContext);
}

/**
 * Hook to watch for new content in a space.
 * Polls for content newer than the last seen timestamp.
 */
export function useContentWatcher(
  spaceId: string | null,
  pollIntervalMs: number = 10000
) {
  const { rpc, connected } = useRpc();
  const [lastContent, setLastContent] = useState<Array<{
    content_id: string;
    author_id: string;
    body: string | null;
    title: string | null;
    created_at: number;
  }>>([]);
  const [lastTimestamp, setLastTimestamp] = useState<number>(
    () => Math.floor(Date.now() / 1000) - 3600 // Start from 1 hour ago
  );
  const [isWatching, setIsWatching] = useState(false);

  useEffect(() => {
    if (!rpc || !connected || !spaceId) {
      setIsWatching(false);
      return;
    }

    setIsWatching(true);
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      try {
        const result = await rpc.getContentSince(spaceId, lastTimestamp);
        if (result.items.length > 0 && !cancelled) {
          setLastContent(result.items);
          // Update timestamp to newest item
          const newest = Math.max(...result.items.map((i) => i.created_at));
          setLastTimestamp(newest);
        }
      } catch (err) {
        console.error('[ContentWatcher] Poll failed:', err);
      }
    };

    // Initial poll
    poll();

    // Set up interval
    const interval = setInterval(poll, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
      setIsWatching(false);
    };
  }, [rpc, connected, spaceId, pollIntervalMs, lastTimestamp]);

  return {
    newContent: lastContent,
    isWatching,
    lastTimestamp,
    resetTimestamp: () => setLastTimestamp(Math.floor(Date.now() / 1000)),
  };
}

/**
 * Hook to get space list
 */
export function useSpaceList() {
  const { rpc, connected } = useRpc();
  const [spaces, setSpaces] = useState<Array<{
    space_id: string;
    post_count: number;
    name: string | null;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!rpc || !connected) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await rpc.listSpaces();
      setSpaces(result.spaces);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load spaces'));
    } finally {
      setIsLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { spaces, isLoading, error, refresh };
}
