/**
 * React hooks for Swimchain RPC integration (Search Client)
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import {
  SwimchainRpc,
  RpcConfig,
  initRpc,
  LOCAL_CONFIG,
  TESTNET_SEED_SF,
  getLocalConfigWithAuth,
  isInTauri,
} from '../lib/rpc';
import { getParentConfig, isInIframe } from './useParentRpcConfig';
import type { StoredIdentity, SyncStatus } from '../types';

// Allow overriding endpoint via env for testing without local node
const USE_REMOTE_SEED = import.meta.env.VITE_USE_REMOTE_SEED === 'true';
const REMOTE_SEED_CONFIG = TESTNET_SEED_SF;

// Storage key for identity (must match useStoredIdentity)
const IDENTITY_STORAGE_KEY = 'swimchain-identity';

/**
 * Load stored identity from localStorage
 */
function loadStoredIdentity(): StoredIdentity | null {
  try {
    const stored = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredIdentity;
    }
  } catch (error) {
    console.error('Failed to load identity for RPC auth:', error);
  }
  return null;
}

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
  connect: (config: RpcConfig) => Promise<boolean>;
  disconnect: () => void;
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

  // Track identity seed to detect changes and reconnect
  const lastIdentitySeedRef = useRef<string | null>(null);

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

  const disconnect = useCallback(() => {
    setRpc(null);
    setConnected(false);
    setNodeInfo(null);
  }, []);

  /**
   * Build RPC config with identity for signature auth
   */
  const buildConfigWithIdentity = async (): Promise<RpcConfig> => {
    let baseConfig: RpcConfig;

    // Check for parent frame config first (desktop-app wrapper)
    const parentConfig = getParentConfig();
    if (parentConfig && isInIframe()) {
      baseConfig = {
        endpoint: parentConfig.rpcEndpoint,
        authHeader: parentConfig.rpcAuth,
      };
    } else if (USE_REMOTE_SEED) {
      baseConfig = REMOTE_SEED_CONFIG;
    } else if (isInTauri()) {
      baseConfig = await getLocalConfigWithAuth('testnet');
    } else {
      baseConfig = LOCAL_CONFIG;
    }

    // Load identity for signature auth
    const identity = loadStoredIdentity();
    if (identity?.seed && identity?.publicKey) {
      return {
        ...baseConfig,
        seed: identity.seed,
        publicKey: identity.publicKey,
      };
    }

    return baseConfig;
  };

  useEffect(() => {
    let retryInterval: ReturnType<typeof setInterval> | null = null;
    let identityCheckInterval: ReturnType<typeof setInterval> | null = null;

    const doConnect = async (): Promise<boolean> => {
      const config = await buildConfigWithIdentity();
      lastIdentitySeedRef.current = config.seed ?? null;
      return connect(config);
    };

    const autoConnect = async () => {
      if (await doConnect()) {
        return;
      }

      // Retry every 5 seconds
      retryInterval = setInterval(async () => {
        if (await doConnect()) {
          if (retryInterval) clearInterval(retryInterval);
        }
      }, 5000);
    };

    // Check for identity changes every second
    identityCheckInterval = setInterval(() => {
      const currentIdentity = loadStoredIdentity();
      const currentSeed = currentIdentity?.seed ?? null;

      if (currentSeed !== lastIdentitySeedRef.current) {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        doConnect().then(success => {
          if (!success) {
            retryInterval = setInterval(async () => {
              if (await doConnect()) {
                if (retryInterval) clearInterval(retryInterval);
              }
            }, 5000);
          }
        });
      }
    }, 1000);

    // Handle iframe case
    if (isInIframe() && !getParentConfig()) {
      const handleParentConfig = () => {
        if (retryInterval) {
          clearInterval(retryInterval);
          retryInterval = null;
        }
        doConnect().then(success => {
          if (!success) {
            retryInterval = setInterval(async () => {
              if (await doConnect()) {
                if (retryInterval) clearInterval(retryInterval);
              }
            }, 5000);
          }
        });
      };

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
          handleParentConfig();
          window.removeEventListener('message', messageHandler);
        }
      };
      window.addEventListener('message', messageHandler);

      return () => {
        if (retryInterval) clearInterval(retryInterval);
        if (identityCheckInterval) clearInterval(identityCheckInterval);
        window.removeEventListener('message', messageHandler);
      };
    }

    autoConnect();

    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (identityCheckInterval) clearInterval(identityCheckInterval);
    };
  }, [connect]);

  return (
    <RpcContext.Provider value={{ rpc, connected, connecting, error, nodeInfo, connect, disconnect }}>
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
// Data fetching hooks
// =========================================================================

/**
 * Hook to fetch sync status
 */
export function useNetworkStatus(): { status: SyncStatus | null; loading: boolean; error: string | null } {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rpc || !connected) {
      setStatus(null);
      setLoading(false);
      return;
    }

    const fetchStatus = async () => {
      try {
        const [syncStatus, peers] = await Promise.all([
          rpc.getSyncStatus(),
          rpc.getPeers(),
        ]);

        setStatus({
          chainPercent: syncStatus.chain_percent,
          peerCount: syncStatus.peer_count,
          peersReceiving: peers.filter(p => p.direction === 'Inbound').length,
          peersSending: peers.filter(p => p.direction === 'Outbound').length,
          storageMB: syncStatus.storage_mb,
          storageTargetMB: syncStatus.storage_target_mb,
          lastBlockTime: syncStatus.last_block_time ?? Math.floor(Date.now() / 1000),
          state: syncStatus.state === 'synced' ? 'synced' :
                 syncStatus.state === 'syncing' ? 'syncing' :
                 syncStatus.state === 'behind' ? 'behind' : 'offline',
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();

    // Refresh every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [rpc, connected]);

  return { status, loading, error };
}
