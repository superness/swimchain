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

/** Convert Uint8Array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

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

// =========================================================================
// Spam Attestation Types & Hooks (SPEC_12 §3)
// =========================================================================

export type SpamReason = 'advertising' | 'repetitive' | 'off_topic' | 'harassment' | 'illegal_content';

export interface SpamStatus {
  isFlagged: boolean;
  attestationCount: number;
  counterCount: number;
  reasons: string[];
  spamThreshold: number;
  counterThreshold: number;
}

/**
 * Hook to fetch spam status for content
 */
export function useSpamStatus(contentId: string): {
  status: SpamStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<SpamStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!rpc || !connected || !contentId) {
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.getSpamStatus(contentId);
      setStatus({
        isFlagged: result.is_flagged,
        attestationCount: result.attestation_count,
        counterCount: result.counter_count,
        reasons: result.reasons ?? [],
        spamThreshold: result.spam_threshold,
        counterThreshold: result.counter_threshold,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch spam status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, contentId]);

  useEffect(() => {
    if (contentId) {
      fetchStatus();
    }
  }, [fetchStatus, contentId]);

  return { status, loading, error, refetch: fetchStatus };
}

/**
 * Hook to submit spam reports and counter-attestations
 * Mines PoW and handles the full submission flow
 */
export function useSpamReport(): {
  reportSpam: (
    contentId: string,
    reason: SpamReason,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
  ) => Promise<{ success: boolean; thresholdReached: boolean }>;
  defendContent: (
    contentId: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
  ) => Promise<{ success: boolean }>;
  submitting: boolean;
  progress: { attempts: number; elapsedMs: number };
  error: string | null;
} {
  const { rpc, connected } = useRpc();
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ attempts: 0, elapsedMs: 0 });
  const [error, setError] = useState<string | null>(null);

  const reportSpam = useCallback(async (
    contentId: string,
    reason: SpamReason,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
  ): Promise<{ success: boolean; thresholdReached: boolean }> => {
    if (!rpc || !connected) {
      return { success: false, thresholdReached: false };
    }

    setSubmitting(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonceSpace = new Uint8Array(8);
      crypto.getRandomValues(nonceSpace);
      const nonceSpaceHex = Array.from(nonceSpace).map(b => b.toString(16).padStart(2, '0')).join('');

      // Mine PoW for SpamAttestation (fixed difficulty)
      const difficulty = 12;
      let nonce = 0n;
      const startTime = Date.now();
      let bestHash = '';

      while (Date.now() - startTime < 30000) {
        const nonceBytes = new Uint8Array(8);
        new DataView(nonceBytes.buffer).setBigUint64(0, nonce, true);

        const preimage = new Uint8Array([
          ...new TextEncoder().encode(contentId + reason + timestamp.toString()),
          ...nonceBytes,
          ...nonceSpace,
        ]);
        const hash = await crypto.subtle.digest('SHA-256', preimage);

        const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        const leadingZeros = hashHex.match(/^0*/)?.[0].length ?? 0;

        if (leadingZeros >= difficulty) {
          bestHash = hashHex;
          break;
        }

        if (leadingZeros > (bestHash.match(/^0*/)?.[0].length ?? 0)) {
          bestHash = hashHex;
        }

        nonce++;
        if (nonce % 1000n === 0n) {
          setProgress({ attempts: Number(nonce), elapsedMs: Date.now() - startTime });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const finalNonce = Number(nonce);
      setProgress({ attempts: finalNonce, elapsedMs: Date.now() - startTime });

      // Sign the request
      const message = `spam_attestation:${contentId}:${reason}:${timestamp}`;
      const signature = signFn(new TextEncoder().encode(message));
      const signatureHex = bytesToHex(signature);

      const result = await rpc.submitSpamAttestation({
        contentId,
        attesterId: identityPublicKey,
        reason,
        powNonce: finalNonce,
        powDifficulty: difficulty,
        powNonceSpace: nonceSpaceHex,
        powHash: bestHash || Array.from(new Uint8Array(32)).map(() => '0').join(''),
        signature: signatureHex,
        timestamp,
      });

      return { success: true, thresholdReached: result.threshold_reached };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit spam report';
      setError(msg);
      return { success: false, thresholdReached: false };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  const defendContent = useCallback(async (
    contentId: string,
    identityPublicKey: string,
    signFn: (message: Uint8Array) => Uint8Array,
  ): Promise<{ success: boolean }> => {
    if (!rpc || !connected) {
      return { success: false };
    }

    setSubmitting(true);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0 });

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonceSpace = new Uint8Array(8);
      crypto.getRandomValues(nonceSpace);
      const nonceSpaceHex = Array.from(nonceSpace).map(b => b.toString(16).padStart(2, '0')).join('');

      // Mine PoW (lower difficulty for counter-attestation)
      const difficulty = 10;
      let nonce = 0n;
      const startTime = Date.now();
      let bestHash = '';

      while (Date.now() - startTime < 30000) {
        const nonceBytes = new Uint8Array(8);
        new DataView(nonceBytes.buffer).setBigUint64(0, nonce, true);

        const preimage = new Uint8Array([
          ...new TextEncoder().encode(`counter:${contentId}:${timestamp}`),
          ...nonceBytes,
          ...nonceSpace,
        ]);
        const hash = await crypto.subtle.digest('SHA-256', preimage);
        const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
        const leadingZeros = hashHex.match(/^0*/)?.[0].length ?? 0;

        if (leadingZeros >= difficulty) {
          bestHash = hashHex;
          break;
        }

        if (leadingZeros > (bestHash.match(/^0*/)?.[0].length ?? 0)) {
          bestHash = hashHex;
        }

        nonce++;
        if (nonce % 1000n === 0n) {
          setProgress({ attempts: Number(nonce), elapsedMs: Date.now() - startTime });
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const finalNonce = Number(nonce);
      setProgress({ attempts: finalNonce, elapsedMs: Date.now() - startTime });

      const message = `counter_attestation:${contentId}:${timestamp}`;
      const signature = signFn(new TextEncoder().encode(message));
      const signatureHex = bytesToHex(signature);

      await rpc.submitCounterAttestation({
        contentId,
        attesterId: identityPublicKey,
        powNonce: finalNonce,
        powDifficulty: difficulty,
        powNonceSpace: nonceSpaceHex,
        powHash: bestHash || Array.from(new Uint8Array(32)).map(() => '0').join(''),
        signature: signatureHex,
        timestamp,
      });

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to defend content';
      setError(msg);
      return { success: false };
    } finally {
      setSubmitting(false);
    }
  }, [rpc, connected]);

  return { reportSpam, defendContent, submitting, progress, error };
}

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
