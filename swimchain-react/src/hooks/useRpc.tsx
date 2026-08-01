/**
 * React hooks for Swimchain RPC integration
 *
 * Provides RpcProvider context and connection management hooks.
 *
 * @packageDocumentation
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
import {
  SwimchainRpc,
  RpcConfig,
  LOCAL_TESTNET,
  TESTNET_SEED_SF,
  type SignatureAuth,
  type SyncStatus,
} from '../lib/rpc';
import {
  isInIframe,
  getParentConfig,
  subscribeParentConfig,
  type ParentRpcConfig,
} from '../lib/parentConfig';

// =========================================================================
// Context
// =========================================================================

export interface RpcContextValue {
  /** The RPC client instance */
  rpc: SwimchainRpc | null;
  /** Whether connected to the node */
  connected: boolean;
  /** Whether currently connecting */
  connecting: boolean;
  /** Connection error message */
  error: string | null;
  /** Node information after connection */
  nodeInfo: {
    version: string;
    network: string;
    peerCount: number;
  } | null;
  /** Connect to a node */
  connect: (config: RpcConfig) => Promise<boolean>;
  /** Disconnect from node */
  disconnect: () => void;
  /** Set signature authentication */
  setAuth: (auth: SignatureAuth | null) => void;
}

const RpcContext = createContext<RpcContextValue | null>(null);

// =========================================================================
// Provider
// =========================================================================

export interface RpcProviderProps {
  children: ReactNode;
  /** Initial RPC config (default: LOCAL_TESTNET) */
  config?: RpcConfig;
  /** Use remote seed instead of local node */
  useRemoteSeed?: boolean;
  /** Signature auth to use (can also be set later via setAuth) */
  signatureAuth?: SignatureAuth;
  /** Auto-connect on mount */
  autoConnect?: boolean;
  /** Retry interval in ms (default: 5000) */
  retryInterval?: number;
}

/**
 * RPC Provider component
 *
 * @example
 * ```tsx
 * <RpcProvider autoConnect>
 *   <App />
 * </RpcProvider>
 * ```
 */
export function RpcProvider({
  children,
  config,
  useRemoteSeed = false,
  signatureAuth,
  autoConnect = true,
  retryInterval = 5000,
}: RpcProviderProps) {
  const [rpc, setRpc] = useState<SwimchainRpc | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeInfo, setNodeInfo] = useState<RpcContextValue['nodeInfo']>(null);

  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authRef = useRef<SignatureAuth | null>(signatureAuth ?? null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
      }
    };
  }, []);

  const connect = useCallback(
    async (cfg: RpcConfig): Promise<boolean> => {
      setConnecting(true);
      setError(null);

      try {
        const client = new SwimchainRpc(cfg);

        // Apply signature auth if available
        if (authRef.current) {
          client.setSignatureAuth(authRef.current);
        }

        const success = await client.connect();

        if (success) {
          const info = client.getNodeInfo();
          setRpc(client);
          setConnected(true);
          setNodeInfo(
            info
              ? {
                  version: info.version,
                  network: info.network,
                  peerCount: info.peer_count,
                }
              : null
          );
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
    },
    []
  );

  const disconnect = useCallback(() => {
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
    setRpc(null);
    setConnected(false);
    setNodeInfo(null);
  }, []);

  const setAuth = useCallback(
    (auth: SignatureAuth | null) => {
      authRef.current = auth;
      if (rpc) {
        rpc.setSignatureAuth(auth);
      }
    },
    [rpc]
  );

  // Auto-connect effect
  useEffect(() => {
    if (!autoConnect) return;

    // Iframed (embedded in Surf/desktop): the parent shell owns the node identity
    // and hands the RPC endpoint + auth cookie over via SWIMCHAIN_RPC_CONFIG
    // (postMessage). Never fall back to the static LOCAL_TESTNET/baked `config`
    // prop in this mode — that would silently connect as a throwaway/local
    // identity instead of the user's real node. Wait for the parent config
    // instead, superseding any baked endpoint the game was built with.
    if (isInIframe()) {
      let cancelled = false;
      let lastConnectKey: string | null = null;

      const buildConfigFromParent = (parent: ParentRpcConfig): RpcConfig | null => {
        if (!parent.rpcEndpoint) return null;
        return { endpoint: parent.rpcEndpoint, authHeader: parent.rpcAuth, timeout: 30000 };
      };

      const connectIfChanged = (parent: ParentRpcConfig | null) => {
        if (cancelled || !parent) return;
        const cfg = buildConfigFromParent(parent);
        if (!cfg) return;

        // Skip if these are the same connect inputs we already connected (or are
        // connecting) with — repoints are refused by mergeTrustedConfig, but a
        // later trusted message may still fill previously-empty fields (e.g.
        // nodeAddress), which replays here without changing endpoint/authHeader.
        const key = `${cfg.endpoint}::${cfg.authHeader ?? ''}`;
        if (key === lastConnectKey) return;
        lastConnectKey = key;

        if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
        }

        const attemptConnect = async () => {
          const success = await connect(cfg);
          if (!success && !cancelled && retryInterval > 0) {
            retryIntervalRef.current = setInterval(async () => {
              const retrySuccess = await connect(cfg);
              if (retrySuccess && retryIntervalRef.current) {
                clearInterval(retryIntervalRef.current);
                retryIntervalRef.current = null;
              }
            }, retryInterval);
          }
        };
        attemptConnect();
      };

      // Load-bearing mount read (review finding #2): the module-level listener in
      // parentConfig.ts attaches at import time and can populate the singleton
      // BEFORE this effect runs — the shell posts the handover on the iframe's
      // `load` event, which can beat a post-commit React effect. Connect from it
      // immediately when already present instead of only reacting to a future
      // message.
      connectIfChanged(getParentConfig());

      // Subscribe for config that hasn't arrived yet, and for later trusted
      // updates (e.g. a nodeAddress fill) once it has.
      const unsubscribe = subscribeParentConfig(connectIfChanged);

      return () => {
        cancelled = true;
        unsubscribe();
        if (retryIntervalRef.current) {
          clearInterval(retryIntervalRef.current);
          retryIntervalRef.current = null;
        }
      };
    }

    // Standalone (not iframed): unchanged static-config auto-connect.
    const effectiveConfig = config ?? (useRemoteSeed ? TESTNET_SEED_SF : LOCAL_TESTNET);

    const doConnect = async () => {
      const success = await connect(effectiveConfig);
      if (!success && retryInterval > 0) {
        // Start retry loop
        retryIntervalRef.current = setInterval(async () => {
          const retrySuccess = await connect(effectiveConfig);
          if (retrySuccess && retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
          }
        }, retryInterval);
      }
    };

    doConnect();

    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    };
  }, [autoConnect, config, useRemoteSeed, connect, retryInterval]);

  // Update auth when signatureAuth prop changes
  useEffect(() => {
    if (signatureAuth !== undefined) {
      setAuth(signatureAuth ?? null);
    }
  }, [signatureAuth, setAuth]);

  return (
    <RpcContext.Provider
      value={{
        rpc,
        connected,
        connecting,
        error,
        nodeInfo,
        connect,
        disconnect,
        setAuth,
      }}
    >
      {children}
    </RpcContext.Provider>
  );
}

// =========================================================================
// Hooks
// =========================================================================

/**
 * Hook to access RPC context
 *
 * @throws Error if used outside RpcProvider
 */
export function useRpc(): RpcContextValue {
  const context = useContext(RpcContext);
  if (!context) {
    throw new Error('useRpc must be used within RpcProvider');
  }
  return context;
}

/**
 * Hook to fetch sync status
 */
export function useSyncStatus(pollIntervalMs: number = 10000): {
  status: SyncStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setStatus(null);
      setLoading(false);
      return;
    }

    try {
      const syncStatus = await rpc.getSyncStatus();
      setStatus(syncStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    refetch();

    if (pollIntervalMs > 0 && connected) {
      const interval = setInterval(refetch, pollIntervalMs);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [refetch, pollIntervalMs, connected]);

  return { status, loading, error, refetch };
}

/**
 * Hook to fetch peer list
 */
export function usePeers(): {
  peers: Array<{ peer_id: string; address: string; direction: string }>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const [peers, setPeers] = useState<
    Array<{ peer_id: string; address: string; direction: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!rpc || !connected) {
      setPeers([]);
      setLoading(false);
      return;
    }

    try {
      const result = await rpc.getPeers();
      setPeers(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch peers');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { peers, loading, error, refetch };
}
